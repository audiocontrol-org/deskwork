import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEntryTemplate, resolveEntryStrictTemplate } from '@/lanes/resolve';
import type { Entry } from '@/schema/entry';

describe('resolveEntryTemplate', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-resolve-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  function baseEntry(overrides: Partial<Entry>): Entry {
    return {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x', title: 'x', keywords: [], source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...overrides,
    };
  }

  it('defaults to editorial when entry.lane is undefined (migration window)', async () => {
    const entry = baseEntry({});
    const template = resolveEntryTemplate(entry, projectRoot);
    expect(template.id).toBe('editorial');
    expect(template.linearStages).toContain('Drafting');
  });

  it('resolves the lane-bound template when entry.lane is set', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
      JSON.stringify({
        id: 'mockups',
        name: 'Mockups',
        pipelineTemplate: 'visual',
        contentDir: 'mockups',
      }),
    );
    const entry = baseEntry({ lane: 'mockups', currentStage: 'Sketched' });
    const template = resolveEntryTemplate(entry, projectRoot);
    expect(template.id).toBe('visual');
    expect(template.linearStages).toEqual(['Sketched', 'Iterating', 'Approved', 'Shipped']);
  });

  it('throws when entry.lane references a missing lane config', () => {
    const entry = baseEntry({ lane: 'nonexistent' });
    expect(() => resolveEntryTemplate(entry, projectRoot)).toThrow(/Lane config "nonexistent" not found/);
  });

  it('resolveEntryStrictTemplate returns the narrow projection', async () => {
    const entry = baseEntry({});
    const template = resolveEntryStrictTemplate(entry, projectRoot);
    // The strict type still has the same runtime fields — assert one.
    expect(template.linearStages.length).toBeGreaterThan(0);
  });
});
