/**
 * Path-traversal hardening tests for the lane-config loader and the
 * Entry sidecar schema (AUDIT-20260530-07).
 *
 * The fix has three observable surfaces and one test per surface:
 *
 *   1. `loadLaneConfig(id, projectRoot)` MUST refuse any `id` that
 *      fails `LANE_ID_REGEX` before any filesystem access. The
 *      observable property is "no readFileSync against a path
 *      constructed from the malformed id"; we assert by writing a
 *      file at the traversal target and confirming the loader throws
 *      WITHOUT reading it (the test would otherwise pick up the
 *      contents).
 *
 *   2. `EntrySchema.lane` MUST reject sidecar values that fail the
 *      regex. The prior shape was `z.string().min(1).optional()` —
 *      a malformed sidecar (`lane: "../../secrets"`) parsed cleanly
 *      and flowed straight into `loadLaneConfig` at the next read.
 *      Binding the regex at the schema layer closes that vector
 *      upstream so a doctor / scan / studio render path can't load
 *      the malformed value at all.
 *
 *   3. `listLaneConfigs` MUST skip basenames that fail the regex. A
 *      stray non-canonical `.json` next to the real lane configs
 *      should not appear in the picker.
 *
 * The regression tests at the bottom assert the canonical happy paths
 * continue to work — `default` loads, `default` appears in the lane
 * listing, valid sidecars parse cleanly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLaneConfig,
  listLaneConfigs,
  lanesDir,
} from '../../src/lanes/loader.ts';
import { EntrySchema } from '../../src/schema/entry.ts';

function writeLane(projectRoot: string, id: string, payload: unknown): void {
  const dir = lanesDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    slug: 'sample-entry',
    title: 'Sample Entry',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AUDIT-20260530-07 — loadLaneConfig path-traversal hardening', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-lane-traversal-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses an id with parent-directory segments before reading the file', () => {
    // Seed a file at the would-be-traversal target. The kebab-case
    // regex rejects the dots + slashes before the path is constructed,
    // so the file's contents never reach the loader.
    const traversalTarget = join(projectRoot, 'gotcha.json');
    writeFileSync(traversalTarget, JSON.stringify({
      id: 'gotcha',
      name: 'Gotcha',
      pipelineTemplate: 'editorial',
      contentDir: 'gotcha',
    }), 'utf8');
    expect(existsSync(traversalTarget)).toBe(true);

    expect(() => loadLaneConfig('../../gotcha', projectRoot))
      .toThrow(/Invalid lane id/);
  });

  it('refuses an id containing a forward slash', () => {
    expect(() => loadLaneConfig('foo/bar', projectRoot))
      .toThrow(/Invalid lane id/);
  });

  it('refuses an id containing uppercase characters', () => {
    expect(() => loadLaneConfig('Default', projectRoot))
      .toThrow(/Invalid lane id/);
  });

  it('refuses an id beginning with a hyphen', () => {
    expect(() => loadLaneConfig('-default', projectRoot))
      .toThrow(/Invalid lane id/);
  });

  it('refuses an absolute path id', () => {
    expect(() => loadLaneConfig('/etc/passwd', projectRoot))
      .toThrow(/Invalid lane id/);
  });

  it('regression: a canonical lane id still loads', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const lane = loadLaneConfig('default', projectRoot);
    expect(lane.id).toBe('default');
  });
});

describe('AUDIT-20260530-07 — EntrySchema.lane charset binding', () => {
  it('rejects a sidecar carrying a parent-directory traversal in lane', () => {
    const result = EntrySchema.safeParse(validEntry({ lane: '../../secrets' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const laneIssue = result.error.issues.find((i) => i.path.includes('lane'));
      expect(laneIssue).toBeDefined();
    }
  });

  it('rejects a sidecar with an uppercase lane value', () => {
    const result = EntrySchema.safeParse(validEntry({ lane: 'Default' }));
    expect(result.success).toBe(false);
  });

  it('rejects a sidecar with an absolute-path lane value', () => {
    const result = EntrySchema.safeParse(validEntry({ lane: '/etc/passwd' }));
    expect(result.success).toBe(false);
  });

  it('rejects a sidecar with an underscore in the lane', () => {
    const result = EntrySchema.safeParse(validEntry({ lane: 'with_underscore' }));
    expect(result.success).toBe(false);
  });

  it('accepts a sidecar with a canonical kebab-case lane', () => {
    const result = EntrySchema.safeParse(validEntry({ lane: 'default' }));
    expect(result.success).toBe(true);
  });

  it('accepts a sidecar with no lane field (migration-window backward compat)', () => {
    const result = EntrySchema.safeParse(validEntry());
    expect(result.success).toBe(true);
  });
});

describe('AUDIT-20260530-07 — listLaneConfigs filters non-canonical basenames', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-lane-list-traversal-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('skips lane JSONs whose basename does not match the kebab-case regex', () => {
    // Canonical operator-authored lanes.
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
      contentDir: 'mockups',
    });
    // Non-canonical strays.
    const dir = lanesDir(projectRoot);
    writeFileSync(join(dir, 'Notes.json'), '{}', 'utf8');
    writeFileSync(join(dir, '.hidden.json'), '{}', 'utf8');
    writeFileSync(join(dir, 'with_underscore.json'), '{}', 'utf8');

    const ids = listLaneConfigs(projectRoot);
    expect(ids).toContain('default');
    expect(ids).toContain('mockups');
    expect(ids).not.toContain('Notes');
    expect(ids).not.toContain('.hidden');
    expect(ids).not.toContain('with_underscore');

    // Ensure the seeded files are still on disk (the filter is read-only).
    expect(existsSync(join(dir, 'Notes.json'))).toBe(true);
    expect(readFileSync(join(dir, 'Notes.json'), 'utf8')).toBe('{}');
  });
});
