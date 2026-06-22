// 030 US9 T074 (FR-029): the checkpoint selector is MODE-SCOPED. Implement mode
// rejects GOVERN_CHECKPOINT / --checkpoint (the per-phase selector is gone), but
// SPEC mode still ACCEPTS a checkpoint label (spec governance keeps its checkpoint).
// RED now: the rejection fires before the mode branch, so spec mode ALSO FATALs
// with "GOVERN_CHECKPOINT is retired".

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';

describe('030 T074 — checkpoint selector is mode-scoped (FR-029)', () => {
  it('implement mode REJECTS GOVERN_CHECKPOINT (the per-phase path is gone)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ckpt-impl-'));
    try {
      const r = runCli(['govern', '--mode', 'implement'], { cwd, env: { GOVERN_CHECKPOINT: 'after_plan' } });
      expect(r.status).toBe(2);
      expect(r.stdout + r.stderr).toMatch(/GOVERN_CHECKPOINT is retired/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('spec mode ACCEPTS a checkpoint (no "retired" FATAL)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ckpt-spec-'));
    try {
      const r = runCli(['govern', '--mode', 'spec', '--checkpoint', 'after_plan'], {
        cwd,
        env: { GOVERN_CHECKPOINT: 'after_plan' },
      });
      // Spec mode may still fail later for an unrelated reason (no spec dir in this
      // bare cwd), but it must NOT reject the checkpoint selector as retired — the
      // checkpoint label is a legitimate spec-mode input.
      expect(r.stdout + r.stderr).not.toMatch(/GOVERN_CHECKPOINT is retired/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
