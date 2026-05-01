/**
 * Unit test for the studio's entry-uuid resolver. Given a project root
 * and an entry uuid, resolveEntry() returns the parsed sidecar plus the
 * on-disk artifact body for the entry's current stage. Studio handlers
 * use this to render any view that needs the live document content
 * paired with its sidecar metadata.
 *
 * Pipeline-redesign Task 33 — Phase 6 entry resolver.
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
});
