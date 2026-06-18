// T005 (RED-first, 027 Phase 2 Foundational) — FR-006 non-regression guard.
//
// After `roadmap` is mounted onto commander (T004), every existing subaction
// (`next/blocked/blocks/order/graph/add/advance/decompose/reclassify/defer/
// reconcile/close-related`) keeps its current behavior + flags + exit codes.
// One representative invocation per subaction, via the real `runCli` subprocess
// boundary, asserting the same key stdout markers + exit code the dedicated
// verb-*.test.ts suites lock — plus that `--doc` is accepted on each.
//
// This is the contract the commander mount must not break. It is RED until T004
// lands (the mount must preserve these exact shapes); it stays GREEN as the
// regression guard thereafter.

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-nonreg-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('027 T005 — roadmap subactions non-regression after commander mount', () => {
  it('next: lists the ready item with status, writes nothing, --doc accepted', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'next', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/b (planned)');
    expect(r.stdout).not.toContain('impl:feature/c');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('blocked: names the blocked item and its non-shipped dependency', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'blocked', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/c');
    expect(r.stdout).toContain('impl:feature/b');
  });

  it('blocks <id>: lists items depending on it; missing <id> → exit 2', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'blocks', 'design:feature/a', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/b');
    expect(r.stdout).not.toContain('impl:feature/c');
    expect(runCli(['roadmap', 'blocks', '--doc', docPath]).status).toBe(2);
  });

  it('order: emits a dependency-respecting order', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'order', '--doc', docPath]);
    expect(r.status).toBe(0);
    const out = r.stdout;
    expect(out.indexOf('design:feature/a')).toBeLessThan(out.indexOf('impl:feature/b'));
    expect(out.indexOf('impl:feature/b')).toBeLessThan(out.indexOf('impl:feature/c'));
  });

  it('graph: emits a mermaid flowchart; writes nothing', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'graph', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^flowchart/m);
    expect(r.stdout).toMatch(/-->/);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('add: dry-run previews and writes nothing; --apply captures one-move grouping', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const dry = runCli(['roadmap', 'add', 'impl:gap/z', '--doc', docPath]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('impl:gap/z');
    expect(readFileSync(docPath, 'utf8')).toBe(before);

    const apply = runCli([
      'roadmap', 'add', 'impl:fix/escaped-pipe',
      '--part-of', 'impl:feature/b',
      '--depends-on', 'design:feature/a',
      '--scope', 'found mid-build',
      '--doc', docPath, '--apply',
    ]);
    expect(apply.status).toBe(0);
    const item = loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:fix/escaped-pipe')!;
    expect(item.kind).toBe('fix');
    expect(item.partOf).toBe('impl:feature/b');
    expect(item.dependsOn).toEqual(['design:feature/a']);
  });

  it('advance --to: dry-run writes nothing; --apply changes status', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(runCli(['roadmap', 'advance', 'impl:feature/b', '--to', 'in-flight', '--doc', docPath]).status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
    expect(
      runCli(['roadmap', 'advance', 'impl:feature/b', '--to', 'in-flight', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!.status).toBe('in-flight');
  });

  it('decompose --into: splits and repoints dependents (--apply)', () => {
    const docPath = tmpCopy('chain');
    const r = runCli([
      'roadmap', 'decompose', 'impl:feature/b',
      '--into', 'impl:feature/b1,impl:feature/b2',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/b')).toBe(false);
    expect(model.byId.get('impl:feature/c')!.dependsOn).toEqual(['impl:feature/b1', 'impl:feature/b2']);
  });

  it('reclassify --to: renames the identifier (--apply)', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'reclassify', 'impl:feature/c', '--to', 'impl:gap/c', '--doc', docPath, '--apply']);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/c')).toBe(false);
    expect(model.byId.get('impl:gap/c')!.kind).toBe('gap');
  });

  it('defer --until sets and --clear removes the condition (--apply)', () => {
    const docPath = tmpCopy('chain');
    expect(
      runCli(['roadmap', 'defer', 'impl:feature/b', '--until', 'after the spike', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!.deferredUntil).toBe('after the spike');
    expect(runCli(['roadmap', 'defer', 'impl:feature/b', '--clear', '--doc', docPath, '--apply']).status).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!.deferredUntil).toBeNull();
  });

  it('reconcile: report-only (status drift + orphans + unresolved); writes nothing', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'roadmap-nonreg-reconcile-'));
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
        '## impl:feature/gone',
        '- status: planned',
        '- spec: specs/missing',
        '',
      ].join('\n'),
      'utf8',
    );
    const specDir = join(baseDir, 'specs', 'x');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'spec.md'), '# x', 'utf8');
    writeFileSync(join(specDir, 'tasks.md'), '- [x] T001 a\n', 'utf8');
    const orphanDir = join(baseDir, 'specs', 'orphan');
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(join(orphanDir, 'spec.md'), '# orphan', 'utf8');

    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'reconcile', '--doc', docPath], { cwd: baseDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/x');
    expect(r.stdout).toMatch(/shipped/);
    expect(r.stdout).toContain('orphan');
    expect(r.stdout).toContain('impl:feature/gone');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('close-related: dry-run by default; no recorded resolved items → nothing to close', () => {
    // The `chain` fixture items carry no `closes:`/`ref:`, so close-related on a
    // terminal item reports "nothing to close" (exit 0). design:feature/a is
    // `shipped` (a terminal status). This exercises the verb's read path + the
    // terminal-status gate without needing a backlog backend.
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'close-related', 'design:feature/a', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing to close/);
    expect(readFileSync(docPath, 'utf8')).toBe(before);

    // A non-terminal item refuses (exit 2).
    const refuse = runCli(['roadmap', 'close-related', 'impl:feature/b', '--doc', docPath]);
    expect(refuse.status).toBe(2);
  });
});
