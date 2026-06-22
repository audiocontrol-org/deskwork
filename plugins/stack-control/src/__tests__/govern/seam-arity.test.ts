// 030 US9 T076 (FR-031): the seam-pass arity scan must skip balanced inner parens
// (a function-typed parameter) so a required param added AFTER it is still counted.
// RED now: the FN regex's `([^)]*)` capture stops at the first inner ')', dropping
// every param after a callback param — so a real arity increase (1→2) is read as
// 1→1 and the cross-boundary changed-arity break is silently missed.

import { describe, expect, it } from 'vitest';
import { runSeamPass } from '../../govern/seam-pass.js';
import type { Chunk } from '../../govern/chunk-artifacts.js';

const chunk = (id: string, files: readonly string[]): Chunk => ({
  id,
  files,
  splitCluster: false,
  renderedBytes: 0,
});

describe('030 T076 — seam arity counts a required param after a function-typed param (FR-031)', () => {
  it('flags a 1→2 changed-arity break when a required param is added after a callback param', () => {
    // `register` gains a REQUIRED `label: string` after its callback param. The real
    // required arity goes 1 → 2 (a substantive cross-boundary break). The buggy scan
    // truncates both signatures at the inner ')' of `(e: number)`, reading 1 → 1.
    const aDiff = [
      '-export function register(cb: (e: number) => void)',
      '+export function register(cb: (e: number) => void, label: string)',
    ].join('\n');
    // chunk-b consumes `register` across the boundary, so the break is substantive.
    const bDiff = '+  register(handler, "tag");';
    const fileDiffs = new Map<string, string>([
      ['a.ts', aDiff],
      ['b.ts', bDiff],
    ]);

    const result = runSeamPass({
      chunks: [chunk('chunk-a', ['a.ts']), chunk('chunk-b', ['b.ts'])],
      splitClusterMarkers: [],
      fileDiffs,
    });

    const arityBreaks = result.findings.filter((f) => f.kind === 'changed-arity' && f.symbol === 'register');
    expect(
      arityBreaks,
      'a 1→2 required-arity increase consumed across a chunk boundary must be flagged as changed-arity',
    ).toHaveLength(1);
  });
});
