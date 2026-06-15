// Roadmap presence guards (originally T049, US6, 006). The one-time prose->
// heading-keyed migration is complete; the prose source roadmap
// (docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md)
// is deprecated and was deleted (2026-06-13). The lossless-port check that read
// that prose source is retired with it — its job (verify nothing was lost in the
// migration) is done and its source no longer exists. The remaining guards
// validate the migrated ROADMAP.md directly.

import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..');
const ROADMAP = resolve(PLUGIN_ROOT, 'ROADMAP.md');

describe('roadmap migration presence (T049)', () => {
  it('the migrated ROADMAP.md is heading-keyed and validates green', () => {
    const model = loadRoadmap(ROADMAP, { builtinGrammarDir: resolve(PLUGIN_ROOT, 'grammars') });
    expect(model.doc.grammar.id).toBe('roadmap');
    expect(model.doc.grammar.unit.kind).toBe('heading');
    expect(model.items.length).toBeGreaterThan(0);
  });

  it('includes the self-seed (roadmap-protocol) and the deferred order-gating gap', () => {
    const model = loadRoadmap(ROADMAP, { builtinGrammarDir: resolve(PLUGIN_ROOT, 'grammars') });
    expect(model.byId.has('design:feature/roadmap-protocol')).toBe(true);
    expect(model.byId.has('design:gap/roadmap-order-gating')).toBe(true);
  });
});
