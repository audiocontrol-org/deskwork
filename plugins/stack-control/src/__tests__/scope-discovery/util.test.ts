// T012 — characterization coverage for the not-yet-migrated scope-discovery
// util helpers ported in T013 (registry-yaml, glob, modules, catalog-status).
// audit-log-parser + git-ancestry have their own ported test files; this file
// pins the remaining four so the port is wholly under test.

import { describe, it, expect, afterEach } from 'vitest';
import { makeFixture, type Fixture } from './fixture.js';
import { globToRegex, toPosix, listFilesMatching } from '../../scope-discovery/util/glob.js';
import { moduleForPath } from '../../scope-discovery/util/modules.js';
import { parseKeyedListRegistry } from '../../scope-discovery/util/registry-yaml.js';
import {
  parseCatalogEntryMetadata,
  synthesizeDefaultProvenance,
} from '../../scope-discovery/util/catalog-status.js';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('glob util', () => {
  it('compiles globs (incl. brace-expanded wildcards) to anchored regexes', () => {
    expect(globToRegex('**/*.ts').test('src/a/b.ts')).toBe(true);
    expect(globToRegex('**/*.ts').test('src/a/b.tsx')).toBe(false);
    // Wildcards inside a brace alternation expand (the documented pilot bug fix).
    expect(globToRegex('src/{a*c,b*d}.ts').test('src/abc.ts')).toBe(true);
  });

  it('toPosix normalizes separators', () => {
    expect(toPosix('a/b/c.ts')).toBe('a/b/c.ts');
  });

  it('listFilesMatching returns absolute paths of matching files', async () => {
    fx = makeFixture();
    fx.writeFile('src/keep.ts', 'export const a = 1;\n');
    fx.writeFile('src/skip.md', 'nope\n');

    const matches = await listFilesMatching(
      fx.root,
      [globToRegex('**/*.ts')],
      new Set(['.git', 'node_modules']),
      new Set(['.ts']),
    );

    expect(matches.some((p) => p.endsWith('keep.ts'))).toBe(true);
    expect(matches.some((p) => p.endsWith('skip.md'))).toBe(false);
  });
});

describe('modules util', () => {
  it('moduleForPath buckets a file path to its module under the module root', () => {
    expect(moduleForPath('src/studio/index.ts', ['studio'])).toBe('studio');
    expect(moduleForPath('src/other/index.ts', ['studio'])).toBeNull();
  });
});

describe('registry-yaml util', () => {
  it('parses a keyed-list registry and rejects a non-conforming entry', () => {
    const schema = {
      namespace: 'test-registry',
      topLevelKey: 'items',
      parseEntry(raw: Record<string, unknown>): { id: string } {
        if (typeof raw['id'] !== 'string') throw new Error('entry missing string id');
        return { id: raw['id'] };
      },
    };
    const good = parseKeyedListRegistry('items:\n  - id: alpha\n', 'reg.yaml', schema);
    expect(good.entries.map((e) => e.id)).toEqual(['alpha']);

    expect(() => parseKeyedListRegistry('items:\n  - {}\n', 'reg.yaml', schema)).toThrow();
  });
});

describe('catalog-status util', () => {
  it('synthesizes a default provenance record', () => {
    const prov = synthesizeDefaultProvenance();
    expect(prov).toHaveProperty('source');
  });

  it('parses catalog entry metadata, synthesizing defaults for a bare entry', () => {
    const result = parseCatalogEntryMetadata({}, 'ctx', 'test-ns');
    expect(result.metadata.status).toBe('blessed');
  });
});
