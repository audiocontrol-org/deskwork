// 031 US3 — the `roadmap advance <id> --to closed` arm (FR-016), kept out of
// roadmap.ts to hold that file under the size cap. The terminal-stage advance and
// `close-related --cascade` drive the SAME transitive-close engine; this arm adds
// the lifecycle precondition (`shipped` only) and the status advance after the
// cascade. Formatting lives here (the engine in transitive-close.ts stays pure).
// Dry-run by default — the operator-confirm guard — writes nothing; `--apply`
// closes the deduped subtree ids THEN advances the root status to `closed`.

import { dirname } from 'node:path';
import type { LoadOptions } from '../document-model/document.js';
import { createBacklogBackend, BacklogError, BACKLOG_DONE_STATUS } from '../backlog/backend.js';
import { backlogRoot } from '../backlog/root.js';
import { advance } from '../roadmap/mutations.js';
import { applyCascade, buildCascadePlan, type CascadePlan } from '../roadmap/transitive-close.js';
import type { RoadmapModel, WorkItem } from '../roadmap/roadmap-model.js';
import { resolveInstallation } from '../config/installation.js';
import { loadWorkflowDoc } from '../workflow/workflow-grammar.js';
import { buildItemContext } from '../workflow/workflow-context.js';
import { describeCriterion, evaluateGate } from '../workflow/gate-eval.js';
import { firstDanglingMergedItem } from '../workflow/merge-signal.js';

/** The roadmap status `closed` is reachable ONLY from `shipped` (compass refuses otherwise). */
const REQUIRED_FROM_STATUS = 'shipped';
const CLOSED_STATUS = 'closed';

/**
 * The installation root for the governed-doc + git reads (the validated gate +
 * backstop). The enclosing installation of the roadmap doc when one exists; else the
 * doc's own directory (a bare `--doc <path>` outside any installation — the bundled
 * WORKFLOW.md still applies, and the git/record reads simply find nothing → no gate
 * surprise, no crash). This keeps the close path working for the bare-doc usage the
 * pre-032 close tests rely on while honoring an installation override where present.
 */
function resolveRoot(docPath: string): string {
  try {
    return resolveInstallation(dirname(docPath)).root;
  } catch {
    return dirname(docPath);
  }
}

/**
 * 032 US4 (FR-014/FR-016): honor the governed `validating → closed` exit-gate
 * (default `approval-marker validated`, adopter-overridable) — the SAME gate the
 * compass evaluates, so the CLI close path and the compass cannot disagree (SC-002).
 * Resolves the installation enclosing the roadmap doc, loads the (possibly
 * overridden) WORKFLOW.md, finds the transition into `closed`, and evaluates its
 * exit-gate against the item. Throws (fail-loud) when the gate is unmet. A custom doc
 * with no transition into `closed` has no extra gate (status==shipped stays the only
 * precondition).
 */
function assertCloseGateMet(item: WorkItem, installationRoot: string): void {
  const doc = loadWorkflowDoc(installationRoot);
  const closeTransition = doc.transitions.find((t) => t.to === CLOSED_STATUS && t.from !== '*');
  if (closeTransition === undefined || closeTransition.exitGate.length === 0) return;
  const { gate } = buildItemContext(installationRoot, item);
  const result = evaluateGate(closeTransition.exitGate, gate);
  if (!result.allMet) {
    const unmet = result.unmet.map(describeCriterion).join('; ');
    throw new BacklogError(
      `advance: '${item.identifier}' is 'shipped' but the validating → closed gate is unmet (${unmet}) — ` +
        `record the marker (e.g. \`stackctl roadmap resolves ${item.identifier} ...\` / set \`validated:\`) before closing`,
    );
  }
}

/** Render the dry-run plan + the would-advance line (formatting kept out of the engine). */
function renderClosedPlan(plan: CascadePlan): string {
  const lines = [
    `roadmap advance ${plan.root} --to ${CLOSED_STATUS}: dry-run — would close (use --apply):`,
  ];
  for (const node of plan.nodes) {
    const ids = node.closes.length > 0 ? node.closes.join(', ') : '(none)';
    lines.push(`  node ${node.id} [${node.status}]: ${ids}`);
  }
  for (const child of plan.skipped) {
    lines.push(`  skipped ${child.id} [${child.status}] — non-terminal, not closing its ids`);
  }
  lines.push(`  closeIds: ${plan.closeIds.length > 0 ? plan.closeIds.join(', ') : '(none)'}`);
  for (const id of plan.closeIds) {
    if (plan.alreadyClosed.includes(id)) lines.push(`  - ${id} (already closed)`);
  }
  lines.push(`  would advance ${plan.root} to ${CLOSED_STATUS}`);
  return `${lines.join('\n')}\n`;
}

/**
 * `advance --to closed` arm: precondition the root is `shipped` (else fail-loud,
 * exit 1 via BacklogError — `closed` is only reachable from `shipped`); build the
 * transitive `CascadePlan` over the part-of subtree; dry-run renders the plan +
 * "would advance" and writes nothing; `--apply` runs the cascade (closes the
 * deduped ids; refuses on unknownIds) THEN advances the root status to `closed`.
 * `model` is already loaded; `docPath`/`opts` are needed for the status mutation.
 */
export function emitAdvanceClosed(
  model: RoadmapModel,
  id: string,
  docPath: string,
  opts: LoadOptions,
  apply: boolean,
): void {
  const item = model.byId.get(id);
  if (item === undefined) {
    throw new BacklogError(`advance: no roadmap item '${id}'`);
  }
  // 032 US3 backstop (FR-009/SC-003): close is forward lifecycle motion — refuse it
  // while ANY merged-but-status-in-flight item dangles (the off-rail residual), naming
  // it + the reconcile command. The dangling item itself can never reach this gate (it
  // is in-flight, not `shipped`), so this only blocks closing OTHER items until the
  // off-rail merge is reconciled. Fires on dry-run too (the operator sees the refusal).
  const root = resolveRoot(docPath);
  const dangling = firstDanglingMergedItem(model, root);
  if (dangling !== null) {
    throw new BacklogError(
      `advance: a merged-but-status-in-flight item exists ('${dangling.itemId}') — forward lifecycle ` +
        `motion is blocked until it is reconciled; run \`stackctl workflow advance ${dangling.itemId} --apply\` ` +
        `to record its status, then retry`,
    );
  }
  // Lifecycle precondition (FR-016): closed is reachable only from shipped.
  if (item.status !== REQUIRED_FROM_STATUS) {
    throw new BacklogError(
      `advance: '${id}' is '${item.status}', not '${REQUIRED_FROM_STATUS}' — ` +
        `'${CLOSED_STATUS}' is reachable only from '${REQUIRED_FROM_STATUS}' (the post-ship terminal advance)`,
    );
  }
  // 032 US2/US4 (FR-014, SC-002): a shipped item is at the `validating` phase — close is
  // gated on the governed `validating → closed` exit-gate (default `approval-marker
  // validated`). This is the SAME gate the compass evaluates, so the CLI close path and
  // the compass agree (no graduated-but-not-validated divergence). Evaluated on dry-run
  // too, so the operator-confirm preview also surfaces the unmet gate.
  assertCloseGateMet(item, root);

  const backend = createBacklogBackend({ cwd: backlogRoot() });
  const statusById = new Map(backend.list().map((it) => [it.id, it.status]));
  const plan = buildCascadePlan(model, id, statusById);

  // Fail loud on any unknown recorded id BEFORE applying anything (FR-006).
  if (plan.unknownIds.length > 0) {
    throw new BacklogError(
      `advance: unknown backlog id(s) ${plan.unknownIds.join(', ')} ` +
        `(recorded in the cascade from '${id}' but absent from the backlog)`,
    );
  }

  if (!apply) {
    process.stdout.write(renderClosedPlan(plan)); // operator-confirm guard — writes nothing
    return;
  }

  // The closure + the lifecycle advance are one operator-confirmed action. Write the
  // roadmap status FIRST (AUDIT-20260623-07): the status write is the LOCAL, validated,
  // atomic (temp+rename) mutation — if it fails (unwritable doc, invalid candidate,
  // concurrent edit) the backlog is left UNTOUCHED, so there is no ids-closed-but-item-
  // shipped split across the two durable stores. Only once the status is recorded
  // `closed` do we close the contained backlog ids (unknownIds were already refused
  // above). If a backlog close fails mid-cascade, the item is already `closed`, so this
  // command's `shipped` precondition refuses a re-run (AUDIT-20260623-08) — recover with
  // `stackctl roadmap close-related <id> --cascade --apply`, which accepts the now-
  // terminal `closed` item and closes the remaining ids idempotently.
  advance(docPath, id, CLOSED_STATUS, opts, true);
  process.stdout.write(`roadmap advance ${id}: advanced to ${CLOSED_STATUS}\n`);
  applyCascade(plan, backend);
  process.stdout.write(`roadmap advance ${id} --to ${CLOSED_STATUS}: closing resolved items\n`);
  const already = new Set(plan.alreadyClosed);
  for (const t of plan.closeIds) {
    process.stdout.write(
      already.has(t) ? `  - ${t}: already closed (no-op)\n` : `  - ${t}: closed -> ${BACKLOG_DONE_STATUS}\n`,
    );
  }
  for (const child of plan.skipped) {
    process.stdout.write(`  skipped ${child.id} [${child.status}] — non-terminal, not closing its ids\n`);
  }
}
