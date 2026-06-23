// 031 US3 — the `roadmap advance <id> --to closed` arm (FR-016), kept out of
// roadmap.ts to hold that file under the size cap. The terminal-stage advance and
// `close-related --cascade` drive the SAME transitive-close engine; this arm adds
// the lifecycle precondition (`shipped` only) and the status advance after the
// cascade. Formatting lives here (the engine in transitive-close.ts stays pure).
// Dry-run by default — the operator-confirm guard — writes nothing; `--apply`
// closes the deduped subtree ids THEN advances the root status to `closed`.

import type { LoadOptions } from '../document-model/document.js';
import { createBacklogBackend, BacklogError, BACKLOG_DONE_STATUS } from '../backlog/backend.js';
import { backlogRoot } from '../backlog/root.js';
import { advance } from '../roadmap/mutations.js';
import { applyCascade, buildCascadePlan, type CascadePlan } from '../roadmap/transitive-close.js';
import type { RoadmapModel } from '../roadmap/roadmap-model.js';

/** The roadmap status `closed` is reachable ONLY from `shipped` (compass refuses otherwise). */
const REQUIRED_FROM_STATUS = 'shipped';
const CLOSED_STATUS = 'closed';

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
  // Lifecycle precondition (FR-016): closed is reachable only from shipped.
  if (item.status !== REQUIRED_FROM_STATUS) {
    throw new BacklogError(
      `advance: '${id}' is '${item.status}', not '${REQUIRED_FROM_STATUS}' — ` +
        `'${CLOSED_STATUS}' is reachable only from '${REQUIRED_FROM_STATUS}' (the post-ship terminal advance)`,
    );
  }

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
  // `closed` do we close the contained backlog ids. (unknownIds were already refused
  // above; the cascade is idempotent, so a re-run converges.)
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
