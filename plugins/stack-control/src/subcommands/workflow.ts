// `stackctl workflow <subaction> [flags]` (022) — the parseable lifecycle
// workflow surface (contracts/workflow-cli.md). This file holds the read-only
// query verbs `status` / `can-enter` / `next` / `compass` + the dispatcher; the
// mutating advance / link-design / link-spec / redesign verbs live in
// workflow-advance.ts and the shared resolution in workflow-shared.ts (032 R7 /
// T001 split). Query verbs write nothing and are deterministic (FR-014).
//
// Exit codes: 0 success (including a REPORTED unmet gate — v1 gates never refuse,
// FR-010); 2 usage/parse/validation (unknown subaction, missing arg, ungovernable
// doc, unknown item); a compass verdict's own non-zero exit (3 ahead / 4 off-rail).

import { InstallationError } from '../config/errors.js';
import { DocumentModelError } from '../document-model/types.js';
import { describeCriterion, evaluateGate, type GateContext } from '../workflow/gate-eval.js';
import { derivePhase } from '../workflow/phase-derivation.js';
import { buildItemContext } from '../workflow/workflow-context.js';
import { computeVerdict, legitimateNextPhase } from '../workflow/compass.js';
import { resolveCompass } from '../workflow/compass-resolve.js';
import { knownIntents, resolveIntent } from '../workflow/intent-vocabulary.js';
import { WorkflowError, type DerivedPhase, type WorkflowDoc } from '../workflow/workflow-types.js';
import { failUsage, forwardTransition, phaseById, resolve } from './workflow-shared.js';
import { emitAdvance, emitLink, emitRedesign } from './workflow-advance.js';

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
  // 031 FR-013: name the legitimate pending next phase (generic — driven by the
  // phase's `next` chain). A post-merge item is NOT terminal: its pending move is
  // surfaced here so an operator isn't left thinking merge is the end (the "don't
  // forget to close" surface). A truly terminal phase (no `next`) says so.
  const nextId = legitimateNextPhase(doc, phase.id);
  process.stdout.write(
    nextId !== null
      ? `  legitimate next move: ${nextId}\n`
      : `  no legitimate next move (terminal phase '${phase.id}')\n`,
  );
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

/** Orientation mode (no --intent, FR-001): the phase + the single legitimate next action + gate state. Exit 0. */
function emitCompassOrientation(
  doc: WorkflowDoc,
  itemId: string,
  currentPhase: DerivedPhase,
  hasNode: boolean,
  gate: GateContext | null,
): void {
  process.stdout.write(`workflow compass ${itemId}\n`);
  if (!hasNode) {
    process.stdout.write(
      `  off-rail: no roadmap node for '${itemId}' — capture it first (the front door creates the node)\n`,
    );
    return;
  }
  if (currentPhase.kind === 'side-state') {
    process.stdout.write(`  current phase: ${currentPhase.id} (terminal side-state)\n`);
    process.stdout.write(`  no legitimate forward move; induct back to resume\n`);
    return;
  }
  const p = phaseById(doc, currentPhase.id);
  if (p === undefined) throw new WorkflowError(`derived phase '${currentPhase.id}' is not declared in WORKFLOW.md`);
  process.stdout.write(`  current phase: ${currentPhase.id}\n`);
  process.stdout.write(`  work: ${p.work}\n`);
  const nextId = legitimateNextPhase(doc, currentPhase.id);
  const t = forwardTransition(doc, p);
  if (nextId === null || t === undefined) {
    process.stdout.write(`  legitimate next action: (none — terminal phase '${currentPhase.id}')\n`);
  } else {
    process.stdout.write(`  legitimate next action: ${t.codename} (${t.from} → ${t.to})\n`);
  }
  // T040/claude-05: single-source the orientation gate report onto the FORWARD TRANSITION's
  // exit gate — the same gate the verdict (nextGateUnmet) and the advance enforcement use — so
  // orientation, verdict, and enforcement cannot disagree about what blocks the next move. Falls
  // back to the phase's own exit criteria at a terminal phase (no forward transition).
  if (gate !== null) {
    reportGate('exit gate', evaluateGate(t !== undefined ? t.exitGate : p.exit, gate));
  }
}

/** `workflow compass <item> [--intent <action>] [--json]` (024 US1) — orient + diff; the verdict is the exit code. */
function emitCompass(itemId: string, intentName: string | undefined, json: boolean): void {
  const { doc, hasNode, currentPhase, gate, nextGateUnmet, danglingMergedItem } = resolveCompass(process.cwd(), itemId);

  if (intentName === undefined) {
    emitCompassOrientation(doc, itemId, currentPhase, hasNode, gate);
    return;
  }

  const resolved = resolveIntent(doc, intentName);
  if (resolved === null) {
    failUsage(`unknown intent '${intentName}' (known: ${knownIntents(doc).join(', ')})`);
  }
  const verdict = computeVerdict({
    doc, currentPhase, intent: resolved, hasNode, nextGateUnmet,
    danglingMergedItem, intentItem: itemId,
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  } else {
    process.stdout.write(`workflow compass ${itemId}\n`);
    process.stdout.write(`  current phase: ${currentPhase.id}${currentPhase.kind === 'side-state' ? ' (terminal side-state)' : ''}\n`);
    process.stdout.write(
      `  intent: ${intentName}${resolved.phase !== null ? ` (phase ${resolved.phase})` : ' (finishing)'}\n`,
    );
    process.stdout.write(`  verdict: ${verdict.outcome}\n`);
    if (verdict.skippedStep !== null) process.stdout.write(`  skipped step: ${verdict.skippedStep}\n`);
    process.stdout.write(`  → ${verdict.reason}\n`);
  }
  if (verdict.exitCode !== 0) process.exit(verdict.exitCode);
}

export async function runWorkflowCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('a subaction is required (usage: workflow <status|can-enter|next|compass|advance|link-design|link-spec> ...)');
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
      case 'compass': {
        const item = positionals[0];
        if (item === undefined) failUsage('compass requires an <item> positional');
        const intentIdx = rest.indexOf('--intent');
        const intentName = intentIdx >= 0 ? rest[intentIdx + 1] : undefined;
        if (intentIdx >= 0 && (intentName === undefined || intentName.startsWith('--'))) {
          failUsage('--intent requires a value (an action name)');
        }
        emitCompass(item, intentName, rest.includes('--json'));
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
      case 'redesign': {
        const item = positionals[0];
        const doc = positionals[1];
        if (item === undefined || doc === undefined) failUsage('redesign requires <item> <design-doc> positionals');
        emitRedesign(item, doc, apply);
        return;
      }
      default:
        failUsage(
          `unknown subaction '${subaction}' (known: status, can-enter, next, compass, advance, link-design, link-spec, redesign)`,
        );
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
