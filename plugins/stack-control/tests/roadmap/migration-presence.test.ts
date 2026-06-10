// T049 (RED-first, US6, 006) — every real feature from the prose program
// roadmap (its feature table) exists as an item in the migrated heading-keyed
// ROADMAP.md, and the graph validates green (SC-005/FR-019/FR-020). Lossless
// port, mirroring 005's DESIGN-INBOX migration presence guard.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const ROADMAP = resolve(PLUGIN_ROOT, 'ROADMAP.md');
const PROSE = resolve(
  REPO_ROOT,
  'docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md',
);

/** Codenames `<phase>/<slug>` from the prose roadmap's feature table rows. */
function proseCodenames(): string[] {
  const codes = new Set<string>();
  for (const line of readFileSync(PROSE, 'utf8').split('\n')) {
    if (!line.startsWith('| `')) continue; // table rows only
    const m = /^\| `((?:design|plan|impl|multi)\/[a-z0-9-]+)`/.exec(line);
    if (m) codes.add(m[1]!);
  }
  return [...codes];
}

describe('roadmap migration presence (T049)', () => {
  it('the migrated ROADMAP.md is heading-keyed and validates green', () => {
    const model = loadRoadmap(ROADMAP, { builtinGrammarDir: resolve(PLUGIN_ROOT, 'grammars') });
    expect(model.doc.grammar.id).toBe('roadmap');
    expect(model.doc.grammar.unit.kind).toBe('heading');
    expect(model.items.length).toBeGreaterThan(0);
  });

  it('every prose-table feature survives as an item (kind inserted into the identifier)', () => {
    const model = loadRoadmap(ROADMAP, { builtinGrammarDir: resolve(PLUGIN_ROOT, 'grammars') });
    const ids = model.items.map((i) => i.identifier);
    const codes = proseCodenames();
    expect(codes.length).toBeGreaterThanOrEqual(8); // sanity: the table parsed
    for (const code of codes) {
      const [phase, slug] = code.split('/');
      const present = ids.some((id) => new RegExp(`^${phase}:[a-z]+/${slug}$`).test(id));
      expect(present, `prose feature '${code}' missing from migrated ROADMAP.md`).toBe(true);
    }
  });

  it('includes the self-seed (roadmap-protocol) and the deferred order-gating gap', () => {
    const model = loadRoadmap(ROADMAP, { builtinGrammarDir: resolve(PLUGIN_ROOT, 'grammars') });
    expect(model.byId.has('design:feature/roadmap-protocol')).toBe(true);
    expect(model.byId.has('design:gap/roadmap-order-gating')).toBe(true);
  });
});
