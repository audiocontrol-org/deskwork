// US7 (022) — every artifact the workflow authors lands INSIDE the installation
// domain; in an adopter-repo (an installation nested below a repo root) no
// authored path escapes the installation tree, and a state-writing verb with no
// enclosing installation refuses loud (FR-030/FR-031, SC-005). Mirrors the
// existing installation-isolation-probe. RED first (T030).

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  diffSnapshots,
  gitIn,
  makeNestedFixture,
  snapshotOutsideInstallation,
  type NestedFixture,
} from '../_isolation-harness.js';
import { roadmapMarkdown } from '../fixtures/workflow/workflow-fixtures.js';
import { convergenceRecordPath } from '../../govern/convergence-record.js';
import { runCli } from '../_run-helpers.js';

let fixtures: NestedFixture[] = [];
function nested(): NestedFixture {
  const f = makeNestedFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const ITEM = 'multi:feature/x';

/** Seed a roadmap node in the installation and commit the whole tree (clean). */
function seed(f: NestedFixture): void {
  f.writeInstallation('ROADMAP.md', roadmapMarkdown([{ identifier: ITEM, status: 'planned' }]));
  gitIn(f.outerRoot, ['add', '.']);
  gitIn(f.outerRoot, ['commit', '-q', '-m', 'seed roadmap']);
}

describe('US7 — workflow authored artifacts stay inside the installation', () => {
  it('link-design / link-spec / advance write nothing outside the installation tree', () => {
    const f = nested();
    seed(f);
    const before = snapshotOutsideInstallation(f);

    const cwd = f.installationRoot;
    expect(runCli(['workflow', 'link-design', ITEM, 'docs/superpowers/specs/x-design.md', '--apply'], { cwd }).status).toBe(0);
    expect(runCli(['workflow', 'link-spec', ITEM, 'specs/022-x', '--apply'], { cwd }).status).toBe(0);
    expect(runCli(['workflow', 'advance', ITEM, '--apply'], { cwd }).status).toBe(0);

    const after = snapshotOutsideInstallation(f);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('the govern-convergence record path resolves inside the installation', () => {
    const f = nested();
    const path = convergenceRecordPath(f.installationRoot, 'impl', '022-x');
    expect(path.startsWith(f.installationRoot)).toBe(true);
    expect(path.startsWith(f.outerRoot + '/' + '.stack-control')).toBe(false);
  });
});

describe('US7 — no enclosing installation refuses loud (state-writing verb)', () => {
  it('refuses with stackctl setup guidance and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-no-install-'));
    try {
      const r = runCli(['workflow', 'advance', ITEM], { cwd: dir });
      expect(r.status).not.toBe(0);
      expect(`${r.stderr}`).toMatch(/stackctl setup/);
      expect(existsSync(join(dir, 'ROADMAP.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
