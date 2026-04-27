/**
 * Cross-page integration tests for the Phase 17 editorial folio strip.
 *
 * For each of the 6 studio surfaces, assert:
 *   1. The rendered HTML includes the er-folio markup.
 *   2. The correct nav link is marked active for the current surface.
 *   3. All 5 nav links are present, each pointing at the right route.
 *   4. The editorial-nav stylesheet is loaded.
 *
 * The longform review has two render paths (error + main); we exercise
 * the error path because that's reachable without provisioning a draft.
 * The main path is covered separately by api.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
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

function buildBaseFixture(root: string, cfg: DeskworkConfig): void {
  // Empty calendar — sufficient for dashboard, content, scrapbook, etc.
  const cal: EditorialCalendar = { entries: [], distributions: [] };
  const calendarPath = join(root, cfg.sites.wc.calendarPath);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(calendarPath, cal);
  // Scrapbook page wants an existing site dir so listScrapbook doesn't
  // throw before reaching the empty branch.
  mkdirSync(join(root, 'src/content/projects'), { recursive: true });
  // Provision an empty file inside the scrapbook target to avoid the
  // "site dir missing" code path; the directory listing is what matters.
  const scrapTarget = join(root, 'src/content/projects/some-post');
  mkdirSync(scrapTarget, { recursive: true });
  writeFileSync(join(scrapTarget, '.gitkeep'), '');
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

interface SurfaceCase {
  /** Human-readable label for `it()`. */
  name: string;
  /** Route to fetch. */
  path: string;
  /** Which folio nav link should carry `class="active"`. */
  expectedActive: 'index' | 'dashboard' | 'content' | 'reviews' | 'manual';
  /** The label of the active nav anchor (matches the link text). */
  activeLabel: string;
  /** Status that the route returns. */
  expectedStatus: number;
}

const SURFACES: readonly SurfaceCase[] = [
  {
    name: '/dev/ (studio index)',
    path: '/dev/',
    expectedActive: 'index',
    activeLabel: 'Index',
    expectedStatus: 200,
  },
  {
    name: '/dev/editorial-studio (dashboard)',
    path: '/dev/editorial-studio',
    expectedActive: 'dashboard',
    activeLabel: 'Dashboard',
    expectedStatus: 200,
  },
  {
    name: '/dev/content (bird\'s-eye content view)',
    path: '/dev/content',
    expectedActive: 'content',
    activeLabel: 'Content',
    expectedStatus: 200,
  },
  {
    name: '/dev/editorial-review-shortform (shortform desk)',
    path: '/dev/editorial-review-shortform',
    expectedActive: 'reviews',
    activeLabel: 'Reviews',
    expectedStatus: 200,
  },
  {
    name: '/dev/editorial-help (compositor\'s manual)',
    path: '/dev/editorial-help',
    expectedActive: 'manual',
    activeLabel: 'Manual',
    expectedStatus: 200,
  },
  {
    name: '/dev/scrapbook/wc/some-post (scrapbook viewer)',
    path: '/dev/scrapbook/wc/some-post',
    expectedActive: 'content',
    activeLabel: 'Content',
    expectedStatus: 200,
  },
  {
    // The longform review with no workflow renders the error variant —
    // this is the surface every reachable longform URL falls back to
    // before a draft has been started, and it's the simplest fixture.
    name: '/dev/editorial-review/<unknown> (longform, error path)',
    path: '/dev/editorial-review/no-such-slug?site=wc',
    expectedActive: 'reviews',
    activeLabel: 'Reviews',
    expectedStatus: 200,
  },
];

describe('editorial folio — cross-page', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-folio-'));
    const cfg = makeConfig();
    buildBaseFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  for (const surface of SURFACES) {
    describe(surface.name, () => {
      it('returns the expected status', async () => {
        const r = await getHtml(app, surface.path);
        expect(r.status).toBe(surface.expectedStatus);
      });

      it('renders the er-folio strip', async () => {
        const r = await getHtml(app, surface.path);
        expect(r.html).toContain('class="er-folio"');
        expect(r.html).toContain('class="er-folio-inner"');
        // Wordmark.
        expect(r.html).toContain('deskwork <em>STUDIO</em>');
      });

      it(`marks ${surface.activeLabel} as the active nav link`, async () => {
        const r = await getHtml(app, surface.path);
        // Pattern: <a class="active" href="<route>">Label</a>
        const re = new RegExp(
          `class="active"\\s+href="[^"]+"\\s*>\\s*${surface.activeLabel}\\s*<`,
        );
        expect(r.html).toMatch(re);
      });

      it('contains all 5 nav links pointing at the right routes', async () => {
        const r = await getHtml(app, surface.path);
        // Each link present with its route.
        expect(r.html).toMatch(/href="\/dev\/"[^>]*>\s*Index\s*</);
        expect(r.html).toMatch(
          /href="\/dev\/editorial-studio"[^>]*>\s*Dashboard\s*</,
        );
        expect(r.html).toMatch(/href="\/dev\/content"[^>]*>\s*Content\s*</);
        expect(r.html).toMatch(
          /href="\/dev\/editorial-review-shortform"[^>]*>\s*Reviews\s*</,
        );
        expect(r.html).toMatch(
          /href="\/dev\/editorial-help"[^>]*>\s*Manual\s*</,
        );
      });

      it('loads the editorial-nav stylesheet', async () => {
        const r = await getHtml(app, surface.path);
        expect(r.html).toContain('/static/css/editorial-nav.css');
      });

      it('marks at most one nav link active', async () => {
        const r = await getHtml(app, surface.path);
        const matches = r.html.match(/class="active"/g) ?? [];
        // The folio has one active link. The page body may carry other
        // `.active` classes (filter chips on the dashboard, etc.) — so
        // we only assert that the folio contributes exactly one `class="active"`
        // ANCHOR within the er-folio-nav block.
        const folioStart = r.html.indexOf('er-folio-nav');
        const folioEnd = r.html.indexOf('</nav>', folioStart);
        const folioBlock = r.html.slice(folioStart, folioEnd);
        const folioActives = folioBlock.match(/class="active"/g) ?? [];
        expect(folioActives.length).toBe(1);
        // Sanity: the page rendered something.
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });
  }
});
