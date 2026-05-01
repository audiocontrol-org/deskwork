import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iterateEntry } from '@/iterate/iterate';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import type { Entry } from '@/schema/entry';

describe('iterateEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const slug = 'my-article';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, 'docs', slug, 'scrapbook'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntry(stage: Entry['currentStage']): Promise<Entry> {
    const entry: Entry = {
      uuid, slug, title: 'My Article', keywords: [], source: 'manual',
      currentStage: stage,
      iterationByStage: stage === 'Ideas' ? {} : { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  it('produces v1 from iteration 0 (no prior iteration)', async () => {
    await setupEntry('Ideas');
    const ideaPath = join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md');
    await writeFile(ideaPath, `---\ndeskwork:\n  id: ${uuid}\n  stage: Ideas\n  iteration: 0\n---\n\n# my article idea\n`);

    const result = await iterateEntry(projectRoot, { uuid });
    expect(result.version).toBe(1);
    expect(result.stage).toBe('Ideas');

    const updated = await readSidecar(projectRoot, uuid);
    expect(updated.iterationByStage.Ideas).toBe(1);
    expect(updated.reviewState).toBe('in-review');
  });

  it('produces v(N+1) from existing iteration N', async () => {
    const entry = await setupEntry('Drafting');
    entry.iterationByStage = { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5 };
    await writeSidecar(projectRoot, entry);

    const draftPath = join(projectRoot, 'docs', slug, 'index.md');
    await writeFile(draftPath, `---\ndeskwork:\n  id: ${uuid}\n  stage: Drafting\n  iteration: 5\n---\n\n# draft body v6 content\n`);

    const result = await iterateEntry(projectRoot, { uuid });
    expect(result.version).toBe(6);
    const updated = await readSidecar(projectRoot, uuid);
    expect(updated.iterationByStage.Drafting).toBe(6);
  });

  it('emits an iteration journal event', async () => {
    await setupEntry('Ideas');
    await writeFile(
      join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md'),
      `---\ndeskwork:\n  id: ${uuid}\n  stage: Ideas\n  iteration: 0\n---\n\n# my idea\n`
    );

    await iterateEntry(projectRoot, { uuid });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const iterationEvents = events.filter(e => e.kind === 'iteration');
    expect(iterationEvents).toHaveLength(1);
    if (iterationEvents[0].kind === 'iteration') {
      expect(iterationEvents[0].markdown).toContain('# my idea');
    }
  });

  it('refuses to iterate a Published entry', async () => {
    const entry = await setupEntry('Published');
    entry.iterationByStage = { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5, Final: 1, Published: 1 };
    await writeSidecar(projectRoot, entry);
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '# x\n');

    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/published.*frozen/i);
  });
});
