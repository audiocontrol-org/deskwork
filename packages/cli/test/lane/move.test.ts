/**
 * deskwork CLI `lane move` — cross-lane entry relocation.
 *
 * Phase 6 Task 6.1 (graphical-entries); reshaped by Phase 39
 * (sites→lanes retirement). A lane carries no `contentDir` — location
 * is a property of the ENTRY (`entry.artifactPath`). So `lane move` is a
 * METADATA change only: it updates the sidecar's `lane` + `currentStage`
 * and does NOT relocate the artifact file or its scrapbook (both stay
 * put). These tests assert the metadata mutation + stage-defaulting +
 * the refusal shapes, AND that the artifact does NOT move.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
  // Phase 39: lanes carry no contentDir. Their only location-adjacent
  // metadata is the optional add-time scaffoldDefaults.
  writeLaneJson(project, 'default', {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    scaffoldDefaults: { markdown: 'docs' },
  });
  writeLaneJson(project, 'mockups', {
    id: 'mockups',
    name: 'Mockups',
    pipelineTemplate: 'visual',
    scaffoldDefaults: { markdown: 'src/mockups' },
  });
});
afterEach(() => { destroyProject(project); });

interface SeedOptions {
  readonly uuid: string;
  readonly slug: string;
  /** Entry-owned artifact path, relative to the PROJECT root (Phase 39). */
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
  // The artifact lives at <projectRoot>/<artifactPath> — resolution is
  // entry-owned and project-root-relative, not lane-relative.
  const artifactAbs = join(project, opts.artifactPath);
  mkdirSync(dirname(artifactAbs), { recursive: true });
  writeFileSync(artifactAbs, opts.artifactBody ?? '# body\n', 'utf-8');

  if (opts.scrapbookContents !== undefined) {
    const scrapbookDir = join(dirname(artifactAbs), 'scrapbook');
    mkdirSync(scrapbookDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.scrapbookContents)) {
      writeFileSync(join(scrapbookDir, name), content, 'utf-8');
    }
  }
}

describe('deskwork lane move', () => {
  it('updates the sidecar lane + stage WITHOUT relocating the artifact', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440010';
    seedEntryWithArtifact({
      uuid,
      slug: 'a-mockup',
      artifactPath: 'docs/a-mockup.md',
      artifactBody: '# my mockup\n',
    });

    const res = lane(project, 'move', 'a-mockup', '--to', 'mockups');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    // The artifact STAYS at its entry-owned path — the lane has no
    // contentDir to relocate into (Phase 39).
    expect(
      readFileSync(join(project, 'docs', 'a-mockup.md'), 'utf-8'),
    ).toBe('# my mockup\n');

    const sidecar = readSidecarJson(project, uuid);
    expect(sidecar['lane']).toBe('mockups');
    expect(sidecar['currentStage']).toBe('Sketch');
    // artifactPath is unchanged — location is the entry's property.
    expect(sidecar['artifactPath']).toBe('docs/a-mockup.md');
  });

  it('leaves the per-entry scrapbook directory in place', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440011';
    seedEntryWithArtifact({
      uuid,
      slug: 'with-scrapbook',
      artifactPath: 'docs/with-scrapbook.md',
      scrapbookContents: { 'note.md': 'a note\n' },
    });

    const res = lane(project, 'move', 'with-scrapbook', '--to', 'mockups');
    expect(res.code).toBe(0);

    // Scrapbook stays put next to the (unmoved) artifact.
    expect(
      readFileSync(join(project, 'docs', 'scrapbook', 'note.md'), 'utf-8'),
    ).toBe('a note\n');
  });

  it('preserves iterationByStage verbatim', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440012';
    seedEntryWithArtifact({
      uuid,
      slug: 'iter-preserve',
      artifactPath: 'docs/iter-preserve.md',
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
      artifactPath: 'docs/default-stage.md',
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
      artifactPath: 'docs/explicit-stage.md',
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
      artifactPath: 'docs/bad-stage.md',
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
      artifactPath: 'docs/same-lane.md',
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
      artifactPath: 'docs/missing-art.md',
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
      artifactPath: 'docs/no-target.md',
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
      artifactPath: 'docs/to-archived.md',
    });
    lane(project, 'archive', 'mockups');
    const res = lane(project, 'move', 'to-archived', '--to', 'mockups');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/archived lane "mockups"/);
  });
});

/**
 * Sidecar-write failure (AUDIT-20260530-59).
 *
 * Phase 39: the move no longer relocates files, so there is no
 * filesystem rollback to verify — the move's only mutation is the
 * sidecar write. This test confirms a `writeSidecar` failure surfaces
 * as a thrown error AND that the artifact/scrapbook (which were never
 * moved) remain in place. The mock targets the same source file move.ts
 * imports so vitest's module-graph dedup routes both consumers through
 * the mocked module.
 */
vi.mock('../../../core/src/sidecar/write.ts', async () => {
  const actual = await vi.importActual<
    typeof import('../../../core/src/sidecar/write.ts')
  >('../../../core/src/sidecar/write.ts');
  return {
    ...actual,
    writeSidecar: vi.fn(),
  };
});

describe('deskwork lane move — sidecar-write failure', () => {
  it('surfaces a thrown error and leaves the (unmoved) artifact + scrapbook in place', async () => {
    const { writeSidecar: mockedWriteSidecar } = await import(
      '../../../core/src/sidecar/write.ts'
    );
    const { moveEntryToLane } = await import(
      '../../../core/src/lanes/operations/move.ts'
    );

    const writeMock = vi.mocked(mockedWriteSidecar);
    writeMock.mockRejectedValueOnce(new Error('mocked sidecar write failure'));

    const uuid = '550e8400-e29b-41d4-a716-446655440100';
    seedEntryWithArtifact({
      uuid,
      slug: 'rollback-me',
      artifactPath: 'docs/rollback-me.md',
      artifactBody: '# pre-move\n',
      scrapbookContents: { 'note.md': 'pre-move scrapbook\n' },
    });

    const sidecarPathAbs = join(
      project,
      '.deskwork',
      'entries',
      `${uuid}.json`,
    );
    const sidecarBefore = readFileSync(sidecarPathAbs, 'utf-8');

    await expect(
      moveEntryToLane(project, { uuid, toLane: 'mockups' }),
    ).rejects.toThrow(/mocked sidecar write failure/);

    expect(writeMock).toHaveBeenCalledTimes(1);

    // Artifact + scrapbook were never relocated (Phase 39) — they stay
    // at their entry-owned path regardless of the write failure.
    expect(
      readFileSync(join(project, 'docs', 'rollback-me.md'), 'utf-8'),
    ).toBe('# pre-move\n');
    expect(
      readFileSync(join(project, 'docs', 'scrapbook', 'note.md'), 'utf-8'),
    ).toBe('pre-move scrapbook\n');

    // Sidecar untouched: write was mocked to throw before disk contact.
    expect(readFileSync(sidecarPathAbs, 'utf-8')).toBe(sidecarBefore);
  });
});
