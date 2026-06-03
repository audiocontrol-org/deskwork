import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/workplan-archive-ledger-coherence.js';

describe('workplan-archive-ledger-coherence doctor rule', () => {
  let repoRoot: string;
  let featureDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'ledger-coherence-test-'));
    featureDir = join(repoRoot, 'docs/1.0/001-IN-PROGRESS/test-feature');
    mkdirSync(featureDir, { recursive: true });
  });

  it('returns no findings when there is no workplan', async () => {
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it('returns no findings when workplan exists but has no ledger annotation', async () => {
    writeFileSync(join(featureDir, 'workplan.md'), '# Workplan\n\n## Phase 1\n');
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it('returns no findings when ledger + archive content match', async () => {
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-2',
        'archived-fix-tasks: none',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 1.1',
        '-->',
        '',
        '## Phase 3',
      ].join('\n'),
    );
    writeFileSync(
      join(featureDir, 'workplan-archive.md'),
      [
        '# Archive',
        '',
        '## Phase 1: A',
        '',
        '## Phase 2: B',
      ].join('\n'),
    );
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it('flags missing-from-archive: ledger lists a phase the archive file does not contain', async () => {
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-3',
        'archived-fix-tasks: none',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 1.1',
        '-->',
        '## Phase 4',
      ].join('\n'),
    );
    writeFileSync(
      join(featureDir, 'workplan-archive.md'),
      '## Phase 1\n\n## Phase 2\n',
    );
    const findings = await check({ repoRoot });
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('phases 3');
    expect(findings[0]!.message).toMatch(/NOT present/i);
  });

  it('flags extra-in-archive: archive contains phases the ledger does not declare', async () => {
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1',
        'archived-fix-tasks: none',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 1.1',
        '-->',
      ].join('\n'),
    );
    writeFileSync(
      join(featureDir, 'workplan-archive.md'),
      '## Phase 1\n\n## Phase 2\n\n## Phase 3\n',
    );
    const findings = await check({ repoRoot });
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('2, 3');
    expect(findings[0]!.message).toMatch(/NOT declared/i);
  });

  it('flags missing archive file (ledger references nonexistent file)', async () => {
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1',
        'archived-fix-tasks: none',
        'archive-file: missing-archive.md',
        'next-fix-task-id: 1.1',
        '-->',
      ].join('\n'),
    );
    const findings = await check({ repoRoot });
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toMatch(/missing-archive\.md/);
    expect(findings[0]!.message).toMatch(/does not exist/);
  });

  it('AUDIT-91: malformed ledger emits a warning finding, does NOT throw', async () => {
    // Ledger annotation is structurally present but missing the required
    // `archive-file` field → `parseLedgerFromWorkplan` would throw
    // pre-fix; the doctor rule should catch and surface the parse error
    // as a finding instead of aborting the whole scan.
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-2',
        'archived-fix-tasks: none',
        'next-fix-task-id: 1.1',
        '-->',
        '## Phase 3',
      ].join('\n'),
    );
    // Pre-fix: this throws "ledger missing required field: archive-file".
    // Post-fix: this returns a finding without throwing.
    await expect(check({ repoRoot })).resolves.toBeDefined();
    const findings = await check({ repoRoot });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const parseFinding = findings.find((f) => f.message.toLowerCase().includes('parse'));
    expect(parseFinding, 'expected a finding mentioning the parse error').toBeDefined();
    expect(parseFinding!.severity).toBe('warning');
    expect(parseFinding!.message).toContain('test-feature');
    expect(parseFinding!.message.toLowerCase()).toContain('archive-file');
  });

  it('AUDIT-91 regression-lock: a malformed ledger in one feature does not block scanning of other features', async () => {
    // Set up TWO feature dirs: one with a malformed ledger, one with a
    // valid extra-in-archive ledger. The valid feature's finding must
    // still surface even though the malformed feature errored.
    const otherFeatureDir = join(repoRoot, 'docs/1.0/001-IN-PROGRESS/other-feature');
    mkdirSync(otherFeatureDir, { recursive: true });
    // Malformed: missing archive-file field
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1',
        'archived-fix-tasks: none',
        'next-fix-task-id: 1.1',
        '-->',
      ].join('\n'),
    );
    // Valid: extra-in-archive triggers a finding
    writeFileSync(
      join(otherFeatureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1',
        'archived-fix-tasks: none',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 1.1',
        '-->',
      ].join('\n'),
    );
    writeFileSync(
      join(otherFeatureDir, 'workplan-archive.md'),
      '## Phase 1\n\n## Phase 2\n',
    );
    const findings = await check({ repoRoot });
    // Must emit BOTH: the malformed-ledger warning AND the
    // extra-in-archive warning from the other feature.
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const malformedFinding = findings.find((f) => f.message.includes('test-feature'));
    const extraFinding = findings.find((f) => f.message.includes('other-feature'));
    expect(malformedFinding, 'malformed-ledger finding missing').toBeDefined();
    expect(extraFinding, 'other-feature finding suppressed by malformed sibling').toBeDefined();
  });

  it('all findings are severity: warning (non-blocking)', async () => {
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1',
        'archived-fix-tasks: none',
        'archive-file: missing.md',
        'next-fix-task-id: 1.1',
        '-->',
      ].join('\n'),
    );
    const findings = await check({ repoRoot });
    expect(findings.every((f) => f.severity === 'warning')).toBe(true);
  });
});
