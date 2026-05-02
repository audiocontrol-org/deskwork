/**
 * Issue #161 — scrapbook redesign structural contract.
 *
 * Asserts the new markup tree from the operator-approved mockup at
 * `docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html`
 * is rendered by the server. Behavior tests are covered in dispatch-specific
 * test additions (F2-F5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type { EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

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

function seedScrapbookFixture(root: string, cfg: DeskworkConfig): void {
  const cal: EditorialCalendar = { entries: [], distributions: [] };
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
  // Create a content tree node with a scrapbook containing one md file + one txt file.
  const dir = join(root, 'docs/folder/scrapbook');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'note.md'), '---\ntitle: A Note\n---\n\nProse line one.\n');
  writeFileSync(join(dir, 'arrangement.txt'), 'short text content\n');
  // Force deterministic mtimes — listScrapbook sorts mtime-desc; note.md must
  // be newer so it lands at item-1 (md), with arrangement.txt at item-2 (txt).
  const newer = Date.now() / 1000;
  const older = newer - 60;
  utimesSync(join(dir, 'arrangement.txt'), older, older);
  utimesSync(join(dir, 'note.md'), newer, newer);
}

async function fetchScrapbook(
  app: ReturnType<typeof createApp>,
  site: string,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x/dev/scrapbook/${site}/${path}`));
  return { status: res.status, html: await res.text() };
}

describe('scrapbook redesign — structural contract (Issue #161)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-'));
    const cfg = makeConfig();
    seedScrapbookFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders the .scrap-page container with aside-left + main-right', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.status).toBe(200);
    // .scrap-page wraps both aside and main; aside appears BEFORE main in source order
    // (which CSS grid renders as left-then-right).
    const asideIdx = r.html.indexOf('class="scrap-aside"');
    const mainIdx = r.html.indexOf('class="scrap-main"');
    expect(asideIdx).toBeGreaterThan(0);
    expect(mainIdx).toBeGreaterThan(asideIdx);
  });

  it('emits data-site / data-path on .scrap-page so the client can read them without parsing display text', async () => {
    // The client (`scrapbook-client.ts:readCtx`) reads these attributes
    // directly. If the server stops emitting them — or renames them — the
    // client silently fails the `if (!site || !path) return null;` guard
    // and the entire page becomes unwired with no diagnostic. Lock the
    // contract here.
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<main class="scrap-page" data-site="d" data-path="folder"/);
  });

  it('renders the aside chrome (kicker, title, totals, actions, path)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<aside class="scrap-aside"/);
    expect(r.html).toMatch(/scrap-aside-kicker/);
    expect(r.html).toMatch(/<h1 class="scrap-aside-title">/);
    expect(r.html).toMatch(/scrap-aside-totals/);
    expect(r.html).toMatch(/scrap-aside-actions/);
    expect(r.html).toMatch(/data-action="new-note"/);
    expect(r.html).toMatch(/data-action="upload"/);
    expect(r.html).toMatch(/scrap-aside-path/);
  });

  it('renders the .scrap-main with breadcrumb + search + filter chips + cards grid', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<section class="scrap-main">/);
    expect(r.html).toMatch(/<nav class="scrap-breadcrumb"/);
    expect(r.html).toMatch(/<div class="scrap-search">/);
    expect(r.html).toMatch(/<div class="scrap-filters"/);
    expect(r.html).toMatch(/<ol class="scrap-cards"/);
  });

  it('renders cards with the new vertical chrome — head + meta + preview + foot', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // Each card has data-kind, data-state="closed" (default), and an id="item-N"
    expect(r.html).toMatch(/<li class="scrap-card" data-kind="md" data-state="closed" id="item-1"/);
    expect(r.html).toMatch(/<li class="scrap-card" data-kind="txt" data-state="closed" id="item-2"/);
    expect(r.html).toMatch(/<div class="scrap-card-head">/);
    expect(r.html).toMatch(/<span class="scrap-seq">/);
    expect(r.html).toMatch(/<span class="scrap-name" data-action="open">/);
    expect(r.html).toMatch(/<time class="scrap-time"/);
    expect(r.html).toMatch(/<div class="scrap-card-meta">/);
    expect(r.html).toMatch(/<span class="scrap-kind scrap-kind--md">MD<\/span>/);
    expect(r.html).toMatch(/<span class="scrap-kind scrap-kind--txt">TXT<\/span>/);
    expect(r.html).toMatch(/<div class="scrap-card-foot">/);
    expect(r.html).toMatch(/data-action="open">open</);
    expect(r.html).toMatch(/data-action="rename">rename</);
    expect(r.html).toMatch(/data-action="delete">delete</);
    expect(r.html).toMatch(/data-action="mark-secret"/);
  });

  it('preserves filter chips with kind labels + counts', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<button class="scrap-filter"/);
    expect(r.html).toMatch(/aria-pressed="true">all/i);
    // Per-kind chips with counts
    expect(r.html).toMatch(/all\s*·\s*2/);
    expect(r.html).toMatch(/md\s*·\s*1/);
    expect(r.html).toMatch(/txt\s*·\s*1/);
  });

  it('preserves search input with / shortcut keybind hint', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<input[^>]*type="search"/);
    expect(r.html).toMatch(/scrap-search-kbd/);
    expect(r.html).toMatch(/[/]<\/span>/); // the literal "/" inside the kbd hint
  });

  it('does NOT retain the old .scrapbook-* classes (clean rebuild, no compat shims)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // The rebuild replaces; per the spec "no backwards-compat shims; clean replace
    // per the project's no-garbage-turds rule".
    expect(r.html).not.toMatch(/class="scrapbook-page"/);
    expect(r.html).not.toMatch(/class="scrapbook-items"/);
    expect(r.html).not.toMatch(/class="scrapbook-item"/);
    expect(r.html).not.toMatch(/class="scrapbook-index"/);
  });

  it('CSS file uses the new .scrap-* class vocabulary', () => {
    const cssPath = join(
      __dirname,
      '../../../plugins/deskwork-studio/public/css/scrapbook.css',
    );
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/\.scrap-page\s*\{/);
    expect(css).toMatch(/\.scrap-aside\s*\{/);
    expect(css).toMatch(/\.scrap-main\s*\{/);
    expect(css).toMatch(/\.scrap-cards\s*\{/);
    expect(css).toMatch(/\.scrap-card\s*\{/);
    expect(css).toMatch(/\.scrap-card::before/);
    expect(css).toMatch(/\.scrap-card-foot\s*\{/);
    // No old .scrapbook-* selectors remain
    expect(css).not.toMatch(/\.scrapbook-page\s*\{/);
    expect(css).not.toMatch(/\.scrapbook-items\s*\{/);
    expect(css).not.toMatch(/\.scrapbook-item\s*\{/);
  });
});
