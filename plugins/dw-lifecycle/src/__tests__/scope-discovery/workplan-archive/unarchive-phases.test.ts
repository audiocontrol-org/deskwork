import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { archivePhases } from '../../../scope-discovery/workplan-archive/archive-phases.js';
import {
  unarchivePhases,
  findInsertionLine,
  UnarchivePhasesError,
} from '../../../scope-discovery/workplan-archive/unarchive-phases.js';

describe('findInsertionLine — pure-fn', () => {
  it('returns EOF when no later phase exists', () => {
    const lines = ['# Workplan', '## Phase 1: A', 'content'];
    expect(findInsertionLine(lines, 2)).toBe(lines.length);
  });

  it('returns the position of the first phase with number > target', () => {
    const lines = ['# Workplan', '## Phase 1: A', '## Phase 5: E', '## Phase 7: G'];
    expect(findInsertionLine(lines, 3)).toBe(2); // before Phase 5
    expect(findInsertionLine(lines, 6)).toBe(3); // before Phase 7
  });

  it('returns 0 when target precedes the first phase', () => {
    const lines = ['## Phase 5: E'];
    expect(findInsertionLine(lines, 2)).toBe(0);
  });
});

describe('unarchivePhases — orchestrator', () => {
  let repoRoot: string;
  let featureDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'unarchive-phases-test-'));
    featureDir = join(repoRoot, 'docs/1.0/001-IN-PROGRESS/test-feature');
    mkdirSync(featureDir, { recursive: true });
  });

  function writeWorkplan(content: string): void {
    writeFileSync(join(featureDir, 'workplan.md'), content);
  }

  async function setupArchivedState(): Promise<void> {
    writeWorkplan(
      [
        '# Workplan',
        '',
        '## Phase 1: A',
        '- [x] done',
        '',
        '## Phase 2: B',
        '- [x] done',
        '',
        '## Phase 3: C',
        '- [x] done',
        '',
      ].join('\n'),
    );
    await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1, 2],
      apply: true,
    });
  }

  it('dry-run reports what would be restored without writing', async () => {
    await setupArchivedState();
    const workplanBefore = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    const archiveBefore = readFileSync(join(featureDir, 'workplan-archive.md'), 'utf8');
    const report = await unarchivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1],
      apply: false,
    });
    expect(report.apply).toBe(false);
    expect(report.actions[0]?.action).toBe('restored');
    // Files unchanged
    expect(readFileSync(join(featureDir, 'workplan.md'), 'utf8')).toBe(workplanBefore);
    expect(readFileSync(join(featureDir, 'workplan-archive.md'), 'utf8')).toBe(archiveBefore);
  });

  it('apply restores Phase 1 to the workplan + removes it from the archive', async () => {
    await setupArchivedState();
    const report = await unarchivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1],
      apply: true,
    });
    expect(report.apply).toBe(true);
    expect(report.actions[0]?.action).toBe('restored');
    const workplanAfter = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    expect(workplanAfter).toContain('## Phase 1: A');
    expect(workplanAfter).toContain('## Phase 3: C');
    // The ledger should now only have Phase 2 archived
    expect(workplanAfter).toContain('archived-phases: 2');
    expect(workplanAfter).not.toContain('archived-phases: 1-2');
    const archiveAfter = readFileSync(join(featureDir, 'workplan-archive.md'), 'utf8');
    expect(archiveAfter).not.toContain('## Phase 1: A');
    expect(archiveAfter).toContain('## Phase 2: B');
  });

  it('archive → unarchive round-trip preserves workplan structure', async () => {
    const original = [
      '# Workplan',
      '',
      '## Phase 1: A',
      '- [x] alpha',
      '',
      '## Phase 2: B',
      '- [x] beta',
      '',
      '## Phase 3: C',
      '- [x] gamma',
      '',
    ].join('\n');
    writeWorkplan(original);
    await archivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1, 2],
      apply: true,
    });
    await unarchivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [1, 2],
      apply: true,
    });
    const final = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    // All three phases present + in numeric order
    const phase1Idx = final.indexOf('## Phase 1: A');
    const phase2Idx = final.indexOf('## Phase 2: B');
    const phase3Idx = final.indexOf('## Phase 3: C');
    expect(phase1Idx).toBeGreaterThanOrEqual(0);
    expect(phase2Idx).toBeGreaterThan(phase1Idx);
    expect(phase3Idx).toBeGreaterThan(phase2Idx);
    // Original content preserved per-phase
    expect(final).toContain('- [x] alpha');
    expect(final).toContain('- [x] beta');
    expect(final).toContain('- [x] gamma');
    // Ledger now empty
    expect(final).toContain('archived-phases: none');
  });

  it('inserts at correct numeric position even when other phases are present', async () => {
    await setupArchivedState();
    // workplan now: Phase 3 only + ledger
    await unarchivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [2],
      apply: true,
    });
    const workplanAfter = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    const phase2Idx = workplanAfter.indexOf('## Phase 2: B');
    const phase3Idx = workplanAfter.indexOf('## Phase 3: C');
    expect(phase2Idx).toBeGreaterThan(0);
    expect(phase2Idx).toBeLessThan(phase3Idx);
  });

  it('reports not-found-in-archive for phases that arent there', async () => {
    await setupArchivedState();
    const report = await unarchivePhases({
      repoRoot,
      featureSlug: 'test-feature',
      phases: [99],
      apply: true,
    });
    expect(report.actions[0]?.action).toBe('not-found-in-archive');
  });

  it('throws on missing archive file', async () => {
    writeWorkplan('# Workplan\n## Phase 1\n');
    await expect(
      unarchivePhases({
        repoRoot,
        featureSlug: 'test-feature',
        phases: [1],
        apply: true,
      }),
    ).rejects.toThrow(UnarchivePhasesError);
  });
});
