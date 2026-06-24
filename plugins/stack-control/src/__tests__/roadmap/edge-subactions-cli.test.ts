// T071 (RED-first, US2, 028) — the five roadmap edge sub-actions wired into the
// CLI: add-edge / remove-edge / move-edge / rename / remove-node. Each is dry-run
// unless --apply, preserves the roadmap exit-code contract (usage/validation →
// exit 2), and has a working `--help` (exit 0 with a usage body) (FR-014; contract
// RM1).

import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

const NODES = [
  '## design:feature/a',
  '- status: shipped',
  '',
  '## design:feature/b',
  '- status: shipped',
  '',
  '## impl:feature/x',
  '- status: planned',
  '- depends-on: design:feature/a',
];

describe('stackctl roadmap edge sub-actions (T071)', () => {
  it('add-edge --apply adds a typed edge; dry-run writes nothing', () => {
    const docPath = writeTempRoadmap(NODES);
    const before = readFileSync(docPath, 'utf8');
    expect(
      runCli(['roadmap', 'add-edge', 'impl:feature/x', '--field', 'depends-on', '--to', 'design:feature/b', '--doc', docPath]).status,
    ).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toBe(before); // dry-run

    expect(
      runCli(['roadmap', 'add-edge', 'impl:feature/x', '--field', 'depends-on', '--to', 'design:feature/b', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/x')!.dependsOn).toEqual([
      'design:feature/a',
      'design:feature/b',
    ]);
  });

  it('remove-edge --apply removes a target', () => {
    const docPath = writeTempRoadmap(NODES);
    expect(
      runCli(['roadmap', 'remove-edge', 'impl:feature/x', '--field', 'depends-on', '--to', 'design:feature/a', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/x')!.dependsOn).toEqual([]);
  });

  it('move-edge --apply reparents; a --from that does not hold the edge → exit 2', () => {
    const docPath = writeTempRoadmap(NODES);
    expect(
      runCli(['roadmap', 'move-edge', 'impl:feature/x', '--field', 'depends-on', '--from', 'design:feature/a', '--to', 'design:feature/b', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/x')!.dependsOn).toEqual([
      'design:feature/b',
    ]);

    const docPath2 = writeTempRoadmap(NODES);
    const before = readFileSync(docPath2, 'utf8');
    expect(
      runCli(['roadmap', 'move-edge', 'impl:feature/x', '--field', 'depends-on', '--from', 'design:feature/b', '--to', 'design:feature/a', '--doc', docPath2, '--apply']).status,
    ).toBe(2);
    expect(readFileSync(docPath2, 'utf8')).toBe(before);
  });

  it('rename --apply renames a node and repoints dependents', () => {
    const docPath = writeTempRoadmap(NODES);
    expect(
      runCli(['roadmap', 'rename', 'design:feature/a', '--to', 'design:feature/renamed', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('design:feature/renamed')).toBe(true);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual(['design:feature/renamed']);
  });

  it('remove-node --apply removes an unreferenced node; refuses a still-targeted node → exit 2', () => {
    const docPath = writeTempRoadmap(NODES);
    // design:feature/b is unreferenced — removable.
    expect(
      runCli(['roadmap', 'remove-node', 'design:feature/b', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.has('design:feature/b')).toBe(false);

    const docPath2 = writeTempRoadmap(NODES);
    const before = readFileSync(docPath2, 'utf8');
    // design:feature/a is still a depends-on target — must refuse.
    expect(
      runCli(['roadmap', 'remove-node', 'design:feature/a', '--doc', docPath2, '--apply']).status,
    ).toBe(2);
    expect(readFileSync(docPath2, 'utf8')).toBe(before);
  });

  it('each edge sub-action has a working --help (exit 0 + usage body)', () => {
    for (const sub of ['add-edge', 'remove-edge', 'move-edge', 'rename', 'remove-node', 'approve-design']) {
      const r = runCli(['roadmap', sub, '--help']);
      expect(r.status, `${sub} --help exit`).toBe(0);
      expect(r.stdout, `${sub} --help body`).toContain('Usage: stackctl roadmap');
      expect(r.stdout.length, `${sub} --help non-empty`).toBeGreaterThan(0);
    }
  });

  it('a missing required value flag → exit 2 (usage)', () => {
    const docPath = writeTempRoadmap(NODES);
    // add-edge with no --to is a usage error.
    expect(
      runCli(['roadmap', 'add-edge', 'impl:feature/x', '--field', 'depends-on', '--doc', docPath, '--apply']).status,
    ).toBe(2);
  });

  it('approve-design --apply writes the marker; --analyze-clean writes the symmetric one', () => {
    const docPath = writeTempRoadmap(['## design:feature/a', '- status: in-flight']);
    expect(
      runCli(['roadmap', 'approve-design', 'design:feature/a', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('design:feature/a')!.designApproved).toBe(true);

    expect(
      runCli(['roadmap', 'approve-design', 'design:feature/a', '--analyze-clean', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('design:feature/a')!.analyzeClean).toBe(true);

    // 032 follow-up: --validated records the validating→closed gate marker (the mechanical
    // record path the validating phase needs — no hand-edit of ROADMAP.md).
    expect(
      runCli(['roadmap', 'approve-design', 'design:feature/a', '--validated', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('design:feature/a')!.validated).toBe(true);
  });

  it('reconcile --unorphan on a non-orphan → exit 2; bare reconcile stays report-only exit 0', () => {
    const docPath = writeTempRoadmap(['## impl:feature/known', '- status: planned']);
    // bare reconcile is report-only (no specs/ dir is fine — fail-loud only on missing glob parent).
    // A non-orphan spec passed to --unorphan is a usage/validation error → exit 2.
    expect(
      runCli(['roadmap', 'reconcile', '--unorphan', 'specs/no-such-orphan', '--doc', docPath, '--apply']).status,
    ).toBe(2);
    // Bare reconcile (no --unorphan) stays report-only → exit 0 (the invariant the
    // test name promises; AUDIT-BARRAGE-claude-07). Needs a specs/ glob-parent next
    // to the doc so reconcile can resolve correspondences (else it fails loud).
    mkdirSync(join(dirname(docPath), 'specs'), { recursive: true });
    const bare = runCli(['roadmap', 'reconcile', '--doc', docPath]);
    expect(bare.status, bare.stderr).toBe(0);
  });
});
