// 026 T022 + T024 (rewired for 030 FR-018/025) — the US3 backstop. `capability reconcile`
// flags un-governed spec-execution state (a feature with tasks.md but no CONVERGED
// whole-feature governance record), report-only (exit 0, no mutation). T024: the SAME
// un-governed feature cannot graduate — the reconciler reads exactly the gate's signal
// (`isImplFeatureConverged`), keyed by the feature's roadmap node (the two halves of the
// backstop). The per-phase checkpoint apparatus this backstop used to read is retired
// (030 clean break).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { convergenceKeyFor } from '../../workflow/identity.js';
import { findInstallation } from '../../config/installation.js';
import {
  isImplFeatureConverged,
  writeWholeFeatureConvergenceRecord,
  type WholeFeatureConvergenceRecord,
} from '../../govern/chunk-artifacts.js';
import { reconcileCapabilities, reconcileVerb, renderReconcile } from '../../subcommands/capability-reconcile.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function installAt(root: string) {
  const installation = findInstallation(root);
  if (installation === null) throw new Error(`no installation at ${root}`);
  return installation;
}

/** A converged whole-feature record keyed for `item` under `root`. */
function convergedRecord(item: string, root: string): WholeFeatureConvergenceRecord {
  return {
    version: 1,
    mode: 'impl',
    item,
    governedShaBase: 'base0',
    headSha: 'head0',
    chunkIds: ['c1'],
    rounds: 1,
    liftedFindings: [],
    closedInLoopFindings: [],
    seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 },
    splitClusterRefs: [],
    outcome: 'converged',
    anchorRoot: root,
  };
}

describe('capability reconcile — US3 backstop (026 T022, 030-rewired)', () => {
  it('flags a feature with a roadmap node but no converged whole-feature record', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/099-demo' }]);
    f.writeSpecTasks('specs/099-demo', false);
    const findings = reconcileCapabilities(installAt(f.root));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.capability).toBe('spec-execution');
    expect(findings[0]!.evidence).toBe('099-demo');
    expect(findings[0]!.reason).toBe('no converged whole-feature governance record');
  });

  it('does NOT flag a feature whose whole-feature record is converged', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/099-demo' }]);
    f.writeSpecTasks('specs/099-demo', true);
    const item = loadRoadmap(f.roadmapPath, f.opts).byId.get('multi:feature/a')!;
    writeWholeFeatureConvergenceRecord(f.root, convergedRecord(convergenceKeyFor(item), f.root));
    expect(reconcileCapabilities(installAt(f.root))).toEqual([]);
  });

  it('reports nothing when there are no spec features', () => {
    const f = fixture();
    expect(reconcileCapabilities(installAt(f.root))).toEqual([]);
  });

  it('flags an orphan feature (tasks.md but no roadmap node) without aborting the scan', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/099-demo' }]);
    f.writeSpecTasks('specs/099-demo', true);
    f.writeSpecTasks('specs/077-orphan', true); // no roadmap node references this dir
    const findings = reconcileCapabilities(installAt(f.root));
    const orphan = findings.find((x) => x.evidence === '077-orphan');
    expect(orphan).toBeDefined();
    expect(orphan!.reason).toMatch(/unresolvable/);
    // the scan still reaches the other (un-converged) feature
    expect(findings.find((x) => x.evidence === '099-demo')).toBeDefined();
  });

  it('renderReconcile is report-only (exit 0) for empty and non-empty; --json shape', () => {
    expect(renderReconcile([], false).code).toBe(0);
    const finding = { capability: 'spec-execution', evidence: 'f', reason: 'no converged whole-feature governance record' };
    expect(renderReconcile([finding], false).code).toBe(0);
    expect(JSON.parse(renderReconcile([finding], true).stdout).findings).toHaveLength(1);
  });

  it('the reconcile verb is exit 0 and does NOT mutate (no governance record written)', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/099-demo' }]);
    f.writeSpecTasks('specs/099-demo', false);
    const r = reconcileVerb(['--at', f.root]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('099-demo');
    expect(existsSync(join(f.root, '.stack-control', 'govern', 'convergence'))).toBe(false);
  });

  it('reconcile verb rejects unknown flags / missing --at value (exit 2)', () => {
    expect(reconcileVerb(['--nope']).code).toBe(2);
    expect(reconcileVerb(['--at']).code).toBe(2);
  });
});

describe('US3 backstop: a reconcile-flagged feature cannot graduate (026 T024, 030 FR-025)', () => {
  it('the same un-governed spec-execution state the reconciler flags fails the graduate gate signal', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/099-demo' }]);
    f.writeSpecTasks('specs/099-demo', false);
    // reconciler flags it (un-governed) ...
    expect(reconcileCapabilities(installAt(f.root)).some((x) => x.evidence === '099-demo')).toBe(true);
    // ... and the gate's whole-feature signal refuses it (no converged record).
    const item = loadRoadmap(f.roadmapPath, f.opts).byId.get('multi:feature/a')!;
    expect(isImplFeatureConverged(f.root, convergenceKeyFor(item))).toBe(false);
  });
});
