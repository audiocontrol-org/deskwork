import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_VERSION,
  commandsDir,
  manifestPath,
  readManifest,
  shimPathFor,
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

  describe('commandsDir', () => {
    it('returns the canonical .claude/commands/ directory', () => {
      expect(commandsDir(tmp)).toBe(join(tmp, '.claude', 'commands'));
    });
  });

  describe('shimPathFor', () => {
    it('reconstructs the on-disk shim path from a logical shimName', () => {
      expect(shimPathFor(tmp, 'dw-implement')).toBe(
        join(tmp, '.claude', 'commands', 'dw-implement.md'),
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

    it('shim entries are exactly two fields (command + shimName) — no absolute path', () => {
      const file = join(tmp, 'manifest.json');
      writeManifest(file, makeManifest());

      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw) as ShortcutsManifest;
      for (const entry of parsed.shims) {
        expect(Object.keys(entry).sort()).toEqual(['command', 'shimName']);
      }
    });

    it('writes atomically via .tmp + rename — no .tmp file left behind on success', () => {
      const file = join(tmp, 'manifest.json');
      writeManifest(file, makeManifest());

      expect(existsSync(file)).toBe(true);
      expect(existsSync(`${file}.tmp`)).toBe(false);
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

    it('throws on wrong schema version with actionable error (names both versions + recovery hint)', () => {
      const file = join(tmp, 'manifest.json');
      writeFileSync(
        file,
        JSON.stringify({ ...makeManifest(), version: 999 }, null, 2) + '\n',
        'utf8',
      );
      // Error must name BOTH the actual version on disk (999) AND the
      // version this binary knows (1), plus the recovery hint.
      expect(() => readManifest(file)).toThrow(/schema version 999/);
      expect(() => readManifest(file)).toThrow(
        new RegExp(`knows version ${MANIFEST_SCHEMA_VERSION}`),
      );
      expect(() => readManifest(file)).toThrow(/remove the manifest by hand/);
    });

    it('reports <unknown> when the on-disk file has no usable version field', () => {
      const file = join(tmp, 'manifest.json');
      writeFileSync(file, JSON.stringify({ shims: [] }, null, 2), 'utf8');
      expect(() => readManifest(file)).toThrow(/schema version <unknown>/);
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
      // The version on disk equals our version, so the schema-mismatch
      // path produces our version on both sides — but the recovery hint
      // is still there.
      expect(() => readManifest(file)).toThrow(/schema version/);
    });

    it('throws when a shim entry is malformed', () => {
      const file = join(tmp, 'manifest.json');
      const bad = {
        ...makeManifest(),
        shims: [{ command: 'implement' }],
      };
      writeFileSync(file, JSON.stringify(bad, null, 2), 'utf8');
      expect(() => readManifest(file)).toThrow(/schema version/);
    });
  });
});
