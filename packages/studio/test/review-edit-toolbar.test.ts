/**
 * Issue #154 Dispatch C regression — edit-mode toolbar relocation.
 *
 * Pre-Dispatch-C, the edit-mode chrome was a single `.er-edit-mode`
 * block rendered inside `.er-draft-frame` (below `#draft-body`). The
 * Source/Split/Preview tabs and Save/Cancel actions sat in a thin bar
 * above the source/preview panes, all stacked beneath the rendered
 * draft. With Dispatch A's page-grid in place, the toolbar wanted to
 * be the workflow control surface and the strip's right-side buttons
 * (Edit/Approve/Iterate/Reject) were redundant during edit-mode focus.
 *
 * Dispatch C splits the chrome:
 *   - `renderEditToolbar()` emits `.er-edit-toolbar` above `.er-page`
 *     (between the strip and the page), sticky under the strip;
 *   - `renderEditPanes()` emits the panes-host (`.er-edit-mode` /
 *     `[data-edit-panes-host]`) inside `.er-draft-frame`, in place of
 *     the original block;
 *   - the strip's `.er-strip-right` hides while the toolbar is active
 *     via `body:has(.er-edit-toolbar:not([hidden])) .er-strip-right`.
 *
 * These tests pin the structural + CSS contracts so a future refactor
 * doesn't silently merge them back into one block.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import type { CalendarEntry, EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

const ENTRY_ID = '44444444-4444-4444-8444-444444444444';

const CSS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/css/editorial-review.css',
);

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

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'placeholder',
    title: 'Placeholder',
    description: '',
    stage: 'Drafting',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

function seedFixture(root: string, cfg: DeskworkConfig): void {
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  const cal: EditorialCalendar = {
    entries: [
      entry({
        id: ENTRY_ID,
        slug: 'a-piece',
        title: 'A Piece',
        stage: 'Review',
      }),
    ],
    distributions: [],
  };
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
  createWorkflow(root, cfg, {
    entryId: ENTRY_ID,
    site: 'd',
    slug: 'a-piece',
    contentKind: 'longform',
    initialMarkdown:
      '---\ntitle: A Piece\n---\n\n# A Piece\n\nProse for the test fixture.\n',
  });
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('edit-mode toolbar relocation (Issue #154 Dispatch C)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-edit-toolbar-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders the toolbar above .er-page in source order', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    const toolbarIdx = r.html.indexOf('class="er-edit-toolbar"');
    const pageIdx = r.html.indexOf('<article class="er-page">');

    expect(toolbarIdx).toBeGreaterThan(0);
    expect(pageIdx).toBeGreaterThan(0);
    // Toolbar comes BEFORE the page article, not below #draft-body.
    expect(toolbarIdx).toBeLessThan(pageIdx);
  });

  it('toolbar contains the mode tabs and primary action buttons', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    // Locate the toolbar block via a coarse regex — the toolbar uses
    // a flat structure (.er-edit-modes + .er-edit-actions are direct
    // children) so the slice from one closing tag to the matching
    // div-close is a clean unit.
    const m = r.html.match(/<div class="er-edit-toolbar"[^>]*>([\s\S]*?)<\/div>\s*\n?\s*<article class="er-page">/);
    expect(m, '.er-edit-toolbar block should immediately precede .er-page').not.toBeNull();
    const toolbar = m![1];

    // Mode tabs.
    expect(toolbar).toMatch(/data-edit-view="source"/);
    expect(toolbar).toMatch(/data-edit-view="split"/);
    expect(toolbar).toMatch(/data-edit-view="preview"/);
    // Action buttons.
    expect(toolbar).toMatch(/data-action="save-version"/);
    expect(toolbar).toMatch(/data-action="cancel-edit"/);
    expect(toolbar).toMatch(/data-action="focus-mode"/);
    // Outline button is present (toggleable by content-shape).
    expect(toolbar).toMatch(/data-action="outline-drawer"/);
    // Hint span the client writes save-state into.
    expect(toolbar).toMatch(/data-edit-hint/);
  });

  it('panes-host stays inside .er-draft-frame', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);

    // Tighten: the panes-host must be a descendant of the draft-frame
    // (where #draft-body lives) so the article column owns its width.
    const draftFrameIdx = r.html.indexOf('class="er-draft-frame"');
    const panesHostIdx = r.html.indexOf('data-edit-panes-host');
    const draftBodyIdx = r.html.indexOf('id="draft-body"');

    expect(draftFrameIdx).toBeGreaterThan(0);
    expect(panesHostIdx).toBeGreaterThan(0);
    expect(draftBodyIdx).toBeGreaterThan(draftFrameIdx);
    // Panes-host follows draft-body inside the same draft-frame.
    expect(panesHostIdx).toBeGreaterThan(draftBodyIdx);

    // And the panes-host carries the er-edit-mode class for cascade
    // compatibility (focus-mode rules, paper-2 background) — keeps
    // existing CSS working across the split.
    const hostMatch = r.html.match(/<div class="er-edit-mode"[^>]*data-edit-panes-host[^>]*>/);
    expect(hostMatch, 'panes-host should retain er-edit-mode class').not.toBeNull();
  });

  it('toolbar and panes-host both start hidden (server-rendered initial state)', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    // The server emits both wrappers with `hidden`. The client flips
    // both on enter/exit so the toolbar above the page and the panes
    // inside the article column transition together.
    expect(r.html).toMatch(/<div class="er-edit-toolbar"[^>]*\bhidden\b/);
    expect(r.html).toMatch(/<div class="er-edit-mode"[^>]*data-edit-panes-host[^>]*\bhidden\b/);
  });

  it('CSS hides .er-strip-right while the edit toolbar is visible', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    // The :has() rule is the single contract; matching it as a string
    // (whitespace-tolerant) is sufficient — the rule is small and
    // unambiguous, and the alternative (parsing the CSS) is overkill.
    const rule = css.match(/body:has\(\.er-edit-toolbar:not\(\[hidden\]\)\)\s*\.er-strip-right\s*\{[^}]*display:\s*none[^}]*\}/);
    expect(rule, 'expected strip-right hide rule keyed on toolbar visibility').not.toBeNull();
  });

  it('CSS defines the .er-edit-toolbar layout (sticky under the strip)', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    // Find the standalone toolbar block (not the ancestor cascade
    // rules above).
    const blockStart = css.search(/^\.er-edit-toolbar\s*\{/m);
    expect(blockStart, '.er-edit-toolbar rule should exist').toBeGreaterThan(0);
    const blockEnd = css.indexOf('}', blockStart);
    const block = css.slice(blockStart, blockEnd + 1);
    // Sticky under the strip.
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/top:\s*calc\(var\(--er-folio-h\)/);
    // Flex toolbar that wraps if narrow (matching the mockup).
    expect(block).toMatch(/display:\s*flex/);
    expect(block).toMatch(/justify-content:\s*space-between/);
  });
});
