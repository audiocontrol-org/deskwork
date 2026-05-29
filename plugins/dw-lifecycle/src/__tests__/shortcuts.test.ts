import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  COMMANDS,
  SCHEMES,
  getScheme,
  type SchemeId,
} from '../shortcuts/schemes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMMANDS_DIR = resolve(__dirname, '../../commands');

const SCHEME_IDS: readonly SchemeId[] = ['A', 'B', 'C'];

// These tables are the authoritative spec copy of Schemes A and B.
// They duplicate schemes.ts intentionally — an edit there without a
// matching edit here fails this test, which is the point.
const SCHEME_A_TABLE: ReadonlyArray<readonly [string, string]> = [
  ['audit', 'dwa'],
  ['implement', 'dwi'],
  ['setup', 'dws'],
  ['ship', 'dwsh'],
  ['session-start', 'dwss'],
  ['session-end', 'dwse'],
  ['define', 'dwd'],
  ['doctor', 'dwdo'],
  ['customize', 'dwc'],
  ['complete', 'dwco'],
  ['extend', 'dwe'],
  ['help', 'dwh'],
  ['install', 'dwin'],
  ['issues', 'dwis'],
  ['pickup', 'dwp'],
  ['review', 'dwr'],
  ['teardown', 'dwt'],
];

const SCHEME_B_TABLE: ReadonlyArray<readonly [string, string]> = [
  ['audit', 'dw-au'],
  ['implement', 'dw-im'],
  ['setup', 'dw-se'],
  ['define', 'dw-de'],
  ['ship', 'dw-sh'],
  ['session-start', 'dw-ss'],
  ['session-end', 'dw-en'],
  ['customize', 'dw-cu'],
  ['complete', 'dw-co'],
  ['doctor', 'dw-do'],
  ['extend', 'dw-ex'],
  ['help', 'dw-he'],
  ['install', 'dw-in'],
  ['issues', 'dw-is'],
  ['pickup', 'dw-pi'],
  ['review', 'dw-re'],
  ['teardown', 'dw-te'],
];

// Meta-commands intentionally excluded from COMMANDS: the shortcuts
// skills install shortcuts FOR the 17 lifecycle commands; they are
// themselves invoked via the namespaced `/dw-lifecycle:` form (the
// chicken-and-egg moment), so they get no shim of their own. The
// scope-discovery verbs (and the install commands that scaffold their
// CONFIG) also get no shim — they're operator-invoked but outside the
// lifecycle command set the shortcuts install targets.
const META_COMMANDS = [
  'install-shortcuts',
  'uninstall-shortcuts',
  // scope-discovery verbs (Phase 6 + Phase 7 + Phase 8)
  'batch-dispose',
  'check-adopters',
  'check-anti-patterns',
  // `check-clones` is the canonical Phase 6 rename; `detect-clones` is the
  // forever-back-compat alias that ships a thin redirector command file.
  'check-clones',
  'check-deprecations',
  'check-disposition-survivor',
  'check-editor-symmetry',
  'check-refactor-preconditions',
  'detect-clones',
  'dispose-clone',
  'install-agent-prompts',
  'install-scope-discovery',
  'install-scope-discovery-hooks',
  'migrate-from-pilot',
  'refresh-clones-baseline',
  'scope-export',
  'scope-inventory',
  'scope-summary',
  'scope-widen',
  'tooling-feedback-import',
  'uninstall-scope-discovery-hooks',
  'validate-scope-discovery',
] as const;

describe('COMMANDS canonical list', () => {
  it('matches the on-disk commands/ directory (plus meta-commands) exactly', () => {
    const onDisk = readdirSync(COMMANDS_DIR, { withFileTypes: true })
      .filter(
        (e) => e.isFile() && !e.name.startsWith('.') && e.name.endsWith('.md'),
      )
      .map((e) => e.name.slice(0, -'.md'.length))
      .sort();
    const expected = [...COMMANDS, ...META_COMMANDS].sort();
    expect(expected).toEqual(onDisk);
  });

  it('contains exactly 17 commands (meta-commands tracked separately)', () => {
    expect(COMMANDS.length).toBe(17);
    for (const meta of META_COMMANDS) {
      expect(COMMANDS).not.toContain(meta);
    }
  });
});

describe('every command has a shim in every scheme', () => {
  for (const sid of SCHEME_IDS) {
    describe(`scheme ${sid}`, () => {
      it.each(COMMANDS.map((c) => [c]))(
        'shimFor(%s) returns a non-empty string',
        (cmd) => {
          const shim = getScheme(sid).shimFor(cmd);
          expect(typeof shim).toBe('string');
          expect(shim.length).toBeGreaterThan(0);
        },
      );
    });
  }
});

describe('Scheme A explicit mapping', () => {
  it.each(SCHEME_A_TABLE)('maps %s -> %s', (cmd, expected) => {
    expect(getScheme('A').shimFor(cmd)).toBe(expected);
  });
});

describe('Scheme B explicit mapping', () => {
  it.each(SCHEME_B_TABLE)('maps %s -> %s', (cmd, expected) => {
    expect(getScheme('B').shimFor(cmd)).toBe(expected);
  });
});

describe('Scheme C explicit mapping', () => {
  it.each(COMMANDS.map((c) => [c]))('maps %s -> dw-%s', (cmd) => {
    expect(getScheme('C').shimFor(cmd)).toBe(`dw-${cmd}`);
  });
});

describe('no-duplicates invariant per scheme', () => {
  for (const sid of SCHEME_IDS) {
    describe(`scheme ${sid}`, () => {
      const scheme = getScheme(sid);
      const entries = scheme.entries();

      it('produces exactly 17 entries', () => {
        expect(entries.length).toBe(17);
      });

      it('has 17 unique commands', () => {
        const commands = new Set(entries.map(([cmd]) => cmd));
        expect(commands.size).toBe(17);
      });

      it('entry command set equals the canonical COMMANDS set', () => {
        const entryCommands = new Set(entries.map(([cmd]) => cmd));
        expect(entryCommands).toEqual(new Set(COMMANDS));
      });

      it('has 17 unique shim names', () => {
        const shims = new Set(entries.map(([, shim]) => shim));
        expect(shims.size).toBe(17);
      });
    });
  }
});

describe('shimFor on unknown command', () => {
  for (const sid of SCHEME_IDS) {
    it(`scheme ${sid} throws on unknown command`, () => {
      expect(() => getScheme(sid).shimFor('bogus')).toThrow(/unknown command/i);
    });
  }
});

describe('SCHEMES registry', () => {
  it('exposes all three schemes', () => {
    expect(Object.keys(SCHEMES).sort()).toEqual(['A', 'B', 'C']);
  });

  it('getScheme returns the same instance as SCHEMES lookup', () => {
    for (const sid of SCHEME_IDS) {
      expect(getScheme(sid)).toBe(SCHEMES[sid]);
    }
  });

  it('each scheme reports its own id', () => {
    for (const sid of SCHEME_IDS) {
      expect(getScheme(sid).id).toBe(sid);
    }
  });
});
