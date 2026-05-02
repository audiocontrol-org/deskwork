/**
 * Issue #154 Dispatch A regression — page-grid layout.
 *
 * The review surface previously anchored `.er-marginalia` to the
 * viewport's right edge with `position: fixed`. Two consequences:
 * edit mode was cramped (Save / Focus collided with the fixed rail),
 * and read mode wasted huge whitespace on the left while marginalia
 * sat far from the prose it annotated.
 *
 * Dispatch A wraps `.er-draft-frame` + `.er-marginalia` inside a new
 * `.er-page` container whose grid composition lays the columns out
 * side-by-side with a thin gutter rule between them. Marginalia is
 * now `position: relative` inside the grid column rather than fixed
 * on the viewport.
 *
 * These tests pin the structural + CSS contracts so regressions get
 * caught at the unit-test boundary instead of at Playwright walk
 * time.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import type { CalendarEntry, EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';

const CSS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/css/editorial-review.css',
);

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

describe('longform review surface page-grid (Issue #154 Dispatch A)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-page-grid-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('wraps draft frame + marginalia inside a single .er-page container', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // The page container exists.
    expect(r.html).toMatch(/<article class="er-page">/);

    // The grid is inside the page, and the draft frame + marginalia
    // are siblings inside the grid (separated by the 1px gutter).
    // Order matters: draft-frame, gutter, marginalia.
    const m = r.html.match(
      /<article class="er-page">[\s\S]*?<div class="er-page-grid">([\s\S]*?)<\/div>\s*<\/article>/,
    );
    expect(m, 'er-page-grid block should exist inside er-page').not.toBeNull();
    const gridInner = m![1];

    expect(gridInner).toMatch(/class="er-draft-frame"/);
    expect(gridInner).toMatch(/class="er-page-gutter"/);
    // Marginalia rendered inside the grid (not as a top-level
    // sibling of er-page) — its <aside class="er-marginalia"> hook.
    expect(gridInner).toMatch(/class="er-marginalia"/);
  });

  it('places marginalia AFTER the draft frame in source order', async () => {
    // Source order matters: in single-column responsive mode the
    // marginalia must stack BELOW the article. CSS `order` could
    // override this but the grid uses natural source order, so the
    // markup is the contract.
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    const draftIdx = r.html.indexOf('class="er-draft-frame"');
    const marginaliaIdx = r.html.indexOf('class="er-marginalia"');
    expect(draftIdx).toBeGreaterThan(0);
    expect(marginaliaIdx).toBeGreaterThan(draftIdx);
  });

  it('does not anchor .er-marginalia with position: fixed (CSS contract)', () => {
    // Read the CSS file and walk to the `.er-marginalia` block. The
    // pre-Dispatch-A rule used `position: fixed` to anchor marginalia
    // to the viewport's right edge — the architectural error every
    // issue #154 concern descended from. Pin this so regressions
    // (e.g. a paste-back of the old block) get caught here rather
    // than at Playwright walk time.
    const css = readFileSync(CSS_PATH, 'utf8');
    // Find the standalone `.er-marginalia {` block (the one that
    // owns layout, not the descendant `.er-marginalia .foo` rules).
    const blockStart = css.search(/^\.er-marginalia\s*\{/m);
    expect(blockStart, '.er-marginalia rule should exist').toBeGreaterThan(0);
    const blockEnd = css.indexOf('}', blockStart);
    const block = css.slice(blockStart, blockEnd + 1);
    expect(block).not.toMatch(/position:\s*fixed/);
    // And the new contract: marginalia lives inside the grid.
    expect(block).toMatch(/position:\s*relative/);
  });

  it('defines the page-grid layout tokens', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/--er-page-max\s*:/);
    expect(css).toMatch(/--er-article-col\s*:\s*minmax\(28rem, 42rem\)/);
    expect(css).toMatch(/--er-marginalia-col\s*:\s*minmax\(16rem, 19rem\)/);
  });

  it('does not retain the obsolete .essay max-width:calc(100vw - 19rem) workaround', () => {
    // Pre-Dispatch-A, edit mode used a body:has() rule to widen
    // .essay to viewport-minus-marginalia because marginalia was
    // pinned to the viewport. The page-grid owns the gutter now,
    // so this rule is obsolete and was deleted.
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).not.toMatch(/calc\(100vw\s*-\s*19rem\)/);
  });

  it('does not paint an asymmetric binding edge on .er-page::before', () => {
    // Initial Dispatch-A treatment painted a 6px gradient + 1px
    // --er-paper-4 rule on the left edge of .er-page only. The right
    // edge had just the page's own --er-paper-3 hairline, so the two
    // vertical edges read as visibly different — left dark spine,
    // right barely visible. The press-check metaphor is a loose
    // galley proof on a desk (not a bound codex), so both edges
    // should carry the same paper-3 hairline + symmetric shadow.
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).not.toMatch(/\.er-page::before\s*\{/);
    expect(css).not.toMatch(/--er-paper-4/);
  });

  it('exposes the marginalia visibility toggle as on-component affordances (Issue #159)', () => {
    // The toggle for hiding/showing marginalia lives ON the marginalia
    // component, mirroring the outline-drawer pull-tab pattern:
    //   - `.er-marginalia-stow` chevron in the head (visible state)
    //   - `.er-marginalia-tab` pull tab on the right edge (stowed state)
    // Body attribute `[data-marginalia="hidden"]` collapses the
    // page-grid + reveals the tab. Earlier iterations placed buttons
    // in the strip and edit toolbar; that shape is retired —
    // affordances belong on their components, not in generic chrome.
    const css = readFileSync(CSS_PATH, 'utf8');
    // Page-grid collapse + marginalia/gutter hide when stowed.
    expect(css).toMatch(
      /body\[data-marginalia="hidden"\]\s+\.er-page-grid\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
    expect(css).toMatch(
      /body\[data-marginalia="hidden"\]\s+\.er-marginalia,?[\s\S]*body\[data-marginalia="hidden"\]\s+\.er-page-gutter\s*\{[^}]*display:\s*none/,
    );
    // Pull tab is hidden by default and revealed when marginalia is stowed.
    expect(css).toMatch(/\.er-marginalia-tab\s*\{[\s\S]*?display:\s*none/);
    expect(css).toMatch(
      /body\[data-marginalia="hidden"\]\s+\.er-marginalia-tab\s*\{[^}]*display:\s*flex/,
    );
    // Stow chevron exists as a styled affordance.
    expect(css).toMatch(/\.er-marginalia-stow\s*\{/);
  });

  it('renders the longform strip as sticky (not fixed) so its actual height takes space in flow', () => {
    // Pre-fix: `.er-strip` was `position: fixed` and the body padding
    // was a hardcoded `calc(var(--er-folio-h) + 3.2rem)`. When
    // `.er-strip-inner` wraps to two rows at desktop widths
    // (rendered ~109px / 6.85rem at 1440px because the children
    // sum to wider than --er-container-wide), the strip
    // overflowed the body padding and eclipsed the page below it.
    // Live measurement showed the marginalia head sitting -1.25px
    // *behind* the strip's bottom. Sticky resolves this by letting
    // the strip take its actual rendered height in flow (issue #155).
    const css = readFileSync(CSS_PATH, 'utf8');
    const stripStart = css.search(
      /^\[data-review-ui="longform"\]\s+\.er-strip\s*\{/m,
    );
    expect(stripStart, '.er-strip rule should exist').toBeGreaterThan(0);
    const stripEnd = css.indexOf('}', stripStart);
    const stripBlock = css.slice(stripStart, stripEnd + 1);
    expect(stripBlock).toMatch(/position:\s*sticky\s*;/);
    // Require trailing `;` so prose mentions of the prior `position:
    // fixed` state inside the explanatory comment don't false-positive.
    expect(stripBlock).not.toMatch(/position:\s*fixed\s*;/);
    expect(stripBlock).toMatch(/top:\s*var\(--er-folio-h\)/);

    // The body padding-top hack is no longer needed: the strip is
    // self-sizing in flow, so the longform body only needs to clear
    // the (still fixed) folio.
    const bodyStart = css.search(
      /^body:has\(\[data-review-ui="longform"\]\s+\.er-strip\)\s*\{/m,
    );
    expect(bodyStart, 'longform body padding rule should exist').toBeGreaterThan(0);
    const bodyEnd = css.indexOf('}', bodyStart);
    const bodyBlock = css.slice(bodyStart, bodyEnd + 1);
    expect(bodyBlock).toMatch(/padding-top:\s*var\(--er-folio-h\)\s*;/);
    expect(bodyBlock).not.toMatch(/calc\(\s*var\(--er-folio-h\)\s*\+\s*3\.2rem\s*\)/);
  });
});
