/**
 * loadLaneConfig + listLaneConfigs tests.
 *
 * Each test uses a fresh tmp dir (mkdtempSync) for the projectRoot.
 * Lane configs are project-owned with no plugin defaults; tests
 * write the JSON into `.deskwork/lanes/` directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLaneConfig,
  listLaneConfigs,
  laneConfigPath,
  lanesDir,
} from '../../src/lanes/loader.ts';

function writeLane(projectRoot: string, id: string, payload: unknown): void {
  const dir = lanesDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

describe('loadLaneConfig', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-lanes-loader-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('loads a valid lane config bound to the editorial preset', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const lane = loadLaneConfig('default', projectRoot);
    expect(lane.id).toBe('default');
    expect(lane.name).toBe('Default');
    expect(lane.pipelineTemplate).toBe('editorial');
    expect(lane.contentDir).toBe('docs');
  });

  it('passes through unknown extra fields (e.g. $rationale)', () => {
    writeLane(projectRoot, 'default', {
      $rationale: 'why this lane exists',
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const lane = loadLaneConfig('default', projectRoot);
    expect(lane.id).toBe('default');
  });

  it('throws when the lane config file does not exist', () => {
    expect(() => loadLaneConfig('does-not-exist', projectRoot))
      .toThrow(/Lane config "does-not-exist" not found/);
  });

  it('throws with the searched path in the error when the lane is missing', () => {
    expect(() => loadLaneConfig('does-not-exist', projectRoot))
      .toThrow(/\.deskwork\/lanes\/does-not-exist\.json/);
  });

  it('throws on malformed JSON', () => {
    const dir = lanesDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'default.json'),
      '{ this is not valid json',
      'utf8',
    );
    expect(() => loadLaneConfig('default', projectRoot))
      .toThrow(/not valid JSON/);
  });

  it('throws on Zod-invalid lane (missing required field)', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      // pipelineTemplate missing — required
      contentDir: 'docs',
    });
    expect(() => loadLaneConfig('default', projectRoot))
      .toThrow(/failed Zod validation/);
  });

  it('throws when the JSON id field disagrees with the filename basename', () => {
    writeLane(projectRoot, 'default', {
      id: 'mockups',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    expect(() => loadLaneConfig('default', projectRoot))
      .toThrow(/declares id "mockups" but was loaded as "default"/);
  });

  it('throws when the referenced pipelineTemplate does not resolve', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'does-not-exist',
      contentDir: 'docs',
    });
    expect(() => loadLaneConfig('default', projectRoot))
      .toThrow(/references pipelineTemplate "does-not-exist"/);
  });

  it('throws on empty / whitespace id', () => {
    expect(() => loadLaneConfig('', projectRoot)).toThrow(/non-empty id/);
    expect(() => loadLaneConfig('   ', projectRoot)).toThrow(/non-empty id/);
  });

  it('refuses lane ids whose charset escapes the kebab-case convention', () => {
    for (const bad of ['UPPER', 'with space', 'with/slash', 'leading-dash-ok', '-bad']) {
      // Sanity: kebab-case must start with [a-z0-9], so "-bad" fails;
      // "leading-dash-ok" passes the regex (starts with 'l') and is
      // included as a confirm-not-refused case below.
      if (bad === 'leading-dash-ok') continue;
      expect(() => loadLaneConfig(bad, projectRoot)).toThrow(/Invalid lane id/);
    }
  });

  it('refuses a path-traversal-shaped lane id at the loader boundary', () => {
    // The regex catches this case (`.` and `/` are not in the charset),
    // and the path-containment check enforces the invariant at the
    // filesystem boundary. Either layer should refuse — the test just
    // confirms loadLaneConfig rejects with a recognizable error.
    expect(() => loadLaneConfig('../../etc/foo', projectRoot)).toThrow(/Invalid lane id/);
  });

  it('cross-validates a lane bound to a project-override pipeline template', () => {
    // Write a custom pipeline override the lane references — the loader's
    // cross-validation must resolve it via loadPipelineTemplate's
    // override-takes-precedence path.
    const pipelinesDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(pipelinesDir, { recursive: true });
    writeFileSync(
      join(pipelinesDir, 'visual.json'),
      JSON.stringify(
        {
          id: 'visual',
          name: 'Visual (project override)',
          description: 'custom visual lane pipeline',
          linearStages: ['Sketch', 'Refine', 'Final', 'Published'],
          lockedStages: ['Final'],
          offPipelineStages: ['Blocked', 'Cancelled'],
        },
        null,
        2,
      ),
      'utf8',
    );
    writeLane(projectRoot, 'mockups', {
      id: 'mockups',
      name: 'Mockups',
      pipelineTemplate: 'visual',
      contentDir: 'src/mockups',
    });
    const lane = loadLaneConfig('mockups', projectRoot);
    expect(lane.pipelineTemplate).toBe('visual');
  });
});

describe('listLaneConfigs', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-lanes-list-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns an empty array when no .deskwork/lanes/ directory exists', () => {
    expect(listLaneConfigs(projectRoot)).toEqual([]);
  });

  it('returns an empty array when .deskwork/ exists but lanes/ does not', () => {
    mkdirSync(join(projectRoot, '.deskwork'), { recursive: true });
    expect(listLaneConfigs(projectRoot)).toEqual([]);
  });

  it('returns every .json basename in lanes/', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLane(projectRoot, 'mockups', {
      id: 'mockups',
      name: 'Mockups',
      pipelineTemplate: 'visual',
      contentDir: 'src/mockups',
    });
    expect(listLaneConfigs(projectRoot)).toEqual(['default', 'mockups']);
  });

  it('returns ids in stable sorted order', () => {
    writeLane(projectRoot, 'zebra', {
      id: 'zebra',
      name: 'Zebra',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLane(projectRoot, 'alpha', {
      id: 'alpha',
      name: 'Alpha',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const ids = listLaneConfigs(projectRoot);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toEqual(['alpha', 'zebra']);
  });

  it('ignores non-JSON files in lanes/', () => {
    const dir = lanesDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# lane configs', 'utf8');
    writeFileSync(join(dir, 'old.json.bak'), '{}', 'utf8');
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const ids = listLaneConfigs(projectRoot);
    expect(ids).toEqual(['default']);
  });

  it('filters archived lanes out by default (Phase 6 Task 6.1)', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLane(projectRoot, 'stale', {
      id: 'stale',
      name: 'Stale',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    expect(listLaneConfigs(projectRoot)).toEqual(['default']);
  });

  it('returns archived lanes when includeArchived=true (Phase 6 Task 6.1)', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLane(projectRoot, 'stale', {
      id: 'stale',
      name: 'Stale',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    expect(listLaneConfigs(projectRoot, { includeArchived: true })).toEqual([
      'default',
      'stale',
    ]);
  });

  it('degrades gracefully on malformed JSON when filtering archived lanes', () => {
    // Malformed JSON should not break the archived-filter pass; the
    // lane appears in the (non-archived) list and surfaces its
    // malformation at loadLaneConfig time.
    const dir = lanesDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'broken.json'), '{ not json', 'utf8');
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    expect(listLaneConfigs(projectRoot)).toEqual(['broken', 'default']);
  });
});

describe('path helpers', () => {
  it('lanesDir resolves to .deskwork/lanes under projectRoot', () => {
    expect(lanesDir('/proj')).toBe(join('/proj', '.deskwork', 'lanes'));
  });

  it('laneConfigPath resolves to .deskwork/lanes/<id>.json', () => {
    expect(laneConfigPath('/proj', 'default')).toBe(
      join('/proj', '.deskwork', 'lanes', 'default.json'),
    );
  });
});
