// 031 US1 — the `roadmap close-related --cascade` arm, kept out of roadmap.ts to
// hold that file under the size cap. Formatting lives here (the engine in
// transitive-close.ts stays pure); the decision/walk/dedup logic is the shared
// engine. Drives the real backlog backend; dry-run by default; `--apply` writes;
// idempotent; fail-loud on unknown ids. Does NOT change the root's status (that
// is `advance --to closed`'s job — out of US1 scope).

import { createBacklogBackend, BacklogError, BACKLOG_DONE_STATUS } from '../backlog/backend.js';
import { backlogRoot } from '../backlog/root.js';
import { applyCascade, buildCascadePlan, type CascadePlan } from '../roadmap/transitive-close.js';
import type { RoadmapModel } from '../roadmap/roadmap-model.js';

/** Render the cascade dry-run plan text (formatting kept out of the engine). */
function renderCascadePlan(plan: CascadePlan): string {
  const lines = [`roadmap close-related ${plan.root}: cascade dry-run — would close (use --apply):`];
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
  return `${lines.join('\n')}\n`;
}

/**
 * `--cascade` arm: walk the node's `part-of` subtree and close every terminal
 * member's recorded ids (deduped, diamond-safe), skip-and-report non-terminal
 * children, uniform terminal handling of cancelled/retired. Dry-run by default;
 * `--apply` writes via the shared transitive-close engine. `model` is already
 * loaded; `id` is the (terminal-gated) cascade root; `apply` toggles the write.
 */
export function emitCloseRelatedCascade(model: RoadmapModel, id: string, apply: boolean): void {
  const backend = createBacklogBackend({ cwd: backlogRoot() });
  const statusById = new Map(backend.list().map((it) => [it.id, it.status]));
  const plan = buildCascadePlan(model, id, statusById);

  // Fail loud on any unknown recorded id BEFORE applying anything (FR-006).
  if (plan.unknownIds.length > 0) {
    throw new BacklogError(
      `close-related: unknown backlog id(s) ${plan.unknownIds.join(', ')} ` +
        `(recorded in the cascade from '${id}' but absent from the backlog)`,
    );
  }

  if (!apply) {
    process.stdout.write(renderCascadePlan(plan));
    return;
  }

  applyCascade(plan, backend);
  process.stdout.write(`roadmap close-related ${id}: cascade closing resolved items\n`);
  const already = new Set(plan.alreadyClosed);
  for (const t of plan.closeIds) {
    process.stdout.write(
      already.has(t) ? `  - ${t}: already closed (no-op)\n` : `  - ${t}: closed -> ${BACKLOG_DONE_STATUS}\n`,
    );
  }
}
