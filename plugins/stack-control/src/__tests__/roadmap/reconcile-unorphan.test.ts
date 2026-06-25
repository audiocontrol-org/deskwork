// T073 (RED-first, US2, 028) — roadmap.reconcileUnorphan: resolve a reported
// orphan spec dir into a roadmap node + a `spec:` edge (NO ROADMAP.md hand-edit —
// uses the node/edge mutations). A non-orphan `<spec>` → DocumentModelError
// (exit-2 class). Bare `reconcile` stays report-only (FR-015; contract RM2;
// TASK-133).

import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { reconcile, reconcileUnorphan } from '../../roadmap/reconcile.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { DocumentModelError } from '../../document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

/** Create a `specs/<id>/spec.md` next to the roadmap doc; returns the rel path. */
function writeSpecDir(docPath: string, id: string): string {
  const baseDir = dirname(docPath);
  const rel = join('specs', id);
  const abs = join(baseDir, rel);
  mkdirSync(abs, { recursive: true });
  writeFileSync(join(abs, 'spec.md'), `# spec ${id}\n`, 'utf8');
  return rel;
}

describe('roadmap.reconcileUnorphan (T073)', () => {
  it('resolves a reported orphan into a node + spec: edge (--apply, no hand-edit)', () => {
    const docPath = writeTempRoadmap(['## impl:feature/known', '- status: planned']);
    const orphanRel = writeSpecDir(docPath, '099-emergent-spec');
    // The dir IS an orphan first (reconcile lists it, no node references it).
    const baseDir = dirname(docPath);
    const before = reconcile(docPath, ROADMAP_OPTS, baseDir);
    expect(before.orphans).toContain(orphanRel);

    reconcileUnorphan(docPath, orphanRel, ROADMAP_OPTS, baseDir, true);

    // A node now references the formerly-orphan spec DIR; reconcile no longer lists it.
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const resolver = model.items.find((i) => i.spec !== null && i.spec.replace(/\/$/, '') === orphanRel);
    expect(resolver).toBeDefined();
    expect(resolver!.spec!.replace(/\/$/, '')).toBe(orphanRel);
    const after = reconcile(docPath, ROADMAP_OPTS, baseDir);
    expect(after.orphans).not.toContain(orphanRel);
  });

  it('dry-run (apply=false) writes nothing', () => {
    const docPath = writeTempRoadmap(['## impl:feature/known', '- status: planned']);
    const orphanRel = writeSpecDir(docPath, '098-dry');
    const baseDir = dirname(docPath);
    const before = readFileSync(docPath, 'utf8');
    const result = reconcileUnorphan(docPath, orphanRel, ROADMAP_OPTS, baseDir, false);
    expect(result.applied).toBe(false);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses a <spec> that is NOT an orphan (already referenced) zero-write', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/known',
      '- status: planned',
      '- spec: specs/097-already',
    ]);
    const referencedRel = writeSpecDir(docPath, '097-already');
    const baseDir = dirname(docPath);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      reconcileUnorphan(docPath, referencedRel, ROADMAP_OPTS, baseDir, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses a <spec> dir that does not exist (not an orphan) zero-write', () => {
    const docPath = writeTempRoadmap(['## impl:feature/known', '- status: planned']);
    const baseDir = dirname(docPath);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      reconcileUnorphan(docPath, 'specs/no-such-dir', ROADMAP_OPTS, baseDir, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  // gh-506: an existing `*:feature/<slug>` node whose slug matches the orphan
  // spec's slug (the NNN- numeric prefix stripped) is the real node — attach the
  // spec to it instead of minting a parallel `impl:feature/<NNN-slug>` duplicate.
  it('attaches the spec to an existing same-slug node instead of minting a duplicate (gh-506)', () => {
    const docPath = writeTempRoadmap(['## design:feature/faithful-capture-substrate', '- status: planned']);
    const orphanRel = writeSpecDir(docPath, '010-faithful-capture-substrate');
    const baseDir = dirname(docPath);
    expect(reconcile(docPath, ROADMAP_OPTS, baseDir).orphans).toContain(orphanRel);

    const before = loadRoadmap(docPath, ROADMAP_OPTS).items.length;
    reconcileUnorphan(docPath, orphanRel, ROADMAP_OPTS, baseDir, true);

    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    // No duplicate node minted.
    expect(model.items.length).toBe(before);
    expect(model.items.find((i) => i.identifier === 'impl:feature/010-faithful-capture-substrate')).toBeUndefined();
    // The EXISTING design node now carries the spec correspondence.
    const node = model.items.find((i) => i.identifier === 'design:feature/faithful-capture-substrate');
    expect(node?.spec?.replace(/\/$/, '')).toBe(orphanRel);
    expect(reconcile(docPath, ROADMAP_OPTS, baseDir).orphans).not.toContain(orphanRel);
  });

  it('refuses (zero-write) when MULTIPLE existing nodes plausibly match the orphan slug (gh-506)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/ambig',
      '- status: planned',
      '## impl:feature/ambig',
      '- status: planned',
    ]);
    const orphanRel = writeSpecDir(docPath, '011-ambig');
    const baseDir = dirname(docPath);
    const before = readFileSync(docPath, 'utf8');
    expect(() => reconcileUnorphan(docPath, orphanRel, ROADMAP_OPTS, baseDir, true)).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses (zero-write) when the matching node already corresponds to a DIFFERENT spec (gh-506)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/taken',
      '- status: planned',
      '- spec: specs/100-other',
    ]);
    writeSpecDir(docPath, '100-other');
    const orphanRel = writeSpecDir(docPath, '012-taken');
    const baseDir = dirname(docPath);
    const before = readFileSync(docPath, 'utf8');
    expect(() => reconcileUnorphan(docPath, orphanRel, ROADMAP_OPTS, baseDir, true)).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('still mints a new node when NO existing node corresponds to the orphan slug (gh-506)', () => {
    const docPath = writeTempRoadmap(['## impl:feature/unrelated', '- status: planned']);
    const orphanRel = writeSpecDir(docPath, '013-brand-new');
    const baseDir = dirname(docPath);
    reconcileUnorphan(docPath, orphanRel, ROADMAP_OPTS, baseDir, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const minted = model.items.find((i) => i.identifier === 'impl:feature/013-brand-new');
    expect(minted).toBeDefined();
    expect(minted?.spec?.replace(/\/$/, '')).toBe(orphanRel);
  });
});
