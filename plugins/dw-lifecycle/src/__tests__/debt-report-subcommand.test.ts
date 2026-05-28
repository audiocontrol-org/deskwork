import { describe, it, expect } from 'vitest';
import { parseDebtReportArgs } from '../subcommands/debt-report.js';

describe('parseDebtReportArgs', () => {
  it('returns defaults when no args provided', () => {
    const opts = parseDebtReportArgs([]);
    expect(opts.json).toBe(false);
    expect(opts.staleDays).toBe(30);
    expect(opts.commentStaleDays).toBe(7);
    expect(opts.parkedDays).toBe(30);
    expect(opts.sampleSize).toBe(5);
    expect(opts.issueLimit).toBe(1000);
    expect(opts.includeGh).toBe(true);
    expect(opts.includeWorkplan).toBe(true);
    expect(opts.includeBranches).toBe(true);
    expect(opts.repo).toBeUndefined();
  });

  it('parses --json as a boolean flag', () => {
    const opts = parseDebtReportArgs(['--json']);
    expect(opts.json).toBe(true);
  });

  it('parses --repo owner/repo', () => {
    const opts = parseDebtReportArgs(['--repo', 'foo/bar']);
    expect(opts.repo).toBe('foo/bar');
  });

  it('parses --stale-days and --comment-stale-days as numbers', () => {
    const opts = parseDebtReportArgs([
      '--stale-days',
      '14',
      '--comment-stale-days',
      '3',
    ]);
    expect(opts.staleDays).toBe(14);
    expect(opts.commentStaleDays).toBe(3);
  });

  it('parses --no-gh, --no-workplan, --no-branches as inverted booleans', () => {
    const opts = parseDebtReportArgs(['--no-gh', '--no-workplan', '--no-branches']);
    expect(opts.includeGh).toBe(false);
    expect(opts.includeWorkplan).toBe(false);
    expect(opts.includeBranches).toBe(false);
  });

  it('parses --limit', () => {
    const opts = parseDebtReportArgs(['--limit', '50']);
    expect(opts.issueLimit).toBe(50);
  });

  it('throws on unknown flag', () => {
    expect(() => parseDebtReportArgs(['--banana'])).toThrow(/Unknown flag/);
  });

  it('throws when a numeric flag is missing its value', () => {
    expect(() => parseDebtReportArgs(['--stale-days'])).toThrow(
      /--stale-days requires/,
    );
  });

  it('throws when --repo is missing a value', () => {
    expect(() => parseDebtReportArgs(['--repo'])).toThrow(/--repo requires/);
  });

  it('throws when a numeric flag value is not a finite number', () => {
    expect(() => parseDebtReportArgs(['--stale-days', 'abc'])).toThrow(
      /--stale-days must be a positive integer/,
    );
  });

  it('rejects mixed-digit input like "30abc" rather than silently truncating', () => {
    // Number.parseInt('30abc', 10) would return 30; the strict guard
    // requires the whole token to be digits so the operator sees the
    // typo instead of getting a different value than they typed.
    expect(() => parseDebtReportArgs(['--stale-days', '30abc'])).toThrow(
      /--stale-days must be a positive integer/,
    );
  });
});
