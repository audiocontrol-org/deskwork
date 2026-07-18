/**
 * specs/036-fleet-control-plane — T111 (RED→GREEN), AUDIT-20260717-12.
 *
 * SC-013 (data-model.md § Storage layout / Redaction scope) — ZERO raw
 * un-redacted values on disk. Whatever the sidecar spools to the WAL file
 * must already be redacted. This test verifies the ON-DISK GUARANTEE by
 * driving the REAL pipeline: an event carrying SENSITIVE snapshot content
 * flows through `createPipeline().receive()`, and the bytes that land in the
 * WAL file on disk contain NO raw un-redacted secret values, while redaction
 * markers DO appear (proving the value was redacted, not silently dropped).
 *
 * AUDIT-20260717-12 (the defect this rewrite closes): the prior version of
 * this test called `redactEvent` directly and appended to `openWal`,
 * BYPASSING `createPipeline` entirely for its sensitive case — so it passed
 * even though the pipeline could not carry a snapshot at all and would have
 * spooled raw fields had one crossed it. The sensitive snapshot now travels
 * the SAME public `createPipeline().receive()` path production uses, and the
 * assertions read the WAL bytes back off disk after that path returns.
 *
 * REDACTION CONTEXT is injected (the pipeline's DI seam) so this suite is
 * deterministic and never depends on the real machine's home/user/hostname —
 * the sensitive values below are redacted because the injected context names
 * them, not by luck of matching the developer's actual machine.
 *
 * No `any`, no `as`, no `@ts-ignore`. Relative `.js` imports (node16).
 * Real filesystem (real tmp dir, real WAL file), never mocked.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPipeline } from '../../src/sidecar/pipeline.js';
import { openWal } from '../../src/sidecar/spool/wal.js';
import type { FieldAllowlist, RedactionContext } from '../../src/fleet/redact.js';

// Deterministic fake redaction context (mirrors redact.test.ts) — never the
// real machine's home/user/hostname.
const FAKE_CTX: RedactionContext = {
  installationRoot: '/Users/testuser/work/project',
  homeDir: '/Users/testuser',
  username: 'testuser',
  hostname: 'test-host.local',
};

describe('spool-redacted (SC-013 — on-disk redaction guarantee via the real pipeline)', () => {
  it(
    'a sensitive snapshot flowing through createPipeline().receive() lands on disk ' +
      'already redacted — no raw secrets, redaction markers present',
    async () => {
      const walDir = mkdtempSync(join(tmpdir(), 'spool-redacted-'));
      try {
        // The pipeline redacts with the INJECTED context (its DI seam), so the
        // fake home/user/host below are what get scrubbed.
        const pipeline = createPipeline(walDir, { redactionContext: FAKE_CTX });

        const rawSnapshotContent = {
          errorMessage:
            'Error occurred at /Users/testuser/work/project/src/fleet/redact.ts ' +
            'for user testuser on host test-host.local',
          commitMessage: 'Deployed by testuser from /Users/testuser/work/project',
          workingDirectory: '/Users/testuser/work/project/src',
          branch: 'feature/redact-snapshot',
        };
        const allowlist: FieldAllowlist = {
          errorMessage: 'error',
          commitMessage: 'commit-message',
          workingDirectory: 'path',
          branch: 'branch',
        };

        // The event carries SENSITIVE snapshot content across the REAL pipeline
        // boundary. receive() must redact it BEFORE the WAL append (FR-047/048).
        await pipeline.receive({
          installationId: 'inst-test-123',
          invocationId: 'inv-test-456',
          runId: 'run-test-789',
          type: 'run.failed',
          classification: 'durable',
          snapshot: { content: rawSnapshotContent, allowlist },
        });

        // Read the WAL back through the public replay path AND read the raw
        // bytes off disk — both must be already-redacted.
        const wal = await openWal(walDir);
        const replayed = await wal.replay();
        await wal.close();
        expect(replayed.length).toBe(1);

        const walPath = join(walDir, 'spool.wal');
        const onDiskBytes = readFileSync(walPath, 'utf8');

        // ===== SC-013 ASSERTION 1: NO RAW SECRETS anywhere in the on-disk bytes.
        expect(onDiskBytes).not.toContain('testuser');
        expect(onDiskBytes).not.toContain('test-host.local');
        expect(onDiskBytes).not.toContain('/Users/testuser/work/project');

        // ===== SC-013 ASSERTION 2: REDACTION MARKERS PRESENT (redacted, not
        // silently dropped).
        expect(onDiskBytes).toContain('<redacted-user>');
        expect(onDiskBytes).toContain('<redacted-home>');
        expect(onDiskBytes).toContain('<redacted-host>');

        // ===== SC-013 ASSERTION 3: the spooled snapshot is the redacted one,
        // and safe content is preserved.
        const record = JSON.parse(onDiskBytes.trim());
        const spooled = JSON.parse(record.payload);
        expect(spooled.snapshot.errorMessage).toContain('Error occurred at');
        expect(spooled.snapshot.errorMessage).toContain('<redacted-user>');
        expect(spooled.snapshot.errorMessage).toContain('<redacted-host>');
        expect(spooled.snapshot.errorMessage).toContain('<redacted-home>');
        // Absolute path made installation-relative (never leaked absolute).
        expect(spooled.snapshot.workingDirectory).toBe('src');
        // Branch is PT-008's one verbatim exception (retained un-scrubbed).
        expect(spooled.snapshot.branch).toBe('feature/redact-snapshot');
      } finally {
        rmSync(walDir, { recursive: true });
      }
    },
  );

  it('an event with no snapshot spools an empty snapshot (unchanged behavior)', async () => {
    const walDir = mkdtempSync(join(tmpdir(), 'spool-redacted-empty-'));
    try {
      const pipeline = createPipeline(walDir, { redactionContext: FAKE_CTX });
      const event = await pipeline.receive({
        installationId: 'inst-test-123',
        invocationId: 'inv-test-456',
        runId: 'run-test-789',
        type: 'run.started',
        classification: 'durable',
      });
      expect(event.snapshot).toEqual({});

      const walPath = join(walDir, 'spool.wal');
      const record = JSON.parse(readFileSync(walPath, 'utf8').trim());
      const spooled = JSON.parse(record.payload);
      expect(spooled.snapshot).toEqual({});
      expect(spooled.envelope.installationId).toBe('inst-test-123');
    } finally {
      rmSync(walDir, { recursive: true });
    }
  });
});
