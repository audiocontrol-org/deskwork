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
import { loadRoadmap, type RoadmapModel } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-cluster-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

/** Get a roadmap item or throw — keeps assertions cast-free (no `!`). */
function item(model: RoadmapModel, id: string): RoadmapModel['items'][number] {
  const it = model.byId.get(id);
  if (it === undefined) throw new Error(`expected roadmap item '${id}'`);
  return it;
}

describe('027 T010 — roadmap cluster', () => {
  it('create-NEW parent + part-of on each child; --chain on an already-satisfied dep is a no-op (no duplicate)', () => {
    // chain fixture: design:feature/a (shipped), impl:feature/b (planned, dep a),
    // impl:feature/c (planned, dep b). We cluster b + c under a brand-new parent.
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
    // The new parent is created `planned` (falsifiable: the id did not exist before).
    expect(item(model, 'multi:feature/grp').status).toBe('planned');
    // --summary is written as the new parent's scope prose (claude-03).
    expect(item(model, 'multi:feature/grp').scope).toContain('the grouped work');
    // Each child is grouped under the new parent (falsifiable: the edge was added).
    expect(item(model, 'impl:feature/b').partOf).toContain('multi:feature/grp');
    expect(item(model, 'impl:feature/c').partOf).toContain('multi:feature/grp');
    // c already depended on b in the fixture; --chain wiring b→c is a no-op-consistent
    // edge — it must NOT duplicate the dependency (falsifiable: a chain that re-added
    // `b` would make this 2). The fresh-children test below proves chain ADDS edges.
    const cDepsB = item(model, 'impl:feature/c').dependsOn.filter((d) => d === 'impl:feature/b');
    expect(cDepsB).toHaveLength(1);
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
    expect(item(model, 'impl:feature/b').dependsOn).not.toContain('impl:feature/c');
    expect(item(model, 'impl:feature/c').dependsOn).toContain('impl:feature/b');
    expect(item(model, 'impl:feature/d').dependsOn).toContain('impl:feature/c');
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
    expect(item(model, 'multi:feature/grp').status).toBe('in-flight');
    // Exactly one parent with that id (no duplicate heading).
    expect(model.items.filter((i) => i.identifier === 'multi:feature/grp').length).toBe(1);
    expect(item(model, 'impl:feature/b').partOf).toContain('multi:feature/grp');
    expect(item(model, 'impl:feature/c').partOf).toContain('multi:feature/grp');
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
    const child = item(loadRoadmap(docPath, ROADMAP_OPTS), 'impl:feature/b');
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
    // The edge is listed exactly once — no duplicate target.
    const child = item(loadRoadmap(docPath, ROADMAP_OPTS), 'impl:feature/b');
    expect(child.partOf.filter((p) => p === 'multi:feature/p1')).toHaveLength(1);
  });

  it('multi-LINE part-of: dedup is across BOTH lines; a new parent lands once (codex-02)', () => {
    // The document engine merges repeated `- part-of:` lines. A child carrying two
    // of them must dedup against the AGGREGATE: re-clustering under a parent already
    // present (on the 2nd line) is a no-op, and a NEW parent must be appended to
    // ONE line only — never re-added to each line (which duplicated the target).
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
      '- part-of: multi:feature/p2',
    ]);
    // (a) clustering under p2 (already present on the 2nd line) → no duplicate.
    const dup = runCli(['roadmap', 'cluster', 'multi:feature/p2', '--children', 'impl:feature/b', '--doc', docPath, '--apply']);
    expect(dup.status).toBe(0);
    const afterDup = item(loadRoadmap(docPath, ROADMAP_OPTS), 'impl:feature/b');
    expect(afterDup.partOf.filter((p) => p === 'multi:feature/p2')).toHaveLength(1);
    // (b) a NEW parent (p3, created) appears exactly once across the merged list.
    const add = runCli(['roadmap', 'cluster', 'multi:feature/p3', '--children', 'impl:feature/b', '--doc', docPath, '--apply']);
    expect(add.status).toBe(0);
    const afterAdd = item(loadRoadmap(docPath, ROADMAP_OPTS), 'impl:feature/b');
    expect(afterAdd.partOf.filter((p) => p === 'multi:feature/p3')).toHaveLength(1);
  });

  it('a child whose scope has a FENCED part-of example gets a REAL edge, not one in the fence (codex-01)', () => {
    // The document edge extractor ignores field-looking bullets inside ``` fences;
    // appendEdge must too. A child with only a fenced `- part-of:` example (and no
    // real metadata field) must gain a NEW real edge line — not have the edge
    // appended into the code fence, which would silently leave it ungrouped.
    const docPath = writeTempRoadmap([
      '## multi:feature/p',
      '- status: planned',
      '',
      '## impl:feature/b',
      '- status: planned',
      'Scope prose with a fenced example:',
      '```',
      '- part-of: multi:feature/example-not-real',
      '```',
    ]);
    const r = runCli(['roadmap', 'cluster', 'multi:feature/p', '--children', 'impl:feature/b', '--doc', docPath, '--apply']);
    expect(r.status).toBe(0);
    const child = item(loadRoadmap(docPath, ROADMAP_OPTS), 'impl:feature/b');
    // The REAL edge was created (child IS grouped); the fenced example is not an edge.
    expect(child.partOf).toContain('multi:feature/p');
    expect(child.partOf).not.toContain('multi:feature/example-not-real');
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
    expect(item(model, 'impl:feature/b').partOf).toContain('multi:feature/grp');
  });
});
