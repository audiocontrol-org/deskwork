// T040 (RED-first, 029 Phase 7 US7) — hunk-granularity, content-presence checkpoint
// freshness (FR-026/027/028, TASK-289).
//
// The per-phase checkpoint records the phase's OWN changed line-blocks (post-image
// content-hash + line-count). Freshness then checks each stored block still appears as
// consecutive lines somewhere in the CURRENT governed file — WITHOUT a diff-base. So:
//   - FR-026: a later phase editing a DIFFERENT region of a shared file leaves the
//     earlier phase's blocks present → earlier checkpoint stays FRESH.
//   - FR-027: a later phase editing the SAME region the earlier phase owned makes a
//     block absent → earlier checkpoint goes STALE.
//   - FR-028: governing phase K only fingerprints phase K's own hunks → O(n).
//
// On-disk git fixtures only (mkdtempSync + real `git init`/commits) — no fs mocking,
// per .claude/rules/testing.md.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computePhaseHunkBlocks,
  isCheckpointFreshHunks,
  writePhaseCheckpoint,
  computeScopeFingerprint,
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
      '-C',
      repo,
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '--no-gpg-sign',
      '-m',
      message,
    ],
    { encoding: 'utf8' },
  );
}

function head(repo: string): string {
  return git(repo, 'rev-parse', 'HEAD').stdout;
}

/** A file with N numbered lines. */
function numbered(prefix: string, count: number): string {
  return `${Array.from({ length: count }, (_, i) => `${prefix}-line-${i}`).join('\n')}\n`;
}

function makeRepo(): { repo: string; file: string; rel: string } {
  const repo = mkdtempSync(join(tmpdir(), 'gov-hunk-'));
  mkdirSync(join(repo, 'src'), { recursive: true });
  const rel = 'src/shared.ts';
  const file = join(repo, rel);
  writeFileSync(file, numbered('base', 40), 'utf8');
  spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
  commitAll(repo, 'base');
  return { repo, file, rel };
}

describe('hunk-fingerprint checkpoint freshness (US7)', () => {
  it('FR-026: a later-phase edit to a DIFFERENT region keeps the earlier checkpoint fresh', () => {
    const { repo, rel } = makeRepo();
    try {
      const base = head(repo);
      // Phase A: change lines near the TOP.
      const lines = numbered('base', 40).split('\n');
      lines[2] = 'phaseA-top-changed';
      lines[3] = 'phaseA-top-changed-2';
      writeFileSync(join(repo, rel), `${lines.join('\n')}`, 'utf8');
      commitAll(repo, 'phase A top');

      const blocksA = computePhaseHunkBlocks(repo, [rel], base);
      expect(blocksA.length).toBeGreaterThan(0);
      writePhaseCheckpoint(repo, {
        version: 1,
        featureSlug: 'feat',
        phaseId: 'A',
        checkpoint: 'phase-A',
        auditLogSection: 'phase-A',
        scopeFingerprint: computeScopeFingerprint(repo, [rel]),
        passedAt: '2026-06-20T00:00:00.000Z',
        governedPaths: [rel],
        hunkBlocks: blocksA,
      });

      // Phase B: change lines near the BOTTOM (different region).
      const afterA = numbered('base', 40).split('\n');
      afterA[2] = 'phaseA-top-changed';
      afterA[3] = 'phaseA-top-changed-2';
      afterA[36] = 'phaseB-bottom-changed';
      afterA[37] = 'phaseB-bottom-changed-2';
      writeFileSync(join(repo, rel), `${afterA.join('\n')}`, 'utf8');
      commitAll(repo, 'phase B bottom');

      const recordA = {
        version: 1 as const,
        featureSlug: 'feat',
        phaseId: 'A',
        checkpoint: 'phase-A',
        auditLogSection: 'phase-A',
        scopeFingerprint: computeScopeFingerprint(repo, [rel]),
        passedAt: '2026-06-20T00:00:00.000Z',
        governedPaths: [rel],
        hunkBlocks: blocksA,
      };
      expect(isCheckpointFreshHunks(repo, recordA, 'phase-A')).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('FR-027: a later-phase edit to the SAME region stales the earlier checkpoint', () => {
    const { repo, rel } = makeRepo();
    try {
      const base = head(repo);
      const lines = numbered('base', 40).split('\n');
      lines[2] = 'phaseA-owned-line';
      lines[3] = 'phaseA-owned-line-2';
      writeFileSync(join(repo, rel), `${lines.join('\n')}`, 'utf8');
      commitAll(repo, 'phase A');

      const blocksA = computePhaseHunkBlocks(repo, [rel], base);
      expect(blocksA.length).toBeGreaterThan(0);

      // Phase B edits the SAME lines phase A introduced.
      const afterA = numbered('base', 40).split('\n');
      afterA[2] = 'phaseB-clobbered-A-line';
      afterA[3] = 'phaseB-clobbered-A-line-2';
      writeFileSync(join(repo, rel), `${afterA.join('\n')}`, 'utf8');
      commitAll(repo, 'phase B same region');

      const recordA = {
        version: 1 as const,
        featureSlug: 'feat',
        phaseId: 'A',
        checkpoint: 'phase-A',
        auditLogSection: 'phase-A',
        scopeFingerprint: computeScopeFingerprint(repo, [rel]),
        passedAt: '2026-06-20T00:00:00.000Z',
        governedPaths: [rel],
        hunkBlocks: blocksA,
      };
      expect(isCheckpointFreshHunks(repo, recordA, 'phase-A')).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('shift robustness: inserting lines ABOVE phase A leaves the checkpoint fresh', () => {
    const { repo, rel } = makeRepo();
    try {
      const base = head(repo);
      const lines = numbered('base', 40).split('\n');
      lines[20] = 'phaseA-mid-changed';
      lines[21] = 'phaseA-mid-changed-2';
      writeFileSync(join(repo, rel), `${lines.join('\n')}`, 'utf8');
      commitAll(repo, 'phase A mid');

      const blocksA = computePhaseHunkBlocks(repo, [rel], base);
      expect(blocksA.length).toBeGreaterThan(0);

      // Phase B inserts brand-new lines at the very top — shifts every line number
      // but phase A's content is untouched.
      const afterA = numbered('base', 40).split('\n');
      afterA[20] = 'phaseA-mid-changed';
      afterA[21] = 'phaseA-mid-changed-2';
      const shifted = ['phaseB-inserted-0', 'phaseB-inserted-1', ...afterA];
      writeFileSync(join(repo, rel), `${shifted.join('\n')}`, 'utf8');
      commitAll(repo, 'phase B insert above');

      const recordA = {
        version: 1 as const,
        featureSlug: 'feat',
        phaseId: 'A',
        checkpoint: 'phase-A',
        auditLogSection: 'phase-A',
        scopeFingerprint: computeScopeFingerprint(repo, [rel]),
        passedAt: '2026-06-20T00:00:00.000Z',
        governedPaths: [rel],
        hunkBlocks: blocksA,
      };
      expect(isCheckpointFreshHunks(repo, recordA, 'phase-A')).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('back-compat: a checkpoint without hunkBlocks falls back to whole-file behavior', () => {
    const { repo, rel } = makeRepo();
    try {
      // Old-format record: no hunkBlocks. Bound to the whole-file fingerprint.
      const oldRecord = {
        version: 1 as const,
        featureSlug: 'feat',
        phaseId: 'A',
        checkpoint: 'phase-A',
        auditLogSection: 'phase-A',
        scopeFingerprint: computeScopeFingerprint(repo, [rel]),
        passedAt: '2026-06-20T00:00:00.000Z',
        governedPaths: [rel],
      };
      // Unchanged file → fresh.
      expect(isCheckpointFreshHunks(repo, oldRecord, 'phase-A')).toBe(true);
      // Any whole-file change → stale.
      writeFileSync(join(repo, rel), `${numbered('base', 40)}extra-line\n`, 'utf8');
      expect(isCheckpointFreshHunks(repo, oldRecord, 'phase-A')).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('FR-028 (O(n)): N phases each editing a distinct region of one shared file stay all-fresh', () => {
    // O(n) property: governing phase K fingerprints only phase K's own hunks. Phase A's
    // block set is computed from phase A's diff-base alone — independent of B/C/... edits
    // to other regions. So after all N phases land (each in its own region), all N
    // checkpoints remain fresh: no phase re-stales another. The check is content-presence
    // per phase (a constant number of blocks), never a whole-feature re-diff → linear in N.
    const { repo, rel } = makeRepo();
    try {
      const phases = [
        { region: 4, tag: 'A' },
        { region: 14, tag: 'B' },
        { region: 24, tag: 'C' },
        { region: 34, tag: 'D' },
      ];
      const cumulative = numbered('base', 40).split('\n');
      const records: Array<{
        version: 1;
        featureSlug: string;
        phaseId: string;
        checkpoint: string;
        auditLogSection: string;
        scopeFingerprint: string;
        passedAt: string;
        governedPaths: readonly string[];
        hunkBlocks: ReturnType<typeof computePhaseHunkBlocks>;
      }> = [];

      for (const { region, tag } of phases) {
        const base = head(repo);
        cumulative[region] = `phase${tag}-region-changed`;
        writeFileSync(join(repo, rel), `${cumulative.join('\n')}`, 'utf8');
        commitAll(repo, `phase ${tag}`);
        const blocks = computePhaseHunkBlocks(repo, [rel], base);
        expect(blocks.length).toBeGreaterThan(0);
        records.push({
          version: 1,
          featureSlug: 'feat',
          phaseId: tag,
          checkpoint: `phase-${tag}`,
          auditLogSection: `phase-${tag}`,
          scopeFingerprint: computeScopeFingerprint(repo, [rel]),
          passedAt: '2026-06-20T00:00:00.000Z',
          governedPaths: [rel],
          hunkBlocks: blocks,
        });
      }

      // After ALL N phases landed, every earlier checkpoint is still fresh.
      for (const record of records) {
        expect(isCheckpointFreshHunks(repo, record, `phase-${record.phaseId}`)).toBe(true);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
