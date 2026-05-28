/**
 * deskwork CLI `lane move` — cross-lane entry relocation.
 *
 * Phase 6 Task 6.1 (graphical-entries). Move is the most complex
 * verb: it touches both lane configs (target lane resolution) AND
 * entries (sidecar mutation + artifact relocation + scrapbook
 * relocation). Tests cover the happy paths, the stage-defaulting
 * rule, and the refusal shapes.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  assertDeskworkBinPresent,
  destroyProject,
  lane,
  makeProject,
  readSidecarJson,
  writeLaneJson,
  writeSidecar,
  writeVisualPipeline,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => {
  project = makeProject();
  writeVisualPipeline(project);
  writeLaneJson(project, 'default', {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    contentDir: 'docs',
  });
  writeLaneJson(project, 'mockups', {
    id: 'mockups',
    name: 'Mockups',
    pipelineTemplate: 'visual',
    contentDir: 'src/mockups',
  });
});
afterEach(() => { destroyProject(project); });

interface SeedOptions {
  readonly uuid: string;
  readonly slug: string;
  readonly artifactPath: string;
  readonly artifactBody?: string;
  readonly scrapbookContents?: Record<string, string>;
  readonly iterationByStage?: Record<string, number>;
}

function seedEntryWithArtifact(opts: SeedOptions): void {
  writeSidecar(project, opts.uuid, opts.slug, {
    lane: 'default',
    currentStage: 'Drafting',
    artifactPath: opts.artifactPath,
    ...(opts.iterationByStage !== undefined && {
      iterationByStage: opts.iterationByStage,
    }),
  });
  const artifactAbs = join(project, 'docs', opts.artifactPath);
  mkdirSync(dirname(artifactAbs), { recursive: true });
  writeFileSync(artifactAbs, opts.artifactBody ?? '# body\n', 'utf-8');

  if (opts.scrapbookContents !== undefined) {
    const scrapbookDir = join(project, 'docs', opts.slug, 'scrapbook');
    mkdirSync(scrapbookDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.scrapbookContents)) {
      writeFileSync(join(scrapbookDir, name), content, 'utf-8');
    }
  }
}

describe('deskwork lane move', () => {
  it('relocates the artifact file to the target lane contentDir', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440010';
    seedEntryWithArtifact({
      uuid,
      slug: 'a-mockup',
      artifactPath: 'a-mockup.md',
      artifactBody: '# my mockup\n',
    });

    const res = lane(project, 'move', 'a-mockup', '--to', 'mockups');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    expect(existsSync(join(project, 'docs', 'a-mockup.md'))).toBe(false);
    expect(
      readFileSync(join(project, 'src', 'mockups', 'a-mockup.md'), 'utf-8'),
    ).toBe('# my mockup\n');

    const sidecar = readSidecarJson(project, uuid);
    expect(sidecar['lane']).toBe('mockups');
    expect(sidecar['currentStage']).toBe('Sketch');
  });

  it('relocates the per-entry scrapbook directory when present', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440011';
    seedEntryWithArtifact({
      uuid,
      slug: 'with-scrapbook',
      artifactPath: 'with-scrapbook.md',
      scrapbookContents: { 'note.md': 'a note\n' },
    });

    const res = lane(project, 'move', 'with-scrapbook', '--to', 'mockups');
    expect(res.code).toBe(0);

    expect(
      existsSync(join(project, 'docs', 'with-scrapbook', 'scrapbook')),
    ).toBe(false);
    expect(
      readFileSync(
        join(
          project,
          'src',
          'mockups',
          'with-scrapbook',
          'scrapbook',
          'note.md',
        ),
        'utf-8',
      ),
    ).toBe('a note\n');
  });

  it('preserves iterationByStage verbatim', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440012';
    seedEntryWithArtifact({
      uuid,
      slug: 'iter-preserve',
      artifactPath: 'iter-preserve.md',
      iterationByStage: { Drafting: 3, Outlining: 1 },
    });
    const res = lane(project, 'move', 'iter-preserve', '--to', 'mockups');
    expect(res.code).toBe(0);

    const sidecar = readSidecarJson(project, uuid) as {
      iterationByStage: Record<string, number>;
    };
    expect(sidecar.iterationByStage).toEqual({ Drafting: 3, Outlining: 1 });
  });

  it("defaults --target-stage to the target lane's first linearStage", () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440013';
    seedEntryWithArtifact({
      uuid,
      slug: 'default-stage',
      artifactPath: 'default-stage.md',
    });
    const res = lane(project, 'move', 'default-stage', '--to', 'mockups');
    expect(res.code).toBe(0);
    expect(readSidecarJson(project, uuid)['currentStage']).toBe('Sketch');
  });

  it('honors an explicit --target-stage when in the target template', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440014';
    seedEntryWithArtifact({
      uuid,
      slug: 'explicit-stage',
      artifactPath: 'explicit-stage.md',
    });
    const res = lane(
      project,
      'move', 'explicit-stage',
      '--to', 'mockups',
      '--target-stage', 'Refine',
    );
    expect(res.code).toBe(0);
    expect(readSidecarJson(project, uuid)['currentStage']).toBe('Refine');
  });

  it('refuses when --target-stage is not in the target template', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440015';
    seedEntryWithArtifact({
      uuid,
      slug: 'bad-stage',
      artifactPath: 'bad-stage.md',
    });
    const res = lane(
      project,
      'move', 'bad-stage',
      '--to', 'mockups',
      '--target-stage', 'Drafting',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not in target lane "mockups"/);
    expect(readSidecarJson(project, uuid)['lane']).toBe('default');
    expect(existsSync(join(project, 'docs', 'bad-stage.md'))).toBe(true);
  });

  it('refuses when source lane and target lane are the same', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440016';
    seedEntryWithArtifact({
      uuid,
      slug: 'same-lane',
      artifactPath: 'same-lane.md',
    });
    const res = lane(project, 'move', 'same-lane', '--to', 'default');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already in lane "default"/);
  });

  it('refuses when the source artifact does not exist on disk', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440017';
    writeSidecar(project, uuid, 'missing-art', {
      lane: 'default',
      currentStage: 'Drafting',
      artifactPath: 'missing-art.md',
    });
    const res = lane(project, 'move', 'missing-art', '--to', 'mockups');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/source artifact does not exist/);
  });

  it('refuses when --to is missing', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440018';
    seedEntryWithArtifact({
      uuid,
      slug: 'no-target',
      artifactPath: 'no-target.md',
    });
    const res = lane(project, 'move', 'no-target');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Missing required flag --to/);
  });

  it('refuses to move into an archived lane', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440019';
    seedEntryWithArtifact({
      uuid,
      slug: 'to-archived',
      artifactPath: 'to-archived.md',
    });
    lane(project, 'archive', 'mockups');
    const res = lane(project, 'move', 'to-archived', '--to', 'mockups');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/archived lane "mockups"/);
  });
});

describe('deskwork lane move — sidecar-write failure rollback', () => {
  it('rolls back artifact + scrapbook when writeSidecar fails', async () => {
    // Skip on platforms / users where chmod 0o555 doesn't prevent
    // writes (e.g. running as root — happens in some CI sandboxes).
    // The test pre-flights a write into the read-only dir before
    // asserting; if the pre-flight succeeds, the test framework
    // can't simulate the failure mode and skips.
    const { chmodSync } = await import('node:fs');

    const uuid = '550e8400-e29b-41d4-a716-446655440100';
    seedEntryWithArtifact({
      uuid,
      slug: 'rollback-me',
      artifactPath: 'rollback-me.md',
      artifactBody: '# pre-move\n',
      scrapbookContents: { 'note.md': 'pre-move scrapbook\n' },
    });

    const entriesDir = join(project, '.deskwork', 'entries');
    chmodSync(entriesDir, 0o555);
    try {
      // Pre-flight: try writing into the locked dir. If it succeeds,
      // we can't simulate the failure (running as root); bail.
      try {
        writeFileSync(join(entriesDir, '.preflight'), 'x', 'utf-8');
        chmodSync(entriesDir, 0o755);
        return; // skip
      } catch { /* good — writes are blocked */ }

      const res = lane(project, 'move', 'rollback-me', '--to', 'mockups');
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/sidecar write failed/);

      // Artifact restored at source path; target empty.
      expect(existsSync(join(project, 'docs', 'rollback-me.md'))).toBe(true);
      expect(existsSync(join(project, 'src', 'mockups', 'rollback-me.md'))).toBe(false);

      // Scrapbook restored at source path; target empty.
      expect(
        existsSync(join(project, 'docs', 'rollback-me', 'scrapbook', 'note.md')),
      ).toBe(true);
      expect(
        existsSync(
          join(project, 'src', 'mockups', 'rollback-me', 'scrapbook', 'note.md'),
        ),
      ).toBe(false);
    } finally {
      chmodSync(entriesDir, 0o755);
    }
  });
});
