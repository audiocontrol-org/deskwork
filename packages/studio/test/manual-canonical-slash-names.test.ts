/**
 * Issue #104 + #69 regression — the Compositor's Manual + the
 * dashboard taught adopters wrong slash-command names. The Manual
 * (`/dev/editorial-help`) listed every workflow step with the legacy
 * `/editorial-(add|plan|outline|draft|publish|distribute)` family;
 * the dashboard's empty-state prose and `data-copy` button payloads
 * had the same legacy names. Adopters who pasted the copied command
 * into Claude Code hit "command not found" because the canonical
 * names migrated to `/deskwork:*` long ago (Phase 22+++ / v0.8.4
 * partial fix; this is the completion).
 *
 * Asserts:
 *   1. `/dev/editorial-help` HTML has zero `/editorial-*` slash-command
 *      matches for the canonical six.
 *   2. The dashboard `/dev/editorial-studio` HTML has zero matches.
 *   3. Both surfaces include the canonical `/deskwork:*` names.
 *
 * Path-style references like `/dev/editorial-help`, `/dev/editorial-studio`,
 * `/static/css/editorial-*.css`, and `/dev/editorial-review/<id>` stay —
 * those are URL paths, not slash commands. The regex is anchored by the
 * fact that slash commands take a verb (add, plan, outline, draft,
 * publish, distribute) directly after the dash, while URL paths only
 * have `studio`, `help`, `review`, `review-shortform` after the dash.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type { EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

// Catches `/editorial-add`, `/editorial-plan`, `/editorial-outline`,
// `/editorial-draft`, `/editorial-publish`, `/editorial-distribute`
// AND their dashed variants (`/editorial-outline-approve`,
// `/editorial-draft-review`, `/editorial-shortform-draft` etc.) — every
// slash command from the legacy era. Excludes `/dev/editorial-*` paths
// (the leading slash + `dev/` makes those non-matches) and CSS asset
// paths.
const LEGACY_SLASH_RE = / \/editorial-[a-z][a-z-]*/g;

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

function seedFixture(root: string, cfg: DeskworkConfig): void {
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  const cal: EditorialCalendar = { entries: [], distributions: [] };
  writeCalendar(
    join(root, cfg.sites.d.calendarPath),
    cal,
  );
  // The dashboard render needs at least one calendar entry to exercise
  // empty-state prose conditionally; the manual page is calendar-less.
  // Both routes accept an empty calendar.
  void writeFileSync;
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('manual + dashboard — canonical /deskwork:* slash names (#104, #69)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-manual-canonical-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Compositor Manual has zero canonical-six legacy slash commands', async () => {
    const r = await getHtml(app, '/dev/editorial-help');
    expect(r.status).toBe(200);

    // Negative: the canonical six (add|plan|outline|draft|publish|distribute)
    // and their close variants must not appear as slash commands.
    expect(r.html).not.toMatch(/\/editorial-add\b/);
    expect(r.html).not.toMatch(/\/editorial-plan\b/);
    expect(r.html).not.toMatch(/\/editorial-outline\b/);
    expect(r.html).not.toMatch(/\/editorial-draft\b/);
    expect(r.html).not.toMatch(/\/editorial-publish\b/);
    expect(r.html).not.toMatch(/\/editorial-distribute\b/);
    expect(r.html).not.toMatch(/\/editorial-shortform-draft\b/);
    expect(r.html).not.toMatch(/\/editorial-draft-review\b/);
    expect(r.html).not.toMatch(/\/editorial-outline-approve\b/);
    expect(r.html).not.toMatch(/\/editorial-iterate\b/);
    expect(r.html).not.toMatch(/\/editorial-approve\b/);

    // Positive: canonical /deskwork:* names DO appear.
    expect(r.html).toContain('/deskwork:add');
    expect(r.html).toContain('/deskwork:plan');
    expect(r.html).toContain('/deskwork:draft');
    expect(r.html).toContain('/deskwork:review-start');
    expect(r.html).toContain('/deskwork:iterate');
    expect(r.html).toContain('/deskwork:approve');
    expect(r.html).toContain('/deskwork:publish');
    expect(r.html).toContain('/deskwork:shortform-start');
    expect(r.html).toContain('/deskwork:distribute');
  });

  it('Dashboard has zero canonical-six legacy slash commands in copy targets + prose', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Negative: empty-state prose + data-copy button payloads.
    expect(r.html).not.toMatch(/\/editorial-add\b/);
    expect(r.html).not.toMatch(/\/editorial-plan\b/);
    expect(r.html).not.toMatch(/\/editorial-outline\b/);
    expect(r.html).not.toMatch(/\/editorial-draft\b/);
    expect(r.html).not.toMatch(/\/editorial-outline-approve\b/);
    expect(r.html).not.toMatch(/\/editorial-draft-review\b/);
    expect(r.html).not.toMatch(/\/editorial-iterate\b/);
    expect(r.html).not.toMatch(/\/editorial-approve\b/);
    expect(r.html).not.toMatch(/\/editorial-review-report\b/);
    expect(r.html).not.toMatch(/\/editorial-rename-slug\b/);

    // Positive: at least the empty-state nudges use canonical names.
    // (Buttons only render when entries exist, so empty-state prose is
    // the deterministic surface for an empty fixture.)
    expect(r.html).toContain('/deskwork:add');
    expect(r.html).toContain('/deskwork:plan');
    expect(r.html).toContain('/deskwork:outline');
  });
});
