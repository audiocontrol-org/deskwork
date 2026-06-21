// T052 (027 residual hygiene, FR-033) — `rewriteEdgeLine` (the shared edge-line
// rewriter the decompose / rename / edge-mutation surfaces compose) must be
// FENCE-AWARE: a line that LOOKS like an edge bullet but lives inside a fenced
// code block (``` … ```) is documentation, not a real edge, and must be left
// byte-for-byte untouched. Before this fix `rewriteEdgeLine` mapped over every
// line and rewrote fenced examples too, silently corrupting prose that documents
// the edge syntax. This pins the contract that only REAL edge lines are rewritten.

import { describe, it, expect } from 'vitest';
import { rewriteEdgeLine } from '../../src/roadmap/mutations.js';

/** Map every `depends-on` target `old` → `new` (the rename/decompose transform). */
const repoint = (targets: readonly string[]): string[] =>
  targets.map((t) => (t === 'impl:feature/old' ? 'impl:feature/new' : t));

describe('027 FR-033 — rewriteEdgeLine is fence-aware', () => {
  it('rewrites a REAL edge line but NOT an identical-looking one inside a ``` fence', () => {
    const body = [
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: impl:feature/old',
      'Scope prose documenting the syntax:',
      '```',
      '- depends-on: impl:feature/old',
      '```',
    ];
    const out = rewriteEdgeLine(body, 'depends-on', repoint);
    // The REAL edge (line index 2) was repointed.
    expect(out[2]).toContain('impl:feature/new');
    expect(out[2]).not.toContain('impl:feature/old');
    // The FENCED example (line index 5) is untouched — still the literal old id.
    expect(out[5]).toBe('- depends-on: impl:feature/old');
  });

  it('leaves an edge-looking line inside a tilde (~~~) fence untouched', () => {
    const body = [
      '## impl:feature/x',
      '~~~',
      '- depends-on: impl:feature/old',
      '~~~',
    ];
    const out = rewriteEdgeLine(body, 'depends-on', repoint);
    expect(out[2]).toBe('- depends-on: impl:feature/old');
  });

  it('rewrites edge lines that come AFTER a closed fence (fence state resets)', () => {
    const body = [
      '```',
      '- depends-on: impl:feature/old',
      '```',
      '- depends-on: impl:feature/old',
    ];
    const out = rewriteEdgeLine(body, 'depends-on', repoint);
    // Inside the fence: untouched.
    expect(out[1]).toBe('- depends-on: impl:feature/old');
    // After the fence closed: rewritten.
    expect(out[3]).toContain('impl:feature/new');
  });
});
