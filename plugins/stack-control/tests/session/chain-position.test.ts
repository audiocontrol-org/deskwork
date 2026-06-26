// 011 T006 (RED-first) — Spec Kit authoring-chain position inferred from
// .specify/feature.json + the artifact set present in the feature dir (research
// D4 / FR-003 / FR-005). Pure function over the repo root. Reads the authoring
// tool's OWN pointer rather than inventing a parallel "active feature" notion
// (Principle VIII).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inferChainPosition, artifactRelPath } from '../../src/session/chain-position.js';

let root: string;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function mkRepo(): string {
  return mkdtempSync(join(tmpdir(), 'sc-chain-'));
}

function setFeature(repoRoot: string, featureDir: string): void {
  mkdirSync(join(repoRoot, '.specify'), { recursive: true });
  writeFileSync(
    join(repoRoot, '.specify', 'feature.json'),
    JSON.stringify({ feature_directory: featureDir }),
  );
}

function mkArtifacts(repoRoot: string, dir: string, artifacts: string[]): void {
  const abs = join(repoRoot, dir);
  mkdirSync(abs, { recursive: true });
  for (const a of artifacts) {
    if (a.endsWith('/')) mkdirSync(join(abs, a), { recursive: true });
    else writeFileSync(join(abs, a), '# stub\n');
  }
}

describe('inferChainPosition', () => {
  it('infers analyze when the full artifact set (incl. tasks) is present', () => {
    root = mkRepo();
    setFeature(root, 'specs/011-x');
    mkArtifacts(root, 'specs/011-x', [
      'spec.md',
      'plan.md',
      'research.md',
      'data-model.md',
      'contracts/',
      'checklists/',
      'tasks.md',
    ]);
    const pos = inferChainPosition(root);
    expect(pos).not.toBeNull();
    expect(pos!.nextStep).toBe('analyze');
    expect(pos!.artifactsPresent).toEqual(
      expect.arrayContaining(['spec', 'plan', 'research', 'data-model', 'contracts', 'checklists', 'tasks']),
    );
    expect(pos!.featureDir).toBe('specs/011-x');
  });

  it('infers tasks when plan exists but tasks do not (plan-no-tasks → tasks)', () => {
    root = mkRepo();
    setFeature(root, 'specs/011-x');
    mkArtifacts(root, 'specs/011-x', ['spec.md', 'plan.md', 'research.md']);
    expect(inferChainPosition(root)!.nextStep).toBe('tasks');
  });

  it('infers plan when only the spec exists', () => {
    root = mkRepo();
    setFeature(root, 'specs/011-x');
    mkArtifacts(root, 'specs/011-x', ['spec.md']);
    expect(inferChainPosition(root)!.nextStep).toBe('plan');
  });

  it('returns null when .specify/feature.json is absent (no active spec, FR-005)', () => {
    root = mkRepo();
    expect(inferChainPosition(root)).toBeNull();
  });

  it('returns null when feature.json points at a nonexistent dir', () => {
    root = mkRepo();
    setFeature(root, 'specs/does-not-exist');
    expect(inferChainPosition(root)).toBeNull();
  });

  // AUDIT-20260619-72 (TASK-309): the fully-implemented suppression reads the
  // `tasks.md` path from the SAME table that populates `present`, via
  // artifactRelPath — so the presence check and the freshness read cannot drift
  // onto different files. This exercises that guard end-to-end (a fully-checked
  // tasks.md ⇒ no active spec), and pins the resolver as the single source.
  it('suppresses a fully-implemented spec (all task boxes checked → null)', () => {
    root = mkRepo();
    setFeature(root, 'specs/011-x');
    mkdirSync(join(root, 'specs/011-x'), { recursive: true });
    writeFileSync(join(root, 'specs/011-x', 'spec.md'), '# stub\n');
    writeFileSync(join(root, 'specs/011-x', 'plan.md'), '# stub\n');
    writeFileSync(join(root, 'specs/011-x', 'tasks.md'), '- [x] T001 done\n- [X] T002 done\n');
    expect(inferChainPosition(root)).toBeNull();
  });

  it('artifactRelPath is the single source for each artifact path (no drift)', () => {
    expect(artifactRelPath('tasks')).toBe('tasks.md');
    expect(artifactRelPath('spec')).toBe('spec.md');
    expect(artifactRelPath('contracts')).toBe('contracts');
    // An unmapped artifact fails loud rather than silently returning a default.
    // @ts-expect-error — exercising the runtime guard with a non-artifact value.
    expect(() => artifactRelPath('nope')).toThrow(/no path mapping/);
  });
});
