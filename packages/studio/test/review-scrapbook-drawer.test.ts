/**
 * Issue #154 Dispatch D regression — real bottom scrapbook drawer.
 *
 * Pre-Dispatch-D, the scrapbook drawer was a fixed right-edge aside
 * whose primary affordance (the "open ↗" link) navigated the operator
 * AWAY to the standalone scrapbook page — the chrome looked like a
 * drawer that opened, but the action contradicted that promise.
 *
 * Dispatch D rebuilds the drawer as a true bottom-anchored expandable
 * surface:
 *   - the handle is a clickable role=button (data-drawer-toggle) that
 *     toggles body[data-drawer="open"];
 *   - the handle shows a "peek" line — up to 3 item filenames + N-more —
 *     so operators see what's inside without expanding;
 *   - the standalone-viewer link is demoted to a small inline
 *     affordance with stopPropagation so it doesn't toggle the drawer;
 *   - body padding-bottom adjusts so the page never sits under the
 *     drawer handle;
 *   - the legacy max-width:900px hide rule is gone — the drawer is
 *     visible at every viewport now that it's the primary surface.
 *
 * These tests pin the structural + CSS + client contracts so a future
 * refactor doesn't silently regress.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderScrapbookDrawer } from '../src/pages/review-scrapbook-drawer.ts';
import type { StudioContext } from '../src/routes/api.ts';
import type { DeskworkConfig } from '@deskwork/core/config';
import type { CalendarEntry } from '@deskwork/core/types';

const CSS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/css/editorial-review.css',
);

const CLIENT_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/src/editorial-review-client.ts',
);

function makeCtx(): StudioContext {
  const config: DeskworkConfig = {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
  // Use a path that intentionally has no scrapbook directory; the
  // drawer renderer treats listScrapbook errors as empty + falls back
  // to the empty-state row, which is exactly what we want for these
  // structural tests.
  return { projectRoot: '/nonexistent-fixture-root', config };
}

function entryFor(slug: string): CalendarEntry {
  return {
    slug,
    title: 'A Piece',
    description: '',
    stage: 'Review',
    targetKeywords: [],
    source: 'manual',
    id: '99999999-9999-9999-8999-999999999999',
  };
}

describe('scrapbook drawer (Issue #154 Dispatch D)', () => {
  it('handle is a clickable role=button with data-drawer-toggle', () => {
    const html = renderScrapbookDrawer(
      makeCtx(),
      'd',
      entryFor('a-piece'),
      'a-piece',
    ).__raw;
    expect(html).toMatch(
      /<header class="er-scrapbook-drawer-handle"[^>]*data-drawer-toggle[^>]*role="button"[^>]*tabindex="0"/,
    );
  });

  it('handle is aria-expanded="false" by default', () => {
    const html = renderScrapbookDrawer(
      makeCtx(),
      'd',
      entryFor('a-piece'),
      'a-piece',
    ).__raw;
    expect(html).toMatch(
      /<header class="er-scrapbook-drawer-handle"[^>]*aria-expanded="false"/,
    );
  });

  it('handle includes the toggle button with data-toggle-label', () => {
    const html = renderScrapbookDrawer(
      makeCtx(),
      'd',
      entryFor('a-piece'),
      'a-piece',
    ).__raw;
    expect(html).toMatch(
      /<button class="er-scrapbook-drawer-toggle"[^>]*data-drawer-toggle/,
    );
    expect(html).toMatch(/<span data-toggle-label>Expand<\/span>/);
    expect(html).toMatch(/<span class="chev"[^>]*>▾<\/span>/);
  });

  it('standalone-viewer link uses stopPropagation so it does not toggle', () => {
    const html = renderScrapbookDrawer(
      makeCtx(),
      'd',
      entryFor('a-piece'),
      'a-piece',
    ).__raw;
    expect(html).toMatch(
      /<a class="er-scrapbook-drawer-open"[^>]*onclick="event\.stopPropagation\(\)"[^>]*>open viewer ↗<\/a>/,
    );
  });

  it('peek renders empty-state when there are no items', () => {
    const html = renderScrapbookDrawer(
      makeCtx(),
      'd',
      entryFor('a-piece'),
      'a-piece',
    ).__raw;
    expect(html).toMatch(
      /<span class="er-scrapbook-drawer-peek-empty">\(empty — drop research here\)<\/span>/,
    );
  });

  it('peek renders up to 3 names + "+ N more" suffix when total > 3', async () => {
    // Mock the scrapbook listing by introducing a fixture project
    // root with a scrapbook directory containing 5 items. The renderer
    // walks listScrapbook -> the scrapbook helper which reads the
    // filesystem; build a real fixture so the path is exercised.
    const { mkdirSync, writeFileSync, mkdtempSync, rmSync } = await import(
      'node:fs'
    );
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const root = mkdtempSync(join(tmpdir(), 'deskwork-drawer-peek-'));
    try {
      const scrapDir = join(root, 'docs', 'a-piece', 'scrapbook');
      mkdirSync(scrapDir, { recursive: true });
      // Filenames sort alphabetically inside listScrapbook; pin order.
      for (const name of [
        'a-note.md',
        'b-note.md',
        'c-note.md',
        'd-note.md',
        'e-note.md',
      ]) {
        writeFileSync(join(scrapDir, name), `# ${name}\n`);
      }

      const config: DeskworkConfig = {
        version: 1,
        sites: {
          d: {
            contentDir: 'docs',
            calendarPath: '.deskwork/calendar.md',
          },
        },
        defaultSite: 'd',
      };
      const ctx: StudioContext = { projectRoot: root, config };
      // Use a NULL entry so the renderer falls through to the
      // listScrapbook (slug-based) path — avoids needing the entry's
      // id-binding scrapbookDirForEntry resolver to find the fixture.
      const html = renderScrapbookDrawer(ctx, 'd', null, 'a-piece').__raw;

      // The peek line is rendered before any rows; isolate that
      // segment and verify exactly 3 names appear in it (which 3 is
      // determined by listScrapbook's sort order — we assert the
      // truncation behavior, not the specific item set, so a future
      // sort-order change in the core helper doesn't break this test).
      const peekOpen = html.indexOf('<span class="er-scrapbook-drawer-peek"');
      expect(peekOpen).toBeGreaterThan(0);
      const peekClose = html.indexOf('</span>', html.indexOf('+ 2 more', peekOpen));
      expect(peekClose).toBeGreaterThan(peekOpen);
      const peekHtml = html.slice(peekOpen, peekClose);
      const peekNameMatches = peekHtml.match(/<span>[a-e]-note\.md<\/span>/g) ?? [];
      expect(peekNameMatches.length).toBe(3);
      // "+ 2 more" suffix is present in the peek.
      expect(peekHtml).toContain('+ 2 more');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('CSS defines the body[data-drawer="open"] height rule', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /body\[data-drawer="open"\]\s*\.er-scrapbook-drawer\s*\{[\s\S]*?height:\s*var\(--er-drawer-h-x\)/,
    );
  });

  it('CSS removes the legacy @media (max-width: 900px) display:none rule', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    // The drawer must remain visible at narrow widths — it's the
    // primary scrapbook surface now and the peek truncates via
    // text-overflow ellipsis. Assert the old hide rule is absent.
    expect(css).not.toMatch(
      /@media\s*\(max-width:\s*900px\)\s*\{[^}]*\.er-scrapbook-drawer\s*\{[^}]*display:\s*none/,
    );
  });

  it('CSS adjusts body padding-bottom based on drawer state', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /body:has\(\.er-scrapbook-drawer\)\s*\{[^}]*padding-bottom:\s*calc\(var\(--er-drawer-h\)/,
    );
    expect(css).toMatch(
      /body\[data-drawer="open"\]:has\(\.er-scrapbook-drawer\)\s*\{[^}]*padding-bottom:\s*calc\(var\(--er-drawer-h-x\)/,
    );
  });

  it('client toggle handler is wired (setDrawerState + body.dataset.drawer)', () => {
    const client = readFileSync(CLIENT_PATH, 'utf8');
    expect(client).toContain('setDrawerState');
    expect(client).toContain('data-drawer-toggle');
    expect(client).toContain('document.body.dataset.drawer');
  });
});
