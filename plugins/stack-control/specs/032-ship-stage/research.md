# Research: ship-stage (Phase 0)

Decisions resolving the spec's clarifications and the implementation forks surfaced by the source-surface map. Format per decision: **Decision / Rationale / Alternatives considered**.

## R1 — Off-rail merge-detection signal (FR-012)

- **Decision**: An item is **merged-but-status-in-flight** when its per-item govern **convergence record** (`.stack-control/govern/convergence/impl__<safe-item-id>.json`, committed during govern) is **reachable from the default branch** (`origin/main`, resolved via `resolveBase()` in `src/session/git.ts`) **while its recorded `status:` is still `in-flight`** (not `shipped`/`closed`). Implemented in a new `src/workflow/merge-signal.ts` using `git merge-base --is-ancestor <record-commit> <base>` (or commit-walk fallback).
- **Rationale**: Portable (any git remote; **no gh-API**, honoring FR-013's no-GitHub-remote constraint for the on-rail path while the off-rail backstop may read a git ref); per-item (the convergence record is item/feature-keyed); independent of whether `/stack-control:ship` ran (it keys on the record commit's reachability, not a ship-written marker). Operator-chosen in `/speckit-clarify` (Session 2026-06-23).
- **Alternatives considered**: (a) **gh-API PR-merged query** — authoritative on GitHub but needs gh auth + a GitHub remote; breaks the any-git-host portability thesis. (b) **spec-dir-in-`origin/main` heuristic** — simpler but coarse: spec commits land before the impl merges and multiple items ride one PR → false positives. (c) **ship-written marker only** — blind to an off-rail raw merge (no marker written), so it fails the honest-boundary residual; usable only as an on-rail fast-path *plus* an independent re-derivation, which the convergence-record signal already provides.

## R2 — CI-green gating on the merge (FR-019)

- **Decision**: `/stack-control:ship` surfaces the PR/CI link and requires **operator confirmation** that CI is green before merging. No polling, no CI-status API coupling.
- **Rationale**: CI here is brutally slow — a poll could block a long time and needs a timeout/resume policy. The merge is operator-owned; confirmation is the lightest, most portable gate and matches "merge when green, operator-owned." Operator-chosen in `/speckit-clarify`.
- **Alternatives considered**: (a) **one-shot automated `gh pr checks`** — authoritative without a long poll, but couples to the gh/CI-status API. (b) **poll until green** — hands-off but can block a long time and needs timeout/resume machinery.

## R3 — Phase/derive mechanism for `merging` / `shipped` / `validating` (the coherence half, FR-005/FR-006/FR-007)

- **Decision**: Model the post-govern span as ordered phases `governing → merging → shipped → validating → closed`. Derive each from recorded signals so derived phase == recorded status by construction:
  - **`merging`** — derived from `record-converged impl` (the existing derive kind) AND status ≠ shipped; work = `stack-control:ship`. (Reached when govern converged but not yet merged.)
  - **`shipped`** — derived from recorded **status == shipped** (a new derive predicate over the recorded status, NOT the old `record-converged impl`). Work-less.
  - **`validating`** — derived from recorded **status == shipped AND the `validated` marker absent**, ordered AFTER `shipped` so the derive walk (most-advanced-wins) returns `validating` while validation is pending and falls back to `shipped` once `validated` is recorded. Work = the adopter-defined validation (default: operator-confirm).
  - **`closed`** — unchanged: by-name terminal (`derive: never`, work-less, status == closed).
- **Rationale**: The engine's `phase-derivation.ts` by-name rule maps a status to a *work-less* phase and short-circuits the predicate walk; to surface BOTH `shipped` and `validating` over the single `status: shipped`, they must be **predicate-derived** and discriminated by the `validated` marker. Keying every post-merge phase on recorded status (+ the marker) — the exact source the close gate (`roadmap advance --to closed`) reads — makes the TASK-445 divergence impossible (FR-008). `graduate` (which records `status: shipped`) now fires at merge, so `shipped` means merged (FR-006).
- **Alternatives considered**: (a) **A distinct `validating` roadmap status** — adds status vocabulary and a second status write (merge→shipped, then →validating); rejected as heavier and a second mutation. (b) **Keep `record-converged impl` as `shipped`'s derive** — this IS the current bug (derives shipped at govern-converge, diverging from the recorded-status close gate); rejected (it is what we are removing). (c) **Collapse `shipped` and `validating` into one phase** — loses the operator-approved first-class `validating` waypoint; rejected.
- **New grammar surface**: a derive/criterion predicate over the recorded status (e.g. `status-is <status>`) added to `DERIVE_KINDS` (and the matching evaluation in `phase-derivation.ts`/`gate-eval.ts`), plus reuse of the existing generic `approval-marker` for the `validated` marker. Final encoding pinned RED-first in execute.

## R4 — `graduate` fires at merge; the merged gate (FR-002/FR-006)

- **Decision**: Keep `transition:graduate` (now `merging → shipped`), driven by `/stack-control:ship` immediately after the merge. Its effects are unchanged in order (`roadmap-advance to=shipped; roadmap-reconcile; journal-append; commit` — commit last, the atomic boundary). The skill performs merge-then-graduate as one welded operation; there is no skill path that merges without firing graduate.
- **Rationale**: Reuses the existing atomic transition engine (`transition-engine.ts`) and effect vocabulary; the weld is enforced by the skill body's step ordering + the no-shortcuts rule, and backstopped by R5. `graduate`'s gate gains the precondition that the work is govern-converged (existing `graduate-impl`) — the "merged" fact is established by the skill having just merged, not a WORKFLOW.md criterion (the off-rail case is R5's job).
- **Alternatives considered**: a brand-new `transition:merge` separate from `graduate` — rejected; it splits one atomic record into two and reintroduces a skippable second step (the original defect).

## R5 — Backstop as a compass invariant, not a per-item WORKFLOW.md criterion (FR-009..FR-013)

- **Decision**: The backstop is a **cross-item compass invariant** in `compass.ts` (`computeVerdict` gains an input, e.g. `danglingMergedItem?: string`) fed by `compass-resolve.ts`, which calls `merge-signal.ts` (R1) over the roadmap to find any merged-but-status-in-flight item. A non-empty result yields a refusing verdict (`off-rail`-class, exit non-zero) naming the dangling item + the reconcile command, at the close step and the compass precondition every workflow skill calls. The **reconcile transition itself is exempt** (advancing the dangling item to shipped is never blocked). session-start/session-end call the SAME signal but only **surface** it (advisory; never refuse) per `session-skills-never-block`.
- **Rationale**: "while a merged-but-status-in-flight item exists" is a global condition over the roadmap, not a property of the item under operation — so it belongs at the compass (which every workflow skill consults) rather than as a per-item gate criterion in the grammar. Matches the Explore integration map (compass + compass-resolve + git helper). Keeps the WORKFLOW.md grammar lean.
- **Alternatives considered**: (a) a per-item WORKFLOW.md criterion — wrong altitude (the condition is cross-item) and would have to be added to every transition's gate. (b) a git-hook — forbidden (`enforcement-lives-in-skills`). (c) auto-reconcile at the gate — rejected in design (silent side-effect mutation; records shipped off a possibly-fuzzy signal).

## R6 — Adopter-defined `validating` default (FR-014..FR-016)

- **Decision**: The bundled `templates/WORKFLOW.md` ships `validating` with exit `approval-marker validated` (the existing generic criterion). Default behavior == 031's pre-close operator-confirm: the operator records `validated`, then closes. The engine defines only the phase + the marker; what "validating" *means* is adopter-defined via the existing `<install-root>/.stack-control/WORKFLOW.md` override (which already wins over the bundled default per 022 FR-005a).
- **Rationale**: Reuses the existing override-resolution + the generic `approval-marker`; no new install/validation semantics in the engine (portable; adopter may make `validated` a bare confirm). Generalizes 031's confirm into a first-class, overridable phase without changing default behavior.
- **Alternatives considered**: a hardcoded install-and-verify validation step — rejected in design (adopters may have no install step; 031 already rejected validation-as-universal-machinery).

## R7 — `workflow.ts` split (Constitution VI, ≤500 lines)

- **Decision**: `src/subcommands/workflow.ts` (433 lines) is split before adding ship/backstop wiring — extract a focused module (e.g. `workflow-advance.ts` or `workflow-ship.ts`) so no file exceeds 500.
- **Rationale**: Project hard cap; adding the ship verb wiring + backstop surfacing would push it over.
- **Alternatives considered**: none (the cap is non-negotiable).
