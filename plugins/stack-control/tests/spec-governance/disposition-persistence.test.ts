// T026 [US2] — disposition persistence (SC-004 / analyze C1): a disposition set
// in barrage run N is PRESERVED across a subsequent revision's run N+1, and the
// later run distinguishes still-open from already-dispositioned findings (the
// reused finding state machine, end-to-end). The lift verb writes additively
// (prior content verbatim); the gate counts only OPEN findings, so a prior
// acknowledged HIGH neither vanishes from the record nor re-blocks graduation.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

const PRIOR_LOG = [
  '# Audit Log — disp',
  '',
  '## 2026-06-05 — audit-barrage lift (20260605T100000000Z-disp)',
  '',
  '### A high the operator acknowledged last revision',
  '',
  'Finding-ID: AUDIT-20260605-01',
  'Status:     acknowledged-operator-accepts-residual',
  'Severity:   high',
  'Surface:    src/spec.md:1',
  '',
  'Operator accepted this residual in revision N.',
  '',
].join('\n');

function findingBlock(model: string, nn: string, heading: string, surface: string, sev = 'low'): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    `Severity:   ${sev}`,
    `Surface:    ${surface}`,
    '',
    'Body.',
    '',
  ].join('\n');
}

describe('disposition persistence across revisions (T026 / SC-004)', () => {
  it('preserves a prior acknowledged finding AND does not let it re-block (only open counts)', () => {
    const slug = 'disp';
    const repo = mkdtempSync(join(tmpdir(), 'disp-persist-'));
    const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
    mkdirSync(featureDir, { recursive: true });
    const auditLogPath = join(featureDir, 'audit-log.md');
    writeFileSync(auditLogPath, PRIOR_LOG, 'utf8');

    const runDir = join(repo, '.dw-lifecycle', 'scope-discovery', 'audit-runs', '20260606T100000000Z-disp');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'claude.md'),
      findingBlock('claude', '01', 'A minor nit in revision N+1', 'src/spec.md:9'),
      'utf8',
    );

    try {
      // Revision N+1 lift (additive) via stack-control's OWN verb (vendored).
      const lift = runCli([
        'audit-barrage-lift',
        '--feature',
        slug,
        '--run-dir',
        runDir,
        '--repo-root',
        repo,
        '--date',
        '20260606',
        '--apply',
      ]);
      expect(lift.status).toBe(0);

      const written = readFileSync(auditLogPath, 'utf8');
      // (1) the prior disposition survives verbatim — not clobbered by the new run.
      expect(written).toContain('Status:     acknowledged-operator-accepts-residual');
      expect(written).toContain('AUDIT-20260605-01');
      // (2) the new section was appended.
      expect(written).toMatch(/^##\s+2026-06-06\s+—\s+audit-barrage\s+lift\s+\(/m);

      // (3) the latest run is genuinely pristine (low only), so branch (a)
      // engages and the gate is OPEN — the prior acknowledged HIGH (an earlier
      // run, not in the recent window) has no bearing (#432). The gate prints
      // ONLY the boolean; exit code is execution status.
      const r = runCli(['spec-governance-gate', '--feature', slug, '--repo-root', repo]);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('true');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
