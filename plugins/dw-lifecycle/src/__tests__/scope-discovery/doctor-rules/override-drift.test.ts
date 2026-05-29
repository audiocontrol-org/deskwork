/**
 * Tests for the `override-drift` doctor rule (operator advisory).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/override-drift.js';

const tmpRoots: string[] = [];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Mirrors the rule's PLUGIN_DEFAULTS_DIR resolution: from
// src/__tests__/scope-discovery/doctor-rules/ go up to src/, then
// into scope-discovery/.
const PLUGIN_DEFAULTS_DIR = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scope-discovery',
);

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-override-drift-'));
  tmpRoots.push(root);
  mkdirSync(join(root, '.dw-lifecycle/scope-discovery'), { recursive: true });
  return root;
}

function plantOverride(root: string, name: string, body: string): void {
  writeFileSync(
    join(root, '.dw-lifecycle/scope-discovery', name),
    body,
    'utf8',
  );
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

describe('override-drift doctor rule', () => {
  it('passes silently when no overrides exist', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('skips overrides that have no matching plugin default', async () => {
    const root = mkProject();
    plantOverride(
      root,
      'totally-new-module.ts',
      'export const X = 1;\nexport function fn() { return 2; }\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes when override is byte-identical to the plugin default', async () => {
    const root = mkProject();
    // Use a real existing plugin module so the comparison is honest.
    const realDefault = join(PLUGIN_DEFAULTS_DIR, 'clones-yaml.refactor.ts');
    const text = readFileSync(realDefault, 'utf8');
    plantOverride(root, 'clones-yaml.refactor.ts', text);
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes when override differs by < threshold lines AND exports match', async () => {
    const root = mkProject();
    const realDefault = join(PLUGIN_DEFAULTS_DIR, 'clones-yaml.refactor.ts');
    const text = readFileSync(realDefault, 'utf8');
    // Add a single inline comment — well under the 50-line threshold.
    const nudged = text.replace(
      '/** SHA regex for tests_proof.sha — partial (>= 7 hex) or full (40 hex). */',
      '/** SHA regex (override comment). */',
    );
    plantOverride(root, 'clones-yaml.refactor.ts', nudged);
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires advisory when override differs by > threshold lines', async () => {
    const root = mkProject();
    const realDefault = join(PLUGIN_DEFAULTS_DIR, 'clones-yaml.refactor.ts');
    const text = readFileSync(realDefault, 'utf8');
    // Append 80 distinct lines that don't appear in the default.
    const padding = Array.from({ length: 80 }, (_, i) => `const OVERRIDE_PAD_${i} = ${i};`).join('\n');
    plantOverride(root, 'clones-yaml.refactor.ts', `${text}\n${padding}\n`);
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('override-drift');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toMatch(/deliberate-override advisory/);
  });

  it('fires advisory when override changes the exported-symbol surface', async () => {
    const root = mkProject();
    const realDefault = join(PLUGIN_DEFAULTS_DIR, 'clones-yaml.refactor.ts');
    const text = readFileSync(realDefault, 'utf8');
    // Add a new export — the line-count delta alone is < threshold,
    // but the exports surface differs and that alone fires the rule.
    const withExtraExport =
      text + '\nexport const EXTRA_EXPORTED_SYMBOL = 42;\n';
    plantOverride(root, 'clones-yaml.refactor.ts', withExtraExport);
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/exported-symbol surface differs/);
  });
});
