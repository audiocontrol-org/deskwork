// T030 (RED-first, 029 Phase 5 US5) — per-phase payload = union of the phase's
// changed files across ALL its commits, with the diff-base resolved to the
// PRE-PHASE commit (not HEAD~1). FR-020, TASK-263.
//
// The failure this pins (TASK-263 "the diff omits the fix"): a phase whose impl
// and test land in SEPARATE commits, governed with the default `HEAD~1` base,
// only audits the LAST commit — the auditor then falsely flags the impl as
// missing. The fix resolves the base to the pre-phase commit (the governed HEAD
// of the latest prior phase — each phase boundary commits before the next phase's
// work starts), so `git diff <base> -- <phase files>` is the UNION of the phase's
// commits.
//
// On-disk git fixtures only (mkdtempSync + real `git init`/commits) — no fs
// mocking, per .claude/rules/testing.md.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePrePhaseDiffBase } from '../../src/govern/incremental-audit.js';
import {
  writePhaseCheckpoint,
  readPhaseCheckpoint,
  type PhaseCheckpointRecord,
} from '../../src/govern/checkpoint-state.js';

function git(repo: string, ...args: string[]): { status: number; stdout: string } {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: typeof r.stdout === 'string' ? r.stdout.trim() : '' };
}

function commitAll(repo: string, message: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync(
    'git',
    [
      '-C', repo,
      '-c', 'user.email=t@t',
      '-c', 'user.name=t',
      '-c', 'commit.gpgsign=false',
      'commit', '-q', '--no-gpg-sign', '-m', message,
    ],
    { encoding: 'utf8' },
  );
}

function head(repo: string): string {
  return git(repo, 'rev-parse', 'HEAD').stdout;
}

function setupRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'payload-union-'));
  git(repo, 'init', '-q');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'tests'), { recursive: true });
  // Pre-phase tree: the phase's files do not yet exist.
  writeFileSync(join(repo, 'README.md'), 'seed\n');
  commitAll(repo, 'chore: seed (pre-phase)');
  return repo;
}

describe('US5 FR-020 — per-phase payload unions all the phase\'s commits', () => {
  it('resolves the diff-base to the prior phase\'s governed commit, not HEAD~1', () => {
    const repo = setupRepo();
    try {
      // The latest prior phase ("4") was governed at the seed commit — that is
      // the pre-phase commit for phase "5".
      const prePhaseSha = head(repo);

      // Phase 5's work lands across TWO commits: impl first, then test.
      writeFileSync(join(repo, 'src/feature.ts'), 'export const answer = 42;\n');
      commitAll(repo, 'feat(029): US5 impl');
      writeFileSync(join(repo, 'tests/feature.test.ts'), 'import "../src/feature.js";\n');
      commitAll(repo, 'test(029): US5 test');

      const base = resolvePrePhaseDiffBase({
        phaseId: '5',
        orderedPhaseIds: ['1', '2', '3', '4', '5'],
        governedShaByPhase: new Map<string, string | undefined>([['4', prePhaseSha]]),
        fallbackBase: 'HEAD~1',
      });

      expect(base).toBe(prePhaseSha);

      // The union contract: diffing against the pre-phase base shows BOTH the
      // impl commit and the test commit; diffing against HEAD~1 shows only the
      // last commit (the under-scope that produced the TASK-263 false HIGH).
      const unionDiff = git(repo, 'diff', base, '--', 'src/feature.ts', 'tests/feature.test.ts').stdout;
      expect(unionDiff).toContain('src/feature.ts');
      expect(unionDiff).toContain('export const answer = 42;');
      expect(unionDiff).toContain('tests/feature.test.ts');

      const headMinus1Diff = git(repo, 'diff', 'HEAD~1', '--', 'src/feature.ts', 'tests/feature.test.ts').stdout;
      expect(headMinus1Diff).not.toContain('export const answer = 42;');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('falls back to fallbackBase when no prior phase recorded a governed commit (phase 1 / legacy)', () => {
    const base = resolvePrePhaseDiffBase({
      phaseId: '1',
      orderedPhaseIds: ['1', '2', '3'],
      governedShaByPhase: new Map<string, string | undefined>(),
      fallbackBase: 'HEAD~1',
    });
    expect(base).toBe('HEAD~1');
  });

  it('skips a prior phase with no recorded sha and uses the nearest earlier one', () => {
    const base = resolvePrePhaseDiffBase({
      phaseId: '5',
      orderedPhaseIds: ['1', '2', '3', '4', '5'],
      // phase 4 has no sha (legacy checkpoint); phase 3 does — use phase 3's.
      governedShaByPhase: new Map<string, string | undefined>([
        ['3', 'cafebabecafebabecafebabecafebabecafebabe'],
        ['4', undefined],
      ]),
      fallbackBase: 'HEAD~1',
    });
    expect(base).toBe('cafebabecafebabecafebabecafebabecafebabe');
  });

  it('persists and round-trips governedSha on the phase checkpoint record', () => {
    const repo = setupRepo();
    try {
      const sha = head(repo);
      const record: PhaseCheckpointRecord = {
        version: 1,
        featureSlug: 'demo',
        phaseId: '5',
        checkpoint: 'phase-5',
        auditLogSection: 'phase-5',
        scopeFingerprint: 'deadbeef',
        passedAt: '2026-06-20T00:00:00.000Z',
        governedPaths: ['src/feature.ts'],
        governedSha: sha,
      };
      writePhaseCheckpoint(repo, record);
      const read = readPhaseCheckpoint(repo, 'demo', '5');
      expect(read?.governedSha).toBe(sha);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
