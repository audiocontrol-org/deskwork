/**
 * Phase 34a Layer 2 — version-strip tests for the entry-keyed surface.
 *
 * Drives the per-entry version chips off the Layer 1 history-journal
 * reader and asserts on the rendered chip set + active-state behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import { iterateEntry } from '@deskwork/core/iterate';
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

function makeEntry(stage: Entry['currentStage']): Entry {
  return {
    uuid: KNOWN_UUID,
    slug: 'hello-world',
    title: 'Hello World',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: { Drafting: 0 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
}

async function seedArtifact(projectRoot: string, slug: string, body: string): Promise<void> {
  const dir = join(projectRoot, 'docs', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.md'), body, 'utf8');
}

async function rewriteArtifact(projectRoot: string, slug: string, body: string): Promise<void> {
  await writeFile(join(projectRoot, 'docs', slug, 'index.md'), body, 'utf8');
}

/**
 * Drive `iterateEntry` three times against a sequence of distinct
 * markdown bodies so the journal records v1, v2, v3 with distinct
 * snapshots. The sidecar's `iterationByStage.Drafting` ends at 3.
 *
 * Note: `iterateEntry` refuses no-op iterations (same content as the
 * last journal entry), so each pass writes a different body before
 * iterating.
 */
async function seedThreeIterations(projectRoot: string): Promise<void> {
  for (let v = 1; v <= 3; v++) {
    await rewriteArtifact(projectRoot, 'hello-world', `# Hello World\n\nv${v} body.\n`);
    await iterateEntry(projectRoot, { uuid: KNOWN_UUID });
  }
}

describe('entry-review version strip', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-review-vs-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await writeSidecar(projectRoot, makeEntry('Drafting'));
    await seedArtifact(projectRoot, 'hello-world', '# Hello World\n\nv0 body.\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('emits no version strip when there are no iterations', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).not.toContain('class="er-strip-versions"');
  });

  it('renders one chip per iteration when iterations exist', async () => {
    await seedThreeIterations(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toContain('class="er-strip-versions"');
    // Chip URLs carry stage qualification (Phase 34a F2 — disambiguates
    // multi-stage entries where version numbers can collide).
    // HTML-escaped & in href attributes (`&` → `&amp;`).
    expect(html).toContain('href="?v=1&amp;stage=Drafting"');
    expect(html).toContain('href="?v=2&amp;stage=Drafting"');
    expect(html).toContain('href="?v=3&amp;stage=Drafting"');
  });

  it('marks the current version chip as active by default', async () => {
    await seedThreeIterations(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    // entry.iterationByStage.Drafting === 3 → v3 is active.
    expect(html).toMatch(/href="\?v=3&amp;stage=Drafting" class="active"/);
    expect(html).toMatch(/href="\?v=1&amp;stage=Drafting" class=""/);
  });

  it('renders historical-version content when ?v=<n>&stage=<Stage> is set', async () => {
    await seedThreeIterations(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=1&stage=Drafting`,
      ),
    );
    const html = await res.text();
    // Body shows the v1 markdown (rendered).
    expect(html).toContain('v1 body.');
    expect(html).not.toContain('v3 body.');
    // Historical badge appears.
    expect(html).toContain('historical · v1');
    // The v1 chip is active.
    expect(html).toMatch(/href="\?v=1&amp;stage=Drafting" class="active"/);
  });

  it('still resolves historical content when ?stage= is omitted (single-stage entries)', async () => {
    // Backwards-compat: bare ?v= without ?stage= falls back to first
    // chronological match. Single-stage entries (the common case) stay
    // working.
    await seedThreeIterations(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=1`),
    );
    const html = await res.text();
    expect(html).toContain('v1 body.');
    expect(html).toContain('historical · v1');
  });

  it('falls back to current content when ?v=<n> does not match any iteration', async () => {
    await seedThreeIterations(projectRoot);
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=99`),
    );
    const html = await res.text();
    expect(html).toContain('v3 body.');
    expect(html).not.toContain('historical · v99');
  });

  /**
   * F2 regression — multi-stage version-number collision.
   *
   * Pre-fix, an entry with iterations across multiple stages (e.g.
   * Ideas v1 + Drafting v1) silently rendered the wrong content when
   * the operator clicked a version chip: the loader resolved by
   * version number alone and `getEntryIteration` returned the first
   * chronological match (Ideas v1) regardless of which chip was
   * clicked.
   *
   * Post-fix, chip URLs carry both `?v=` and `?stage=`, the loader
   * threads stage through `getEntryIteration`, and Drafting v1 vs
   * Ideas v1 are distinct on both URL shape and rendered content.
   */
  it('disambiguates by stage when an entry has the same version number across stages', async () => {
    // The default fixture (beforeEach) seeded the sidecar at
    // currentStage='Drafting'; we need the entry's first iteration to
    // land under Ideas instead. Overwrite the sidecar to Ideas, set
    // the artifactPath explicitly so iterateEntry resolves the right
    // file (Ideas's stage-default would be `scrapbook/idea.md`), then
    // iterate (records Ideas v1).
    await writeSidecar(projectRoot, {
      uuid: KNOWN_UUID,
      slug: 'hello-world',
      title: 'Hello World',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      artifactPath: 'docs/hello-world/index.md',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
    });
    await rewriteArtifact(projectRoot, 'hello-world', '# Hello World\n\nIdeas-v1 body.\n');
    await iterateEntry(projectRoot, { uuid: KNOWN_UUID });

    // Now transition the sidecar to Drafting (preserving Ideas
    // iteration count) and iterate again. Records Drafting v1 with
    // distinct content.
    await writeSidecar(projectRoot, {
      uuid: KNOWN_UUID,
      slug: 'hello-world',
      title: 'Hello World',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Ideas: 1 },
      artifactPath: 'docs/hello-world/index.md',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
    });
    await rewriteArtifact(projectRoot, 'hello-world', '# Hello World\n\nDrafting-v1 body.\n');
    await iterateEntry(projectRoot, { uuid: KNOWN_UUID });

    const app = createApp({ projectRoot, config: cfg });

    // Probe 1: Ideas v1 chip → Ideas-v1 body, NOT Drafting-v1 body.
    const ideasRes = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=1&stage=Ideas`,
      ),
    );
    const ideasHtml = await ideasRes.text();
    expect(ideasHtml).toContain('Ideas-v1 body.');
    expect(ideasHtml).not.toContain('Drafting-v1 body.');

    // Probe 2: Drafting v1 chip → Drafting-v1 body, NOT Ideas-v1 body.
    const draftRes = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/entry/${KNOWN_UUID}?v=1&stage=Drafting`,
      ),
    );
    const draftHtml = await draftRes.text();
    expect(draftHtml).toContain('Drafting-v1 body.');
    expect(draftHtml).not.toContain('Ideas-v1 body.');

    // Probe 3: chips render with stage qualification + a label that
    // includes the stage initial when more than one stage is present.
    const stripRes = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const stripHtml = await stripRes.text();
    expect(stripHtml).toContain('href="?v=1&amp;stage=Ideas"');
    expect(stripHtml).toContain('href="?v=1&amp;stage=Drafting"');
    // showStage=true → label is "I·v1" / "D·v1" rather than bare "v1".
    expect(stripHtml).toMatch(/>I·v1</);
    expect(stripHtml).toMatch(/>D·v1</);
  });
});
