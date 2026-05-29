/**
 * Phase 13 Task 4 Step 1 — `close-shipped-audit-findings` walker.
 *
 * Walks audit-log entries for `Status: fixed-<sha>` whose SHA is in a
 * release range; proposes flipping each to `verified-<date>`.
 *
 * Per the project rule "Issue closure requires verification in a
 * formally-installed release", the flip is proposed but NOT auto-applied
 * by default — the verb runs in dry-run mode unless `--apply` is passed
 * AND the operator confirms the proposed candidates.
 *
 * Library-level tests use synthetic audit-log entries + in-range SHA
 * lists; the CLI tests (sibling file) exercise the end-to-end git-driven
 * flow via injected commitWalker.
 */

import { describe, it, expect } from 'vitest';
import {
  proposeVerifiedFlips,
  isShaInRange,
} from '../../../scope-discovery/promote-findings/close-shipped-audit-findings.js';

describe('isShaInRange — prefix-match short SHA against full-SHA list', () => {
  const fullShas = [
    'aabbccdd00112233445566778899aabbccddee01',
    '1234567890abcdef1234567890abcdef12345678',
    'cafebabedeadbeef0011223344556677889900aa',
  ];

  it("matches a 7-char short SHA that prefixes a full SHA", () => {
    expect(isShaInRange('aabbccd', fullShas)).toBe(true);
  });

  it("matches a 10-char short SHA prefix", () => {
    expect(isShaInRange('1234567890', fullShas)).toBe(true);
  });

  it("matches a full SHA verbatim", () => {
    expect(isShaInRange('cafebabedeadbeef0011223344556677889900aa', fullShas)).toBe(true);
  });

  it("returns false when no SHA in range has the prefix", () => {
    expect(isShaInRange('deadbeef', fullShas)).toBe(false);
  });

  it("returns false on empty range", () => {
    expect(isShaInRange('aabbccd', [])).toBe(false);
  });

  it("is case-insensitive on hex digits", () => {
    expect(isShaInRange('AABBCCD', fullShas)).toBe(true);
  });
});

describe('proposeVerifiedFlips — extract fixed-<sha> entries in range', () => {
  const entries = [
    {
      findingId: 'AUDIT-20260529-12',
      status: 'fixed-aabbccd',
      heading: 'AUDIT-20260529-12 — first',
    },
    {
      findingId: 'AUDIT-20260529-13',
      status: 'fixed-1234567',
      heading: 'AUDIT-20260529-13 — second',
    },
    {
      findingId: 'AUDIT-20260529-14',
      status: 'fixed-deadbee',
      heading: 'AUDIT-20260529-14 — out of range',
    },
    {
      findingId: 'AUDIT-20260529-15',
      status: 'open',
      heading: 'AUDIT-20260529-15 — not yet fixed',
    },
    {
      findingId: 'AUDIT-20260529-16',
      status: 'acknowledged-#362',
      heading: 'AUDIT-20260529-16 — acknowledged',
    },
    {
      findingId: 'AUDIT-20260529-17',
      status: 'verified-2026-05-20',
      heading: 'AUDIT-20260529-17 — already verified',
    },
  ];

  const inRangeShas = [
    'aabbccdd00112233445566778899aabbccddee01',
    '1234567890abcdef1234567890abcdef12345678',
    // deadbee NOT in this set — should be skipped
  ];

  it("proposes flips for fixed-<sha> entries whose SHA is in range", () => {
    const flips = proposeVerifiedFlips({
      entries,
      shasInRange: inRangeShas,
      date: '2026-05-29',
    });
    expect(flips).toEqual([
      {
        findingId: 'AUDIT-20260529-12',
        previousStatus: 'fixed-aabbccd',
        newStatus: 'verified-2026-05-29',
      },
      {
        findingId: 'AUDIT-20260529-13',
        previousStatus: 'fixed-1234567',
        newStatus: 'verified-2026-05-29',
      },
    ]);
  });

  it("skips fixed-<sha> entries whose SHA is NOT in range", () => {
    const flips = proposeVerifiedFlips({
      entries,
      shasInRange: inRangeShas,
      date: '2026-05-29',
    });
    expect(flips.find((f) => f.findingId === 'AUDIT-20260529-14')).toBeUndefined();
  });

  it("skips entries with non-fixed status (open, acknowledged, verified)", () => {
    const flips = proposeVerifiedFlips({
      entries,
      shasInRange: inRangeShas,
      date: '2026-05-29',
    });
    expect(flips.find((f) => f.findingId === 'AUDIT-20260529-15')).toBeUndefined();
    expect(flips.find((f) => f.findingId === 'AUDIT-20260529-16')).toBeUndefined();
    expect(flips.find((f) => f.findingId === 'AUDIT-20260529-17')).toBeUndefined();
  });

  it("returns empty list when no entries match", () => {
    const flips = proposeVerifiedFlips({
      entries,
      shasInRange: ['ffffffffffffffffffffffffffffffffffffffff'],
      date: '2026-05-29',
    });
    expect(flips).toEqual([]);
  });

  it("returns empty when shasInRange is empty", () => {
    const flips = proposeVerifiedFlips({
      entries,
      shasInRange: [],
      date: '2026-05-29',
    });
    expect(flips).toEqual([]);
  });

  it("validates date shape (YYYY-MM-DD)", () => {
    expect(() =>
      proposeVerifiedFlips({
        entries,
        shasInRange: inRangeShas,
        date: '2026/05/29',
      }),
    ).toThrow(/YYYY-MM-DD/);
  });
});
