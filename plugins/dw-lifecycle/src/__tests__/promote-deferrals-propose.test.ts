import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  propose,
  ProposalOutputExistsError,
} from '../promote-deferrals/propose.js';

function workplanFixture(): string {
  return `# Workplan

## Phase 1: Setup

### Task 1: Bootstrap

- [ ] regular task
- [ ] TBD: figure out database schema for nested groups
- [ ] another regular task

### Task 2: Implementation

- [ ] defer to next milestone — auth needs a redesign
- [ ] regular task

## Phase 2: Polish

### Task 1: UI

- [ ] follow-up: design review with the operator
- [ ] regular task

- [ ] out of scope for v1 — analytics integration
`;
}

describe('propose', () => {
  let projectRoot: string;
  let workplanPath: string;
  let now: Date;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'promote-propose-'));
    workplanPath = join(projectRoot, 'workplan.md');
    writeFileSync(workplanPath, workplanFixture(), 'utf8');
    now = new Date('2026-05-28T18:30:00.000Z');
  });

  it('scans the workplan and emits one item per TBD marker', () => {
    const result = propose({
      workplanPath,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    expect(result.itemCount).toBe(4);
    const markers = result.proposalFile.items.map((i) => i.markerKey);
    expect(markers).toEqual(['tbd', 'defer', 'follow_up', 'out_of_scope']);
  });

  it('records line numbers, marker keys, and text excerpts', () => {
    const result = propose({
      workplanPath,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    const first = result.proposalFile.items[0];
    expect(first?.lineNumber).toBe(8);
    expect(first?.markerKey).toBe('tbd');
    expect(first?.text).toMatch(/TBD: figure out database schema/);
  });

  it('extracts containingTask + parentPhase from surrounding headings', () => {
    const result = propose({
      workplanPath,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    const items = result.proposalFile.items;
    // TBD line is under Phase 1 / Task 1
    expect(items[0]?.parentPhase).toMatch(/Phase 1: Setup/);
    expect(items[0]?.containingTask).toMatch(/Task 1: Bootstrap/);
    // defer line is under Phase 1 / Task 2
    expect(items[1]?.parentPhase).toMatch(/Phase 1: Setup/);
    expect(items[1]?.containingTask).toMatch(/Task 2: Implementation/);
    // follow-up is under Phase 2 / Task 1
    expect(items[2]?.parentPhase).toMatch(/Phase 2: Polish/);
    expect(items[2]?.containingTask).toMatch(/Task 1: UI/);
  });

  it('records null containingTask when the marker is outside any task heading', () => {
    const workplanNoTask = `# Plan

## Phase 1: Standalone

- [ ] TBD: orphan marker before any task heading
`;
    const path = join(projectRoot, 'orphan.md');
    writeFileSync(path, workplanNoTask, 'utf8');
    const result = propose({
      workplanPath: path,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    expect(result.proposalFile.items[0]?.containingTask).toBeNull();
    expect(result.proposalFile.items[0]?.parentPhase).toMatch(/Phase 1: Standalone/);
  });

  it('does NOT claim a task heading from a prior phase', () => {
    const workplanCross = `# Plan

## Phase 1: Setup

### Task 1: Bootstrap

- [ ] regular task

## Phase 2: Polish

- [ ] TBD: phase-2 marker should not get Phase 1 / Task 1 as its container
`;
    const path = join(projectRoot, 'cross.md');
    writeFileSync(path, workplanCross, 'utf8');
    const result = propose({
      workplanPath: path,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    const first = result.proposalFile.items[0];
    expect(first?.parentPhase).toMatch(/Phase 2: Polish/);
    expect(first?.containingTask).toBeNull();
  });

  it('writes the proposal file to disk in JSON form', () => {
    const result = propose({
      workplanPath,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    expect(existsSync(result.outputPath)).toBe(true);
    const written = readFileSync(result.outputPath, 'utf8');
    const parsed = JSON.parse(written);
    expect(parsed.workplan_path).toBe(workplanPath);
    expect(parsed.repo).toBe('owner/repo');
    expect(parsed.approval).toBeNull();
    expect(parsed.items).toHaveLength(4);
  });

  it('refuses to overwrite an existing output file without --force', () => {
    const out = join(projectRoot, 'proposal.json');
    writeFileSync(out, '{}', 'utf8');
    expect(() =>
      propose({
        workplanPath,
        repo: 'owner/repo',
        projectRoot,
        now,
        outputPath: out,
      }),
    ).toThrow(ProposalOutputExistsError);
  });

  it('overwrites an existing output file when force is true', () => {
    const out = join(projectRoot, 'proposal.json');
    writeFileSync(out, '{}', 'utf8');
    const result = propose({
      workplanPath,
      repo: 'owner/repo',
      projectRoot,
      now,
      outputPath: out,
      force: true,
    });
    expect(result.outputPath).toBe(out);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.items).toHaveLength(4);
  });

  it('emits a markdown table with FILL IN columns', () => {
    const result = propose({
      workplanPath,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    expect(result.markdownTable).toContain('Proposed disposition');
    expect(result.markdownTable).toContain('Disposition fields');
    expect(result.markdownTable).toContain('FILL IN');
    expect(result.markdownTable).toContain('(fill in)');
  });

  it('emits an empty (header-only) table for a workplan with no markers', () => {
    const clean = `# Plan

## Phase 1

- [ ] regular task
`;
    const path = join(projectRoot, 'clean.md');
    writeFileSync(path, clean, 'utf8');
    const result = propose({
      workplanPath: path,
      repo: 'owner/repo',
      projectRoot,
      now,
    });
    expect(result.itemCount).toBe(0);
    expect(result.markdownTable).toMatch(/^\| #/);
  });
});
