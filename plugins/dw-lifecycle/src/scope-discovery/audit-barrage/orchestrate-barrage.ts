/**
 * plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts
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
 * the runs root (`.dw-lifecycle/scope-discovery/audit-runs/`). Tests
 * override the root via `runDirOverride`.
 */

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
import type { BarrageInput, BarrageRun, ModelRunResult } from './types.js';

const DEFAULT_RUNS_ROOT = '.dw-lifecycle/scope-discovery/audit-runs';

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
