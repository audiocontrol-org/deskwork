// #432 (operator directive 2026-06-08): "The number of open issues has no
// bearing on the gate." The gate decision is PURELY the FR-010 dampener over
// what the recent run(s) SURFACED — branch (a) one pristine run, or branch (b)
// two consecutive 0-HIGH runs. There is NO cross-run union of open findings.
//
// This REVERSES the prior AUDIT-20260607-45 union gate: an earlier open HIGH
// that the recent runs did NOT re-surface no longer blocks graduation —
// detection is the barrage's job (FR-010), not a standing open-finding tally.
// A HIGH still BLOCKS while it is in the recent dampener window (the run that
// surfaced it is recent), because the window counts RAW-surfaced severity.
//
// The gate prints ONLY `true` (OPEN) / `false` (BLOCKED) on stdout; the exit
// code is execution status (0 evaluated, 2 fatal), never policy.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

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
  return `## 2026-06-07 — audit-barrage lift (${runId})\n\n${blocks}\n`;
}

function makeRepo(slug: string, sections: string[]): string {
  const repo = mkdtempSync(join(tmpdir(), 'gate-nobearing-'));
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  const auditLog = `# Audit Log — ${slug}\n\n${sections.join('\n')}`;
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  return repo;
}

function gate(repo: string, slug: string, extra: string[] = []) {
  const r = runCli(['spec-governance-gate', '--feature', slug, '--repo-root', repo, ...extra]);
  const out = r.stdout.trim();
  const open = out === 'true' ? true : out === 'false' ? false : undefined;
  return { status: r.status, open };
}

describe('open issues have no bearing on the gate (#432)', () => {
  it('an earlier OPEN HIGH the last two runs did not re-surface does NOT block → OPEN', () => {
    // R3 carries an open HIGH; R4 + R5 each surfaced 0 HIGH. The recent window
    // (R5, R4) is clean → branch (b) engages → gate OPEN. The stale open HIGH in
    // R3 has no bearing (reverses AUDIT-20260607-45).
    const repo = makeRepo('feat', [
      section('20260607T100000000Z-feat', [
        { heading: 'Early low', id: 'AUDIT-20260607-01', sev: 'low' },
      ]),
      section('20260607T110000000Z-feat', [
        { heading: 'Another low', id: 'AUDIT-20260607-02', sev: 'low' },
      ]),
      section('20260607T120000000Z-feat', [
        { heading: 'A contradiction', id: 'AUDIT-20260607-03', sev: 'high', status: 'open' },
      ]),
      section('20260607T130000000Z-feat', [
        { heading: 'Run four is clean', id: 'AUDIT-20260607-04', sev: 'low' },
      ]),
      section('20260607T140000000Z-feat', [
        { heading: 'Run five is clean', id: 'AUDIT-20260607-05', sev: 'low' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 'feat');
      expect(open).toBe(true);
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a HIGH in the MOST-RECENT run blocks (the dampener window counts raw-surfaced) → BLOCKED', () => {
    const repo = makeRepo('feat', [
      section('20260607T130000000Z-feat', [
        { heading: 'Clean', id: 'AUDIT-20260607-04', sev: 'low' },
      ]),
      section('20260607T140000000Z-feat', [
        { heading: 'A fresh HIGH', id: 'AUDIT-20260607-05', sev: 'high', status: 'open' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 'feat');
      expect(open).toBe(false);
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('branch (b) needs BOTH recent runs 0-HIGH: a HIGH one run back + a non-pristine latest → BLOCKED', () => {
    // The latest run carries a MED (not pristine → branch (a) cannot fire), and
    // the run before it surfaced a HIGH → branch (b)'s two-run window is broken.
    const repo = makeRepo('feat', [
      section('20260607T130000000Z-feat', [
        { heading: 'HIGH one run back', id: 'AUDIT-20260607-04', sev: 'high', status: 'open' },
      ]),
      section('20260607T140000000Z-feat', [
        { heading: 'Latest has a med', id: 'AUDIT-20260607-05', sev: 'medium' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 'feat');
      expect(open).toBe(false);
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('per-checkpoint scoping still holds: after_clarify clean → OPEN; after_plan recent HIGH → BLOCKED', () => {
    const sections = [
      section('20260607T100000000Z-feat-after_clarify', [
        { heading: 'Clarify clean one', id: 'AUDIT-20260607-01', sev: 'low' },
      ]),
      section('20260607T110000000Z-feat-after_clarify', [
        { heading: 'Clarify clean two', id: 'AUDIT-20260607-02', sev: 'low' },
      ]),
      section('20260607T120000000Z-feat-after_plan', [
        { heading: 'Plan-phase HIGH', id: 'AUDIT-20260607-03', sev: 'high', status: 'open' },
      ]),
    ];
    const repo = makeRepo('feat', sections);
    try {
      const clarify = gate(repo, 'feat', ['--checkpoint', 'after_clarify']);
      expect(clarify.open).toBe(true);
      expect(clarify.status).toBe(0);

      const plan = gate(repo, 'feat', ['--checkpoint', 'after_plan']);
      expect(plan.open).toBe(false);
      expect(plan.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
