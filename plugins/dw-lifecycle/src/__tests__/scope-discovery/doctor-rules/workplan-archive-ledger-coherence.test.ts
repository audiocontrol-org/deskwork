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

  it('AUDIT-20260604-02 bug-repro: flags malformed archived-fix-tasks ranges (cross-phase, mismatched-dotted, non-numeric)', async () => {
    // The expandRange parser tolerates these shapes via singleton-pair
    // fallback (AUDIT-92) so archivePhases doesn't crash; the
    // companion claim is that workplan-archive-ledger-coherence is the
    // operator-facing surface notifying about them. Pre-fix this rule
    // does NOT inspect archived-fix-tasks at all — the claim is false.
    // Post-fix the rule walks each fix-task range and emits a warning
    // per non-well-formed shape.
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1',
        'archived-fix-tasks: 5.10-6.3, 5.1-5, 5.x-5.y',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 6.4',
        '-->',
      ].join('\n'),
    );
    writeFileSync(
      join(featureDir, 'workplan-archive.md'),
      '## Phase 1\n',
    );
    const findings = await check({ repoRoot });
    // Three malformed shapes → at least three findings (one per shape).
    const fixTaskFindings = findings.filter((f) =>
      f.message.toLowerCase().includes('archived-fix-tasks'),
    );
    expect(fixTaskFindings.length).toBeGreaterThanOrEqual(3);
    expect(fixTaskFindings.every((f) => f.severity === 'warning')).toBe(true);
    // Each shape names itself in the message so the operator can locate
    // the offending range without grepping.
    const messages = fixTaskFindings.map((f) => f.message).join('\n');
    expect(messages).toMatch(/cross-phase/i);
    expect(messages).toMatch(/mismatched-dotted/i);
    expect(messages).toMatch(/non-numeric/i);
  });

  it('AUDIT-20260604-02 regression-lock: well-formed archived-fix-tasks emits no malformed-range finding', async () => {
    // Pin the new check's selectivity: singletons + contiguous ranges
    // with matching dotted prefix + numeric endpoints are all well-
    // formed and must NOT trip the malformed-range warning. Without
    // this regression-lock the fix could over-trigger and surface
    // spurious findings on every well-formed ledger.
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-2',
        'archived-fix-tasks: 5.1-5.10, 5.12, 6.1-6.5',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 6.6',
        '-->',
      ].join('\n'),
    );
    writeFileSync(
      join(featureDir, 'workplan-archive.md'),
      '## Phase 1\n\n## Phase 2\n',
    );
    const findings = await check({ repoRoot });
    const fixTaskFindings = findings.filter((f) =>
      f.message.toLowerCase().includes('archived-fix-tasks'),
    );
    expect(fixTaskFindings).toEqual([]);
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
