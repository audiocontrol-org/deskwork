/**
 * Unit tests for the pipelines-page data layer (Phase 6 Task 6.4).
 *
 * Coverage:
 *   - lists all 5 plugin presets on an empty project
 *   - distinguishes plugin-preset vs project-override sources
 *   - counts referencing lanes (active + archived) per template
 *   - surfaces a parse-error row when a project override JSON is
 *     malformed (does NOT silently filter — operator must see "fix
 *     this file")
 *   - surfaces a zod-error row when an override JSON is schema-invalid
 *   - surfaces an id-mismatch row when the JSON's `id` field
 *     disagrees with the filename basename
 *
 * Fixture project trees on disk per `.claude/rules/testing.md`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPipelinesPageData } from '../../src/pages/pipelines/data.ts';

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

describe('loadPipelinesPageData', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-data-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists every plugin-preset template on an empty project', async () => {
    const data = await loadPipelinesPageData(root);
    const ids = data.rows.map((r) => r.id);
    // The plugin ships five presets — assert their presence
    // explicitly so a missing preset surfaces as a fixture-level
    // regression rather than a silent shrink.
    expect(ids).toContain('editorial');
    expect(ids).toContain('visual');
    expect(ids).toContain('feature-doc');
    expect(ids).toContain('qa-plan');
    expect(ids).toContain('blog-post');
    expect(data.errors).toEqual([]);
    expect(data.totalLanes).toBe(0);
  });

  it('marks plugin presets as source=plugin-preset and override files as project-override', async () => {
    writePipelineOverride(root, 'editorial', {
      id: 'editorial',
      name: 'Custom Editorial',
      description: 'overridden',
      linearStages: ['Idea', 'Draft', 'Done'],
      offPipelineStages: ['Cancelled'],
    });

    const data = await loadPipelinesPageData(root);
    const byId = new Map(data.rows.map((r) => [r.id, r]));
    // editorial now has an override → source=project-override
    expect(byId.get('editorial')?.source).toBe('project-override');
    expect(byId.get('editorial')?.name).toBe('Custom Editorial');
    // visual has no override → source=plugin-preset
    expect(byId.get('visual')?.source).toBe('plugin-preset');
  });

  it('counts referencing lanes (active + archived) per template', async () => {
    writeLane(root, 'docs', 'editorial');
    writeLane(root, 'mockups', 'visual');
    writeLane(root, 'old-docs', 'editorial', '2026-04-01T10:00:00.000Z');

    const data = await loadPipelinesPageData(root);
    const byId = new Map(data.rows.map((r) => [r.id, r]));
    expect(byId.get('editorial')?.referencingLanes).toEqual(['docs', 'old-docs']);
    expect(byId.get('visual')?.referencingLanes).toEqual(['mockups']);
    expect(byId.get('feature-doc')?.referencingLanes).toEqual([]);
    expect(data.totalLanes).toBe(3);
  });

  it('exposes linearStages + lockedStages + offPipelineStages on each row', async () => {
    const data = await loadPipelinesPageData(root);
    const editorial = data.rows.find((r) => r.id === 'editorial');
    expect(editorial).toBeDefined();
    expect(editorial!.linearStages).toEqual([
      'Ideas',
      'Planned',
      'Outlining',
      'Drafting',
      'Final',
      'Published',
    ]);
    expect(editorial!.lockedStages).toEqual(['Final']);
    expect(editorial!.offPipelineStages).toEqual(['Blocked', 'Cancelled']);
  });

  it('surfaces parse errors as error rows (does NOT silently filter)', async () => {
    // Malformed JSON in the operator's override directory
    writePipelineOverride(root, 'broken', '{ this is not valid json');

    const data = await loadPipelinesPageData(root);
    const err = data.errors.find((e) => e.id === 'broken');
    expect(err).toBeDefined();
    expect(err!.error.kind).toBe('parse');
    expect(err!.error.path).toBe(
      join(root, '.deskwork', 'pipelines', 'broken.json'),
    );
    expect(err!.error.message).toContain('not valid JSON');
    // The id must NOT also appear in rows — error vs healthy is mutually
    // exclusive, but the picker (built off `rows + errors`) sees both.
    expect(data.rows.find((r) => r.id === 'broken')).toBeUndefined();
  });

  it('surfaces Zod validation errors as error rows', async () => {
    // Schema-invalid: linearStages must be non-empty.
    writePipelineOverride(root, 'empty-stages', {
      id: 'empty-stages',
      name: 'Empty',
      description: 'no stages',
      linearStages: [],
      offPipelineStages: [],
    });

    const data = await loadPipelinesPageData(root);
    const err = data.errors.find((e) => e.id === 'empty-stages');
    expect(err).toBeDefined();
    expect(err!.error.kind).toBe('zod');
    expect(err!.error.message).toContain('failed Zod validation');
  });

  it('surfaces id-mismatch errors as error rows', async () => {
    // JSON's `id` field disagrees with the filename basename.
    writePipelineOverride(root, 'a-id', {
      id: 'b-id',
      name: 'Misnamed',
      description: 'mismatched',
      linearStages: ['X'],
      offPipelineStages: [],
    });

    const data = await loadPipelinesPageData(root);
    const err = data.errors.find((e) => e.id === 'a-id');
    expect(err).toBeDefined();
    expect(err!.error.kind).toBe('id-mismatch');
  });

  it('records referencingLanes on error rows so the operator sees who depends on a broken template', async () => {
    writePipelineOverride(root, 'broken', '{ not json');
    writeLane(root, 'broken-consumer', 'broken');

    const data = await loadPipelinesPageData(root);
    const err = data.errors.find((e) => e.id === 'broken');
    expect(err?.referencingLanes).toEqual(['broken-consumer']);
  });
});
