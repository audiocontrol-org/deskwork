// T011 (RED-first, 027 Phase 4 US2) — `roadmap cluster` refusals: every invalid
// request exits 2 and leaves ROADMAP.md byte-for-byte unchanged (FR-011..015,
// CHK002/003/004/009/011). The byte-for-byte assertion is the zero-write contract:
// read the file before and after, assert equal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { writeTempRoadmap } from './helpers.js';

/** A roadmap with a small graph: a (shipped), b (dep a), c (dep b). */
function tmpGraph(): string {
  return writeTempRoadmap([
    '## design:feature/a',
    '- status: shipped',
    '',
    '## impl:feature/b',
    '- status: planned',
    '- depends-on: design:feature/a',
    '',
    '## impl:feature/c',
    '- status: planned',
    '- depends-on: impl:feature/b',
  ]);
}

describe('027 T011 — roadmap cluster refusals (exit 2, byte-for-byte unchanged)', () => {
  it('a --children id that does not exist → exit 2, zero write', () => {
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/nope',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('empty --children value → exit 2, zero write', () => {
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', ',',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('omitted --children → exit 2, zero write', () => {
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('parent-id equals one of the children → exit 2, zero write', () => {
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'impl:feature/b',
      '--children', 'impl:feature/b,impl:feature/c',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('a --chain ordering that creates a cycle → exit 2, zero write', () => {
    // a is shipped, b depends on a, c depends on b. Chaining c→b→a-style in the
    // reverse direction (children a,b means b depends on a — fine; but children
    // c,b means b depends on c, while c already depends on b → cycle).
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/c,impl:feature/b',
      '--chain',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('a child already carrying a CONFLICTING different depends-on under --chain → exit 2, zero write', () => {
    // FR-014: child `c` already depends on `a` (a DIFFERENT predecessor than the
    // chain would set). Chaining b,c sets c.depends-on = b, conflicting with the
    // recorded c.depends-on = a → REFUSE.
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/b',
      '- status: planned',
      '',
      '## impl:feature/c',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--chain',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('dry-run default writes nothing even when the request is valid', () => {
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b',
      '--doc', docPath,
    ]);
    expect(r.status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('a --chain that forms a real cycle → exit 2 via whole-graph revalidation, zero write (claude-02)', () => {
    // x and y have NO pre-existing depends-on between them in chain order, so the
    // pre-write chainPredecessor conflict guard does NOT fire — this exercises
    // commitCandidate's whole-graph cycle detection (the defense-in-depth path the
    // prior 'cycle' test actually triggered via the conflict guard, not the cycle).
    // Setup: y already depends-on x; cluster --children y,x --chain adds x→y,
    // closing the cycle x→y→x.
    const docPath = writeTempRoadmap([
      '## impl:feature/x',
      '- status: planned',
      '',
      '## impl:feature/y',
      '- status: planned',
      '- depends-on: impl:feature/x',
    ]);
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/y,impl:feature/x',
      '--chain',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('a duplicate id in --children → exit 2 with a clear message, zero write (claude-05)', () => {
    const docPath = tmpGraph();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/b',
      '--chain',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('listed more than once in --children');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
