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

describe('scrapbook redesign — per-kind preview rendering (Issue #161, dispatch F2)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-f2-'));
    const cfg = makeConfig();
    const cal: EditorialCalendar = { entries: [], distributions: [] };
    mkdirSync(join(root, '.deskwork'), { recursive: true });
    writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
    const dir = join(root, 'docs/folder/scrapbook');
    mkdirSync(dir, { recursive: true });
    // md with frontmatter + body
    writeFileSync(
      join(dir, 'note.md'),
      '---\ntitle: Test\nauthor: Operator\n---\n\nFirst paragraph after frontmatter.\n\nSecond paragraph.\n',
    );
    // json with parseable content
    writeFileSync(
      join(dir, 'config.json'),
      '{\n  "key": "value",\n  "nested": { "a": 1 }\n}\n',
    );
    // txt with simple content
    writeFileSync(join(dir, 'log.txt'), 'line one\nline two\nline three\n');
    // small "image" (just bytes; we test the URL emission, not actual rendering)
    writeFileSync(join(dir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('md preview strips frontmatter and emits italic Newsreader excerpt', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // The frontmatter (--- ... ---) MUST NOT appear in the preview HTML.
    expect(r.html).not.toMatch(/<div class="scrap-preview scrap-preview-md"[^>]*>[^<]*<p>---/);
    // The body content does appear.
    expect(r.html).toMatch(/<div class="scrap-preview scrap-preview-md"[^>]*>[\s\S]*First paragraph after frontmatter/);
  });

  it('img preview emits the .scrap-preview--img-frame with background-image URL', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<div class="scrap-preview scrap-preview--img"[^>]*>[\s\S]*<div class="scrap-preview--img-frame" style="background-image:[^"]*scrapbook-file/);
  });

  it('json preview emits a mono <pre> with parsed-as-text content', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // Content is escapeHtml'd so quotes render as &quot; (XSS-safe). The
    // regex matches the escaped form. F2.2 also pretty-prints via
    // JSON.parse + JSON.stringify(_, null, 2) — verified separately by
    // the multi-line-after-parse assertion below.
    expect(r.html).toMatch(/<pre class="scrap-preview scrap-preview--mono"[^>]*>[\s\S]*&quot;key&quot;:\s*&quot;value&quot;/);
  });

  it('json preview pretty-prints minified JSON (parse-then-stringify)', async () => {
    // Replace the seeded multi-line config.json with a one-liner; the F2
    // refinement parses + re-stringifies with indent 2 so it still renders
    // multi-line. (Tests the "minified JSON" edge case from the G2 brief.)
    const dir = join(root, 'docs/folder/scrapbook');
    writeFileSync(join(dir, 'config.json'), '{"key":"value","nested":{"a":1},"list":["x","y"]}');
    const r = await fetchScrapbook(app, 'd', 'folder');
    // After parse + stringify with indent 2, the output contains a newline
    // between `{` and the first key — i.e. `{\n  &quot;key&quot;`.
    expect(r.html).toMatch(/<pre class="scrap-preview scrap-preview--mono"[^>]*>\{\n {2}&quot;key&quot;/);
  });

  it('txt preview emits a mono <pre>', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<pre class="scrap-preview scrap-preview--mono"[^>]*>[\s\S]*line one/);
  });

  it('renders without throwing on a binary-as-text file (graceful fallback to no preview)', async () => {
    // Add a binary file masquerading as .txt (UTF-8 invalid + NUL bytes — both
    // signal binary; renderPreview must return an empty preview, not crash).
    const dir = join(root, 'docs/folder/scrapbook');
    writeFileSync(join(dir, 'binary.txt'), Buffer.from([0xff, 0xfe, 0x00, 0x00, 0xff, 0xfe]));
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.status).toBe(200);
    // The card for binary.txt is rendered, just possibly with empty preview text.
    expect(r.html).toMatch(/binary\.txt/);
  });

  it('md card meta shows line count after the kind chip + size', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // F3: per-kind extra meta — md/txt show "{N} lines" after the chip + size.
    // Fixture's note.md has 8 newline characters (---, title, author, ---,
    // blank, first-para, blank, second-para each terminated by \n).
    expect(r.html).toMatch(/note\.md[\s\S]*?<span class="scrap-kind scrap-kind--md">MD<\/span>[\s\S]*?<span class="scrap-size">[^<]+<\/span>[\s\S]*?<span>·<\/span>[\s\S]*?<span>8 lines<\/span>/);
  });

  it('txt card meta shows line count', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // log.txt has 3 lines.
    expect(r.html).toMatch(/log\.txt[\s\S]*?<span class="scrap-kind scrap-kind--txt">TXT<\/span>[\s\S]*?<span>3 lines<\/span>/);
  });

  it('json card meta shows key count', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // config.json has top-level keys: "key", "nested" → 2 keys.
    expect(r.html).toMatch(/config\.json[\s\S]*?<span class="scrap-kind scrap-kind--json">JSON<\/span>[\s\S]*?<span>2 keys<\/span>/);
  });

  it('img card meta shows dimensions for a PNG', async () => {
    // Replace the seeded fake-PNG (4 bytes) with a real PNG header so the
    // dimension parser can read width + height. Build a minimal valid PNG
    // header: 8-byte signature + 4-byte IHDR length + "IHDR" + width(BE) +
    // height(BE) + ...
    const dir = join(root, 'docs/folder/scrapbook');
    const png = Buffer.alloc(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // PNG sig
    png.writeUInt32BE(13, 8);                                       // IHDR length
    png.set([0x49, 0x48, 0x44, 0x52], 12);                          // "IHDR"
    png.writeUInt32BE(2400, 16);                                    // width
    png.writeUInt32BE(1600, 20);                                    // height
    writeFileSync(join(dir, 'pic.png'), png);
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/pic\.png[\s\S]*?<span class="scrap-kind scrap-kind--img">IMG<\/span>[\s\S]*?<span>2400 × 1600<\/span>/);
  });

  it('omits per-kind meta when the kind has no extra info to show', async () => {
    // An "other" kind file: no preview, no extra meta, just kind chip + size.
    const dir = join(root, 'docs/folder/scrapbook');
    writeFileSync(join(dir, 'archive.zip'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const r = await fetchScrapbook(app, 'd', 'folder');
    // The card is rendered (name + meta) but has no "·" separator + extra-meta
    // span pair. The regex anchors the assertion to this card by id-region.
    const otherCard = r.html.match(/<li class="scrap-card"[^>]*id="item-\d+"[^>]*>[\s\S]*?<\/li>/g)
      ?.find((s) => s.includes('archive.zip'));
    expect(otherCard).toBeDefined();
    // No "<span>·</span><span>...</span>" inside this card's meta.
    expect(otherCard).not.toMatch(/<span>·<\/span>/);
  });

  it('renders the drop zone after the cards grid (F5)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    // The drop zone follows the </ol> closing the .scrap-cards grid.
    expect(r.html).toMatch(/<\/ol>\s*<div class="scrap-drop"/);
    expect(r.html).toMatch(/role="button"/);
    expect(r.html).toMatch(/data-action="upload"/);
    expect(r.html).toMatch(/drop a file here/i);
  });

  it('omits the secret section when there are no secret items (F5)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).not.toMatch(/<section class="scrap-secret"/);
  });

  it('renders the secret section when secret items exist (F5)', async () => {
    const dir = join(root, 'docs/folder/scrapbook/secret');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'private-note.md'), '---\ntitle: Private\n---\n\nClassified.\n');
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.html).toMatch(/<section class="scrap-secret"/);
    expect(r.html).toMatch(/scrap-secret-mark/);
    expect(r.html).toMatch(/<h2 class="scrap-secret-title">Secret<\/h2>/);
    expect(r.html).toMatch(/scrap-secret-badge/);
    expect(r.html).toMatch(/private-note\.md/);
    // The secret card's mark-secret button label flips to "mark public".
    expect(r.html).toMatch(/data-action="mark-secret"[^>]*>mark public</);
    // Aside totals reflect the secret count.
    expect(r.html).toMatch(/<strong>1<\/strong>\s*secret/);
  });

  it('emits secret-* ids on secret cards to avoid collision with public ids (F5)', async () => {
    const dir = join(root, 'docs/folder/scrapbook/secret');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'private-note.md'), '---\ntitle: Private\n---\n\nClassified.\n');
    const r = await fetchScrapbook(app, 'd', 'folder');
    // Public ids are item-1, item-2, ...; secret ids are secret-item-1, ... so
    // restoreFromHash + aside cross-link can disambiguate.
    expect(r.html).toMatch(/<li class="scrap-card"[^>]*id="secret-item-1"/);
  });

  it('every aside <a> href matches a card id (F4 cross-link contract)', async () => {
    const r = await fetchScrapbook(app, 'd', 'folder');
    const asideHrefs = Array.from(
      r.html.matchAll(/<a href="#(item-\d+)" data-scrap-aside-link/g),
    ).map((m) => m[1]);
    const cardIds = Array.from(
      r.html.matchAll(/<li class="scrap-card"[^>]*id="(item-\d+)"/g),
    ).map((m) => m[1]);
    expect(asideHrefs.length).toBeGreaterThan(0);
    expect(asideHrefs.length).toBe(cardIds.length);
    asideHrefs.forEach((href) => expect(cardIds).toContain(href));
  });

  it('renders the inline new-note composer hidden, with all required fields (#166)', async () => {
    // Phase 34b — the F1 `window.prompt()` regression is replaced with a
    // server-rendered inline composer that the client reveals on
    // `+ new note` click. Form must be present in markup AND hidden by
    // default (so the page doesn't show it unless the operator triggers
    // it). Required fields: filename, body textarea, secret toggle,
    // cancel + save buttons.
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.status).toBe(200);
    // Form is present + hidden + tagged for client lookup.
    expect(r.html).toMatch(/<form[^>]*class="scrap-composer"[^>]*data-scrap-composer[^>]*hidden/);
    // Filename input + body textarea + secret checkbox.
    expect(r.html).toContain('data-composer-filename');
    expect(r.html).toContain('data-composer-body');
    expect(r.html).toContain('data-composer-secret');
    // Cancel + save buttons (data-actions the client wires).
    expect(r.html).toMatch(/data-action="composer-cancel"/);
    expect(r.html).toMatch(/data-action="composer-save"/);
  });

  it('omits the preview block entirely for empty / frontmatter-only files', async () => {
    // Per the G2 amendment, previewExcerpt returns null when the post-strip
    // text is empty/whitespace-only — caller emits no preview block at all
    // (matches "other" kind treatment, prevents the 6rem min-height void).
    const dir = join(root, 'docs/folder/scrapbook');
    writeFileSync(join(dir, 'empty.md'), '');
    writeFileSync(join(dir, 'fm-only.md'), '---\ntitle: Just metadata\n---\n');
    const r = await fetchScrapbook(app, 'd', 'folder');
    expect(r.status).toBe(200);
    // Both cards are rendered (name + meta + foot toolbar) but neither has a
    // .scrap-preview-md or .scrap-preview--mono inside its card body. The
    // inverse-match is anchored to the card's id to scope the assertion.
    const emptyCard = r.html.match(/<li class="scrap-card"[^>]*id="item-\d+"[^>]*>[\s\S]*?<\/li>/g)
      ?.find((s) => s.includes('empty.md'));
    const fmOnlyCard = r.html.match(/<li class="scrap-card"[^>]*id="item-\d+"[^>]*>[\s\S]*?<\/li>/g)
      ?.find((s) => s.includes('fm-only.md'));
    expect(emptyCard).toBeDefined();
    expect(fmOnlyCard).toBeDefined();
    expect(emptyCard).not.toMatch(/scrap-preview-md/);
    expect(emptyCard).not.toMatch(/scrap-preview--mono/);
    expect(fmOnlyCard).not.toMatch(/scrap-preview-md/);
    expect(fmOnlyCard).not.toMatch(/scrap-preview--mono/);
  });
});
