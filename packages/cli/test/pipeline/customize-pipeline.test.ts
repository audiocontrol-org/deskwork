/**
 * deskwork CLI `customize pipeline <preset-id>` — start-from-preset
 * wrapper for `pipeline create`.
 *
 * Phase 6 Task 6.2 (graphical-entries). Covers the documented flow:
 * `customize pipeline editorial` copies the bundled preset JSON to
 * `.deskwork/pipelines/editorial.json`; subsequent `pipeline show`
 * resolves the override (not the preset); subsequent `pipeline update`
 * mutates the override; the refuse-to-overwrite path protects
 * operator edits.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDeskworkBinPresent,
  customize,
  destroyProject,
  makeProject,
  pipeline,
  readPipelineOverride,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork customize pipeline <preset-id>', () => {
  it('copies the bundled editorial preset into .deskwork/pipelines/', () => {
    const res = customize(project, 'pipeline', 'editorial');
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Customized pipeline\/editorial/);

    const dest = join(project, '.deskwork', 'pipelines', 'editorial.json');
    expect(existsSync(dest)).toBe(true);

    const onDisk = JSON.parse(readFileSync(dest, 'utf-8')) as {
      id: string;
      linearStages: string[];
    };
    expect(onDisk.id).toBe('editorial');
    expect(onDisk.linearStages).toEqual([
      'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published',
    ]);
  });

  it('the override takes precedence on subsequent pipeline show', () => {
    customize(project, 'pipeline', 'editorial');

    // Mutate the override directly to prove precedence (instead of via
    // `pipeline update` which would also exercise the override path).
    const dest = join(project, '.deskwork', 'pipelines', 'editorial.json');
    const onDisk = JSON.parse(readFileSync(dest, 'utf-8')) as {
      linearStages: string[];
      lockedStages?: string[];
    };
    onDisk.linearStages = ['A', 'B', 'C'];
    // The preset's `lockedStages: ['Final']` must move too — keeping it
    // unchanged would fail the loader's "lockedStages must be a subset
    // of linearStages" cross-validation.
    onDisk.lockedStages = [];
    writeFileSync(dest, JSON.stringify(onDisk, null, 2));

    const res = pipeline(project, 'show', 'editorial');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      linearStages: string[];
      source: string;
    };
    expect(parsed.source).toBe('project-override');
    expect(parsed.linearStages).toEqual(['A', 'B', 'C']);
  });

  it('refuses to clobber an existing override', () => {
    customize(project, 'pipeline', 'editorial');
    const res = customize(project, 'pipeline', 'editorial');
    expect(res.code).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/already exists|Refusing to overwrite/);
  });

  it('errors when the preset name does not exist', () => {
    const res = customize(project, 'pipeline', 'no-such-preset');
    expect(res.code).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/no built-in pipeline preset/);
  });

  it('the customized override is mutable via pipeline update', () => {
    customize(project, 'pipeline', 'editorial');
    const res = pipeline(
      project, 'update', 'editorial', '--add-stage', 'Promoted',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'editorial');
    const linearStages = onDisk['linearStages'];
    expect(Array.isArray(linearStages)).toBe(true);
    expect(linearStages).toContain('Promoted');
  });
});
