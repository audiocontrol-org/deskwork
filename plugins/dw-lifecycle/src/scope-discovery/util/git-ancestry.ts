/**
 * plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts
 *
 * Phase 22 Task 3 follow-up (AUDIT-20260602-41/-42/-43): shared
 * ancestry helper used by `check-implement-hook-ran` and `implement-hook`
 * to decide whether a marker tip lives on the same history line as HEAD.
 *
 * The function returns:
 *   - `true`  — tip IS an ancestor of HEAD (same-history-line). Library
 *               callers fall through to refuse-marker-stale (the marker
 *               is genuinely stale on the same timeline; the operator
 *               must run implement-hook before the next commit).
 *   - `false` — tip is NOT an ancestor of HEAD. Library callers treat
 *               this as the diverged-history boot case (allow). Only
 *               returned when git is healthy and confirms the negative.
 *
 * **Fail-closed posture (AUDIT-20260602-41 fix).** `execFileSync` throws
 * with `status` set on the error object. Map:
 *   - status === 1  → tip is genuinely not an ancestor; return `false`.
 *   - status === 0  → tip is an ancestor; return `true`.
 *   - anything else → git error (tip ref missing, no .git/, exec failed,
 *                     non-git working directory). UNKNOWN state. Return
 *                     `true` so the caller refuses the commit rather
 *                     than allowing via the diverged-history path on
 *                     bad data. "Refuse on unknown" is the safe default
 *                     for a security-relevant gate.
 *
 * Pre-AUDIT-41, both `defaultIsAncestorOfHead` helpers (one in each CLI
 * shim) had a bare `catch { return false; }` block. That was sound for
 * the original Phase 17 use of the binary (only callers compared with
 * HEAD via marker.tip === head; ancestry was never consulted). The
 * Phase 22 Task 3 diverged-history branch turned `false` into "allow",
 * which made the catch silently allow git errors. This file restores
 * the fail-closed semantic the comment had always claimed.
 */

import { execFileSync } from 'node:child_process';

export interface IsAncestorOfHeadOptions {
  readonly repoRoot: string;
  readonly tip: string;
}

/**
 * Returns true iff `tip` is an ancestor of HEAD in the repository at
 * `repoRoot`. Fails closed on git errors — see the file-level doc.
 *
 * Pure-ish: takes options, runs git, returns a boolean. Has no side
 * effects on disk and does not read files outside of `cwd`. The
 * underlying `git merge-base --is-ancestor` is the canonical command
 * for the question.
 */
export function isAncestorOfHead(opts: IsAncestorOfHeadOptions): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', opts.tip, 'HEAD'], {
      cwd: opts.repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true; // exit 0 → tip is ancestor
  } catch (err) {
    const status = (err as { status?: number | null }).status;
    if (status === 1) return false; // exit 1 → tip is NOT ancestor
    // Any other exit code (>1) OR no `status` at all (spawn failed,
    // ENOENT, non-git directory) is unknown state. Fail closed:
    // return true so the caller treats the marker as on-same-history
    // and refuses-marker-stale. Per AUDIT-20260602-41.
    return true;
  }
}
