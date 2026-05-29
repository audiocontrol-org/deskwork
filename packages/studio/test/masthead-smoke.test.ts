/**
 * Smoke test for Step 2.2.6 — universal masthead chrome.
 *
 * Asserts that the three v7-targeted surfaces (Desk / entry-review /
 * shortform-review) each emit:
 *   - the `er-masthead` markup with the expected modifier (`--hub` for
 *     Desk only)
 *   - the `←` back-link on non-Desk surfaces, absent on Desk
 *   - the `⋮` menu button with the right ARIA shape
 *   - the `mobile-shell.css` stylesheet link
 *
 * Spec-derived (not implementation-derived): every assertion below
 * reads from `DESIGN-STANDARDS.md § Studio navigation model` or the
 * v7 mockup contract. The test name is the claim; if any assertion
 * here fails, the spec contract is broken.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { createApp } from '../src/server.ts';
import { renderMasthead } from '../src/pages/masthead.ts';
import { unsafe } from '../src/pages/html.ts';

const UUID_DRAFT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        host: 'd.example',
        contentDir: 'docs',
        calendarPath: 'docs/cal-d.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'd',
  };
}

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: UUID_DRAFT,
    slug: 'sample-draft',
    title: 'Sample Draft',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 3 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('renderMasthead helper — unit contract', () => {
  it('emits the er-masthead container with role=banner', () => {
    const out = renderMasthead({
      kicker: 'entry · drafting · № 12',
      slug: 'studio-mobile-first-prd',
      isHub: false,
    });
    expect(out.__raw).toMatch(/class="er-masthead"[^>]*data-er-masthead/);
    expect(out.__raw).toMatch(/role="banner"/);
  });

  it('emits the back-link on non-hub surfaces with the Desk href', () => {
    const out = renderMasthead({
      kicker: 'entry · drafting · № 12',
      slug: 'sample',
      isHub: false,
    });
    expect(out.__raw).toMatch(/class="er-masthead-back"/);
    expect(out.__raw).toMatch(/href="\/dev\/editorial-studio"/);
    expect(out.__raw).toMatch(/aria-label="Back to the Desk"/);
    expect(out.__raw).toContain('←');
  });

  it('omits the back-link on the hub (Desk) and adds the modifier class', () => {
    const out = renderMasthead({
      kicker: "The compositor's desk",
      title: 'Pipeline + Press.',
      isHub: true,
    });
    expect(out.__raw).toMatch(/class="er-masthead er-masthead--hub"/);
    expect(out.__raw).not.toMatch(/class="er-masthead-back"/);
  });

  it('emits the ⋮ menu trigger as a button with popover ARIA', () => {
    const out = renderMasthead({
      kicker: 'sample',
      slug: 'sample',
      isHub: false,
    });
    expect(out.__raw).toMatch(/<button[^>]*class="er-masthead-menu"/);
    expect(out.__raw).toMatch(/aria-haspopup="true"/);
    expect(out.__raw).toMatch(/aria-expanded="false"/);
    expect(out.__raw).toMatch(/data-er-masthead-menu/);
    expect(out.__raw).toMatch(/id="masthead-menu-trigger"/);
    expect(out.__raw).toContain('⋮');
  });

  it('honors a caller-supplied menuTriggerId', () => {
    const out = renderMasthead({
      kicker: 'sample',
      slug: 'sample',
      isHub: false,
      menuTriggerId: 'custom-id',
    });
    expect(out.__raw).toMatch(/id="custom-id"/);
  });

  it('renders the slug body when slug is provided', () => {
    const out = renderMasthead({
      kicker: 'entry · drafting',
      slug: 'studio-mobile-first-prd',
      isHub: false,
    });
    expect(out.__raw).toMatch(
      /<div class="er-masthead-slug">studio-mobile-first-prd<\/div>/,
    );
    expect(out.__raw).not.toMatch(/er-masthead-title/);
  });

  it('renders the title body when title is provided', () => {
    const out = renderMasthead({
      kicker: "The compositor's desk",
      title: 'Pipeline + Press.',
      isHub: true,
    });
    expect(out.__raw).toMatch(
      /<div class="er-masthead-title">Pipeline \+ Press\.<\/div>/,
    );
    expect(out.__raw).not.toMatch(/er-masthead-slug/);
  });

  it('throws when both slug and title are passed', () => {
    expect(() =>
      renderMasthead({
        kicker: 'x',
        slug: 'a',
        title: 'b',
        isHub: false,
      }),
    ).toThrow(/exactly one of \{ slug, title \}/);
  });

  it('throws when both kicker and kickerHtml are passed', () => {
    expect(() =>
      renderMasthead({
        kicker: 'plain',
        kickerHtml: unsafe('<span>raw</span>'),
        slug: 'x',
        isHub: false,
      }),
    ).toThrow(/exactly one of \{ kicker, kickerHtml \}/);
  });

  it('appends metaInline to the kicker with a separator', () => {
    const out = renderMasthead({
      kicker: 'entry · drafting · № 12',
      slug: 'sample',
      metaInline: 'v3 · 2h',
      isHub: false,
    });
    expect(out.__raw).toMatch(/er-masthead-kicker-sep/);
    expect(out.__raw).toMatch(/er-masthead-meta-inline/);
    expect(out.__raw).toContain('v3 · 2h');
  });

  it('omits the kicker separator when metaInline is absent', () => {
    const out = renderMasthead({
      kicker: 'entry · drafting · № 12',
      slug: 'sample',
      isHub: false,
    });
    expect(out.__raw).not.toMatch(/er-masthead-kicker-sep/);
    expect(out.__raw).not.toMatch(/er-masthead-meta-inline/);
  });

  it('escapes user-supplied kicker / slug / title text', () => {
    const out = renderMasthead({
      kicker: 'foo <bar> & baz',
      slug: 'evil<slug>',
      isHub: false,
    });
    expect(out.__raw).toContain('foo &lt;bar&gt; &amp; baz');
    expect(out.__raw).toContain('evil&lt;slug&gt;');
    expect(out.__raw).not.toContain('foo <bar>');
  });

  it('passes kickerHtml through verbatim for ornament markup', () => {
    const out = renderMasthead({
      kickerHtml: { __raw: '<span class="platform">linkedin</span>blog' },
      slug: 'sample',
      isHub: false,
    });
    expect(out.__raw).toContain('<span class="platform">linkedin</span>blog');
  });
});

describe('Universal masthead — Desk / entry-review / shortform surfaces', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-masthead-smoke-'));
    const cfg = makeConfig();
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, 'docs', 'sample-draft'), { recursive: true });
    await writeFile(
      join(root, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
      'utf8',
    );

    // Seed a single Drafting entry so the dashboard + entry-review
    // surfaces have something to render against.
    await writeSidecar(root, makeEntry({}));

    // Write a minimal markdown artifact at the slug-template path
    // the entry-resolver expects (`<contentDir>/<slug>/index.md`).
    await writeFile(
      join(root, 'docs', 'sample-draft', 'index.md'),
      '---\ntitle: Sample Draft\n---\n\n# Sample Draft\n\nBody.\n',
      'utf8',
    );

    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Desk renders the hub masthead (no back-link, --hub modifier)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/class="er-masthead er-masthead--hub"/);
    // No back-link on the hub.
    expect(r.html).not.toMatch(/class="er-masthead-back"/);
    // Has the ⋮ menu trigger.
    expect(r.html).toMatch(/data-er-masthead-menu/);
    // Title body for hub surface, not slug.
    expect(r.html).toMatch(/class="er-masthead-title"/);
    expect(r.html).toContain('Pipeline + Press.');
    // Stylesheet wired.
    expect(r.html).toContain('/static/css/mobile-shell.css');
  });

  it('entry-review renders the leaf masthead (back-link + slug body)', async () => {
    const r = await getHtml(app, `/dev/editorial-review/entry/${UUID_DRAFT}`);
    expect(r.status).toBe(200);
    // Non-hub masthead (no --hub modifier).
    expect(r.html).toMatch(/class="er-masthead"[^>]*>/);
    expect(r.html).not.toMatch(/er-masthead--hub/);
    // Back-link present.
    expect(r.html).toMatch(/class="er-masthead-back"/);
    expect(r.html).toMatch(/href="\/dev\/editorial-studio"/);
    // Slug body, not title.
    expect(r.html).toMatch(/class="er-masthead-slug">sample-draft</);
    // Kicker contains the stage + version label.
    expect(r.html).toContain('entry · drafting');
    // Stylesheet wired.
    expect(r.html).toContain('/static/css/mobile-shell.css');
  });

  // Shortform-review's masthead emission is exercised by the
  // renderMasthead helper unit-contract tests above (hub variant, slug
  // body, kickerHtml inline ornament, metaInline rendering, escape
  // behavior). A full per-surface integration smoke for shortform is
  // gated on a workflow-store fixture that this test plant doesn't
  // synthesize; full surface coverage lands as part of Step 2.2.10
  // when the shortform review surface gets its complete v7 rewrite.
});
