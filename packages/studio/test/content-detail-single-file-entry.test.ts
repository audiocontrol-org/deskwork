/**
 * Issue #103 regression — content-detail panel false-empty for single-file
 * entries.
 *
 * Failure shape (pre-fix): the right-panel render at
 * `/dev/content/<site>/<root>?node=<path>` reported "No frontmatter
 * detected" and "No body content yet" for tracked entries whose on-disk
 * file is a peer `.md` (not a `<path>/index.md` directory). The
 * `loadDetailRender` helper resolved the file via
 * `findOrganizationalIndex(contentDir, node.path)` — which only checks
 * for `<path>/index.md` / `<path>/README.md` — and never consulted
 * `node.filePath`, the id-bound on-disk file already attached to the
 * tree node by `content-tree.ts` (Issue #70 / Phase 22++++).
 *
 * Reproduces the deskwork-plugin PRD's shape: a flat-path entry whose
 * file lives at `<contentDir>/<some>/<path>/prd.md` (sibling .md
 * naming), bound to a calendar entry by `deskwork.id` frontmatter.
 * Pre-fix the right panel renders the empty-state for both frontmatter
 * and body. Post-fix, the panel renders the frontmatter dl rows and
 * a non-empty body preview.
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

const PRD_ENTRY_ID = '9845c268-670f-4793-b986-0433e9ef4fb9';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      'deskwork-internal': {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'deskwork-internal',
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
        id: PRD_ENTRY_ID,
        slug: 'deskwork-plugin/prd',
        title: 'Prd',
        stage: 'Drafting',
      }),
    ],
    distributions: [],
  };
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  writeCalendar(
    join(root, cfg.sites['deskwork-internal'].calendarPath),
    cal,
  );

  // Single-file PRD: lives at
  // <contentDir>/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md — a peer
  // `.md` file, not a `<path>/index.md` directory. Frontmatter binds it
  // to the calendar entry via `deskwork.id`.
  const prdDir = join(
    root,
    cfg.sites['deskwork-internal'].contentDir,
    '1.0',
    '001-IN-PROGRESS',
    'deskwork-plugin',
  );
  mkdirSync(prdDir, { recursive: true });
  writeFileSync(
    join(prdDir, 'prd.md'),
    [
      '---',
      'deskwork:',
      `  id: ${PRD_ENTRY_ID}`,
      'title: Prd',
      'state: Drafting',
      '---',
      '',
      '# PRD: deskwork-plugin',
      '',
      'Extract the editorial calendar skills from audiocontrol.org into',
      'an open-source Claude Code plugin. The plugin (codename',
      '"deskwork") manages the editorial lifecycle from idea capture',
      'through publication and distribution tracking.',
      '',
      '## Problem',
      '',
      'The editorial workflow today is bespoke per project.',
      '',
    ].join('\n'),
    'utf-8',
  );
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('content-detail — single-file entry read-path (#103)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-content-detail-103-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders frontmatter dl + non-empty body preview for a peer-.md tracked entry', async () => {
    const r = await getHtml(
      app,
      '/dev/content/deskwork-internal/1.0?node=1.0%2F001-IN-PROGRESS%2Fdeskwork-plugin%2Fprd',
    );
    expect(r.status).toBe(200);

    // Detail panel selected for the PRD node.
    expect(r.html).toContain('data-node-detail');

    // Frontmatter rendered as a dl, NOT the empty-state stub.
    // Pre-fix: `<p class="frontmatter-empty">No frontmatter detected.</p>`.
    expect(r.html).not.toContain('frontmatter-empty');
    expect(r.html).toContain('<dl class="frontmatter">');
    // The deskwork-namespaced id round-trips through the frontmatter
    // parser as a nested object — assert the literal id string appears
    // in the rendered dl regardless of how the parser materializes the
    // namespace shape.
    expect(r.html).toContain(PRD_ENTRY_ID);

    // Body preview rendered, NOT the empty-state stub.
    // Pre-fix: `<p class="preview-empty">No body content yet.</p>`.
    expect(r.html).not.toContain('preview-empty');
    expect(r.html).toContain('class="preview"');
    // A unique substring from the seeded body — the markdown renderer
    // wraps it in a paragraph, so we just assert presence.
    expect(r.html).toContain('Extract the editorial calendar skills');
  });
});
