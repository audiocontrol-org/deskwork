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

    it('throws (belt-and-suspenders) when a shimName would resolve outside commandsDir', () => {
      // This is the second line of defense — readManifest already
      // rejects path-traversal shimName values via SHIM_NAME_PATTERN
      // before any caller ever passes one here. The check exists for
      // any future code path that builds a shimName from a less-trusted
      // source without going through the manifest reader.
      expect(() => shimPathFor('/tmp/x', '../../etc/passwd')).toThrow(
        /Refusing to construct shim path outside commands directory/,
      );
    });

    it('throws when a shimName resolves to a sibling directory', () => {
      expect(() => shimPathFor('/tmp/x', '../sibling')).toThrow(
        /Refusing to construct shim path outside commands directory/,
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

  describe('readManifest shimName validation', () => {
    // The schema-mismatch error message is reused when a shimName fails
    // the SHIM_NAME_PATTERN check: the manifest as a whole no longer
    // matches the expected shape, so callers see the same "fix or
    // remove the manifest" guidance they'd see for any other malformed
    // field. The closure is what matters — manifests with hostile
    // shimName values do NOT round-trip through readManifest, which is
    // what blocks the path-traversal vector at the source.

    function writeManifestWithShimName(shimName: string): string {
      const file = join(tmp, 'manifest.json');
      const bad = {
        ...makeManifest(),
        shims: [{ command: 'implement', shimName }],
      };
      writeFileSync(file, JSON.stringify(bad, null, 2), 'utf8');
      return file;
    }

    it('rejects path-traversal shimName values', () => {
      const file = writeManifestWithShimName('../../../etc/passwd');
      expect(() => readManifest(file)).toThrow(/schema version/);
    });

    const badShimNames: ReadonlyArray<readonly [label: string, value: string]> = [
      ['empty', ''],
      ['uppercase', 'UPPER'],
      ['forward slash', 'with/slash'],
      ['back slash', 'with\\backslash'],
      ['space', 'with space'],
      ['dotfile', '.dotfile'],
      ['trailing dash', 'trailing-'],
      ['leading dash', '-leading'],
      ['double-dash leading', '--double-dash-leading'],
    ];

    for (const [label, value] of badShimNames) {
      it(`rejects shimName: ${label} (${JSON.stringify(value)})`, () => {
        const file = writeManifestWithShimName(value);
        expect(() => readManifest(file)).toThrow(/schema version/);
      });
    }

    const goodShimNames: ReadonlyArray<string> = [
      'dwi',
      'dw-implement',
      'mt-implement',
      'mti',
    ];

    for (const value of goodShimNames) {
      it(`accepts shimName: ${JSON.stringify(value)}`, () => {
        const file = writeManifestWithShimName(value);
        const parsed = readManifest(file);
        expect(parsed.shims).toHaveLength(1);
        expect(parsed.shims[0].shimName).toBe(value);
      });
    }
  });
});
