/**
 * specs/029-govern-operability — Phase 3 / US3 (T016, RED → T017 GREEN; T018).
 *
 * FR-009/010/011: the dampener's consecutive-quiet streak must increment only on
 * a fully-healthy (non-degraded) run with ZERO NEW (previously-unseen) HIGH+
 * findings, where "new" is keyed by `findingSignature(heading, surface)` against
 * EVERY earlier audit-log section:
 *   - FR-010: a previously-seen finding RE-RATED to HIGH (its signature appeared
 *     earlier at any severity) is severity jitter, NOT new signal — it must NOT
 *     reset/block the streak (the TASK-146 bug).
 *   - FR-011: a genuinely NEW HIGH (signature unseen in all earlier sections)
 *     MUST still reset/block the streak the first time it appears.
 *
 * FR-012 (cross-round hysteresis): a HIGH that appears in ONLY ONE run of the
 * recent window (transient, never persisted across ≥2 runs) is not treated as a
 * stable/persistent blocker for the streak — but a genuinely-NEW HIGH still
 * resets the streak the first time (FR-011 is preserved).
 *
 * These tests drive the real `checkBarrageDampener` against literal audit-log
 * sections — the dampener's identity-keying + hysteresis contract.
 */

import { describe, expect, it } from 'vitest';
import { checkBarrageDampener } from '../../src/scope-discovery/promote-findings/check-barrage-dampener.js';

const HEADER = '---\nslug: feat\ntargetVersion: ""\n---\n\n# Audit log — feat\n';

/**
 * A lift section header + arbitrary entry blocks. When `codeSha` is supplied it
 * is stamped into the preamble as `Code-sha: <sha>` — the audited code epoch the
 * dampener scopes FR-010 re-rate suppression to (AUDIT-BARRAGE-codex-01). A
 * section with no `codeSha` is its own epoch (keyed by `runBasename`).
 */
function section(
  runBasename: string,
  date: string,
  entries: readonly string[],
  codeSha?: string,
): string {
  const preamble = codeSha !== undefined ? ['', `Code-sha: ${codeSha}`] : [''];
  return [`## ${date} — audit-barrage lift (${runBasename})`, ...preamble, ...entries].join('\n');
}

/** One `### AUDIT-… — <heading>` entry block with explicit severity + surface. */
function entry(args: {
  readonly id: string;
  readonly heading: string;
  readonly severity: string;
  readonly surface: string;
  readonly status?: string;
}): string {
  return [
    `### ${args.id} — ${args.heading}`,
    '',
    `Finding-ID: ${args.id}`,
    `Status:     ${args.status ?? 'open'}`,
    `Severity:   ${args.severity}`,
    `Surface:    ${args.surface}`,
    '',
    'body text',
    '',
  ].join('\n');
}

const HEADING_A = 'race in the watchdog kill path';
const FILE_A = 'src/spawn-cli.ts';
// FR-010 jitter is "re-rated to HIGH on UNCHANGED code" — same audited tip.sha
// across the runs. Use one shared sha so the earlier sighting and the re-rate
// land in the SAME epoch (the precondition for suppression; AUDIT-BARRAGE-codex-01).
const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('dampener: identity-keyed new-HIGH counting (US3, FR-009/010/011)', () => {
  it('single-run-clean does NOT fire on a most-recent run that RAW-surfaced a HIGH, even jitter (codex-01, phase-3)', () => {
    // The aggressive one-run fast-path must require a GENUINELY pristine run (raw
    // 0 HIGH + 0 MEDIUM). A run that visibly shows `Severity: high` — even a
    // same-epoch re-rate (newHighPlusCount === 0) — must NOT immediately
    // graduate; jitter tolerance lives in the 2-run N-quiet streak only.
    const earlier = section(
      'run-earlier',
      '2026-06-20',
      [
        entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'low', surface: `${FILE_A}:42` }),
        // A genuine new HIGH here keeps the N-quiet streak from engaging, so the
        // single-run rule is the only path that could dampen.
        entry({ id: 'AUDIT-20260620-02', heading: 'a different real high', severity: 'high', surface: 'src/y.ts:1' }),
      ],
      SHA_A,
    );
    const recent = section(
      'run-recent',
      '2026-06-21',
      [entry({ id: 'AUDIT-20260621-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:7-9` })],
      SHA_A,
    );
    const log = `${HEADER}\n${earlier}\n\n${recent}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // The recent run is jitter (newHighPlusCount 0) but RAW-surfaced a HIGH.
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(0);
    expect(r.recentRunCounts[0]?.rawHighPlusCount).toBe(1);
    // N-quiet can't engage (the earlier run has a genuine new HIGH); single-run
    // can't engage (raw HIGH > 0). So the gate stays BLOCKED.
    expect(r.dampened).toBe(false);
  });

  it('a HIGH whose signature appeared in an EARLIER section is NOT new (FR-010)', () => {
    // Earlier section: the same heading+file at severity LOW.
    // Most-recent section: the SAME heading+file re-rated to HIGH (jitter).
    const earlier = section(
      'run-earlier',
      '2026-06-20',
      [entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'low', surface: `${FILE_A}:42` })],
      SHA_A,
    );
    const recent = section(
      'run-recent',
      '2026-06-21',
      [entry({ id: 'AUDIT-20260621-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:99:1` })],
      SHA_A,
    );
    const log = `${HEADER}\n${earlier}\n\n${recent}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // The most-recent run RAW-surfaced a HIGH, but it is a re-rate of a seen
    // signature ON THE SAME CODE EPOCH → newHighPlusCount === 0 even though
    // rawHighPlusCount === 1.
    expect(r.recentRunCounts[0]?.rawHighPlusCount).toBe(1);
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(0);
  });

  it('a genuinely-NEW HIGH (signature unseen earlier) counts as new and blocks (FR-011)', () => {
    // Earlier section: a DIFFERENT heading+file (so the recent HIGH is unseen).
    const earlier = section('run-earlier', '2026-06-20', [
      entry({
        id: 'AUDIT-20260620-01',
        heading: 'an unrelated earlier finding',
        severity: 'low',
        surface: 'src/other.ts:1',
      }),
    ]);
    const recent = section('run-recent', '2026-06-21', [
      entry({ id: 'AUDIT-20260621-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:42` }),
    ]);
    const log = `${HEADER}\n${earlier}\n\n${recent}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(1);
    expect(r.dampened).toBe(false);
  });

  it('two healthy runs whose only HIGHs are re-rates of SEEN findings DO dampen (FR-010)', () => {
    // Section 0 (oldest): introduces both signatures at LOW (they become "seen").
    const seedA = entry({ id: 'AUDIT-20260619-01', heading: HEADING_A, severity: 'low', surface: `${FILE_A}:1` });
    const seedB = entry({
      id: 'AUDIT-20260619-02',
      heading: 'second seen finding heading',
      severity: 'low',
      surface: 'src/b.ts:1',
    });
    const seed = section('run-seed', '2026-06-19', [seedA, seedB], SHA_A);
    // Then two consecutive runs, each re-rating a SEEN signature to HIGH — all on
    // the SAME code epoch (unchanged code), so the re-rates are FR-010 jitter.
    const rerateA = section(
      'run-rerate-1',
      '2026-06-20',
      [entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:7` })],
      SHA_A,
    );
    const rerateB = section(
      'run-rerate-2',
      '2026-06-21',
      [
        entry({
          id: 'AUDIT-20260621-01',
          heading: 'second seen finding heading',
          severity: 'high',
          surface: 'src/b.ts:9',
        }),
      ],
      SHA_A,
    );
    const log = `${HEADER}\n${seed}\n\n${rerateA}\n\n${rerateB}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // The two most-recent runs each surfaced a re-rated (seen) HIGH → 0 new each.
    expect(r.recentRunCounts.map((c) => c.newHighPlusCount)).toEqual([0, 0]);
    expect(r.dampened).toBe(true);
  });

  it('a first-occurrence HIGH is "new" (no earlier sections) and still blocks (FR-011)', () => {
    const only = section('run-only', '2026-06-20', [
      entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:1` }),
    ]);
    const r = checkBarrageDampener({ auditLogText: `${HEADER}\n${only}\n`, threshold: 2 });
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(1);
    expect(r.dampened).toBe(false);
  });
});

describe('dampener: cross-round hysteresis (US3, FR-012)', () => {
  it('a NEW HIGH seen in only ONE run of the window still resets the streak (FR-011 preserved)', () => {
    // A new HIGH appears once in the most-recent run; FR-011 says it blocks.
    const earlier = section('run-earlier', '2026-06-20', [
      entry({
        id: 'AUDIT-20260620-01',
        heading: 'a clean earlier run finding',
        severity: 'low',
        surface: 'src/old.ts:1',
      }),
    ]);
    const recent = section('run-recent', '2026-06-21', [
      entry({ id: 'AUDIT-20260621-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:1` }),
    ]);
    const log = `${HEADER}\n${earlier}\n\n${recent}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.dampened).toBe(false);
  });

  it('a PERSISTENT HIGH (seen at HIGH, stays HIGH) keeps blocking every round (SC-001)', () => {
    // The same HIGH signature appears in two consecutive runs, ALREADY HIGH each
    // time. This is NOT a re-rate-up (the prior occurrence was already HIGH), so
    // it is NOT FR-010 jitter — it is a persistent unresolved blocker. Both
    // occurrences count: the loop must NOT converge while the defect persists.
    // Same code epoch (SHA_A) both rounds: the prior occurrence was ALREADY HIGH
    // in this epoch → SC-001's persistent-real-defect branch (rank >= HIGH) keeps
    // it counting, NOT the new-for-epoch branch. This pins SC-001 within one epoch.
    const persistent = (run: string, date: string, id: string): string =>
      section(
        run,
        date,
        [entry({ id, heading: HEADING_A, severity: 'high', surface: `${FILE_A}:1` })],
        SHA_A,
      );
    const log = `${HEADER}\n${persistent('run-1', '2026-06-20', 'AUDIT-20260620-01')}\n\n${persistent('run-2', '2026-06-21', 'AUDIT-20260621-01')}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // recentRunCounts is most-recent-first: [run-2 (persistent → 1), run-1 (new → 1)].
    // A finding seen at HIGH that stays HIGH counts as HIGH+ every round.
    expect(r.recentRunCounts.map((c) => c.newHighPlusCount)).toEqual([1, 1]);
    expect(r.recentRunCounts.map((c) => c.rawHighPlusCount)).toEqual([1, 1]);
    // The persistent HIGH keeps both the consecutive-quiet streak and the
    // single-run-clean rule from engaging — the loop STAYS BLOCKED.
    expect(r.dampened).toBe(false);
  });
});

describe('dampener: re-rate suppression is scoped to a code epoch (AUDIT-BARRAGE-codex-01)', () => {
  it('a MEDIUM under one sha then HIGH under a DIFFERENT sha is NOT suppressed (changed code)', () => {
    // The earlier MEDIUM sighting and the later HIGH share a SIGNATURE but were
    // audited at DIFFERENT code shas (the operator changed the code between runs).
    // FR-010 only excuses a re-rate on UNCHANGED code; this HIGH lands in a fresh
    // epoch where the signature is unseen → it counts → blocks. The HIGH bug is a
    // genuinely-new defect on changed code that must NOT be masked.
    const earlier = section(
      'run-earlier',
      '2026-06-20',
      [entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'medium', surface: `${FILE_A}:42` })],
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    const recent = section(
      'run-recent',
      '2026-06-21',
      [entry({ id: 'AUDIT-20260621-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:99` })],
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
    const log = `${HEADER}\n${earlier}\n\n${recent}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.recentRunCounts[0]?.rawHighPlusCount).toBe(1);
    // Different epoch → the HIGH is NOT dampened (codex-01: real HIGH on changed code).
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(1);
    expect(r.dampened).toBe(false);
  });

  it('a MEDIUM then HIGH under the SAME sha (jitter on unchanged code) IS suppressed (FR-010)', () => {
    const sha = 'cccccccccccccccccccccccccccccccccccccccc';
    const earlier = section(
      'run-earlier',
      '2026-06-20',
      [entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'medium', surface: `${FILE_A}:42` })],
      sha,
    );
    const recent = section(
      'run-recent',
      '2026-06-21',
      [entry({ id: 'AUDIT-20260621-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:99` })],
      sha,
    );
    const log = `${HEADER}\n${earlier}\n\n${recent}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // Same epoch, seen earlier below HIGH → re-rate jitter → suppressed.
    expect(r.recentRunCounts[0]?.rawHighPlusCount).toBe(1);
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(0);
  });
});

describe('dampener: intra-section signature dedup (MEDIUM finding)', () => {
  it('two HIGH entries in ONE section sharing a signature count newHighPlusCount === 1', () => {
    // Two distinct AUDIT IDs, but the same (heading, surface) → one signature.
    // Per-section dedup: the signature is counted at most once.
    const dup = section('run-dup', '2026-06-20', [
      entry({ id: 'AUDIT-20260620-01', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:1` }),
      entry({ id: 'AUDIT-20260620-02', heading: HEADING_A, severity: 'high', surface: `${FILE_A}:1` }),
    ]);
    const r = checkBarrageDampener({ auditLogText: `${HEADER}\n${dup}\n`, threshold: 2 });
    expect(r.recentRunCounts[0]?.rawHighPlusCount).toBe(2);
    expect(r.recentRunCounts[0]?.newHighPlusCount).toBe(1);
    expect(r.dampened).toBe(false);
  });
});
