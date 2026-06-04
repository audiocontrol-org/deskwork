import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  archivePhases,
  enumerateAllPhases,
  locatePhaseSection,
  countUncheckedTasks,
  validateVestigialReason,
  scanFixTaskIds,
  ArchivePhasesError,
} from '../../../scope-discovery/workplan-archive/archive-phases.js';

describe('locatePhaseSection — pure-fn', () => {
  it('locates a Phase N: heading + its end at the next Phase heading', () => {
    const lines = [
      '# Workplan',
      '## Phase 1: First',
      'content of 1',
      '## Phase 2: Second',
      'content of 2',
      '## Phase 3: Third',
    ];
    const located = locatePhaseSection(lines, 2);
    expect(located).toEqual({ start: 3, end: 5 });
  });

  it('locates the last phase (end = EOF)', () => {
    const lines = [
      '# Workplan',
      '## Phase 1: First',
      'content',
      '## Phase 5: Fifth',
      'final content',
    ];
    expect(locatePhaseSection(lines, 5)).toEqual({ start: 3, end: 5 });
  });

  it('returns null when the phase is absent', () => {
    const lines = ['# Workplan', '## Phase 1: A', '## Phase 3: C'];
    expect(locatePhaseSection(lines, 2)).toBeNull();
  });
});

describe('enumerateAllPhases — pure-fn (Phase 26 Task 6 Step 2)', () => {
  it('returns the sorted-unique list of `## Phase N:` headings in the body', () => {
    const body = [
      '# Workplan',
      '## Phase 1: First',
      'content',
      '## Phase 3: Third (Phase 2 archived earlier)',
      'more',
      '## Phase 5: Fifth',
    ].join('\n');
    expect(enumerateAllPhases(body)).toEqual([1, 3, 5]);
  });

  it('deduplicates accidental duplicate headings', () => {
    const body = [
      '## Phase 1: First',
      '## Phase 2: Second',
      '## Phase 1: First (accidental duplicate)',
    ].join('\n');
    expect(enumerateAllPhases(body)).toEqual([1, 2]);
  });

  it('returns [] for a workplan with no Phase headings', () => {
    const body = ['# Workplan', '## Other section', 'no phases here'].join('\n');
    expect(enumerateAllPhases(body)).toEqual([]);
  });

  it('matches the same heading shape as locatePhaseSection (no drift)', () => {
    // Headings that locatePhaseSection accepts: `^## Phase N:`,
    // `^## Phase N$`, `^## Phase N\s+...`. enumerateAllPhases must
    // match the same set so a phase listed here can be located.
    const body = [
      '## Phase 1: with colon',
      '## Phase 2 trailing space',
      '## Phase 3',
      '## Phase X (not numeric — skipped)',
      '##Phase 4 (no space after ## — skipped)',
    ].join('\n');
    expect(enumerateAllPhases(body)).toEqual([1, 2, 3]);
  });
});

describe('countUncheckedTasks — pure-fn', () => {
  it('counts `- [ ]` lines', () => {
    const lines = [
      '## Phase 1',
      '- [x] done',
      '- [ ] pending',
      '- [ ] also pending',
    ];
    expect(countUncheckedTasks(lines)).toBe(2);
  });

  it('returns 0 for fully-checked sections', () => {
    expect(countUncheckedTasks(['- [x] a', '- [x] b'])).toBe(0);
  });
});

describe('validateVestigialReason', () => {
  it('accepts a substantive reason (≥40 chars)', () => {
    expect(() =>
      validateVestigialReason('Phase 17 retired under Phase 24 no-git-hook contract — vestigial.'),
    ).not.toThrow();
  });

  it('rejects short reasons', () => {
    expect(() => validateVestigialReason('too short')).toThrow(/40 chars/);
  });

  it('rejects placeholders', () => {
    expect(() =>
      validateVestigialReason('TBD; will figure this out later, plenty of words here so ≥40 chars'),
    ).toThrow(/placeholder/);
  });
});

describe('scanFixTaskIds — shared-namespace contract (AUDIT-94)', () => {
  it('captures both impl tasks and fix-finding tasks (shared per-phase integer namespace)', () => {
    const sectionLines = [
      '## Phase 5: Mixed phase',
      '### Task 1: Setup something',
      '- [x] step',
      '### Task 2: Implement feature',
      '- [x] step',
      '### Task 19 (fix-finding-AUDIT-20260603-77): bug-fix block',
      '- [x] step',
      '### Task 22 (fix-finding-AUDIT-20260603-86) (non-bug): disposition block',
      '- [x] step',
    ];
    const ids = scanFixTaskIds(sectionLines, 5);
    // Per the documented contract: BOTH impl tasks and fix-finding tasks
    // are captured because the auto-positioner numbers them in a shared
    // integer namespace.
    expect(ids).toContain('5.1');  // impl task
    expect(ids).toContain('5.2');  // impl task
    expect(ids).toContain('5.19'); // fix-finding task
    expect(ids).toContain('5.22'); // non-bug disposition fix-task
    expect(ids).toHaveLength(4);
  });

  it('ignores non-Task headings (### Task headings only)', () => {
    const sectionLines = [
      '## Phase 5',
      '### Subsection: not a task',
      '### Task A: non-integer task number',
      '#### Task 99: wrong heading depth',
      '- [x] not a heading',
    ];
    const ids = scanFixTaskIds(sectionLines, 5);
    expect(ids).toEqual([]);
  });
});

describe('archivePhases — orchestrator', () => {
  let repoRoot: string;
  let featureDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'archive-phases-test-'));
    featureDir = join(repoRoot, 'docs/1.0/001-IN-PROGRESS/test-feature');
    mkdirSync(featureDir, { recursive: true });
  });

  function writeWorkplan(content: string): void {
    writeFileSync(join(featureDir, 'workplan.md'), content);
  }

  it('dry-run reports archived without writing', async () => {
    writeWorkplan(
      [
        '# Workplan',
        '## Phase 1: A',
        '- [x] done',
        '## Phase 2: B',
        '- [x] also done',
      ].join('\n'),
    );
    const before = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    const report = await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1],
      apply: false,
    });
    expect(report.apply).toBe(false);
    expect(report.actions[0]?.action).toBe('archived');
    expect(readFileSync(join(featureDir, 'workplan.md'), 'utf8')).toBe(before);
    expect(existsSync(join(featureDir, 'workplan-archive.md'))).toBe(false);
  });

  it('apply moves the section to the archive + updates ledger', async () => {
    writeWorkplan(
      [
        '# Workplan',
        '',
        '## Phase 1: A',
        '- [x] done',
        '',
        '## Phase 2: B',
        '- [x] also done',
        '',
      ].join('\n'),
    );
    const report = await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1],
      apply: true,
    });
    expect(report.apply).toBe(true);
    const workplanAfter = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    expect(workplanAfter).not.toContain('## Phase 1: A');
    expect(workplanAfter).toContain('## Phase 2: B');
    expect(workplanAfter).toContain('<!-- workplan-archive-ledger');
    expect(workplanAfter).toContain('archived-phases: 1');
    const archiveAfter = readFileSync(join(featureDir, 'workplan-archive.md'), 'utf8');
    expect(archiveAfter).toContain('## Phase 1: A');
    expect(archiveAfter).toContain('- [x] done');
  });

  it('refuses incomplete phase without --allow-vestigial (AUDIT-37)', async () => {
    writeWorkplan(
      [
        '# Workplan',
        '## Phase 1: A',
        '- [x] done',
        '- [ ] still pending',
      ].join('\n'),
    );
    const report = await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1],
      apply: true,
    });
    expect(report.actions[0]?.action).toBe('refused-incomplete');
    expect(report.actions[0]?.uncheckedTaskCount).toBe(1);
    // File unchanged
    expect(readFileSync(join(featureDir, 'workplan.md'), 'utf8')).toContain('## Phase 1: A');
    expect(existsSync(join(featureDir, 'workplan-archive.md'))).toBe(false);
  });

  it('--allow-vestigial archives an incomplete phase (AUDIT-37 escape hatch)', async () => {
    writeWorkplan(
      [
        '# Workplan',
        '## Phase 17: Retired',
        '- [ ] never going to happen',
      ].join('\n'),
    );
    const reason =
      'Phase 17 vestigial under Phase 24 no-git-hook-enforcement contract; unchecked steps describe retired machinery.';
    const report = await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [17],
      apply: true,
      allowVestigialReason: reason,
    });
    expect(report.actions[0]?.action).toBe('allowed-vestigial');
    expect(report.actions[0]?.reason).toBe(reason);
    expect(readFileSync(join(featureDir, 'workplan.md'), 'utf8')).not.toContain('## Phase 17');
    expect(readFileSync(join(featureDir, 'workplan-archive.md'), 'utf8')).toContain('## Phase 17');
  });

  it('rejects --allow-vestigial reason that fails substantive-reason check', async () => {
    writeWorkplan('# Workplan\n## Phase 1\n- [ ] pending\n');
    await expect(
      archivePhases({
        repoRoot,
        featureSlug: 'test-feature',
        phases: [1],
        apply: true,
        allowVestigialReason: 'short',
      }),
    ).rejects.toThrow(/40 chars/);
  });

  it('reports `not-found` for nonexistent phase numbers', async () => {
    writeWorkplan('# Workplan\n## Phase 1\n- [x] done\n');
    const report = await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [99],
      apply: true,
    });
    expect(report.actions[0]?.action).toBe('not-found');
  });

  it('preserves an existing ledger when merging new ranges', async () => {
    writeWorkplan(
      [
        '# Workplan',
        '',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-3',
        'archived-fix-tasks: 5.1-5.10',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 5.11',
        '-->',
        '',
        '## Phase 4: D',
        '- [x] done',
        '## Phase 5: E',
        '- [x] done',
      ].join('\n'),
    );
    await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [4],
      apply: true,
    });
    const after = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    expect(after).toContain('archived-phases: 1-4');
    expect(after).toContain('archived-fix-tasks: 5.1-5.10');
    expect(after).toContain('next-fix-task-id: 5.11');
    expect(after).not.toContain('## Phase 4: D');
    expect(after).toContain('## Phase 5: E');
  });

  it('AUDIT-89: archives fix-task headings into archivedFixTasks + advances nextFixTaskId', async () => {
    // Phase 5 carries fix-tasks `### Task 11`, `### Task 12`, `### Task 13`.
    // Pre-fix: archivePhases only preserves prior ledger values (5.1-5.10 / 5.11),
    // dropping the moved fix-tasks on the floor.
    // Post-fix: archivedFixTasks compacts to 5.1-5.13; nextFixTaskId advances to 5.14.
    writeWorkplan(
      [
        '# Workplan',
        '',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-4',
        'archived-fix-tasks: 5.1-5.10',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 5.11',
        '-->',
        '',
        '## Phase 5: E',
        '### Task 11: a fix-task heading',
        '- [x] step done',
        '### Task 12: another fix-task',
        '- [x] step done',
        '### Task 13: third fix-task',
        '- [x] step done',
        '## Phase 6: F',
        '- [x] phase-6 work',
      ].join('\n'),
    );
    await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [5],
      apply: true,
    });
    const after = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    expect(after).toContain('archived-phases: 1-5');
    expect(after).toContain('archived-fix-tasks: 5.1-5.13');
    expect(after).toContain('next-fix-task-id: 5.14');
    expect(after).not.toContain('## Phase 5: E');
    expect(after).not.toContain('### Task 11: a fix-task heading');
    // Archive carries the moved fix-tasks
    const archive = readFileSync(join(featureDir, 'workplan-archive.md'), 'utf8');
    expect(archive).toContain('### Task 11: a fix-task heading');
    expect(archive).toContain('### Task 12: another fix-task');
    expect(archive).toContain('### Task 13: third fix-task');
  });

  it('AUDIT-89 regression-lock: archiving a fix-task-free phase preserves prior ledger fix-task fields unchanged', async () => {
    // The existing working-code behavior — archiving a content-free phase
    // passes through `archived-fix-tasks: 5.1-5.10` and `next-fix-task-id: 5.11`
    // verbatim — must survive the fix. This is the existing
    // "preserves an existing ledger when merging new ranges" test's invariant
    // restated as the Option D regression-lock for AUDIT-89's fix.
    writeWorkplan(
      [
        '# Workplan',
        '',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-3',
        'archived-fix-tasks: 5.1-5.10',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 5.11',
        '-->',
        '',
        '## Phase 4: D',
        '- [x] done',
        '## Phase 5: E',
        '- [x] done',
      ].join('\n'),
    );
    await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [4],
      apply: true,
    });
    const after = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    // The fix-task fields are UNCHANGED — Phase 4 had no `### Task N` headings,
    // so the scan adds nothing to archivedFixTasks and the existing
    // nextFixTaskId floor is preserved.
    expect(after).toContain('archived-fix-tasks: 5.1-5.10');
    expect(after).toContain('next-fix-task-id: 5.11');
  });

  it('AUDIT-89: cross-phase merge — archiving Phase 11 with fix-tasks Task 1-3 yields disjoint range + max-based next-id', async () => {
    // Archived 5.1-5.10 already; Phase 11 carries fix-tasks 1, 2, 3.
    // Expected: archivedFixTasks = "5.1-5.10, 11.1-11.3";
    // nextFixTaskId = "11.4" (max-of-union via compareIds, +1 on last component).
    writeWorkplan(
      [
        '# Workplan',
        '',
        '<!-- workplan-archive-ledger',
        'archived-phases: 1-10',
        'archived-fix-tasks: 5.1-5.10',
        'archive-file: workplan-archive.md',
        'next-fix-task-id: 5.11',
        '-->',
        '',
        '## Phase 11: K',
        '### Task 1: first fix-task in phase 11',
        '- [x] done',
        '### Task 2: second',
        '- [x] done',
        '### Task 3: third',
        '- [x] done',
        '## Phase 12: L',
        '- [x] later phase',
      ].join('\n'),
    );
    await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [11],
      apply: true,
    });
    const after = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    expect(after).toContain('archived-phases: 1-11');
    expect(after).toContain('archived-fix-tasks: 5.1-5.10, 11.1-11.3');
    expect(after).toContain('next-fix-task-id: 11.4');
  });

  it('throws on missing workplan', async () => {
    // featureDir exists but no workplan.md
    await expect(
      archivePhases({
        repoRoot,
        featureSlug: 'test-feature',
        phases: [1],
        apply: false,
      }),
    ).rejects.toThrow(ArchivePhasesError);
  });

  it('throws on unknown slug', async () => {
    await expect(
      archivePhases({
        repoRoot,
        featureSlug: 'nonexistent',
        phases: [1],
        apply: false,
      }),
    ).rejects.toThrow(/feature dir not found/);
  });
});
