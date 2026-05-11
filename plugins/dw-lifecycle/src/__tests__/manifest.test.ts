import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_VERSION,
  manifestPath,
  readManifest,
  writeManifest,
  type ShortcutsManifest,
} from '../shortcuts/manifest.js';

function makeManifest(): ShortcutsManifest {
  return {
    version: MANIFEST_SCHEMA_VERSION,
    scheme: 'C',
    rename: null,
    pluginVersion: '1.2.3',
    shims: [
      {
        command: 'implement',
        shimName: 'dw-implement',
        path: '/tmp/x/.claude/commands/dw-implement.md',
      },
    ],
  };
}

describe('shortcuts/manifest', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-manifest-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('manifestPath', () => {
    it('returns the canonical path under .claude/commands/', () => {
      expect(manifestPath(tmp)).toBe(
        join(tmp, '.claude', 'commands', MANIFEST_FILENAME),
      );
    });
  });

  describe('writeManifest + readManifest round-trip', () => {
    it('reads back what was written, byte-for-byte structurally', () => {
      const file = join(tmp, 'manifest.json');
      const manifest = makeManifest();
      writeManifest(file, manifest);

      const roundTripped = readManifest(file);
      expect(roundTripped).toEqual(manifest);
    });

    it('writes pretty-printed JSON with a trailing newline', () => {
      const file = join(tmp, 'manifest.json');
      writeManifest(file, makeManifest());

      const raw = readFileSync(file, 'utf8');
      expect(raw.endsWith('\n')).toBe(true);
      expect(raw).toContain('  "version": 1');
    });
  });

  describe('readManifest errors', () => {
    it('throws when the file is missing', () => {
      expect(() => readManifest(join(tmp, 'does-not-exist.json'))).toThrow(
        /Failed to read manifest/,
      );
    });

    it('throws when the JSON is malformed', () => {
      const file = join(tmp, 'manifest.json');
      writeFileSync(file, '{ not valid json', 'utf8');
      expect(() => readManifest(file)).toThrow(/Failed to parse manifest/);
    });

    it('throws on wrong schema version', () => {
      const file = join(tmp, 'manifest.json');
      writeFileSync(
        file,
        JSON.stringify({ ...makeManifest(), version: 999 }, null, 2) + '\n',
        'utf8',
      );
      expect(() => readManifest(file)).toThrow(/expected schema/);
    });

    it('throws on missing required fields', () => {
      const file = join(tmp, 'manifest.json');
      writeFileSync(
        file,
        JSON.stringify(
          { version: MANIFEST_SCHEMA_VERSION, scheme: 'C' },
          null,
          2,
        ),
        'utf8',
      );
      expect(() => readManifest(file)).toThrow(/expected schema/);
    });

    it('throws when a shim entry is malformed', () => {
      const file = join(tmp, 'manifest.json');
      const bad = {
        ...makeManifest(),
        shims: [{ command: 'implement' }],
      };
      writeFileSync(file, JSON.stringify(bad, null, 2), 'utf8');
      expect(() => readManifest(file)).toThrow(/expected schema/);
    });
  });
});
