/**
 * Rename-migration sidecar I/O for the pipeline update verb.
 *
 * Phase 6 Task 6.2 (graphical-entries), extracted from
 * `operations/update.ts` during the review-followup pass to keep the
 * update module under the 500-line cap.
 *
 * The sidecar lives at
 * `<projectRoot>/.deskwork/pipelines/migrations/<pipelineId>.json` and
 * records every `--rename-stage` operation as a `{from, to, at}`
 * triple. Downstream consumers (doctor — Phase 6 Task 6.5) read this
 * file to identify entries whose `currentStage` still references the
 * pre-rename label and offer remediation.
 *
 * Layout note (Phase 6 Task 6.2 review fix #1): the file lives in a
 * `migrations/` SIBLING directory of the per-template overrides, not
 * co-located with the templates. Co-locating broke `pipeline list`'s
 * JSON enumerator after any `--rename-stage` call — it tried to load
 * the migration file as a pipeline template; Zod parse failed. The
 * migrations directory is invisible to the enumerator because the
 * enumerator filters by `*.json` and `migrations/` is a directory.
 *
 * Concurrency: assumes a single operator at-rest. Concurrent rename
 * operations on the same pipeline id race; the second writer wins.
 * The PRD documents deskwork as operator-driven; no file-locking
 * without explicit operator approval. (Reviewer finding #5, decline-
 * with-reasoning.)
 *
 * Malformed-file handling (Task 0.32, closes AUDIT-20260530-56): when
 * the existing file fails JSON parse or schema validation, the
 * function THROWS — naming the path AND the underlying parse /
 * validation message. The prior shape (Task 6.2 review fix #4) moved
 * the file aside to `<id>.malformed-<iso>.json` and reset the audit
 * trail to empty with only a stderr warning. That was still a silent
 * fallback by the project's no-fallback rule: an operator who misses
 * the warning line loses the audit trail the SKILL.md promises is
 * append-only. Throwing is louder; the operator MUST acknowledge the
 * corruption before any more renames can land. Recovery: inspect the
 * file, repair or delete it, then retry the rename.
 *
 * Atomic write (Task 0.32, closes AUDIT-20260530-56): the sidecar is
 * written via the tmp+rename pattern that
 * `packages/core/src/pipelines/operations/commit.ts` and
 * `packages/core/src/lanes/operations/commit.ts` already use — a
 * crash mid-write leaves the prior sidecar intact (and possibly a
 * `.tmp` file, which the next attempt cleans up on rename failure)
 * rather than truncating the operator's audit trail.
 *
 * Ordering note (Task 0.32, closes AUDIT-20260530-56): the caller
 * `pipelines/operations/update.ts:updatePipeline` runs
 * `commitPipelineTemplate` FIRST, then this function. Rationale: an
 * operator-visible rename on disk paired with a missing audit-trail
 * entry is recoverable (re-run the rename — the actual stage names
 * are already what the operator asked for; the second rename throws
 * "from not found" which is the correct diagnostic, OR run doctor to
 * regenerate the audit trail from journal events). The reverse order
 * (migration record first, then commit) would record a rename that
 * never happened — silent drift between the audit trail and the
 * actual template state, which is unrecoverable without operator
 * forensics. The current order is the safer of the two failure
 * modes.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { z } from 'zod';
import {
  pipelineMigrationPath,
  pipelineMigrationsDir,
} from '../loader.ts';

/**
 * Sidecar migration file schema. Co-located with the only writer. The
 * doctor-side reader (Phase 6 Task 6.5) imports this same schema for
 * the read side.
 */
export const RenameMigrationSchema = z.object({
  pipelineId: z.string().min(1),
  renames: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    at: z.string().datetime(),
  })),
});

export type RenameMigration = z.infer<typeof RenameMigrationSchema>;

/**
 * Append a single `{from, to, at}` entry to the migration sidecar.
 * Creates the file (and the `migrations/` directory) on the first
 * rename; appends to the existing `renames` array on subsequent
 * renames.
 *
 * Throws on JSON parse failure or schema validation failure of the
 * existing sidecar — the operator must repair the file before more
 * renames can be recorded. See module docblock for the no-fallback
 * rationale.
 */
export function appendRenameMigration(
  projectRoot: string,
  pipelineId: string,
  from: string,
  to: string,
): void {
  const path = pipelineMigrationPath(projectRoot, pipelineId);
  mkdirSync(pipelineMigrationsDir(projectRoot), { recursive: true });
  const payload: RenameMigration = existsSync(path)
    ? readExistingMigration(path)
    : { pipelineId, renames: [] };
  payload.renames.push({ from, to, at: new Date().toISOString() });
  atomicWriteMigration(path, payload);
}

/**
 * Load an existing migration sidecar and validate it. Throws —
 * naming the path AND the underlying parse / validation message — on
 * either JSON parse failure or schema validation failure. The
 * project's no-fallback rule means the operator sees the corruption
 * loudly rather than losing the audit trail behind a stderr line.
 */
function readExistingMigration(path: string): RenameMigration {
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot append to rename-migration sidecar at "${path}": JSON `
      + `parse failed (${message}). The audit trail at this path is `
      + `corrupt; inspect, repair, or delete the file before retrying `
      + `the rename. The previous implementation silently moved the `
      + `file aside and reset the audit trail — that behavior was `
      + `removed in Task 0.32 (AUDIT-20260530-56).`,
    );
  }
  const validated = RenameMigrationSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Cannot append to rename-migration sidecar at "${path}": schema `
      + `validation failed:\n${validated.error.message}\nThe audit `
      + `trail at this path is invalid; inspect, repair, or delete the `
      + `file before retrying the rename.`,
    );
  }
  return validated.data;
}

/**
 * Write the migration payload to disk via tmp+rename, matching the
 * precedent in `packages/core/src/pipelines/operations/commit.ts` and
 * `packages/core/src/lanes/operations/commit.ts`. The tmp file is
 * unlinked on rename failure so a doomed write doesn't leak a `.tmp`
 * artifact next to the sidecar.
 */
function atomicWriteMigration(
  path: string,
  payload: RenameMigration,
): void {
  const tmpPath = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify(payload, null, 2) + '\n';
  try {
    writeFileSync(tmpPath, body, 'utf8');
    renameSync(tmpPath, path);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* tmp absent — ignore */ }
    throw err;
  }
}
