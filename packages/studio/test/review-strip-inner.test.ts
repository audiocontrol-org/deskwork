/**
 * Issues 10 + 11 regression — wide-viewport alignment + responsive layout.
 *
 * Issue 10: the strip's flex children float in awkward whitespace at
 * wide viewports. The fix introduces an `.er-strip-inner` wrapper that
 * caps the flex layout to `--er-container-wide` while the outer strip
 * stays full-bleed. This test asserts the wrapper appears in the
 * rendered markup (CSS-only fixes can't be verified at this layer; the
 * DOM shape can).
 *
 * Issue 11: responsive layout depends on the `data-review-ui="longform"`
 * scope being set on the review shell so the @media rules in
 * editorial-review.css can target it. Already asserted indirectly by
 * the existing `data-review-ui` test, but keeping the assertion local
 * to the longform surface so the responsive layer's contract is
 * self-documenting.
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

const ENTRY_ID = '22222222-2222-4222-8222-222222222222';

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

describe('longform review surface strip-inner wrapper (Issue 10)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-strip-inner-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('wraps strip children in .er-strip-inner', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // Outer strip stays — its full-bleed background + ::before
    // registration mark adhere to the viewport edge.
    expect(r.html).toMatch(/<div class="er-strip">/);
    // Inner wrapper carries the flex layout.
    expect(r.html).toMatch(/<div class="er-strip-inner">/);
    // The strip-back link lives inside the inner wrapper now.
    expect(r.html).toMatch(
      /<div class="er-strip-inner">[\s\S]*?<a class="er-strip-back"/,
    );
  });

  it('still scopes data-review-ui="longform" on the review shell', async () => {
    // The responsive @media rules in editorial-review.css all key off
    // [data-review-ui="longform"]; if this attribute moves or renames,
    // the responsive layer (Issue 11) silently breaks.
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/data-review-ui="longform"/);
  });
});
