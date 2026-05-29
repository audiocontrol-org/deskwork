/**
 * plugins/dw-lifecycle/src/scope-discovery/audit-barrage/run-artifacts.ts
 *
 * Run-directory layout helpers for the audit-barrage verb.
 *
 * A barrage run lands at:
 *
 *   <repoRoot>/.dw-lifecycle/scope-discovery/audit-runs/
 *     <YYYYMMDDTHHMMSSZ>-<safe-feature-slug>/
 *       PROMPT.md            -- the rendered audit prompt (verbatim)
 *       INDEX.md             -- per-run manifest (timestamp, models,
 *                               per-model exit code / duration / bytes)
 *       <model>.md           -- captured stdout for each model
 *       stderr/
 *         <model>.txt        -- captured stderr for each model
 *
 * Functions here own the path-derivation + directory creation + manifest
 * writes. The orchestrator composes them; tests exercise them directly
 * over tmpdir fixtures.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BarrageRun, ModelRunResult } from './types.js';

/**
 * Encode a Date as the basic-format UTC stamp embedded in the run-dir
 * name: `YYYYMMDDTHHMMSSZ` with no separators. Basic format keeps the
 * stamp filesystem-safe across every OS we target without escaping.
 */
export function encodeTimestamp(timestamp: Date): string {
  const iso = timestamp.toISOString(); // 2026-05-28T12:34:56.789Z
  // Strip dashes from the date, colons from the time, and the
  // fractional-second portion. Result: 20260528T123456Z.
  const datePart = iso.slice(0, 10).replace(/-/g, '');
  const timePart = iso.slice(11, 19).replace(/:/g, '');
  return `${datePart}T${timePart}Z`;
}

/**
 * Compose the run-dir name from a timestamp + feature slug. The slug is
 * lightly sanitized via `safeModelName` (which also covers slug-shaped
 * inputs) to guard against operator-supplied slugs with shell-meaningful
 * characters.
 */
export function generateRunDirName(
  timestamp: Date,
  featureSlug: string,
): string {
  return `${encodeTimestamp(timestamp)}-${safeModelName(featureSlug)}`;
}

/**
 * Normalize a model (or feature) name into a safe filename stem:
 * alphanumerics and hyphens pass through; everything else collapses to
 * underscore. Prevents path-traversal characters (`/`, `..`) from
 * landing in the filename and keeps the stem grep-friendly.
 */
export function safeModelName(modelName: string): string {
  return modelName.replace(/[^a-zA-Z0-9-]/g, '_');
}

/**
 * Create `<parent>/<dirName>/` and `<parent>/<dirName>/stderr/`. The
 * stderr subdirectory is materialized eagerly so the spawn helper's
 * createWriteStream targets exist before the subprocess starts writing.
 *
 * Returns the absolute path to the run dir.
 */
export async function createRunDir(
  parentRunsDir: string,
  dirName: string,
): Promise<string> {
  const runDir = join(parentRunsDir, dirName);
  const stderrDir = join(runDir, 'stderr');
  await mkdir(stderrDir, { recursive: true });
  return runDir;
}

/**
 * Write the rendered prompt to `<runDir>/PROMPT.md` verbatim. Returns
 * the absolute path of the written file.
 */
export async function writePromptFile(
  runDir: string,
  prompt: string,
): Promise<string> {
  const promptPath = join(runDir, 'PROMPT.md');
  await writeFile(promptPath, prompt, 'utf8');
  return promptPath;
}

/**
 * Render the INDEX.md manifest body from a completed BarrageRun and
 * write it. The body lists the per-model outcomes in the same order
 * the models were configured, so triage walks have a stable layout.
 *
 * Returns the absolute path of the written file.
 */
export async function writeIndexFile(
  runDir: string,
  run: BarrageRun,
): Promise<string> {
  const indexPath = join(runDir, 'INDEX.md');
  const body = renderIndexBody(run);
  await writeFile(indexPath, body, 'utf8');
  return indexPath;
}

/**
 * Pure render of the INDEX.md body. Exported for tests so the
 * assertions can pin the manifest shape without re-reading the file.
 */
export function renderIndexBody(run: BarrageRun): string {
  const header = [
    '# Audit-barrage run',
    '',
    `- timestamp: ${run.timestamp}`,
    `- feature: ${run.featureSlug}`,
    `- run dir: ${run.runDir}`,
    `- prompt: PROMPT.md`,
    `- models attempted: ${run.results.length}`,
    '',
    '## Per-model results',
    '',
  ].join('\n');
  const rows = run.results.map(renderModelRow).join('\n');
  return `${header}${rows}\n`;
}

function renderModelRow(result: ModelRunResult): string {
  const lines: string[] = [];
  lines.push(`### ${result.name}`);
  lines.push('');
  lines.push(`- exit code: ${result.exitCode}`);
  lines.push(`- duration: ${result.durationMs} ms`);
  lines.push(`- stdout bytes: ${result.stdoutBytes}`);
  lines.push(`- stderr bytes: ${result.stderrBytes}`);
  lines.push(`- stdout path: ${result.stdoutPath}`);
  lines.push(`- stderr path: ${result.stderrPath}`);
  lines.push(`- timed out: ${result.timedOut ? 'yes' : 'no'}`);
  if (result.spawnError !== undefined) {
    lines.push(`- spawn error: ${result.spawnError}`);
  }
  lines.push('');
  return lines.join('\n');
}
