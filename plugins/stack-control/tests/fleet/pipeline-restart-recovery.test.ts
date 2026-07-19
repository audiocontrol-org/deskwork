/**
 * specs/036-fleet-control-plane — AUDIT-20260718-07 (RED->GREEN), FR-040.
 *
 * `invocationSequence` (FR-040 — the sequence with DOMAIN ordering meaning)
 * MUST be durably recovered across a sidecar restart the same way
 * `installationSequence` already is. The pipeline tracks the per-invocation
 * counter in an in-process `Map` seeded EMPTY on every `createPipeline` call;
 * without recovery, a sidecar that restarts mid-invocation (idle-exit / crash
 * re-election — a normal occurrence for this feature) restarts the invocation's
 * numbering at 1, falling BELOW the sequences already applied on the plane. The
 * plane's no-regress guard (registry + ingest) then silently classifies every
 * post-restart event `stale` and drops it, while the sidecar sees a 200 OK and
 * believes it transmitted — breaking FR-040 at exactly the restart failure mode
 * this feature is built to survive.
 *
 * This suite simulates a restart with a BRAND-NEW pipeline over the SAME
 * walDir and proves the per-invocation counter CONTINUES from the recovered
 * high-water mark, per-invocationId, rather than regressing to 1.
 *
 * Real filesystem (real tmp dir, real WAL), never mocked. Injected redaction
 * context (the pipeline's DI seam) for determinism. No `any`/`as`/`@ts-ignore`.
 * Relative `.js` imports under node16 resolution.
 */

import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { RedactionContext } from '../../src/fleet/redact.js';

const FAKE_CTX: RedactionContext = {
  installationRoot: '/Users/testuser/work/project',
  homeDir: '/Users/testuser',
  username: 'testuser',
  hostname: 'test-host.local',
};

/**
 * AUDIT-20260718-44 test-only observability seam: wrap the REAL
 * `openWal`/`WalHandle.replay()` (real fs underneath, never mocked — the
 * project testing rule) to COUNT how many times `replay()` actually executes.
 * This is the directly-falsifiable signal for "recovery is not serialized":
 * `ensureSequencesRecovered()` is supposed to run the WAL replay AT MOST ONCE
 * per pipeline instance, no matter how many concurrent `receive()` calls race
 * it. `vi.mock` + `importOriginal` delegates every call to the real
 * implementation; only the call COUNT is observed.
 */
let replayCallCount = 0;

vi.mock('../../src/sidecar/spool/wal.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/sidecar/spool/wal.js')>();
  return {
    ...actual,
    openWal: async (dir: string) => {
      const handle = await actual.openWal(dir);
      return {
        ...handle,
        replay: async () => {
          replayCallCount += 1;
          return handle.replay();
        },
      };
    },
  };
});

const { createPipeline } = await import('../../src/sidecar/pipeline.js');

describe('pipeline invocationSequence recovery across restart (AUDIT-20260718-07, FR-040)', () => {
  it('a post-restart event for an in-flight invocation CONTINUES its sequence (does not regress to 1)', async () => {
    const walDir = mkdtempSync(join(tmpdir(), 'pipeline-restart-'));
    try {
      const invocationId = 'inv-restart-1';

      // --- pre-restart: pipeline instance #1 emits two events for the invocation.
      const p1 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const e1 = await p1.receive({
        installationId: 'inst-1',
        invocationId,
        runId: 'run-1',
        type: 'run.started',
        classification: 'durable',
        host: 'h',
        path: '/p',
        sessionId: null,
      });
      const e2 = await p1.receive({
        installationId: 'inst-1',
        invocationId,
        runId: 'run-1',
        type: 'run.progress',
        classification: 'durable',
        host: 'h',
        path: '/p',
        sessionId: null,
      });
      expect(e1.envelope.invocationSequence).toBe(1);
      expect(e2.envelope.invocationSequence).toBe(2);

      // --- RESTART: a brand-new pipeline over the SAME walDir (fresh process).
      const p2 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const e3 = await p2.receive({
        installationId: 'inst-1',
        invocationId,
        runId: 'run-1',
        type: 'run.completed',
        classification: 'durable',
        host: 'h',
        path: '/p',
        sessionId: null,
      });

      // Pre-fix: invocationSequences seeded empty -> e3 regresses to 1 (below the
      // plane's applied high-water mark -> silently dropped as stale). Post-fix:
      // recovered from the WAL -> continues at 3.
      expect(e3.envelope.invocationSequence).toBe(3);
      expect(e3.envelope.invocationSequence).toBeGreaterThan(e2.envelope.invocationSequence);
    } finally {
      rmSync(walDir, { recursive: true });
    }
  });

  it('recovers INDEPENDENT per-invocationId high-water marks (no cross-invocation bleed)', async () => {
    const walDir = mkdtempSync(join(tmpdir(), 'pipeline-restart-multi-'));
    try {
      const p1 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      // invA gets three events, invB gets one — interleaved.
      await p1.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.started', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      await p1.receive({ installationId: 'i', invocationId: 'invB', runId: null, type: 'run.started', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      await p1.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.progress', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      const a3 = await p1.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.progress', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      expect(a3.envelope.invocationSequence).toBe(3);

      // Restart.
      const p2 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const aNext = await p2.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.completed', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      const bNext = await p2.receive({ installationId: 'i', invocationId: 'invB', runId: null, type: 'run.completed', classification: 'durable', host: 'h', path: '/p', sessionId: null });

      // invA continues at 4 (its max was 3); invB continues at 2 (its max was 1).
      expect(aNext.envelope.invocationSequence).toBe(4);
      expect(bNext.envelope.invocationSequence).toBe(2);
    } finally {
      rmSync(walDir, { recursive: true });
    }
  });

  it('a NEW invocationId after restart still starts at 1 (recovery is scoped, not a flat bump)', async () => {
    const walDir = mkdtempSync(join(tmpdir(), 'pipeline-restart-new-'));
    try {
      const p1 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      await p1.receive({ installationId: 'i', invocationId: 'old-inv', runId: null, type: 'run.started', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      await p1.receive({ installationId: 'i', invocationId: 'old-inv', runId: null, type: 'run.progress', classification: 'durable', host: 'h', path: '/p', sessionId: null });

      const p2 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const fresh = await p2.receive({ installationId: 'i', invocationId: 'brand-new-inv', runId: null, type: 'run.started', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      expect(fresh.envelope.invocationSequence).toBe(1);
    } finally {
      rmSync(walDir, { recursive: true });
    }
  });
});

describe('pipeline sequence recovery is serialized under concurrent receive() (AUDIT-20260718-44, FR-039/040)', () => {
  it('N concurrent receive() calls on a fresh pipeline run WAL replay AT MOST ONCE, and every installationSequence/invocationSequence is distinct and continues from the recovered high-water', async () => {
    const walDir = mkdtempSync(join(tmpdir(), 'pipeline-recovery-race-'));
    try {
      // --- pre-seed the WAL from a PRIOR session (3 events), then drop that
      // pipeline — the next pipeline instance is genuinely "fresh"
      // (nextInstallationSequence === null) and must recover from disk, same
      // as a real restart.
      const seeder = createPipeline(walDir, { redactionContext: FAKE_CTX });
      await seeder.receive({ installationId: 'inst-1', invocationId: 'seed-inv', runId: null, type: 'run.started', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      await seeder.receive({ installationId: 'inst-1', invocationId: 'seed-inv', runId: null, type: 'run.progress', classification: 'durable', host: 'h', path: '/p', sessionId: null });
      await seeder.receive({ installationId: 'inst-1', invocationId: 'seed-inv', runId: null, type: 'run.progress', classification: 'durable', host: 'h', path: '/p', sessionId: null });

      // --- the fresh pipeline under test. nextInstallationSequence is still
      // null at this point — no receive() has run on THIS instance yet.
      const pipeline = createPipeline(walDir, { redactionContext: FAKE_CTX });
      replayCallCount = 0;

      // Fire N receive() calls CONCURRENTLY, all for the SAME invocationId, so
      // they race ensureSequencesRecovered() (module header, AUDIT-20260718-44):
      // every one of them observes nextInstallationSequence === null at the
      // moment it enters, so pre-fix every one of them independently re-runs
      // WAL replay (wasteful AND a latent correctness hazard — see the
      // replayCallCount assertion below, which is the falsifiable pre/post-fix
      // signal for THIS implementation; see the comment on the sequence
      // assertions for why they are not, by themselves, discriminating here).
      const N = 10;
      const invocationId = 'race-inv';
      const results = await Promise.all(
        Array.from({ length: N }, (_unused, i) =>
          pipeline.receive({
            installationId: 'inst-1',
            invocationId,
            runId: null,
            type: 'run.progress',
            classification: 'durable',
            host: 'h',
            path: '/p',
            sessionId: null,
          }),
        ),
      );

      // Recovery must run AT MOST ONCE per pipeline instance no matter how many
      // concurrent receive() calls raced the null nextInstallationSequence
      // window. This is AUDIT-20260718-44's literal described mechanism
      // ("BOTH await wal.replay()") made directly observable: PRE-FIX this is
      // N (one redundant replay per racing caller); POST-FIX (memoized
      // in-flight recovery promise) it is exactly 1.
      expect(replayCallCount).toBe(1);

      // installationSequence: every returned value is distinct and continues
      // from the recovered high-water mark (3 pre-seeded events -> next is 4).
      // NOTE: for THIS pipeline's fully-synchronous WAL implementation
      // (Promise.resolve()-wrapped sync fs calls), Node's microtask FIFO
      // ordering happens to keep same-closure concurrent callers from ever
      // observing a stale reset AFTER another caller has already taken a
      // value (verified via instrumented tracing during RED-test
      // development) — so this invariant does not, by itself, discriminate
      // pre/post-fix on this exact code path today. It is still asserted
      // because it is the correctness property AUDIT-20260718-44 exists to
      // protect (FR-039), and because it is exactly the invariant that WOULD
      // break the moment `wal.replay()`/`wal.append()` gain any genuine
      // asynchronous latency (e.g. a future move to `fs.promises`) — at which
      // point this assertion becomes the discriminating one.
      const installationSequences = results.map((r) => r.envelope.installationSequence);
      expect(new Set(installationSequences).size).toBe(N);
      const sortedInstallationSequences = [...installationSequences].sort((a, b) => a - b);
      expect(sortedInstallationSequences).toEqual(
        Array.from({ length: N }, (_unused, i) => 4 + i),
      );

      // invocationSequence: all N events share the SAME invocationId, so they
      // must be a distinct, contiguous run starting at 1 (no prior WAL record
      // exists for 'race-inv').
      const invocationSequences = results.map((r) => r.envelope.invocationSequence);
      expect(new Set(invocationSequences).size).toBe(N);
      const sortedInvocationSequences = [...invocationSequences].sort((a, b) => a - b);
      expect(sortedInvocationSequences).toEqual(Array.from({ length: N }, (_unused, i) => 1 + i));
    } finally {
      rmSync(walDir, { recursive: true });
    }
  });
});
