/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/orchestrate-barrage.ts
 *
 * Composes spawn-cli + run-artifacts into a single parallel barrage.
 *
 * Sequence:
 *   1. Generate the timestamp + run-dir name.
 *   2. Create the run dir (and its `stderr/` subdir).
 *   3. Write PROMPT.md.
 *   4. Fire every model in parallel via `Promise.all`. No early exit:
 *      a failing model does not abort siblings.
 *   5. Write INDEX.md with the per-model summary.
 *   6. Return the BarrageRun.
 *
 * Path layout per model:
 *   <runDir>/<safe-name>.md         -- stdout capture
 *   <runDir>/stderr/<safe-name>.txt -- stderr capture
 *
 * The orchestrator owns the run-dir derivation and the parent dir for
 * the runs root (`.stack-control/audit-runs/`). Tests
 * override the root via `runDirOverride`.
 */

import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createRunDir,
  encodeTimestamp,
  generateRunDirName,
  safeModelName,
  writeIndexFile,
  writePromptFile,
} from './run-artifacts.js';
import { spawnCliAgainstModel, type SpawnInput } from './spawn-cli.js';
import {
  isModelRunCovering,
  type BarrageInput,
  type BarrageRun,
  type ModelRunResult,
} from './types.js';

const DEFAULT_RUNS_ROOT = '.stack-control/audit-runs';

/**
 * Phase 16 Task 2 default: read HEAD via `git rev-parse HEAD` against
 * `repoRoot`. Returns `null` on any failure (no git repo, detached
 * worktree, etc.); the orchestrator then skips the `tip.sha` write and
 * the next-iteration guard fail-safes to fire.
 */
async function defaultTipShaResolver(repoRoot: string): Promise<string | null> {
  try {
    const stdout = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Run a complete barrage and return the resulting BarrageRun record.
 *
 * Exposes side effects only through the on-disk run dir; the returned
 * record is the in-memory mirror.
 *
 * The caller is responsible for surfacing the BarrageRun on stdout
 * and for mapping its per-model results onto a verb-level exit code.
 */
export async function orchestrateBarrage(
  input: BarrageInput,
): Promise<BarrageRun> {
  const now = new Date();
  const timestamp = encodeTimestamp(now);
  const runDirName = generateRunDirName(now, input.featureSlug);
  const parentRunsDir = input.runDirOverride ?? join(input.repoRoot, DEFAULT_RUNS_ROOT);
  const runDir = await createRunDir(parentRunsDir, runDirName);
  const promptPath = await writePromptFile(runDir, input.prompt);

  // Phase 16 Task 2 (#383): record HEAD at fire-time so the new-diff
  // guard (`check-barrage-tip`) knows which commits this barrage
  // covers. Resolver failure (no git, detached worktree, etc.) →
  // captured as null; tip.sha is not written.
  //
  // Per AUDIT-20260531-claude-03 + codex-02 (cross-model): the
  // tip.sha is captured at fire-time (so commits landing DURING the
  // barrage don't silently get marked as covered) but written ONLY
  // after the barrage completes AND at least one model produced
  // output. An outage run leaves no tip.sha; the next iteration's
  // guard fail-safes to fire (preserving audit coverage). The write
  // is wrapped in try/catch — a write failure degrades to "no tip
  // recorded" rather than crashing the barrage.
  const tipShaResolver = input.tipShaResolver ?? defaultTipShaResolver;
  const fireTimeTipSha = await tipShaResolver(input.repoRoot);

  const spawnInputs: ReadonlyArray<SpawnInput> = input.models.map((model) => {
    const stem = safeModelName(model.name);
    return {
      model,
      prompt: input.prompt,
      stdoutPath: join(runDir, `${stem}.md`),
      stderrPath: join(runDir, 'stderr', `${stem}.txt`),
    };
  });

  const results: ReadonlyArray<ModelRunResult> = await Promise.all(
    spawnInputs.map(spawnCliAgainstModel),
  );

  // Per AUDIT-20260531-claude-03 + codex-02: only write tip.sha when
  // the barrage actually produced audit COVERAGE. An all-crashed
  // (zero-coverage) run intentionally omits tip.sha; the next
  // iteration's check-barrage-tip then sees missing → fail-safes to
  // fire (per AUDIT-20260531-fail-safe-rule). Write is wrapped so a
  // filesystem failure (disk full, race) degrades to "no tip recorded"
  // rather than aborting the run.
  if (fireTimeTipSha !== null) {
    // Per AUDIT-20260607-42: gate on COVERAGE (isModelRunCovering),
    // matching the CLI's exit-code derivation. A run where every family
    // is non-zero-exit / timed-out / spawn-failed is a zero-coverage
    // OUTAGE — omit tip.sha so the next iteration fail-safes to fire,
    // instead of marking the OUTAGE's HEAD as covered. (Liftability is
    // NOT enough here: a crash-after-banner family emitted bytes but did
    // not cover the commit; treating it as coverage would re-open the
    // outage-masquerades-as-clean hole.)
    const anyCovering = results.some(isModelRunCovering);
    if (anyCovering) {
      try {
        await writeFile(join(runDir, 'tip.sha'), `${fireTimeTipSha}\n`, 'utf8');
      } catch {
        // Swallow per the claude-03 contract: tip.sha write failure
        // is non-fatal; the next iteration fail-safes to fire on
        // missing tip. The audit-runs/<runDir>/ artifacts remain
        // intact for operator triage.
      }
    }
  }

  // Assemble the BarrageRun, write INDEX.md, return the same record.
  // `indexPath` is derived from `runDir` up front (same derivation
  // `writeIndexFile` performs internally) so the BarrageRun shape is
  // complete at the time of the write — and the returned record
  // matches the on-disk INDEX.md path byte-for-byte. The deliberate
  // duplication (caller + writeIndexFile both derive `<runDir>/INDEX.md`)
  // keeps the helper composable: `writeIndexFile` can be called
  // standalone from tests + tools without taking a path argument the
  // caller already knows.
  const indexPath = join(runDir, 'INDEX.md');
  const run: BarrageRun = {
    runDir,
    timestamp,
    featureSlug: input.featureSlug,
    promptPath,
    indexPath,
    results,
  };
  await writeIndexFile(runDir, run);
  return run;
}
