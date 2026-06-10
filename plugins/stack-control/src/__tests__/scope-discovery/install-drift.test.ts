// T069 — US8: install-drift advisory (FR-033 / R6). A drifted local `.specify`
// extension copy warns (naming it); an in-sync copy is silent. Non-blocking.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeInstallDrift, renderInstallDrift } from '../../scope-discovery/install-drift.js';

let root: string | null = null;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

function seed(): { pluginRoot: string; projectRoot: string } {
  root = mkdtempSync(join(tmpdir(), 'install-drift-'));
  const pluginRoot = join(root, 'plugin');
  const projectRoot = join(root, 'project');
  // Plugin source extension.
  const src = join(pluginRoot, 'spec-kit', 'gov', 'scripts');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'run.sh'), 'echo canonical\n');
  // Installed copy.
  const inst = join(projectRoot, '.specify', 'extensions', 'gov', 'scripts');
  mkdirSync(inst, { recursive: true });
  return { pluginRoot, projectRoot };
}

describe('install-drift', () => {
  it('is silent when the installed copy matches the plugin source', () => {
    const { pluginRoot, projectRoot } = seed();
    writeFileSync(join(projectRoot, '.specify', 'extensions', 'gov', 'scripts', 'run.sh'), 'echo canonical\n');

    const report = computeInstallDrift({ pluginRoot, projectRoot });
    expect(report.drifted).toEqual([]);
    expect(report.inSync).toContain('gov');

    let out = '';
    const hadDrift = renderInstallDrift(report, (s) => {
      out += s;
    });
    expect(hadDrift).toBe(false);
    expect(out).not.toMatch(/WARNING/);
  });

  it('warns and names the extension + file when the copy has drifted', () => {
    const { pluginRoot, projectRoot } = seed();
    writeFileSync(join(projectRoot, '.specify', 'extensions', 'gov', 'scripts', 'run.sh'), 'echo STALE\n');

    const report = computeInstallDrift({ pluginRoot, projectRoot });
    expect(report.drifted.length).toBe(1);
    expect(report.drifted[0].extension).toBe('gov');
    expect(report.drifted[0].drifted).toContain('scripts/run.sh');

    let out = '';
    const hadDrift = renderInstallDrift(report, (s) => {
      out += s;
    });
    expect(hadDrift).toBe(true);
    expect(out).toMatch(/WARNING.*gov/s);
    expect(out).toMatch(/scripts\/run\.sh/);
  });

  it('reports a source file missing from the install', () => {
    const { pluginRoot, projectRoot } = seed();
    // installed dir exists but the file is absent
    const report = computeInstallDrift({ pluginRoot, projectRoot });
    expect(report.drifted[0]?.missing).toContain('scripts/run.sh');
  });
});
