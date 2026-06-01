/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-marker.ts
 *
 * Phase 17 Task 2 — marker file for the audit-barrage hook.
 *
 * The marker at `.dw-lifecycle/scope-discovery/last-hook-run.json` is
 * the audit trail the commit-msg gate reads to verify the agent ran
 * the audit-barrage hook since the parent commit. Per the operator's
 * 2026-05-31 directive: *"when to run the barrage should not be a
 * matter of policy and the agent should have no discretion."*
 *
 * Marker semantics:
 *   - `tip` is the git HEAD sha at the time the hook ran. The
 *     commit-msg gate compares `marker.tip === git rev-parse HEAD`
 *     at commit-msg time (which is BEFORE the new commit lands, so
 *     HEAD is the parent of the commit being made). Match = the
 *     hook covered the parent commit's work → allow this commit.
 *   - `runDir` is the audit-runs/ path when the barrage actually
 *     fired; null when the hook resolved to a no-new-diff skip
 *     (the marker still writes, so the gate can see the agent
 *     invoked the verb).
 *   - `disposition` distinguishes the four legitimate hook outcomes
 *     so the operator can audit the marker history.
 *
 * Marker is PROJECT-SCOPED (one per project root), NOT per-feature.
 * Rationale: the commit-msg gate fires from any worktree against any
 * feature. Per-feature markers would require the gate to know which
 * feature was active, which is a separate context discovery problem.
 * Per-project keeps the gate's lookup trivial: one path, one parse,
 * one comparison.
 *
 * Atomic write via tmp + rename (per AUDIT-20260530-04 precedent).
 * Read fail-safe: missing or corrupted marker → return null; the
 * gate treats null as `refuse-marker-missing` per its contract.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../util/atomic-write-file.js';

const DISPOSITIONS = [
  'fired-and-promoted',
  'fired-and-slushed',
  'no-new-diff-skip',
  'barrage-outage',
] as const;

export const HookRunMarkerSchema = z.object({
  tip: z.string().min(7), // git short-sha is 7+; full is 40
  timestamp: z.string().datetime(),
  runDir: z.string().nullable(),
  disposition: z.enum(DISPOSITIONS),
  findingsCount: z.number().int().nonnegative(),
  promotedCount: z.number().int().nonnegative(),
  slushedCount: z.number().int().nonnegative(),
});

export type HookRunMarker = z.infer<typeof HookRunMarkerSchema>;
export type HookDisposition = (typeof DISPOSITIONS)[number];

const MARKER_REL_PATH = '.dw-lifecycle/scope-discovery/last-hook-run.json';

export interface HookRunMarkerIOArgs {
  readonly repoRoot: string;
}

export function markerPathFor(repoRoot: string): string {
  return join(repoRoot, MARKER_REL_PATH);
}

/**
 * Read the project's marker. Returns null on:
 *   - file missing (ENOENT)
 *   - file corrupted (JSON parse error)
 *   - schema mismatch (zod validation fail)
 *
 * The commit-msg gate treats null as `refuse-marker-missing`. Never
 * throws — fail-safe to a refusal that names the cure rather than
 * surfacing a parse error the operator has to interpret.
 */
export async function readHookRunMarker(
  args: HookRunMarkerIOArgs,
): Promise<HookRunMarker | null> {
  const path = markerPathFor(args.repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = HookRunMarkerSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export interface WriteHookRunMarkerArgs extends HookRunMarkerIOArgs {
  readonly marker: HookRunMarker;
}

/**
 * Write the project's marker atomically. Validates against the schema
 * before writing — refuses to write a malformed marker (which would
 * silently cause future reads to return null and the gate to refuse
 * all subsequent commits).
 *
 * Throws if validation fails OR the atomic write fails (disk full,
 * permissions). Callers handle the error per the SKILL.md failure-
 * path policy.
 */
export async function writeHookRunMarker(args: WriteHookRunMarkerArgs): Promise<void> {
  HookRunMarkerSchema.parse(args.marker); // throws on invalid shape
  const path = markerPathFor(args.repoRoot);
  const content = `${JSON.stringify(args.marker, null, 2)}\n`;
  await atomicWriteFile(path, content);
}
