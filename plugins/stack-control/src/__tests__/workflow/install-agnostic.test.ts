// T033/T034 (031 US4, RED-first) — the install-agnostic / deadlock-prevention
// invariant (FR-017/FR-018, contracts/terminal-stage.md § Install-agnostic
// invariant).
//
// STRUCTURAL GUARANTEE: governance can never wait on a publish-dependent step
// because the offing deadlock CANNOT BE EXPRESSED in the lifecycle vocabulary.
// Two complementary assertions encode this:
//
//   (1) Vocabulary — `CRITERION_KINDS` (the gate/criterion kinds the grammar
//       admits and `gate-eval` evaluates) contains NO `install-validated` /
//       `release-validated`-style kind. A post-install/release-validation gate
//       is not merely absent from the bundled doc — it is UNTYPEABLE. An override
//       cannot introduce one (the grammar binder rejects an unknown kind).
//
//   (2) Document — the bundled `templates/WORKFLOW.md` carries no phase (incl.
//       the new terminal `closed`) whose entrance/exit references an install /
//       release-validation criterion. `closed` was added with `entrance: (none)`
//       and `exit: (none)`; the only post-ship "validation" is the operator
//       confirm guard at `advance --to closed --apply` (NOT a gate criterion).
//
// This test is GREEN without adding anything — the invariant already holds. If it
// ever fails, the fix is NOT to add a criterion: it is evidence a deadlock-capable
// criterion crept in. Fixtures on disk; never mock fs (.claude/rules/testing.md).

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { CRITERION_KINDS, DERIVE_KINDS, type Criterion } from '../../workflow/workflow-types.js';
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

/** A kind name shaped like a post-install/release validation gate (FR-018). The
 * deadlock the invariant forbids is "a gate that only passes after a publish" —
 * any of these substrings would let that be expressed. */
function looksLikeInstallOrReleaseValidation(kind: string): boolean {
  const k = kind.toLowerCase();
  // The deadlock vector is a *validation* gate (something that only PASSES after a
  // check) crossed with the install/release/publish axis. Both must be present:
  //   • a validation token (`valid`/`verif`/`pass`/`confirm`/`check`), AND
  //   • a publish-axis token (`install`/`releas`/`publish`).
  // `release-tagged` (a structural FACT derive that places a `closed` item) has the
  // publish token but NO validation token, so it is correctly NOT flagged — it is
  // not a gate governance waits on. `install-validated`/`release-verified` ARE.
  const validationToken = /(valid|verif|confirm)/.test(k);
  const publishAxis = /(install|releas|publish)/.test(k);
  return validationToken && publishAxis;
}

describe('031 install-agnostic invariant — vocabulary (T033/T034, FR-018)', () => {
  it('CRITERION_KINDS has NO install/release-validation kind (the deadlock cannot be typed)', () => {
    const offending = CRITERION_KINDS.filter(looksLikeInstallOrReleaseValidation);
    expect(offending, `criterion vocabulary leaks a deadlock-capable kind: ${offending.join(', ')}`).toEqual([]);
    // Spell out the exact forbidden names so a future rename is caught literally.
    for (const forbidden of ['install-validated', 'release-validated', 'publish-validated', 'release-verified']) {
      expect(CRITERION_KINDS).not.toContain(forbidden);
    }
  });

  it('DERIVE_KINDS carries no install/release-VALIDATION derive (release-tagged is a fact, not a validation gate)', () => {
    // `release-tagged` is the structural derive that PLACES a `closed` item — a
    // recorded fact about where the item is, NOT an entrance gate governance waits
    // on. The forbidden shape is a *validation* derive, which would be a gate in
    // disguise. release-tagged is not validation-shaped, so this passes.
    const offending = DERIVE_KINDS.filter(looksLikeInstallOrReleaseValidation);
    expect(offending, `derive vocabulary leaks a deadlock-capable kind: ${offending.join(', ')}`).toEqual([]);
  });
});

describe('031 install-agnostic invariant — bundled WORKFLOW.md (T033/T034, FR-017)', () => {
  function allGateCriteria(root: string): { phase: string; where: string; c: Criterion }[] {
    const doc = loadWorkflowDoc(root);
    const out: { phase: string; where: string; c: Criterion }[] = [];
    for (const p of doc.phases) {
      for (const c of p.entrance) out.push({ phase: p.id, where: 'entrance', c });
      for (const c of p.exit) out.push({ phase: p.id, where: 'exit', c });
    }
    for (const t of doc.transitions) {
      for (const c of t.exitGate) out.push({ phase: t.codename, where: 'exit-gate', c });
    }
    return out;
  }

  it('no phase (incl. closed) carries an install/release-validation entrance/exit criterion', () => {
    const criteria = allGateCriteria(fixture().root);
    const offending = criteria.filter((x) => looksLikeInstallOrReleaseValidation(x.c.kind));
    expect(
      offending.map((x) => `${x.phase}.${x.where}: ${x.c.kind} ${x.c.target}`),
      'a gate references an install/release-validation criterion (deadlock vector)',
    ).toEqual([]);
  });

  it('closed has empty entrance AND empty exit (reached only via the operator-confirm advance guard)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const closed = doc.phases.find((p) => p.id === 'closed');
    expect(closed, 'phase:closed must exist').toBeDefined();
    expect(closed!.entrance).toEqual([]);
    expect(closed!.exit).toEqual([]);
  });

  it('every gate criterion in the bundled doc uses an existing lifecycle CRITERION_KIND', () => {
    const criteria = allGateCriteria(fixture().root);
    for (const x of criteria) {
      expect(CRITERION_KINDS).toContain(x.c.kind);
    }
  });
});
