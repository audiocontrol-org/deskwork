/**
 * Phase 19d follow-up — dashboard `entryBodyStateOf` must consult the
 * content index for entries whose on-disk path doesn't match the
 * slug-template.
 *
 * Writingcontrol-shape regression: a calendar entry has slug
 * `the-outbound` while its file lives at
 * `<contentDir>/projects/the-outbound/index.md` and the binding is via
 * frontmatter `id:`. The slug-template would resolve to
 * `<contentDir>/the-outbound/index.md` — a path that doesn't exist —
 * and `bodyState` would return `'missing'` even though the file is
 * present and has body prose. The fix threads the per-request content
 * index getter through `renderDashboard` so `entryBodyStateOf` can
 * call `findEntryFile` first, falling back to the slug-template only
 * when no id binding exists.
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
import { createApp } from '../src/server.ts';

const WC_ENTRY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'writingcontrol.example',
        // Slug-template path for slug `the-outbound` resolves to
        // `<contentDir>/the-outbound/index.md`. The writingcontrol
        // shape stores the file under an extra `projects/` segment,
        // so the actual file path is
        // `<contentDir>/projects/the-outbound/index.md` — divergent
        // from the slug-template. Only an id-driven content-index
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

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('studio dashboard — body-state via content index', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-dash-bodystate-'));
    cfg = makeConfig();
    mkdirSync(join(root, 'docs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports body as written for a writingcontrol-shape entry bound by frontmatter id', async () => {
    // Calendar holds the entry with a stable id. The slug doesn't bake
    // the file's on-disk path; the binding is via frontmatter.
    const cal: EditorialCalendar = {
      entries: [
        entry({
          id: WC_ENTRY_ID,
          slug: 'the-outbound',
          title: 'The Outbound',
          stage: 'Drafting',
        }),
      ],
      distributions: [],
    };
    writeCalendar(join(root, cfg.sites.wc.calendarPath), cal);

    // File lives at `<contentDir>/projects/the-outbound/index.md` —
    // NOT at the slug-template path. Frontmatter `id:` binds it.
    const filePath = join(
      root,
      cfg.sites.wc.contentDir,
      'projects',
      'the-outbound',
      'index.md',
    );
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(
      filePath,
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

    app = createApp({ projectRoot: root, config: cfg });
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // The dashboard renders one file-state dot per blog entry. With
    // exactly one entry in this fixture, the dot's CSS class
    // (`er-file-<bodystate>`) reflects the entry's bodyState directly.
    // Pre-fix: this would be `er-file-missing` (slug-template path
    // doesn't exist on disk). Post-fix: the index lookup finds the
    // bound file and `bodyState` reports `'written'`.
    expect(r.html).not.toMatch(/er-file-missing/);
    expect(r.html).toMatch(/er-file-written/);
  });
});
