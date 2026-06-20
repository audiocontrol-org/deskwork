/**
 * specs/029-govern-operability — Phase 4 / US4 (T023, RED → T024 GREEN).
 *
 * FR-016: lifted findings MUST be deduped across runs by
 * `findingSignature(heading, surface)` so convergence iterations do not multiply
 * near-duplicate tasks (≤1 entry per signature across N runs). A second lift of
 * the SAME finding (same signature, possibly a different reported line range)
 * must NOT append a second audit-log entry for that signature.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

const HEADING = 'race in the watchdog kill path';
const FILE = 'src/spawn-cli.ts';

function installation(): string {
  const repo = mkdtempSync(join(tmpdir(), 'lift-dedup-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  return repo;
}

function featureDir(repo: string, slug: string): string {
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  return dir;
}

/** A run-dir containing one model file reporting the finding at `surfaceLine`. */
function makeRunDir(repo: string, stamp: string, surfaceLine: string): string {
  const runDir = join(repo, '.stack-control', 'audit-runs', stamp);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'claude.md'),
    [
      `### ${HEADING}`,
      '',
      'Finding-ID: AUDIT-BARRAGE-claude-01',
      'Status: open',
      'Severity: medium',
      `Surface: ${FILE}:${surfaceLine}`,
      '',
      'The same race.',
      '',
    ].join('\n'),
    'utf8',
  );
  return runDir;
}

function countSignatureEntries(log: string): number {
  // Count `### ...race in the watchdog kill path` entry headings.
  const m = log.match(/^###[^\n]*race in the watchdog kill path/gim);
  return m === null ? 0 : m.length;
}

describe('FR-016: lift dedups a finding across runs by signature (US4, T023)', () => {
  it('the SAME finding lifted across 2 runs produces ≤1 audit-log entry for its signature', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    // Run 1: reports the finding at one line.
    const run1 = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89');
    // Run 2: the SAME finding, a different line range (same signature).
    const run2 = makeRunDir(repo, '20260620T110000000Z-feat-after_clarify', '90-92');
    try {
      const r1 = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run1,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r1.status).toBe(0);
      expect(countSignatureEntries(readFileSync(log, 'utf8'))).toBe(1);

      const r2 = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run2,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r2.status).toBe(0);
      // The second lift must NOT add a second entry for the same signature.
      expect(countSignatureEntries(readFileSync(log, 'utf8'))).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
