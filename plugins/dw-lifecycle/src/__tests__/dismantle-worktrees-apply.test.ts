import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, ApplyValidationError } from '../dismantle-worktrees/apply.js';
import type { ProposalFile } from '../dismantle-worktrees/types.js';

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), 'dwt-apply-'));
});

afterEach(() => {
  if (existsSync(workspaceDir)) rmSync(workspaceDir, { recursive: true, force: true });
});

function writeProposal(file: ProposalFile): string {
  const path = join(workspaceDir, 'proposal.json');
  writeFileSync(path, JSON.stringify(file, null, 2));
  return path;
}

function baseProposal(itemsOverride: ProposalFile['items']): ProposalFile {
  return {
    generated_at: '2026-05-29T00:00:00.000Z',
    project_root: '/repo',
    days_threshold: 30,
    threshold_count: 3,
    worktree_base: '/work',
    items: itemsOverride,
  };
}

describe('dismantle-worktrees apply — validation', () => {
  it('rejects proposal where any item has unset decision', () => {
    const path = writeProposal(baseProposal([
      { path: '/work/a', branch: 'feature/a', verdict: 'stale', recommended_disposition: 'dismantle', decision: '' },
    ]));
    expect(() => apply({
      proposalPath: path,
      runGit: () => '',
      defaultOpts: {
        allowDirty: false,
        forceDiscard: false,
        acceptDivergence: false,
        allowExternal: false,
      },
    })).toThrow(ApplyValidationError);
  });

  it('rejects proposal with unknown decision value', () => {
    const path = writeProposal(baseProposal([
      { path: '/work/a', branch: 'feature/a', verdict: 'stale', recommended_disposition: 'dismantle', decision: 'bogus' as never },
    ]));
    expect(() => apply({
      proposalPath: path,
      runGit: () => '',
      defaultOpts: {
        allowDirty: false,
        forceDiscard: false,
        acceptDivergence: false,
        allowExternal: false,
      },
    })).toThrow(ApplyValidationError);
  });

  it('all-or-nothing: refuses if even one item is invalid', () => {
    const path = writeProposal(baseProposal([
      { path: '/work/a', branch: 'feature/a', verdict: 'stale', recommended_disposition: 'dismantle', decision: 'skip' },
      { path: '/work/b', branch: 'feature/b', verdict: 'stale', recommended_disposition: 'dismantle', decision: '' },
      { path: '/work/c', branch: 'feature/c', verdict: 'stale', recommended_disposition: 'dismantle', decision: 'skip' },
    ]));
    expect(() => apply({
      proposalPath: path,
      runGit: () => '',
      defaultOpts: {
        allowDirty: false,
        forceDiscard: false,
        acceptDivergence: false,
        allowExternal: false,
      },
    })).toThrow(ApplyValidationError);
  });
});

describe('dismantle-worktrees apply — dispatch', () => {
  it('records skip decisions in skipped[]', () => {
    const path = writeProposal(baseProposal([
      { path: '/work/a', branch: 'feature/a', verdict: 'stale', recommended_disposition: 'dismantle', decision: 'skip' },
    ]));
    const result = apply({
      proposalPath: path,
      runGit: () => '',
      defaultOpts: {
        allowDirty: false,
        forceDiscard: false,
        acceptDivergence: false,
        allowExternal: false,
      },
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.path).toBe('/work/a');
    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('records orphan prune in applied[] without throwing', () => {
    const path = writeProposal(baseProposal([
      { path: '/work/orphan-x', branch: null, verdict: 'orphan', recommended_disposition: 'prune-orphan', decision: 'prune-orphan' },
    ]));
    const result = apply({
      proposalPath: path,
      runGit: () => '',
      defaultOpts: {
        allowDirty: false,
        forceDiscard: false,
        acceptDivergence: false,
        allowExternal: false,
      },
    });
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.decision).toBe('prune-orphan');
    expect(result.failed).toHaveLength(0);
  });

  it('records dismantle preflight failure in failed[] without halting batch', () => {
    // The dismantle calls will fail preflight because the runGit stub
    // returns empty, so the porcelain parse yields no registered entries;
    // the dismantle primitive's isKnownToGit lookup returns false →
    // refuses with 'unknown-worktree'.
    const path = writeProposal(baseProposal([
      { path: '/work/a', branch: 'feature/a', verdict: 'stale', recommended_disposition: 'dismantle', decision: 'dismantle' },
      { path: '/work/b', branch: 'feature/b', verdict: 'stale', recommended_disposition: 'dismantle', decision: 'skip' },
    ]));
    const result = apply({
      proposalPath: path,
      runGit: () => '',
      defaultOpts: {
        allowDirty: false,
        forceDiscard: false,
        acceptDivergence: false,
        allowExternal: true,
      },
    });
    expect(result.failed).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.failed[0]?.path).toBe('/work/a');
    expect(result.failed[0]?.error).toMatch(/not registered with git|unknown-worktree/i);
  });
});
