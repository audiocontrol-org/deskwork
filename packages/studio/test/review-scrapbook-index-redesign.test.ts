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
