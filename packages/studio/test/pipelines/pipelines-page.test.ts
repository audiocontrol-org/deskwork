/**
 * Integration test for the `/dev/pipelines` studio page (Phase 6 Task
 * 6.4).
 *
 * Boots the studio against a fixture project, hits the route, and
 * asserts the markup contract:
 *
 *   - route returns 200 HTML at both `/dev/pipelines` and trailing-
 *     slash twin
 *   - every plugin preset (editorial / visual / feature-doc / qa-plan
 *     / blog-post) appears as a healthy row
 *   - a project-override template shows source=override
 *   - per-row View / Edit / Delete buttons are present
 *   - Delete is disabled with a customize-first title when the
 *     template is a plugin preset
 *   - Delete is disabled with a lane-reassignment title when active
 *     lanes reference the template
 *   - 5 update sub-forms render inside the Edit panel
 *   - New template form is present with Copy command button
 *   - malformed override JSON surfaces as an error row (NOT silently
 *     filtered) carrying the file path + verbatim loader message
 *   - error banner names the failing ids
 *   - masthead back link points at /dev/editorial-studio
 *   - pipelines-page.css and editorial-studio-client are loaded
 *
 * Pure integration — real lane configs + real pipeline templates +
 * real loader. Fixture trees on disk per `.claude/rules/testing.md`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
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
  archivedAt?: string,
): void {
  const json: Record<string, string> = {
    id,
    name: id,
    pipelineTemplate,
    contentDir: id,
  };
  if (archivedAt !== undefined) json.archivedAt = archivedAt;
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(json, null, 2),
    'utf8',
  );
}

function writePipelineOverride(root: string, id: string, body: unknown): void {
  writeFileSync(
    join(root, '.deskwork', 'pipelines', `${id}.json`),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
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

describe('pipelines-page — `/dev/pipelines`', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-page-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
    // One lane uses the editorial preset; one uses visual.
    writeLane(root, 'docs', 'editorial');
    writeLane(root, 'mockups', 'visual');
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 200 HTML at /dev/pipelines', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.status).toBe(200);
    expect(r.html).toContain('<!DOCTYPE html>');
    expect(r.html).toContain('Pipelines');
  });

  it('returns 200 HTML at /dev/pipelines/ (trailing-slash twin)', async () => {
    const r = await getHtml(app, '/dev/pipelines/');
    expect(r.status).toBe(200);
  });

  it('renders every plugin preset as a healthy row', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    for (const id of ['editorial', 'visual', 'feature-doc', 'qa-plan', 'blog-post']) {
      expect(r.html).toMatch(
        new RegExp(`data-pipeline-row[^>]*data-pipeline-id="${id}"`),
      );
    }
  });

  it('renders source=plugin-preset chip for plugin presets', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    // Find the editorial row; its source cell carries the preset badge
    expect(r.html).toMatch(
      /data-pipeline-id="editorial"[^]*?pipelines-source--preset/,
    );
  });

  it('marks an override template with source=project-override', async () => {
    writePipelineOverride(root, 'editorial', {
      id: 'editorial',
      name: 'Custom Editorial',
      description: 'overridden',
      linearStages: ['Idea', 'Done'],
      offPipelineStages: ['Cancelled'],
    });
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    expect(r.html).toMatch(
      /data-pipeline-id="editorial"[^]*?data-pipeline-source="project-override"/,
    );
    expect(r.html).toMatch(
      /data-pipeline-id="editorial"[^]*?pipelines-source--override/,
    );
  });

  it('per-row View / Edit / Delete toggles are present with aria-controls', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.html).toMatch(/data-pipeline-view-toggle[^>]*data-pipeline-id="editorial"/);
    expect(r.html).toMatch(/aria-controls="pipelines-view-panel-editorial"/);
    expect(r.html).toMatch(/data-pipeline-edit-toggle[^>]*data-pipeline-id="editorial"/);
    expect(r.html).toMatch(/aria-controls="pipelines-edit-panel-editorial"/);
  });

  it('Delete on a plugin preset is disabled with a customize-first title', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    // Editorial is a plugin preset (no override in this fixture) → Delete disabled
    expect(r.html).toMatch(
      /data-pipeline-id="editorial"[^]*?pipelines-btn--delete-disabled[^]*?Customize to a project override/,
    );
    // And the disabled button carries no data-copy
    expect(r.html).not.toContain('data-copy="/deskwork:pipeline delete editorial"');
  });

  it('Delete on an override referenced by lanes is disabled with a reassignment title', async () => {
    // Override + a lane that references it
    writePipelineOverride(root, 'custom', {
      id: 'custom',
      name: 'Custom',
      description: 'project-local',
      linearStages: ['Idea', 'Done'],
      offPipelineStages: ['Cancelled'],
    });
    writeLane(root, 'custom-consumer', 'custom');
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    expect(r.html).toMatch(
      /data-pipeline-id="custom"[^]*?pipelines-btn--delete-disabled[^]*?reassign/i,
    );
    expect(r.html).toMatch(
      /data-pipeline-id="custom"[^]*?custom-consumer/,
    );
    // No active data-copy on the disabled state
    expect(r.html).not.toContain('data-copy="/deskwork:pipeline delete custom"');
  });

  it('Delete on a project-override with zero referencing lanes IS active', async () => {
    writePipelineOverride(root, 'orphan-custom', {
      id: 'orphan-custom',
      name: 'Orphan',
      description: 'nobody references this',
      linearStages: ['Idea', 'Done'],
      offPipelineStages: ['Cancelled'],
    });
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    expect(r.html).toContain('data-copy="/deskwork:pipeline delete orphan-custom"');
  });

  it('Edit panel renders the five update operations as collapsed details', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    // Inspect the editorial Edit panel's contents
    const start = r.html.indexOf('id="pipelines-edit-panel-editorial"');
    expect(start).toBeGreaterThan(-1);
    // Slice generously — five sub-panels (each with grid/preview/copy
    // chrome) can easily run past 10k characters.
    const slice = r.html.slice(start, start + 20000);
    expect(slice).toContain('data-pipelines-op="add"');
    expect(slice).toContain('data-pipelines-op="rename"');
    expect(slice).toContain('data-pipelines-op="remove"');
    expect(slice).toContain('data-pipelines-op="set-locked"');
    expect(slice).toContain('data-pipelines-op="set-off-pipeline"');
    // Each panel carries a copy button
    expect(slice).toMatch(/data-pipelines-copy-button="add"/);
    expect(slice).toMatch(/data-pipelines-copy-button="rename"/);
    expect(slice).toMatch(/data-pipelines-copy-button="remove"/);
    expect(slice).toMatch(/data-pipelines-copy-button="set-locked"/);
    expect(slice).toMatch(/data-pipelines-copy-button="set-off-pipeline"/);
  });

  it('Edit panel on a plugin preset surfaces a customize-first notice', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.html).toMatch(/pipelines-edit-notice[^]*?\/deskwork:customize pipeline editorial/);
  });

  it('Edit panel on a project-override omits the customize notice', async () => {
    writePipelineOverride(root, 'orphan-custom', {
      id: 'orphan-custom',
      name: 'Orphan',
      description: 'override only',
      linearStages: ['Idea', 'Done'],
      offPipelineStages: ['Cancelled'],
    });
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    const start = r.html.indexOf('id="pipelines-edit-panel-orphan-custom"');
    expect(start).toBeGreaterThan(-1);
    const slice = r.html.slice(start, start + 5000);
    expect(slice).not.toContain('Plugin preset — customize first');
  });

  it('long stage names render inside .pipelines-stage-label so the CSS wrap rule applies', async () => {
    // Custom override with a 60-character stage name — the chip would
    // overflow a narrow viewport if the inner label didn't carry the
    // wrap-enabling class. The CSS rule lives in
    // `pipelines-stage-flow.css` (.pipelines-stage-label
    // { overflow-wrap: anywhere }); this assertion confirms the markup
    // gives the rule a target to apply to.
    const longStage = 'A'.repeat(60);
    writePipelineOverride(root, 'long-stage-template', {
      id: 'long-stage-template',
      name: 'Long stage',
      description: 'one 60-char stage exercises the wrap rule',
      linearStages: [longStage, 'Final'],
      offPipelineStages: ['Cancelled'],
    });
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    const start = r.html.indexOf('id="pipelines-view-panel-long-stage-template"');
    expect(start).toBeGreaterThan(-1);
    const slice = r.html.slice(start, start + 5000);
    expect(slice).toContain(longStage);
    expect(slice).toMatch(
      new RegExp(`<span class="pipelines-stage-label">${longStage}</span>`),
    );
  });

  it('View panel renders the stage flow visualization', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    // Editorial's linear stages should appear inside its view panel
    const start = r.html.indexOf('id="pipelines-view-panel-editorial"');
    expect(start).toBeGreaterThan(-1);
    const slice = r.html.slice(start, start + 5000);
    expect(slice).toContain('data-pipeline-stage="Ideas"');
    expect(slice).toContain('data-pipeline-stage="Final"');
    expect(slice).toContain('data-pipeline-stage="Published"');
    // Locked stage gets the locked modifier class
    // Locked-stage chrome carries both the class modifier AND the
    // stage data attribute on the same span (order independent — test
    // both directions).
    expect(slice).toMatch(/pipelines-stage--locked[^"]*"\s+data-pipeline-stage="Final"/);
    // Off-pipeline stages render in a separate section
    expect(slice).toContain('data-pipeline-stage="Cancelled"');
    expect(slice).toContain('pipelines-stage--off');
  });

  it('renders the New template copy-builder form', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.html).toContain('data-pipelines-new-form');
    expect(r.html).toContain('data-pipelines-field="new-id"');
    expect(r.html).toContain('data-pipelines-field="new-shape"');
    expect(r.html).toContain('data-pipelines-copy-button="new"');
    expect(r.html).toContain('data-pipelines-preview="new"');
  });

  it('surfaces malformed override JSON as an error row (NOT silently filtered)', async () => {
    writePipelineOverride(root, 'broken', '{ this is not valid json');
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    // The error row carries the id, the path, and a parse-error message
    expect(r.html).toMatch(
      /data-pipeline-row[^>]*data-pipeline-id="broken"[^>]*data-pipeline-error/,
    );
    expect(r.html).toContain('JSON parse error');
    expect(r.html).toMatch(/\.deskwork[\/\\]pipelines[\/\\]broken\.json/);
    // The error banner names the failing id at the top of the page
    expect(r.html).toContain('data-pipelines-error-banner');
    expect(r.html).toContain('<code>broken</code>');
  });

  it('renders Zod / loader error messages with HTML-escaped output (XSS regression)', async () => {
    // The id-mismatch error message embeds the JSON's `id` field
    // verbatim ("declares id "<value>" but was loaded as ..."). A
    // future refactor that swapped `html\`\`` for `unsafe(html\`\`)`
    // around the error-message render would let an attacker inject
    // markup via a project-controlled override file. This test asserts
    // the escaping survives the current render path.
    const payload = '<img src=x onerror=alert(1)>';
    writePipelineOverride(root, 'xss-attempt', {
      id: payload,
      name: 'XSS',
      description: 'tries to inject markup via id-mismatch path',
      linearStages: ['A'],
      offPipelineStages: [],
    });
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    // The error row appears.
    expect(r.html).toMatch(/data-pipeline-id="xss-attempt"[^>]*data-pipeline-error/);
    // The escaped payload appears.
    expect(r.html).toContain('&lt;img');
    // The RAW payload does NOT appear (which would mean unescaped output).
    expect(r.html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('error row dependents list names the lanes referencing the broken template', async () => {
    writePipelineOverride(root, 'broken', '{ not json');
    writeLane(root, 'broken-consumer', 'broken');
    const app2 = createApp({ projectRoot: root, config: makeConfig() });
    const r = await getHtml(app2, '/dev/pipelines');
    expect(r.html).toMatch(/data-pipeline-id="broken"[^]*?broken-consumer/);
  });

  it('masthead back-link points at /dev/editorial-studio', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.html).toMatch(/class="er-masthead-back"[^>]*href="\/dev\/editorial-studio"/);
  });

  it('loads the editorial-studio-client script bundle', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.html).toMatch(/editorial-studio-client/);
  });

  it('loads the pipelines-page.css stylesheet', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.html).toMatch(/pipelines-page\.css/);
  });
});

describe('pipelines-page — empty project (still has plugin presets)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-empty-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('still surfaces all five plugin presets when no overrides + no lanes exist', async () => {
    const r = await getHtml(app, '/dev/pipelines');
    expect(r.status).toBe(200);
    for (const id of ['editorial', 'visual', 'feature-doc', 'qa-plan', 'blog-post']) {
      expect(r.html).toMatch(
        new RegExp(`data-pipeline-id="${id}"`),
      );
    }
  });
});
