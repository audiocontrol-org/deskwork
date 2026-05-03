/**
 * Issue #106 regression — shortform desk empty-state pointed at a
 * "coverage matrix" that doesn't exist on the dashboard, with a link
 * target (`/dev/editorial-studio`) that landed at the top of the page
 * instead of the Drafting list. Adopters following the prose hit a
 * dead end.
 *
 * Asserts:
 *   1. The empty state on `/dev/editorial-review-shortform` (rendered
 *      when no shortform workflows exist) names the Drafting list, not
 *      the non-existent coverage matrix.
 *   2. The link target is `/dev/editorial-studio#stage-drafting` so the
 *      anchor scrolls to the Drafting stage section.
 *   3. The dashboard `/dev/editorial-studio` HTML mounts an
 *      `id="stage-drafting"` anchor on the Drafting section so the
 *      anchor target is real.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('shortform desk empty-state + dashboard anchor (#106)', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-shortform-empty-'));
    cfg = makeConfig();
    seedFixture(root, cfg);
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('shortform empty-state points at the Drafting list, not coverage matrix', async () => {
    const r = await getHtml(app, '/dev/editorial-review-shortform');
    expect(r.status).toBe(200);

    expect(r.html).not.toContain('coverage matrix');
    expect(r.html).toContain('Drafting list');
    expect(r.html).toContain('href="/dev/editorial-studio#stage-drafting"');
  });

  it('dashboard mounts an id="stage-drafting" anchor on the Drafting section', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Anchor target exists.
    expect(r.html).toContain('id="stage-drafting"');
    // And every other stage gets the same shape — the namespacing is
    // consistent rather than a one-off for Drafting.
    expect(r.html).toContain('id="stage-ideas"');
    expect(r.html).toContain('id="stage-planned"');
    expect(r.html).toContain('id="stage-published"');
  });
});
