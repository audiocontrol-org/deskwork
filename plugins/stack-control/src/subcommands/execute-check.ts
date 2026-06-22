// `stackctl execute-check --spec <dir>` (T017).
//
// Validates that a Spec Kit spec directory is RUNNABLE for native
// /speckit-implement. Read-only; never authors or repairs. Fail-loud
// (FR-008 / Principle V / VR-1): a non-runnable spec NEVER exits 0 and the
// error names the missing artifact — no fabricated "runnable" verdict.
//
// "Runnable" is pinned (A1) to: tasks.md present in the spec dir. spec.md +
// plan.md are assumed already present from the upstream Spec Kit chain; the
// gating artifact is tasks.md (what /speckit-tasks produces).

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Strict arg parsing (AUDIT-20260605-09): the dispatcher contract is "no flag
// silently ignored." Accept ONLY `--spec <value>`; reject a missing value,
// unknown flags, or stray positionals with exit 2 — a typo must not slip
// through as a runnable verdict.
function parseArgs(args: string[]): { spec: string } {
  let spec: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--spec') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write('execute-check: --spec <dir> required\n');
        process.exit(2);
      }
      spec = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(
      `execute-check: unexpected argument '${token}' (usage: execute-check --spec <dir>)\n`,
    );
    process.exit(2);
  }
  if (spec === undefined) {
    process.stderr.write('execute-check: --spec <dir> required\n');
    process.exit(2);
  }
  return { spec };
}

export async function runExecuteCheck(args: string[]): Promise<void> {
  const { spec } = parseArgs(args);

  const specDir = resolve(spec);
  if (!existsSync(specDir)) {
    process.stderr.write(`execute-check: FATAL — spec dir ${spec} not found\n`);
    process.exit(1);
  }

  // A file masquerading as a spec dir must be diagnosed distinctly
  // (AUDIT-20260605-08) — not misreported as "tasks.md missing."
  if (!statSync(specDir).isDirectory()) {
    process.stderr.write(`execute-check: FATAL — spec path ${spec} is not a directory\n`);
    process.exit(1);
  }

  const tasks = join(specDir, 'tasks.md');
  if (!existsSync(tasks)) {
    process.stderr.write(
      `execute-check: FATAL — ${join(spec, 'tasks.md')} missing; ` +
        `spec not runnable (run /speckit-tasks first)\n`,
    );
    process.exit(1);
  }

  process.stdout.write('runnable\n');
}

// ── Commit + push boundary (025 US3) ─────────────────────────────────────────────
//
// The mechanical commit-then-push post-condition the `/stack-control:execute` skill body
// runs at the phase boundary. The logic lives here in the portable `stackctl` surface
// (specs/017 Decision 1: stackctl is authoritative, the skill bodies are thin cross-vendor
// adapters). 030 (FR-017) retired the per-phase govern cadence helpers that used to sit
// here — implement mode governs the whole feature once via the end-govern pipeline, so the
// per-phase ordering / boundary-fit / per-phase-checkpoint post-conditions are gone.

/** Runs a `git` invocation; MUST throw on a non-zero exit. Injected for hermetic tests. */
export type GitRunner = (args: readonly string[]) => void;

/**
 * The mechanical commit-then-push boundary post-condition (FR-009/010/011). "Push early
 * and often" becomes a mechanism, not a reminder:
 *   - the commit lands LOCALLY FIRST, so completed work is never lost (FR-009);
 *   - the push follows (FR-010);
 *   - a push failure FAILS LOUD and is surfaced, the local commit stays intact, the path
 *     never silently continues, and `--no-verify` is NEVER used — a pre-commit/pre-push
 *     hook failure is fixed, not bypassed (FR-011/SC-007).
 */
export function commitAndPushBoundary(run: GitRunner, repoRoot: string, message: string): void {
  // Commit locally first (work-safe). NEVER `--no-verify` — hook failures are fixed.
  run(['-C', repoRoot, 'add', '-A']);
  run(['-C', repoRoot, 'commit', '-m', message]);
  // Push; on failure surface loud with the local commit intact (it pushes on retry).
  try {
    run(['-C', repoRoot, 'push']);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `execute: FATAL — git push failed at the phase boundary; the local commit is INTACT ` +
        `and will push on retry. Fix the push (offline/auth/pre-push hook) — NEVER use ` +
        `--no-verify, fix the hook instead — then re-run. Underlying: ${detail}`,
    );
  }
}
