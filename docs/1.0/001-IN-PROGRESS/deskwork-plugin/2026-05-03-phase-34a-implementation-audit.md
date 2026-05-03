# Phase 34a Implementation Audit

Date: 2026-05-03
Scope reviewed: latest implemented feature on `feature/deskwork-plugin` after `origin/main` — Phase 34a stack (`a7e5804` → `99c732a` → `bfc9bf7` plus follow-up test cleanup `40086dd`)

## Verdict

Phase 34a lands the core structural cutover: longform review is now routed through the entry-keyed surface, the legacy longform renderer is gone, and shortform has been split into its own explicit workflow-backed surface.

That said, the implementation still has correctness gaps in historical-mode behavior and does not fully adhere to the PRD's own "not a partial port" bar.

## Findings

### 1. Historical review pages are still live-mutable

The new entry-keyed surface supports `?v=<n>` historical review, but the page still allows live actions against the current entry state while showing historical content.

What happens today:

- The renderer sets `historical: true` in embedded page state when `?v=<n>` resolves.
- Edit mode correctly blocks entry into the editor when `historical` is true.
- But Approve / Iterate remain available whenever the entry is otherwise mutable.
- Margin-note authoring also remains available.

That means an operator can:

- approve while looking at an old version
- iterate while looking at an old version
- add a new comment from a historical body while the comment is stamped against the live current version number

Relevant code:

- `packages/studio/src/pages/entry-review/index.ts` builds state with `historical: data.historical !== null`
- `packages/studio/src/pages/entry-review/decision-strip.ts` renders mutable actions based on `getAffordances(entry)` only
- `plugins/deskwork-studio/public/src/entry-review/decision.ts` never checks `state.historical`
- `plugins/deskwork-studio/public/src/entry-review/annotations.ts` also never checks `state.historical` before allowing new comments

Impact:

- Operators can perform actions from the wrong snapshot.
- Historical comments can be anchored to content that is not the active current artifact.
- The UI implies "read-only history" in one place and "current mutable review" in another.

Severity: high

### 2. Historical version lookup is ambiguous across stages

The implementation intentionally supports duplicate version numbers across stages, for example:

- Ideas `v1`
- Planned `v1`

The code knows this is a real case:

- `packages/studio/src/pages/entry-review/version-strip.ts` explicitly documents duplicate version numbers across stages
- `packages/core/src/iterate/history.ts` supports disambiguation via optional `stage`

But the actual URL contract for the version strip is still only:

- `?v=<number>`

And the loader resolves history by version number alone:

- `packages/studio/src/pages/entry-review/data.ts` calls `getEntryIteration(projectRoot, entryId, requested)` without a stage

The core tests already document the failure mode:

- `packages/core/test/iterate-history.test.ts` proves that without a stage, the first chronological match wins

So once an entry has duplicate version numbers across stages, clicking a version chip can render the wrong historical content.

Example failure:

- The strip shows a Drafting `v1` chip
- The loader may actually return the earlier Ideas `v1` body

Severity: high

### 3. The implementation does not fully adhere to the PRD's "not a partial port" requirement

The reshaped Phase 34 PRD says:

- 34a ports the longform press-check chrome
- this is "not a partial port"
- if a feature cannot port in 34a, it should become a blocking issue rather than a silent omission

But the shipped implementation still leaves two key actions intentionally inert:

- `Reject` is rendered but disabled pending issue `#173`
- in-browser `Save` is rendered but disabled pending issue `#174`

Relevant code:

- `packages/studio/src/pages/entry-review/decision-strip.ts` disables Reject and points at `#173`
- `plugins/deskwork-studio/public/src/entry-review/decision.ts` treats Reject as a toast-only no-op
- `plugins/deskwork-studio/public/src/entry-review/edit-mode.ts` disables Save and points at `#174`

The workplan was updated to accept those deferrals, but the PRD still states the stronger standard.

Impact:

- Structural cutover: yes
- Full behavioral parity with the PRD's stated bar: no

Severity: medium

## PRD Adherence

### What matches the PRD

- Longform review is now entry-keyed.
- The old longform/outline `pages/review.ts` path has been retired.
- Shortform was split into its own explicit workflow-backed renderer instead of being broken by the cutover.
- The main route/link migration happened in the intended direction.

### What does not fully match

- The PRD frames 34a as a complete longform press-check port, not a partial port.
- The shipped implementation still leaves `Reject` and browser-side `Save` intentionally disabled.
- Historical review mode is not behaviorally safe enough to support the "truthful canonical review surface" claim.

### Overall adherence assessment

Partial adherence.

The implementation satisfies the architectural goal of the phase, but not the full behavioral completeness implied by the PRD text.

## Verification Performed

Targeted tests run:

```bash
npm run test --workspace @deskwork/core -- iterate-history entry-annotations
npm run test --workspace @deskwork/studio -- entry-api entry-review-version-strip entry-review-routing
```

Results:

- `@deskwork/core`: 15 tests passed
- `@deskwork/studio`: 27 tests passed

These suites validate the new history reader, entry-keyed annotation store, entry-keyed API routes, and basic routing/version-strip rendering.

They do not currently cover:

- forbidding approve/iterate/comment actions in historical mode
- stage-disambiguated historical chip routing
- PRD-level completeness of Save / Reject behavior

## Recommended Follow-ups

1. Make historical mode fully read-only.
   - Hide or disable Approve / Iterate / comment authoring when `historical` is true.
   - Keep only navigation affordances active.

2. Disambiguate historical version URLs by stage.
   - Extend version-strip links from `?v=<n>` to something that includes stage, for example `?v=1&stage=Drafting`.
   - Thread that through `loadEntryReviewData()` into `getEntryIteration(..., stage)`.

3. Reconcile the PRD with the shipped scope.
   - Either promote `#173` and `#174` into explicit PRD-scoped exceptions,
   - or tighten the implementation until the PRD's "not a partial port" claim is actually true.

## Bottom Line

Phase 34a is a meaningful structural improvement and fixes the main longform route split.

It is not yet a fully trustworthy historical review surface, and it does not yet completely satisfy the PRD's own completeness standard.
