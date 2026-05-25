/**
 * Tests for the `hooks-installed-missing` doctor rule.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/hooks-installed-missing.js';

const tmpRoots: string[] = [];

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-hooks-missing-'));
  tmpRoots.push(root);
  mkdirSync(join(root, '.dw-lifecycle/scope-discovery'), { recursive: true });
  return root;
}

function plantManifest(root: string, files: ReadonlyArray<string>): string {
  const manifestPath = join(
    root,
    '.dw-lifecycle/scope-discovery/hooks-installed.json',
  );
  const manifest = {
    installed_at: '2026-05-25T00:00:00Z',
    installed_by: 'dw-lifecycle install-scope-discovery-hooks v0.0.0-test',
    husky_detected: false,
    files: files.map((path) => ({
      path,
      sha256:
        '0000000000000000000000000000000000000000000000000000000000000000',
      managed: true,
    })),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifestPath;
}

function plantFile(path: string, body: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body, 'utf8');
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe('hooks-installed-missing doctor rule', () => {
  it('passes silently when the manifest is absent', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes when every managed file in the manifest exists', async () => {
    const root = mkProject();
    const hookPath = join(root, '.githooks/pre-commit');
    plantFile(hookPath, 'hook body\n');
    plantManifest(root, [hookPath]);
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires when a managed file has been deleted', async () => {
    const root = mkProject();
    const hookPath = join(root, '.githooks/pre-commit');
    plantFile(hookPath, 'hook body\n');
    plantManifest(root, [hookPath]);
    unlinkSync(hookPath);
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('hooks-installed-missing');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toMatch(/1 managed file/);
    expect(findings[0].message).toMatch(/install-scope-discovery-hooks --force/);
    expect(findings[0].message).toMatch(/uninstall-scope-discovery-hooks --force-uninstall/);
  });

  it('reports a count when multiple managed files are missing', async () => {
    const root = mkProject();
    const a = join(root, '.githooks/pre-commit');
    const b = join(root, '.claude/agents/code-reviewer.md');
    plantManifest(root, [a, b]);
    // Neither file exists on disk.
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/2 managed file/);
  });

  it('fires a warning when the manifest is unparseable', async () => {
    const root = mkProject();
    writeFileSync(
      join(root, '.dw-lifecycle/scope-discovery/hooks-installed.json'),
      'this is not valid JSON {{{',
      'utf8',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/failed to parse/);
  });

  it('passes when manifest has empty files list', async () => {
    const root = mkProject();
    plantManifest(root, []);
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });
});
