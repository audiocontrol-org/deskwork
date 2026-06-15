/**
 * Shared fixture + HTML-extraction helpers for the dashboard-
 * swimlane integration test suites.
 *
 * Originally a single 1444-line test file lived alongside the studio's
 * source as `test/dashboard-swimlane.test.ts`. Per AUDIT-20260528-14
 * the file exceeded the project's 300-500 line per-file cap; it has
 * been split into per-feature sibling files (collapse, list, cta,
 * overflow-sheet) that each import the helpers from here. The shared
 * fixture builds the same three-lane on-disk project the original
 * file's `beforeEach` constructed, so every split file sees the same
 * baseline.
 *
 * Pure integration — uses real sidecars, real lane configs, real
 * pipeline templates. No mocks. Per `.claude/rules/testing.md`,
 * fixture project trees live on disk via `mkdtempSync`.
 */

import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { writeLaneConfig } from './write-lane-config.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { createApp } from '../../src/server.ts';

export const UUID_EDITORIAL_DRAFTING = '11111111-1111-4111-8111-111111111111';
export const UUID_VISUAL_SKETCHED = '22222222-2222-4222-8222-222222222222';
export const UUID_VISUAL_APPROVED = '33333333-3333-4333-8333-333333333333';
export const UUID_QA_DRAFTED = '44444444-4444-4444-8444-444444444444';

export function makeConfig(): DeskworkConfig {
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

export function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: UUID_EDITORIAL_DRAFTING,
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: { Ideas: 0 },
    createdAt: '2026-05-27T10:00:00.000Z',
    updatedAt: '2026-05-27T10:00:00.000Z',
    ...overrides,
  };
}

// Phase 39: the lane-config writer lives in one place
// (`./write-lane-config.ts`). Re-exported as `writeLane` so existing
// importers of this fixture keep resolving; also bound locally (the
// `export { … } from` form does NOT create a local binding) so the
// fixture builders below can call it. A lane carries no contentDir; the
// dir argument lands under scaffoldDefaults.markdown.
export { writeLaneConfig as writeLane };

export async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

/**
 * Standard three-lane fixture: editorial (default) + visual (mockups)
 * + qa-plan (qa). Returns `{ root, app, cleanup }` — the caller is
 * responsible for invoking `cleanup()` in `afterEach`. The bootstrap
 * helper sees `default.json` on disk and short-circuits without
 * writing — that's the legitimate multi-lane configuration.
 */
export async function setupDashboardFixture(): Promise<{
  root: string;
  app: ReturnType<typeof createApp>;
  cleanup: () => void;
}> {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-dash-swimlane-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });

  writeLaneConfig(root, 'default', 'Editorial', 'editorial', 'docs');
  writeLaneConfig(root, 'mockups', 'Mockups', 'visual', 'mockups');
  writeLaneConfig(root, 'qa', 'QA', 'qa-plan', 'qa');

  const app = createApp({ projectRoot: root, config: makeConfig() });

  // One entry per lane in different stages so we can verify the
  // template-driven stage columns show up correctly.
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_EDITORIAL_DRAFTING,
      slug: 'a-draft',
      title: 'A Draft',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
      lane: 'default',
    }),
  );
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_VISUAL_SKETCHED,
      slug: 'logo-rough',
      title: 'Logo rough',
      currentStage: 'Sketched',
      iterationByStage: { Sketched: 0 },
      lane: 'mockups',
    }),
  );
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_VISUAL_APPROVED,
      slug: 'icon-set',
      title: 'Icon set',
      currentStage: 'Approved',
      iterationByStage: { Approved: 0 },
      lane: 'mockups',
    }),
  );
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_QA_DRAFTED,
      slug: 'release-qa',
      title: 'Release QA',
      currentStage: 'Drafted',
      iterationByStage: { Drafted: 0 },
      lane: 'qa',
    }),
  );

  return {
    root,
    app,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Extract the substring of HTML from a `<article class="swim"
 * data-lane-id="<id>"` to its closing `</article>`. Used to scope
 * per-lane assertions so a Drafting column in editorial doesn't
 * leak into mockups-lane assertions.
 */
export function extractLaneSection(html: string, laneId: string): string {
  // Matches `<article class="swim"` or `<article class="swim swim--<id>"`
  // — the template-id modifier means the regex tolerates additional
  // class tokens before the `data-lane-id` attribute.
  const openPattern = new RegExp(
    `<article class="swim(?:\\s[^"]*)?"[^>]*data-lane-id="${laneId}"`,
  );
  const openMatch = openPattern.exec(html);
  if (openMatch === null) return '';
  const startIdx = openMatch.index;
  const closeIdx = html.indexOf('</article>', startIdx);
  if (closeIdx === -1) return html.slice(startIdx);
  return html.slice(startIdx, closeIdx + '</article>'.length);
}

export function extractStageCols(htmlSection: string): readonly string[] {
  return htmlSection.match(/data-stage-col="[^"]+"/g) ?? [];
}

/**
 * Extract the substring of HTML between a swim's `<div class="stage-
 * grid">` opening and its closing tag. Task 5.1B added a sibling
 * `<div class="list-body">` — when callers want to assert kanban-
 * specific markup without leaking into list-body matches, slice the
 * stage-grid section first.
 */
export function extractStageGridSection(htmlSection: string): string {
  const openIdx = htmlSection.indexOf('<div class="stage-grid"');
  if (openIdx === -1) return '';
  const sentinel = '<div class="list-body"';
  const closeIdx = htmlSection.indexOf(sentinel, openIdx);
  if (closeIdx === -1) return htmlSection.slice(openIdx);
  return htmlSection.slice(openIdx, closeIdx);
}

/**
 * Extract the substring of HTML between a swim's `<div class="list-
 * body">` opening and its closing tag (the swim's closing
 * `</article>` is the boundary). Used to scope assertions inside the
 * list-body without bleeding into the kanban stage-grid above.
 */
export function extractListBodySection(htmlSection: string): string {
  const openIdx = htmlSection.indexOf('<div class="list-body"');
  if (openIdx === -1) return '';
  const closeIdx = htmlSection.indexOf('</article>', openIdx);
  if (closeIdx === -1) return htmlSection.slice(openIdx);
  return htmlSection.slice(openIdx, closeIdx);
}
