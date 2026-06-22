// 030 hardening (govern-030-hardening umbrella) — seam-pass cluster regressions.
// RED-first: each test pins a real cross-boundary break the seam pass currently
// suppresses. Pairs with TASK-426 (multi-line signatures), TASK-438 (function-typed
// params miscounted as optional), TASK-431 (changed-required-shape never implemented).

import { describe, expect, it } from 'vitest';
import { runSeamPass } from '../../govern/seam-pass.js';
import type { Chunk } from '../../govern/chunk-artifacts.js';

const chunk = (id: string, files: readonly string[]): Chunk => ({
  id,
  files,
  splitCluster: false,
  renderedBytes: 0,
});

describe('TASK-426 — seam pass parses multi-line exported function signatures', () => {
  it('flags a 1→2 changed-arity break when the signature spans multiple diff lines', () => {
    // `wire` gains a REQUIRED `opts: Options` param. Both signatures are written
    // multi-line (one param per line) — the buggy line-by-line scan sees only
    // `export function wire(` with an unbalanced paren and drops the symbol entirely,
    // so the real 1→2 arity increase is never compared.
    const aDiff = [
      '-export function wire(',
      '-  handler: Handler',
      '-): void {}',
      '+export function wire(',
      '+  handler: Handler,',
      '+  opts: Options',
      '+): void {}',
    ].join('\n');
    const bDiff = '+  wire(handler);';
    const fileDiffs = new Map<string, string>([
      ['a.ts', aDiff],
      ['b.ts', bDiff],
    ]);

    const result = runSeamPass({
      chunks: [chunk('chunk-a', ['a.ts']), chunk('chunk-b', ['b.ts'])],
      splitClusterMarkers: [],
      fileDiffs,
    });

    const arityBreaks = result.findings.filter((f) => f.kind === 'changed-arity' && f.symbol === 'wire');
    expect(
      arityBreaks,
      'a multi-line signature gaining a required param consumed across a boundary must be flagged',
    ).toHaveLength(1);
  });
});

describe('TASK-438 — seam arity counts a required function-typed param', () => {
  it('counts a newly-added required callback param toward arity (no => default confusion)', () => {
    // `subscribe` gains a REQUIRED callback param `cb: (e) => void` after its existing
    // `topic` param. The buggy countRequired() sees `=>` in the callback type, matches
    // `p.includes('=')`, and discards the new callback as if it were defaulted — so both
    // sides count as arity 1 and the real 1→2 cross-boundary break is silently missed.
    const aDiff = [
      '-export function subscribe(topic: string): void {}',
      '+export function subscribe(topic: string, cb: (e: number) => void): void {}',
    ].join('\n');
    const bDiff = '+  subscribe("t");';
    const fileDiffs = new Map<string, string>([
      ['a.ts', aDiff],
      ['b.ts', bDiff],
    ]);

    const result = runSeamPass({
      chunks: [chunk('chunk-a', ['a.ts']), chunk('chunk-b', ['b.ts'])],
      splitClusterMarkers: [],
      fileDiffs,
    });

    const arityBreaks = result.findings.filter((f) => f.kind === 'changed-arity' && f.symbol === 'subscribe');
    expect(
      arityBreaks,
      'a required param added after a function-typed param must count toward arity',
    ).toHaveLength(1);
  });

  it('still suppresses a genuinely defaulted param (source-compatible)', () => {
    // Adding a DEFAULTED param after a callback is source-compatible — must NOT flag.
    const aDiff = [
      '-export function emit(cb: (e: number) => void): void {}',
      '+export function emit(cb: (e: number) => void, tag: string = "x"): void {}',
    ].join('\n');
    const bDiff = '+  emit(handler);';
    const fileDiffs = new Map<string, string>([
      ['a.ts', aDiff],
      ['b.ts', bDiff],
    ]);

    const result = runSeamPass({
      chunks: [chunk('chunk-a', ['a.ts']), chunk('chunk-b', ['b.ts'])],
      splitClusterMarkers: [],
      fileDiffs,
    });

    expect(result.findings.filter((f) => f.symbol === 'emit')).toHaveLength(0);
  });
});

describe('TASK-431 — seam pass emits changed-required-shape for interface/type', () => {
  it('flags a new REQUIRED interface field consumed across a boundary', () => {
    // `Config` gains a required `region: string`. A cross-chunk consumer that builds a
    // Config object without it now breaks, but the impl parses interfaces as null
    // (non-function) and treats the change as source-compatible.
    const aDiff = [
      '-export interface Config { host: string }',
      '+export interface Config { host: string; region: string }',
    ].join('\n');
    const bDiff = '+  const c: Config = { host: "h" };';
    const fileDiffs = new Map<string, string>([
      ['a.ts', aDiff],
      ['b.ts', bDiff],
    ]);

    const result = runSeamPass({
      chunks: [chunk('chunk-a', ['a.ts']), chunk('chunk-b', ['b.ts'])],
      splitClusterMarkers: [],
      fileDiffs,
    });

    const shapeBreaks = result.findings.filter(
      (f) => f.kind === 'changed-required-shape' && f.symbol === 'Config',
    );
    expect(
      shapeBreaks,
      'a new required interface field consumed across a boundary must be flagged',
    ).toHaveLength(1);
  });

  it('does NOT flag a new OPTIONAL interface field (source-compatible)', () => {
    const aDiff = [
      '-export interface Opts { a: string }',
      '+export interface Opts { a: string; b?: number }',
    ].join('\n');
    const bDiff = '+  const o: Opts = { a: "x" };';
    const fileDiffs = new Map<string, string>([
      ['a.ts', aDiff],
      ['b.ts', bDiff],
    ]);

    const result = runSeamPass({
      chunks: [chunk('chunk-a', ['a.ts']), chunk('chunk-b', ['b.ts'])],
      splitClusterMarkers: [],
      fileDiffs,
    });

    expect(result.findings.filter((f) => f.symbol === 'Opts')).toHaveLength(0);
  });
});
