/**
 * Integration test for the Phase 16c scrapbook drawer on the review page.
 *
 * Boots the studio app against a tmp project with a calendar entry +
 * an open review workflow + a scrapbook directory, then asserts that
 * the rendered HTML contains the drawer, the right items, and the
 * empty-state markup when there are no items.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'wc.example',
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

describe('review page — scrapbook drawer (Phase 16c)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-review-scrap-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function startReview(slug: string): void {
    // The pipeline stores the workflow's index outside contentDir;
    // the review page doesn't actually need the markdown file to exist
    // on disk because handleGetWorkflow reads from the workflow store.
    createWorkflow(root, cfg, {
      site: 'wc',
      slug,
      contentKind: 'longform',
      initialMarkdown: '# Galley\n\nbody',
    });
  }

  function seedScrapbook(slug: string, items: Record<string, string>): void {
    const dir = join(root, 'src/content/projects', slug, 'scrapbook');
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(items)) {
      writeFileSync(join(dir, name), body);
    }
  }

  it('renders the drawer with public items for a hierarchical entry', async () => {
    const slug = 'the-outbound/characters/strivers';
    startReview(slug);
    seedScrapbook(slug, {
      'archetypes.md': '# Notes\n',
      'working-quotes.txt':
        '"The strivers were the ones who kept moving."\n— interview, S., 2024-11-09\n',
    });

    const r = await getHtml(app, `/dev/editorial-review/${slug}?site=wc`);
    expect(r.status).toBe(200);

    // Drawer chrome is present.
    expect(r.html).toContain('data-scrapbook-drawer');
    // Dispatch D wraps the § sigil in <em> for typographic emphasis.
    expect(r.html).toContain('<em>§</em> Scrapbook');
    expect(r.html).toContain('2 items');

    // The standalone-viewer "open" link points at the right path.
    expect(r.html).toContain(`/dev/scrapbook/wc/${encodeURI(slug)}`);

    // Each scrapbook item appears in the drawer with kind chip + filename.
    expect(r.html).toContain('archetypes.md');
    expect(r.html).toContain('working-quotes.txt');
    // Text kind gets an inline-truncated preview.
    expect(r.html).toContain('scrap__inline-preview');
    expect(r.html).toContain('strivers were the ones who kept moving');

    // Drawer is read-only — no toolbar elements.
    expect(r.html).not.toContain('data-action="rename"');
    expect(r.html).not.toContain('data-action="delete"');
  });

  it('renders the empty-state when the scrapbook directory has no items (Issue 6)', async () => {
    const slug = 'flat-essay';
    startReview(slug);

    const r = await getHtml(app, `/dev/editorial-review/${slug}?site=wc`);
    expect(r.status).toBe(200);
    expect(r.html).toContain('data-scrapbook-drawer');
    expect(r.html).toContain('0 items');
    // Issue 6: the empty-state copy now invites action and links to
    // the per-entry scrapbook viewer.
    expect(r.html).toContain('No items yet.');
    expect(r.html).toContain('Drop research notes →');
    expect(r.html).toContain(`href="/dev/scrapbook/wc/${slug}"`);
  });

  it('renders the empty-state when the scrapbook dir does not exist (Issue 6)', async () => {
    const slug = 'no-scrapbook-here';
    startReview(slug);
    // No seedScrapbook call → directory simply isn't there.

    const r = await getHtml(app, `/dev/editorial-review/${slug}?site=wc`);
    expect(r.status).toBe(200);
    expect(r.html).toContain('No items yet.');
    expect(r.html).toContain('Drop research notes →');
    expect(r.html).toContain(`href="/dev/scrapbook/wc/${slug}"`);
    // The drawer chrome still renders so the operator sees the
    // affordance for this node.
    // Dispatch D wraps the § sigil in <em> for typographic emphasis.
    expect(r.html).toContain('<em>§</em> Scrapbook');
  });

  it('separates secret items into their own subsection', async () => {
    const slug = 'with-secrets';
    startReview(slug);
    const dir = join(root, 'src/content/projects', slug, 'scrapbook');
    mkdirSync(join(dir, 'secret'), { recursive: true });
    writeFileSync(join(dir, 'public.md'), '# public\n');
    writeFileSync(join(dir, 'secret', 'private.md'), '# private\n');

    const r = await getHtml(app, `/dev/editorial-review/${slug}?site=wc`);
    expect(r.status).toBe(200);
    expect(r.html).toContain('public.md');
    expect(r.html).toContain('private.md');
    expect(r.html).toContain('er-scrapbook-drawer-secret');
    expect(r.html).toContain('2 items'); // public + secret count together
  });

  it('marginalia empty state — short, action-oriented copy (Issue 6)', async () => {
    const slug = 'flat-essay';
    startReview(slug);

    const r = await getHtml(app, `/dev/editorial-review/${slug}?site=wc`);
    expect(r.status).toBe(200);
    // Issue 6: the marginalia empty-state copy was tightened to a
    // single short sentence with "margin note" emphasized.
    expect(r.html).toContain(
      '<p class="er-marginalia-empty" data-sidebar-empty>Select text in the draft to leave a <em>margin note</em>.</p>',
    );
    // Defensive: the prior multi-clause copy is gone — no operator
    // should ever see "click the floating Mark pencil" again.
    expect(r.html).not.toContain('click the floating');
  });
});
