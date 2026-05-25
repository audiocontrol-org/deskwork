# Refactor preconditions checklist

Every commit that disposes a `clones.yaml` entry as `refactor` MUST
satisfy this checklist. The plugin's `dw-lifecycle
check-refactor-preconditions` verb enforces it programmatically; this
document is the operator-facing summary.

## Why this exists

Refactor dispositions consolidate two (or more) code paths into one.
Without a checklist, the disposition can be applied with the
implementation half-done — the LEGACY branch still wired to consumers,
the NEW branch still missing test coverage that proves the consolidation
preserves behavior. The checklist catches the half-done states at
commit time so the disposition truthfully describes the code change
that landed.

## Step 0a — choose a canonical side

When the disposition is `refactor`, the operator must declare which
side of the clone is canonical. Four branches:

1. **`canonical_side: new`** — neither existing branch is correct; the
   refactor introduces a new shape, both legacy branches migrate to it.
   Requires `new_shape_summary` describing the new shape.
2. **`canonical_side: a`** — branch `a` is canonical; branch `b`
   migrates to match.
3. **`canonical_side: b`** — branch `b` is canonical; branch `a`
   migrates to match.
4. **`canonical_side: both-correct`** — the duplicate is real but both
   sides are intentionally divergent (different stage / different
   feature flag / different runtime). Requires `keep_with_reason`
   instead; a `refactor` disposition is incorrect for this branch.

Every refactor entry needs `canonical_reason` — a one-line
justification the operator can defend in code review.

## Step 0b — prove the tests have teeth

Refactor commits MUST cite tests that prove the consolidated shape
works AND that the tests would have failed on the broken (pre-refactor)
code. Three branches:

1. **`tests_proof.sha: <SHA>`** — a real commit SHA whose state
   demonstrates the test failing on broken code. Run the tests at that
   SHA to verify the failure. The `tests_proof_demonstration` field
   describes how to reproduce.
2. **`tests_proof.kind: synthetic`** — the operator constructed a
   synthetic broken state to demonstrate the test catches the failure.
   `tests_proof_demonstration` describes the synthetic state.
3. **`tests_proof.kind: visual`** — the test is a screenshot / visual
   diff that the operator inspected manually. Use sparingly; visual
   proofs are the weakest of the three.

Without Step 0b, a refactor disposition is asserting "the consolidation
is safe" with no evidence. The check verb refuses the commit until
Step 0b is satisfied.

## The full set of refactor fields

```yaml
- id: example-refactor-001
  disposition: refactor
  canonical_side: new                  # 0a: 'new' | 'a' | 'b' | 'both-correct'
  canonical_reason: "Both branches…"   # 0a: one-line operator justification
  new_shape_summary: "Combined fn…"    # 0a, required iff canonical_side: new
  tests:
    - "tests/foo.test.ts:42"
    - "tests/bar.test.ts:17"
  tests_proof:
    sha: "abc1234"                     # 0b: branch 1, OR
    kind: synthetic                    # 0b: branch 2/3
  tests_proof_demonstration: |
    Multi-line description of how to
    reproduce the failure on broken code.
```

## How the check verb enforces this

`dw-lifecycle check-refactor-preconditions` parses `clones.yaml`,
visits each `disposition: refactor` entry, and validates:

- **Step 0a:** one of the four `canonical_side` values is present.
  When `canonical_side: new`, `new_shape_summary` is required.
  `canonical_reason` is always required.
- **Step 0b:** `tests` is a non-empty array. `tests_proof.sha` OR
  `tests_proof.kind` is set. `tests_proof_demonstration` is non-empty.

Each missing field produces a finding with a specific keypath. The
informational mode (default) reports them and exits 0; `--gate-mode`
(used by the pre-commit hook) flips to exit 1 so the commit fails.

## How to recover when the gate fires

1. Run the verb informationally: `dw-lifecycle
   check-refactor-preconditions`. The findings list every keypath
   that's missing or malformed.
2. Edit `clones.yaml` to fill in the gaps. Each branch (0a + 0b) has
   distinct fields; the workplan section above shows the full shape.
3. Re-run the verb to confirm the findings clear.
4. Commit. The pre-commit hook re-runs the verb in gate mode and
   permits the commit.

## See also

- `clones.yaml` JSON Schema for the full field set:
  `plugins/dw-lifecycle/src/scope-discovery/schema/clones.yaml.schema.json`
- The `/dw-lifecycle:check-refactor-preconditions` skill prose for the
  operator-facing procedure.
- The `/dw-lifecycle:dispose-clone` skill prose for adding a new
  refactor entry from scratch.
