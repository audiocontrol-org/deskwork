// RED-first (govern consolidation): the spec-mode payload assembler ports
// govern-spec.sh's spec(+plan) fold + checkpoint defaulting. Each assertion pins
// a ported edge-case fix:
//   - AUDIT-20260607-14: an over-budget/missing SPEC is FATAL (never silently
//     degraded to a plan-only audit).
//   - AUDIT-20260607-15: when a plan path is supplied (after_plan), a
//     missing/over-budget plan is FATAL (no silent degrade to spec-only).
//   - AUDIT-20260607-05: checkpoint defaulting (explicit > after_plan-if-plan >
//     after_clarify).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleSpecPayload, GovernPayloadError } from '../govern/payload-spec.js';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'gov-spec-'));
}

describe('assembleSpecPayload (port of govern-spec.sh spec+plan fold)', () => {
  it('folds the spec into the payload', () => {
    const repo = tmpRepo();
    try {
      const spec = join(repo, 'spec.md');
      writeFileSync(spec, 'A spec under audit.\n');
      const r = assembleSpecPayload({ specPath: spec });
      expect(r.diff).toContain('A spec under audit.');
      expect(r.diff).toContain('===== SPEC:');
      expect(r.checkpoint).toBe('after_clarify');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('folds the plan alongside the spec when planPath is given; checkpoint defaults to after_plan', () => {
    const repo = tmpRepo();
    try {
      const spec = join(repo, 'spec.md');
      const plan = join(repo, 'plan.md');
      writeFileSync(spec, 'Spec body.\n');
      writeFileSync(plan, 'Plan body.\n');
      const r = assembleSpecPayload({ specPath: spec, planPath: plan });
      expect(r.diff).toContain('Spec body.');
      expect(r.diff).toContain('Plan body.');
      expect(r.diff).toContain('===== PLAN:');
      expect(r.checkpoint).toBe('after_plan');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('missing spec is FATAL (AUDIT-20260607-14)', () => {
    expect(() =>
      assembleSpecPayload({ specPath: '/nonexistent/spec.md' }),
    ).toThrow(GovernPayloadError);
  });

  it('over-budget spec is FATAL — never degraded to plan-only (AUDIT-20260607-14)', () => {
    const repo = tmpRepo();
    try {
      const spec = join(repo, 'spec.md');
      writeFileSync(spec, 'x'.repeat(500) + '\n');
      expect(() =>
        assembleSpecPayload({ specPath: spec, budgetBytes: 100 }),
      ).toThrow(/spec/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('missing plan when planPath supplied is FATAL — no silent degrade to spec-only (AUDIT-20260607-15)', () => {
    const repo = tmpRepo();
    try {
      const spec = join(repo, 'spec.md');
      writeFileSync(spec, 'Spec body.\n');
      expect(() =>
        assembleSpecPayload({ specPath: spec, planPath: join(repo, 'missing-plan.md') }),
      ).toThrow(/plan/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('explicit checkpoint overrides the default', () => {
    const repo = tmpRepo();
    try {
      const spec = join(repo, 'spec.md');
      writeFileSync(spec, 'Spec body.\n');
      const r = assembleSpecPayload({ specPath: spec, checkpoint: 'after_clarify', planPath: undefined });
      expect(r.checkpoint).toBe('after_clarify');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
