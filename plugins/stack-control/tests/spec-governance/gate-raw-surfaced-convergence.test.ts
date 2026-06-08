// #432 / AUDIT-20260608-01 (Facet A) — the FR-010 dampener window must count
// what each run RAW-SURFACED (by `Severity:`, ignoring later `Status:` changes),
// NOT the post-slush / post-fix OPEN counts.
//
// The defect: the dampener counted only `Status: open` findings, so
//   (1) a run that surfaced a HIGH then had it FIXED counted as a "0-HIGH run"
//       in the two-consecutive stability window, and
//   (2) the convergence slush (render→barrage→lift→slush→gate) flipped a run's
//       MEDIUMs to acknowledged-slush-pile BEFORE the gate counted them, so the
//       branch-(a) "0 MEDIUM" genuineness check was always satisfied.
// Together they graduated a checkpoint at the FIRST 0-open-HIGH run instead of
// the FR-010 terminal (a genuinely-pristine single run, OR two consecutive runs
// that each genuinely surfaced 0 HIGH).
//
// The rule (FR-010, unchanged):
//   stop the loop + open the gate  IFF
//     (the last run SURFACED 0 HIGH and 0 MED)  ||  (the last two runs SURFACED 0 HIGH)
//
// The cross-run OPEN-HIGH union (SC-006 "no unresolved HIGH") is a SEPARATE,
// already-correct guard and stays on open-counting — covered by
// gate-crossrun-open-high.test.ts; not re-pinned here.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { checkBarrageDampener } from '../../src/scope-discovery/promote-findings/check-barrage-dampener.js';

interface Entry {
  heading: string;
  id: string;
  sev: 'blocking' | 'high' | 'medium' | 'low' | 'informational';
  status?: string;
}

function section(runId: string, entries: Entry[]): string {
  const blocks = entries
    .map(
      (e) =>
        `### ${e.heading}\n\n` +
        `Finding-ID: ${e.id}\n` +
        `Status:     ${e.status ?? 'open'}\n` +
        `Severity:   ${e.sev}\n` +
        `Surface:    fixtures/spec.md:1\n\n` +
        `${e.heading} body.\n`,
    )
    .join('\n');
  return `## 2026-06-08 — audit-barrage lift (${runId})\n\n${blocks}\n`;
}

function makeRepo(slug: string, sections: string[]): { repo: string; auditLog: string } {
  const repo = mkdtempSync(join(tmpdir(), 'gate-raw-'));
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  const auditLog = `# Audit Log — ${slug}\n\n${sections.join('\n')}`;
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  return { repo, auditLog };
}

// stdout is ONLY `true` (OPEN) / `false` (BLOCKED); exit is execution status (#432).
function gate(repo: string, slug: string, extra: string[] = []) {
  const r = runCli(['spec-governance-gate', '--feature', slug, '--repo-root', repo, ...extra]);
  const out = r.stdout.trim();
  const open = out === 'true' ? true : out === 'false' ? false : undefined;
  return { status: r.status, open };
}

describe('FR-010 dampener counts RAW-surfaced severity (#432 Facet A)', () => {
  // ---- dampener library level -------------------------------------------

  it('a single run that surfaced a HIGH (now fixed) is NOT a 0-HIGH run → not dampened', () => {
    // The exact bug: a fixed HIGH has Status: fixed-<sha>, so the old open-count
    // read it as 0 HIGH and single-run-clean engaged. Raw-surfaced = 1 HIGH.
    const { auditLog } = makeRepo('d1', [
      section('20260608T100000000Z-d1', [
        { heading: 'A high, fixed', id: 'AUDIT-20260608-01', sev: 'high', status: 'fixed-abc1234' },
      ]),
    ]);
    expect(checkBarrageDampener({ auditLogText: auditLog, threshold: 2 }).dampened).toBe(false);
  });

  it('a single run that surfaced MEDIUMs (now slushed) is NOT single-run-clean → not dampened', () => {
    // Post-slush snapshot: the MED carries acknowledged-slush-pile, so the old
    // open-count saw 0 MED and branch (a) engaged. Raw-surfaced = 1 MED.
    const { auditLog } = makeRepo('d2', [
      section('20260608T100000000Z-d2', [
        {
          heading: 'A medium, slushed',
          id: 'AUDIT-20260608-02',
          sev: 'medium',
          status: 'acknowledged-slush-pile-2026-06-08',
        },
      ]),
    ]);
    expect(checkBarrageDampener({ auditLogText: auditLog, threshold: 2 }).dampened).toBe(false);
  });

  // ---- gate verb level: the field R2 early-graduation ---------------------

  it('field R2: prior run fixed its HIGH + this run surfaced (slushed) MEDs → BLOCKED, not converged', () => {
    // R1 surfaced 2 HIGH → agent fixed them (Status: fixed-<sha>).
    // R2 surfaced 0 HIGH but 4 MED → the convergence slush binned the MEDs.
    // OLD: window read [R2: 0 open HIGH/0 open MED, R1: 0 open HIGH] → single-run-clean → converged.
    // NEW: R1 raw-surfaced HIGH (not a 0-HIGH run); R2 raw-surfaced MED (not single-run-clean) → blocked.
    const { repo } = makeRepo('r2', [
      section('20260608T100000000Z-r2', [
        { heading: 'High one', id: 'AUDIT-20260608-01', sev: 'high', status: 'fixed-aaa1111' },
        { heading: 'High two', id: 'AUDIT-20260608-02', sev: 'high', status: 'fixed-bbb2222' },
      ]),
      section('20260608T110000000Z-r2', [
        { heading: 'Med a', id: 'AUDIT-20260608-03', sev: 'medium', status: 'acknowledged-slush-pile-2026-06-08' },
        { heading: 'Med b', id: 'AUDIT-20260608-04', sev: 'medium', status: 'acknowledged-slush-pile-2026-06-08' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 'r2');
      expect(open).toBe(false); // BLOCKED — not a graduation
      expect(status).toBe(0); // evaluated successfully
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // ---- gate verb level: the correct FR-010 terminals ----------------------

  it('branch (b): two consecutive runs that each surfaced 0 HIGH → converged (after a fixed-HIGH run)', () => {
    // R1 surfaced + fixed a HIGH; R2 + R3 each surfaced 0 HIGH (a MED slushed).
    // The two most-recent runs (R3, R2) both raw-surfaced 0 HIGH → converge.
    const { repo } = makeRepo('b', [
      section('20260608T100000000Z-b', [
        { heading: 'Fixed high', id: 'AUDIT-20260608-01', sev: 'high', status: 'fixed-aaa1111' },
      ]),
      section('20260608T110000000Z-b', [
        { heading: 'A med', id: 'AUDIT-20260608-02', sev: 'medium', status: 'acknowledged-slush-pile-2026-06-08' },
      ]),
      section('20260608T120000000Z-b', [
        // A MED here (slushed) keeps this run from being single-run-clean, so
        // graduation must come via branch (b) — the two-consecutive window.
        { heading: 'Another med', id: 'AUDIT-20260608-03', sev: 'medium', status: 'acknowledged-slush-pile-2026-06-08' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 'b');
      expect(open).toBe(true); // two consecutive 0-HIGH runs → OPEN
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('branch (a): a genuinely-pristine single run (surfaced 0 HIGH + 0 MED) → converged single-run-clean', () => {
    // After a fixed-HIGH run, ONE genuinely-pristine barrage (only a low) graduates.
    const { repo } = makeRepo('a', [
      section('20260608T100000000Z-a', [
        { heading: 'Fixed high', id: 'AUDIT-20260608-01', sev: 'high', status: 'fixed-aaa1111' },
      ]),
      section('20260608T110000000Z-a', [
        { heading: 'Just a low', id: 'AUDIT-20260608-02', sev: 'low' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 'a');
      expect(open).toBe(true); // one genuinely-pristine run → OPEN
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
