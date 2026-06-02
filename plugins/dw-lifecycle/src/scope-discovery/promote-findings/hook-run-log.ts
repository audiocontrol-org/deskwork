/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts
 *
 * Phase 17 Task 5 — append-only log of every implement-hook run.
 *
 * The single `last-hook-run.json` marker (Task 2) tells the commit-msg
 * gate whether the hook ran for the parent commit. But the commit-msg
 * gate can be bypassed via `git commit --no-verify`. The pre-push gate
 * catches that bypass by walking each commit in `<remote-tip>..HEAD`
 * and verifying it has a matching hook-run record.
 *
 * Per-commit verification requires per-run history, not just the latest
 * marker. The log is JSONL (one JSON object per line, append-only,
 * never rewritten). Entries are written by `implement-hook` after
 * every successful run.
 *
 * Pure-fn helpers for read + append. The pre-push gate's library
 * (`check-implement-hook-coverage.ts`) consumes the parsed entries.
 */

import { mkdir, readFile, appendFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { z } from 'zod';

const HOOK_RUN_LOG_REL_PATH = '.dw-lifecycle/scope-discovery/hook-run-log.jsonl';

/**
 * Per AUDIT-20260601-06: the pre-push gate's boot case MUST gate on a
 * persistent sentinel, not log emptiness. The sentinel is written by
 * the first successful implement-hook run and never deleted; it
 * outlives errant `git clean`s or `.dw-lifecycle` resets that might
 * truncate the log.
 */
const BOOTSTRAP_SENTINEL_REL_PATH =
  '.dw-lifecycle/scope-discovery/.implement-hook-bootstrapped';

export function bootstrapSentinelPathFor(repoRoot: string): string {
  return join(repoRoot, BOOTSTRAP_SENTINEL_REL_PATH);
}

const DISPOSITIONS = [
  'fired-and-promoted',
  'fired-and-slushed',
  'no-new-diff-skip',
  'barrage-outage',
] as const;

export const HookRunLogEntrySchema = z.object({
  tip: z.string().min(7),
  timestamp: z.string().datetime(),
  disposition: z.enum(DISPOSITIONS),
  runDir: z.string().nullable(),
});

export type HookRunLogEntry = z.infer<typeof HookRunLogEntrySchema>;

export function hookRunLogPathFor(repoRoot: string): string {
  return join(repoRoot, HOOK_RUN_LOG_REL_PATH);
}

/**
 * Read all entries from the log. Returns empty array on missing file.
 * Malformed lines are silently skipped (the gate fails-safe by treating
 * a malformed log as "no entry for this commit," which causes a
 * refusal — better than silently allowing).
 */
export async function readHookRunLog(repoRoot: string): Promise<HookRunLogEntry[]> {
  const path = hookRunLogPathFor(repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const entries: HookRunLogEntry[] = [];
  for (const line of lines) {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = HookRunLogEntrySchema.safeParse(obj);
    if (parsed.success) entries.push(parsed.data);
  }
  return entries;
}

/**
 * Append a single entry to the log. Creates the parent dir + file on
 * first call. Atomic-append (Node's appendFile uses O_APPEND). Also
 * writes the bootstrap sentinel if absent (per AUDIT-20260601-06 —
 * the FIRST successful run creates the sentinel that the pre-push
 * gate uses to distinguish boot case from log-deleted state).
 */
export async function appendHookRunLogEntry(
  repoRoot: string,
  entry: HookRunLogEntry,
): Promise<void> {
  HookRunLogEntrySchema.parse(entry); // throws on invalid
  const path = hookRunLogPathFor(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
  // First-run sentinel: idempotent write. Once present, it stays —
  // even if the log is later deleted.
  const sentinelPath = bootstrapSentinelPathFor(repoRoot);
  try {
    await stat(sentinelPath);
  } catch {
    // Sentinel missing → write it. Content is a one-line marker with
    // the first-run tip for forensic value; presence is what counts.
    await writeFile(sentinelPath, `${entry.tip}\n${entry.timestamp}\n`, 'utf8');
  }
}

/**
 * Returns true when the project has been bootstrapped. Per AUDIT-
 * 20260601-06: the pre-push gate uses this to distinguish boot from
 * post-bootstrap-log-deletion.
 *
 * Per AUDIT-20260601-claude-01 (BLOCKING follow-on): the sentinel
 * file alone is insufficient signal because it isn't committed and
 * isn't derivable from git state. Fresh clones, migrating projects,
 * and pre-sentinel-code installs all have a non-empty log but no
 * sentinel — that combination must NOT fail-open. Fix: treat a
 * non-empty log as ALSO implying bootstrapped, AND backfill the
 * sentinel on read so it converges to "present" on first use.
 */
export async function hasBootstrapSentinel(repoRoot: string): Promise<boolean> {
  // Sentinel present → definitively bootstrapped.
  try {
    await stat(bootstrapSentinelPathFor(repoRoot));
    return true;
  } catch {
    // Sentinel absent — but a non-empty log is also bootstrapped
    // (migrating projects, fresh clones, etc.). Backfill the
    // sentinel so subsequent reads see it present.
    const log = await readHookRunLog(repoRoot);
    if (log.length > 0) {
      const first = log[0]!;
      try {
        await writeFile(
          bootstrapSentinelPathFor(repoRoot),
          `${first.tip}\n${first.timestamp}\n`,
          'utf8',
        );
      } catch {
        // Best-effort backfill — if the write fails, returning true
        // is still correct (the log evidence is sufficient).
      }
      return true;
    }
    return false;
  }
}
