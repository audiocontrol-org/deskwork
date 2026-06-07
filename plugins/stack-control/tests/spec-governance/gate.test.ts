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

function gate(repo: string, slug: string, extra: string[] = []) {
  const r = runCli([
    'spec-governance-gate',
    '--feature',
    slug,
    '--repo-root',
    repo,
    '--json',
    ...extra,
  ]);
  let verdict: Record<string, unknown> | undefined;
  try {
    verdict = JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    verdict = undefined;
  }
  return { status: r.status, verdict, stdout: r.stdout, stderr: r.stderr };
}

describe('spec-governance-gate (T015 / convergence-gate.md #1–#6)', () => {
  it('#1 latest run 0 HIGH + 0 MED → converged, single-run-clean, exit 0', () => {
    const repo = makeRepo('s1', [
      section('20260606T100000000Z-s1', [
        { heading: 'A low nit only', id: 'AUDIT-20260606-01', sev: 'low' },
      ]),
    ]);
    try {
      const { status, verdict } = gate(repo, 's1');
      expect(status).toBe(0);
      expect(verdict?.state).toBe('converged');
      expect(verdict?.rule).toBe('single-run-clean');
      expect(verdict?.openHigh).toBe(0);
      expect(verdict?.openMedium).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#2 two consecutive 0-HIGH runs (latest has a MED) → converged, n-consecutive-quiet, exit 0', () => {
    const repo = makeRepo('s2', [
      section('20260606T100000000Z-s2', [
        { heading: 'Earlier low only', id: 'AUDIT-20260606-01', sev: 'low' },
      ]),
      section('20260606T110000000Z-s2', [
        { heading: 'Latest has a medium', id: 'AUDIT-20260606-02', sev: 'medium' },
      ]),
    ]);
    try {
      const { status, verdict } = gate(repo, 's2');
      expect(status).toBe(0);
      expect(verdict?.state).toBe('converged');
      expect(verdict?.rule).toBe('n-consecutive-quiet');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#3 latest run ≥1 open HIGH, iterations < ceiling → blocked, exit 1', () => {
    const repo = makeRepo('s3', [
      section('20260606T100000000Z-s3', [
        { heading: 'A real contradiction', id: 'AUDIT-20260606-01', sev: 'high' },
      ]),
    ]);
    try {
      const { status, verdict } = gate(repo, 's3');
      expect(status).toBe(1);
      expect(verdict?.state).toBe('blocked');
      expect(verdict?.openHigh).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#4 iterations >= ceiling without convergence → non-converged, exit 1', () => {
    const repo = makeRepo('s4', [
      section('20260606T100000000Z-s4', [
        { heading: 'Still high', id: 'AUDIT-20260606-01', sev: 'high' },
      ]),
    ]);
    try {
      const { status, verdict } = gate(repo, 's4', ['--ceiling', '1']);
      expect(status).toBe(1);
      expect(verdict?.state).toBe('non-converged');
      expect(verdict?.ceiling).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#5 --override on a blocked state → overridden, reason recorded, exit 0', () => {
    const repo = makeRepo('s5', [
      section('20260606T100000000Z-s5', [
        { heading: 'A real contradiction', id: 'AUDIT-20260606-01', sev: 'high' },
      ]),
    ]);
    try {
      const { status, verdict } = gate(repo, 's5', [
        '--override',
        'operator accepts residual finding for reason Y',
      ]);
      expect(status).toBe(0);
      expect(verdict?.state).toBe('overridden');
      const override = verdict?.override as { recorded?: boolean; reason?: string } | undefined;
      expect(override?.recorded).toBe(true);
      expect(override?.reason).toMatch(/reason Y/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('#6 missing audit-log / absent feature → exit 2, no verdict, no governed claim', () => {
    const repo = mkdtempSync(join(tmpdir(), 'gate-test-empty-'));
    try {
      const { status } = gate(repo, 'does-not-exist');
      expect(status).toBe(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('dispositioned (non-open) HIGH findings do not block — only OPEN HIGH counts', () => {
    const repo = makeRepo('s7', [
      section('20260606T100000000Z-s7', [
        {
          heading: 'A fixed high',
          id: 'AUDIT-20260606-01',
          sev: 'high',
          status: 'fixed-abc1234',
        },
      ]),
    ]);
    try {
      const { status, verdict } = gate(repo, 's7');
      expect(status).toBe(0);
      expect(verdict?.state).toBe('converged');
      expect(verdict?.openHigh).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
