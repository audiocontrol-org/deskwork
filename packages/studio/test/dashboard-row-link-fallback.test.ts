/**
 * Issue #110 regression — dashboard rows had no link target when an
 * entry had no currently-open workflow (and wasn't Published, where
 * the public host URL was used). Pre-fix: the slug rendered as plain
 * text, leaving operators with no path to inspect the entry's content.
 *
 * Plus: "Recent proofs" rows (terminal workflows) rendered as `<div>`
 * with no link target. Same family.
 *
 * Asserts:
 *   1. A Drafting entry with no open workflow links to the
 *      content-detail page (`/dev/content/<site>/<root>?node=<slug>`).
 *   2. A Drafting entry WITH an open workflow links to the review
 *      surface (`/dev/editorial-review/<id>`) — fallback doesn't
 *      override the workflow link.
 *   3. Recent proofs rows are `<a>` elements linking to
 *      `/dev/editorial-review/<id>` so operators can inspect the
 *      historical review record.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import {
  createWorkflow,
  transitionState,
} from '@deskwork/core/review/pipeline';
import type {
  CalendarEntry,
  EditorialCalendar,
} from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

const ENTRY_NO_WF = '11111111-aaaa-4bbb-8ccc-dddddddddddd';
const ENTRY_WITH_WF = '22222222-aaaa-4bbb-8ccc-eeeeeeeeeeee';
const ENTRY_TERMINAL = '33333333-aaaa-4bbb-8ccc-ffffffffffff';

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
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });

  const cal: EditorialCalendar = {
    entries: [
      entry({
        id: ENTRY_NO_WF,
        slug: 'projects/no-workflow',
        title: 'Entry Without Workflow',
        stage: 'Drafting',
      }),
      entry({
        id: ENTRY_WITH_WF,
        slug: 'projects/has-workflow',
        title: 'Entry With Workflow',
        stage: 'Review',
      }),
      entry({
        id: ENTRY_TERMINAL,
        slug: 'projects/applied',
        title: 'Applied Entry',
        stage: 'Published',
      }),
    ],
    distributions: [],
  };
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);

  // Workflow with body for the second entry.
  createWorkflow(root, cfg, {
    entryId: ENTRY_WITH_WF,
    site: 'd',
    slug: 'projects/has-workflow',
    contentKind: 'longform',
    initialMarkdown:
      '---\ntitle: Entry With Workflow\n---\n\n# Entry With Workflow\n\nProse.\n',
  });

  // Terminal workflow for the third entry — applied.
  const terminal = createWorkflow(root, cfg, {
    entryId: ENTRY_TERMINAL,
    site: 'd',
    slug: 'projects/applied',
    contentKind: 'longform',
    initialMarkdown:
      '---\ntitle: Applied Entry\n---\n\n# Applied Entry\n\nFinished.\n',
  });
  // Seed a destination file so approve has somewhere to write.
  const destDir = join(root, 'docs', 'projects', 'applied');
  mkdirSync(destDir, { recursive: true });
  writeFileSync(
    join(destDir, 'index.md'),
    [
      '---',
      'deskwork:',
      `  id: ${ENTRY_TERMINAL}`,
      'title: Applied Entry',
      '---',
      '',
      '# Applied Entry',
      '',
      'placeholder',
      '',
    ].join('\n'),
    'utf-8',
  );
  // Drive the terminal workflow to `applied` so it shows up in
  // Recent proofs. State machine: open → in-review → approved → applied.
  transitionState(root, cfg, terminal.id, 'in-review');
  transitionState(root, cfg, terminal.id, 'approved');
  transitionState(root, cfg, terminal.id, 'applied');
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('dashboard row link fallback (#110)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-row-link-110-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Drafting entry with no workflow links to the content-detail page', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Pre-fix: `<span class="er-row-slug">projects/no-workflow</span>`
    // (plain text). Post-fix: `<a href="/dev/content/d/projects?node=...">...</a>`.
    const expectedHref =
      '/dev/content/d/projects?node=projects%2Fno-workflow';
    expect(r.html).toContain(`href="${expectedHref}"`);
  });

  it('entry with an open workflow keeps its review-surface link', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Workflow link wins over the content-detail fallback.
    expect(r.html).toMatch(
      new RegExp(
        `href="\\/dev\\/editorial-review\\/${ENTRY_WITH_WF}\\?site=d`,
      ),
    );
  });

  it('Recent proofs rows are clickable links to the workflow review record', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // The Recent proofs section renders the terminal workflow with an
    // <a class="er-row" href="/dev/editorial-review/<id>"> shape — the
    // pre-fix `<div class="er-row" data-state="applied">` is gone.
    expect(r.html).not.toMatch(/<div class="er-row" data-state="applied"/);
    expect(r.html).toMatch(
      /<a class="er-row" href="\/dev\/editorial-review\/[0-9a-f-]+(?:\?[^"]*)?"[^>]*data-state="applied"/,
    );
  });
});
