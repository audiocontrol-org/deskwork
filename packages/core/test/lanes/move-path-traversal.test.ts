/**
 * Path-traversal hardening test for `moveEntryToLane`
 * (AUDIT-20260530-64, cross-model: AUDIT-BARRAGE-codex-P6-1).
 *
 * Phase 39 (sites→lanes retirement): a lane carries no `contentDir`, so
 * the move no longer relocates files — it's a metadata change only. The
 * former per-lane boundary checks dissolve; the protection that remains
 * is the SCHEMA-level `EntrySchema.artifactPath` refinement, which
 * rejects absolute paths and `..` segments at the `readSidecar`
 * boundary. The move surfaces those schema errors before any filesystem
 * dereference. The slug-derived-scrapbook boundary attack no longer
 * applies to move (the scrapbook is not touched).
 *
 * The negative regression test confirms a canonical artifactPath
 * (`pre-migration-entry.md`) survives the move with its location
 * unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveEntryToLane } from '../../src/lanes/operations/move.ts';
import { lanesDir } from '../../src/lanes/loader.ts';
import { sidecarsDir } from '../../src/sidecar/paths.ts';
import { EntrySchema, type Entry } from '../../src/schema/entry.ts';

const SAMPLE_UUID = '22222222-2222-4222-8222-222222222222';

function writeSidecarRaw(projectRoot: string, entry: object): void {
  const dir = sidecarsDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  // We intentionally bypass writeSidecar here so the malformed
  // payload reaches disk — readSidecar (which moveEntryToLane uses)
  // is the consumer the path-boundary check must protect.
  writeFileSync(
    join(dir, `${(entry as { uuid: string }).uuid}.json`),
    JSON.stringify(entry, null, 2),
    'utf8',
  );
}

function writeLane(projectRoot: string, id: string, payload: unknown): void {
  const dir = lanesDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function makeEntry(overrides: Partial<Entry> & { artifactPath?: string } = {}): Entry {
  const now = new Date().toISOString();
  const base: Entry = {
    uuid: SAMPLE_UUID,
    slug: 'pre-migration-entry',
    title: 'Pre-migration entry',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: {},
    createdAt: now,
    updatedAt: now,
    lane: 'default',
  };
  return { ...base, ...overrides };
}

function seedLanes(projectRoot: string): { docsDir: string } {
  // Phase 39: lanes carry no contentDir. Both lanes are pure logical
  // groupings; the entry's artifact lives wherever its (project-root-
  // relative) `artifactPath` points.
  const docsDir = join(projectRoot, 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeLane(projectRoot, 'default', {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
  });
  writeLane(projectRoot, 'qa', {
    id: 'qa',
    name: 'QA',
    pipelineTemplate: 'editorial',
  });
  return { docsDir };
}

describe('moveEntryToLane — path-traversal hardening (AUDIT-20260530-64)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-move-traversal-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses a sidecar whose artifactPath escapes the project root via "../"', async () => {
    seedLanes(projectRoot);

    // The schema-layer rejection (EntrySchema.artifactPath refinement)
    // is the gate: `readSidecar` rejects the malformed value before any
    // filesystem dereference. Phase 39 has no per-lane boundary check —
    // the schema refinement is the single, authoritative protection.
    writeSidecarRaw(
      projectRoot,
      makeEntry({ artifactPath: '../outside.md' }),
    );

    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/artifactPath/);
    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/path-traversal blocked|must not contain `\.\.`/);
  });

  it('refuses a sidecar whose artifactPath is absolute', async () => {
    seedLanes(projectRoot);

    // Absolute paths are rejected by the schema refinement before any
    // filesystem dereference.
    writeSidecarRaw(
      projectRoot,
      makeEntry({ artifactPath: '/etc/passwd' }),
    );

    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/artifactPath/);
  });

  it('regression: canonical artifactPath survives the move with its location unchanged', async () => {
    const { docsDir } = seedLanes(projectRoot);

    const artifactRel = 'docs/pre-migration-entry.md';
    writeFileSync(join(docsDir, 'pre-migration-entry.md'), '# entry body\n', 'utf8');

    writeSidecarRaw(
      projectRoot,
      makeEntry({ artifactPath: artifactRel }),
    );

    const result = await moveEntryToLane(projectRoot, {
      uuid: SAMPLE_UUID,
      toLane: 'qa',
    });
    expect(result.fromLane).toBe('default');
    expect(result.toLane).toBe('qa');
    // Phase 39: the move does NOT relocate — from/to are identical.
    expect(result.fromArtifactPath).toBe(join(projectRoot, artifactRel));
    expect(result.toArtifactPath).toBe(join(projectRoot, artifactRel));
  });
});

describe('EntrySchema.artifactPath — path-traversal hardening (AUDIT-20260530-64)', () => {
  function validEntry(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const now = new Date().toISOString();
    return {
      uuid: '33333333-3333-4333-8333-333333333333',
      slug: 'sample-entry',
      title: 'Sample Entry',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('rejects an artifactPath containing parent-directory segments', () => {
    const result = EntrySchema.safeParse(
      validEntry({ artifactPath: '../outside.md' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.includes('artifactPath'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects an artifactPath that is an absolute path', () => {
    const result = EntrySchema.safeParse(
      validEntry({ artifactPath: '/etc/passwd' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an artifactPath with a `..` segment buried mid-path', () => {
    const result = EntrySchema.safeParse(
      validEntry({ artifactPath: 'docs/../../etc/passwd' }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a canonical relative artifactPath', () => {
    const result = EntrySchema.safeParse(
      validEntry({ artifactPath: 'pre-migration-entry.md' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a canonical artifactPath nested in a subdirectory', () => {
    const result = EntrySchema.safeParse(
      validEntry({ artifactPath: 'drafts/2026/post.md' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts an entry with no artifactPath field (migration-window compat)', () => {
    const result = EntrySchema.safeParse(validEntry());
    expect(result.success).toBe(true);
  });
});
