/**
 * Folio `aria-current="page"` correctness for the `/dev/lanes` and
 * `/dev/pipelines` surfaces.
 *
 * Closes AUDIT-20260530-76 (cross-model: AUDIT-BARRAGE-codex-P6-2):
 * both new pages previously called `renderEditorialFolio('dashboard', …)`,
 * which mapped to `aria-current="page"` on the Dashboard nav anchor —
 * assistive tech was told "you are on the Dashboard" while the operator
 * was on Lanes or Pipelines. Incorrect link semantics.
 *
 * The fix mirrors the existing `'longform'` precedent in `chrome.ts`:
 * both lanes + pipelines surfaces carry a "no nav match" active key
 * (`'lanes'` / `'pipelines'`), so no nav-item gets `aria-current="page"`
 * or `class="active"`. The folio is still rendered; it just doesn't
 * lie about which destination the operator landed on.
 *
 * Test contract (mirrors `folio-cross-page.test.ts`):
 *   1. NO nav anchor inside `<nav class="er-folio-nav">` carries
 *      `class="active"`.
 *   2. NO nav anchor inside `<nav class="er-folio-nav">` carries
 *      `aria-current="page"`.
 *   3. The Dashboard nav anchor specifically does NOT carry
 *      `aria-current="page"` (this is the symptom the audit caught).
 *   4. All 5 folio nav links are still present at their canonical
 *      routes (regression guard — the fix must not drop nav items).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'd',
  };
}

function writeLane(
  root: string,
  id: string,
  pipelineTemplate: string,
): void {
  const json = { id, name: id, pipelineTemplate, contentDir: id };
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(json, null, 2),
    'utf8',
  );
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

function extractFolioNavBlock(html: string): string {
  const folioStart = html.indexOf('er-folio-nav');
  expect(folioStart, 'er-folio-nav must be present').toBeGreaterThan(0);
  const folioEnd = html.indexOf('</nav>', folioStart);
  expect(folioEnd, 'er-folio-nav must close with </nav>').toBeGreaterThan(
    folioStart,
  );
  return html.slice(folioStart, folioEnd);
}

interface Surface {
  readonly name: string;
  readonly path: string;
}

const SURFACES: readonly Surface[] = [
  { name: '/dev/lanes', path: '/dev/lanes' },
  { name: '/dev/pipelines', path: '/dev/pipelines' },
];

describe('editorial folio — aria-current on lanes + pipelines pages', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-folio-aria-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
    writeLane(root, 'docs', 'editorial');
    writeLane(root, 'mockups', 'visual');
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  for (const surface of SURFACES) {
    describe(surface.name, () => {
      it('returns 200 HTML', async () => {
        const r = await getHtml(app, surface.path);
        expect(r.status).toBe(200);
      });

      it('renders the er-folio strip', async () => {
        const r = await getHtml(app, surface.path);
        expect(r.html).toContain('class="er-folio-nav"');
      });

      it('does NOT mark the Dashboard link as the current page', async () => {
        const r = await getHtml(app, surface.path);
        // The bug shape: chrome.ts emits
        //   <a class="active" href="/dev/editorial-studio" aria-current="page">Dashboard</a>
        // on lanes + pipelines because both pages pass 'dashboard'. The
        // fix passes a "no nav match" key so the Dashboard anchor stays
        // plain. Assert directly against the Dashboard anchor markup so
        // a regression jumps out at the file:line cited in the finding.
        const re = new RegExp(
          'class="active"\\s+href="/dev/editorial-studio"\\s+aria-current="page"\\s*>\\s*Dashboard\\s*<',
        );
        expect(r.html).not.toMatch(re);
      });

      it('marks NO folio nav anchor as the current page', async () => {
        const r = await getHtml(app, surface.path);
        const folioBlock = extractFolioNavBlock(r.html);
        // Zero `aria-current="page"` inside the folio nav block —
        // lanes + pipelines do not have a dedicated nav-item so the
        // correct shape is "no link is current."
        const ariaCurrents =
          folioBlock.match(/aria-current="page"/g) ?? [];
        expect(ariaCurrents.length).toBe(0);
      });

      it('marks NO folio nav anchor with class="active"', async () => {
        const r = await getHtml(app, surface.path);
        const folioBlock = extractFolioNavBlock(r.html);
        const actives = folioBlock.match(/class="active"/g) ?? [];
        expect(actives.length).toBe(0);
      });

      it('keeps all 5 folio nav links pointing at their canonical routes', async () => {
        // Regression guard: the "no current" fix must not drop or
        // rename any nav-item.
        const r = await getHtml(app, surface.path);
        expect(r.html).toMatch(/href="\/dev\/"[^>]*>\s*Index\s*</);
        expect(r.html).toMatch(
          /href="\/dev\/editorial-studio"[^>]*>\s*Dashboard\s*</,
        );
        expect(r.html).toMatch(/href="\/dev\/content"[^>]*>\s*Content\s*</);
        expect(r.html).toMatch(
          /href="\/dev\/editorial-review-shortform"[^>]*>\s*Shortform\s*</,
        );
        expect(r.html).toMatch(
          /href="\/dev\/editorial-help"[^>]*>\s*Manual\s*</,
        );
      });
    });
  }
});
