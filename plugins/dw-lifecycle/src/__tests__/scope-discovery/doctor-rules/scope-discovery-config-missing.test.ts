/**
 * Tests for the `scope-discovery-config-missing` doctor rule.
 * Fixture trees on disk via mkdtempSync; no mock fs.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/scope-discovery-config-missing.js';

const tmpRoots: string[] = [];

function mkTmp(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-config-missing-'));
  tmpRoots.push(root);
  return root;
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

describe('scope-discovery-config-missing doctor rule', () => {
  it('passes silently when no scope-discovery references exist', async () => {
    const root = mkTmp();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes silently when the config dir already exists', async () => {
    const root = mkTmp();
    mkdirSync(join(root, '.dw-lifecycle/scope-discovery'), { recursive: true });
    // Plant a heuristic hit too — should still pass because the dir
    // exists.
    const featureDir = join(root, 'docs/1.0/001-IN-PROGRESS/foo');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'prd.md'),
      '# Foo\nrefers to scope-discovery here.\n',
      'utf8',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires a warning when scope-discovery is referenced but config dir missing', async () => {
    const root = mkTmp();
    const featureDir = join(root, 'docs/1.0/001-IN-PROGRESS/my-feature');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'workplan.md'),
      '# Workplan\nUses /dw-lifecycle:scope-inventory for scope-discovery.\n',
      'utf8',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('scope-discovery-config-missing');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toMatch(/install-scope-discovery/);
    expect(findings[0].message).toMatch(/workplan\.md/);
  });

  it('reports a count when multiple feature docs reference the slug', async () => {
    const root = mkTmp();
    for (const slug of ['a', 'b', 'c']) {
      const featureDir = join(root, 'docs/1.0/001-IN-PROGRESS', slug);
      mkdirSync(featureDir, { recursive: true });
      writeFileSync(
        join(featureDir, 'prd.md'),
        '# X\nscope-discovery is named here.\n',
        'utf8',
      );
    }
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/3 feature doc/);
  });

  it('ignores docs not containing the slug', async () => {
    const root = mkTmp();
    const featureDir = join(root, 'docs/1.0/001-IN-PROGRESS/unrelated');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'prd.md'),
      '# Unrelated feature\nNo references to the relevant slug.\n',
      'utf8',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });
});
