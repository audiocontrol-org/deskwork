/**
 * Phase 34a Layer 2 — decision-strip tests for the entry-keyed surface.
 *
 * Asserts the per-stage decision-strip composition driven by
 * `getAffordances(entry)`. Reject is rendered disabled with a tooltip
 * pointing at issue #173 (entry-keyed reject semantics undefined).
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

function makeEntry(stage: Entry['currentStage'], overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: KNOWN_UUID,
    slug: 'hello-world',
    title: 'Hello World',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: { Drafting: 1 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

async function seedArtifact(projectRoot: string, slug: string): Promise<void> {
  const dir = join(projectRoot, 'docs', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.md'), '# Hello World\n', 'utf8');
}

describe('entry-review decision strip', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-review-ds-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await seedArtifact(projectRoot, 'hello-world');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders Approve / Iterate / Reject + chord chips for a Drafting entry', async () => {
    await writeSidecar(projectRoot, makeEntry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toContain('data-action="approve"');
    expect(html).toContain('data-action="iterate"');
    expect(html).toContain('data-action="reject"');
    // Chord chips for the keyboard shortcuts (a / i / r).
    expect(html).toContain('class="er-shortcut-chip-wrap"');
    expect(html).toMatch(/<small class="er-shortcut-chip"><kbd>a<\/kbd><kbd>a<\/kbd><\/small>/);
    expect(html).toMatch(/<small class="er-shortcut-chip"><kbd>i<\/kbd><kbd>i<\/kbd><\/small>/);
    expect(html).toMatch(/<small class="er-shortcut-chip"><kbd>r<\/kbd><kbd>r<\/kbd><\/small>/);
  });

  it('renders Reject as disabled with a tooltip pointing at issue #173', async () => {
    await writeSidecar(projectRoot, makeEntry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toMatch(/data-action="reject"[^>]*disabled/);
    expect(html).toMatch(/data-action="reject"[^>]*title="[^"]*issues\/173/);
  });

  it('omits Approve / Iterate / Reject for a Published entry', async () => {
    await writeSidecar(projectRoot, makeEntry('Published'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).not.toContain('data-action="approve"');
    expect(html).not.toContain('data-action="iterate"');
    expect(html).not.toContain('data-action="reject"');
    // Read-only affordances surface instead.
    expect(html).toContain('Read-only');
    expect(html).toContain('Fork (coming)');
  });

  it('renders the induct picker for a Cancelled entry', async () => {
    const entry = makeEntry('Cancelled', { priorStage: 'Drafting' });
    await writeSidecar(projectRoot, entry);
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toContain('name="induct-to"');
    expect(html).toContain(`data-entry-uuid="${KNOWN_UUID}"`);
  });
});
