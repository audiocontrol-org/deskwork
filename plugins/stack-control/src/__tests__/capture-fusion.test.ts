// 024 US3 / FR-008/FR-009 — capture is fused to authoring: a spec dir cannot be
// authored through the supported path without a roadmap node, and an orphan spec
// dir (a spec with no node) is a HARD error the compass reports (off-rail), not a
// passive reconcile note. SC-003 + SC-006 (the demonstrated 023-class failure —
// author a feature with no capture — is refused at the first skipped step). RED
// first (T030). Tests the mechanism (the compass + the define precondition); the
// SKILL.md embedding is documentation, not unit-tested (project testing rule).

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkLifecyclePrecondition } from '../lifecycle-precondition.js';
import { runCli } from './_run-helpers.js';
import { makeWorkflowFixture, type WorkflowFixture } from './fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(nodes: Parameters<typeof makeWorkflowFixture>[0]): WorkflowFixture {
  const f = makeWorkflowFixture(nodes);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const ITEM = 'multi:feature/x';

describe('024 FR-008 (model b) — the front door creates the node; a node-less item is off-rail (backstop)', () => {
  it('a no-node item yields an off-rail compass verdict — the mechanical BACKSTOP', () => {
    // Model (b), operator decision 2026-06-16: `/stack-control:define` CREATES the roadmap node
    // when absent (capture-fusion, in the skill body) — it does NOT refuse-and-redirect. So the
    // supported path never produces an orphan. This off-rail verdict is the mechanical BACKSTOP
    // (FR-009) for a node-less spec dir that slips in another way (e.g. hand-authored), and the
    // compass behavior other skills rely on — NOT define's own front-door behavior.
    const f = fixture([{ identifier: 'multi:feature/other', status: 'in-flight' }]); // roadmap present; queried item absent
    const r = checkLifecyclePrecondition({ item: 'multi:feature/orphan', intent: 'define', cwd: f.root });
    expect(r.proceed).toBe(false);
    expect(r.verdict.outcome).toBe('off-rail');
    expect(r.verdict.reason).toMatch(/node/i);
  });

  it('on an EXISTING node, define proceeds when the design-to-spec gate is genuinely met', () => {
    // T040: define (specifying work) now evaluates the design-to-spec exit gate via the
    // compass verdict — so it proceeds only when the design record is COMPLETE (all required
    // sections + ≥2 solution-space alternatives) AND approved. A pointer + flag alone is not
    // "design done" (that fixture would correctly REFUSE — design-before-spec enforcement).
    const f = fixture([]);
    f.write(
      'docs/x-design.md',
      [
        '# Design: x',
        '## problem-domain', 'p',
        '## solution-space', '- Alternative A', '- Alternative B',
        '## decisions', 'd',
        '## open-questions', 'q',
        '## provenance', 'v',
        '',
      ].join('\n'),
    );
    f.setRoadmap([
      { identifier: ITEM, status: 'in-flight', design: 'docs/x-design.md', designApproved: true },
    ]);
    const r = checkLifecyclePrecondition({ item: ITEM, intent: 'define', cwd: f.root });
    expect(r.proceed).toBe(true);
    expect(r.verdict.outcome).toBe('on-course');
  });

  it('on an EXISTING node, define REFUSES when the design-to-spec gate is unmet (design-before-spec)', () => {
    // pointer + approval flag but NO real design record → the design-to-spec gate is unmet →
    // define is `ahead` (refuse): you must finish design before authoring the spec.
    const f = fixture([{ identifier: ITEM, status: 'in-flight', design: 'docs/missing.md', designApproved: true }]);
    const r = checkLifecyclePrecondition({ item: ITEM, intent: 'define', cwd: f.root });
    expect(r.proceed).toBe(false);
    expect(r.verdict.outcome).toBe('ahead');
    expect(r.verdict.unmetGate.length).toBeGreaterThan(0);
  });
});

describe('024 FR-009 — an orphan spec dir is a hard error (off-rail), not a passive note', () => {
  it('the compass reports off-rail for a spec dir with no roadmap node, naming the missing node', () => {
    const f = fixture([{ identifier: 'multi:feature/other', status: 'in-flight' }]); // roadmap present; orphan absent
    // simulate a hand-authored orphan spec dir on disk
    f.write('specs/099-orphan/spec.md', '# Orphan spec\n');
    expect(existsSync(join(f.root, 'specs/099-orphan/spec.md'))).toBe(true);
    const r = runCli(['workflow', 'compass', 'multi:feature/orphan', '--intent', 'define'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBe(2); // off-rail, not usage
    expect(r.stdout + r.stderr).toMatch(/off-rail|no roadmap node/i);
  });
});

describe('024 SC-006 — the demonstrated 023-class failure is refused at the first skipped step', () => {
  it('a planned item (no design) refuses an attempt to author the spec, naming designing', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned' }]);
    // The agent tries to jump straight to authoring (define) without designing.
    const r = runCli(['workflow', 'compass', ITEM, '--intent', 'define'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('verdict: ahead');
    expect(r.stdout).toContain('skipped step: designing');
  });
});
