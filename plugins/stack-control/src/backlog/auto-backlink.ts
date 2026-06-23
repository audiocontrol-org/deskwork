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
): AutoBackLinkResult {
  const nodeId = readParentNode(backend, id);
  if (nodeId === null) return { nodeId: null, linked: false };
  const inst = resolveInstallation(startDir);
  const opts: LoadOptions = grammarOptsForRoot(inst.root);
  const roadmap = inst.resolved.roadmap;
  const result = computeCloses(roadmap, nodeId, { add: [id] }, opts);
  if (!result.changed) return { nodeId, linked: false };
  commitCandidate(roadmap, result.text, opts, true);
  return { nodeId, linked: true };
}

/**
 * Preflight the auto-back-link WITHOUT mutating anything (031 AUDIT-20260623-04).
 * Resolves the task's parent-node ref (or an explicit `nodeId`, for the
 * `promote --node` case where the ref is set only AFTER the promote) and validates
 * the back-link target against the installation's roadmap via the PURE
 * `computeCloses` (it loads + requires the node, throwing on an unknown one; it
 * never writes). The caller runs this BEFORE the backlog mutation (close/promote)
 * so a stale/missing ref fails loud BEFORE any state change — never leaving a task
 * `Done`/promoted but unlinked. A no-ref task is a no-op (nothing to preflight).
 */
export function preflightAutoBackLink(
  backend: BacklogBackend,
  id: string,
  startDir: string,
  explicitNode?: string,
): void {
  const nodeId = explicitNode ?? readParentNode(backend, id);
  if (nodeId === null || nodeId === undefined) return;
  const inst = resolveInstallation(startDir);
  const opts: LoadOptions = grammarOptsForRoot(inst.root);
  computeCloses(inst.resolved.roadmap, nodeId, { add: [id] }, opts); // throws on unknown node; no write
}

/**
 * Verb-side preflight wrapper: validate the back-link target BEFORE the backlog
 * mutation, mapping a bad ref / unreadable roadmap / out-of-installation
 * resolution to a fail-loud exit 1 (mirrors `emitAutoBackLink`'s mapping). Because
 * this runs before `backend.close`/`promote`, a refusal here means the backlog is
 * untouched — the operator fixes the ref and retries against a clean state.
 */
export function emitPreflightAutoBackLink(
  backend: BacklogBackend,
  id: string,
  startDir: string,
  explicitNode?: string,
): void {
  try {
    preflightAutoBackLink(backend, id, startDir, explicitNode);
  } catch (err) {
    if (
      err instanceof DocumentModelError ||
      err instanceof BacklogError ||
      err instanceof InstallationError
    ) {
      process.stderr.write(
        `backlog: auto-back-link target invalid for ${id} — refusing before the backlog change: ${err.message}\n`,
      );
      process.exit(1);
    }
    throw err;
  }
}

/**
 * The verb-side wrapper (031 US2, FR-011) the `backlog done`/`promote` handlers
 * call after a successful close/promote. Runs `autoBackLink` and reports a newly
 * recorded link; an unknown referenced node / unreadable roadmap / out-of-
 * installation resolution is fail-loud (exit 1) — the close already happened, but
 * the operator must know the back-link did NOT land (contract invariant: never
 * silently swallowed). Absence of a parent-node ref is a documented no-op.
 */
export function emitAutoBackLink(
  backend: BacklogBackend,
  id: string,
  startDir: string,
  out: (line: string) => void = (line) => process.stdout.write(line),
): void {
  try {
    const res = autoBackLink(backend, id, startDir);
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
