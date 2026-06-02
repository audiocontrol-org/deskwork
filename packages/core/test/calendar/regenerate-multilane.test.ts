/**
 * Calendar regen regression — Phase 4 / Issue #247.
 *
 * Before the fix:
 *   - The renderer's hardcoded `STAGE_ORDER` covered only the editorial
 *     8 stages, so entries whose `currentStage` happened to be a
 *     non-editorial stage (visual: `Sketched / Iterating / Approved /
 *     Shipped`) silently disappeared from the rendered output.
 *   - Even editorial entries in `Final` / `Cancelled` were silently
 *     dropped when paired with the legacy parser's 7-stage list
 *     (the parser's `STAGES` const was `Ideas / Planned / Outlining /
 *     Drafting / Review / Paused / Published`).
 *
 * After the fix:
 *   - When no lanes are configured, the renderer falls back to the
 *     editorial fallback's 8-stage list — `Final` and `Cancelled` are
 *     present.
 *   - When lanes ARE configured, the renderer emits a `# Lane: <name>`
 *     section per lane with per-lane stage sections drawn from that
 *     lane's bound template. Entries in non-editorial stages render
 *     under their lane's template's section.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { regenerateCalendar } from '@/calendar/regenerate';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

describe('regenerateCalendar — multi-lane / #247 regression', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-regen-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    // Post-merge (#232): regenerateCalendar resolves the calendar path
    // via config; seed a minimal config so the resolver can find the
    // default site's calendarPath.
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
        defaultSite: 'main',
      }),
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  // Use a counter so each generated entry gets a unique uuid that
  // satisfies the strict v4 shape.
  let uuidCounter = 0;
  function nextUuid(): string {
    uuidCounter++;
    const hex = uuidCounter.toString(16).padStart(12, '0');
    return `550e8400-e29b-41d4-a716-${hex}`;
  }
  function entry(slug: string, stage: string, opts: Partial<Entry> = {}): Entry {
    return {
      uuid: nextUuid(),
      slug,
      title: slug.replace(/-/g, ' '),
      keywords: [],
      source: 'manual',
      currentStage: stage,
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...opts,
    };
  }

  it('preserves Final + Cancelled entries in the single-lane / editorial-fallback shape', async () => {
    await writeSidecar(projectRoot, entry('idea-1', 'Ideas'));
    await writeSidecar(projectRoot, entry('final-1', 'Final', { priorStage: 'Drafting' }));
    await writeSidecar(projectRoot, entry('cancelled-1', 'Cancelled', { priorStage: 'Drafting' }));

    await regenerateCalendar(projectRoot);

    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    // Every entry must appear in the rendered output.
    expect(md).toContain('idea-1');
    expect(md).toContain('final-1');
    expect(md).toContain('cancelled-1');
    // Section headings include both Final and Cancelled.
    expect(md).toContain('## Final');
    expect(md).toContain('## Cancelled');
    // Legacy section names (Review / Paused) must NOT appear in the
    // new shape — the rendered output is the new vocabulary only.
    expect(md).not.toContain('## Review');
    expect(md).not.toContain('## Paused');
  });

  it('emits per-lane sections when lane configs are present', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
      JSON.stringify({
        id: 'default',
        name: 'Default',
        pipelineTemplate: 'editorial',
        contentDir: 'docs',
      }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
      JSON.stringify({
        id: 'mockups',
        name: 'Mockups',
        pipelineTemplate: 'visual',
        contentDir: 'mockups',
      }),
    );

    await writeSidecar(projectRoot, entry('post-a', 'Drafting', { lane: 'default' }));
    await writeSidecar(projectRoot, entry('icon-set', 'Iterating', { lane: 'mockups' }));
    await writeSidecar(projectRoot, entry('logo-b', 'Approved', { lane: 'mockups' }));

    await regenerateCalendar(projectRoot);

    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    expect(md).toContain('# Lane: Default');
    expect(md).toContain('# Lane: Mockups');
    // Editorial lane section contains the editorial stages.
    expect(md).toContain('## Drafting');
    // Visual lane section contains the visual stages.
    expect(md).toContain('## Iterating');
    expect(md).toContain('## Approved');
    expect(md).toContain('## Sketched');
    expect(md).toContain('## Shipped');
    // Visual-specific off-pipeline stage shows up.
    expect(md).toContain('## Archived');
    // Every entry shows up.
    expect(md).toContain('post-a');
    expect(md).toContain('icon-set');
    expect(md).toContain('logo-b');
  });

  it('places entries without a lane in an unassigned section', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
      JSON.stringify({
        id: 'default',
        name: 'Default',
        pipelineTemplate: 'editorial',
        contentDir: 'docs',
      }),
    );
    // Entry has no `lane` field (legacy, migration window).
    await writeSidecar(projectRoot, entry('legacy-one', 'Ideas'));

    await regenerateCalendar(projectRoot);
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    expect(md).toContain('# Lane: (unassigned)');
    expect(md).toContain('legacy-one');
  });

  // AUDIT-20260530-21: lock in the h1 lane-header rendering (the
  // existing tests above check for `# Lane: Default` etc. as substring,
  // but a substring match for `# Lane:` also matches `## Lane:`. The
  // docstring on `renderCalendar` had drifted to promise `## Lane:`
  // while the code emits `# Lane:`. Tests substring-checked the right
  // string but did not falsify the h1-vs-h2 question. This regression
  // pins the heading level directly so a future drift toward h2 fails
  // the suite.
  it('emits h1 (not h2) lane headers as sibling top-level headings to the calendar masthead', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
      JSON.stringify({
        id: 'default',
        name: 'Default',
        pipelineTemplate: 'editorial',
        contentDir: 'docs',
      }),
    );
    await writeSidecar(projectRoot, entry('post-a', 'Drafting', { lane: 'default' }));

    await regenerateCalendar(projectRoot);
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');

    // The lane header is at h1 — start-of-line, single hash, space, "Lane:".
    expect(md).toMatch(/^# Lane: Default$/m);
    // And it is NOT at h2.
    expect(md).not.toMatch(/^## Lane: Default$/m);
    // The masthead is also h1, so lane headers are siblings of it (not
    // nested under it). This is the deliberate visual choice.
    expect(md).toMatch(/^# Editorial Calendar$/m);
  });

  it('emits h1 for the unassigned-lane header (matches the named-lane h1)', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
      JSON.stringify({
        id: 'default',
        name: 'Default',
        pipelineTemplate: 'editorial',
        contentDir: 'docs',
      }),
    );
    // Entry with no lane → routes to the "(unassigned)" lane section.
    await writeSidecar(projectRoot, entry('legacy-one', 'Ideas'));

    await regenerateCalendar(projectRoot);
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');

    expect(md).toMatch(/^# Lane: \(unassigned\)$/m);
    expect(md).not.toMatch(/^## Lane: \(unassigned\)$/m);
  });

  // AUDIT-20260530-14: the multi-lane renderer used to silently drop
  // entries whose `currentStage` was not in their lane's template (or
  // not in the editorial-fallback stage list for orphan entries). Both
  // are the exact #247 silent-drop failure mode reintroduced on the
  // canonical calendar SSOT. The unbucketed-tail surface (mirror of
  // `bucketMembersByLane` in `members-bucketing.ts`) keeps the entry
  // visible in the rendered output.
  describe('AUDIT-20260530-14 — unbucketed entries surface in tail', () => {
    it('surfaces an entry whose currentStage is not in its lane template (valid lane, out-of-template stage)', async () => {
      await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
      // Visual lane bound to the visual template (stages: Sketched,
      // Iterating, Approved, Shipped + Blocked/Cancelled/Archived).
      await writeFile(
        join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
        JSON.stringify({
          id: 'mockups',
          name: 'Mockups',
          pipelineTemplate: 'visual',
          contentDir: 'mockups',
        }),
      );
      // Entry bound to the valid lane but carrying a stage the
      // template does NOT declare (legacy stage, operator-renamed
      // template, etc.).
      await writeSidecar(
        projectRoot,
        entry('legacy-stage-entry', 'NonExistentStage', { lane: 'mockups' }),
      );

      await regenerateCalendar(projectRoot);
      const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');

      // The entry MUST appear in the rendered calendar — pre-fix it
      // vanished silently because `bucketize` only created buckets for
      // template-known stages.
      expect(md).toContain('legacy-stage-entry');
      // It surfaces under the per-lane unbucketed-tail headline.
      expect(md).toContain('## (unrecognized stage)');
      // The raw `currentStage` is shown so the operator can diagnose.
      expect(md).toContain('NonExistentStage');
      // And it lives under the correct lane section.
      expect(md).toContain('# Lane: Mockups');
    });

    it('surfaces an orphan entry whose currentStage is not in the editorial fallback (deleted-visual-lane / non-editorial stage)', async () => {
      await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
      // Configure a single editorial lane; the entry will reference a
      // non-existent visual lane id, so it becomes an orphan that
      // routes through `EDITORIAL_FALLBACK`. Pre-fix, an orphan at a
      // non-editorial stage (`Sketched`) silently vanished from the
      // "(unassigned)" section because no editorial-fallback bucket
      // existed for it.
      await writeFile(
        join(projectRoot, '.deskwork', 'lanes', 'default.json'),
        JSON.stringify({
          id: 'default',
          name: 'Default',
          pipelineTemplate: 'editorial',
          contentDir: 'docs',
        }),
      );
      // Entry references a lane id whose config does NOT exist on disk
      // (simulating a deleted lane). At a non-editorial stage so it
      // can't match any editorial-fallback bucket.
      await writeSidecar(
        projectRoot,
        entry('orphan-at-sketched', 'Sketched', { lane: 'deleted-visual' }),
      );

      await regenerateCalendar(projectRoot);
      const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');

      // The entry MUST appear in the rendered calendar.
      expect(md).toContain('orphan-at-sketched');
      // It surfaces under the orphan-lane unbucketed-tail headline
      // (distinct from the per-lane one so operators can diagnose).
      expect(md).toContain('## (unrecognized stage in unassigned)');
      // The raw `currentStage` is shown so the operator can diagnose.
      expect(md).toContain('Sketched');
      // And it lives under the "(unassigned)" lane section.
      expect(md).toContain('# Lane: (unassigned)');
    });

    it('does NOT emit unbucketed-tail sections when every entry has a template-known stage in a valid lane', async () => {
      await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
      await writeFile(
        join(projectRoot, '.deskwork', 'lanes', 'default.json'),
        JSON.stringify({
          id: 'default',
          name: 'Default',
          pipelineTemplate: 'editorial',
          contentDir: 'docs',
        }),
      );
      await writeFile(
        join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
        JSON.stringify({
          id: 'mockups',
          name: 'Mockups',
          pipelineTemplate: 'visual',
          contentDir: 'mockups',
        }),
      );

      await writeSidecar(projectRoot, entry('post-a', 'Drafting', { lane: 'default' }));
      await writeSidecar(projectRoot, entry('icon-set', 'Iterating', { lane: 'mockups' }));

      await regenerateCalendar(projectRoot);
      const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');

      // Happy-path regression: no unbucketed-tail headlines appear.
      expect(md).not.toContain('## (unrecognized stage)');
      expect(md).not.toContain('## (unrecognized stage in unassigned)');
      // Existing behavior holds: entries appear under their lane's
      // template-known sections.
      expect(md).toContain('post-a');
      expect(md).toContain('icon-set');
    });
  });
});
