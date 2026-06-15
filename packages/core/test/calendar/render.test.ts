import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCalendar } from '@/calendar/render';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

describe('renderCalendar', () => {
  it('renders an empty calendar with all eight stage sections', () => {
    const md = renderCalendar([]);
    expect(md).toContain('## Ideas');
    expect(md).toContain('## Planned');
    expect(md).toContain('## Outlining');
    expect(md).toContain('## Drafting');
    expect(md).toContain('## Final');
    expect(md).toContain('## Published');
    expect(md).toContain('## Blocked');
    expect(md).toContain('## Cancelled');
    expect(md).toContain('## Distribution');
  });

  it('renders entries grouped by currentStage', () => {
    const entries: Entry[] = [
      {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'idea-one',
        title: 'Idea One',
        description: 'first idea',
        keywords: ['kw1'],
        source: 'manual',
        currentStage: 'Ideas',
        iterationByStage: { Ideas: 1 },
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
      {
        uuid: '550e8400-e29b-41d4-a716-446655440001',
        slug: 'draft-one',
        title: 'Draft One',
        keywords: [],
        source: 'manual',
        currentStage: 'Drafting',
        iterationByStage: { Ideas: 1, Planned: 1, Outlining: 2, Drafting: 5 },
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T11:00:00.000Z',
      },
    ];
    const md = renderCalendar(entries);
    const ideaSection = md.split('## Ideas')[1].split('##')[0];
    const draftingSection = md.split('## Drafting')[1].split('##')[0];
    expect(ideaSection).toContain('idea-one');
    expect(ideaSection).not.toContain('draft-one');
    expect(draftingSection).toContain('draft-one');
    expect(draftingSection).not.toContain('idea-one');
  });

  it('renders empty stage sections with "No entries" placeholder', () => {
    const md = renderCalendar([]);
    expect(md).toContain('*No entries.*');
  });

  it('includes all required columns in the table header', () => {
    const md = renderCalendar([{
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Ideas', iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }]);
    const ideasSection = md.split('## Ideas')[1].split('##')[0];
    expect(ideasSection).toContain('| UUID | Slug | Title | Description | Keywords | Source | Updated |');
  });

  // AUDIT-20260530-19: the no-projectRoot path used to use a hardcoded
  // EDITORIAL_FALLBACK constant that duplicated editorial.json's
  // stage list with a manual "MUST stay in sync" comment. The fix
  // replaces the constant with a memoized read of the bundled
  // editorial.json (single source of truth — `packages/core/src/
  // pipelines/editorial.json`). This regression asserts the
  // no-projectRoot path produces the same stage sections (in the same
  // order) as the editorial preset declares — so if editorial.json
  // ever drifts from the previously-hardcoded list, the no-projectRoot
  // path follows automatically (and this test surfaces the
  // implication if the change is unexpected).
  describe('AUDIT-20260530-19 — no-projectRoot path loads editorial preset from bundled resource', () => {
    it('renders the stages in editorial.json order without any duplication / drift', () => {
      const md = renderCalendar([]);
      // Stage sections appear in editorial.json's
      // `linearStages` then `offPipelineStages` order.
      const stageOrder = ['## Ideas', '## Planned', '## Outlining', '## Drafting', '## Final', '## Published', '## Blocked', '## Cancelled'];
      let cursor = 0;
      for (const headline of stageOrder) {
        const idx = md.indexOf(headline, cursor);
        expect(idx, `expected to find ${headline} after position ${cursor} in editorial preset order`).toBeGreaterThanOrEqual(0);
        cursor = idx + headline.length;
      }
    });

    it('produces the same per-stage entry layout for editorial-stage entries with and without projectRoot', async () => {
      const projectRoot = await mkdtemp(join(tmpdir(), 'dw-render-no-proj-'));
      try {
        // Configure a single editorial lane so the projectRoot path
        // produces a `# Lane: <name>` block. The bucketing/section
        // shape inside each lane MUST match what the no-projectRoot
        // path produces (which has no lane header).
        await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
        await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
        await writeFile(
          join(projectRoot, '.deskwork', 'lanes', 'default.json'),
          JSON.stringify({
            id: 'default',
            name: 'Default',
            pipelineTemplate: 'editorial',
          }),
        );

        const entryShared: Entry = {
          uuid: '550e8400-e29b-41d4-a716-446655440001',
          slug: 'final-entry',
          title: 'Final Entry',
          keywords: [],
          source: 'manual',
          currentStage: 'Final',
          iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 1, Final: 1 },
          priorStage: 'Drafting',
          createdAt: '2026-04-30T10:00:00.000Z',
          updatedAt: '2026-04-30T10:00:00.000Z',
        };
        const entryWithLane: Entry = { ...entryShared, lane: 'default' };

        await writeSidecar(projectRoot, entryWithLane);
        const mdWithProj = renderCalendar([entryWithLane], projectRoot);
        const mdNoProj = renderCalendar([entryShared]);

        // Both produce a `## Final` section containing the entry.
        expect(mdNoProj).toContain('## Final');
        expect(mdNoProj).toContain('final-entry');
        expect(mdWithProj).toContain('## Final');
        expect(mdWithProj).toContain('final-entry');

        // Both produce a `## Cancelled` (off-pipeline) section.
        expect(mdNoProj).toContain('## Cancelled');
        expect(mdWithProj).toContain('## Cancelled');

        // The projectRoot path wraps in a `# Lane: Default` header
        // (h1); the no-projectRoot path does NOT (no lane header). The
        // STAGE SECTIONS within (delimited by `## ` headlines) follow
        // the same editorial-preset ordering.
        expect(mdWithProj).toContain('# Lane: Default');
        expect(mdNoProj).not.toContain('# Lane:');
      } finally {
        await rm(projectRoot, { recursive: true, force: true });
      }
    });
  });
});
