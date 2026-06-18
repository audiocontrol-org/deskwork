// 026 T022 + T024 — RED tests for the US3 backstop. `capability reconcile` flags
// un-governed spec-execution state (a feature with tasks.md phases but no current
// per-phase checkpoint), report-only (exit 0, no mutation). T024: the SAME un-governed
// feature cannot graduate through the all-phase-checkpoints-current gate (FR-015) — the
// reconciler surfaces exactly what the gate refuses (the two halves of the backstop).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeConvergedImpl } from '../../govern/compose-convergence.js';
import { featureCheckpointKey } from '../../govern/phase-checkpoint-status.js';
import { reconcileCapabilities, reconcileVerb, renderReconcile } from '../../subcommands/capability-reconcile.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

const PHASED_TASKS = '## Phase 1: Work\n\n- [ ] T001 implement `src/demo/a.ts`\n';

describe('capability reconcile — US3 backstop (026 T022)', () => {
  it('flags a feature whose phases have no current checkpoint (un-governed spec-execution)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('specs/099-demo/tasks.md', PHASED_TASKS);
      const findings = reconcileCapabilities(fx.root);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.capability).toBe('spec-execution');
      expect(findings[0]!.evidence).toBe('099-demo');
      expect(findings[0]!.phases[0]!.state).toBe('missing');
    } finally {
      fx.cleanup();
    }
  });

  it('reports nothing when there are no spec features', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(reconcileCapabilities(fx.root)).toEqual([]);
    } finally {
      fx.cleanup();
    }
  });

  it('flags a non-phased tasks.md (no governable phases) — agrees with the gate (HIGH fix)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('specs/088-noph/tasks.md', '# Tasks\n\nProse only — no phases.\n');
      const f = reconcileCapabilities(fx.root).find((x) => x.evidence === '088-noph');
      expect(f).toBeDefined();
      expect(f!.reason).toBe('no governable phases');
    } finally {
      fx.cleanup();
    }
  });

  it('reports a single unreadable feature without aborting the whole scan (MED fix)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('specs/077-bad/tasks.md', '## Phase 1: X\n\n- [ ] T001 a task with no governed path\n');
      fx.write('specs/099-demo/tasks.md', PHASED_TASKS);
      const findings = reconcileCapabilities(fx.root);
      expect(findings.map((f) => f.evidence).sort()).toEqual(['077-bad', '099-demo']);
      expect(findings.find((f) => f.evidence === '077-bad')!.reason).toMatch(/unreadable/);
    } finally {
      fx.cleanup();
    }
  });

  it('renderReconcile is report-only (exit 0) for empty and non-empty; --json shape', () => {
    expect(renderReconcile([], false).code).toBe(0);
    const finding = { capability: 'spec-execution', evidence: 'f', phases: [{ phaseId: '1', state: 'missing' as const }] };
    expect(renderReconcile([finding], false).code).toBe(0);
    expect(JSON.parse(renderReconcile([finding], true).stdout).findings).toHaveLength(1);
  });

  it('the reconcile verb is exit 0 and does NOT mutate (no checkpoints written)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('specs/099-demo/tasks.md', PHASED_TASKS);
      const r = reconcileVerb(['--at', fx.root]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('099-demo');
      expect(existsSync(join(fx.root, '.stack-control', 'govern', 'phase-checkpoints'))).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('reconcile verb rejects unknown flags / missing --at value (exit 2)', () => {
    expect(reconcileVerb(['--nope']).code).toBe(2);
    expect(reconcileVerb(['--at']).code).toBe(2);
  });
});

describe('US3 backstop: a reconcile-flagged feature cannot graduate (026 T024, FR-015)', () => {
  it('the same un-governed spec-execution state the reconciler flags fails the graduate gate', () => {
    const fx = makeCapabilityFixture();
    try {
      const tasksPath = fx.write('specs/099-demo/tasks.md', PHASED_TASKS);
      // reconciler flags it (un-governed) ...
      expect(reconcileCapabilities(fx.root).some((f) => f.evidence === '099-demo')).toBe(true);
      // ... and the all-phase-checkpoints-current gate refuses to graduate it (no checkpoints).
      expect(composeConvergedImpl(fx.root, featureCheckpointKey(join(fx.root, 'specs', '099-demo')), tasksPath)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });
});
