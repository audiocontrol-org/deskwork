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
 * Malformed-file handling (reviewer fix #4): when the existing file
 * fails JSON parse or schema validation, we MOVE it aside to
 * `<id>.malformed-<iso-timestamp>.json` before writing the new
 * payload. The operator can recover the prior audit trail from the
 * moved file; we emit a stderr warning identifying the path. The
 * original Phase 6 Task 6.2 shape silently reset to empty and
 * overwrote — losing the audit trail without any operator-visible
 * signal.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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
 */
export function appendRenameMigration(
  projectRoot: string,
  pipelineId: string,
  from: string,
  to: string,
): void {
  const path = pipelineMigrationPath(projectRoot, pipelineId);
  mkdirSync(pipelineMigrationsDir(projectRoot), { recursive: true });
  let payload: RenameMigration;
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8');
    let parsed: unknown = null;
    let parseFailed = false;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parseFailed = true;
    }
    const validated = parseFailed
      ? null
      : RenameMigrationSchema.safeParse(parsed);
    if (validated !== null && validated.success) {
      payload = validated.data;
    } else {
      const movedTo = relocateMalformedMigration(path);
      process.stderr.write(
        `warn: rename-migration file at ${path} was malformed; `
        + `moved aside to ${movedTo} before starting a fresh audit trail.\n`,
      );
      payload = { pipelineId, renames: [] };
    }
  } else {
    payload = { pipelineId, renames: [] };
  }
  payload.renames.push({ from, to, at: new Date().toISOString() });
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

/**
 * Move a malformed rename-migration file out of the way so a fresh
 * audit trail can start without overwriting the operator's prior
 * data. Destination: same directory, name suffixed with
 * `.malformed-<iso-timestamp>.json`. ISO colons replaced with `-` so
 * the path is filesystem-friendly across platforms.
 */
function relocateMalformedMigration(originalPath: string): string {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  const moved = `${originalPath.replace(/\.json$/, '')}.malformed-${stamp}.json`;
  renameSync(originalPath, moved);
  return moved;
}
