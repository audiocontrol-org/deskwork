/**
 * Unit test for the studio's entry-uuid resolver. Given a project root
 * and an entry uuid, resolveEntry() returns the parsed sidecar plus the
 * on-disk artifact body for the entry.
 *
 * Post-T1 (Issue #222): resolveEntry always reads index.md regardless
 * of currentStage. Per-stage scrapbook files are frozen snapshots, not
 * the live document.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { resolveEntry } from '../src/lib/entry-resolver.ts';

describe('resolveEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, 'docs', 'my-article'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
        defaultSite: 'main',
      }),
    );
    const entry: Entry = {
      uuid,
      slug: 'my-article',
      title: 'My Article',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 3 },
      // Post-T1: artifactPath always points at index.md.
      artifactPath: 'docs/my-article/index.md',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    await writeFile(
      join(projectRoot, 'docs', 'my-article', 'index.md'),
      '---\ndeskwork:\n  id: ' + uuid + '\n  stage: Drafting\n  iteration: 3\n---\n\n# my draft\n'
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('resolves entry by uuid; returns sidecar + artifact body', async () => {
    const result = await resolveEntry(projectRoot, uuid);
    expect(result.entry.uuid).toBe(uuid);
    expect(result.entry.currentStage).toBe('Drafting');
    expect(result.artifactBody).toContain('# my draft');
    expect(result.artifactPath).toContain('index.md');
  });

  it('throws when uuid not found', async () => {
    await expect(
      resolveEntry(projectRoot, '550e8400-e29b-41d4-a716-446655440099')
    ).rejects.toThrow(/not found/);
  });

  // T1 (Issue #222): always read index.md regardless of currentStage.
  // The pre-T1 resolver routed to scrapbook/idea.md / plan.md /
  // outline.md based on stage. Post-T1: index.md is the document.
  it('reads index.md at Outlining stage (T1 — single document evolves)', async () => {
    const u2 = '550e8400-e29b-41d4-a716-446655440022';
    await mkdir(join(projectRoot, 'docs', 'outlining-doc', 'scrapbook'), {
      recursive: true,
    });
    const entry: Entry = {
      uuid: u2,
      slug: 'outlining-doc',
      title: 'Outlining Doc',
      keywords: [],
      source: 'manual',
      currentStage: 'Outlining',
      iterationByStage: { Outlining: 1 },
      artifactPath: 'docs/outlining-doc/index.md',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);

    await writeFile(
      join(projectRoot, 'docs', 'outlining-doc', 'index.md'),
      '# index body — read this',
    );
    // Decoy stale outline file — must NOT be read.
    await writeFile(
      join(projectRoot, 'docs', 'outlining-doc', 'scrapbook', 'outline.md'),
      'STALE outline — do not read',
    );

    const result = await resolveEntry(projectRoot, u2);
    expect(result.artifactBody).toContain('index body — read this');
    expect(result.artifactBody).not.toContain('STALE outline');
    expect(result.artifactPath).toContain('index.md');
  });

  // Legacy pre-doctor migration entries whose artifactPath still points
  // at scrapbook/outline.md should resolve to <dirname>/index.md.
  it('falls back gracefully for legacy per-stage artifactPath entries', async () => {
    const u3 = '550e8400-e29b-41d4-a716-446655440033';
    await mkdir(join(projectRoot, 'docs', 'legacy-doc', 'scrapbook'), {
      recursive: true,
    });
    const entry: Entry = {
      uuid: u3,
      slug: 'legacy-doc',
      title: 'Legacy Doc',
      keywords: [],
      source: 'manual',
      currentStage: 'Outlining',
      iterationByStage: { Outlining: 1 },
      // Legacy artifactPath shape — pre-doctor migration.
      artifactPath: 'docs/legacy-doc/scrapbook/outline.md',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    await writeFile(
      join(projectRoot, 'docs', 'legacy-doc', 'index.md'),
      '# canonical index body',
    );

    const result = await resolveEntry(projectRoot, u3);
    expect(result.artifactBody).toContain('canonical index body');
  });
});
