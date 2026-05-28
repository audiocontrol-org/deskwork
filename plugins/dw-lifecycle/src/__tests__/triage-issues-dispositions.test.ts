import { describe, it, expect } from 'vitest';
import {
  buildDispatch,
  validateDisposition,
} from '../triage-issues/dispositions.js';

describe('validateDisposition', () => {
  it('accepts a well-formed close-wontfix', () => {
    expect(() =>
      validateDisposition('close-wontfix', { reason: 'duplicate of #200' }),
    ).not.toThrow();
  });

  it('rejects close-wontfix with empty reason', () => {
    expect(() =>
      validateDisposition('close-wontfix', { reason: '' }),
    ).toThrow(/'reason'/);
  });

  it('rejects close-wontfix with whitespace-only reason', () => {
    expect(() =>
      validateDisposition('close-wontfix', { reason: '   ' }),
    ).toThrow(/'reason'/);
  });

  it('accepts a well-formed label', () => {
    expect(() =>
      validateDisposition('label', { labels: ['bug', 'needs-repro'] }),
    ).not.toThrow();
  });

  it('rejects label with empty labels array', () => {
    expect(() => validateDisposition('label', { labels: [] })).toThrow(
      /non-empty 'labels'/,
    );
  });

  it('rejects label with an empty-string element', () => {
    expect(() =>
      validateDisposition('label', { labels: ['bug', ''] }),
    ).toThrow(/'labels'/);
  });

  it('accepts a well-formed duplicate', () => {
    expect(() =>
      validateDisposition('duplicate', { dup_of: 42, reason: 'same bug' }),
    ).not.toThrow();
  });

  it('rejects duplicate with non-positive dup_of', () => {
    expect(() =>
      validateDisposition('duplicate', { dup_of: 0, reason: 'r' }),
    ).toThrow(/'dup_of'/);
  });

  it('rejects duplicate with missing reason', () => {
    expect(() =>
      validateDisposition('duplicate', { dup_of: 42, reason: '' }),
    ).toThrow(/'reason'/);
  });

  it('accepts a well-formed leave-with-comment', () => {
    expect(() =>
      validateDisposition('leave-with-comment', { comment: 'still relevant' }),
    ).not.toThrow();
  });

  it('rejects leave-with-comment with empty comment', () => {
    expect(() =>
      validateDisposition('leave-with-comment', { comment: '' }),
    ).toThrow(/'comment'/);
  });
});

describe('buildDispatch', () => {
  it('builds gh argv for close-wontfix', () => {
    const dispatch = buildDispatch({
      issueNumber: 123,
      kind: 'close-wontfix',
      fields: { reason: 'behavior exists in #200' },
      repo: 'foo/bar',
    });
    expect(dispatch.args).toEqual([
      'issue',
      'close',
      '123',
      '--repo',
      'foo/bar',
      '--reason',
      'not planned',
      '--comment',
      'behavior exists in #200',
    ]);
    expect(dispatch.result).toBe('closed-wontfix #123');
  });

  it('builds gh argv for label with multiple labels', () => {
    const dispatch = buildDispatch({
      issueNumber: 7,
      kind: 'label',
      fields: { labels: ['bug', 'priority:high'] },
      repo: 'foo/bar',
    });
    expect(dispatch.args).toEqual([
      'issue',
      'edit',
      '7',
      '--repo',
      'foo/bar',
      '--add-label',
      'bug',
      '--add-label',
      'priority:high',
    ]);
    expect(dispatch.result).toContain('bug');
    expect(dispatch.result).toContain('priority:high');
  });

  it('builds gh argv for duplicate', () => {
    const dispatch = buildDispatch({
      issueNumber: 99,
      kind: 'duplicate',
      fields: { dup_of: 42, reason: 'same root cause' },
      repo: 'foo/bar',
    });
    expect(dispatch.args[0]).toBe('issue');
    expect(dispatch.args[1]).toBe('close');
    expect(dispatch.args[2]).toBe('99');
    // The comment body weaves dup_of into the closing comment.
    const commentIdx = dispatch.args.indexOf('--comment');
    expect(commentIdx).toBeGreaterThan(-1);
    expect(dispatch.args[commentIdx + 1]).toContain('#42');
    expect(dispatch.args[commentIdx + 1]).toContain('same root cause');
    expect(dispatch.result).toContain('#42');
  });

  it('builds gh argv for leave-with-comment', () => {
    const dispatch = buildDispatch({
      issueNumber: 55,
      kind: 'leave-with-comment',
      fields: { comment: 'still tracking; checking in' },
      repo: 'foo/bar',
    });
    expect(dispatch.args).toEqual([
      'issue',
      'comment',
      '55',
      '--repo',
      'foo/bar',
      '--body',
      'still tracking; checking in',
    ]);
    expect(dispatch.result).toBe('commented #55');
  });

  it('throws before building when validation fails', () => {
    expect(() =>
      buildDispatch({
        issueNumber: 1,
        kind: 'close-wontfix',
        fields: { reason: '' },
        repo: 'foo/bar',
      }),
    ).toThrow(/'reason'/);
  });
});
