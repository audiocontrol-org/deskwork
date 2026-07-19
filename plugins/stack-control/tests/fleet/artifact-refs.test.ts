// specs/036-fleet-control-plane — T049 [US2] [tier:fast] (RED)
// Artifact reference validation (PT-009).
//
// Per contracts/plane-client-api.md C5 and contracts/plane-client-api.md test
// obligation #11: "Artifact refs are **never** `file://` and never absolute
// host paths."
//
// Per research.md PT-009: "artifacts are referenced as **opaque identifiers
// plus installation-relative paths**, never `file://` URLs and never absolute
// host paths. A remote client refers to a filesystem it cannot reach, so
// "quick-access" means **copy-path**, not open-link."
//
// VALID artifact reference shapes:
//   - Opaque identifiers (UUIDs, hash digests, etc.)
//   - Installation-relative paths (e.g., `logs/run-2026-07-16.jsonl`, `artifacts/export.zip`)
//   - Relative paths with directory separators
//
// INVALID artifact reference shapes (MUST be rejected):
//   - `file://` URLs (e.g., `file:///path/to/file`, `file://localhost/path`)
//   - Absolute POSIX paths (e.g., `/var/log/run.jsonl`, `/etc/config`)
//   - Windows absolute paths (e.g., `C:\Users\alice\logs`, `D:/data/file.txt`)
//   - Windows UNC network paths (e.g., `\\server\share\file`)
//
// This test file pins the VALIDATION seam — a function that accepts a
// candidate artifact reference string and either passes it or rejects it with
// a structured error. The validation logic will live in `src/plane/http/api.ts`
// (T054, per-run detail endpoint) or `src/fleet/types.ts` (shared validation
// helper). RED phase: the validation function does NOT exist yet.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import type { ArtifactRef } from '../../src/fleet/artifact.js';
import { validateArtifactRef } from '../../src/fleet/artifact.js';

describe('artifact refs — never file:// URLs, never absolute host paths (T049, PT-009)', () => {
  describe('valid references (installation-relative paths and opaque identifiers)', () => {
    it('accepts opaque identifiers (UUID format)', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const ref = validateArtifactRef(uuid);
      expect(ref.value).toBe(uuid);
    });

    it('accepts installation-relative paths (logs/run.jsonl)', () => {
      const path = 'logs/run-2026-07-16.jsonl';
      const ref = validateArtifactRef(path);
      expect(ref.value).toBe(path);
    });

    it('accepts installation-relative paths (artifacts/export.zip)', () => {
      const path = 'artifacts/export.zip';
      const ref = validateArtifactRef(path);
      expect(ref.value).toBe(path);
    });

    it('accepts nested relative paths with multiple directory levels', () => {
      const path = 'spec-audit/runs/2026-07-16/governs/summary.json';
      const ref = validateArtifactRef(path);
      expect(ref.value).toBe(path);
    });

    it('accepts relative paths with leading parent refs (../ — path security is separate)', () => {
      // Note: path-security escaping the installation root is a separate
      // concern (realm isolation at the plane/storage layer); this test
      // validates only PT-009's URL-scheme constraint.
      const path = '../shared-artifacts/file.txt';
      const ref = validateArtifactRef(path);
      expect(ref.value).toBe(path);
    });

    it('accepts simple filenames without directory separators', () => {
      const filename = 'export.jsonl';
      const ref = validateArtifactRef(filename);
      expect(ref.value).toBe(filename);
    });

    it('accepts opaque hash digests (sha256, etc.)', () => {
      const hash = 'sha256:aabbccdd11223344556677889900aabbccddee';
      const ref = validateArtifactRef(hash);
      expect(ref.value).toBe(hash);
    });
  });

  describe('invalid references — file:// URLs (NEVER, PT-009)', () => {
    it('rejects file:// URLs (absolute path variant)', () => {
      expect(() => validateArtifactRef('file:///var/log/run.jsonl')).toThrow(/file:\/\//i);
    });

    it('rejects file:// URLs (localhost variant)', () => {
      expect(() => validateArtifactRef('file://localhost/path/to/file')).toThrow(/file:\/\//i);
    });

    it('rejects file:// URLs (bare file:// with path)', () => {
      expect(() => validateArtifactRef('file://path/to/artifact')).toThrow(/file:\/\//i);
    });

    it('SOURCE GUARD: error message cites PT-009 when rejecting file:// URLs', () => {
      try {
        validateArtifactRef('file:///tmp/artifact');
        throw new Error('Expected validation to throw');
      } catch (err) {
        expect(String(err)).toContain('PT-009');
      }
    });
  });

  describe('invalid references — absolute POSIX paths (NEVER, PT-009)', () => {
    it('rejects absolute POSIX paths starting with /', () => {
      expect(() => validateArtifactRef('/var/log/run.jsonl')).toThrow(/absolute/i);
    });

    it('rejects absolute POSIX paths (/etc)', () => {
      expect(() => validateArtifactRef('/etc/config')).toThrow(/absolute/i);
    });

    it('rejects absolute POSIX paths (/tmp)', () => {
      expect(() => validateArtifactRef('/tmp/artifact')).toThrow(/absolute/i);
    });

    it('rejects absolute POSIX paths (root /)', () => {
      expect(() => validateArtifactRef('/')).toThrow(/absolute/i);
    });

    it('SOURCE GUARD: error message cites PT-009 when rejecting absolute POSIX paths', () => {
      try {
        validateArtifactRef('/home/user/artifacts');
        throw new Error('Expected validation to throw');
      } catch (err) {
        expect(String(err)).toContain('PT-009');
        expect(String(err)).toContain('POSIX');
      }
    });
  });

  describe('invalid references — Windows absolute paths (NEVER, PT-009)', () => {
    it('rejects Windows drive letter paths (C:\\)', () => {
      expect(() => validateArtifactRef('C:\\Users\\alice\\logs\\run.jsonl')).toThrow(/Windows/i);
    });

    it('rejects Windows drive letter paths with forward slashes (D:/)', () => {
      expect(() => validateArtifactRef('D:/data/artifact.zip')).toThrow(/Windows/i);
    });

    it('rejects Windows drive letter paths (E:\\)', () => {
      expect(() => validateArtifactRef('E:\\export.jsonl')).toThrow(/Windows/i);
    });

    it('rejects single uppercase drive letter (A:)', () => {
      expect(() => validateArtifactRef('A:/artifact')).toThrow(/Windows/i);
    });

    it('rejects single lowercase drive letter (z:)', () => {
      expect(() => validateArtifactRef('z:\\file')).toThrow(/Windows/i);
    });

    it('SOURCE GUARD: error message cites PT-009 when rejecting Windows absolute paths', () => {
      try {
        validateArtifactRef('C:\\artifact');
        throw new Error('Expected validation to throw');
      } catch (err) {
        expect(String(err)).toContain('PT-009');
        expect(String(err)).toContain('Windows');
      }
    });
  });

  describe('invalid references — Windows UNC network paths (NEVER, PT-009)', () => {
    it('rejects Windows UNC paths (\\\\server\\share)', () => {
      expect(() => validateArtifactRef('\\\\server\\share\\artifact.zip')).toThrow(/UNC/i);
    });

    it('rejects Windows UNC paths (\\\\localhost)', () => {
      expect(() => validateArtifactRef('\\\\localhost\\artifacts\\file.jsonl')).toThrow(/UNC/i);
    });

    it('rejects double backslash prefix (\\\\)', () => {
      expect(() => validateArtifactRef('\\\\any\\thing')).toThrow(/UNC/i);
    });

    it('SOURCE GUARD: error message cites PT-009 when rejecting UNC paths', () => {
      try {
        validateArtifactRef('\\\\server\\share');
        throw new Error('Expected validation to throw');
      } catch (err) {
        expect(String(err)).toContain('PT-009');
        expect(String(err)).toContain('UNC');
      }
    });
  });

  describe('invalid inputs — fail loud, no coercion (Principle V)', () => {
    it('rejects empty string (no coercion to a default)', () => {
      expect(() => validateArtifactRef('')).toThrow();
    });

    it('rejects null (fail loud, no type coercion)', () => {
      expect(() => validateArtifactRef(null as unknown as string)).toThrow();
    });

    it('rejects undefined (fail loud)', () => {
      expect(() => validateArtifactRef(undefined as unknown as string)).toThrow();
    });

    it('rejects number types (no coercion)', () => {
      expect(() => validateArtifactRef(42 as unknown as string)).toThrow();
    });
  });

  describe('PT-009 constraint mapping (summary)', () => {
    it('NEVER constraint: file:// URLs are uniformly rejected', () => {
      const fileUrls = [
        'file:///path',
        'file://localhost/path',
        'file://path',
      ];
      for (const url of fileUrls) {
        expect(() => validateArtifactRef(url)).toThrow(/file:\/\//i);
      }
    });

    it('NEVER constraint: absolute POSIX paths are uniformly rejected', () => {
      const absolutePaths = ['/var/log', '/etc', '/tmp/artifact', '/'];
      for (const path of absolutePaths) {
        expect(() => validateArtifactRef(path)).toThrow(/absolute|POSIX/i);
      }
    });

    it('NEVER constraint: Windows absolute paths are uniformly rejected', () => {
      const windowsPaths = ['C:\\', 'D:/', 'E:\\Users\\', 'z:/'];
      for (const path of windowsPaths) {
        expect(() => validateArtifactRef(path)).toThrow(/Windows/i);
      }
    });

    it('NEVER constraint: Windows UNC paths are uniformly rejected', () => {
      const uncPaths = ['\\\\server\\share', '\\\\localhost\\', '\\\\'];
      for (const path of uncPaths) {
        expect(() => validateArtifactRef(path)).toThrow(/UNC/i);
      }
    });
  });
});
