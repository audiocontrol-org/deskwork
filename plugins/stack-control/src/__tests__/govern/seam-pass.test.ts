// 030 T038/T039 (RED first) — FR-014 / R7 / SC-003: the interface-level seam
// pass over cross-chunk boundaries flags a SUBSTANTIVE contract break (a
// removed/renamed export, a changed arity, or a changed required shape) only
// when it is consumed ACROSS a chunk boundary, and does NOT flag a
// source-compatible change (a new optional param, a new export, internal-only).
// The seam payload (signatures + changed-function headers only) fits the
// envelope, keyed on a seam id (not a phaseId). Watched to FAIL while runSeamPass
// / renderSeamPayload are 'not implemented' stubs (T041 makes them pass).

import { describe, expect, it } from 'vitest';
import { runSeamPass, renderSeamPayload } from '../../govern/seam-pass.js';
import { measureBoundaryFit } from '../../govern/phase-boundary-sizing.js';
import type { Chunk } from '../../govern/chunk-artifacts.js';

const chunks: Chunk[] = [
  { id: 'cA', files: ['src/a.ts'], splitCluster: false, renderedBytes: 50 },
  { id: 'cB', files: ['src/b.ts'], splitCluster: false, renderedBytes: 50 },
];

describe('030 T038 — seam pass substantive-break gate (FR-014, SC-003)', () => {
  it('flags a removed export consumed across a chunk boundary', () => {
    const fileDiffs = new Map<string, string>([
      ['src/a.ts', '-export function foo(x: number): void {}'], // foo removed in chunk A
      ['src/b.ts', '+foo(1);'], // chunk B still calls foo
    ]);
    const r = runSeamPass({ chunks, splitClusterMarkers: [], fileDiffs });
    expect(r.findings.length).toBe(1);
    expect(r.findings[0]?.kind).toBe('removed-export');
    expect(r.findings[0]?.symbol).toBe('foo');
    expect(r.findings.every((f) => f.consumedAcross)).toBe(true);
  });

  it('flags a changed arity (a new REQUIRED param) consumed across a boundary', () => {
    const fileDiffs = new Map<string, string>([
      ['src/a.ts', '-export function bar(x: number): void {}\n+export function bar(x: number, y: number): void {}'],
      ['src/b.ts', '+bar(1);'],
    ]);
    const r = runSeamPass({ chunks, splitClusterMarkers: [], fileDiffs });
    expect(r.findings.some((f) => f.kind === 'changed-arity' && f.symbol === 'bar')).toBe(true);
  });

  it('does NOT flag a source-compatible change (added optional param)', () => {
    const fileDiffs = new Map<string, string>([
      ['src/a.ts', '-export function baz(x: number): void {}\n+export function baz(x: number, y?: number): void {}'],
      ['src/b.ts', '+baz(1);'],
    ]);
    const r = runSeamPass({ chunks, splitClusterMarkers: [], fileDiffs });
    expect(r.findings.length).toBe(0);
    expect(r.suppressedCompatible).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag a removed export that is NOT consumed across a boundary', () => {
    const fileDiffs = new Map<string, string>([
      ['src/a.ts', '-export function lonely(): void {}'],
      ['src/b.ts', '+const unrelated = 1;'],
    ]);
    const r = runSeamPass({ chunks, splitClusterMarkers: [], fileDiffs });
    expect(r.findings.length).toBe(0);
  });
});

describe('030 T039 — seam payload fits the envelope (FR-014)', () => {
  it('renders a signatures-only payload measured ≤ envelope, keyed on a seam id', () => {
    const fileDiffs = new Map<string, string>([
      ['src/a.ts', '-export function foo(x: number): void {}'],
      ['src/b.ts', '+foo(1);'],
    ]);
    const payload = renderSeamPayload({ chunks, splitClusterMarkers: [], fileDiffs });
    const m = measureBoundaryFit('seam-1', Buffer.byteLength(payload) + 1, 1_000_000);
    expect(m.id).toBe('seam-1');
    expect(m.disposition).toBe('fits');
  });
});
