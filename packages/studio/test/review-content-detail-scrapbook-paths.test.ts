/**
 * Phase 19c+ regression — three slug-template path lookups in the
 * studio still listed scrapbook items at the slug-derived directory
 * instead of the index-resolved location:
 *
 *   1. Review-page scrapbook drawer
 *   2. Review-page inline-text loader (drives the scrap-row preview)
 *   3. Content-view detail panel scrapbook list + inline text
 *
 * Writingcontrol-shape regression: a calendar entry has slug
 * `the-outbound` while its file lives at
 * `<contentDir>/projects/the-outbound/index.md` (frontmatter `id:`
 * binding). The slug template would resolve to
 * `<contentDir>/the-outbound/scrapbook/` — a directory that doesn't
 * exist — and these surfaces would render the empty-state even though
 * scrapbook items live at `<contentDir>/projects/the-outbound/scrapbook/`.
 *
 * Each test asserts the on-disk items render. Pre-fix all three
 * surfaces show the empty drawer / empty list / no inline preview.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type {
  CalendarEntry,
  EditorialCalendar,
} from '@deskwork/core/types';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import { createApp } from '../src/server.ts';

const WC_ENTRY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'writingcontrol.example',
        // `the-outbound` slug template would resolve to
        // `<contentDir>/the-outbound/index.md`, but writingcontrol
        // stores the file under an extra `projects/` segment, so the
        // actual file path is
        // `<contentDir>/projects/the-outbound/index.md` — divergent
        // from the slug template. Only an id-driven content-index
        // lookup will find it.
        contentDir: 'src/content/projects',
        calendarPath: 'docs/cal.md',
        blogFilenameTemplate: '{slug}/index.md',
      },
    },
    defaultSite: 'wc',
  };
}

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'placeholder',
    title: 'Placeholder',
    description: '',
    stage: 'Drafting',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

function seedFixture(root: string, cfg: DeskworkConfig): void {
  const cal: EditorialCalendar = {
    entries: [
      entry({
        id: WC_ENTRY_ID,
        slug: 'the-outbound',
        title: 'The Outbound',
        stage: 'Review',
      }),
    ],
    distributions: [],
  };
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(join(root, cfg.sites.wc.calendarPath), cal);

  // The on-disk file lives at the writingcontrol-shape path with the
  // frontmatter id binding the calendar entry.
  const fileDir = join(
    root,
    cfg.sites.wc.contentDir,
    'projects',
    'the-outbound',
  );
  mkdirSync(fileDir, { recursive: true });
  writeFileSync(
    join(fileDir, 'index.md'),
    [
      '---',
      `id: ${WC_ENTRY_ID}`,
      'title: The Outbound',
      '---',
      '',
      '# The Outbound',
      '',
      'A novel about a one-way exodus across a slow continent.',
      '',
    ].join('\n'),
    'utf-8',
  );

  // Scrapbook items live next to the file — at
  // <contentDir>/projects/the-outbound/scrapbook/, NOT at the slug-
  // template path <contentDir>/the-outbound/scrapbook/.
  const sbDir = join(fileDir, 'scrapbook');
  mkdirSync(sbDir, { recursive: true });
  writeFileSync(join(sbDir, 'archetypes.md'), '# notes\n');
  writeFileSync(
    join(sbDir, 'working-quotes.txt'),
    [
      '"The strivers were the ones who kept moving."',
      '— interview, S., 2024-11-09',
      '',
    ].join('\n'),
    'utf-8',
  );

  // Seed a longform workflow keyed by entryId so the id-canonical
  // review URL renders.
  createWorkflow(root, cfg, {
    entryId: WC_ENTRY_ID,
    site: 'wc',
    slug: 'the-outbound',
    contentKind: 'longform',
    initialMarkdown:
      '---\ntitle: The Outbound\ndescription: A dispatch.\n---\n\n# The Outbound\n\nProse here.\n',
  });
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('review + content-detail — scrapbook paths via content index (#34 follow-up)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-review-cd-scrap-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('review drawer renders scrapbook items for a writingcontrol-shape entry', async () => {
    const r = await getHtml(
      app,
      `/dev/editorial-review/${WC_ENTRY_ID}?site=wc`,
    );
    expect(r.status).toBe(200);

    // Drawer chrome present + reports the right count.
    expect(r.html).toContain('data-scrapbook-drawer');
    expect(r.html).toContain('§ Scrapbook');
    expect(r.html).toContain('2 items');

    // Item filenames appear in the drawer body.
    expect(r.html).toContain('archetypes.md');
    expect(r.html).toContain('working-quotes.txt');

    // Pre-fix: drawer would render the empty-state because the
    // slug-template path doesn't exist. Post-fix: empty-state absent.
    expect(r.html).not.toContain('no scrapbook items');
  });

  it('review inline-text loader previews a .txt scrapbook item from the index-resolved dir', async () => {
    const r = await getHtml(
      app,
      `/dev/editorial-review/${WC_ENTRY_ID}?site=wc`,
    );
    expect(r.status).toBe(200);

    // The shared scrapbook-item renderer wraps text-kind previews in
    // <pre class="scrap__inline-preview">. The body of the preview
    // comes from the inline-text loader — pre-fix it would silently
    // return null because the file isn't at the slug-template path.
    expect(r.html).toContain('scrap__inline-preview');
    expect(r.html).toContain('strivers were the ones who kept moving');
  });

  it('content-detail panel renders scrapbook items + inline text for a writingcontrol-shape node', async () => {
    // Drilldown URL — site `wc`, project root `projects`, selected
    // node `projects/the-outbound`. The detail panel populates when
    // the `?node=` query param matches a tracked entry's path.
    const r = await getHtml(
      app,
      '/dev/content/wc/projects?node=projects%2Fthe-outbound',
    );
    expect(r.status).toBe(200);

    // Detail panel selected.
    expect(r.html).toContain('data-node-detail');
    expect(r.html).toContain('data-slug="projects/the-outbound"');

    // Scrapbook items rendered from the index-resolved dir. Pre-fix
    // these would be missing — the detail panel was reading from the
    // slug-template `<contentDir>/projects/the-outbound/scrapbook/`
    // (which actually IS where the items live for an organizational
    // node, but the chip count + inline preview both went through the
    // slug-only `makeInlineTextLoaderForNode` that joined contentDir
    // with `node.path` directly. After the refactor, this surface uses
    // `resolveNodeScrapbookDir` which prefers `scrapbookDirForEntry`
    // when an id binding exists — exercising that path here).
    expect(r.html).toContain('archetypes.md');
    expect(r.html).toContain('working-quotes.txt');

    // Inline text preview present + carries the right body bytes.
    expect(r.html).toContain('scrap__inline-preview');
    expect(r.html).toContain('strivers were the ones who kept moving');
  });
});
