# Phase 34 PRD Review

Date: 2026-05-03
Scope reviewed: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md` Phase 34 section and matching workplan entries

## Verdict

Phase 34 is directionally correct. The problem statement is real, urgent, and worth prioritizing: the current longform review path can show stale content while presenting itself as the canonical approval surface.

The latest phase is **not yet fully sane as written**, though. The main issue is not the diagnosis. The issue is phase shape. `34a` currently combines too many migrations and contains one hard contradiction with the plan's own shortform deferral.

## Primary Findings

### 1. `34a` conflicts with the explicit shortform deferral

The PRD says `34a` should:

- delete `packages/studio/src/pages/review.ts`
- delete the legacy UUID/slug review routes
- keep workflow-record-backed shortform "for now"

Those three statements do not currently fit together.

Today shortform review still depends on the workflow-keyed review route and `pages/review.ts`:

- `packages/studio/src/pages/shortform.ts` links rows to `/dev/editorial-review/<workflow.id>`
- `packages/studio/src/server.ts` resolves that UUID route through the workflow branch first
- `packages/studio/src/pages/review.ts` is the renderer that handles the workflow-backed review surface

If `34a` deletes `review.ts` and the workflow-keyed route without first introducing a replacement shortform review path, shortform review breaks immediately.

### 2. The 34a API contract is too broad to be coherent

The workplan says all `/api/dev/editorial-review/*` endpoints should accept entry UUIDs in `34a`.

That is too broad for the current architecture.

Right now most of the review API is workflow-shaped:

- annotations are workflow-keyed
- decisions are workflow-keyed
- version creation is workflow-keyed
- shortform start returns a workflow review URL

That is not inherently wrong if shortform is still intentionally workflow-backed. But if that deferral stands, the contract for `34a` needs to say:

> Longform entry review becomes entry-keyed.
> Shortform remains workflow-keyed until its own migration phase.

Without that split, the phase is trying to standardize two incompatible models at once.

### 3. `34a` is overloaded beyond a sane single blocking sub-phase

As written, `34a` includes all of the following:

- port the full press-check chrome into `entry-review.ts`
- replace the longform data source with sidecar/history-backed rendering
- design and implement an entry-keyed annotation store or annotation migration
- delete the legacy renderer and routes
- update all review-link emitters
- run a repo-wide "just for now" grep audit
- audit and manually re-review corrupted post-pivot entries
- ship and verify the result in a release

That is not one clean structural fix. It is at least three kinds of work:

1. review-surface unification
2. review-data migration
3. trust-rebuild audit

Bundling all three into one blocking phase makes verification muddy and makes partial success hard to reason about.

## What Looks Correct

These parts of the phase are solid and should stay:

- The trigger is valid: the longform review surface is structurally misleading, not merely rough around the edges.
- Prioritizing the structural longform fix before cosmetic follow-ups is correct.
- Deleting the dual-surface longform path is the right direction.
- Treating "just for now" review-surface coexistence as technical debt, not as a stable migration model, is correct.
- Requiring real release verification before closure is correct.

## Recommended Reshape

### Keep Phase 34, but narrow `34a`

`34a` should become:

- unify **longform** review routing onto `/dev/editorial-review/entry/<uuid>`
- port the longform press-check chrome to the entry-keyed surface
- switch longform dashboard/content/help links to the entry-keyed route
- retire the legacy longform slug/entry-id review path

Explicit non-goals for `34a`:

- no shortform migration
- no repo-wide cleanup grep as a closure gate
- no manual re-review campaign as a prerequisite to shipping the structural fix

### Move the rest into follow-on sub-phases

Suggested split:

#### 34a — Longform review unification

- Fix the broken operator path first
- Keep shortform alive on its existing workflow-backed route if needed
- Verify the dashboard now lands on truthful longform review

#### 34b — Review data migration

- Entry-keyed annotations for longform
- Version-history semantics on the unified surface
- Any API contract split needed between longform and shortform

#### 34c — Post-pivot trust rebuild

- Enumerate entries reviewed against stale snapshots
- Re-review only the affected entries
- Record dispositions in the audit doc

The current planned `34b`/`34c`/`34d` labels can be renumbered or merged later. The important point is separation of concerns.

## Product Decisions Needed

The product team should react to these questions before implementation starts:

1. Is shortform allowed to remain on the workflow-backed review path during the longform fix?
2. If yes, is it acceptable for `34a` to retire only the legacy **longform** renderer while leaving a shortform-specific workflow review path temporarily alive?
3. Is the corrupted-review audit required before shipping the structural fix, or should it happen after the truthful longform surface is live?
4. Should the "comment grep audit" be a closure criterion for this phase, or a separate engineering hygiene pass?

## Proposed PRD Amendment

If the team agrees with the reshape above, the smallest useful PRD correction is:

> Re-scope 34a to the longform review-surface unification only.  
> Explicitly preserve shortform's workflow-backed path until a later dedicated migration phase.  
> Move annotation-store migration and the post-pivot corrupted-review audit out of 34a into later sub-phases.

## Bottom Line

The phase should proceed, but not in its current exact shape.

The PRD has the right alarm bell. It does not yet have the right implementation boundary. Narrowing `34a` to "make longform review truthful and canonical" would make the phase materially saner and much easier to verify.
