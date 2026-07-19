// specs/037-instance-observability — T004 (RED-first, TASK T004).
//
// deriveInstanceId(installationRoot: string): string — mints the instance
// identity `host:path` composite key per data-model.md § Instance Identity.
//
// CONTRACT (from data-model.md D8):
// - Returns `${host}:${realpath}` where host = os.hostname() and realpath =
//   fs.realpathSync.native(installationRoot) (canonicalized).
// - Properties to assert:
//   1. Returns `host:path` shape — contains the current os.hostname() and the
//      canonicalized real path of the input dir.
//   2. Stable across calls — two calls with the same input return the identical
//      string.
//   3. Distinct hosts/paths → distinct ids (two different real dirs → different
//      ids; create temp dirs for this).
//   4. Never reads or writes a git-tracked file — it is a pure derivation from
//      hostname + realpath (assert no files created as side effect).
//   5. Canonicalization: passing a path with `..` segment or symlink that
//      resolves to the same real dir yields the same id as the canonical path.

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  symlinkSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { deriveInstanceId } from '../../src/machine-state/instance-id.js';

describe('deriveInstanceId', () => {
  describe('basic shape (FR-001)', () => {
    it('returns host:path string containing hostname and canonicalized path', () => {
      const dir = mkdtempSync(join(tmpdir(), 'instance-id-shape-'));
      try {
        const id = deriveInstanceId(dir);
        const expectedHost = hostname();
        const expectedPath = realpathSync.native(dir);

        expect(id).toContain(':');
        expect(id).toContain(expectedHost);
        expect(id).toContain(expectedPath);
        expect(id).toBe(`${expectedHost}:${expectedPath}`);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });

  describe('stability (FR-002)', () => {
    it('two calls with the same input return identical string', () => {
      const dir = mkdtempSync(join(tmpdir(), 'instance-id-stable-'));
      try {
        const id1 = deriveInstanceId(dir);
        const id2 = deriveInstanceId(dir);

        expect(id1).toBe(id2);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });

  describe('distinction by path (FR-003)', () => {
    it('two different real directories yield different ids', () => {
      const dir1 = mkdtempSync(join(tmpdir(), 'instance-id-distinct-1-'));
      const dir2 = mkdtempSync(join(tmpdir(), 'instance-id-distinct-2-'));

      try {
        const id1 = deriveInstanceId(dir1);
        const id2 = deriveInstanceId(dir2);

        expect(id1).not.toBe(id2);
        // Verify they have the same host but different paths
        const [host1, path1] = id1.split(':');
        const [host2, path2] = id2.split(':');
        expect(host1).toBe(host2); // same machine
        expect(path1).not.toBe(path2); // different paths
      } finally {
        rmSync(dir1, { recursive: true });
        rmSync(dir2, { recursive: true });
      }
    });
  });

  describe('no file side effects (FR-004, git-safe)', () => {
    it('does not create, modify, or read files inside the installation root', () => {
      const dir = mkdtempSync(join(tmpdir(), 'instance-id-no-sideeffect-'));
      try {
        // List files before deriving
        const beforeFiles = readdirSync(dir).sort();

        // Derive the id
        deriveInstanceId(dir);

        // List files after — should be identical
        const afterFiles = readdirSync(dir).sort();

        expect(afterFiles).toEqual(beforeFiles);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });

  describe('canonicalization (FR-005)', () => {
    it('resolves .. segments to the same id as the canonical path', () => {
      const baseDir = mkdtempSync(join(tmpdir(), 'instance-id-canon-'));
      try {
        const nestedDir = join(baseDir, 'a', 'b', 'c');
        // Create the nested structure
        rmSync(nestedDir, { recursive: true, force: true });
        const actualDir = join(baseDir, 'a', 'b', 'c');
        mkdirSync(actualDir, { recursive: true });

        const canonicalPath = actualDir;
        const pathWithDotDot = join(actualDir, '..', 'c');

        const canonicalId = deriveInstanceId(canonicalPath);
        const dotDotId = deriveInstanceId(pathWithDotDot);

        expect(canonicalId).toBe(dotDotId);
      } finally {
        rmSync(baseDir, { recursive: true });
      }
    });

    it('resolves symlinks to the same id as the target', () => {
      const baseDir = mkdtempSync(join(tmpdir(), 'instance-id-symlink-'));
      try {
        const targetDir = join(baseDir, 'target');
        const linkDir = join(baseDir, 'link');

        // Create target directory
        mkdirSync(targetDir, { recursive: true });

        // Create symlink pointing to target
        try {
          symlinkSync(targetDir, linkDir, 'dir');
        } catch (e) {
          // Symlinks may not be available on all platforms (Windows); skip this case
          return;
        }

        const targetId = deriveInstanceId(targetDir);
        const linkId = deriveInstanceId(linkDir);

        // Both should resolve to the same canonical path
        expect(targetId).toBe(linkId);
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    });
  });
});
