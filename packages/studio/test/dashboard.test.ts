/**
 * Integration test for the studio dashboard at `/dev/editorial-studio`.
 *
 * Focused on the Paused lane (#27). The dashboard renders one section
 * per `STAGES` entry; when `Paused` is in `STAGES` the section appears
 * and the operator can see paused entries with their `pausedFrom`
 * recorded.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
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

describe('studio dashboard — Paused lane (#27)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-dash-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    const cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders a Paused section with paused entries and their pausedFrom', () => {
    // Hand-craft a calendar with one Paused entry that came from
    // Outlining. The renderer reads STAGES in order so Paused appears
    // between Review and Published.
    const calendar = [
      '# Editorial Calendar',
      '',
      '## Ideas',
      '',
      '*No entries.*',
      '',
      '## Planned',
      '',
      '*No entries.*',
      '',
      '## Outlining',
      '',
      '*No entries.*',
      '',
      '## Drafting',
      '',
      '*No entries.*',
      '',
      '## Review',
      '',
      '*No entries.*',
      '',
      '## Paused',
      '',
      '| UUID | Slug | Title | Description | Keywords | Source | PausedFrom |',
      '|------|------|-------|-------------|----------|--------|------------|',
      '| 11111111-1111-1111-1111-111111111111 | held-up | Held Up | Stuck on a reference |  | manual | Outlining |',
      '',
      '## Published',
      '',
      '*No entries.*',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs/cal.md'), calendar, 'utf-8');

    return getHtml(app, '/dev/editorial-studio').then(({ status, html }) => {
      expect(status).toBe(200);
      // The Paused section header is rendered.
      expect(html).toMatch(/data-stage-section="Paused"/);
      // The paused entry slug is present in a row tagged Paused.
      expect(html).toMatch(/data-stage="Paused"[^>]*data-slug="held-up"/);
      // The pausedFrom hint surfaces in the row meta.
      expect(html).toMatch(/was:<\/em> Outlining/);
      // The "resume" affordance appears for the paused row.
      expect(html).toMatch(/\/deskwork:resume[^"]*held-up/);
    });
  });

  it('shows a pause affordance on a non-terminal entry', () => {
    const calendar = [
      '# Editorial Calendar',
      '',
      '## Ideas',
      '',
      '*No entries.*',
      '',
      '## Planned',
      '',
      '*No entries.*',
      '',
      '## Outlining',
      '',
      '| UUID | Slug | Title | Description | Keywords | Source |',
      '|------|------|-------|-------------|----------|--------|',
      '| 22222222-2222-2222-2222-222222222222 | mid-outline | Mid Outline | working it |  | manual |',
      '',
      '## Drafting',
      '',
      '*No entries.*',
      '',
      '## Review',
      '',
      '*No entries.*',
      '',
      '## Paused',
      '',
      '*No entries.*',
      '',
      '## Published',
      '',
      '*No entries.*',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs/cal.md'), calendar, 'utf-8');

    return getHtml(app, '/dev/editorial-studio').then(({ status, html }) => {
      expect(status).toBe(200);
      expect(html).toMatch(/\/deskwork:pause[^"]*mid-outline/);
    });
  });
});
