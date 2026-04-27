/**
 * Integration tests for the Phase 17 studio index page at `/dev/`.
 *
 * The index is the entry-point landing page: a TOC of every studio
 * surface, framed by the cross-page folio strip. These tests assert the
 * page returns 200, includes the folio with `Index` marked active, and
 * lists every surface (one link or templated route per entry).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'writingcontrol.example',
        contentDir: 'src/content/projects',
        calendarPath: 'docs/cal.md',
        blogFilenameTemplate: '{slug}/index.md',
      },
    },
    defaultSite: 'wc',
  };
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('studio index page', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-index-'));
    const cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 200 at /dev/', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.status).toBe(200);
  });

  it('returns 200 at /dev (no trailing slash)', async () => {
    const r = await getHtml(app, '/dev');
    expect(r.status).toBe(200);
  });

  it('renders the cross-page folio strip', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toContain('class="er-folio"');
    expect(r.html).toContain('class="er-folio-inner"');
    expect(r.html).toContain('deskwork <em>STUDIO</em>');
  });

  it('marks the Index nav link active', async () => {
    const r = await getHtml(app, '/dev/');
    // Active link has class="active" and points at /dev/.
    expect(r.html).toMatch(/class="active"\s+href="\/dev\/"\s*>\s*Index\s*</);
  });

  it('renders all 5 nav links pointing at the right routes', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toMatch(/href="\/dev\/"[^>]*>\s*Index\s*</);
    expect(r.html).toContain('href="/dev/editorial-studio">Dashboard</a>');
    expect(r.html).toContain('href="/dev/content">Content</a>');
    expect(r.html).toContain(
      'href="/dev/editorial-review-shortform">Reviews</a>',
    );
    expect(r.html).toContain('href="/dev/editorial-help">Manual</a>');
  });

  it('renders the TOC with the volume head', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toContain('class="er-toc-page"');
    // CSF-3 (v0.6.0): the index now uses the unified er-pagehead with
    // a --toc modifier that adds the pressed-ornament rule treatment.
    expect(r.html).toMatch(/class="er-pagehead[^"]*er-pagehead--toc/);
    // Title proper.
    expect(r.html).toContain('Editorial');
    expect(r.html).toContain('Studio');
  });

  it('renders all 4 sections by name', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toContain('Pipeline');
    expect(r.html).toContain('Review desk');
    expect(r.html).toContain('Browse');
    expect(r.html).toContain('Reference');
  });

  it('lists all 6 entries with their routes', async () => {
    const r = await getHtml(app, '/dev/');
    // Concrete-route entries link directly.
    expect(r.html).toContain(
      'class="er-toc-entry__title" href="/dev/editorial-studio">Dashboard</a>',
    );
    expect(r.html).toContain(
      'class="er-toc-entry__title" href="/dev/editorial-review-shortform">Shortform reviews</a>',
    );
    expect(r.html).toContain(
      'class="er-toc-entry__title" href="/dev/content">Content view</a>',
    );
    expect(r.html).toContain(
      'class="er-toc-entry__title" href="/dev/editorial-help">',
    );
    // Concrete route paths shown as the "page number".
    expect(r.html).toContain(
      '<span class="er-toc-entry__route">/dev/editorial-studio</span>',
    );
    expect(r.html).toContain(
      '<span class="er-toc-entry__route">/dev/content</span>',
    );
    // Templated routes (longform reviews, scrapbook) render the
    // placeholder in red-pencil italic.
    expect(r.html).toContain('is-template');
    expect(r.html).toContain('/dev/editorial-review/');
    expect(r.html).toContain('<em>&lt;slug&gt;</em>');
    expect(r.html).toContain('/dev/scrapbook/');
    expect(r.html).toContain('<em>&lt;site&gt;/&lt;path&gt;</em>');
  });

  it('loads the editorial-nav stylesheet', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toContain('/static/css/editorial-nav.css');
    // Reuses the existing editorial-print tokens.
    expect(r.html).toContain('/static/css/editorial-review.css');
  });

  it('scopes the page under data-review-ui so the er-* CSS resolves', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toContain('data-review-ui="studio"');
  });

  it('renders the colophon at the foot of the index', async () => {
    const r = await getHtml(app, '/dev/');
    expect(r.html).toContain('er-toc-colophon');
    expect(r.html).toContain('Pressed in the deskwork studio');
  });
});

describe('root redirect', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-index-root-'));
    const cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('GET / redirects to /dev/ (not the dashboard)', async () => {
    const res = await app.fetch(new Request('http://x/'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/');
  });
});
