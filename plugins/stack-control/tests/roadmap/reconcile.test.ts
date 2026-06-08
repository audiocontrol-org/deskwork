// T044 (RED-first, US5, 006) — reconcile is REPORT-ONLY: it proposes status
// drift from the on-disk artifact progression at each item's `spec:` path, lists
// orphan spec dirs (via the declared glob), and reports unresolved
// correspondences (never guessed). The document is byte-for-byte unchanged
// before/after (FR-016/016a/016b/017). No git/gh.

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcile } from '../../src/roadmap/reconcile.js';
import { ROADMAP_OPTS } from './helpers.js';

function buildTree(): { docPath: string; baseDir: string } {
  const baseDir = mkdtempSync(join(tmpdir(), 'reconcile-'));
  const docPath = join(baseDir, 'ROADMAP.md');
  writeFileSync(
    docPath,
    [
      '---',
      'doc-grammar: roadmap',
      '---',
      '',
      '# roadmap',
      '',
      '## impl:feature/x',
      '- status: in-flight',
      '- spec: specs/x',
      '',
      '## impl:feature/y',
      '- status: planned',
      '- spec: specs/y',
      '',
      '## impl:feature/gone',
      '- status: planned',
      '- spec: specs/missing',
      '',
    ].join('\n'),
    'utf8',
  );
  const mk = (dir: string, files: Record<string, string>) => {
    const d = join(baseDir, 'specs', dir);
    mkdirSync(d, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body, 'utf8');
  };
  // x: tasks all checked ⇒ propose shipped.
  mk('x', { 'spec.md': '# x', 'tasks.md': '- [x] T001 a\n- [x] T002 b\n' });
  // y: a task unchecked ⇒ no shipped proposal.
  mk('y', { 'spec.md': '# y', 'tasks.md': '- [x] T001 a\n- [ ] T002 b\n' });
  // an orphan spec dir referenced by no item.
  mk('orphan', { 'spec.md': '# orphan' });
  return { docPath, baseDir };
}

describe('reconcile (T044)', () => {
  it('proposes advancing the tasks-complete item to shipped', () => {
    const { docPath, baseDir } = buildTree();
    const report = reconcile(docPath, ROADMAP_OPTS, baseDir);
    const drift = report.statusDrift.find((d) => d.identifier === 'impl:feature/x');
    expect(drift).toBeDefined();
    expect(drift!.recorded).toBe('in-flight');
    expect(drift!.onDisk).toBe('shipped');
    // y is not proposed (a task is still unchecked).
    expect(report.statusDrift.some((d) => d.identifier === 'impl:feature/y')).toBe(false);
  });

  it('lists orphan spec dirs (no roadmap item references them)', () => {
    const { docPath, baseDir } = buildTree();
    const report = reconcile(docPath, ROADMAP_OPTS, baseDir);
    expect(report.orphans.some((o) => o.includes('orphan'))).toBe(true);
    expect(report.orphans.some((o) => o.includes('specs/x'))).toBe(false);
  });

  it('reports unresolved correspondences (spec path with no dir) — never guessed', () => {
    const { docPath, baseDir } = buildTree();
    const report = reconcile(docPath, ROADMAP_OPTS, baseDir);
    expect(report.unresolved).toContain('impl:feature/gone');
  });

  it('writes nothing — document byte-for-byte unchanged', () => {
    const { docPath, baseDir } = buildTree();
    const before = readFileSync(docPath, 'utf8');
    reconcile(docPath, ROADMAP_OPTS, baseDir);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
