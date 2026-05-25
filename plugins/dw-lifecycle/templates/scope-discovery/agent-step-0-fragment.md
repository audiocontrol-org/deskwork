<!-- dw-lifecycle:scope-discovery:step-0:begin -->
## Step 0 — refactor-precondition verification

Before reviewing any commit on this project, verify the
scope-discovery refactor-preconditions are satisfied. Skip this step
ONLY when the diff is a pure-docs / pure-comment change with no
production-code modifications.

### What to check

1. **Are there changes to `.dw-lifecycle/scope-discovery/clones.yaml`
   in the diff?** If yes, run:

   ```
   dw-lifecycle check-refactor-preconditions
   ```

   The verb fails informationally when any `disposition: refactor`
   entry is missing Step 0a (canonical_side / canonical_reason /
   new_shape_summary as required) or Step 0b (tests / tests_proof /
   tests_proof_demonstration). Treat each finding as a blocking
   review comment.

2. **Are there changes that look like refactors but no `clones.yaml`
   update?** The diff may be moving / consolidating duplicate
   implementations without recording the disposition. Ask the author
   to run:

   ```
   dw-lifecycle detect-clones
   ```

   If new clone groups appear, the disposition for each must land in
   the same commit (or an explicit follow-up the author commits
   to BEFORE merging the refactor).

3. **Are there anti-pattern findings under the diff?** Run:

   ```
   dw-lifecycle check-anti-patterns --gate-mode
   ```

   Findings under `--gate-mode` exit 1; surface each one as a review
   comment. The author either fixes them in-PR or files a
   disposition entry with a documented reason.

### Why this matters

A refactor disposition without Step 0a/0b is a claim the consolidation
is safe with no evidence. Step 0 verification catches that at review
time, before the LEGACY branch consumers diverge from the canonical
shape and the gap becomes irreversible.

### When to defer this

Defer Step 0 ONLY when the diff is:

- A version bump that touches `package.json` + lockfile only.
- A pure-docs / pure-comment change with no production-code edits.
- A revert of a previous commit that was itself Step-0-clean.

In every other case, Step 0 applies. If you find yourself reasoning
*"this is small enough to skip"* — that's the failure mode this
step exists to prevent.
<!-- dw-lifecycle:scope-discovery:step-0:end -->
