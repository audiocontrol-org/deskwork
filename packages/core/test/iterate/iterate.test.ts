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

  async function setupEntry(stage: Entry['currentStage']): Promise<Entry> {
    const entry: Entry = {
      uuid, slug, title: 'My Article', keywords: [], source: 'manual',
      currentStage: stage,
      iterationByStage: stage === 'Ideas' ? {} : { Ideas: 1 },
      // T1 (#222): artifactPath always points at index.md; iterate
      // reads/writes index.md regardless of stage.
      artifactPath: `docs/${slug}/index.md`,
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  it('iterates even when on-disk content is unchanged (operator may be pinning marginalia or off-file work)', async () => {
    await setupEntry('Ideas');
    const indexPath = join(projectRoot, 'docs', slug, 'index.md');
    const body = `---\ndeskwork:\n  id: ${uuid}\n---\n\n# unchanged\n`;
    await writeFile(indexPath, body);

    // Iterate is the operator's explicit "pin this version" decision.
    // The core helper records what was asked; the orchestrating skill
    // (`/deskwork:iterate`) decides whether file edits are needed first.
    const r1 = await iterateEntry(projectRoot, { uuid });
    expect(r1.version).toBe(1);

    const r2 = await iterateEntry(projectRoot, { uuid });
    expect(r2.version).toBe(2);
  });

  it('produces v1 from iteration 0 (no prior iteration)', async () => {
    await setupEntry('Ideas');
    const indexPath = join(projectRoot, 'docs', slug, 'index.md');
    await writeFile(indexPath, `---\ndeskwork:\n  id: ${uuid}\n  stage: Ideas\n  iteration: 0\n---\n\n# my article idea\n`);

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
      join(projectRoot, 'docs', slug, 'index.md'),
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

  // T1 (#222): even at Outlining, iterate reads index.md — NOT the
  // legacy `scrapbook/outline.md`. Per Option B, the document under
  // review is index.md regardless of stage.
  it('reads index.md at Outlining stage (T1 — single document evolves)', async () => {
    await setupEntry('Outlining');
    const indexPath = join(projectRoot, 'docs', slug, 'index.md');
    await writeFile(indexPath, `---\ndeskwork:\n  id: ${uuid}\n---\n\n# index body — outlining stage\n`);
    // Decoy file in scrapbook should NOT be read.
    await writeFile(
      join(projectRoot, 'docs', slug, 'scrapbook', 'outline.md'),
      'STALE outline content; iterate must NOT read this',
    );

    await iterateEntry(projectRoot, { uuid });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const iter = events.find((e) => e.kind === 'iteration');
    expect(iter).toBeDefined();
    if (iter && iter.kind === 'iteration') {
      expect(iter.markdown).toContain('index body — outlining stage');
      expect(iter.markdown).not.toContain('STALE outline content');
    }
  });

  // Legacy artifactPath shape support: an entry whose sidecar still
  // points at scrapbook/outline.md (pre-doctor migration) should
  // resolve to <dirname>/index.md, not the legacy file.
  it('resolves index.md from a legacy per-stage artifactPath', async () => {
    const entry: Entry = {
      uuid, slug, title: 'My Article', keywords: [], source: 'manual',
      currentStage: 'Outlining',
      iterationByStage: { Ideas: 1, Planned: 1 },
      // Legacy sidecar shape — pre-T1 entries still carry this.
      artifactPath: `docs/${slug}/scrapbook/outline.md`,
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    await writeFile(
      join(projectRoot, 'docs', slug, 'index.md'),
      '# index body — read this one\n',
    );

    await iterateEntry(projectRoot, { uuid });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const iter = events.find((e) => e.kind === 'iteration');
    expect(iter).toBeDefined();
    if (iter && iter.kind === 'iteration') {
      expect(iter.markdown).toContain('index body — read this one');
    }
  });
});
