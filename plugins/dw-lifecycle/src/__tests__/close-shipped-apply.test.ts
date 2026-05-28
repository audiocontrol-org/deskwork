import { describe, it, expect } from 'vitest';
import {
  applyAll,
  buildCommentBody,
  __testing,
} from '../close-shipped/apply.js';
import type {
  IssueReferenceGroup,
  RunGh,
  ScannedCommit,
} from '../close-shipped/types.js';

function mkGroup(issue: number, subjects: readonly string[]): IssueReferenceGroup {
  const commits: ScannedCommit[] = subjects.map((s, i) => ({
    sha: `sha${i}${'x'.repeat(4)}`.slice(0, 7),
    subject: s,
    body: '',
  }));
  return {
    issue,
    commits,
    verbs: ['closes'],
    primarySubject: subjects[0] ?? '',
  };
}

interface Call {
  readonly args: readonly string[];
}

interface MockGhConfig {
  // Maps issue number -> state response. Default 'OPEN' with no labels.
  readonly viewResponses?: Record<number, { state: string; labels: string[] }>;
  // Set of (verb, issue) keys that should throw when called.
  readonly throwOn?: ReadonlySet<string>;
}

function mockGh(config: MockGhConfig = {}): { runGh: RunGh; calls: Call[] } {
  const calls: Call[] = [];
  const throwOn = config.throwOn ?? new Set<string>();
  const runGh: RunGh = (args) => {
    calls.push({ args: [...args] });
    if (args[0] === 'issue' && args[1] === 'view') {
      const num = Number.parseInt(args[2] ?? '0', 10);
      const key = `view:${num}`;
      if (throwOn.has(key)) throw new Error('gh view failed');
      const resp = config.viewResponses?.[num] ?? {
        state: 'OPEN',
        labels: [],
      };
      const labelsJson = resp.labels.map((name) => ({ name }));
      return JSON.stringify({ state: resp.state, labels: labelsJson });
    }
    if (args[0] === 'issue' && args[1] === 'comment') {
      const num = Number.parseInt(args[2] ?? '0', 10);
      const key = `comment:${num}`;
      if (throwOn.has(key)) throw new Error('gh comment failed');
      return '';
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      const num = Number.parseInt(args[2] ?? '0', 10);
      const key = `label:${num}`;
      if (throwOn.has(key)) throw new Error('gh label failed');
      return '';
    }
    return '';
  };
  return { runGh, calls };
}

describe('parseIssueView', () => {
  it('parses OPEN issue with labels', () => {
    const view = __testing.parseIssueView(
      JSON.stringify({ state: 'OPEN', labels: [{ name: 'bug' }, { name: 'p1' }] }),
    );
    expect(view.state).toBe('OPEN');
    expect(view.labels).toEqual(['bug', 'p1']);
  });

  it('parses CLOSED issue with no labels', () => {
    const view = __testing.parseIssueView(
      JSON.stringify({ state: 'CLOSED', labels: [] }),
    );
    expect(view.state).toBe('CLOSED');
    expect(view.labels).toEqual([]);
  });

  it('returns UNKNOWN on malformed input', () => {
    const view = __testing.parseIssueView('not-json');
    expect(view.state).toBe('UNKNOWN');
    expect(view.labels).toEqual([]);
  });

  it('handles string-form labels (legacy gh shape)', () => {
    const view = __testing.parseIssueView(
      JSON.stringify({ state: 'OPEN', labels: ['legacy', 'string'] }),
    );
    expect(view.labels).toEqual(['legacy', 'string']);
  });
});

describe('buildCommentBody', () => {
  it('includes the version and the contributing commits', () => {
    const group = mkGroup(42, ['feat: thing']);
    const body = buildCommentBody({ toTag: 'v1.2.3', group });
    expect(body).toContain('Shipped in v1.2.3');
    expect(body).toContain('feat: thing');
    expect(body).toContain('Install / upgrade to v1.2.3');
    expect(body).toContain('verify against an installed release');
  });

  it('lists multiple commits', () => {
    const group = mkGroup(7, ['fix: a', 'fix: b']);
    const body = buildCommentBody({ toTag: 'v1.0.0', group });
    expect(body).toContain('fix: a');
    expect(body).toContain('fix: b');
  });
});

describe('decideOutcome', () => {
  it('both succeed -> labeled-and-commented, applied=true', () => {
    const outcome = __testing.decideOutcome(1, null, null);
    expect(outcome.applied).toBe(true);
    expect(outcome.action).toBe('labeled-and-commented');
  });

  it('comment fails, label succeeds -> label-only, applied=true', () => {
    const outcome = __testing.decideOutcome(1, 'boom', null);
    expect(outcome.applied).toBe(true);
    expect(outcome.action).toBe('label-only');
    expect(outcome.error).toContain('boom');
  });

  it('comment succeeds, label fails -> comment-only, applied=true', () => {
    const outcome = __testing.decideOutcome(1, null, 'no-such-label');
    expect(outcome.applied).toBe(true);
    expect(outcome.action).toBe('comment-only');
    expect(outcome.error).toContain('no-such-label');
  });

  it('both fail -> failed-comment, applied=false', () => {
    const outcome = __testing.decideOutcome(1, 'c-err', 'l-err');
    expect(outcome.applied).toBe(false);
    expect(outcome.action).toBe('failed-comment');
    expect(outcome.error).toContain('c-err');
    expect(outcome.error).toContain('l-err');
  });
});

describe('applyAll', () => {
  it('happy path: comments + labels each open issue', () => {
    const groups = [mkGroup(10, ['feat: x']), mkGroup(20, ['fix: y'])];
    const { runGh, calls } = mockGh();
    const { outcomes } = applyAll({
      groups,
      toTag: 'v1.0.0',
      repo: 'owner/repo',
      label: 'pending-verification',
      dryRun: false,
      runGh,
    });
    expect(outcomes.length).toBe(2);
    for (const o of outcomes) {
      expect(o.applied).toBe(true);
      expect(o.action).toBe('labeled-and-commented');
    }
    // 3 calls per issue: view, comment, edit.
    expect(calls.length).toBe(6);
    expect(calls[0]?.args).toContain('view');
    expect(calls[1]?.args).toContain('comment');
    expect(calls[2]?.args).toContain('edit');
  });

  it('skips already-closed issues without commenting or labeling', () => {
    const groups = [mkGroup(10, ['feat: x'])];
    const { runGh, calls } = mockGh({
      viewResponses: { 10: { state: 'CLOSED', labels: [] } },
    });
    const { outcomes } = applyAll({
      groups,
      toTag: 'v1.0.0',
      repo: 'owner/repo',
      label: 'pending-verification',
      dryRun: false,
      runGh,
    });
    expect(outcomes.length).toBe(1);
    const first = outcomes[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.applied).toBe(false);
    expect(first.action).toBe('skipped-already-closed');
    expect(calls.length).toBe(1); // only the view call
  });

  it('skips already-labeled issues without re-commenting', () => {
    const groups = [mkGroup(20, ['fix: y'])];
    const { runGh, calls } = mockGh({
      viewResponses: {
        20: { state: 'OPEN', labels: ['pending-verification'] },
      },
    });
    const { outcomes } = applyAll({
      groups,
      toTag: 'v1.0.0',
      repo: 'owner/repo',
      label: 'pending-verification',
      dryRun: false,
      runGh,
    });
    const first = outcomes[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.applied).toBe(false);
    expect(first.action).toBe('skipped-already-labeled');
    expect(calls.length).toBe(1);
  });

  it('partial success: label-only when comment fails', () => {
    const groups = [mkGroup(10, ['feat: x'])];
    const { runGh } = mockGh({
      throwOn: new Set<string>(['comment:10']),
    });
    const { outcomes } = applyAll({
      groups,
      toTag: 'v1.0.0',
      repo: 'owner/repo',
      label: 'pending-verification',
      dryRun: false,
      runGh,
    });
    const first = outcomes[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.applied).toBe(true);
    expect(first.action).toBe('label-only');
  });

  it('records state-check failure as failed-state-check', () => {
    const groups = [mkGroup(10, ['feat: x'])];
    const { runGh } = mockGh({ throwOn: new Set<string>(['view:10']) });
    const { outcomes } = applyAll({
      groups,
      toTag: 'v1.0.0',
      repo: 'owner/repo',
      label: 'pending-verification',
      dryRun: false,
      runGh,
    });
    const first = outcomes[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.applied).toBe(false);
    expect(first.action).toBe('failed-state-check');
  });

  it('passes the configured label to gh issue edit', () => {
    const groups = [mkGroup(10, ['feat: x'])];
    const { runGh, calls } = mockGh();
    applyAll({
      groups,
      toTag: 'v1.0.0',
      repo: 'owner/repo',
      label: 'custom-label-name',
      dryRun: false,
      runGh,
    });
    const editCall = calls.find((c) => c.args.includes('edit'));
    expect(editCall).toBeDefined();
    if (editCall === undefined) return;
    expect(editCall.args).toContain('--add-label');
    expect(editCall.args).toContain('custom-label-name');
  });
});
