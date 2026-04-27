/**
 * Integration tests for the Phase 16d bird's-eye content view.
 *
 * Boots the studio app against a tmp project tree with:
 *   - a calendar (markdown) populated with hierarchical entries
 *   - the on-disk content shape (index.md / README.md, scrapbook items)
 * Then drives the routes via app.fetch and asserts on the rendered HTML.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type {
  CalendarEntry,
  EditorialCalendar,
} from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'writingcontrol.example',
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
    stage: 'Ideas',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

interface FixtureSpec {
  /** Calendar entries to write. */
  entries: CalendarEntry[];
  /** Map from absolute path under root to file content. */
  files: Record<string, string>;
}

function buildFixture(root: string, cfg: DeskworkConfig, spec: FixtureSpec) {
  // Calendar.
  const cal: EditorialCalendar = {
    entries: spec.entries,
    distributions: [],
  };
  const calendarPath = join(root, cfg.sites.wc.calendarPath);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(calendarPath, cal);
  // On-disk files.
  for (const [rel, content] of Object.entries(spec.files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('content view — top level', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-content-'));
    cfg = makeConfig();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 200 with site cards when the calendar has entries', async () => {
    buildFixture(root, cfg, {
      entries: [
        entry({ slug: 'whats-in-a-name', title: 'What', stage: 'Published' }),
        entry({ slug: 'the-outbound', title: 'The Outbound', stage: 'Drafting' }),
        entry({
          slug: 'the-outbound/characters',
          title: 'Characters',
          stage: 'Outlining',
        }),
      ],
      files: {},
    });
    app = createApp({ projectRoot: root, config: cfg });
    const r = await getHtml(app, '/dev/content');
    expect(r.status).toBe(200);
    // Phase 17: chrome was replaced by the er-folio cross-page strip.
    expect(r.html).toContain('class="er-folio"');
    expect(r.html).toContain('href="/dev/content"');
    expect(r.html).toContain('site-card__name">wc</h2>');
    expect(r.html).toContain('whats-in-a-name');
    expect(r.html).toContain('The Outbound');
    // Top-level meta counts reflect tracked entries.
    expect(r.html).toContain('TRACKED NODES');
    // Drilldown link rendered for each project.
    expect(r.html).toContain('href="/dev/content/wc/the-outbound"');
  });

  it('returns 200 with empty-state when the calendar has no entries', async () => {
    buildFixture(root, cfg, { entries: [], files: {} });
    app = createApp({ projectRoot: root, config: cfg });
    const r = await getHtml(app, '/dev/content');
    expect(r.status).toBe(200);
    expect(r.html).toContain('site-card__name">wc</h2>');
    expect(r.html).toContain('No tracked content yet');
  });
});

describe('content view — drilldown', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-content-drill-'));
    cfg = makeConfig();
    buildFixture(root, cfg, {
      entries: [
        entry({ slug: 'the-outbound', title: 'The Outbound', stage: 'Drafting' }),
        entry({
          slug: 'the-outbound/characters',
          title: 'Characters',
          stage: 'Outlining',
        }),
        entry({
          slug: 'the-outbound/characters/strivers',
          title: 'Strivers',
          stage: 'Drafting',
          description: 'Those who keep moving.',
        }),
      ],
      files: {
        // Phase 19a removed CalendarEntry.filePath. The detail panel
        // now reads `<slug>/index.md` for tracked entries. Fixture
        // uses index.md to exercise the post-19a code path.
        'src/content/projects/the-outbound/index.md':
          '---\ntitle: The Outbound\nstate: drafting\n---\n\n# The Outbound\n\nA novel about a one-way exodus.\n',
        'src/content/projects/the-outbound/characters/index.md':
          '---\ntitle: Characters\n---\n\n# Characters\n',
        'src/content/projects/the-outbound/characters/strivers/index.md':
          '---\ntitle: Strivers\nlogline: They run because nothing has ever stood still.\n---\n\n# Strivers\n\nThe strivers were the ones who kept moving.\n',
        'src/content/projects/the-outbound/characters/strivers/scrapbook/archetypes.md':
          '# archetypes notes\n',
        'src/content/projects/the-outbound/characters/strivers/scrapbook/working-quotes.txt':
          '"What you call drift is just gravity catching up."\n',
      },
    });
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders the project tree without a selection', async () => {
    const r = await getHtml(app, '/dev/content/wc/the-outbound');
    expect(r.status).toBe(200);
    expect(r.html).toContain('class="drilldown"');
    // Tree rows for each entry.
    expect(r.html).toContain('data-slug="the-outbound"');
    expect(r.html).toContain('data-slug="the-outbound/characters"');
    expect(r.html).toContain('data-slug="the-outbound/characters/strivers"');
    // Inline review links on every tracked row. Phase 19d: tracked
    // entries now carry stamped UUIDs (writeCalendar assigns ids on
    // first write), so the canonical URL is id-based. Match the UUID
    // shape rather than a hard-coded id (parseCalendar mints them).
    expect(r.html).toMatch(
      /href="\/dev\/editorial-review\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?site=wc"/,
    );
    // Inline scrapbook link on the row that has scrapbook items.
    expect(r.html).toContain(
      'href="/dev/scrapbook/wc/the-outbound/characters/strivers"',
    );
    // No detail panel populated — empty placeholder visible.
    expect(r.html).toContain('data-detail-empty');
  });

  it('renders the detail panel for a selected node', async () => {
    const r = await getHtml(
      app,
      '/dev/content/wc/the-outbound?node=the-outbound%2Fcharacters%2Fstrivers',
    );
    expect(r.status).toBe(200);
    // Detail panel populated.
    expect(r.html).toContain('data-node-detail');
    expect(r.html).toContain('data-slug="the-outbound/characters/strivers"');
    // Frontmatter fields rendered.
    expect(r.html).toContain('logline');
    expect(r.html).toContain('They run because nothing has ever stood still');
    // Body preview rendered.
    expect(r.html).toContain('strivers were the ones who kept moving');
    // Scrapbook items listed.
    expect(r.html).toContain('archetypes.md');
    expect(r.html).toContain('working-quotes.txt');
    expect(r.html).toContain('Open in Review');
    expect(r.html).toContain('Open Scrapbook');
    // Selected row carries the is-selected class.
    expect(r.html).toMatch(
      /tree-row[^"]*is-selected[^"]*"[^>]*data-slug="the-outbound\/characters\/strivers"/,
    );
  });

  it('returns 404 for an unknown site', async () => {
    const r = await getHtml(app, '/dev/content/missing/the-outbound');
    expect(r.status).toBe(404);
    expect(r.html).toContain('Not found');
    expect(r.html).toContain('unknown site: missing');
  });

  it('returns 404 for an unknown project on a known site', async () => {
    const r = await getHtml(app, '/dev/content/wc/no-such-project');
    expect(r.status).toBe(404);
    expect(r.html).toContain('unknown project: no-such-project on wc');
  });
});

describe('content view — scrapbook-file binary endpoint', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrap-file-'));
    cfg = makeConfig();
    const dir = join(root, 'src/content/projects/the-outbound/scrapbook');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'note.txt'), 'hello');
    writeFileSync(join(dir, 'data.json'), '{"a":1}');
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('serves text content with the right content-type', async () => {
    const res = await app.fetch(
      new Request(
        'http://x/api/dev/scrapbook-file?site=wc&path=the-outbound&name=note.txt',
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('hello');
  });

  it('serves JSON content with application/json', async () => {
    const res = await app.fetch(
      new Request(
        'http://x/api/dev/scrapbook-file?site=wc&path=the-outbound&name=data.json',
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.text()).toBe('{"a":1}');
  });

  it('returns 404 for a missing file', async () => {
    const res = await app.fetch(
      new Request(
        'http://x/api/dev/scrapbook-file?site=wc&path=the-outbound&name=missing.txt',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when required params are missing', async () => {
    const res = await app.fetch(
      new Request('http://x/api/dev/scrapbook-file?site=wc'),
    );
    expect(res.status).toBe(400);
  });
});
