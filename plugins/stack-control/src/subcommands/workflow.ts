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
import { setField } from '../roadmap/mutations.js';
import { grammarOptsForRoot } from './document-verb-shared.js';
import { describeCriterion, evaluateGate, type GateContext } from '../workflow/gate-eval.js';
import { derivePhase } from '../workflow/phase-derivation.js';
import { loadWorkflowDoc } from '../workflow/workflow-grammar.js';
import { buildItemContext } from '../workflow/workflow-context.js';
import type { EffectContext } from '../workflow/effects.js';
import { applyTransition, previewTransition } from '../workflow/transition-engine.js';
import { WorkflowError, type Phase, type Transition, type WorkflowDoc } from '../workflow/workflow-types.js';
import type { LoadOptions } from '../document-model/document.js';

function failUsage(message: string): never {
  process.stderr.write(`workflow: ${message}\n`);
  process.exit(2);
}

interface Resolved {
  readonly root: string;
  readonly doc: WorkflowDoc;
  readonly item: WorkItem;
  readonly roadmapPath: string;
  readonly journalPath: string;
  readonly opts: LoadOptions;
}

/** Resolve the installation, governed doc, and the named roadmap item. */
function resolve(itemId: string): Resolved {
  const inst = resolveInstallation(process.cwd());
  const doc = loadWorkflowDoc(inst.root);
  const opts = grammarOptsForRoot(inst.root);
  const model = loadRoadmap(inst.resolved.roadmap, opts);
  const item = model.byId.get(itemId);
  if (item === undefined) {
    failUsage(`no roadmap item '${itemId}' (known: ${[...model.byId.keys()].join(', ') || '(none)'})`);
  }
  return {
    root: inst.root,
    doc,
    item,
    roadmapPath: inst.resolved.roadmap,
    journalPath: inst.resolved.journal,
    opts,
  };
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

/** Build the effect context for a forward transition out of the current phase. */
function effectContextFor(r: Resolved, transition: Transition, extra: Record<string, string>): EffectContext {
  const message = `workflow(${transition.codename}): ${r.item.identifier} ${transition.from} -> ${transition.to}`;
  return {
    installationRoot: r.root,
    roadmapPath: r.roadmapPath,
    journalPath: r.journalPath,
    grammarOpts: r.opts,
    item: r.item.identifier,
    bindings: { message, ...extra },
  };
}

function emitAdvance(itemId: string, apply: boolean, values: Record<string, string>): void {
  const r = resolve(itemId);
  const { inputs } = buildItemContext(r.root, r.item);
  const phase = derivePhase(r.doc, inputs);
  if (phase.kind === 'side-state') {
    failUsage(`'${itemId}' is in terminal side-state '${phase.id}'; induct it back before advancing`);
  }
  const p = phaseById(r.doc, phase.id);
  if (p === undefined) throw new WorkflowError(`derived phase '${phase.id}' is not declared in WORKFLOW.md`);
  const t = forwardTransition(r.doc, p);
  if (t === undefined) {
    failUsage(`'${itemId}' is in terminal phase '${p.id}'; no forward transition to advance`);
  }
  const ctx = effectContextFor(r, t, values);
  if (!apply) {
    const preview = previewTransition(t, ctx);
    process.stdout.write(`workflow advance ${itemId} (dry-run — writes nothing; use --apply)\n`);
    process.stdout.write(`  transition: ${t.codename} (${t.from} -> ${t.to})\n`);
    process.stdout.write(`  effects (in order):\n`);
    preview.effects.forEach((e, i) => process.stdout.write(`    ${i + 1}. ${e.verb}\n`));
    return;
  }
  const outcome = applyTransition(t, ctx);
  process.stdout.write(`workflow advance ${itemId}: applied ${t.codename} (${t.from} -> ${t.to})\n`);
  process.stdout.write(
    outcome.committed
      ? `  committed: "${outcome.message}"\n`
      : `  applied (no commit effect in this transition)\n`,
  );
}

function emitLink(itemId: string, field: 'design' | 'spec', value: string, apply: boolean): void {
  const r = resolve(itemId);
  const result = setField(r.roadmapPath, r.item.identifier, field, value, r.opts, apply);
  const verb = field === 'design' ? 'link-design' : 'link-spec';
  process.stdout.write(
    result.applied
      ? `workflow ${verb}: set ${field}=${value} on ${itemId}\n`
      : `workflow ${verb}: dry-run — would set ${field}=${value} on ${itemId} (use --apply)\n`,
  );
}

export async function runWorkflowCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('a subaction is required (usage: workflow <status|can-enter|next|advance|link-design|link-spec> ...)');
  }
  const rest = args.slice(1);
  const apply = rest.includes('--apply');
  const positionals = rest.filter((a) => !a.startsWith('--'));
  try {
    switch (subaction) {
      case 'status': {
        const item = positionals[0];
        if (item === undefined) failUsage('status requires an <item> positional');
        emitStatus(item);
        return;
      }
      case 'can-enter': {
        const item = positionals[0];
        const stage = positionals[1];
        if (item === undefined || stage === undefined) failUsage('can-enter requires <item> <stage> positionals');
        emitCanEnter(item, stage);
        return;
      }
      case 'next': {
        const item = positionals[0];
        if (item === undefined) failUsage('next requires an <item> positional');
        emitNext(item);
        return;
      }
      case 'advance': {
        const item = positionals[0];
        if (item === undefined) failUsage('advance requires an <item> positional');
        emitAdvance(item, apply, {});
        return;
      }
      case 'link-design': {
        const item = positionals[0];
        const doc = positionals[1];
        if (item === undefined || doc === undefined) failUsage('link-design requires <item> <design-doc> positionals');
        emitLink(item, 'design', doc, apply);
        return;
      }
      case 'link-spec': {
        const item = positionals[0];
        const dir = positionals[1];
        if (item === undefined || dir === undefined) failUsage('link-spec requires <item> <spec-dir> positionals');
        emitLink(item, 'spec', dir, apply);
        return;
      }
      default:
        failUsage(`unknown subaction '${subaction}' (known: status, can-enter, next, advance, link-design, link-spec)`);
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
