/**
 * Regression tests for AUDIT-20260530-56 (cross-model:
 * AUDIT-BARRAGE-claude-P6-1) — `appendRenameMigration` is non-atomic and
 * silently discards a corrupt renames file, contradicting the append-only
 * audit-trail promise documented in `plugins/deskwork/skills/pipeline/SKILL.md`.
 *
 * Three pinned contracts:
 *
 * 1. **Atomic write.** The sidecar must be written via tmp+rename, matching
 *    the precedent set by `packages/core/src/pipelines/operations/commit.ts`
 *    and `packages/core/src/lanes/operations/commit.ts`. The test asserts
 *    that no `<id>.json.<pid>.tmp` file is left behind after a successful
 *    append, and that the post-append file is well-formed JSON (the rename
 *    half of tmp+rename happened).
 *
 * 2. **Corrupt JSON refusal.** When the on-disk sidecar fails `JSON.parse`,
 *    the function MUST throw an error naming the path AND the parse failure
 *    message. The prior shape silently quarantined the bad file and reset
 *    the audit trail to empty — that's the "silent fallback" the project's
 *    no-fallback rule prohibits. The operator must see the corruption,
 *    not have the rename history erased behind a stderr line they may
 *    miss.
 *
 * 3. **Schema-invalid refusal.** When the on-disk sidecar parses as JSON
 *    but fails `RenameMigrationSchema.safeParse`, the function MUST throw
 *    naming the path AND the schema validation message. Same rationale:
 *    a sidecar with a wrong shape is operator-visible state worth
 *    investigating, not background noise to overwrite.
 *
 * A fourth test pins the happy-path contract still holds — a sequence of
 * appends grows the `renames` array as expected.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  pipelineMigrationPath,
  pipelineMigrationsDir,
} from '../../src/pipelines/loader.ts';
import {
  RenameMigrationSchema,
  appendRenameMigration,
} from '../../src/pipelines/operations/rename-migration.ts';

describe('appendRenameMigration atomic + corruption-refusal (AUDIT-20260530-56)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-rename-mig-atomic-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writes the sidecar atomically (no leftover .tmp file; final JSON is well-formed)', () => {
    appendRenameMigration(projectRoot, 'my-blog', 'Drafting', 'Writing');

    const migrationsDir = pipelineMigrationsDir(projectRoot);
    const entries = readdirSync(migrationsDir);

    // The directory contains exactly one file — the finished sidecar.
    // Any `<id>.json.<pid>.tmp` leftover would indicate the rename half
    // of the tmp+rename pattern failed (or was never invoked, i.e. the
    // direct-writeFileSync regression returned).
    expect(entries).toEqual(['my-blog.json']);

    const sidecarPath = pipelineMigrationPath(projectRoot, 'my-blog');
    const raw = readFileSync(sidecarPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const validated = RenameMigrationSchema.safeParse(parsed);
    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.pipelineId).toBe('my-blog');
      expect(validated.data.renames).toHaveLength(1);
      expect(validated.data.renames[0]?.from).toBe('Drafting');
      expect(validated.data.renames[0]?.to).toBe('Writing');
    }
  });

  it('throws on a corrupt JSON sidecar, naming the path AND the parse error', () => {
    mkdirSync(pipelineMigrationsDir(projectRoot), { recursive: true });
    const sidecarPath = pipelineMigrationPath(projectRoot, 'my-blog');
    // Seed the sidecar with non-JSON contents. The pre-fix shape would
    // silently move this aside and reset the audit trail to empty; the
    // post-fix shape MUST throw with both the path and the parse error.
    writeFileSync(sidecarPath, '{not valid json,,,', 'utf8');

    expect(() =>
      appendRenameMigration(projectRoot, 'my-blog', 'Drafting', 'Writing'),
    ).toThrow(/my-blog\.json/);
    expect(() =>
      appendRenameMigration(projectRoot, 'my-blog', 'Drafting', 'Writing'),
    ).toThrow(/JSON|parse/i);

    // Confirm the original bad file is still on disk (we did NOT overwrite
    // it). Operator can recover, inspect, repair manually.
    expect(readFileSync(sidecarPath, 'utf8')).toBe('{not valid json,,,');
  });

  it('throws on a schema-invalid sidecar, naming the path AND the validation error', () => {
    mkdirSync(pipelineMigrationsDir(projectRoot), { recursive: true });
    const sidecarPath = pipelineMigrationPath(projectRoot, 'my-blog');
    // Valid JSON, wrong shape — missing `pipelineId`, missing `renames`.
    writeFileSync(
      sidecarPath,
      JSON.stringify({ totally: 'wrong', shape: true }, null, 2),
      'utf8',
    );

    expect(() =>
      appendRenameMigration(projectRoot, 'my-blog', 'Drafting', 'Writing'),
    ).toThrow(/my-blog\.json/);
    expect(() =>
      appendRenameMigration(projectRoot, 'my-blog', 'Drafting', 'Writing'),
    ).toThrow(/schema|valid|invalid/i);

    // Confirm the original wrong-shape file is still on disk untouched.
    const raw = readFileSync(sidecarPath, 'utf8');
    expect(JSON.parse(raw)).toEqual({ totally: 'wrong', shape: true });
  });

  it('appends to an existing well-formed sidecar without losing prior entries', () => {
    appendRenameMigration(projectRoot, 'my-blog', 'Drafting', 'Writing');
    appendRenameMigration(projectRoot, 'my-blog', 'Review', 'Editing');
    appendRenameMigration(projectRoot, 'my-blog', 'Live', 'Published');

    const sidecarPath = pipelineMigrationPath(projectRoot, 'my-blog');
    const raw = readFileSync(sidecarPath, 'utf8');
    const validated = RenameMigrationSchema.safeParse(JSON.parse(raw));
    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.renames).toHaveLength(3);
      expect(validated.data.renames.map((r) => r.from)).toEqual([
        'Drafting',
        'Review',
        'Live',
      ]);
      expect(validated.data.renames.map((r) => r.to)).toEqual([
        'Writing',
        'Editing',
        'Published',
      ]);
    }
  });
});
