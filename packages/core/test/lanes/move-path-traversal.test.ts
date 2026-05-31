/**
 * Path-traversal hardening test for `moveEntryToLane`
 * (AUDIT-20260530-64, cross-model: AUDIT-BARRAGE-codex-P6-1).
 *
 * Surface: `packages/core/src/lanes/operations/move.ts:210-231` (the
 * `join(sourceContentDir, sidecar.artifactPath)` and
 * `join(targetContentDir, sidecar.artifactPath)` call sites), plus the
 * sibling per-entry scrapbook path built from `sidecar.slug`.
 *
 * Pre-fix:
 *   - The move builds `<contentDir>/<sidecar.artifactPath>` without
 *     verifying the resolved path stays inside `<contentDir>`. A
 *     malformed sidecar with `artifactPath: "../outside.md"` makes
 *     the move read + write files outside the lane content tree.
 *   - `EntrySchema.artifactPath` is unconstrained — a raw
 *     `z.string().optional()` — so the malformed value parses cleanly
 *     and flows straight into the path build.
 *
 * Post-fix:
 *   - The schema rejects `artifactPath` strings that are absolute or
 *     contain `..` segments — defense-in-depth at the read boundary.
 *   - `moveEntryToLane` re-checks the resolved source AND target
 *     paths for BOTH the artifact and the per-entry scrapbook
 *     directory, and refuses any path that escapes its contentDir
 *     with an error naming the entry slug + the offending path +
 *     which boundary was violated.
 *
 * The negative regression test confirms a canonical artifactPath
 * (`pre-migration-entry.md` under the lane's contentDir) still
 * relocates cleanly.
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

function seedLanes(projectRoot: string): {
  sourceContentDir: string;
  targetContentDir: string;
} {
  // Use NESTED contentDirs so a `../` traversal from each lane
  // resolves to a DIFFERENT location — the realistic attack shape.
  // With sibling contentDirs at the project root (`docs/` and
  // `qa-content/`), `<sourceContentDir>/../outside.md` and
  // `<targetContentDir>/../outside.md` collide at the same file and
  // the move's "target artifact already exists" check accidentally
  // shields the boundary. Nesting one level keeps the traversal
  // attack-shaped.
  const sourceContentDir = join(projectRoot, 'src-lane', 'docs');
  mkdirSync(sourceContentDir, { recursive: true });
  const targetContentDir = join(projectRoot, 'tgt-lane', 'qa-content');
  mkdirSync(targetContentDir, { recursive: true });
  writeLane(projectRoot, 'default', {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    contentDir: 'src-lane/docs',
  });
  writeLane(projectRoot, 'qa', {
    id: 'qa',
    name: 'QA',
    pipelineTemplate: 'editorial',
    contentDir: 'tgt-lane/qa-content',
  });
  return { sourceContentDir, targetContentDir };
}

describe('moveEntryToLane — path-traversal hardening (AUDIT-20260530-64)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-move-traversal-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses a sidecar whose artifactPath escapes the lane contentDir via "../"', async () => {
    const { sourceContentDir } = seedLanes(projectRoot);

    // Seed the would-be-source so a hypothetical move that bypassed
    // the schema rejection would still have a file to operate on.
    // The schema-layer rejection is what blocks this attack post-fix,
    // but the seed makes the test honest — it documents that even if
    // schema validation were skipped, the move-layer boundary check
    // would still refuse.
    writeFileSync(
      join(sourceContentDir, '..', 'outside.md'),
      '# outside the source lane\n',
      'utf8',
    );

    writeSidecarRaw(
      projectRoot,
      makeEntry({ artifactPath: '../outside.md' }),
    );

    // Post-fix the schema layer (EntrySchema.artifactPath refinement)
    // is the first gate, so the move surfaces the schema error
    // (`sidecar schema invalid …`) rather than the move-layer
    // boundary error. The schema error message names the offending
    // field, which is the right operator-facing signal.
    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/artifactPath/);
    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/path-traversal blocked|must not contain `\.\.`/);
  });

  it('refuses a sidecar whose artifactPath is absolute', async () => {
    seedLanes(projectRoot);

    // Absolute paths that don't begin with the lane contentDir are
    // outside the lane by definition. Use `/etc/passwd` (a path the
    // test definitely doesn't write to) — schema rejection fires
    // before any filesystem dereference.
    writeSidecarRaw(
      projectRoot,
      makeEntry({ artifactPath: '/etc/passwd' }),
    );

    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/artifactPath/);
    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/relative to the lane contentDir/);
  });

  it('refuses a sidecar whose slug escapes the lane contentDir via "../" (scrapbook boundary)', async () => {
    const { sourceContentDir } = seedLanes(projectRoot);

    // The slug field carries `../escape` — when joined with
    // <contentDir>/<slug>/scrapbook it resolves above the lane.
    // Seed a scrapbook directory at the would-be-traversal target so
    // existsSync(sourceScrapbookDir) returns true and the move would
    // proceed if the boundary check were absent.
    const traversalScrapbook = join(sourceContentDir, '..', 'escape', 'scrapbook');
    mkdirSync(traversalScrapbook, { recursive: true });
    writeFileSync(
      join(traversalScrapbook, 'note.md'),
      '# scrapbook note\n',
      'utf8',
    );

    // Provide a real artifactPath inside the contentDir so the
    // artifact branch isn't what trips the failure — we want the
    // scrapbook boundary check to fire.
    const artifactRel = 'safe-artifact.md';
    writeFileSync(join(sourceContentDir, artifactRel), '# safe body\n', 'utf8');

    writeSidecarRaw(projectRoot, {
      // Slug is the carrier; everything else is canonical. We bypass
      // makeEntry()'s spread because EntrySchema's slug field accepts
      // arbitrary non-empty strings (the entry-naming charset binding
      // is out of scope for this AUDIT — the boundary check must
      // catch the traversal at the move layer regardless of what the
      // schema admits).
      uuid: SAMPLE_UUID,
      slug: '../escape',
      title: 'Slug traversal',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lane: 'default',
      artifactPath: artifactRel,
    });

    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/escape/i);
  });

  it('regression: canonical artifactPath under the lane contentDir still relocates', async () => {
    const { sourceContentDir, targetContentDir } = seedLanes(projectRoot);

    const artifactRel = 'pre-migration-entry.md';
    writeFileSync(join(sourceContentDir, artifactRel), '# entry body\n', 'utf8');

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
    expect(result.fromArtifactPath).toBe(join(sourceContentDir, artifactRel));
    expect(result.toArtifactPath).toBe(join(targetContentDir, artifactRel));
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
