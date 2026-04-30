/**
 * Issue #107 regression — the studio index page (`/dev/`) had two
 * un-linked surfaces: Longform reviews (III) and Scrapbook (V). Both
 * showed only the templated route as plain text, so adopters scanning
 * the index could see the routes existed but had no way to navigate
 * into them.
 *
 * Asserts:
 *   1. Scrapbook (V) links to `/dev/content` (the entry point that
 *      drills into a node's scrapbook drawer); the URL template hint
 *      `/dev/scrapbook/<site>/<path>` stays visible alongside.
 *   2. Longform reviews (III) with no open workflows links to
 *      `/dev/editorial-studio#stage-review` (the dashboard's Review
 *      anchor mounted in sub-phase D); the URL template hint stays.
 *   3. Longform reviews (III) with an open in-review workflow links
 *      directly to that workflow's `/dev/editorial-review/<id>`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type { EditorialCalendar } from '@deskwork/core/types';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import { createApp } from '../src/server.ts';

const ENTRY_ID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
}

function seedEmpty(root: string, cfg: DeskworkConfig): void {
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(
    join(root, cfg.sites.d.calendarPath),
    { entries: [], distributions: [] } satisfies EditorialCalendar,
  );
}

function seedWithLongform(root: string, cfg: DeskworkConfig): void {
  seedEmpty(root, cfg);
  const cal: EditorialCalendar = {
    entries: [
      {
        id: ENTRY_ID,
        slug: 'a-longform',
        title: 'A Longform',
        description: '',
        stage: 'Review',
        targetKeywords: [],
        source: 'manual',
      },
    ],
    distributions: [],
  };
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
  createWorkflow(root, cfg, {
    entryId: ENTRY_ID,
    site: 'd',
    slug: 'a-longform',
    contentKind: 'longform',
    initialMarkdown:
      '---\ntitle: A Longform\n---\n\n# A Longform\n\nProse.\n',
  });
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('studio index — sensible link defaults (#107)', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-index-defaults-'));
    cfg = makeConfig();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Scrapbook (V) links to /dev/content with template hint visible', async () => {
    seedEmpty(root, cfg);
    const app = createApp({ projectRoot: root, config: cfg });
    const r = await getHtml(app, '/dev/');
    expect(r.status).toBe(200);

    // Scrapbook entry has an actual link target.
    expect(r.html).toMatch(
      /<a class="er-toc-entry__title" href="\/dev\/content">\s*Scrapbook\s*<\/a>/,
    );
    // URL template hint preserved alongside.
    expect(r.html).toContain('/dev/scrapbook/');
    expect(r.html).toContain('&lt;site&gt;/&lt;path&gt;');
  });

  it('Longform (III) with no open workflows links to dashboard Review anchor', async () => {
    seedEmpty(root, cfg);
    const app = createApp({ projectRoot: root, config: cfg });
    const r = await getHtml(app, '/dev/');
    expect(r.status).toBe(200);

    expect(r.html).toMatch(
      /<a class="er-toc-entry__title" href="\/dev\/editorial-studio#stage-review">\s*Longform reviews\s*<\/a>/,
    );
    // URL template hint preserved alongside.
    expect(r.html).toContain('/dev/editorial-review/');
    expect(r.html).toContain('&lt;slug&gt;');
    // postHint nudges adopter to populate the deep-link.
    expect(r.html).toContain('Defaults to the dashboard');
  });

  it('Longform (III) with an open longform workflow deep-links to it', async () => {
    seedWithLongform(root, cfg);
    const app = createApp({ projectRoot: root, config: cfg });
    const r = await getHtml(app, '/dev/');
    expect(r.status).toBe(200);

    // The href is `/dev/editorial-review/<workflow-uuid>` for the
    // most-recent in-review longform.
    expect(r.html).toMatch(
      /<a class="er-toc-entry__title" href="\/dev\/editorial-review\/[0-9a-f-]+">\s*Longform reviews\s*<\/a>/,
    );
    // postHint surfaces the slug so the operator knows which workflow
    // they'll land on.
    expect(r.html).toContain('a-longform');
  });
});
