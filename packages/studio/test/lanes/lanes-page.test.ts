/**
 * Integration test for the `/dev/lanes` studio page (Phase 6 Task
 * 6.3).
 *
 * Boots the studio against a fixture project with two active lanes
 * plus one archived lane plus per-lane entries, hits the route, and
 * asserts the markup contract:
 *
 *   - route returns 200 HTML
 *   - active table contains one row per active lane with id / name /
 *     template / contentDir / entry count
 *   - per-row Edit toggle button is present
 *   - per-row Archive button carries data-copy with
 *     `/deskwork:lane archive <id>`
 *   - archived section is rendered as `<details>` (collapse-by-default)
 *   - archived lane's Restore button carries data-copy with
 *     `/deskwork:lane restore <id>`
 *   - New Lane form is present with a slash-command preview
 *   - empty project renders the empty-state CTA
 *
 * Pure integration — uses real sidecars + real lane configs + real
 * pipeline templates. No mocks. Per `.claude/rules/testing.md`,
 * fixture project trees live on disk via `mkdtempSync`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { createApp } from '../../src/server.ts';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'd',
  };
}

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: UUID_A,
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 0 },
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-28T10:00:00.000Z',
    ...overrides,
  };
}

function writeLane(
  root: string,
  id: string,
  name: string,
  pipelineTemplate: string,
  contentDir: string,
  archivedAt?: string,
): void {
  const json: Record<string, string> = { id, name, pipelineTemplate, contentDir };
  if (archivedAt !== undefined) json.archivedAt = archivedAt;
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

describe('lanes-page — `/dev/lanes`', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-page-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
    writeLane(root, 'visual-lane', 'Visual', 'visual', 'mockups');
    writeLane(
      root,
      'old-lane',
      'Old',
      'editorial',
      'docs-old',
      '2026-04-01T10:00:00.000Z',
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_A,
        slug: 'a-draft',
        title: 'A Draft',
        currentStage: 'Drafting',
        iterationByStage: { Drafting: 1 },
        lane: 'editorial-lane',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_B,
        slug: 'logo-rough',
        title: 'Logo Rough',
        currentStage: 'Sketched',
        iterationByStage: { Sketched: 0 },
        lane: 'visual-lane',
      }),
    );
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 200 HTML at /dev/lanes', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.status).toBe(200);
    expect(r.html).toContain('<!DOCTYPE html>');
  });

  it('returns 200 HTML at /dev/lanes/ (trailing-slash twin)', async () => {
    const r = await getHtml(app, '/dev/lanes/');
    expect(r.status).toBe(200);
    expect(r.html).toContain('Lanes');
  });

  it('renders the New Lane copy-builder form', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toContain('data-lanes-new-form');
    expect(r.html).toContain('data-lanes-field="id"');
    expect(r.html).toContain('data-lanes-field="name"');
    expect(r.html).toContain('data-lanes-field="template"');
    expect(r.html).toContain('data-lanes-field="contentDir"');
    expect(r.html).toContain('data-lanes-copy-button="new"');
    expect(r.html).toContain('data-lanes-preview');
    // pipeline-template select carries available preset ids
    expect(r.html).toMatch(/<option value="editorial">/);
  });

  it('renders one active row per active lane with template + contentDir + count', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toMatch(/data-lane-row[^>]*data-lane-id="editorial-lane"/);
    expect(r.html).toMatch(/data-lane-row[^>]*data-lane-id="visual-lane"/);
    // contentDir and template values
    expect(r.html).toMatch(/<code>editorial<\/code>/);
    expect(r.html).toMatch(/<code>visual<\/code>/);
    expect(r.html).toMatch(/<code>docs<\/code>/);
    expect(r.html).toMatch(/<code>mockups<\/code>/);
  });

  it('archived lane is rendered in a separate <details> section, not the active table', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toContain('data-lanes-archived');
    expect(r.html).toMatch(/<details[^>]*data-lanes-archived-details/);
    // The archived row must appear inside the archived details section,
    // not in the active section that opens before the archived section.
    const archivedSectionIndex = r.html.indexOf('data-lanes-archived');
    const archivedRowIndex = r.html.indexOf('data-lane-id="old-lane"');
    expect(archivedRowIndex).toBeGreaterThan(archivedSectionIndex);
  });

  it('per-row Archive button carries data-copy with the slash command', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toContain('data-copy="/deskwork:lane archive editorial-lane"');
    expect(r.html).toContain('data-copy="/deskwork:lane archive visual-lane"');
  });

  it('archived lane row carries Restore button (not Archive)', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toContain('data-copy="/deskwork:lane restore old-lane"');
    expect(r.html).not.toContain('data-copy="/deskwork:lane archive old-lane"');
  });

  it('archived lane with zero entries shows a Purge button; with entries it does not', async () => {
    // old-lane has zero entries in the fixture → purge button shows
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toContain('data-copy="/deskwork:lane purge old-lane"');
    // active lanes never get a Purge button regardless of count
    expect(r.html).not.toContain('data-copy="/deskwork:lane purge editorial-lane"');
  });

  it('archived lane with entries shows a DISABLED Purge button (gate is visible, next step is named)', async () => {
    // Create a fresh fixture: one archived lane that still has an
    // entry bound to it. The page must render a visibly-disabled
    // Purge button (no data-copy) so the operator sees the gate and
    // the title explains the next step ("move entries first").
    const root2 = mkdtempSync(join(tmpdir(), 'deskwork-lanes-purge-disabled-'));
    mkdirSync(join(root2, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root2, '.deskwork', 'lanes'), { recursive: true });
    writeLane(
      root2,
      'archived-with-entries',
      'Archived w/ Entries',
      'editorial',
      'docs-archived',
      '2026-04-01T10:00:00.000Z',
    );
    await writeSidecar(
      root2,
      makeEntry({
        uuid: UUID_A,
        slug: 'still-here',
        title: 'Still Here',
        currentStage: 'Drafting',
        iterationByStage: { Drafting: 1 },
        lane: 'archived-with-entries',
      }),
    );
    const app2 = createApp({ projectRoot: root2, config: makeConfig() });
    try {
      const r = await getHtml(app2, '/dev/lanes');
      // The disabled Purge button is rendered.
      expect(r.html).toContain('lanes-btn--purge-disabled');
      expect(r.html).toMatch(/disabled[^>]*aria-disabled="true"/);
      // It carries no data-copy / data-lane-copy (the client never
      // clipboards a disabled gate).
      expect(r.html).not.toContain('data-copy="/deskwork:lane purge archived-with-entries"');
      // The label names the entry count so the gate is concrete.
      expect(r.html).toMatch(/Purge — 1 entry/);
      // The title explains the next step.
      expect(r.html).toContain('Move them to another lane first');
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('per-row Edit toggle button is present with aria-controls', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toMatch(/data-lane-edit-toggle[^>]*data-lane-id="editorial-lane"/);
    expect(r.html).toMatch(/aria-controls="lanes-edit-form-editorial-lane"/);
  });

  it('per-row Edit form renders hidden with all three editable fields', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toMatch(/data-lane-edit-row[^>]*data-lane-id="editorial-lane"[^>]*hidden/);
    expect(r.html).toMatch(/data-lanes-edit-form[^>]*data-lane-id="editorial-lane"/);
    // Each edit form has the three editable fields with data-current
    // mirroring the persisted value (so the client can compute the
    // diff between current and live values).
    expect(r.html).toContain('id="lanes-edit-form-editorial-lane"');
    expect(r.html).toMatch(/data-lanes-field="template"[^>]*data-current="editorial"/);
  });

  it('reorder handle is a passive single-glyph indicator (no drag affordance)', async () => {
    const r = await getHtml(app, '/dev/lanes');
    // Single-character glyph (not the double-character grab affordance)
    expect(r.html).toContain('<span\n          class="lanes-reorder-handle"');
    expect(r.html).toMatch(/lanes-reorder-handle[^>]*>⋮<\/span>/);
    expect(r.html).not.toMatch(/lanes-reorder-handle[^>]*>⋮⋮/);
    // aria-hidden so AT skip the decorative glyph
    expect(r.html).toMatch(/lanes-reorder-handle"[^>]*aria-hidden="true"/);
    // Title discloses where reorder happens
    expect(r.html).toContain('title="Reorder via the dashboard lane rail"');
  });

  it('renders per-lane entry counts', async () => {
    const r = await getHtml(app, '/dev/lanes');
    // editorial-lane has 1 entry, visual-lane has 1 entry, old-lane has 0
    expect(r.html).toMatch(/<td class="lanes-cell lanes-cell--count">1<\/td>/);
    expect(r.html).toMatch(/<td class="lanes-cell lanes-cell--count">0<\/td>/);
  });

  it('renders Back-to-Desk link (masthead back-link to /dev/editorial-studio)', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toMatch(/class="er-masthead-back"[^>]*href="\/dev\/editorial-studio"/);
  });

  it('loads the editorial-studio-client script bundle', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toMatch(/editorial-studio-client/);
  });

  it('loads the lanes-page.css stylesheet', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.html).toMatch(/lanes-page\.css/);
  });
});

describe('lanes-page — empty project', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-empty-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders the empty-state CTA when no lanes exist', async () => {
    const r = await getHtml(app, '/dev/lanes');
    expect(r.status).toBe(200);
    expect(r.html).toContain('data-lanes-empty');
    expect(r.html).toContain('Create your first lane');
    // New Lane form still renders above the empty state so the
    // operator can click straight into it.
    expect(r.html).toContain('data-lanes-new-form');
  });

  it('still shows zero entries + zero archived lanes', async () => {
    const r = await getHtml(app, '/dev/lanes');
    // Archived section's empty-state class
    expect(r.html).toContain('No archived lanes');
  });
});
