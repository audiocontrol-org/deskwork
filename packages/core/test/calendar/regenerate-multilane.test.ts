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
});
