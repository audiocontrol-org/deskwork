/**
 * Longform review surface refinement (Phase 2 follow-up) — Issue 5
 * shortcut chips on action buttons.
 *
 * Asserts the server-rendered markup contract: action buttons
 * (Approve / Iterate / Reject) on non-terminal workflow states are
 * each wrapped in `<span class="er-shortcut-chip-wrap">…</span>`
 * containing both the button and a chord-chip indicator.
 *
 * IMPORTANT — chord style: the design doc speculated `⌘+A` modifier-
 * key chord style. The actual #108 fix is a TWO-TAP bare-letter
 * sequence (`a a` within 500ms) — confirmed by reading the keybinding
 * handler in editorial-review-client.ts which bails on
 * `metaKey || ctrlKey || altKey`, then matches bare `ev.key`. The
 * shortcuts modal renders these as `<kbd>a</kbd> <kbd>a</kbd>`. The
 * inline chips mirror that style (sans whitespace) so on-strip hint
 * and modal stay in sync.
 *
 * Issue 7's mode-disclosure label has its own test file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import type { CalendarEntry, EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';

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

describe('longform review surface — shortcut-chip-wrap markup (Issue 5)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-issue-5-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('wraps Approve / Iterate / Reject buttons in shortcut-chip-wrap with two-tap chord', async () => {
    const r = await getHtml(app, `/dev/editorial-review/${ENTRY_ID}?site=d`);
    expect(r.status).toBe(200);

    // Approve button wrapped with chord chip a-a (matches the existing
    // shortcuts modal's two-tap pattern from the #108 fix).
    expect(r.html).toMatch(
      /<span class="er-shortcut-chip-wrap">\s*<button[^>]*data-action="approve"[^>]*>Approve<\/button>\s*<small class="er-shortcut-chip"><kbd>a<\/kbd><kbd>a<\/kbd><\/small>\s*<\/span>/,
    );
    // Iterate button wrapped with chord chip i-i.
    expect(r.html).toMatch(
      /<span class="er-shortcut-chip-wrap">\s*<button[^>]*data-action="iterate"[^>]*>Iterate<\/button>\s*<small class="er-shortcut-chip"><kbd>i<\/kbd><kbd>i<\/kbd><\/small>\s*<\/span>/,
    );
    // Reject button wrapped with chord chip r-r.
    expect(r.html).toMatch(
      /<span class="er-shortcut-chip-wrap">\s*<button[^>]*data-action="reject"[^>]*>Reject<\/button>\s*<small class="er-shortcut-chip"><kbd>r<\/kbd><kbd>r<\/kbd><\/small>\s*<\/span>/,
    );
  });
});
