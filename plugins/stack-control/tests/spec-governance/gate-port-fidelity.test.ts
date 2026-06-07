// T016 — port fidelity (convergence-gate.md assertion #7): the gate verdict's
// converged/blocked decision MUST match dw-lifecycle's check-barrage-dampener
// engage decision on identical input. The criterion is the SAME function
// (ported, not hand-retyped) — this test fails the moment someone re-derives it.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
// Vendored in-package (multi/migrate-audit-barrage) — no dw-lifecycle dependency.
import { checkBarrageDampener } from '../../src/scope-discovery/promote-findings/check-barrage-dampener.js';

function section(runId: string, sev: string, status = 'open'): string {
  return (
    `## 2026-06-06 — audit-barrage lift (${runId})\n\n` +
    `### Finding heading for ${runId}\n\n` +
    `Finding-ID: AUDIT-20260606-01\n` +
    `Status:     ${status}\n` +
    `Severity:   ${sev}\n` +
    `Surface:    fixtures/spec.md:1\n\n` +
    `Body.\n`
  );
}

function makeRepo(slug: string, auditLogBody: string): { repo: string; auditLog: string } {
  const repo = mkdtempSync(join(tmpdir(), 'gate-fidelity-'));
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  const auditLog = `# Audit Log — ${slug}\n\n${auditLogBody}`;
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  return { repo, auditLog };
}

function gateConverged(repo: string, slug: string): boolean {
  const r = runCli(['spec-governance-gate', '--feature', slug, '--repo-root', repo, '--json']);
  const verdict = JSON.parse(r.stdout) as { state?: string };
  // converged OR overridden both mean "may graduate"; with no --override the
  // gate's "may graduate without override" is exactly convergence.
  return verdict.state === 'converged';
}

describe('spec-governance-gate port fidelity (T016 / assertion #7)', () => {
  const cases: Array<{ name: string; body: string }> = [
    { name: 'single clean run (0 HIGH + 0 MED)', body: section('r1', 'low') },
    {
      name: 'two consecutive 0-HIGH (latest MED)',
      body: `${section('r1', 'low')}\n${section('r2', 'medium')}`,
    },
    { name: 'latest run has an open HIGH', body: section('r1', 'high') },
    {
      name: 'older HIGH then a single quiet run (not yet 2-consecutive)',
      body: `${section('r1', 'high')}\n${section('r2', 'medium')}`,
    },
  ];

  for (const c of cases) {
    it(`gate.converged === dampener.dampened — ${c.name}`, () => {
      const { repo, auditLog } = makeRepo('fid', c.body);
      try {
        const dampened = checkBarrageDampener({ auditLogText: auditLog, threshold: 2 }).dampened;
        expect(gateConverged(repo, 'fid')).toBe(dampened);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });
  }
});
