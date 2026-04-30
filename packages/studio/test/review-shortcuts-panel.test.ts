/**
 * Issue #108 regression — the review surface bound destructive
 * actions (approve / iterate / reject) to single-letter shortcuts.
 * A stray keystroke while reading collapsed weeks of work because
 * the action fired immediately. The fix is a two-key sequence
 * (a-a, i-i, r-r within 500ms): first press arms with a transient
 * hint toast, second matching press fires.
 *
 * The two-key behavior itself lives in client JS
 * (`editorial-review-client.ts`) which has no jsdom test harness.
 * What this test asserts is the server-side artifact: the `?`
 * shortcuts panel documents the two-key sequence so adopters know
 * they need to double-press. That panel HTML is rendered by
 * `packages/studio/src/pages/review.ts`.
 *
 * Asserts:
 *   1. The shortcuts panel for an in-review longform workflow
 *      shows `<kbd>a</kbd> <kbd>a</kbd>` for approve, `<kbd>i</kbd>
 *      <kbd>i</kbd>` for iterate, `<kbd>r</kbd> <kbd>r</kbd>` for
 *      reject — two `<kbd>` tags per row.
 *   2. The single-letter destructive shortcuts (`<kbd>a</kbd>`
 *      alone, `<kbd>i</kbd>` alone, `<kbd>r</kbd>` alone immediately
 *      followed by `</kbd></dt>`) no longer appear.
 *   3. `j`/`k` (next/prev) and `e` (toggle edit) stay single-key —
 *      they're not destructive.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import type { CalendarEntry, EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

const ENTRY_ID = '11111111-2222-4333-8444-555555555555';

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
        id: ENTRY_ID,
        slug: 'a-piece',
        title: 'A Piece',
        stage: 'Review',
      }),
    ],
    distributions: [],
  };
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
  createWorkflow(root, cfg, {
    entryId: ENTRY_ID,
    site: 'd',
    slug: 'a-piece',
    contentKind: 'longform',
    initialMarkdown:
      '---\ntitle: A Piece\n---\n\n# A Piece\n\nProse for the test fixture.\n',
  });
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('review surface shortcuts panel — two-key destructive sequence (#108)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-shortcuts-108-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('documents two-key sequence for approve / iterate / reject', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // Two-key rows: each destructive shortcut <dt> contains two
    // <kbd> tags wrapping the same letter.
    expect(r.html).toMatch(
      /<dt>\s*<kbd>a<\/kbd>\s*<kbd>a<\/kbd>\s*<\/dt>\s*<dd>\s*approve\b/,
    );
    expect(r.html).toMatch(
      /<dt>\s*<kbd>i<\/kbd>\s*<kbd>i<\/kbd>\s*<\/dt>\s*<dd>\s*iterate\b/,
    );
    expect(r.html).toMatch(
      /<dt>\s*<kbd>r<\/kbd>\s*<kbd>r<\/kbd>\s*<\/dt>\s*<dd>\s*reject\b/,
    );
    // Adopter-readable hint about the press-twice behavior.
    expect(r.html).toContain('press twice within 500ms');
  });

  it('does not document single-letter destructive shortcuts', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // Pre-fix shape: `<dt><kbd>a</kbd></dt><dd>approve</dd>` — a single
    // <kbd> wrapping the destructive letter, with the action text right
    // after `</dt>`. Post-fix the row has two <kbd>s.
    expect(r.html).not.toMatch(/<dt>\s*<kbd>a<\/kbd>\s*<\/dt>\s*<dd>\s*approve/);
    expect(r.html).not.toMatch(/<dt>\s*<kbd>i<\/kbd>\s*<\/dt>\s*<dd>\s*iterate/);
    expect(r.html).not.toMatch(/<dt>\s*<kbd>r<\/kbd>\s*<\/dt>\s*<dd>\s*reject/);
  });

  it('keeps non-destructive shortcuts (j/k/e) single-key', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // j/k still single-key for next/prev margin note navigation.
    expect(r.html).toMatch(/<kbd>j<\/kbd>\s*\/\s*<kbd>k<\/kbd>/);
    // e still single-key for toggle edit mode.
    expect(r.html).toMatch(/<kbd>e<\/kbd>/);
  });
});
