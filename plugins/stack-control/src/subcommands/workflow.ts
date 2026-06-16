// `stackctl workflow <subaction> [flags]` (022) — the parseable lifecycle
// workflow surface (contracts/workflow-cli.md). Phase 4 (US1) ships the read-only
// query verbs `status` / `can-enter` / `next`; Phase 6 (US4) adds `advance` /
// `link-design` / `link-spec`. The verb stays thin: it resolves the installation,
// loads the governed WORKFLOW.md + the roadmap item, builds the derivation/gate
// context, and formats. Query verbs write nothing and are deterministic (FR-014).
//
// Exit codes: 0 success (including a REPORTED unmet gate — v1 gates never refuse,
// FR-010); 2 usage/parse/validation (unknown subaction, missing arg, ungovernable
// doc, unknown item).

import { InstallationError } from '../config/errors.js';
import { resolveInstallation } from '../config/installation.js';
import { DocumentModelError } from '../document-model/types.js';
import { loadRoadmap, type WorkItem } from '../roadmap/roadmap-model.js';
import { grammarOptsForRoot } from './document-verb-shared.js';
import { describeCriterion, evaluateGate, type GateContext } from '../workflow/gate-eval.js';
import { derivePhase } from '../workflow/phase-derivation.js';
import { loadWorkflowDoc } from '../workflow/workflow-grammar.js';
import { buildItemContext } from '../workflow/workflow-context.js';
import { WorkflowError, type Phase, type Transition, type WorkflowDoc } from '../workflow/workflow-types.js';

function failUsage(message: string): never {
  process.stderr.write(`workflow: ${message}\n`);
  process.exit(2);
}

interface Resolved {
  readonly root: string;
  readonly doc: WorkflowDoc;
  readonly item: WorkItem;
}

/** Resolve the installation, governed doc, and the named roadmap item. */
function resolve(itemId: string): Resolved {
  const inst = resolveInstallation(process.cwd());
  const doc = loadWorkflowDoc(inst.root);
  const model = loadRoadmap(inst.resolved.roadmap, grammarOptsForRoot(inst.root));
  const item = model.byId.get(itemId);
  if (item === undefined) {
    failUsage(`no roadmap item '${itemId}' (known: ${[...model.byId.keys()].join(', ') || '(none)'})`);
  }
  return { root: inst.root, doc, item };
}

function phaseById(doc: WorkflowDoc, id: string): Phase | undefined {
  return doc.phases.find((p) => p.id === id);
}

/** The forward transition out of `phase` (from → next), when one exists. */
function forwardTransition(doc: WorkflowDoc, phase: Phase): Transition | undefined {
  if (phase.next === null) return undefined;
  return doc.transitions.find((t) => t.from === phase.id && t.to === phase.next);
}

function reportGate(label: string, criteria: ReturnType<typeof evaluateGate>): void {
  const total = criteria.met.length + criteria.unmet.length;
  const suffix = criteria.allMet ? ' (all met)' : '';
  process.stdout.write(`  ${label}: ${criteria.met.length} of ${total} met${suffix}\n`);
  for (const c of criteria.unmet) process.stdout.write(`    [ ] ${describeCriterion(c)}\n`);
}

function emitStatus(itemId: string): void {
  const { doc, root, item } = resolve(itemId);
  const { inputs, gate } = buildItemContext(root, item);
  const phase = derivePhase(doc, inputs);
  process.stdout.write(`workflow status ${itemId}\n`);
  if (phase.kind === 'side-state') {
    process.stdout.write(`  phase: ${phase.id} (terminal side-state)\n`);
    process.stdout.write(`  no linear exit criteria; induct back to resume\n`);
    return;
  }
  process.stdout.write(`  phase: ${phase.id}\n`);
  const p = phaseById(doc, phase.id);
  if (p === undefined) throw new WorkflowError(`derived phase '${phase.id}' is not declared in WORKFLOW.md`);
  reportGate('exit criteria', evaluateGate(p.exit, gate));
  // v1: gates are REPORTED, never enforced as a refusal (FR-010 / analyze U1).
}

function emitCanEnter(itemId: string, stage: string): void {
  const { doc, root, item } = resolve(itemId);
  const p = phaseById(doc, stage);
  if (p === undefined) {
    failUsage(`unknown stage '${stage}' (known: ${doc.phases.map((x) => x.id).join(', ')})`);
  }
  const { gate } = buildItemContext(root, item);
  const result = evaluateGate(p.entrance, gate as GateContext);
  process.stdout.write(`workflow can-enter ${itemId} ${stage}\n`);
  reportGate('entrance criteria', result);
  process.stdout.write(
    result.allMet
      ? `  → can enter '${stage}'\n`
      : `  → cannot enter '${stage}' yet (${result.unmet.length} missing)\n`,
  );
}

function emitNext(itemId: string): void {
  const { doc, root, item } = resolve(itemId);
  const { inputs } = buildItemContext(root, item);
  const phase = derivePhase(doc, inputs);
  process.stdout.write(`workflow next ${itemId}\n`);
  if (phase.kind === 'side-state') {
    process.stdout.write(`  current phase: ${phase.id} (terminal side-state)\n`);
    process.stdout.write(`  no linear next transition; induct back to resume\n`);
    return;
  }
  const p = phaseById(doc, phase.id);
  if (p === undefined) throw new WorkflowError(`derived phase '${phase.id}' is not declared in WORKFLOW.md`);
  process.stdout.write(`  current phase: ${p.id}\n`);
  process.stdout.write(`  work: ${p.work}\n`);
  const t = forwardTransition(doc, p);
  if (t === undefined) {
    process.stdout.write(`  no further transition (terminal phase '${p.id}')\n`);
    return;
  }
  process.stdout.write(`  next transition: ${t.codename} (${t.from} → ${t.to})\n`);
  process.stdout.write(`  effects an advance would fire:\n`);
  t.effects.forEach((e, i) => process.stdout.write(`    ${i + 1}. ${e.verb}\n`));
}

export async function runWorkflowCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('a subaction is required (usage: workflow <status|can-enter|next> <item> [stage])');
  }
  try {
    switch (subaction) {
      case 'status': {
        const item = args[1];
        if (item === undefined) failUsage('status requires an <item> positional');
        emitStatus(item);
        return;
      }
      case 'can-enter': {
        const item = args[1];
        const stage = args[2];
        if (item === undefined || stage === undefined) failUsage('can-enter requires <item> <stage> positionals');
        emitCanEnter(item, stage);
        return;
      }
      case 'next': {
        const item = args[1];
        if (item === undefined) failUsage('next requires an <item> positional');
        emitNext(item);
        return;
      }
      default:
        failUsage(`unknown subaction '${subaction}' (known: status, can-enter, next)`);
    }
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`workflow: ${err.message}\n`);
      process.exit(err.code === 'escape' || err.code === 'collision' ? 2 : 1);
    }
    if (err instanceof DocumentModelError || err instanceof WorkflowError) {
      process.stderr.write(`workflow: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}
