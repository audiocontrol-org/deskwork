---
doc-grammar: roadmap
---

# stack-control — roadmap

The governed, plugin-local **dependency graph** of stack-control's features — the
program's sequencing brain a fresh agent reads to act correctly without
re-explanation. Each item is a heading-keyed Unit identified by its
`<phase>:<kind>/<slug>` identifier; items are **peers**, ordered by the `phase`
relation `[design, plan, impl, multi]` (NOT alphabetical) and tie-broken by
identifier. Statuses: `planned`, `in-flight`, and the terminal `shipped` /
`cancelled` / `retired`.

First-class **typed edges** drive the protocol: `depends-on` (hard, acyclic;
satisfied only when the target is `shipped`), `part-of` (non-blocking grouping),
`deferred-until` (a prose condition that blocks readiness until the operator
clears it). Reason over the graph with `/stack-control:roadmap` (`next` /
`blocked` / `blocks` / `order` / `graph` / `reconcile`) and keep it crisp with
`add` / `advance` / `decompose` / `reclassify` / `defer`. Program vision +
rationale live in [`THESIS.md`](./THESIS.md); this document is the live feature
queue.

## design:feature/document-primitives
- status: in-flight
- depends-on: multi:feature/front-door
- spec: specs/005-document-primitives
Generalized archive / unarchive / curate over self-describing governed documents — the engine this roadmap protocol is built on.

## design:feature/insight-capture
- status: in-flight
- depends-on: multi:feature/front-door
One-move out-of-sequence insight capture as a first-class control-plane capability; capture ≠ scope. Retires the interim design-inbox convention.

## design:feature/migrate-scope-discovery
- status: planned
- depends-on: multi:feature/front-door
Move scope-discovery primitives + skills in-house with per-codebase clone detection; vendor the full clone-detector.

## design:feature/roadmap-protocol
- status: in-flight
- depends-on: design:feature/document-primitives
- spec: specs/006-roadmap-protocol
Keep the roadmap live, crisp, and up-to-date: a DAG of heading-keyed work items with first-class typed edges. This feature (the manual self-seed).

## design:feature/spec-authoring
- status: planned
- depends-on: multi:feature/front-door
Author specs at promise altitude — the prevention half of spec quality, sibling to spec-governance's detection.

## design:feature/spec-governance
- status: in-flight
- depends-on: multi:feature/front-door
- spec: specs/004-spec-governance
Govern the spec, not just the implementation: cross-model audit-barrage over a spec at definition time. The mode-aware lens shipped.

## design:gap/roadmap-order-gating
- status: planned
- part-of: design:feature/roadmap-protocol
- depends-on: design:feature/roadmap-protocol
The deferred hard out-of-order GATING (006 FR-018): refuse work on an item whose dependencies are not yet shipped. Captured here so the deferral is a tracked roadmap item, never silently dropped.

## impl:feature/execution-engine
- status: planned
- depends-on: multi:feature/front-door
- spec: specs/002-parallel-execution-engine
The differentiator: worktree-isolated, capability-selected, cross-backend parallel fan-out. Spec hardened + parked at /speckit-plan.

## impl:feature/governance
- status: shipped
- part-of: multi:feature/front-door
- spec: specs/001-speckit-backhalf-slice
Governance as a Spec Kit after_implement extension: the deskwork-governance cross-model audit-barrage hook. Rehomed into the front door.

## multi:feature/control-plane-frontend
- status: planned
- depends-on: multi:feature/front-door, impl:feature/execution-engine
Fuller control-plane frontend: spec→implementation negotiation, scope/barrage surfaces, engine-run surfaces. Design surfaces lead; engine-run surfaces follow the engine.

## multi:feature/front-door
- status: shipped
- spec: specs/003-stack-control-front-door
The self-hosting bootstrap: plugin + stackctl + native Spec Kit execution. The thin control plane everything after is built through.

## multi:feature/migrate-audit-barrage
- status: planned
- depends-on: multi:feature/front-door
Migrate audit-barrage + the audit protocol (convergence criterion + finding state machine) in-house; the one-way execution→governance seam survives.

## multi:feature/audit-protocol-convergence
- status: in-flight
- depends-on: multi:feature/migrate-audit-barrage
Make the cross-model audit-barrage convergence loop mechanically terminate and shrink the unit of work it audits (specs/015-audit-protocol-convergence). Five threads: cross-lane severity AGREEMENT + adjudication replace max-of-cluster so the dampener's two-consecutive-0-HIGH branch is reachable (US1); a code loop driver owns the iterate/stop decision + ceiling, not skill prose (US2); the implement payload drops its own audit-log excerpt + parked scaffolds (US3); a per-phase `--phase` audit unit shrinks the payload, governed by the same loop (US4); sonnet re-calibrated to an operator-selectable read-only override profile on the smaller units (US5); the #432 raw-counting guarded against regression (US6). Resolves backlog TASK-27 + TASK-18 (both facets) + the DESIGN-INBOX adjudication capture; sibling #431 payload self-reference addressed by US3.

## multi:feature/migrate-session-skills
- status: cancelled
- depends-on: multi:feature/front-door
Migrate session-start / session-end lifecycle skills into stack-control. Cancelled — superseded by multi:feature/session-skills (build native, not port): dw-lifecycle's session skills are hardcoded to deskwork conventions (#122), so they are rebuilt native rather than migrated. The #122/#422 gaps and retire-dw-lifecycle's dependency moved to the native feature.

## multi:feature/retire-dw-lifecycle
- status: planned
- depends-on: design:feature/migrate-scope-discovery, multi:feature/migrate-audit-barrage, multi:feature/session-skills
Reach parity, then retire the predecessor — the absorb-then-retire endgame.

## design:gap/roadmap-edge-aware-archival
- status: retired
- depends-on: design:feature/roadmap-protocol
- part-of: design:feature/roadmap-protocol
- ref: #436
curate/archive would archive a shipped item still referenced by a depends-on edge and dangle it; roadmap archival must be edge-aware (skip terminal items that are still depends-on/part-of targets). Retired 2026-06-11: migrated to backlog TASK-21 (defect tracking lives in the backlog, not the roadmap DAG).

## design:fix/inbox-migration-drift
- status: retired
- part-of: design:feature/document-primitives
- ref: #433
Governed DESIGN-INBOX.md is missing the 13th source entry (the mark-fixed/mark-acknowledged verb); generality T038 is red at HEAD. Re-migrate or reconcile the inbox against its source. Retired 2026-06-11: migrated to backlog TASK-32.

## design:gap/governance-graduation-record
- status: retired
- part-of: design:feature/spec-governance
- ref: #434
Governance graduation has no on-disk record (the gate prints true/false, persists nothing); roadmap reconcile falls back to tasks-completion as the shipped signal. Persist a per-spec graduation record, then strengthen reconcile to require it. Retired 2026-06-11: migrated to backlog TASK-19.

## design:gap/row-keyed-test-grammar
- status: retired
- part-of: design:feature/document-primitives
- ref: #435
Optional cleanup: replace roadmap-legacy.peg with a purpose-named row-keyed test grammar so legacy can be retired. Current decision (kept) is to keep legacy as the canonical row-keyed example grammar. Retired 2026-06-11: migrated to backlog TASK-20.

## impl:feature/autonomous-loop
- status: planned
- depends-on: impl:feature/execution-engine, impl:feature/governance
Point an orchestrator at a workplan, fire the implement loop, and return when it is fully implemented, tested, and audited — self-regulating and self-correcting, halting only on genuine spec ambiguity. The industrialize-execution arc of the thesis.

## impl:gap/spec-ambiguity-surface
- status: planned
- depends-on: impl:feature/autonomous-loop
- part-of: impl:feature/autonomous-loop
Structural halt-loudly surface for genuine spec ambiguity, classified local / spec-fork / cross-cutting; package each halt with question + options + impact + rollback cost so the operator can answer in 30 seconds. The hardest gap.

## impl:gap/skip-around-blocked-tasks
- status: planned
- depends-on: impl:feature/autonomous-loop
- part-of: impl:feature/autonomous-loop
Skip a blocked task and keep going on independent work: needs a third workplan task-state (neither open nor done) the implement-loop gate walks past, dependency-inference guards against lock-in, and an outstanding-blocks cap that halts entirely.

## impl:gap/halt-and-resume
- status: planned
- depends-on: impl:feature/autonomous-loop
- part-of: impl:feature/autonomous-loop
Clean paused-awaiting-operator state + resume verb: awaiting-operator/<task-id>.md carrying question + recommendation + impact + rollback cost; operator answers async; the audit-log records every block and every resume.

## impl:gap/final-verification-gate
- status: planned
- depends-on: impl:feature/autonomous-loop
- part-of: impl:feature/autonomous-loop
Aggregate shippable gate (all tests green, tsc clean, no open findings, audit-log clean, smoke green) — workplan-exhausted is not feature-shippable. Composes existing verbs; the easiest gap.

## impl:gap/loop-reentry-idempotence
- status: planned
- depends-on: impl:feature/autonomous-loop
- part-of: impl:feature/autonomous-loop
Re-running the implement loop against the same workplan after a mid-task session death (context exhaustion / network / restart) picks up cleanly; harden the in-flight barrage hook + auto-flips against leaving inconsistent state.

## impl:gap/resource-budget-self-stop
- status: planned
- depends-on: impl:feature/autonomous-loop
- part-of: impl:feature/autonomous-loop
A budget for run-until-done (wall-clock and/or task-count cap): halt and report what is left so a long autonomous loop cannot run away unnoticed.

## multi:gap/audit-barrage-metaaudit
- status: planned
- depends-on: multi:feature/migrate-audit-barrage
Meta-audit synthesizer (audit-barrage Design B): one LLM pass over the N raw model outputs ranks by confidence x actionability, de-dupes, flags cross-model agreement, and emits a single structured findings block — collapsing the operator review surface from N raw files to one summary.

## multi:gap/audit-barrage-daemon
- status: planned
- depends-on: multi:feature/migrate-audit-barrage
- deferred-until: Design B (meta-audit synthesizer) proves the model-diversity payoff justifies the always-on run-rate cost
Continuous background audit daemon (audit-barrage Design C): watches for new commits and fires audit jobs continuously out-of-band; the orchestrator loop reads accumulated runs per-turn. Exploratory; highest cost and decoupling.

## design:fix/spec-governance-gate-branch
- status: retired
- part-of: design:feature/spec-governance
- ref: #432
spec-governance gate graduates at the first 0-HIGH run instead of FR-010 branch a/b, and the FR-014 loop bound is advisory rather than a code interlock (AUDIT-20260608-01). Retired 2026-06-11: migrated to backlog TASK-18.

## design:fix/document-primitives-round9
- status: retired
- part-of: design:feature/document-primitives
- ref: #430
Round-9 residual hardening of the document-primitives engine: fence-length handling, prose-as-header rejection, and an engine floor (AUDIT-54/55/56). Retired 2026-06-11: migrated to backlog TASK-17.

## multi:gap/session-skills-tailoring
- status: planned
- part-of: multi:feature/session-skills
- ref: #122
dw-lifecycle session-start/session-end are project-coupled (hardcoded deskwork conventions); they need per-project tailoring before they can ship as general-use in stack-control.

## multi:gap/session-start-branch-staleness
- status: planned
- part-of: multi:feature/session-skills
- ref: #422
session-start branch-staleness detector: warn pre-merge when a feature branch is behind so stale-branch sessions do not silently re-implement shipped work.

## design:gap/scope-discovery-novel-patterns
- status: planned
- part-of: design:feature/migrate-scope-discovery
- ref: #315
scope-discovery discovery agents act as a pattern inventory and miss novel anti-patterns; a green scope-inventory means no match against the registered catalog, not no novel shapes.

## multi:fix/audit-barrage-self-referential
- status: retired
- part-of: multi:feature/migrate-audit-barrage
- ref: #431
audit-barrage payload includes its own audit-log, generating self-referential findings; the untracked-fold also pulls unrelated parked-feature scaffolds into the diff. Retired 2026-06-11: migrated to backlog TASK-37.

## multi:gap/retire-review-audit-skills
- status: planned
- part-of: multi:feature/migrate-audit-barrage
- ref: #387
Retire /dw-lifecycle:review and /dw-lifecycle:audit in favor of audit-barrage as the primary review surface, as part of bringing audit-barrage in-house.

## design:gap/roadmap-advance-on-spec-finalize
- status: planned
- part-of: design:feature/roadmap-protocol
Advancing a roadmap item's status when its spec is finalized must be NON-DISCRETIONARY (thesis: make it mechanical, never rely on the agent remembering roadmap advance). Add a Spec Kit hook on spec finalization (e.g. after_tasks / after_analyze) that advances the roadmap item whose spec: field points at the just-finalized spec dir to in-flight, resolved via .specify/feature.json. Surfaced as TF-24.

## design:gap/insight-capture-ideas-stage-handoff
- status: planned
- part-of: design:feature/insight-capture
Automated hand-off of a promoted inbox entry into deskwork's Ideas stage (excluded from insight-capture v1 per spec clarification 4). The shipped promote verb records a target reference only.

## design:gap/project-relative-doc-discovery
- status: planned
- part-of: design:feature/migrate-scope-discovery
stackctl inbox/roadmap default --doc to the plugin-bundled DESIGN-INBOX.md/ROADMAP.md (correct for in-repo dogfood, wrong for an adopter running without --doc). Add project-relative governed-doc discovery (cwd/config resolution) for the whole verb family so adopters get their own inbox/roadmap by default. Surfaced by the 007 after_implement barrage (AUDIT-BARRAGE-codex-01, HIGH).

## multi:feature/session-skills
- status: planned
- depends-on: multi:feature/front-door
Native, Spec-Kit-aware session-start / session-end lifecycle skills for stack-control: bootstrap a fresh agent into the active spec + governed roadmap + open work at session boot, and capture the journal + tooling-friction + clone-snapshot at session close. Built native (NOT ported from dw-lifecycle, whose session skills are hardcoded to deskwork conventions).

## multi:feature/project-doc-setup
- status: planned
- depends-on: multi:feature/front-door
Post-install project setup: scaffold the governed documents + config the plugin verbs require (ROADMAP.md, DESIGN-INBOX.md, the backlog store, stack-control config) into a freshly-installed adopter project, so stackctl inbox/roadmap/backlog work without hand-authoring the docs. The create-side complement to design:gap/project-relative-doc-discovery (which resolves an adopter own docs at read time).

## multi:gap/audit-barrage-model-pinning
- status: planned
- part-of: multi:feature/migrate-audit-barrage
Barrage claude entry pins no model: bare 'claude -p' floats on the user's default (resolved to fable-5, the slowest), and timeout_seconds is guessed independently of the model. 2026-06-10 experiment: fable needs 669-750s on a 69KB prompt vs the 600s cap — 17 consecutive exit-143 timeouts in design-control (opus 586s, haiku 271s; time is ~100% API generation, not tooling). Pin --model in args_template and derive timeout from the pinned model + payload size.

## multi:gap/audit-barrage-readonly-enforcement
- status: planned
- part-of: multi:feature/migrate-audit-barrage
Barrage spawns inherit ambient permissions — read-only is held by model disposition, not mechanism. 2026-06-10: sonnet 4.6 violated PROMPT.md's explicit read-only instruction during a replay, fixed the findings instead, committed 6ce58543 and pushed to origin/feature/design-control mid-audit. Mechanically enforce read-only on barrage spawns (disallowed mutation tools / permission mode), spike-verified.

## multi:gap/audit-barrage-timeout-observability
- status: planned
- part-of: multi:feature/migrate-audit-barrage
A timed-out barrage model leaves a zero-byte stdout artifact; the kill is visible only in the run INDEX.md (exit 143, timed out: yes). Nothing at the synthesis/lift layer distinguishes 'produced nothing because SIGTERMed' from 'clean, no findings' — the fleet silently degrades (design-control ran 17 one-model rounds). Surface per-model timeout/failure state at synthesis.
## design:feature/backlog-backend-port
- status: planned
- depends-on: multi:feature/front-door
Put a real port between the stack-control backlog frontend (capture / list / import-github / import-slush / promote) and the concrete store: a BacklogStore interface with the current backlog.md CLI as one adapter behind it, so the backend is swappable and its conventions stop leaking. Motivation: backlog.md imposes its own filename convention (spaces and the 'id - title' separator, double .md.md when a title ends in .md), its own archiving model, and its own directory layout on the governed store; the operator has explicit opinions on naming, archiving, and directory layout that the abstraction must make expressible instead of inheriting upstream defaults. Origin: 2026-06-11 session — shell work over the tasks dir broke on the space-laden filenames during the TASK-13/14/25 closure pass.

## impl:feature/installation-isolation
- status: planned
- spec: specs/installation-isolation
- ref: TASK-45
Installations are isolated: all stack-control state anchors at the nearest-enclosing installation; --repo-root retired on state-writing verbs; legacy half-installation detection; Spec Kit root relocates into the installation. Operator directive 2026-06-10; promoted from TASK-45 (anchor unification).

## impl:feature/descriptive-naming
- status: planned
- spec: specs/descriptive-naming
Slugs, not fake ordinals: new specs slug-only, backlog interaction slug-first over the adopted tool, agents speak friendly names to the operator, recorded history grandfathered with zero ledger rewrites. Operator directive 2026-06-10.

