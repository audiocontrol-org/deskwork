/**
 * Phase 13 Task 4 Step 2 — auto-flip audit-log entries from `Closes
 * AUDIT-<id>` commit subjects.
 *
 * Behavior contract:
 *   - `parseClosesAuditTrailers(text)` returns the AUDIT IDs cited in
 *     subject (`Closes AUDIT-20260529-12`) and trailers (`Closes:
 *     AUDIT-X, AUDIT-Y, AUDIT-Z` comma-separated, with or without
 *     trailing colon).
 *   - `proposeFlipsForCommit` returns the proposed Status flips for a
 *     single commit: each cited AUDIT-id → `fixed-<commit-sha>`.
 *   - `proposeFlipsForCommits` walks multiple commits and unions the
 *     flips. Each AUDIT-id maps to its OWN closing commit's SHA (the
 *     first commit in the range that cites it).
 *   - Commits without `Closes AUDIT-<id>` references are silently
 *     skipped — empty proposal list is the expected output.
 *   - The pure-fn does NOT touch the audit-log; it only proposes.
 *     The CLI verb composes propose + applyStatusFlips together.
 */

import { describe, it, expect } from 'vitest';
import {
  parseClosesAuditTrailers,
  proposeFlipsForCommit,
  proposeFlipsForCommits,
} from '../../../scope-discovery/promote-findings/auto-flip-from-commit.js';

describe('parseClosesAuditTrailers — subject + trailer extraction', () => {
  it("extracts a single Closes AUDIT-<id> from a one-line subject", () => {
    const ids = parseClosesAuditTrailers(
      'feat(foo): land Closes AUDIT-20260529-12 inline',
    );
    expect(ids).toEqual(['AUDIT-20260529-12']);
  });

  it("extracts AUDIT id from a trailer line (commit body)", () => {
    const ids = parseClosesAuditTrailers(
      [
        'feat(foo): land',
        '',
        'Body prose.',
        '',
        'Closes AUDIT-20260529-13',
      ].join('\n'),
    );
    expect(ids).toEqual(['AUDIT-20260529-13']);
  });

  it("extracts multiple comma-separated AUDIT ids from a Closes: trailer", () => {
    const ids = parseClosesAuditTrailers(
      [
        'feat(foo): land batch',
        '',
        'Closes: AUDIT-20260529-12, AUDIT-20260529-13, AUDIT-20260529-14',
      ].join('\n'),
    );
    expect(ids).toEqual([
      'AUDIT-20260529-12',
      'AUDIT-20260529-13',
      'AUDIT-20260529-14',
    ]);
  });

  it("extracts AUDIT ids when commit has BOTH subject and trailer references", () => {
    const ids = parseClosesAuditTrailers(
      [
        'feat(foo): Closes AUDIT-20260529-12',
        '',
        'Detailed body.',
        '',
        'Closes: AUDIT-20260529-13, AUDIT-20260529-14',
      ].join('\n'),
    );
    expect(ids).toEqual([
      'AUDIT-20260529-12',
      'AUDIT-20260529-13',
      'AUDIT-20260529-14',
    ]);
  });

  it("deduplicates same-id references across subject + body", () => {
    const ids = parseClosesAuditTrailers(
      [
        'feat(foo): Closes AUDIT-20260529-12',
        '',
        'Body mentions AUDIT-20260529-12 again.',
        '',
        'Closes AUDIT-20260529-12',
      ].join('\n'),
    );
    expect(ids).toEqual(['AUDIT-20260529-12']);
  });

  it("returns empty when the commit has no Closes-AUDIT reference", () => {
    const ids = parseClosesAuditTrailers(
      [
        'feat(foo): unrelated change',
        '',
        'Body mentions AUDIT-20260529-12 in passing but no Closes keyword.',
      ].join('\n'),
    );
    expect(ids).toEqual([]);
  });

  it("matches case-insensitively on the Closes keyword", () => {
    const ids = parseClosesAuditTrailers(
      'feat(foo): closes AUDIT-20260529-12 (lowercase verb)',
    );
    expect(ids).toEqual(['AUDIT-20260529-12']);
  });

  it("preserves order of first occurrence across multi-line input", () => {
    const ids = parseClosesAuditTrailers(
      [
        'feat: Closes AUDIT-20260529-14',
        '',
        'Closes: AUDIT-20260529-12, AUDIT-20260529-13',
      ].join('\n'),
    );
    expect(ids).toEqual([
      'AUDIT-20260529-14',
      'AUDIT-20260529-12',
      'AUDIT-20260529-13',
    ]);
  });
});

describe('proposeFlipsForCommit — per-commit Status flip proposals', () => {
  it("proposes open → fixed-<sha> for each AUDIT id in the commit", () => {
    const flips = proposeFlipsForCommit({
      sha: 'deadbeef',
      message: 'feat: Closes AUDIT-20260529-12',
    });
    expect(flips).toEqual([
      { findingId: 'AUDIT-20260529-12', newStatus: 'fixed-deadbeef' },
    ]);
  });

  it("proposes one flip per cited AUDIT id (multi-finding commit)", () => {
    const flips = proposeFlipsForCommit({
      sha: 'cafebabe',
      message: [
        'feat: combo fix',
        '',
        'Closes: AUDIT-20260529-12, AUDIT-20260529-13, AUDIT-20260529-14',
      ].join('\n'),
    });
    expect(flips).toEqual([
      { findingId: 'AUDIT-20260529-12', newStatus: 'fixed-cafebabe' },
      { findingId: 'AUDIT-20260529-13', newStatus: 'fixed-cafebabe' },
      { findingId: 'AUDIT-20260529-14', newStatus: 'fixed-cafebabe' },
    ]);
  });

  it("returns empty when commit has no Closes-AUDIT reference", () => {
    const flips = proposeFlipsForCommit({
      sha: 'abc1234',
      message: 'docs: README polish',
    });
    expect(flips).toEqual([]);
  });

  it("uses the short SHA (first 7 chars) when provided as such", () => {
    const flips = proposeFlipsForCommit({
      sha: '245f8ae',
      message: 'feat: Closes AUDIT-20260529-12',
    });
    expect(flips[0]?.newStatus).toBe('fixed-245f8ae');
  });
});

describe('proposeFlipsForCommits — multi-commit walker', () => {
  it("unions flips across commits, attributing each AUDIT id to its FIRST closing commit", () => {
    const flips = proposeFlipsForCommits([
      { sha: 'aaaaaa', message: 'feat: Closes AUDIT-20260529-12' },
      { sha: 'bbbbbb', message: 'docs: unrelated' },
      { sha: 'cccccc', message: 'feat: Closes AUDIT-20260529-13' },
    ]);
    expect(flips).toEqual([
      { findingId: 'AUDIT-20260529-12', newStatus: 'fixed-aaaaaa' },
      { findingId: 'AUDIT-20260529-13', newStatus: 'fixed-cccccc' },
    ]);
  });

  it("deduplicates when the same AUDIT id appears in multiple commits — first wins", () => {
    const flips = proposeFlipsForCommits([
      { sha: 'first1', message: 'feat: Closes AUDIT-20260529-12' },
      { sha: 'secnd2', message: 'fix: Closes AUDIT-20260529-12 (follow-up)' },
    ]);
    expect(flips).toEqual([
      { findingId: 'AUDIT-20260529-12', newStatus: 'fixed-first1' },
    ]);
  });

  it("returns empty list when no commits in the range cite Closes-AUDIT", () => {
    const flips = proposeFlipsForCommits([
      { sha: 'abc1', message: 'docs: x' },
      { sha: 'def2', message: 'feat: y' },
    ]);
    expect(flips).toEqual([]);
  });

  it("handles an empty commit range (no commits)", () => {
    const flips = proposeFlipsForCommits([]);
    expect(flips).toEqual([]);
  });
});
