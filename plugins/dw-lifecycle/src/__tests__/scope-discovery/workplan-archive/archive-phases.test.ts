import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  archivePhases,
  locatePhaseSection,
  countUncheckedTasks,
  validateVestigialReason,
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
