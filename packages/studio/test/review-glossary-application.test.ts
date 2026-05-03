/**
 * Longform review surface — glossary tooltip application (Issue 3).
 *
 * The Phase 1 `gloss(<key>)` helper wraps surface jargon in
 * `<span class="er-gloss" data-term="...">` markup that the global
 * tooltip client picks up. This file asserts the longform review's
 * decision strip applies the helper to two specific terms:
 *
 *   1. "Galley" in `er-strip-galley` — wrapped via `gloss('galley')`.
 *      The visible word IS the gloss-key's `term` ("galley"); the
 *      helper renders the term verbatim.
 *
 *   2. "mark" in `er-strip-hint` — hand-rolled `er-gloss` span with
 *      `data-term="marginalia"`. The design doc's open-design-note 3
 *      called this out explicitly: `gloss('marginalia')` would render
 *      "margin notes" as the visible word, making the hint read
 *      "select text to **margin notes**" — grammatically off. Option
 *      (b) keeps "mark" as the visible verb and hand-rolls the span
 *      so the data-term attribute (which the tooltip client uses to
 *      look up the gloss) still routes to marginalia's tooltip.
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

const ENTRY_ID = '44444444-4444-4444-8444-444444444444';

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

describe('longform review surface — glossary application (Issue 3)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-issue-3-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('wraps "Galley" in er-strip-galley with a glossary span', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // er-strip-galley contains an er-gloss span with data-term="galley"
    // followed by the version <em>. The gloss helper renders the
    // entry's `term` value ("galley") as the visible text.
    expect(r.html).toMatch(
      /<span class="er-strip-galley"><span class="er-gloss" data-term="galley"[^>]*>galley<\/span>\s+<em>/,
    );
  });

  it('wraps "mark" in er-strip-hint with a marginalia-targeted glossary span', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // The strip-hint reads "select text to <gloss>mark</gloss> · double-click ...".
    // The visible text stays "mark" (grammatical fit) but data-term routes
    // the tooltip lookup to "marginalia" (option-b in the design doc).
    expect(r.html).toMatch(
      /<span class="er-strip-hint"[^>]*>select text to <span class="er-gloss" data-term="marginalia"[^>]*>mark<\/span>/,
    );
  });

  it('removes aria-hidden from the strip-hint when it contains an interactive gloss span', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // The pre-Issue-3 markup had aria-hidden="true" on .er-strip-hint.
    // Now that the hint contains a tabbable .er-gloss span (role=button,
    // tabindex=0), aria-hidden on the parent would contradict the
    // child's interactive role and hide a keyboard-reachable affordance
    // from assistive tech.
    expect(r.html).not.toMatch(
      /<span class="er-strip-hint" aria-hidden="true"/,
    );
  });
});
