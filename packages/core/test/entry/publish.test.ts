import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishEntry } from '@/entry/publish';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import type { Entry } from '@/schema/entry';

describe('publishEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntry(overrides: Partial<Entry>): Promise<Entry> {
    const entry: Entry = {
      uuid,
      slug: 'foo',
      title: 'Foo',
      keywords: [],
      source: 'manual',
      currentStage: 'Final',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...overrides,
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  it('publishes a Final entry: sets currentStage and datePublished', async () => {
    await setupEntry({ currentStage: 'Final' });
    const result = await publishEntry(projectRoot, {
      uuid,
      requireArtifact: false,
    });
    expect(result.toStage).toBe('Published');
    expect(result.fromStage).toBe('Final');
    expect(result.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Published');
    expect(sidecar.datePublished).toBe(result.datePublished);
  });

  it('honors --date by stamping the requested date', async () => {
    await setupEntry({ currentStage: 'Final' });
    const result = await publishEntry(projectRoot, {
      uuid,
      date: '2025-12-31',
      requireArtifact: false,
    });
    expect(result.datePublished).toBe('2025-12-31T00:00:00.000Z');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.datePublished).toBe('2025-12-31T00:00:00.000Z');
  });

  it('refuses to publish from non-Final stages', async () => {
    for (const stage of ['Ideas', 'Planned', 'Outlining', 'Drafting'] as const) {
      const u = `550e8400-e29b-41d4-a716-44665544000${stage.length % 9}`;
      const e: Entry = {
        uuid: u,
        slug: `s-${stage}`,
        title: `T-${stage}`,
        keywords: [],
        source: 'manual',
        currentStage: stage,
        iterationByStage: {},
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      };
      await writeSidecar(projectRoot, e);
      await expect(
        publishEntry(projectRoot, { uuid: u, requireArtifact: false }),
      ).rejects.toThrow(/cannot publish from stage/i);
    }
  });

  it('refuses to publish an already-Published entry', async () => {
    await setupEntry({ currentStage: 'Published' });
    await expect(
      publishEntry(projectRoot, { uuid, requireArtifact: false }),
    ).rejects.toThrow(/already Published/i);
  });

  it('refuses Blocked / Cancelled (induct first)', async () => {
    for (const stage of ['Blocked', 'Cancelled'] as const) {
      const u = `550e8400-e29b-41d4-a716-44665544001${stage.length}`;
      const e: Entry = {
        uuid: u,
        slug: `s-${stage}`,
        title: `T-${stage}`,
        keywords: [],
        source: 'manual',
        currentStage: stage,
        priorStage: 'Drafting',
        iterationByStage: {},
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      };
      await writeSidecar(projectRoot, e);
      await expect(
        publishEntry(projectRoot, { uuid: u, requireArtifact: false }),
      ).rejects.toThrow(/induct/i);
    }
  });

  it('refuses to publish when artifact is missing', async () => {
    await setupEntry({
      currentStage: 'Final',
      artifactPath: 'docs/missing/index.md',
    });
    await expect(publishEntry(projectRoot, { uuid })).rejects.toThrow(
      /artifact missing/i,
    );
  });

  it('passes artifact check when the file exists', async () => {
    await setupEntry({ currentStage: 'Final', artifactPath: 'docs/foo/index.md' });
    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# Foo\n');
    const result = await publishEntry(projectRoot, { uuid });
    expect(result.toStage).toBe('Published');
    expect(result.artifactPath).toBe(join(projectRoot, 'docs/foo/index.md'));
  });

  it('emits a stage-transition journal event', async () => {
    await setupEntry({ currentStage: 'Final' });
    await publishEntry(projectRoot, { uuid, requireArtifact: false });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const transition = events.find((e) => e.kind === 'stage-transition');
    expect(transition).toBeDefined();
    if (transition && transition.kind === 'stage-transition') {
      expect(transition.from).toBe('Final');
      expect(transition.to).toBe('Published');
    }
  });

  it('regenerates calendar.md after publish (#148)', async () => {
    await setupEntry({ currentStage: 'Final', slug: 'my-final', title: 'My Final' });
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      '# Editorial Calendar\n\n## Final\n\n*pre-existing stale*\n',
    );
    await publishEntry(projectRoot, { uuid, requireArtifact: false });
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    expect(md).not.toMatch(/pre-existing stale/);
    const publishedSection = md.match(/## Published[\s\S]*?(?=^## )/m)?.[0] ?? '';
    expect(publishedSection).toContain(uuid);
  });
});
