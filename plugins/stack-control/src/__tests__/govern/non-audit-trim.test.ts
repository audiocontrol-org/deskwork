// 030 T012 (RED first) — FR-006 / R2: the cheap non-audit-byte trim pre-pass
// drops lockfile / generated / vendored / whitespace-only / fixture bytes from a
// cluster's payload and records each dropped category + byte count (recorded,
// not silent). Normal source files are kept untouched. Watched to FAIL while
// trimNonAuditBytes is a 'not implemented' stub (Phase 3 T018 makes it pass).

import { describe, expect, it } from 'vitest';
import { trimNonAuditBytes } from '../../govern/cluster-payload/non-audit-trim.js';

describe('030 T012 — non-audit trim pre-pass (FR-006, R2)', () => {
  it('drops a lockfile and records the category + byte count', () => {
    const diff = '+ "x": "1.0.0"';
    const r = trimNonAuditBytes([{ path: 'package-lock.json', diffText: diff }]);
    expect(r.kept).toEqual([]);
    expect(r.trimApplied).toEqual([{ category: 'lockfile', bytes: diff.length }]);
  });

  it('drops vendored and generated output', () => {
    const r = trimNonAuditBytes([
      { path: 'node_modules/x/index.js', diffText: 'a' },
      { path: 'dist/bundle.js', diffText: 'bb' },
      { path: 'src/app.min.js', diffText: 'ccc' },
    ]);
    expect(r.kept).toEqual([]);
    expect(r.trimApplied.map((t) => t.category).sort()).toEqual(['generated', 'generated', 'vendored']);
  });

  it('drops a fixture path', () => {
    const r = trimNonAuditBytes([{ path: 'tests/fixtures/sample.md', diffText: 'x' }]);
    expect(r.trimApplied[0]?.category).toBe('fixture');
    expect(r.kept).toEqual([]);
  });

  it('drops a whitespace-only diff (non-whitespace content unchanged)', () => {
    const r = trimNonAuditBytes([{ path: 'src/x.ts', diffText: '+  const x = 1;\n-const x = 1;' }]);
    expect(r.trimApplied[0]?.category).toBe('whitespace');
  });

  it('keeps a normal source file untouched', () => {
    const files = [{ path: 'src/app.ts', diffText: '+export const y = 2;' }];
    const r = trimNonAuditBytes(files);
    expect(r.kept).toEqual(files);
    expect(r.trimApplied).toEqual([]);
  });
});
