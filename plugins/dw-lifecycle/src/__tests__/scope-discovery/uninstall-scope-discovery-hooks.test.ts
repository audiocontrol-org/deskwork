/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/uninstall-scope-discovery-hooks.test.ts
 *
 * Tests for `dw-lifecycle uninstall-scope-discovery-hooks`. Each test
 * runs install + uninstall against a fresh tmpdir and asserts the
 * end state (file removed, block stripped, manifest cleaned, drift
 * refused).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  install as installHooks,
  HOOK_BEGIN_MARKER,
  HOOK_END_MARKER,
} from '../../scope-discovery/install-scope-discovery-hooks.js';
import {
  install as installAgents,
  STEP_0_BEGIN_MARKER,
  STEP_0_END_MARKER,
  TARGET_AGENTS,
} from '../../scope-discovery/install-agent-prompts.js';
import {
  main,
  parseCli,
  stripManagedBlock,
  uninstall,
} from '../../scope-discovery/uninstall-scope-discovery-hooks.js';

function makeGitTmp(prefix: string): string {
  const tmp = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: tmp });
  return tmp;
}

function seedAgents(tmp: string): void {
  for (const rel of TARGET_AGENTS) {
    mkdirSync(join(tmp, rel, '..'), { recursive: true });
    writeFileSync(
      join(tmp, rel),
      `# ${rel.split('/').pop()}\n\nOperator content above.\n`,
      'utf8',
    );
  }
}

describe('uninstall-scope-discovery-hooks — parseCli', () => {
  it('defaults', () => {
    const opts = parseCli([]);
    expect(opts.forceUninstall).toBe(false);
    expect(opts.dryRun).toBe(false);
  });

  it('--force-uninstall + --dry-run', () => {
    expect(parseCli(['--force-uninstall']).forceUninstall).toBe(true);
    expect(parseCli(['--dry-run']).dryRun).toBe(true);
  });

  it('--target requires value', () => {
    expect(() => parseCli(['--target'])).toThrow(/--target requires a path/);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('uninstall-scope-discovery-hooks — stripManagedBlock', () => {
  it('strips block + trailing newline cleanly', () => {
    const content = `before\n\n${STEP_0_BEGIN_MARKER}\nmanaged\n${STEP_0_END_MARKER}\n\nafter\n`;
    const result = stripManagedBlock(
      content,
      STEP_0_BEGIN_MARKER,
      STEP_0_END_MARKER,
    );
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result).not.toContain(STEP_0_BEGIN_MARKER);
    expect(result).not.toContain(STEP_0_END_MARKER);
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('returns null when marker absent', () => {
    expect(
      stripManagedBlock('no markers here', STEP_0_BEGIN_MARKER, STEP_0_END_MARKER),
    ).toBeNull();
  });
});

describe('uninstall-scope-discovery-hooks — uninstall() against tmpdir', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeGitTmp('dw-uninstall-hooks-');
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('removes a fresh hook file outright', () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    const hookPath = join(tmp, '.githooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    expect(existsSync(hookPath)).toBe(false);
    // Manifest removed because all entries cleanly removed
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it('strips the managed block from a merged hook (preserves operator content)', () => {
    mkdirSync(join(tmp, '.githooks'), { recursive: true });
    const operatorContent = '#!/bin/sh\necho "operator-owned hook"\n';
    writeFileSync(join(tmp, '.githooks', 'pre-commit'), operatorContent, 'utf8');
    installHooks({
      target: tmp,
      merge: true,
      replace: false,
      force: false,
      dryRun: false,
    });
    // Merging changes the file content; refresh the manifest sha by
    // re-running install with --merge (idempotent, marker dedup).
    // Then run uninstall.
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    const remaining = readFileSync(
      join(tmp, '.githooks', 'pre-commit'),
      'utf8',
    );
    expect(remaining).toContain('operator-owned hook');
    expect(remaining).not.toContain(HOOK_BEGIN_MARKER);
    expect(remaining).not.toContain(HOOK_END_MARKER);
  });

  it('refuses to remove a drifted file without --force-uninstall', () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    const hookPath = join(tmp, '.githooks', 'pre-commit');
    appendFileSync(hookPath, '\n# operator tweak\n');
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: false,
    });
    expect(result.code).toBe(2);
    expect(existsSync(hookPath)).toBe(true);
    // Manifest NOT removed because one entry was skipped-drift
    expect(existsSync(result.manifestPath)).toBe(true);
    const drift = result.removals.find((r) => r.result === 'skipped-drift');
    expect(drift).toBeDefined();
  });

  it('--force-uninstall removes drifted file via marker-strip', () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    const hookPath = join(tmp, '.githooks', 'pre-commit');
    appendFileSync(hookPath, '\n# operator tweak\n');
    const result = uninstall({
      target: tmp,
      forceUninstall: true,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    // The hook had the marker, so it was stripped; trailing tweak survives
    if (existsSync(hookPath)) {
      const remaining = readFileSync(hookPath, 'utf8');
      expect(remaining).not.toContain(HOOK_BEGIN_MARKER);
      expect(remaining).toContain('operator tweak');
    }
    // Manifest removed because the drifted file was cleanly handled
    // under --force-uninstall.
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it('strips Step 0 block from agent files (preserves operator content)', () => {
    seedAgents(tmp);
    installAgents({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    for (const rel of TARGET_AGENTS) {
      const content = readFileSync(join(tmp, rel), 'utf8');
      expect(content).toContain('Operator content above.');
      expect(content).not.toContain(STEP_0_BEGIN_MARKER);
      expect(content).not.toContain(STEP_0_END_MARKER);
    }
  });

  it('handles missing files gracefully (skipped-missing)', () => {
    seedAgents(tmp);
    installAgents({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    // Operator deleted one of the agent files after install
    rmSync(join(tmp, TARGET_AGENTS[0] ?? ''));
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: false,
    });
    const missing = result.removals.find(
      (r) => r.result === 'skipped-missing',
    );
    expect(missing).toBeDefined();
    expect(result.code).toBe(0);
  });

  it('throws when no manifest exists', () => {
    expect(() =>
      uninstall({ target: tmp, forceUninstall: false, dryRun: false }),
    ).toThrow(/no hooks-installed.json manifest/);
  });

  it('--dry-run does not modify anything', () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    const before = readFileSync(join(tmp, '.githooks', 'pre-commit'), 'utf8');
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: true,
    });
    expect(result.code).toBe(0);
    const after = readFileSync(join(tmp, '.githooks', 'pre-commit'), 'utf8');
    expect(after).toBe(before);
    expect(existsSync(result.manifestPath)).toBe(true);
  });

  it('unsets git core.hooksPath when uninstalling a fresh-githooks install', () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    uninstall({ target: tmp, forceUninstall: false, dryRun: false });
    let configValue = '';
    try {
      configValue = execSync('git config --get core.hooksPath', {
        cwd: tmp,
      })
        .toString('utf8')
        .trim();
    } catch {
      configValue = '<unset>';
    }
    expect(configValue).toBe('<unset>');
  });

  it('handles combined hooks + agents install in one pass', () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    seedAgents(tmp);
    installAgents({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    const result = uninstall({
      target: tmp,
      forceUninstall: false,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    expect(existsSync(join(tmp, '.githooks', 'pre-commit'))).toBe(false);
    for (const rel of TARGET_AGENTS) {
      const content = readFileSync(join(tmp, rel), 'utf8');
      expect(content).not.toContain(STEP_0_BEGIN_MARKER);
    }
    expect(existsSync(result.manifestPath)).toBe(false);
  });
});

describe('uninstall-scope-discovery-hooks — main()', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeGitTmp('dw-uninstall-main-');
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns 0 on clean uninstall', async () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(0);
  });

  it('returns 2 when manifest missing', async () => {
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(2);
  });

  it('returns 2 on drift refusal', async () => {
    installHooks({
      target: tmp,
      merge: false,
      replace: false,
      force: false,
      dryRun: false,
    });
    appendFileSync(
      join(tmp, '.githooks', 'pre-commit'),
      '\n# operator-tweak\n',
    );
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(2);
  });

  it('returns 2 on unknown flag', async () => {
    const result = await main(['--target', tmp, '--bogus']);
    expect(result.code).toBe(2);
  });
});
