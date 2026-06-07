// T010 [US2] — cross-model agreement is HIGH-confidence + triaged. Exercises the
// REAL composed verb chain (dw-lifecycle audit-barrage-lift) the govern-spec.sh
// script calls: given a run-dir with the same root cause flagged by two model
// families, the lift produces a merged finding annotated `(m-NN + m-MM;
// cross-model)` with a disposition slot in audit-log.md. We COMPOSE the verb, we
// do not reimplement it (FR-006).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function findingBlock(model: string, nn: string, heading: string, surface: string, sev = 'high'): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    `Severity:   ${sev}`,
    `Surface:    ${surface}`,
    '',
    `Body for ${model}-${nn}.`,
    '',
  ].join('\n');
}

function makeRepoWithRun(
  slug: string,
  runDirName: string,
  modelFiles: Record<string, string>,
  auditLog = '# Audit Log\n',
): { repo: string; runDir: string; auditLogPath: string } {
  const repo = mkdtempSync(join(tmpdir(), 'xmodel-lift-'));
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  const auditLogPath = join(featureDir, 'audit-log.md');
  writeFileSync(auditLogPath, auditLog, 'utf8');
  const runDir = join(repo, '.dw-lifecycle', 'scope-discovery', 'audit-runs', runDirName);
  mkdirSync(runDir, { recursive: true });
  for (const [name, content] of Object.entries(modelFiles)) {
    writeFileSync(join(runDir, name), content, 'utf8');
  }
  return { repo, runDir, auditLogPath };
}

function lift(repo: string, slug: string, runDir: string) {
  return spawnSync(
    'dw-lifecycle',
    ['audit-barrage-lift', '--feature', slug, '--run-dir', runDir, '--repo-root', repo, '--date', '20260606', '--apply'],
    { encoding: 'utf8' },
  );
}

describe('cross-model lift composition (T010 / US2)', () => {
  it('merges a shared root cause from two model families into one cross-model HIGH finding', () => {
    const heading = 'Race condition in the dispatch path';
    const { repo, runDir, auditLogPath } = makeRepoWithRun('xm', '20260606T120000000Z-xm', {
      'claude.md': findingBlock('claude', '02', heading, 'src/dispatch.ts:42'),
      'codex.md': findingBlock('codex', '05', heading, 'src/dispatch.ts:48'),
    });
    try {
      const r = lift(repo, 'xm', runDir);
      expect(r.status).toBe(0);
      const written = readFileSync(auditLogPath, 'utf8');
      // Cross-model agreement annotation on the merged Finding-ID (HIGH confidence, SC-002).
      expect(written).toMatch(/Finding-ID:\s*AUDIT-20260606-\d+\s*\(claude-02 \+ codex-05; cross-model\)/);
      // A disposition slot (Status) is present and open — triageable.
      expect(written).toMatch(/Status:\s*open/);
      // The lift appended a dated barrage section (one triage surface, R6).
      expect(written).toMatch(/^##\s+2026-06-06\s+—\s+audit-barrage\s+lift\s+\(/m);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a single-model finding is NOT annotated cross-model (distinguishable from agreement)', () => {
    const { repo, runDir, auditLogPath } = makeRepoWithRun('sm', '20260606T120000000Z-sm', {
      'claude.md': findingBlock('claude', '01', 'Only claude saw this one', 'src/solo.ts:10'),
    });
    try {
      const r = lift(repo, 'sm', runDir);
      expect(r.status).toBe(0);
      const written = readFileSync(auditLogPath, 'utf8');
      expect(written).not.toMatch(/cross-model/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
