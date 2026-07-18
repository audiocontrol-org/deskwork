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

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPipeline } from '../../src/sidecar/pipeline.js';
import type { RedactionContext } from '../../src/fleet/redact.js';

const FAKE_CTX: RedactionContext = {
  installationRoot: '/Users/testuser/work/project',
  homeDir: '/Users/testuser',
  username: 'testuser',
  hostname: 'test-host.local',
};

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
      });
      const e2 = await p1.receive({
        installationId: 'inst-1',
        invocationId,
        runId: 'run-1',
        type: 'run.progress',
        classification: 'durable',
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
      await p1.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.started', classification: 'durable' });
      await p1.receive({ installationId: 'i', invocationId: 'invB', runId: null, type: 'run.started', classification: 'durable' });
      await p1.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.progress', classification: 'durable' });
      const a3 = await p1.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.progress', classification: 'durable' });
      expect(a3.envelope.invocationSequence).toBe(3);

      // Restart.
      const p2 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const aNext = await p2.receive({ installationId: 'i', invocationId: 'invA', runId: null, type: 'run.completed', classification: 'durable' });
      const bNext = await p2.receive({ installationId: 'i', invocationId: 'invB', runId: null, type: 'run.completed', classification: 'durable' });

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
      await p1.receive({ installationId: 'i', invocationId: 'old-inv', runId: null, type: 'run.started', classification: 'durable' });
      await p1.receive({ installationId: 'i', invocationId: 'old-inv', runId: null, type: 'run.progress', classification: 'durable' });

      const p2 = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const fresh = await p2.receive({ installationId: 'i', invocationId: 'brand-new-inv', runId: null, type: 'run.started', classification: 'durable' });
      expect(fresh.envelope.invocationSequence).toBe(1);
    } finally {
      rmSync(walDir, { recursive: true });
    }
  });
});
