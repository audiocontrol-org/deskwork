/**
 * Phase 15 Task 1 — workplan-aware implement-loop gate.
 *
 * Replaces Phase 13 Task 2's strict "refuse on any open finding" with
 * "allow when the next N unchecked tasks at positions [0..N-1] are
 * exactly the fix-finding tasks for the open finding IDs."
 *
 * Three refusal modes, each with an actionable cure path:
 *
 *   - `non-fix-task-before-fix-tasks` — a task at position <N is not
 *     tagged `(fix-finding-AUDIT-<id>)`. Cure: reorder workplan.
 *   - `coverage-mismatch` with `missingIds` — open findings that aren't
 *     scoped in positions [0..N-1]. Cure: run promote-findings.
 *   - `coverage-mismatch` with `extraIds` — scoped fix-tasks for
 *     finding IDs that aren't currently open. Cure: flip status or
 *     remove stale scoped tasks.
 *
 * Real-fs fixtures via mkdtempSync mirror the test patterns established
 * in the broader promote-findings test set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWorkplanAwareGate } from '../../../scope-discovery/promote-findings/workplan-aware-gate.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'wag-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, auditLog: string, workplan: string): string {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  writeFileSync(join(featureDir, 'workplan.md'), workplan, 'utf8');
  return repoRoot;
}

function openEntry(id: string, headingDescription: string): string {
  return [
    `### ${id} — ${headingDescription}`,
    '',
    `Finding-ID: ${id}`,
    `Status: open`,
    `Severity: low`,
    `Surface: src/${id}.ts`,
    '',
    'Body.',
    '',
  ].join('\n');
}

function unfinishedFixTask(id: string, idx = 1): string {
  return [
    `### Task ${idx}.1: Fix the thing (fix-finding-${id})`,
    '',
    '- [ ] Step 1: write failing test at `src/test.test.ts`',
    '- [ ] Step 2: implement',
    '',
    '**Acceptance Criteria:**',
    '',
    `- [ ] Closes ${id} in the commit subject.`,
    '',
  ].join('\n');
}

function unfinishedRegularTask(title: string, idx = 1): string {
  return [
    `### Task ${idx}.1: ${title}`,
    '',
    '- [ ] Step 1: do the thing',
    '',
    '**Acceptance Criteria:**',
    '',
    '- [ ] It works.',
    '',
  ].join('\n');
}

describe('checkWorkplanAwareGate — Phase 15 Task 1', () => {
  // (a) — zero open findings short-circuits.
  it('returns allowed=true when audit-log has zero open findings', async () => {
    const repoRoot = makeRepo(
      'no-open',
      '# Audit Log\n\n## Section\n\n### AUDIT-20260530-01 — fixed\n\nFinding-ID: AUDIT-20260530-01\nStatus: fixed-deadbeef\n\nBody.',
      '# Workplan\n\n## Phase 99\n\n' + unfinishedRegularTask('Unrelated work', 99),
    );
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('no-open-findings');
  });

  // (b) — 1 open + matching fix-task at position 0 → allowed.
  it('allows when single open finding is matched by the first unchecked fix-task', async () => {
    const repoRoot = makeRepo(
      'one-allowed',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01', 'A finding'),
      '# Workplan\n\n## Phase 99\n\n' + unfinishedFixTask('AUDIT-20260530-01', 99),
    );
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('open-findings-scoped-as-next');
  });

  // (c) — 1 open + non-fix task at position 0 → refused.
  it('refuses when the first unchecked task is a non-fix task (non-fix-task-before-fix-tasks)', async () => {
    const repoRoot = makeRepo(
      'non-fix-first',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01', 'A finding'),
      '# Workplan\n\n## Phase 99\n\n' +
        unfinishedRegularTask('Some other work', 99) +
        unfinishedFixTask('AUDIT-20260530-01', 100),
    );
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('non-fix-task-before-fix-tasks');
    if (result.reason !== 'non-fix-task-before-fix-tasks') throw new Error('unreachable');
    expect(result.offendingTask).toContain('Some other work');
    expect(result.openFindings).toHaveLength(1);
  });

  // (d) — 1 open + no fix-task anywhere → refused with missing.
  it('refuses with coverage-mismatch when no matching fix-task exists in workplan', async () => {
    const repoRoot = makeRepo(
      'no-coverage',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01', 'A finding'),
      '# Workplan\n\n## Phase 99\n\n' + unfinishedRegularTask('Unrelated', 99),
    );
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    // The first unchecked task isn't a fix-task → that's the first
    // failure mode the algorithm catches.
    expect(result.reason).toBe('non-fix-task-before-fix-tasks');
  });

  // (e) — 3 open + 3 matching fix-tasks in any order → allowed.
  it('allows when 3 open findings are covered by the next 3 unchecked fix-tasks in any order', async () => {
    const audit = ['AUDIT-20260530-01', 'AUDIT-20260530-02', 'AUDIT-20260530-03']
      .map((id) => openEntry(id, 'X'))
      .join('');
    const workplan =
      '# Workplan\n\n## Phase 99\n\n' +
      // intentionally scrambled order vs audit-log: 03, 01, 02
      unfinishedFixTask('AUDIT-20260530-03', 99) +
      unfinishedFixTask('AUDIT-20260530-01', 100) +
      unfinishedFixTask('AUDIT-20260530-02', 101);
    const repoRoot = makeRepo('three-allowed', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('open-findings-scoped-as-next');
  });

  // (f) — 3 open + 2 matching + 1 non-fix at position 2 → refused (non-fix-before).
  it('refuses when a non-fix task appears at position 2 with 3 open findings', async () => {
    const audit = ['AUDIT-20260530-01', 'AUDIT-20260530-02', 'AUDIT-20260530-03']
      .map((id) => openEntry(id, 'X'))
      .join('');
    const workplan =
      '# Workplan\n\n## Phase 99\n\n' +
      unfinishedFixTask('AUDIT-20260530-01', 99) +
      unfinishedFixTask('AUDIT-20260530-02', 100) +
      unfinishedRegularTask('Non-fix interleaved', 101) +
      unfinishedFixTask('AUDIT-20260530-03', 102);
    const repoRoot = makeRepo('non-fix-pos-2', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('non-fix-task-before-fix-tasks');
    if (result.reason !== 'non-fix-task-before-fix-tasks') throw new Error('unreachable');
    expect(result.offendingTask).toContain('Non-fix interleaved');
  });

  // (g) — 3 open + first 3 unchecked are fix-tagged but IDs mismatch → refused (coverage).
  it('refuses with coverage-mismatch when scoped fix-task IDs do not match open finding IDs', async () => {
    const audit = ['AUDIT-20260530-01', 'AUDIT-20260530-02', 'AUDIT-20260530-03']
      .map((id) => openEntry(id, 'X'))
      .join('');
    const workplan =
      '# Workplan\n\n## Phase 99\n\n' +
      // open = {01, 02, 03}; scoped = {01, 02, 99}; missing = {03}, extra = {99}
      unfinishedFixTask('AUDIT-20260530-01', 99) +
      unfinishedFixTask('AUDIT-20260530-02', 100) +
      unfinishedFixTask('AUDIT-20260530-99', 101);
    const repoRoot = makeRepo('mismatch', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('coverage-mismatch');
    if (result.reason !== 'coverage-mismatch') throw new Error('unreachable');
    expect(result.missingIds).toEqual(['AUDIT-20260530-03']);
    expect(result.extraIds).toEqual(['AUDIT-20260530-99']);
  });

  // (h) — refusal message content (open findings surfaced).
  it('refusal result carries every open finding so the CLI can render them', async () => {
    const audit = ['AUDIT-20260530-01', 'AUDIT-20260530-02']
      .map((id) => openEntry(id, 'X'))
      .join('');
    const workplan = '# Workplan\n\n## Phase 99\n\n' + unfinishedRegularTask('Unrelated', 99);
    const repoRoot = makeRepo('refusal-payload', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.openFindings).toHaveLength(2);
    expect(result.openFindings.map((f) => f.findingId).sort()).toEqual([
      'AUDIT-20260530-01',
      'AUDIT-20260530-02',
    ]);
  });

  // (i) — open finding ID has no `(fix-finding-...)` task ANYWHERE in workplan; first
  //       unchecked is unrelated fix-task → still refused, mode depends on coverage.
  it('refuses (coverage-mismatch) when scoped fix-tasks are correct count but wrong IDs', async () => {
    const audit = ['AUDIT-20260530-01'].map((id) => openEntry(id, 'X')).join('');
    const workplan =
      '# Workplan\n\n## Phase 99\n\n' + unfinishedFixTask('AUDIT-20260530-77', 99);
    const repoRoot = makeRepo('wrong-id', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('coverage-mismatch');
    if (result.reason !== 'coverage-mismatch') throw new Error('unreachable');
    expect(result.missingIds).toEqual(['AUDIT-20260530-01']);
    expect(result.extraIds).toEqual(['AUDIT-20260530-77']);
  });

  // (j) — workplan zero unchecked + N open → refused.
  it('refuses when N open findings exist but workplan has zero unchecked tasks', async () => {
    const audit = openEntry('AUDIT-20260530-01', 'finding');
    const workplan = '# Workplan\n\nAll tasks complete. Nothing unchecked.\n';
    const repoRoot = makeRepo('no-unchecked', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unreachable');
    expect(result.reason).toBe('coverage-mismatch');
    if (result.reason !== 'coverage-mismatch') throw new Error('unreachable');
    expect(result.missingIds).toEqual(['AUDIT-20260530-01']);
    expect(result.extraIds).toEqual([]);
  });

  // (k) — Feature root not found → throws (CLI maps to exit 2).
  it('throws FeatureRootNotFoundError when feature directory is missing', async () => {
    const repoRoot = join(workDir, 'no-feature');
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    await expect(
      checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot }),
    ).rejects.toThrow();
  });

  // (l) — finds feature root under arbitrary version dir (forward-compat with the
  //       Phase 14 review fix for the old gate).
  it('finds feature root under a non-1.0 version dir', async () => {
    const repoRoot = join(workDir, 'version-021');
    const featureDir = join(repoRoot, 'docs', '0.21.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'audit-log.md'),
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01', 'X'),
      'utf8',
    );
    writeFileSync(
      join(featureDir, 'workplan.md'),
      '# Workplan\n\n## Phase 99\n\n' + unfinishedFixTask('AUDIT-20260530-01', 99),
      'utf8',
    );
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(true);
  });

  // (m) — open finding has a matching scoped fix-task but at a LATER position
  //       (other fix-tasks for other open findings come first). Strict ordering
  //       checks coverage of positions [0..N-1] only.
  it('allows when scoped fix-tasks at positions [0..N-1] cover open findings regardless of audit-log order', async () => {
    const audit = ['AUDIT-20260530-02', 'AUDIT-20260530-01']
      .map((id) => openEntry(id, 'X'))
      .join('');
    const workplan =
      '# Workplan\n\n## Phase 99\n\n' +
      unfinishedFixTask('AUDIT-20260530-01', 99) +
      unfinishedFixTask('AUDIT-20260530-02', 100);
    const repoRoot = makeRepo('order-invariance', '# Audit Log\n\n' + audit, workplan);
    const result = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    expect(result.allowed).toBe(true);
  });
});
