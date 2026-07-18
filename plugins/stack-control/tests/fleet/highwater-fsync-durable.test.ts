// specs/036-fleet-control-plane — AUDIT-20260718-30 (RED-first regression).
//
// THE DEFECT: `writeHighWaterMarkAtomic()` wrote the durable mark with
// `writeFileSync()` + `renameSync()` and NEVER fsynced the temp file or the
// containing directory. `reserveNextSequence()` returns the reserved sequence
// after that non-fsynced write. A crash after the caller EMITS an event but
// before the filesystem commits the rename can ROLL THE MARK BACK, letting the
// restarted sidecar reserve + emit a DUPLICATE `installationSequence` — directly
// corrupting the single per-installation counter FR-039/R-02 gap-classification
// depends on. The same feature's `src/plane/commands/store.ts` (`persistRecord`)
// already does the crash-safe fd+fsync+rename+dir-fsync dance; this file did not.
//
// THE FIX: `writeHighWaterMarkAtomic` must write through an fd, `fsyncSync` the
// fd, rename, and `fsyncSync` the containing DIRECTORY before returning — so the
// reserved value is on stable storage before `reserveNextSequence` hands it out.
//
// WHY A STRUCTURAL SYSCALL-ORDER TEST (not a SIGKILL crash test): a userspace
// crash (SIGKILL) does NOT lose an un-fsynced write — the page cache still holds
// it and every subsequent process reads it back, so a recovery/replay test PASSES
// with OR without the fsync and cannot distinguish the fix from the bug. Only a
// kernel panic / power loss actually rolls an un-fsynced rename back, which a unit
// test cannot induce. The durability guarantee is therefore verified where it is
// observable: the SEQUENCE of filesystem operations. `node:fs`'s exports are
// non-configurable (cannot be `vi.spyOn`'d), so the module exposes a real-fs-
// defaulted dependency-injection seam (`HighWaterFsOps`) — NOT a mocked
// filesystem: the recording ops below delegate to REAL `node:fs` and the bytes
// land on a REAL temp dir; the wrapper only records the call order.
//
// RED PROOF: with the recording ops, assert the temp file is fsynced BEFORE the
// rename and the containing directory is fsynced AFTER it. Pre-fix (writeFileSync
// + rename, no fsync, no injectable ops) the export's shape/behavior does not
// satisfy this → RED. Real fs, real temp dirs, no fake timers. Relative `.js`.

import { describe, expect, it } from 'vitest';
import {
  closeSync as realCloseSync,
  fsyncSync as realFsyncSync,
  mkdtempSync,
  openSync as realOpenSync,
  renameSync as realRenameSync,
  rmSync,
  writeSync as realWriteSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  highWaterMarkPath,
  readHighWaterMark,
  reserveNextSequence,
  writeHighWaterMarkAtomic,
  type HighWaterFsOps,
} from '../../src/machine-state/highwater.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { useMachineStateStore } from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';

function makeInstallationRoot(): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, 'scf-hw-fsync-inst-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

type RecordedOp =
  | { readonly op: 'open'; readonly fd: number; readonly path: string }
  | { readonly op: 'write'; readonly fd: number }
  | { readonly op: 'fsync'; readonly fd: number; readonly path: string | undefined }
  | { readonly op: 'close'; readonly fd: number }
  | { readonly op: 'rename'; readonly from: string; readonly to: string };

/** Real-fs-backed ops that RECORD the call order (delegating to real node:fs —
 * this is instrumentation over the real filesystem, never a mock of it). */
function recordingOps(): { ops: HighWaterFsOps; log: RecordedOp[] } {
  const log: RecordedOp[] = [];
  const fdPaths = new Map<number, string>();
  const ops: HighWaterFsOps = {
    openSync(path: string, flags: string): number {
      const fd = realOpenSync(path, flags);
      fdPaths.set(fd, path);
      log.push({ op: 'open', fd, path });
      return fd;
    },
    writeSync(fd: number, data: string): number {
      log.push({ op: 'write', fd });
      return realWriteSync(fd, data);
    },
    fsyncSync(fd: number): void {
      log.push({ op: 'fsync', fd, path: fdPaths.get(fd) });
      realFsyncSync(fd);
    },
    closeSync(fd: number): void {
      log.push({ op: 'close', fd });
      realCloseSync(fd);
    },
    renameSync(from: string, to: string): void {
      log.push({ op: 'rename', from, to });
      realRenameSync(from, to);
    },
  };
  return { ops, log };
}

describe('AUDIT-20260718-30 — the durable high-water write is crash-safe (fd+fsync+rename+dir-fsync)', () => {
  const store = useMachineStateStore();

  it('writeHighWaterMarkAtomic fsyncs the temp file BEFORE the rename and the directory AFTER it', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      const markPath = highWaterMarkPath(location);
      const dir = dirname(markPath);
      const { ops, log } = recordingOps();

      writeHighWaterMarkAtomic(markPath, 7, ops);

      const renameIdx = log.findIndex((entry) => entry.op === 'rename');
      expect(renameIdx).toBeGreaterThanOrEqual(0);

      // The temp file (rename source) is fsynced BEFORE the rename publishes it.
      const rename = log[renameIdx];
      const tmpPath = rename.op === 'rename' ? rename.from : '';
      expect(tmpPath.startsWith(markPath)).toBe(true); // sibling temp of the mark
      const fileFsyncIdx = log.findIndex(
        (entry) => entry.op === 'fsync' && entry.path === tmpPath,
      );
      expect(fileFsyncIdx).toBeGreaterThanOrEqual(0);
      expect(fileFsyncIdx).toBeLessThan(renameIdx);

      // The CONTAINING DIRECTORY is fsynced AFTER the rename, so the rename
      // metadata (what makes the new mark discoverable) is itself durable.
      const dirFsyncIdx = log.findIndex(
        (entry) => entry.op === 'fsync' && entry.path === dir,
      );
      expect(dirFsyncIdx).toBeGreaterThanOrEqual(0);
      expect(dirFsyncIdx).toBeGreaterThan(renameIdx);

      // And the bytes really landed on the real filesystem (delegation intact).
      expect(readHighWaterMark(location)).toBe(7);
    } finally {
      inst.dispose();
    }
  });

  it('reserveNextSequence fsyncs the reserved value (file + directory) BEFORE it returns', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      const markPath = highWaterMarkPath(location);
      const dir = dirname(markPath);
      const { ops, log } = recordingOps();

      const reserved = reserveNextSequence(location, ops);
      expect(reserved).toBe(1);

      // Because reserveNextSequence is SYNCHRONOUS, any op in the log necessarily
      // completed before it returned. The reserved mark's file AND its directory
      // must both have been fsynced — a crash after this return cannot roll the
      // reservation back and re-hand a duplicate installationSequence (R-02).
      const fileFsync = log.some(
        (entry) => entry.op === 'fsync' && entry.path !== undefined && entry.path.startsWith(markPath) && entry.path !== dir,
      );
      const dirFsync = log.some((entry) => entry.op === 'fsync' && entry.path === dir);
      expect(fileFsync).toBe(true);
      expect(dirFsync).toBe(true);

      // The reserved value is durably readable back from the real filesystem.
      expect(readHighWaterMark(location)).toBe(1);
    } finally {
      inst.dispose();
    }
  });
});
