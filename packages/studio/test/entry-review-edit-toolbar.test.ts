/**
 * #175 Phase 34b — edit-toolbar discoverability.
 *
 * The press-check edit toolbar exposes Source / Split / Preview tabs
 * + Outline / Focus / Save / Cancel actions. Pre-fix, the three mode
 * tabs carried no `title` attribute, so an operator who hadn't
 * memorized them got nothing on hover.
 *
 * Post-fix: every button on the toolbar carries a `title` (or
 * `aria-label` for the trailing `?` button) naming what it does + the
 * keyboard shortcut where one exists.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const KNOWN_UUID = '11111111-1111-4111-8111-111111111111';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'docs',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

function makeEntry(): Entry {
  return {
    uuid: KNOWN_UUID,
    slug: 'hello-world',
    title: 'Hello World',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 1 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
}

async function seedArtifact(projectRoot: string, slug: string): Promise<void> {
  const dir = join(projectRoot, 'docs', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.md'), '# Hello World\n', 'utf8');
}

describe('entry-review edit toolbar — discoverability (#175)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-edit-toolbar-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await writeSidecar(projectRoot, makeEntry());
    await seedArtifact(projectRoot, 'hello-world');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('every mode tab carries a `title` tooltip explaining the mode', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    // Source tab.
    expect(html).toMatch(/data-edit-view="source"[^>]*title="[^"]+"/);
    // Split tab.
    expect(html).toMatch(/data-edit-view="split"[^>]*title="[^"]+"/);
    // Preview tab.
    expect(html).toMatch(/data-edit-view="preview"[^>]*title="[^"]+"/);
  });

  it('cancel button carries a tooltip', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toMatch(/data-action="cancel-edit"[^>]*title="[^"]+"/);
  });

  it('toolbar contains a `?` button that opens the shortcuts overlay', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    // Find the toolbar block and assert the ? button is inside it
    // (rather than just somewhere on the page — the strip-right also
    // has a `?`). Match any data-action="shortcuts" inside the
    // toolbar.
    const toolbarMatch = html.match(
      /<div class="er-edit-toolbar"[^>]*>[\s\S]*?<\/div>\s*<\/div>/,
    );
    expect(toolbarMatch).not.toBeNull();
    expect(toolbarMatch?.[0] ?? '').toMatch(
      /data-action="shortcuts"[^>]*title="[^"]+"/,
    );
  });

  // Issue #174 — Save is a dumb file-write affordance. The button MUST
  // render enabled, with a tooltip describing the action (no
  // "pending design" prose, no `disabled` attribute, no `aria-disabled`).
  it('Save button is rendered enabled with a real tooltip (#174)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    const toolbarMatch = html.match(
      /<div class="er-edit-toolbar"[^>]*>[\s\S]*?<\/div>\s*<\/div>/,
    );
    expect(toolbarMatch).not.toBeNull();
    const toolbar = toolbarMatch?.[0] ?? '';
    // Save button is present.
    expect(toolbar).toMatch(/data-action="save-version"/);
    // No `disabled` attribute on the save button.
    expect(toolbar).not.toMatch(/data-action="save-version"[^>]*disabled/);
    // No `aria-disabled="true"` on the save button.
    expect(toolbar).not.toMatch(
      /data-action="save-version"[^>]*aria-disabled="true"/,
    );
    // The "pending design" tooltip is gone from the live markup.
    expect(toolbar).not.toContain('pending design');
    expect(toolbar).not.toContain('issues/174');
    // The save button carries a meaningful tooltip naming the action.
    expect(toolbar).toMatch(/data-action="save-version"[^>]*title="[^"]+"/);
  });
});
