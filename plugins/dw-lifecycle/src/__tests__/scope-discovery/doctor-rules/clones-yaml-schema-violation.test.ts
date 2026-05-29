/**
 * Tests for the `clones-yaml-schema-violation` doctor rule.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/clones-yaml-schema-violation.js';

const tmpRoots: string[] = [];

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-clones-schema-'));
  tmpRoots.push(root);
  mkdirSync(join(root, '.dw-lifecycle/scope-discovery'), { recursive: true });
  return root;
}

function plant(root: string, body: string): void {
  writeFileSync(
    join(root, '.dw-lifecycle/scope-discovery/clones.yaml'),
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

describe('clones-yaml-schema-violation doctor rule', () => {
  it('passes silently when clones.yaml is absent', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes on a well-formed clones.yaml', async () => {
    const root = mkProject();
    plant(
      root,
      'schemaVersion: 1\ngenerated_at: "2026-05-25T00:00:00Z"\nclones: []\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires an error on missing generated_at', async () => {
    const root = mkProject();
    plant(root, 'clones: []\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('clones-yaml-schema-violation');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toMatch(/generated_at/);
    expect(findings[0].message).toMatch(/schema/);
  });

  it('fires an error when clones is not a list', async () => {
    const root = mkProject();
    plant(
      root,
      'generated_at: "2026-05-25T00:00:00Z"\nclones: not-a-list\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/clones/);
  });

  it('does not double-report when a refactor entry is incomplete', async () => {
    const root = mkProject();
    plant(
      root,
      [
        'generated_at: "2026-05-25T00:00:00Z"',
        'clones:',
        '  - id: abcdef0123ab',
        '    lines: 10',
        '    members:',
        '      - foo.ts:1:10',
        '      - bar.ts:1:10',
        '    disposition: refactor',
        '    reason: null',
        // Missing canonical_side/canonical_reason/tests/tests_proof —
        // the dedicated `clones-yaml-refactor-incomplete` rule covers
        // this case.
      ].join('\n') + '\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires on malformed top-level (root is not a mapping)', async () => {
    const root = mkProject();
    plant(root, '- just\n- a\n- list\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/root is not a mapping/);
  });
});
