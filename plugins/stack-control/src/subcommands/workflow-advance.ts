// The mutating `stackctl workflow` verbs — advance / link-design / link-spec /
// redesign — extracted from workflow.ts (032 R7 / T001) so the file stays under the
// size cap as the ship/backstop wiring lands. The read-only query verbs stay in
// workflow.ts; both import the shared resolution from workflow-shared.ts.

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRoadmap } from '../roadmap/roadmap-model.js';
import { setField } from '../roadmap/mutations.js';
import { describeCriterion, evaluateGate } from '../workflow/gate-eval.js';
import { derivePhase } from '../workflow/phase-derivation.js';
import { firstDanglingMergedItem } from '../workflow/merge-signal.js';
import { buildItemContext } from '../workflow/workflow-context.js';
import type { EffectContext } from '../workflow/effects.js';
import { applyTransition, previewTransition } from '../workflow/transition-engine.js';
import { reenterDesign } from '../workflow/redesign.js';
import { WorkflowError, type Transition } from '../workflow/workflow-types.js';
import { emitPhaseEntered } from '../telemetry/phase-entered.js';
import { failUsage, forwardTransition, phaseById, resolve, type Resolved } from './workflow-shared.js';

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

export function emitAdvance(itemId: string, apply: boolean, values: Record<string, string>): void {
  const r = resolve(itemId);
  // 032 US3 backstop (FR-009 / AUDIT-20260623-06): `workflow advance` is a mutating
  // lifecycle WAYPOINT, so it shares the off-rail backstop the compass + close step enforce —
  // not only raw git/gh is gated. While a merged-but-status-in-flight item dangles, forward
  // motion for ANY OTHER item is refused (naming it + the reconcile command). EXEMPTION: the
  // dangling item's OWN advance is the reconcile (records its status) and is never blocked.
  const dangling = firstDanglingMergedItem(loadRoadmap(r.roadmapPath, r.opts), r.root);
  if (dangling !== null && dangling.itemId !== itemId) {
    process.stderr.write(
      `workflow advance ${itemId}: REFUSED — a merged-but-status-in-flight item exists ` +
        `('${dangling.itemId}'); forward lifecycle motion is blocked until it is reconciled — run ` +
        `\`stackctl workflow advance ${dangling.itemId} --apply\` to record its status, then retry\n`,
    );
    process.exit(4);
  }
  const { inputs, gate } = buildItemContext(r.root, r.item);
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
  // 031 AUDIT-20260623-01: entering the terminal `closed` phase is NOT a generic
  // workflow advance. Closing is the operator-confirmed TRANSITIVE CASCADE — it
  // closes the item's whole part-of subtree's recorded backlog ids AND advances
  // the status, as one action. The generic effect path here would run only the
  // status-rewrite (`roadmap-advance to=closed`), silently leaving the contained
  // ids open. Refuse and redirect to the single cascade-running close surface so
  // there is no second, status-only path to `closed`.
  if (t.to === 'closed') {
    failUsage(
      `'${itemId}': closing is the operator-confirmed transitive cascade — run ` +
        `\`stackctl roadmap advance ${itemId} --to closed\` (or the /stack-control:close skill), ` +
        `which closes the item's contained backlog ids AND advances it to 'closed'. ` +
        `\`workflow advance\` will not perform a status-only close.`,
    );
  }
  // 024 US5 / FR-010 (phased): the back-half `governing → shipped` graduation is
  // ENFORCED as a refusal — an unmet exit gate blocks the advance rather than only
  // being reported (022 v1 report-only is retired HERE). Mid-pipeline transitions
  // stay ADVISORY in this advance path during migration; mid-pipeline ORDER is
  // still enforced by the compass embedded in the skills.
  //
  // 031 FR-014 (clean break): keyed on the `graduate-impl` exit-gate criterion (the
  // graduation marker), NOT on the positional last phase — adding the terminal
  // `closed` phase after `shipped` means `shipped` is no longer the array-last
  // phase, so a positional `to === lastPhase` test would silently stop enforcing
  // the graduation gate.
  // 032 AUDIT-20260623-03: for a `governing` item the forward transition is
  // `start-merging` (gate `graduate-impl impl`). This is a REFUSAL surface, not an
  // applied path: once the convergence record exists the item DERIVES `merging`
  // directly (so it would never be at `governing` here), so the only time this fires is
  // a premature `workflow advance` on a not-yet-govern-converged item — where the
  // graduation-gate check below produces the actionable "complete govern first" refusal.
  const isGraduation = t.exitGate.some((c) => c.kind === 'graduate-impl');
  if (isGraduation && t.exitGate.length > 0) {
    const result = evaluateGate(t.exitGate, gate);
    if (!result.allMet) {
      process.stderr.write(
        `workflow advance ${itemId}: REFUSED — '${t.codename}' (${t.from} -> ${t.to}) exit gate unmet:\n`,
      );
      for (const c of result.unmet) process.stderr.write(`    [ ] ${describeCriterion(c)}\n`);
      process.exit(1);
    }
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
  // 037 US3 / D4: the ONE instrumentation seam for the design→spec→execute→govern
  // timeline. A COMMITTED transition emits a single fail-open `phase.entered` side
  // event; a dry-run (returned above) emits nothing. Never a governed effect — this
  // is a side emission, so it is NOT in EFFECT_VERBS and never touches the
  // transition-engine's Effect/Transition/git contract. Fail-open: any telemetry
  // failure is swallowed inside `emitPhaseEntered` and never perturbs the advance.
  if (outcome.committed) {
    emitPhaseEntered(r.root, { phase: t.to, from: t.from, item: r.item.identifier });
  }
  process.stdout.write(`workflow advance ${itemId}: applied ${t.codename} (${t.from} -> ${t.to})\n`);
  process.stdout.write(
    outcome.committed
      ? `  committed: "${outcome.message}"\n`
      : `  applied (no commit effect in this transition)\n`,
  );
}

export function emitLink(itemId: string, field: 'design' | 'spec', value: string, apply: boolean): void {
  const r = resolve(itemId);
  const result = setField(r.roadmapPath, r.item.identifier, field, value, r.opts, apply);
  const verb = field === 'design' ? 'link-design' : 'link-spec';
  process.stdout.write(
    result.applied
      ? `workflow ${verb}: set ${field}=${value} on ${itemId}\n`
      : `workflow ${verb}: dry-run — would set ${field}=${value} on ${itemId} (use --apply)\n`,
  );
}

export function emitRedesign(itemId: string, designDoc: string, apply: boolean): void {
  const r = resolve(itemId);
  if (!apply) {
    process.stdout.write(`workflow redesign ${itemId} (dry-run — writes nothing; use --apply)\n`);
    process.stdout.write(`  * -> designing re-entry: open a new design-record revision (append-only)\n`);
    process.stdout.write(`  preserve the spec dir\n`);
    return;
  }
  const result = reenterDesign({
    installationRoot: r.root,
    roadmapPath: r.roadmapPath,
    item: itemId,
    designDoc,
    hasSpec: r.item.spec !== null,
    opts: r.opts,
    at: new Date().toISOString(),
  });
  appendFileSync(r.journalPath, `workflow(redesign): ${itemId} re-entered designing (revision ${result.revision})\n`, 'utf8');
  // F2 (governance HIGH, cross-model): stage ONLY the redesign-touched paths (never
  // `git add -A`, which sweeps unrelated working-tree changes) and fail loud on a
  // commit error (a non-zero git exit must NOT be reported as success).
  const touched = [r.roadmapPath, join(r.root, designDoc), r.journalPath];
  const add = spawnSync('git', ['-C', r.root, 'add', '--', ...touched], { encoding: 'utf8' });
  if (add.status !== 0) failUsage(`redesign: git add failed — ${add.stderr ?? ''}`);
  const commit = spawnSync(
    'git',
    ['-C', r.root, 'commit', '-m', `workflow(redesign): ${itemId} re-entered designing`, '--', ...touched],
    { encoding: 'utf8' },
  );
  if (commit.status !== 0) failUsage(`redesign: git commit failed — ${commit.stderr ?? ''}`);
  process.stdout.write(`workflow redesign ${itemId}: re-entered designing\n`);
  process.stdout.write(`  design record revision: ${result.revision}\n`);
  process.stdout.write(`  spec dir preserved: ${result.specPreserved}\n`);
}
