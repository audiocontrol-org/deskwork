/**
 * plugins/dw-lifecycle/src/scope-discovery/uninstall-everything-hook-related.ts
 *
 * Phase 24 adopter-migration helper (one-shot).
 *
 * Adopters who ran `dw-lifecycle install-scope-discovery-hooks` (or the
 * `install-agent-prompts` companion) in v0.35.0 or earlier have managed
 * blocks in `.husky/{pre-commit,pre-push,commit-msg}` + a manifest at
 * `.dw-lifecycle/scope-discovery/hooks-installed.json` + (depending on
 * the install date) `last-hook-run.json` / `hook-run-log.jsonl`. Phase 24
 * retired the install-side verbs and the consuming gate chain; the
 * managed blocks are now stale and (per the no-git-hook-enforcement
 * principle) should not be there at all.
 *
 * This helper finds + removes the dw-lifecycle-managed content from each
 * of those files. It's NOT an installable verb in the same sense as the
 * retired `install-scope-discovery-hooks` — it ships as a one-shot
 * adopter-migration utility. After the migration, the adopter never
 * needs to run it again; the plugin no longer creates the artifacts
 * the helper removes.
 *
 * Marker contract (must match the retired installer's wire format):
 *   - Opening: `# >>> dw-lifecycle scope-discovery hook >>>`
 *   - Closing: `# <<< dw-lifecycle scope-discovery hook <<<`
 *   - Block content between markers is the install-scope-discovery-hooks
 *     output. Everything else in the hook file is operator-authored and
 *     MUST be preserved.
 *
 * Pure-ish: takes options + a fs-shim, returns a structured report. Tests
 * exercise the pure-fn `removeManagedBlock` and the orchestrator's
 * file-walking logic.
 */

import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';

export const HOOK_BEGIN_MARKER = '# >>> dw-lifecycle scope-discovery hook >>>';
export const HOOK_END_MARKER = '# <<< dw-lifecycle scope-discovery hook <<<';

export interface UninstallEverythingHookRelatedOptions {
  readonly repoRoot: string;
  /** When false (default), dry-run: scan + report but don't mutate. */
  readonly apply: boolean;
}

export interface FileAction {
  readonly path: string;
  readonly action: 'block-removed' | 'file-deleted' | 'no-managed-block' | 'not-present';
  readonly bytesRemoved?: number;
}

export interface UninstallEverythingHookRelatedReport {
  readonly apply: boolean;
  readonly actions: ReadonlyArray<FileAction>;
}

/**
 * Pure function: given a hook file's contents, return the contents with
 * any dw-lifecycle managed block removed. Returns null when no managed
 * block was present (caller writes nothing). When a block is removed,
 * also strips any trailing blank line that the block left behind so the
 * resulting file isn't padded.
 *
 * The marker pair is canonical and unambiguous; nested or repeated marker
 * pairs are NOT handled (the installer never wrote them; if an adopter's
 * hook file has duplicated markers something is genuinely wrong + the
 * report surfaces that as `no-managed-block` so the operator inspects
 * manually).
 */
export function removeManagedBlock(contents: string): string | null {
  const beginIdx = contents.indexOf(HOOK_BEGIN_MARKER);
  if (beginIdx === -1) return null;
  const endMarkerStart = contents.indexOf(HOOK_END_MARKER, beginIdx);
  if (endMarkerStart === -1) return null;
  const endIdx = endMarkerStart + HOOK_END_MARKER.length;
  // Confirm there isn't a SECOND begin-marker between begin and end —
  // that signals nested / duplicated markers we don't handle.
  const secondBegin = contents.indexOf(HOOK_BEGIN_MARKER, beginIdx + HOOK_BEGIN_MARKER.length);
  if (secondBegin !== -1 && secondBegin < endIdx) return null;
  const before = contents.slice(0, beginIdx);
  const after = contents.slice(endIdx);
  // Strip a single trailing newline from `before` if it immediately
  // precedes our block (it was a separator the installer added).
  const trimmedBefore = before.endsWith('\n') ? before.slice(0, -1) : before;
  // Strip a leading newline from `after` if it immediately follows our
  // block (also a separator).
  const trimmedAfter = after.startsWith('\n') ? after.slice(1) : after;
  // Per AUDIT-20260603-81: NO global blank-line collapse — that violated
  // the "preserve operator content verbatim" contract by rewriting blank-
  // line gaps elsewhere in the file. The splice-point trim above is the
  // only normalization we do; runs of newlines in operator-authored
  // sections are preserved.
  return `${trimmedBefore}${trimmedAfter}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk the three husky files + the three working-tree artifacts; remove
 * managed content; produce a structured report. Caller decides what to
 * do with the report (print / json / exit code).
 */
export async function uninstallEverythingHookRelated(
  opts: UninstallEverythingHookRelatedOptions,
): Promise<UninstallEverythingHookRelatedReport> {
  const actions: FileAction[] = [];
  const huskyFiles = ['pre-commit', 'pre-push', 'commit-msg'];
  for (const hookName of huskyFiles) {
    const huskyPath = join(opts.repoRoot, '.husky', hookName);
    if (!(await pathExists(huskyPath))) {
      actions.push({ path: `.husky/${hookName}`, action: 'not-present' });
      continue;
    }
    const before = await readFile(huskyPath, 'utf8');
    const after = removeManagedBlock(before);
    if (after === null) {
      actions.push({ path: `.husky/${hookName}`, action: 'no-managed-block' });
      continue;
    }
    if (opts.apply) {
      await writeFile(huskyPath, after);
    }
    actions.push({
      path: `.husky/${hookName}`,
      action: 'block-removed',
      bytesRemoved: before.length - after.length,
    });
  }
  // Working-tree artifact deletions (each is independent; presence is
  // not required).
  const artifacts = [
    '.dw-lifecycle/scope-discovery/hooks-installed.json',
    '.dw-lifecycle/scope-discovery/last-hook-run.json',
    '.dw-lifecycle/scope-discovery/hook-run-log.jsonl',
  ];
  for (const artifactRel of artifacts) {
    const artifactPath = join(opts.repoRoot, artifactRel);
    if (!(await pathExists(artifactPath))) {
      actions.push({ path: artifactRel, action: 'not-present' });
      continue;
    }
    if (opts.apply) {
      await unlink(artifactPath);
    }
    actions.push({ path: artifactRel, action: 'file-deleted' });
  }
  return { apply: opts.apply, actions };
}
