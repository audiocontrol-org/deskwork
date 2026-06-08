// T015 — convergence-gate verb (contracts/convergence-gate.md assertions #1–#6).
// Drives the real stackctl dispatcher (spec-governance-gate) against tmp
// audit-log trees and asserts the ConvergenceVerdict JSON + exit codes.

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
  return `## 2026-06-06 — audit-barrage lift (${runId})\n\n${blocks}\n`;
}

function makeRepo(slug: string, sections: string[]): string {
  const repo = mkdtempSync(join(tmpdir(), 'gate-test-'));
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  const auditLog = `# Audit Log — ${slug}\n\n${sections.join('\n')}`;
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  return repo;
}

// The gate prints ONLY `true` (OPEN) / `false` (BLOCKED) to stdout (#432); the
// exit code is execution status (0 = evaluated, 2 = fatal), NEVER policy.
function gate(repo: string, slug: string, extra: string[] = []) {
  const r = runCli(['spec-governance-gate', '--feature', slug, '--repo-root', repo, ...extra]);
  const out = r.stdout.trim();
  const open = out === 'true' ? true : out === 'false' ? false : undefined;
  return { status: r.status, open, stdout: r.stdout, stderr: r.stderr };
}

describe('spec-governance-gate (T015 / convergence-gate.md) — single-boolean contract (#432)', () => {
  it('#1 latest run surfaced 0 HIGH + 0 MED → OPEN (true), exit 0', () => {
    const repo = makeRepo('s1', [
      section('20260606T100000000Z-s1', [
        { heading: 'A low nit only', id: 'AUDIT-20260606-01', sev: 'low' },
      ]),
    ]);
    try {
      const { status, open, stdout } = gate(repo, 's1');
      expect(status).toBe(0);
      expect(open).toBe(true);
      expect(stdout.trim()).toBe('true'); // stdout is ONLY the boolean
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#2 two consecutive runs each surfaced 0 HIGH (latest has a MED) → OPEN (true), exit 0', () => {
    const repo = makeRepo('s2', [
      section('20260606T100000000Z-s2', [
        { heading: 'Earlier low only', id: 'AUDIT-20260606-01', sev: 'low' },
      ]),
      section('20260606T110000000Z-s2', [
        { heading: 'Latest has a medium', id: 'AUDIT-20260606-02', sev: 'medium' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 's2');
      expect(status).toBe(0);
      expect(open).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#3 latest run surfaced ≥1 HIGH → BLOCKED (false), exit 0 (exit is execution status, not policy)', () => {
    const repo = makeRepo('s3', [
      section('20260606T100000000Z-s3', [
        { heading: 'A real contradiction', id: 'AUDIT-20260606-01', sev: 'high' },
      ]),
    ]);
    try {
      const { status, open, stdout } = gate(repo, 's3');
      expect(status).toBe(0); // evaluated successfully — blocked is not an error
      expect(open).toBe(false);
      expect(stdout.trim()).toBe('false');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#4 --ceiling is accepted but no longer changes the decision (loop bounding moved to the loop driver)', () => {
    const repo = makeRepo('s4', [
      section('20260606T100000000Z-s4', [
        { heading: 'Still high', id: 'AUDIT-20260606-01', sev: 'high' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 's4', ['--ceiling', '1']);
      expect(status).toBe(0);
      expect(open).toBe(false); // same blocked decision regardless of ceiling
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#5 --override forces the gate OPEN (true) on an otherwise-blocked run, exit 0', () => {
    const repo = makeRepo('s5', [
      section('20260606T100000000Z-s5', [
        { heading: 'A real contradiction', id: 'AUDIT-20260606-01', sev: 'high' },
      ]),
    ]);
    try {
      const { status, open, stderr } = gate(repo, 's5', [
        '--override',
        'operator accepts residual finding for reason Y',
      ]);
      expect(status).toBe(0);
      expect(open).toBe(true);
      expect(stderr).toMatch(/reason Y/); // the mandatory reason is recorded (to stderr)
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#6 missing audit-log / absent feature → exit 2, NO decision on stdout (fail loud, no governed claim)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'gate-test-empty-'));
    try {
      const { status, open } = gate(repo, 'does-not-exist');
      expect(status).toBe(2);
      expect(open).toBeUndefined(); // no true/false printed
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a single run that surfaced a HIGH (now fixed) is NOT clean → BLOCKED (false) (#432 corrected behavior)', () => {
    // Was the bug-encoder: a fixed HIGH used to converge single-run-clean because
    // only OPEN findings were counted. Now the dampener counts RAW-surfaced
    // severity, so a run that surfaced a HIGH is not a 0-HIGH run.
    const repo = makeRepo('s7', [
      section('20260606T100000000Z-s7', [
        { heading: 'A fixed high', id: 'AUDIT-20260606-01', sev: 'high', status: 'fixed-abc1234' },
      ]),
    ]);
    try {
      const { status, open } = gate(repo, 's7');
      expect(status).toBe(0);
      expect(open).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
