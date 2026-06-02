import { describe, it, expect } from 'vitest';
import {
  evaluateStaleness,
  buildSignals,
  CANONICAL_SIGNAL_ORDER,
} from '../worktree-report/staleness.js';
import type { StalenessSignal } from '../worktree-report/types.js';

function allFalse(): Readonly<Record<StalenessSignal, boolean>> {
  return {
    'branch-fully-merged': false,
    'pr-merged-or-closed': false,
    'feature-doc-complete': false,
    'no-recent-commits': false,
    'branch-gone-from-origin': false,
    'working-tree-clean': false,
    'commits-on-origin': false,
    'prunable': false,
    'orphan-directory': false,
  };
}

function withHeld(...held: StalenessSignal[]): Readonly<Record<StalenessSignal, boolean>> {
  const base = { ...allFalse() };
  for (const sig of held) {
    base[sig] = true;
  }
  return base;
}

const baseInput = {
  isCurrent: false,
  isMain: false,
  isOrphan: false,
  isDivergent: false,
  isCorrupt: false,
  hasNovelCommitsAheadOfMain: false,
  thresholdCount: 3,
};

describe('evaluateStaleness — overriding verdicts', () => {
  it('returns current/keep for the current worktree regardless of signal count', () => {
    const signals = buildSignals(withHeld(
      'branch-fully-merged',
      'pr-merged-or-closed',
      'feature-doc-complete',
      'no-recent-commits',
    ));
    const result = evaluateStaleness({ ...baseInput, signals, isCurrent: true });
    expect(result).toEqual({ verdict: 'current', disposition: 'keep' });
  });

  it('returns main/keep for the main worktree regardless of signal count', () => {
    const signals = buildSignals(withHeld(
      'branch-fully-merged',
      'pr-merged-or-closed',
      'feature-doc-complete',
      'no-recent-commits',
    ));
    const result = evaluateStaleness({ ...baseInput, signals, isMain: true });
    expect(result).toEqual({ verdict: 'main', disposition: 'keep' });
  });

  it('returns corrupt/operator-triage on multi-worktree-same-branch', () => {
    const signals = buildSignals(allFalse());
    const result = evaluateStaleness({ ...baseInput, signals, isCorrupt: true });
    expect(result).toEqual({ verdict: 'corrupt', disposition: 'operator-triage' });
  });

  it('returns divergent/operator-triage on force-push detection', () => {
    const signals = buildSignals(allFalse());
    const result = evaluateStaleness({ ...baseInput, signals, isDivergent: true });
    expect(result).toEqual({ verdict: 'divergent', disposition: 'operator-triage' });
  });

  it('returns orphan/prune-orphan when path exists but git does not know it', () => {
    const signals = buildSignals(allFalse());
    const result = evaluateStaleness({ ...baseInput, signals, isOrphan: true });
    expect(result).toEqual({ verdict: 'orphan', disposition: 'prune-orphan' });
  });
});

describe('evaluateStaleness — staleness threshold', () => {
  it('flags stale when held >= thresholdCount (3 of 9)', () => {
    const signals = buildSignals(withHeld(
      'branch-fully-merged',
      'pr-merged-or-closed',
      'working-tree-clean',
    ));
    const result = evaluateStaleness({ ...baseInput, signals });
    expect(result.verdict).toBe('stale');
  });

  it('does NOT flag stale when held < thresholdCount', () => {
    const signals = buildSignals(withHeld(
      'branch-fully-merged',
      'pr-merged-or-closed',
    ));
    const result = evaluateStaleness({ ...baseInput, signals });
    expect(result).toEqual({ verdict: 'keep', disposition: 'keep' });
  });

  it('honors a higher thresholdCount', () => {
    const signals = buildSignals(withHeld(
      'branch-fully-merged',
      'pr-merged-or-closed',
      'working-tree-clean',
    ));
    const result = evaluateStaleness({ ...baseInput, signals, thresholdCount: 4 });
    expect(result.verdict).toBe('keep');
  });

  it('honors thresholdCount=1 (any signal flags)', () => {
    const signals = buildSignals(withHeld('branch-fully-merged'));
    const result = evaluateStaleness({ ...baseInput, signals, thresholdCount: 1 });
    expect(result.verdict).toBe('stale');
  });

  it('all-9-criteria-hold flags stale', () => {
    const allHeld = withHeld(...CANONICAL_SIGNAL_ORDER);
    const signals = buildSignals(allHeld);
    const result = evaluateStaleness({ ...baseInput, signals });
    expect(result.verdict).toBe('stale');
  });

  it('recommends dismantle when branch has no novel commits ahead of main', () => {
    const signals = buildSignals(withHeld(
      'branch-fully-merged',
      'pr-merged-or-closed',
      'working-tree-clean',
    ));
    const result = evaluateStaleness({
      ...baseInput,
      signals,
      hasNovelCommitsAheadOfMain: false,
    });
    expect(result.disposition).toBe('dismantle');
  });

  it('recommends archive-then-dismantle when branch has novel commits ahead of main', () => {
    const signals = buildSignals(withHeld(
      'pr-merged-or-closed',
      'feature-doc-complete',
      'working-tree-clean',
    ));
    const result = evaluateStaleness({
      ...baseInput,
      signals,
      hasNovelCommitsAheadOfMain: true,
    });
    expect(result.disposition).toBe('archive-then-dismantle');
  });
});

describe('buildSignals — canonical ordering', () => {
  it('emits all 9 signals in canonical order regardless of input keys', () => {
    const signals = buildSignals(withHeld('orphan-directory', 'branch-fully-merged'));
    expect(signals).toHaveLength(9);
    expect(signals.map((s) => s.signal)).toEqual(CANONICAL_SIGNAL_ORDER);
  });

  it('marks held flags accurately', () => {
    const signals = buildSignals(withHeld('pr-merged-or-closed', 'working-tree-clean'));
    const heldSignals = signals.filter((s) => s.held).map((s) => s.signal);
    expect(heldSignals).toEqual(['pr-merged-or-closed', 'working-tree-clean']);
  });

  it('attaches optional notes', () => {
    const signals = buildSignals(
      withHeld('no-recent-commits'),
      { 'no-recent-commits': 'last commit 47 days ago' },
    );
    const sig = signals.find((s) => s.signal === 'no-recent-commits');
    expect(sig?.note).toBe('last commit 47 days ago');
  });
});

describe('verdict overriding precedence', () => {
  it('isCurrent wins over isOrphan / isDivergent / isCorrupt / stale-count', () => {
    const signals = buildSignals(withHeld(...CANONICAL_SIGNAL_ORDER));
    const result = evaluateStaleness({
      ...baseInput,
      signals,
      isCurrent: true,
      isOrphan: true,
      isDivergent: true,
      isCorrupt: true,
    });
    expect(result.verdict).toBe('current');
  });

  it('isMain wins over orphan / divergent / corrupt', () => {
    const signals = buildSignals(allFalse());
    const result = evaluateStaleness({
      ...baseInput,
      signals,
      isMain: true,
      isOrphan: true,
      isDivergent: true,
      isCorrupt: true,
    });
    expect(result.verdict).toBe('main');
  });

  it('isCorrupt wins over isDivergent and isOrphan', () => {
    const signals = buildSignals(allFalse());
    const result = evaluateStaleness({
      ...baseInput,
      signals,
      isCorrupt: true,
      isDivergent: true,
      isOrphan: true,
    });
    expect(result.verdict).toBe('corrupt');
  });

  it('isDivergent wins over isOrphan', () => {
    const signals = buildSignals(allFalse());
    const result = evaluateStaleness({
      ...baseInput,
      signals,
      isDivergent: true,
      isOrphan: true,
    });
    expect(result.verdict).toBe('divergent');
  });
});
