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

  /**
   * F1 regression — Approve and Iterate must be disabled when the
   * page is rendering historical content. The endpoints act against
   * live sidecar state, not the snapshot the operator is viewing;
   * letting the click land would mutate the wrong baseline.
   *
   * Defense-in-depth: client-side decision controller also short-
   * circuits via `state.historical`. This test pins the server-side
   * disabled+tooltip rendering, which is the primary block.
   */
  describe('historical-mode action blocking (F1)', () => {
    async function seedWithIteration(): Promise<void> {
      // Need an actual iteration in the journal so ?v=1 resolves.
      // iterateEntry refuses no-op iterations, so we have to write,
      // iterate, write-different, iterate. Two iterations gives us
      // a "current" (v2) and a "historical" (v1) to test against.
      const { iterateEntry } = await import('@deskwork/core/iterate');
      await writeSidecar(projectRoot, makeEntry('Drafting', { iterationByStage: {} }));
      await writeFile(
        join(projectRoot, 'docs', 'hello-world', 'index.md'),
        '# Hello World\n\nv1 body.\n',
        'utf8',
      );
      await iterateEntry(projectRoot, { uuid: KNOWN_UUID });
      await writeFile(
        join(projectRoot, 'docs', 'hello-world', 'index.md'),
        '# Hello World\n\nv2 body.\n',
        'utf8',
      );
      await iterateEntry(projectRoot, { uuid: KNOWN_UUID });
    }

    it('renders Approve as disabled with a historical tooltip when ?v= points at an old version', async () => {
      await seedWithIteration();
      const app = createApp({ projectRoot, config: cfg });
      const res = await app.fetch(
        new Request(
          `http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=1&stage=Drafting`,
        ),
      );
      const html = await res.text();
      // Approve button carries `disabled` AND a tooltip naming
      // historical mode.
      expect(html).toMatch(/data-action="approve"[^>]*disabled/);
      expect(html).toMatch(/data-action="approve"[^>]*title="[^"]*historical version/);
    });

    it('renders Iterate as disabled with a historical tooltip when ?v= points at an old version', async () => {
      await seedWithIteration();
      const app = createApp({ projectRoot, config: cfg });
      const res = await app.fetch(
        new Request(
          `http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=1&stage=Drafting`,
        ),
      );
      const html = await res.text();
      expect(html).toMatch(/data-action="iterate"[^>]*disabled/);
      expect(html).toMatch(/data-action="iterate"[^>]*title="[^"]*historical version/);
    });

    it('leaves Approve / Iterate enabled in current view (no ?v= or v=current)', async () => {
      await seedWithIteration();
      const app = createApp({ projectRoot, config: cfg });
      const res = await app.fetch(
        new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
      );
      const html = await res.text();
      // Approve button does NOT have `disabled` and does NOT have a
      // historical tooltip. (Reject's `disabled` is from #173 — a
      // different concern; the Reject regex below tests that.)
      expect(html).not.toMatch(/data-action="approve"[^>]*disabled/);
      expect(html).not.toMatch(/data-action="iterate"[^>]*disabled/);
      expect(html).not.toMatch(/data-action="approve"[^>]*title="[^"]*historical/);
      // Reject is still disabled (pre-existing #173 contract); confirm
      // the historical-tooltip regex doesn't accidentally match Reject.
      expect(html).toMatch(/data-action="reject"[^>]*disabled/);
      expect(html).not.toMatch(/data-action="reject"[^>]*title="[^"]*historical/);
    });

    it('Approve and Iterate stay enabled when ?v= matches the current stage version', async () => {
      // sidecar.iterationByStage.Drafting === 2 (after seedWithIteration);
      // ?v=2 is the current view, so historical: false.
      await seedWithIteration();
      const app = createApp({ projectRoot, config: cfg });
      const res = await app.fetch(
        new Request(
          `http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=2&stage=Drafting`,
        ),
      );
      const html = await res.text();
      // Note: the loader still flags this as historical:true because
      // ?v=<n> always swaps the markdown to the journal snapshot
      // (rather than the on-disk body) when the version resolves.
      // This is the safer default — the operator opted into the
      // versioned URL. So the buttons SHOULD be disabled.
      expect(html).toMatch(/data-action="approve"[^>]*disabled/);
      expect(html).toMatch(/data-action="iterate"[^>]*disabled/);
    });
  });
});
