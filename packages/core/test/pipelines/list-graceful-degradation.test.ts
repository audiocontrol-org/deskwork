/**
 * listPipelines graceful-degradation tests.
 *
 * AUDIT-20260530-57 (Task 0.33, graphical-entries). Parallels the
 * `listLanes` fix: a single malformed project-override JSON under
 * `.deskwork/pipelines/` historically aborted the entire pipeline
 * enumeration because `listPipelines` mapped each id from
 * `listAvailablePipelineTemplates` through `loadPipelineTemplate`,
 * which throws on a corrupt override. Operators couldn't see any of
 * their healthy templates (built-in presets included) because the
 * loop failed on the first override that failed to parse.
 *
 * The fix collects per-id load failures into a `malformed` channel
 * on the result, so healthy templates still emit alongside a flagged
 * broken section.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPipelines } from '../../src/pipelines/operations/list.ts';

function writePipelineOverride(
  projectRoot: string,
  id: string,
  payload: Record<string, unknown>,
): void {
  const dir = join(projectRoot, '.deskwork', 'pipelines');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function writeRawPipelineOverride(
  projectRoot: string,
  id: string,
  rawJson: string,
): void {
  const dir = join(projectRoot, '.deskwork', 'pipelines');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), rawJson, 'utf8');
}

describe('listPipelines — graceful degradation on malformed overrides (AUDIT-20260530-57)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-list-pipelines-graceful-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns built-in presets + healthy override, with a malformed entry for one corrupt override', () => {
    // A healthy override that masks the editorial preset.
    writePipelineOverride(projectRoot, 'editorial', {
      id: 'editorial',
      name: 'Editorial Override',
      description: 'Operator override',
      linearStages: ['A', 'B', 'C'],
      offPipelineStages: [],
    });
    // A corrupt override that historically aborted enumeration.
    writeRawPipelineOverride(projectRoot, 'broken', '{ not json');

    const result = listPipelines(projectRoot);

    // Healthy templates (built-in presets + healthy override) still emit.
    const healthyIds = result.pipelines.map((p) => p.id).sort();
    expect(healthyIds).toContain('editorial');
    expect(healthyIds).toContain('blog-post');
    // The override-classified editorial should be 'project-override'.
    const editorial = result.pipelines.find((p) => p.id === 'editorial');
    expect(editorial?.source).toBe('project-override');

    // The malformed override surfaces in its own channel.
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0].id).toBe('broken');
    expect(result.malformed[0].error).toMatch(/JSON|parse|broken/i);
  });

  it('returns built-in presets with empty malformed when no overrides exist', () => {
    const result = listPipelines(projectRoot);

    expect(result.pipelines.length).toBeGreaterThan(0);
    expect(result.malformed).toEqual([]);
  });

  it('still emits all healthy built-in presets when an override is corrupt', () => {
    writeRawPipelineOverride(projectRoot, 'broken-override', '{ not json');

    const result = listPipelines(projectRoot);

    // Built-in presets unaffected by the corrupt override.
    const ids = result.pipelines.map((p) => p.id);
    expect(ids).toContain('editorial');
    expect(ids).toContain('blog-post');
    expect(result.malformed.map((m) => m.id)).toEqual(['broken-override']);
  });
});
