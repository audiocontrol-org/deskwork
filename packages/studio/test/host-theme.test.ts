/**
 * Smoke tests for host-theme auto-discovery. Builds a fixture project
 * tree on disk that mirrors the audiocontrol convention and verifies
 * deskwork picks up the right CSS files + extracts inline `<style>`
 * blocks from .astro components.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DeskworkConfig } from '@deskwork/core/config';
import {
  discoverHostTheme,
  extractStyleBlocks,
  hostThemeUrl,
} from '../src/host-theme.ts';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      ec: {
        host: 'editorialcontrol.example',
        contentDir: 'src/sites/ec/content/blog',
        calendarPath: 'docs/cal-ec.md',
        blogFilenameTemplate: '{slug}/index.md',
      },
    },
    defaultSite: 'ec',
  };
}

describe('extractStyleBlocks', () => {
  it('extracts every <style> block and trims', () => {
    const src = `
      ---
      const x = 1;
      ---
      <html>
        <style>
          .foo { color: red; }
        </style>
        <body>
          <h1>hi</h1>
          <style>
            .bar { color: blue; }
          </style>
        </body>
      </html>
    `;
    const out = extractStyleBlocks(src);
    expect(out).toContain('.foo { color: red; }');
    expect(out).toContain('.bar { color: blue; }');
    // The extracted CSS should not contain the surrounding HTML
    expect(out).not.toContain('<style>');
    expect(out).not.toContain('<body>');
  });

  it('returns empty string when no <style> blocks', () => {
    expect(extractStyleBlocks('<html><body>no styles</body></html>')).toBe('');
  });
});

describe('discoverHostTheme', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-host-theme-'));
    cfg = makeConfig();
    // Audiocontrol-style layout: src/sites/ec/{content/blog, styles, layouts}
    const siteRoot = join(root, 'src/sites/ec');
    mkdirSync(join(siteRoot, 'content/blog'), { recursive: true });
    mkdirSync(join(siteRoot, 'styles'), { recursive: true });
    mkdirSync(join(siteRoot, 'layouts'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds CSS files in styles/', () => {
    const stylesDir = join(root, 'src/sites/ec/styles');
    writeFileSync(join(stylesDir, 'design-tokens.css'), ':root { --c: red; }');
    writeFileSync(join(stylesDir, 'fonts.css'), '@font-face { font-family: A; }');
    // Non-CSS files are ignored
    writeFileSync(join(stylesDir, 'README.md'), '# notes');

    const assets = discoverHostTheme(root, cfg, 'ec');
    const filenames = assets.map((a) => a.filename).sort();
    expect(filenames).toContain('design-tokens.css');
    expect(filenames).toContain('fonts.css');
    expect(filenames).not.toContain('README.md');
  });

  it('extracts inline <style> from layouts/*.astro', () => {
    writeFileSync(
      join(root, 'src/sites/ec/layouts/BlogLayout.astro'),
      `---
const x = 1;
---
<html>
  <body>
    <slot />
  </body>
</html>
<style>
  .essay { padding: 3rem; }
  .essay-title { font-size: 2rem; }
</style>`,
    );

    const assets = discoverHostTheme(root, cfg, 'ec');
    const inline = assets.find((a) => a.filename === 'layouts-inline.css');
    expect(inline).toBeDefined();
    expect(inline?.content).toContain('.essay { padding: 3rem; }');
    expect(inline?.content).toContain('.essay-title { font-size: 2rem; }');
    // Header comment names the source file for traceability
    expect(inline?.content).toContain('layouts/BlogLayout.astro');
  });

  it('returns empty when no styles or layouts exist', () => {
    expect(discoverHostTheme(root, cfg, 'ec')).toEqual([]);
  });

  it('returns empty for unknown site', () => {
    expect(() => discoverHostTheme(root, cfg, 'unknown')).toThrow();
  });
});

describe('GET /static/host-theme/:site/:filename', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-host-theme-route-'));
    cfg = makeConfig();
    const stylesDir = join(root, 'src/sites/ec/styles');
    mkdirSync(stylesDir, { recursive: true });
    mkdirSync(join(root, 'src/sites/ec/content/blog'), { recursive: true });
    writeFileSync(
      join(stylesDir, 'design-tokens.css'),
      ':root { --c: red; }',
    );
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('serves a discovered CSS asset', async () => {
    const res = await app.fetch(
      new Request(`http://x${hostThemeUrl('ec', 'design-tokens.css')}`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
    const body = await res.text();
    expect(body).toBe(':root { --c: red; }');
  });

  it('returns 404 for unknown filename', async () => {
    const res = await app.fetch(
      new Request(`http://x${hostThemeUrl('ec', 'no-such.css')}`),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown site', async () => {
    const res = await app.fetch(
      new Request(`http://x${hostThemeUrl('nope', 'design-tokens.css')}`),
    );
    expect(res.status).toBe(404);
  });
});
