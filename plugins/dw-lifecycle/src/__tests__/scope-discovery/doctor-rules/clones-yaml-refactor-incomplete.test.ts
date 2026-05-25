/**
 * Tests for the `clones-yaml-refactor-incomplete` doctor rule.
 * Exercises each of the 7 Step 0a / Step 0b precondition branches.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/clones-yaml-refactor-incomplete.js';

const tmpRoots: string[] = [];

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-refactor-incomplete-'));
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

function refactorEntryYaml(overrides: Record<string, string>): string {
  const baseFields: Record<string, string> = {
    id: 'abc123def456',
    lines: '10',
    members: '\n      - foo.ts:1:10\n      - bar.ts:1:10',
    disposition: 'refactor',
    reason: 'null',
    canonical_side: '"foo.ts"',
    canonical_reason: '"foo.ts has the new regime"',
    tests: '\n      - "vitest run foo.test.ts"',
    tests_proof_sha: '"abc1234"',
    tests_proof_demonstration: '"failing commit X fixed at abc1234"',
  };
  const merged = { ...baseFields, ...overrides };
  return [
    'generated_at: "2026-05-25T00:00:00Z"',
    'clones:',
    `  - id: ${merged['id']}`,
    `    lines: ${merged['lines']}`,
    `    members: ${merged['members']}`,
    `    disposition: ${merged['disposition']}`,
    `    reason: ${merged['reason']}`,
    ...(merged['canonical_side'] !== ''
      ? [`    canonical_side: ${merged['canonical_side']}`]
      : []),
    ...(merged['canonical_reason'] !== ''
      ? [`    canonical_reason: ${merged['canonical_reason']}`]
      : []),
    ...(merged['new_shape_summary'] !== undefined
      ? [`    new_shape_summary: ${merged['new_shape_summary']}`]
      : []),
    ...(merged['tests'] !== ''
      ? [`    tests: ${merged['tests']}`]
      : []),
    ...(merged['tests_proof_sha'] !== '' ||
    merged['tests_proof_demonstration'] !== ''
      ? [
          '    tests_proof:',
          ...(merged['tests_proof_sha'] !== ''
            ? [`      sha: ${merged['tests_proof_sha']}`]
            : []),
          ...(merged['tests_proof_demonstration'] !== ''
            ? [`      demonstration: ${merged['tests_proof_demonstration']}`]
            : []),
        ]
      : []),
  ].join('\n') + '\n';
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

describe('clones-yaml-refactor-incomplete doctor rule', () => {
  it('passes silently when clones.yaml is absent', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes on an empty clones list', async () => {
    const root = mkProject();
    plant(root, 'generated_at: "2026-05-25T00:00:00Z"\nclones: []\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes on a non-refactor entry (incomplete fields irrelevant)', async () => {
    const root = mkProject();
    plant(
      root,
      [
        'generated_at: "2026-05-25T00:00:00Z"',
        'clones:',
        '  - id: aaaaaaaaaaaa',
        '    lines: 10',
        '    members:',
        '      - foo.ts:1:10',
        '      - bar.ts:1:10',
        '    disposition: pending',
        '    reason: null',
      ].join('\n') + '\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes on a complete refactor entry', async () => {
    const root = mkProject();
    plant(root, refactorEntryYaml({}));
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires on missing canonical_side (Step 0a branch 1)', async () => {
    const root = mkProject();
    plant(root, refactorEntryYaml({ canonical_side: '' }));
    const findings = await check({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.message.includes('canonical_side'))).toBe(true);
    expect(findings.some((f) => f.message.includes('file-path'))).toBe(true);
  });

  it('fires on missing canonical_reason (Step 0a branch 2)', async () => {
    const root = mkProject();
    plant(root, refactorEntryYaml({ canonical_reason: '' }));
    const findings = await check({ repoRoot: root });
    expect(findings.some((f) => f.message.includes('canonical_reason'))).toBe(true);
  });

  it('fires when canonical_side="new" but new_shape_summary missing (Step 0a branch 3)', async () => {
    const root = mkProject();
    plant(root, refactorEntryYaml({ canonical_side: '"new"' }));
    const findings = await check({ repoRoot: root });
    expect(findings.some((f) => f.message.includes('new_shape_summary'))).toBe(true);
  });

  it('fires when new_shape_summary present but empty on non-"new" side (Step 0a branch 4)', async () => {
    const root = mkProject();
    plant(root, refactorEntryYaml({ new_shape_summary: '""' }));
    const findings = await check({ repoRoot: root });
    expect(findings.some((f) => f.message.includes('new_shape_summary'))).toBe(true);
  });

  it('fires on missing tests (Step 0b branch 5)', async () => {
    const root = mkProject();
    plant(root, refactorEntryYaml({ tests: '[]' }));
    const findings = await check({ repoRoot: root });
    expect(findings.some((f) => f.message.includes('tests'))).toBe(true);
  });

  it('fires on missing tests_proof (Step 0b branch 6)', async () => {
    const root = mkProject();
    plant(
      root,
      refactorEntryYaml({ tests_proof_sha: '', tests_proof_demonstration: '' }),
    );
    const findings = await check({ repoRoot: root });
    expect(findings.some((f) => f.message.includes('tests_proof'))).toBe(true);
  });

  it('fires on malformed tests_proof.sha (Step 0b branch 7)', async () => {
    const root = mkProject();
    plant(
      root,
      refactorEntryYaml({ tests_proof_sha: '"NOT-A-SHA"' }),
    );
    const findings = await check({ repoRoot: root });
    expect(findings.some((f) => f.message.includes('tests_proof.sha'))).toBe(true);
  });

  it('returns finding-per-error when multiple preconditions fail', async () => {
    const root = mkProject();
    plant(
      root,
      refactorEntryYaml({
        canonical_side: '',
        canonical_reason: '',
        tests: '[]',
      }),
    );
    const findings = await check({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.every((f) => f.rule === 'clones-yaml-refactor-incomplete')).toBe(true);
  });
});
