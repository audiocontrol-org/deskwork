/**
 * Issue #154 Dispatch E — scrapbook index rewrite.
 *
 * Pre-Dispatch-E, the scrapbook index was a single vertical list of
 * collapsed disclosure rows that required a click before the operator
 * saw any preview. The redesigned surface lays items out as a CSS
 * Grid of cards with always-on previews, filter chips above the grid
 * (all / md / img / json / txt / other), and a search input the
 * operator can focus with the "/" keystroke.
 *
 * These tests pin the structural + CSS contracts so a future refactor
 * doesn't silently regress the new surface. Each phase of Dispatch E
 * appends its own block of assertions.
 */

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderScrapbookPage } from '../src/pages/scrapbook.ts';
import type { StudioContext } from '../src/routes/api.ts';
import type { DeskworkConfig } from '@deskwork/core/config';

const CSS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/css/scrapbook.css',
);

const CLIENT_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/src/scrapbook-client.ts',
);

interface Fixture {
  ctx: StudioContext;
  cleanup: () => void;
  site: 'd';
  path: 'a-piece';
}

function makeFixture(items: ReadonlyArray<{ name: string; body: string }>): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-index-'));
  const scrapDir = join(root, 'docs', 'a-piece', 'scrapbook');
  mkdirSync(scrapDir, { recursive: true });
  for (const it of items) {
    writeFileSync(join(scrapDir, it.name), it.body);
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
  return {
    ctx: { projectRoot: root, config },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    site: 'd',
    path: 'a-piece',
  };
}

describe('scrapbook index — Dispatch E phase 1: grid + filters + search', () => {
  it('CSS gives .scrapbook-items grid layout with auto-fill 15rem columns', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.scrapbook-items\s*\{[^}]*display:\s*grid/,
    );
    expect(css).toMatch(
      /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(15rem,\s*1fr\)\)/,
    );
  });

  it('CSS expands data-state="expanded" cards across the full grid row', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.scrapbook-item\[data-state="expanded"\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/,
    );
  });

  it('CSS defines .scrapbook-filter-chip + the active variant', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/\.scrapbook-filter-chip\s*\{/);
    expect(css).toMatch(/\.scrapbook-filter-chip\.is-active\s*\{/);
  });

  it('markup contains the controls strip with all six filter chips', () => {
    const fx = makeFixture([
      { name: 'a-note.md', body: '# a-note\n' },
      { name: 'b.json', body: '{}\n' },
    ]);
    try {
      const html = renderScrapbookPage(fx.ctx, fx.site, fx.path);
      expect(html).toContain('data-scrapbook-controls');
      for (const k of ['all', 'md', 'img', 'json', 'txt', 'other']) {
        expect(html).toMatch(
          new RegExp(`data-filter-kind="${k}"`),
        );
      }
    } finally {
      fx.cleanup();
    }
  });

  it('markup contains the search input with data-scrapbook-search', () => {
    const fx = makeFixture([{ name: 'a-note.md', body: '# a-note\n' }]);
    try {
      const html = renderScrapbookPage(fx.ctx, fx.site, fx.path);
      expect(html).toMatch(
        /<input\s+type="search"[^>]*data-scrapbook-search/,
      );
    } finally {
      fx.cleanup();
    }
  });
});

describe('scrapbook index — Dispatch E phase 2: peeks + sticky aside', () => {
  it('CSS defines .scrapbook-item-peek with the kind variants', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/\.scrapbook-item-peek\s*\{/);
    expect(css).toMatch(/\.scrapbook-item-peek--img\s*\{/);
    expect(css).toMatch(/\.scrapbook-item-peek--prose/);
    expect(css).toMatch(/\.scrapbook-item-peek--mono/);
  });

  it('CSS hides .scrapbook-item-peek when the card is expanded', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.scrapbook-item\[data-state="expanded"\]\s*\.scrapbook-item-peek\s*\{[^}]*display:\s*none/,
    );
  });

  it('CSS makes the .scrapbook-index aside sticky on tall enough viewports', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /@media\s*\(min-width:\s*64rem\)\s*and\s*\(min-height:\s*50rem\)\s*\{[\s\S]*?\.scrapbook-index\s*\{[^}]*position:\s*sticky/,
    );
  });

  it('renders a prose peek for markdown items at server-render time', () => {
    const body = '# Hello\n\nFirst line.\nSecond line.\nThird line.\n';
    const fx = makeFixture([{ name: 'a-note.md', body }]);
    try {
      const html = renderScrapbookPage(fx.ctx, fx.site, fx.path);
      expect(html).toContain('class="scrapbook-item-peek scrapbook-item-peek--prose"');
      // The peek text should contain content from the file body
      expect(html).toContain('First line.');
    } finally {
      fx.cleanup();
    }
  });

  it('renders an image peek as a background-image div for img items', () => {
    // PNG magic bytes — not a valid full PNG, but classify() just looks
    // at the extension, so this exercises the kind=img code path.
    const fx = makeFixture([{ name: 'shot.png', body: 'pngbytes' }]);
    try {
      const html = renderScrapbookPage(fx.ctx, fx.site, fx.path);
      expect(html).toContain('scrapbook-item-peek scrapbook-item-peek--img');
      expect(html).toMatch(
        /background-image:\s*url\(&quot;\/api\/dev\/scrapbook-file\?[^"]*name=shot\.png[^"]*&quot;\)/,
      );
    } finally {
      fx.cleanup();
    }
  });
});

describe('scrapbook index — Dispatch E phase 3: client wiring', () => {
  it('client wires filter chips, search input, and "/" shortcut', () => {
    const client = readFileSync(CLIENT_PATH, 'utf8');
    expect(client).toContain('data-filter-kind');
    expect(client).toContain('data-scrapbook-search');
    // "/" key handler — accept either the literal '/' character or
    // a key check, whichever the source uses.
    expect(client).toMatch(/ev\.key\s*===\s*['"]\/['"]/);
    // applyFilters branches on data-filtered-out
    expect(client).toContain('filteredOut');
  });

  it('client toggles data-state="expanded" alongside data-open on disclosure', () => {
    const client = readFileSync(CLIENT_PATH, 'utf8');
    expect(client).toMatch(/data-state="expanded"|dataset\.state\s*=\s*['"]expanded['"]/);
  });

  it('client bootstraps initScrapbook at module load (was a latent gap)', () => {
    // Pre-Dispatch-E the file exported initScrapbook but never invoked
    // it — so the disclosure handler never bound and Dispatch E's new
    // filter wiring would have been silently dead too. Assert the
    // bootstrap is present so this can't regress.
    const client = readFileSync(CLIENT_PATH, 'utf8');
    expect(client).toMatch(/document\.readyState/);
    expect(client).toMatch(/initScrapbook\(\)/);
    expect(client).toMatch(/DOMContentLoaded/);
  });

  it('CSS gives each .scrapbook-item card chrome (border + flex column)', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.scrapbook-item\s*\{[^}]*flex-direction:\s*column/,
    );
    expect(css).toMatch(
      /\.scrapbook-item\s*\{[^}]*border:\s*1px\s+solid/,
    );
  });

  it('CSS hides the body slot when the card is collapsed', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.scrapbook-item:not\(\[data-state="expanded"\]\)\s*\.scrapbook-item-body\s*\{[^}]*display:\s*none/,
    );
  });
});
