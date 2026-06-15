/**
 * Phase 39d — resolution reads `entry.artifactPath` only; a missing
 * `artifactPath` THROWS (no `<contentDir>/<slug>/index.md` phantom
 * fallback).
 *
 * Per the sites→lanes retirement spec §"Resolution" + the project's
 * "no fallbacks — throw" rule: when an entry lacks `artifactPath`,
 * `iterateEntry` must NOT silently resolve a guessed
 * `<contentDir>/<slug>/index.md` location. It throws a descriptive
 * error pointing the operator at `deskwork doctor --fix` to backfill
 * the path (the migration owns backfill, 39b).
 *
 * Before 39d, `resolveIndexPath` fell back to
 * `join(getContentDir(...), slug, 'index.md')` for path-less entries —
 * a guess that re-introduced the location-as-key disease. This test
 * locks in the throw so the fallback cannot creep back.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iterateEntry } from '@/iterate/iterate';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

describe('iterateEntry — missing artifactPath throws (no phantom fallback)', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-4466554409d4';
  const slug = 'path-less';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-39d-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
        defaultSite: 'main',
      }),
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('throws a doctor --fix message when the sidecar lacks artifactPath', async () => {
    const entry: Entry = {
      uuid,
      slug,
      title: 'Path Less',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
      // artifactPath INTENTIONALLY OMITTED — the legacy pre-migration shape.
      createdAt: '2026-06-02T10:00:00.000Z',
      updatedAt: '2026-06-02T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);

    // The error must name the missing field AND point at the doctor fix.
    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(
      /artifactPath.*doctor --fix/is,
    );
  });

  it('never silently resolves a phantom <contentDir>/<slug>/index.md', async () => {
    const entry: Entry = {
      uuid,
      slug,
      title: 'Path Less',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
      createdAt: '2026-06-02T10:00:00.000Z',
      updatedAt: '2026-06-02T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);

    // Plant a file at the OLD phantom heuristic location. If the
    // resolver still fell back to <contentDir>/<slug>/index.md it would
    // read this and silently succeed. With the throw it must NOT.
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    await writeFile(
      join(projectRoot, 'docs', slug, 'index.md'),
      '# phantom — iterate must NOT read this\n',
    );

    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow();
  });
});
