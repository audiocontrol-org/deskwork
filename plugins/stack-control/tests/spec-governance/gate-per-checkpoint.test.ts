// AUDIT-20260607-05 — independent per-checkpoint convergence loops. The gate's
// --checkpoint <name> filter scopes convergence + iteration counting to the runs
// for that checkpoint only, so a passed after_clarify gate is durable and is NOT
// re-opened by after_plan findings (FR-011/FR-014). Runs are tagged by a
// checkpoint suffix on the run-dir basename in the lift section header.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

// runId carries the checkpoint suffix the gate filters on (mirrors a run-dir
// basename `<ts>-<slug>-<checkpoint>`).
function section(runId: string, sev: 'high' | 'medium' | 'low'): string {
  return (
    `## 2026-06-07 — audit-barrage lift (${runId})\n\n` +
    `### Finding in ${runId}\n\n` +
    `Finding-ID: AUDIT-20260607-01\nStatus:     open\nSeverity:   ${sev}\n` +
    `Surface:    spec.md:1\n\nBody.\n`
  );
}

function makeRepo(slug: string, sections: string[]): string {
  const repo = mkdtempSync(join(tmpdir(), 'gate-cp-'));
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log\n\n${sections.join('\n')}`, 'utf8');
  return repo;
}

// The gate prints ONLY `true` (OPEN) / `false` (BLOCKED) on stdout (#432); the
// exit code is execution status (0 evaluated, 2 fatal), never policy.
function gate(repo: string, slug: string, extra: string[]) {
  const r = runCli(['spec-governance-gate', '--feature', slug, '--repo-root', repo, ...extra]);
  const out = r.stdout.trim();
  const open = out === 'true' ? true : out === 'false' ? false : undefined;
  return { status: r.status, open };
}

describe('per-checkpoint convergence scoping (AUDIT-20260607-05)', () => {
  // Two clean after_clarify runs; one after_plan run with an open HIGH.
  const sections = [
    section('20260607T100000000Z-feat-after_clarify', 'low'),
    section('20260607T110000000Z-feat-after_clarify', 'low'),
    section('20260607T120000000Z-feat-after_plan', 'high'),
  ];

  it('--checkpoint after_clarify sees ONLY clarify runs → OPEN (durable past the plan HIGH)', () => {
    const repo = makeRepo('feat', sections);
    try {
      const { status, open } = gate(repo, 'feat', ['--checkpoint', 'after_clarify']);
      expect(status).toBe(0);
      expect(open).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('--checkpoint after_plan sees ONLY the plan run → BLOCKED on its surfaced HIGH', () => {
    const repo = makeRepo('feat', sections);
    try {
      const { status, open } = gate(repo, 'feat', ['--checkpoint', 'after_plan']);
      expect(status).toBe(0);
      expect(open).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('no --checkpoint = global (back-compat): most-recent run surfaced the plan HIGH → BLOCKED', () => {
    const repo = makeRepo('feat', sections);
    try {
      const { status, open } = gate(repo, 'feat', []);
      expect(status).toBe(0);
      expect(open).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
