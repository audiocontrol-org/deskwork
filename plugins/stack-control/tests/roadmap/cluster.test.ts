// T010 (RED-first, 027 Phase 4 US2) — `roadmap cluster`: group N existing items
// under a created-or-reused parent + optional dependency chain, atomically, via
// the real `runCli` subprocess boundary (FR-007..011, CHK001/007/008/020).
//
// The cluster verb composes the existing mutation machinery into ONE
// build→revalidate→write: create-or-reuse the parent, attach a `part-of` edge per
// child (multi-parent append; exact-dup no-op), and (with --chain) wire
// `depends-on` over the children in argument order. Dry-run is the default; only
// `--apply` writes.

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-cluster-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('027 T010 — roadmap cluster', () => {
  it('create-NEW parent + --chain: wires part-of on each child and depends-on a→b→c', () => {
    // chain fixture: design:feature/a (shipped), impl:feature/b (planned, dep a),
    // impl:feature/c (planned, dep b). We cluster b + c under a brand-new parent
    // and chain them. The new parent must be created `planned`.
    const docPath = tmpCopy('chain');
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--chain',
      '--summary', 'the grouped work',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const parent = model.byId.get('multi:feature/grp');
    expect(parent).toBeDefined();
    expect(parent!.status).toBe('planned');
    // Each child is grouped under the new parent.
    expect(model.byId.get('impl:feature/b')!.partOf).toContain('multi:feature/grp');
    expect(model.byId.get('impl:feature/c')!.partOf).toContain('multi:feature/grp');
    // --chain wires depends-on in argument order: b → c (c depends on b). c already
    // depended on b in the fixture, so this is a no-op-consistent edge, not a conflict.
    expect(model.byId.get('impl:feature/c')!.dependsOn).toContain('impl:feature/b');
  });

  it('--chain wires depends-on in argument order over fresh children (b→c→d)', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/b',
      '- status: planned',
      '',
      '## impl:feature/c',
      '- status: planned',
      '',
      '## impl:feature/d',
      '- status: planned',
    ]);
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c,impl:feature/d',
      '--chain',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    // b is first → no chain dep; c depends on b; d depends on c.
    expect(model.byId.get('impl:feature/b')!.dependsOn).not.toContain('impl:feature/c');
    expect(model.byId.get('impl:feature/c')!.dependsOn).toContain('impl:feature/b');
    expect(model.byId.get('impl:feature/d')!.dependsOn).toContain('impl:feature/c');
  });

  it('reuse EXISTING parent: no duplicate parent is created; children grouped under it', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/grp',
      '- status: in-flight',
      '',
      '## impl:feature/b',
      '- status: planned',
      '',
      '## impl:feature/c',
      '- status: planned',
    ]);
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    // The reused parent keeps its existing status (not reset to planned).
    expect(model.byId.get('multi:feature/grp')!.status).toBe('in-flight');
    // Exactly one parent with that id (no duplicate heading).
    expect(model.items.filter((i) => i.identifier === 'multi:feature/grp').length).toBe(1);
    expect(model.byId.get('impl:feature/b')!.partOf).toContain('multi:feature/grp');
    expect(model.byId.get('impl:feature/c')!.partOf).toContain('multi:feature/grp');
  });

  it('multi-parent: a child already part-of a different parent gains the new edge ALONGSIDE', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/p1',
      '- status: planned',
      '',
      '## multi:feature/p2',
      '- status: planned',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- part-of: multi:feature/p1',
    ]);
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/p2',
      '--children', 'impl:feature/b',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const child = loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!;
    // Both parents are present — the original is not replaced.
    expect(child.partOf).toContain('multi:feature/p1');
    expect(child.partOf).toContain('multi:feature/p2');
  });

  it('exact-duplicate part-of is a no-op (not an error)', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/p1',
      '- status: planned',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- part-of: multi:feature/p1',
    ]);
    const r = runCli([
      'roadmap', 'cluster', 'multi:feature/p1',
      '--children', 'impl:feature/b',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const child = loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!;
    // The edge is listed exactly once — no duplicate target.
    expect(child.partOf.filter((p) => p === 'multi:feature/p1').length).toBe(1);
  });

  it('dry-run default writes NOTHING; --apply performs the write', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const dry = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--chain',
      '--doc', docPath,
    ]);
    expect(dry.status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toBe(before); // dry-run wrote nothing
    // The dry-run still describes the intended mutation.
    expect(dry.stdout).toContain('multi:feature/grp');

    const apply = runCli([
      'roadmap', 'cluster', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--chain',
      '--doc', docPath, '--apply',
    ]);
    expect(apply.status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).not.toBe(before); // --apply wrote
  });

  it('the `group` alias behaves identically to `cluster`', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/b',
      '- status: planned',
      '',
      '## impl:feature/c',
      '- status: planned',
    ]);
    const r = runCli([
      'roadmap', 'group', 'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('multi:feature/grp')).toBeDefined();
    expect(model.byId.get('impl:feature/b')!.partOf).toContain('multi:feature/grp');
  });
});
