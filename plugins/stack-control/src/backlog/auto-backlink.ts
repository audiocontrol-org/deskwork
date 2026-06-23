// Auto-back-link (031 US2, FR-011; contract backlog-parent-node.md). When a
// backlog task carries a parent-node ref (parent-node.ts), closing or promoting
// it records the task id into that node's PROSE `closes:` set — so the transitive
// closer has an auditable recorded set without a hand-edit. Absence of the ref is
// a documented no-op (NOT an error); a ref to a non-existent node is surfaced
// fail-loud (the closes-mutation engine throws on an unknown node), never
// silently swallowed.
//
// The roadmap doc is resolved through the enclosing INSTALLATION (resolved.roadmap)
// — never a hardcoded path — exactly as every other governed verb resolves its
// working files. Extracted out of backlog.ts to keep that file under the 500-line
// cap; backlog.ts's `done`/`promote` handlers call this after the close/promote
// succeeds.

import type { LoadOptions } from '../document-model/document.js';
import { commitCandidate } from '../document-model/mutations-core.js';
import { resolveInstallation } from '../config/installation.js';
import { InstallationError } from '../config/errors.js';
import { DocumentModelError } from '../document-model/types.js';
import { grammarOptsForRoot } from '../subcommands/document-verb-shared.js';
import { computeCloses } from '../roadmap/closes-mutation.js';
import { BacklogError, type BacklogBackend } from './backend.js';
import { readParentNode } from './parent-node.js';

/** The outcome of an auto-back-link attempt (for the verb's reporting). */
export interface AutoBackLinkResult {
  /** The roadmap node id the task is linked to, or null when the task carries
   * no parent-node ref (the documented no-op). */
  readonly nodeId: string | null;
  /** True when the id was newly added to the node's closes: set (false on a
   * no-op: no ref, OR the id was already present — idempotent). */
  readonly linked: boolean;
}

/**
 * Auto-back-link `id` into its parent node's `closes:` set (FR-011). Reads the
 * task's parent-node ref; when ABSENT, returns a no-op result (no write, no
 * error). When PRESENT, resolves the installation's roadmap doc and adds `id` to
 * that node's `closes:` via the closes-mutation engine, writing only when the set
 * actually changes (idempotent). An unknown node throws (the engine's
 * DocumentModelError) — the caller maps it to a fail-loud non-zero exit.
 *
 * `startDir` is the walk-up start for installation resolution (the verb's cwd).
 */
export function autoBackLink(
  backend: BacklogBackend,
  id: string,
  startDir: string,
  explicitNode?: string,
): AutoBackLinkResult {
  // `explicitNode` (the `promote --node` value) lets the back-link run BEFORE the
  // task carries the ref in its notes (promote records the ref only afterward);
  // `done` passes no explicitNode and reads the ref already on the task.
  const nodeId = explicitNode ?? readParentNode(backend, id);
  if (nodeId === null || nodeId === undefined) return { nodeId: null, linked: false };
  const inst = resolveInstallation(startDir);
  const opts: LoadOptions = grammarOptsForRoot(inst.root);
  const roadmap = inst.resolved.roadmap;
  const result = computeCloses(roadmap, nodeId, { add: [id] }, opts);
  if (!result.changed) return { nodeId, linked: false };
  commitCandidate(roadmap, result.text, opts, true);
  return { nodeId, linked: true };
}

/**
 * The verb-side wrapper (031 US2, FR-011) the `backlog done`/`promote` handlers
 * call. It runs the roadmap back-link write (the LOCAL, validated, atomic
 * temp+rename mutation) and is invoked BEFORE the irreversible backlog mutation
 * (close/promote) — so a failure (unknown node, unreadable/unwritable roadmap,
 * out-of-installation, concurrent invalidation) fails loud (exit 1) with the
 * backlog UNTOUCHED, never leaving a task `Done`/promoted but unlinked
 * (AUDIT-20260623-04/-09). Absence of a parent-node ref is a documented no-op.
 * `explicitNode` carries the `promote --node` value (the task does not yet hold
 * the ref at back-link time).
 */
export function emitAutoBackLink(
  backend: BacklogBackend,
  id: string,
  startDir: string,
  explicitNode?: string,
  out: (line: string) => void = (line) => process.stdout.write(line),
): void {
  try {
    const res = autoBackLink(backend, id, startDir, explicitNode);
    if (res.linked) out(`  - back-linked ${id} -> ${res.nodeId} closes:\n`);
  } catch (err) {
    if (
      err instanceof DocumentModelError ||
      err instanceof BacklogError ||
      err instanceof InstallationError
    ) {
      process.stderr.write(`backlog: auto-back-link failed for ${id}: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
