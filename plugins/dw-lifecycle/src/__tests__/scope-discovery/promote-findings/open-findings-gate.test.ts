/**
 * Library tests for open-findings-gate.
 *
 * Per workplan Phase 13 Task 2 Step 4, the gate must:
 *   - return `{ allowed: true }` when zero open findings
 *   - return `{ allowed: false, openFindings: [...] }` when ≥1
 *   - surface every open finding (not just the first) so the CLI refusal
 *     message can name them all
 *
 * Real-fs fixtures via mkdtempSync mirror the sibling
 * `audit-log-walker.test.ts` shape.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkOpenFindings,
  FeatureRootNotFoundError,
} from '../../../scope-discovery/promote-findings/open-findings-gate.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'pf-gate-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string): string {
  const repoRoot = join(workDir, name);
  mkdirSync(repoRoot, { recursive: true });
  return repoRoot;
}

function makeFeatureDir(repoRoot: string, slug: string): string {
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  return featureDir;
}

function writeAuditLog(featureDir: string, contents: string): void {
  writeFileSync(join(featureDir, 'audit-log.md'), contents, 'utf8');
}

describe('checkOpenFindings — library gate', () => {
  it('allows when feature has zero open findings (all fixed/acknowledged)', async () => {
    const repoRoot = makeRepo('repo-no-open');
    const featureDir = makeFeatureDir(repoRoot, 'demo');
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '## 2026-05-29 Section',
        '',
        '### AUDIT-20260529-01 — Fixed thing',
        '',
        'Finding-ID: AUDIT-20260529-01',
        'Status:     fixed-deadbeef',
        'Severity:   medium',
        '',
        'Body.',
        '',
        '### AUDIT-20260529-02 — Acknowledged thing',
        '',
        'Finding-ID: AUDIT-20260529-02',
        'Status:     acknowledged-#42',
        'Severity:   low',
        '',
        'Body.',
      ].join('\n'),
    );

    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });

    expect(result.allowed).toBe(true);
  });

  it('allows when the feature has no audit-log on disk yet', async () => {
    const repoRoot = makeRepo('repo-no-auditlog');
    makeFeatureDir(repoRoot, 'demo');
    // intentionally NOT writing audit-log.md

    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });

    expect(result.allowed).toBe(true);
  });

  it('refuses with the single open finding when exactly one exists', async () => {
    const repoRoot = makeRepo('repo-one-open');
    const featureDir = makeFeatureDir(repoRoot, 'demo');
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-12 — Noise NOTE',
        '',
        'Finding-ID: AUDIT-20260529-12',
        'Status:     open',
        'Severity:   low',
        '',
        'Body.',
      ].join('\n'),
    );

    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable: allowed should be false');
    expect(result.openFindings).toHaveLength(1);
    expect(result.openFindings[0]?.findingId).toBe('AUDIT-20260529-12');
  });

  it('refuses with every open finding when multiple exist (no truncation)', async () => {
    const repoRoot = makeRepo('repo-multi-open');
    const featureDir = makeFeatureDir(repoRoot, 'demo');
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-12 — first open',
        '',
        'Finding-ID: AUDIT-20260529-12',
        'Status:     open',
        'Severity:   low',
        '',
        'Body.',
        '',
        '### AUDIT-20260529-13 — second open',
        '',
        'Finding-ID: AUDIT-20260529-13',
        'Status:     open',
        'Severity:   medium',
        '',
        'Body.',
        '',
        '### AUDIT-20260529-15 — fixed (should be ignored)',
        '',
        'Finding-ID: AUDIT-20260529-15',
        'Status:     fixed-37683c8',
        'Severity:   low',
        '',
        'Body.',
        '',
        '### AUDIT-20260529-14 — third open',
        '',
        'Finding-ID: AUDIT-20260529-14',
        'Status:     open',
        'Severity:   low',
        '',
        'Body.',
      ].join('\n'),
    );

    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable: allowed should be false');
    expect(result.openFindings).toHaveLength(3);
    const ids = result.openFindings.map((f) => f.findingId);
    expect(ids).toEqual([
      'AUDIT-20260529-12',
      'AUDIT-20260529-13',
      'AUDIT-20260529-14',
    ]);
  });

  it('throws FeatureRootNotFoundError when the feature directory is missing', async () => {
    const repoRoot = makeRepo('repo-missing-feature');
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    // intentionally NOT creating docs/1.0/001-IN-PROGRESS/demo

    await expect(
      checkOpenFindings({ featureSlug: 'demo', repoRoot }),
    ).rejects.toThrow(FeatureRootNotFoundError);
  });

  it('throws FeatureRootNotFoundError when docs/ itself is missing', async () => {
    const repoRoot = makeRepo('repo-no-docs');
    // intentionally NOT creating docs/

    await expect(
      checkOpenFindings({ featureSlug: 'demo', repoRoot }),
    ).rejects.toThrow(FeatureRootNotFoundError);
  });

  it('finds feature root under docs/0.x/ when 1.0 is absent', async () => {
    const repoRoot = makeRepo('repo-0x');
    const featureDir = join(repoRoot, 'docs', '0.x', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-99 — legacy version path',
        '',
        'Finding-ID: AUDIT-20260529-99',
        'Status:     open',
        'Severity:   low',
        '',
        'Body.',
      ].join('\n'),
    );

    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.openFindings).toHaveLength(1);
  });

  // Review-finding T3-1 (AUDIT-20260529-17): the gate's prior hardcoded
  // candidate list missed real version dirs like `docs/0.19.0/` /
  // `docs/0.16.0/`. The fix is a directory walk that mirrors the
  // orchestrator-turn assembler's `findFeatureDirectory`. These tests
  // exercise the walk against several version-dir shapes.
  it('finds feature root under docs/0.19.0/ (concrete non-1.0 version)', async () => {
    const repoRoot = makeRepo('repo-0-19-0');
    const featureDir = join(repoRoot, 'docs', '0.19.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-99 — concrete version dir',
        '',
        'Finding-ID: AUDIT-20260529-99',
        'Status:     open',
        '',
        'Body.',
      ].join('\n'),
    );
    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.openFindings).toHaveLength(1);
  });

  it('finds feature root under docs/0.16.0/ (another concrete version)', async () => {
    const repoRoot = makeRepo('repo-0-16-0');
    const featureDir = join(repoRoot, 'docs', '0.16.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-99 — another concrete version dir',
        '',
        'Finding-ID: AUDIT-20260529-99',
        'Status:     open',
        '',
        'Body.',
      ].join('\n'),
    );
    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.openFindings).toHaveLength(1);
  });

  it('finds feature root under an arbitrary version dir (forward-compat)', async () => {
    const repoRoot = makeRepo('repo-future-version');
    const featureDir = join(repoRoot, 'docs', '2.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-99 — arbitrary version',
        '',
        'Finding-ID: AUDIT-20260529-99',
        'Status:     open',
        '',
        'Body.',
      ].join('\n'),
    );
    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.openFindings).toHaveLength(1);
  });

  it('skips non-001-IN-PROGRESS subdirs and does not throw on docs/ with mixed content', async () => {
    const repoRoot = makeRepo('repo-mixed-docs');
    // README.md at docs/ root (file, not dir)
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    writeFileSync(join(repoRoot, 'docs', 'README.md'), 'overview', 'utf8');
    // Other version dirs with 003-COMPLETE/ (not 001-IN-PROGRESS).
    mkdirSync(join(repoRoot, 'docs', '0.5.0', '003-COMPLETE', 'legacy'), {
      recursive: true,
    });
    // The actual target.
    const featureDir = join(repoRoot, 'docs', '1.1', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeAuditLog(
      featureDir,
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-99 — mixed-docs case',
        '',
        'Finding-ID: AUDIT-20260529-99',
        'Status:     open',
        '',
        'Body.',
      ].join('\n'),
    );
    const result = await checkOpenFindings({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.openFindings).toHaveLength(1);
  });
});
