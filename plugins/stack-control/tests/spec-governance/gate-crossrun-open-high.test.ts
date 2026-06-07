// AUDIT-20260607-45 (cross-model HIGH — claude + codex). The gate's BLOCKING
// open-set must be the checkpoint-wide UNION of un-dispositioned HIGH/BLOCKING
// findings across ALL recorded runs — not only the most-recent run's.
//
// The contradiction the resolution fixes: a HIGH recorded `open` in run N, then
// stochastically NOT re-flagged in later runs, used to let the gate graduate
// (most-recent-run clean / two-consecutive clean) while run N's HIGH was still
// `open`. SC-006 promises absolutely: once a contradiction is surfaced as an
// open HIGH/BLOCKING finding, the gate does NOT graduate until that finding is
// dispositioned. This test pins that absolute promise.
//
// The union is a LITERAL `Status:`-line scan across lift sections (the reused
// audit-log finding parser) — NOT a similarity / cross-run matching heuristic.
// The consecutive-0-HIGH dampener VERDICT stays per-run; only the blocking
// open-set is unioned.

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
  const repo = mkdtempSync(join(tmpdir(), 'gate-crossrun-'));
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

describe('gate blocking open-set is the checkpoint-wide union (AUDIT-20260607-45)', () => {
  // Run 3 records an open HIGH. Runs 4 + 5 are fully clean (0 HIGH, 0 MED).
  // Most-recent-run / two-consecutive logic would graduate; the prior-run HIGH
  // is still un-dispositioned, so the gate MUST block.
  function priorHighThenCleanSections(highStatus: string): string[] {
    return [
      section('20260607T100000000Z-feat', [
        { heading: 'Early low', id: 'AUDIT-20260607-01', sev: 'low' },
      ]),
      section('20260607T110000000Z-feat', [
        { heading: 'Another low', id: 'AUDIT-20260607-02', sev: 'low' },
      ]),
      section('20260607T120000000Z-feat', [
        {
          heading: 'A seeded contradiction',
          id: 'AUDIT-20260607-03',
          sev: 'high',
          status: highStatus,
        },
      ]),
      section('20260607T130000000Z-feat', [
        { heading: 'Run four is clean', id: 'AUDIT-20260607-04', sev: 'low' },
      ]),
      section('20260607T140000000Z-feat', [
        { heading: 'Run five is clean', id: 'AUDIT-20260607-05', sev: 'low' },
      ]),
    ];
  }

  it('blocks: prior-run open HIGH + later clean runs → NOT converged (SC-006 absolute)', () => {
    const repo = makeRepo('feat', priorHighThenCleanSections('open'));
    try {
      // A high ceiling keeps this fixture (5 recorded runs) below the ceiling so
      // the refusal is the `blocked` (open-HIGH) state specifically, not the
      // ceiling-driven `non-converged` state — both refuse graduation (exit 1).
      const { status, verdict } = gate(repo, 'feat', ['--ceiling', '20']);
      expect(verdict?.state).not.toBe('converged');
      expect(verdict?.state).toBe('blocked');
      expect(verdict?.openHigh).toBe(1);
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('refuses graduation regardless of ceiling: prior open HIGH never graduates at default ceiling', () => {
    const repo = makeRepo('feat', priorHighThenCleanSections('open'));
    try {
      const { status, verdict } = gate(repo, 'feat');
      expect(verdict?.state).not.toBe('converged');
      expect(verdict?.openHigh).toBe(1);
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('graduates once the prior HIGH is dispositioned fixed-<sha>', () => {
    const repo = makeRepo('feat', priorHighThenCleanSections('fixed-abc1234'));
    try {
      const { status, verdict } = gate(repo, 'feat');
      expect(verdict?.state).toBe('converged');
      expect(verdict?.openHigh).toBe(0);
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('graduates once the prior HIGH is acknowledged', () => {
    const repo = makeRepo(
      'feat',
      priorHighThenCleanSections('acknowledged-operator-accepts-residual'),
    );
    try {
      const { status, verdict } = gate(repo, 'feat');
      expect(verdict?.state).toBe('converged');
      expect(verdict?.openHigh).toBe(0);
      expect(status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('blocking open-set is BLOCKING severity too, not just high', () => {
    const sections = [
      section('20260607T100000000Z-feat', [
        {
          heading: 'A blocking contradiction',
          id: 'AUDIT-20260607-01',
          sev: 'blocking',
          status: 'open',
        },
      ]),
      section('20260607T130000000Z-feat', [
        { heading: 'Clean', id: 'AUDIT-20260607-04', sev: 'low' },
      ]),
      section('20260607T140000000Z-feat', [
        { heading: 'Clean again', id: 'AUDIT-20260607-05', sev: 'low' },
      ]),
    ];
    const repo = makeRepo('feat', sections);
    try {
      const { status, verdict } = gate(repo, 'feat');
      expect(verdict?.state).toBe('blocked');
      expect(verdict?.openHigh).toBe(1);
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('union respects --checkpoint scoping: a prior HIGH in ANOTHER checkpoint does not block this one', () => {
    // after_plan run carries an open HIGH; after_clarify runs are all clean.
    const sections = [
      section('20260607T100000000Z-feat-after_clarify', [
        { heading: 'Clarify clean one', id: 'AUDIT-20260607-01', sev: 'low' },
      ]),
      section('20260607T110000000Z-feat-after_clarify', [
        { heading: 'Clarify clean two', id: 'AUDIT-20260607-02', sev: 'low' },
      ]),
      section('20260607T120000000Z-feat-after_plan', [
        {
          heading: 'Plan-phase open HIGH',
          id: 'AUDIT-20260607-03',
          sev: 'high',
          status: 'open',
        },
      ]),
    ];
    const repo = makeRepo('feat', sections);
    try {
      const clarify = gate(repo, 'feat', ['--checkpoint', 'after_clarify']);
      expect(clarify.verdict?.state).toBe('converged');
      expect(clarify.verdict?.openHigh).toBe(0);
      expect(clarify.status).toBe(0);

      const plan = gate(repo, 'feat', ['--checkpoint', 'after_plan']);
      expect(plan.verdict?.state).toBe('blocked');
      expect(plan.verdict?.openHigh).toBe(1);
      expect(plan.status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
