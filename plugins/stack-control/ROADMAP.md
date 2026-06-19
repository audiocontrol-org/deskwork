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
`add` / `advance` / `decompose` / `reclassify` / `defer` / `cluster` (alias
`group`) — e.g. `stackctl roadmap cluster multi:feature/epic --children
design:feature/a,impl:feature/b --chain --apply` gathers existing items under a
created-or-reused parent. Run `stackctl roadmap --help` for the full surface. For
an edit that has no verb yet (e.g. moving a `part-of` / `depends-on` edge): edit
this file directly, then run `stackctl roadmap order` to revalidate the graph (it
fails loud on a cycle / dangling ref / duplicate id). Program vision + rationale
live in
`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md`;
this document is the live feature queue.

## design:feature/document-primitives
- status: shipped
- depends-on: multi:feature/front-door
- spec: specs/005-document-primitives
Generalized archive / unarchive / curate over self-describing governed documents — the engine this roadmap protocol is built on.

## design:feature/insight-capture
- status: shipped
- depends-on: multi:feature/front-door
- spec: specs/007-insight-capture
One-move out-of-sequence insight capture as a first-class control-plane capability; capture ≠ scope. Retires the interim design-inbox convention.

## design:feature/migrate-scope-discovery
- status: shipped
- depends-on: multi:feature/front-door
- spec: specs/010-migrate-scope-discovery
Move scope-discovery primitives + skills in-house with per-codebase clone detection; vendor the full clone-detector.

## design:feature/roadmap-protocol
- status: shipped
- depends-on: design:feature/document-primitives
- spec: specs/006-roadmap-protocol
Keep the roadmap live, crisp, and up-to-date: a DAG of heading-keyed work items with first-class typed edges. This feature (the manual self-seed).

## design:feature/spec-authoring
- status: planned
- depends-on: multi:feature/front-door
Author specs at promise altitude — the prevention half of spec quality, sibling to spec-governance's detection.

## design:feature/spec-governance
- status: shipped
- depends-on: multi:feature/front-door
- spec: specs/004-spec-governance
Govern the spec, not just the implementation: cross-model audit-barrage over a spec at definition time. The mode-aware lens shipped.

## design:gap/roadmap-order-gating
- status: planned
- part-of: multi:feature/parseable-lifecycle-workflow
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
- status: shipped
- depends-on: multi:feature/front-door
Migrate audit-barrage + the audit protocol (convergence criterion + finding state machine) in-house; the one-way execution→governance seam survives.

## multi:feature/audit-protocol-convergence
- status: shipped
- depends-on: multi:feature/migrate-audit-barrage
- spec: specs/015-audit-protocol-convergence
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
- part-of: multi:feature/parseable-lifecycle-workflow
- depends-on: design:feature/roadmap-protocol
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
- status: shipped
- depends-on: multi:feature/front-door
- spec: specs/011-session-skills
Native, Spec-Kit-aware session-start / session-end lifecycle skills for stack-control: bootstrap a fresh agent into the active spec + governed roadmap + open work at session boot, and capture the journal + tooling-friction + clone-snapshot at session close. Built native (NOT ported from dw-lifecycle, whose session skills are hardcoded to deskwork conventions).

## multi:feature/project-doc-setup
- status: shipped
- depends-on: multi:feature/front-door
- spec: specs/009-project-doc-setup
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
- status: shipped
- spec: specs/installation-isolation
- ref: TASK-45
Installations are isolated: all stack-control state anchors at the nearest-enclosing installation; --repo-root retired on state-writing verbs; legacy half-installation detection; Spec Kit root relocates into the installation. Operator directive 2026-06-10; promoted from TASK-45 (anchor unification).

## impl:feature/descriptive-naming
- status: planned
- spec: specs/descriptive-naming
Slugs, not fake ordinals: new specs slug-only, backlog interaction slug-first over the adopted tool, agents speak friendly names to the operator, recorded history grandfathered with zero ledger rewrites. Operator directive 2026-06-10.

## multi:feature/audit-protocol-hardening
- status: shipped
- part-of: multi:feature/audit-protocol-convergence
- spec: specs/013-audit-protocol-hardening
Layout-aware feature + audit-log resolution: audit-protocol path resolution robust to the installation layout. Iterative hardening of the audit protocol.

## multi:feature/audit-barrage-reliability
- status: shipped
- part-of: multi:feature/audit-protocol-convergence
- spec: specs/014-audit-barrage-reliability
Audit-barrage reliability hardening: timed-out/zero-byte barrage runs are observable and recoverable rather than silently downgraded.

## multi:feature/audit-protocol-reliability
- status: shipped
- part-of: multi:feature/audit-protocol-convergence
- spec: specs/014-audit-protocol-reliability
Audit-protocol reliability: silent-failure hardening across the protocol's resolution + reporting paths. (Numbering collision with audit-barrage-reliability; distinct feature.)

## multi:feature/audit-protocol-friction-burndown
- status: shipped
- part-of: multi:feature/audit-protocol-convergence
- spec: specs/021-audit-protocol-friction-burndown
Audit-protocol friction burndown: per-phase govern boundaries, fleet negotiation, checkpoint composition; whole-feature gate reachable. Closes the convergence-era friction backlog.

## design:feature/backlog-surface
- status: shipped
- spec: specs/008-backlog-surface
Backlog slush-pile surface: capture/list/import/promote over the configured backlog store, deliberately separate from the curated roadmap.

## design:feature/backlog-promotion-seam
- status: shipped
- spec: specs/012-backlog-promotion-seam
Backlog to feature-rigor promotion seam: a record-only graduation linkage from a backlog item into the spec-driven tier.

## impl:feature/anchor-unification
- status: planned
- spec: specs/016-anchor-unification
- ref: TASK-56
Anchor unification: residual anchoring defects after installation-isolation converged; all stack-control state anchors at the nearest-enclosing installation. Follow-on completing the constitution's installation-anchor contract. (Not started: 0/38.)

## multi:feature/portability
- status: shipped
- spec: specs/017-portability
Portable stack-control workflow across Claude Code and Codex: the CLI-first core runs vendor-neutral; skills are thin adapters.

## multi:feature/codex-adopter-distribution
- status: shipped
- spec: specs/019-codex-adopter-distribution
Public Codex distribution for adopters: the released acquisition + install path for non-Claude-Code consumers.

## impl:feature/config-domain-selection
- status: shipped
- spec: specs/020-config-domain-selection
Config-domain discovery and sticky selection: resolve and persist the active config domain across installation surfaces.

## multi:feature/release-resolution-cycle
- status: planned
- part-of: multi:feature/lifecycle-industrialization, multi:feature/front-door-completeness
- depends-on: design:feature/roadmap-protocol
- ref: TASK-134
Mechanize the post-release+install resolution cycle: given an installed release, map the release delta to candidate items (commit refs, audit-log fixed-<sha>, newly-complete spec tasks), verify each against the FORMALLY-INSTALLED artifact (released-binary reconcile, fix present in the installed cache, released tests where deps allow) distinguishing verified-fixed from re-surfacing, propose closure with auto-written Resolution evidence, reconcile + advance roadmap nodes whose specs shipped, and surface loose ends that did not verify. Composes dw-lifecycle re-audit-fixed-findings/close-shipped/complete + stack-control roadmap reconcile/session-end; agent posts evidence, operator decides closure. Promoted from TASK-134.

## multi:feature/lifecycle-industrialization
- status: planned
Umbrella: industrialize the stack-control project lifecycle so the governing ceremony runs mechanically, not on operator stamina or sheer force of will. Groups the mechanization pieces that tie up loose ends deterministically: a parseable lifecycle workflow engine (parseable-lifecycle-workflow / TASK-136), post-release+install resolution (release-resolution-cycle / TASK-134), backlog->roadmap promotion (backlog-promotion-mechanization / TASK-135), and orphan->node reconciliation (unorphan assist / TASK-133, still in backlog). Realizes the thesis ('industrialize execution') at the macro/process layer. Children are part-of this node.

## multi:feature/backlog-promotion-mechanization
- status: planned
- depends-on: design:feature/roadmap-protocol
- part-of: multi:feature/lifecycle-industrialization, multi:feature/front-door-completeness
- ref: TASK-135
One-move backlog->roadmap promotion: given a backlog item, PROPOSE the roadmap node derived from it (phase/kind from labels, slug from title, status planned, candidate edges, ref=TASK-id, description from body), dry-run the node + linkage, and on --apply CREATE the node AND record the promote linkage atomically — removing the two hand steps (roadmap add + backlog promote) run for TASK-134. Preserves the record-only-promote intent (bidirectional navigability). Promoted from TASK-135.

## multi:feature/parseable-lifecycle-workflow
- status: shipped
- spec: specs/022-parseable-lifecycle-workflow
- depends-on: design:feature/roadmap-protocol, design:feature/document-primitives
- part-of: multi:feature/lifecycle-industrialization
- ref: TASK-136
- closes: TASK-19
The centerpiece: a PARSEABLE, DETERMINISTIC lifecycle workflow that drives items through phases — not just a WORKFLOW.md doc. Apply the roadmap-protocol pattern to the process itself: a governed grammar-parsed workflow document (phases, per-phase entry/exit gates, the verb/skill executing each phase) plus an engine that, given an item, knows its current phase, the gate conditions to advance, and deterministically drives it to the next phase or reports why it's blocked. The human-readable WORKFLOW.md is one rendering of the parseable source of truth. Reuses document-primitives (governed parseable-doc engine) + roadmap-protocol grammar/DAG reasoning. Promoted from TASK-136.

## impl:feature/terminal-closure
- status: shipped
- part-of: multi:feature/lifecycle-industrialization
- spec: specs/023-terminal-closure
Mechanical terminal closure: roadmap close-related closes a terminal item's recorded closes:/ref: backlog ids in one deterministic move.

## multi:feature/lifecycle-compass
- status: shipped
- spec: specs/024-lifecycle-compass
- design: docs/superpowers/specs/2026-06-16-lifecycle-compass-design.md
- design-approved: 2026-06-16
- analyze-clean: 2026-06-16
- part-of: multi:feature/lifecycle-industrialization
- closes: TASK-83, TASK-139
Make the lifecycle un-skippable: a workflow 'compass' primitive that orients an agent against a roadmap item and diffs intended action vs allowed phase, embedded as the precondition of every lifecycle skill (real refusals, not reports). Includes the supporting fixes (capture fused to authoring; govern feature-resolution from the spec pointer not the branch slug; TASK-83) so the gates are enforceable.

## multi:feature/unskippable-workflow-protocol
- status: shipped
- spec: specs/025-unskippable-workflow-protocol
- design: docs/superpowers/specs/2026-06-16-unskippable-workflow-protocol-design.md
- design-approved: 2026-06-16
- analyze-clean: 2026-06-16
- part-of: multi:feature/lifecycle-industrialization
Make the stack-control workflow protocol mechanically un-skippable for adopting agents (the 024 compass principle extended past the macro-lifecycle): per-phase governance gated at each tasks.md phase boundary (close the boundary-too-large batching hole); no agent-offered shortcuts (consistent protocol always); no bypassing stack-control:execute to reach the backend speckit-implement directly; commit-and-push automatic at phase boundaries (not operator-reminded). Enforcement lives in the governed WORKFLOW.md gates + skill bodies + CLI verbs (travels with install), never git hooks.

## design:feature/capability-interface-mediation
- status: shipped
- spec: specs/026-capability-interface-mediation
- design: docs/superpowers/specs/2026-06-17-capability-interface-mediation-design.md
- design-approved: 2026-06-17
- analyze-clean: 2026-06-17
- part-of: multi:feature/lifecycle-industrialization
The stack-control agent-facing capability API: capability interfaces (backlog-like, spec-definition, spec-execution operations) that COMPLETELY MEDIATE between an adopting agent and the swappable backends that implement them, with point-of-invocation interception as the enforcement that makes mediation complete (the agent cannot reach past the API to the backend). Generalizes 025 US4 speckit-guard (operator decision 2026-06-17): refuse ALL fronted-backend calls (front door is the only sanctioned path); mechanism = a cross-vendor PreToolUse interceptor calling the stackctl guard (primary) + the make-bypass-harmless gate (backstop). Cross-vendor (logic in stackctl, never vendor identity); the backend skills/CLIs are the adopter's own (no hardcoded .claude/skills). Umbrella node: design:feature/backlog-backend-port + impl:feature/execution-engine re-relate as concrete capability adapters (part-of edges pending the TASK-137 reparent verb). Ruling in the design record: a plugin-shipped Claude Code hook is a permitted enforcement surface (travels with claude plugin install, unlike a git hook). See docs/superpowers/specs/2026-06-17-capability-interface-mediation-design.md + specs/025 US4.

## multi:feature/audit-barrage-convergence
- status: planned
- part-of: multi:feature/lifecycle-industrialization
- ref: TASK-60
Make cross-model audit-barrage governance converge cleanly instead of ringing. Problem (TASK-60): myopic convergence — many rounds where few were needed, fix-induced surface growth, serial single-fleet discovery. Confirmed live in the 025 dogfood: auditors get ever nit-pickier each round. Children address the levers (granularity, severity determinism, dampener-in-loop).

## design:gap/audit-granularity-switch
- status: planned
- part-of: multi:feature/audit-barrage-convergence
- ref: TASK-154
Re-admit full-audit-at-end as a graduate path (gate honors per-phase checkpoints OR a whole-feature record-converged impl); per-phase opt-in for small-model payload-sizing, not mandatory. Reverses the 025 'compose, reject augment' clarify. Per-phase multiplied audit surface + oscillation rather than reducing it. Detail: TASK-154.

## multi:gap/audit-barrage-severity-determinism
- status: planned
- part-of: multi:feature/audit-barrage-convergence
- ref: TASK-146
Severity must be stable across rounds on unchanged code; re-rating LOW->HIGH defeats the FR-010 convergence dampener and drives the ringing. Detail: TASK-146 (gh-482).

## multi:gap/govern-dampener-in-loop
- status: planned
- part-of: multi:feature/audit-barrage-convergence
- ref: TASK-149
govern dampener migrates findings to the backlog while they are being fixed in the same loop. Detail: TASK-149 (gh-471).

## multi:gap/audit-barrage-codex-liveness
- status: planned
- ref: TASK-145
codex lane trips killed-no-liveness on real payloads; emit reasoning summaries (or --json events) for genuine stderr liveness pulses so the window can stay tight, instead of widening it blindly. Update installation + template config. Detail: TASK-145.

## impl:gap/start-governing-enforcement
- status: planned
- part-of: multi:feature/unskippable-workflow-protocol
- ref: TASK-152
025 FR-002: start-governing (implementing->governing) gate authored in WORKFLOW.md but advisory in the 024 advance engine (only the terminal transition is enforced). Bounded by US2 cadence + graduate-gate teeth. Fork: enforce vs honest-boundary. Detail: TASK-152.

## impl:gap/per-phase-gate-upgrade-migration
- status: planned
- part-of: multi:feature/unskippable-workflow-protocol
- ref: TASK-153
025 upgrade: pre-025 / in-flight features with no per-phase checkpoints become un-graduatable when all-phase-checkpoints-current lands; no backfill/grandfather/migration. Detail: TASK-153.

## design:gap/skill-surface-mediation
- status: shipped
- part-of: design:feature/capability-interface-mediation
- ref: TASK-241
SPIKE RESOLVED 2026-06-18 (live, this branch) — last session's 'PreToolUse Skill matcher is INERT' diagnosis was WRONG. The live spike (instrument the loaded plugin hook, invoke a skill via the Skill tool, observe the payload) proved PreToolUse DOES fire for an agent-initiated Skill-tool call; the bug was a one-field mismatch — the interceptor read tool_input.skill_name while the real Claude Code field is tool_input.skill, so every Skill payload extracted an empty identity and silently permitted the reach-around. FIX COMMITTED 5f88b40e (TDD-first: RED regression with the real {skill:...} shape; intercept.ts reads input.skill; research.md/tasks.md/contracts corrected; full suite 1863 GREEN). The hooks.json Skill matcher is CORRECT and stays — no new event (UserPromptExpansion etc.) is needed for the agent reach-around threat. Write-up: specs/026-capability-interface-mediation/skill-surface-spike-research.md. LIVE RE-VALIDATION PASSED in installed release 0.51.1 (2026-06-18): raw /speckit-implement via the Skill tool -> DENIED (spec-execution redirect); /speckit-analyze -> DENIED (spec-definition redirect); benign /feature-help -> PERMITTED (SC-003 no-false-positive). The full live chain (agent Skill-tool call -> PreToolUse hook -> fixed interceptor reads tool_input.skill -> registry match -> deny) is verified end-to-end. SHIPPED; TASK-241 closed via roadmap close-related; 026 graduated to shipped. Out-of-threat-model residual (note only): a USER who types /speckit-implement bypasses PreToolUse via prompt-expansion; the US3 graduate gate covers it; gating it directly would need a separate, empirically-verified event.

## impl:gap/roadmap-edge-mutation-and-cluster
- status: shipped
- spec: specs/027-roadmap-edge-mutation-and-cluster
- design: docs/superpowers/specs/2026-06-18-roadmap-edge-mutation-and-cluster-design.md
- design-approved: 2026-06-18
- analyze-clean: 2026-06-18
- depends-on: design:feature/roadmap-protocol
- part-of: multi:feature/lifecycle-industrialization
- ref: TASK-242
Make roadmap mutation both POSSIBLE and OBVIOUS for adopting agents — today it is neither, so agents burn cycles probing the surface every session and then hand-edit the governed ROADMAP.md anyway, contradicting its own 'do not hand-edit' header. Three parts. (1) Edge-mutation verbs on EXISTING nodes: add-edge / remove-edge / move-edge (reparent) for part-of and depends-on (dry-run then --apply, graph-revalidating: refuse cycle/dangling/self/dup, zero-write-on-failure — same shape as the other mutation verbs). This ABSORBS the former impl:gap/roadmap-reparent-verb (TASK-137, the move-edge case): re-parenting an existing edge had no CLI path (e.g. commit 85a46c6f hand-edit), and neither did ADDING a brand-new part-of to an un-edged node, nor REMOVING one. (2) A one-move roadmap cluster (group) convenience: create-or-reuse a parent epic + attach part-of on N existing children (+ optional --chain to wire a depends-on sequence) atomically — the literal 'group the cluster' operation an operator asks for in words. (3) Self-documenting discoverability so adopting agents stop probing: working `roadmap --help` and per-subaction `--help` that enumerate the full verb + flag set and the status vocabulary; a COMPLETE top-level usage line (today a no-subaction invocation prints only `<next|blocked|add>` though the real set is next/blocked/blocks/order/graph/add/advance/decompose/reclassify/defer/reconcile/close-related, surfaced only by triggering an unknown-subaction error); and a governed ROADMAP.md header that names the mutation verbs with a worked clustering example instead of a bare 'manage with stackctl roadmap — do not hand-edit'. Motivated by the offing dogfood (TASK-242): the agent ran `roadmap --help` (errored), probed a bogus status 'to surface the vocabulary', tested add-on-existing + reclassify to infer behavior, and read the doc grammar by hand before falling back to four hand-edits to cluster three nodes. Folds in TASK-137; promoted from TASK-242. RE-SCOPE (ADR docs/superpowers/specs/2026-06-18-governed-markdown-foundation-adr.md; spec specs/027-roadmap-edge-mutation-and-cluster): part (3)'s discoverability is delivered by ADOPTING a mature parser library (clap/Typer/Cobra/oclif-style; Backlog.md already self-documents this way), NOT a bespoke shared-parser combinator. The governed-markdown foundation is kept (no migration to Backlog.md/Beads); the document-model store seam is hardened so a future store swap stays contained; the novel core (lifecycle-coupled edges + workflow integration) is built regardless of store. Roughly halves the original build.

## impl:gap/roadmap-edge-mutation-verbs
- status: planned
- part-of: multi:feature/lifecycle-industrialization, multi:feature/front-door-completeness
- ref: specs/027-roadmap-edge-mutation-and-cluster
Edge-mutation verbs on EXISTING roadmap nodes: add-edge / remove-edge / move-edge (=reparent) for part-of and depends-on, plus rename and remove-node — dry-run then --apply, graph-revalidating (refuse cycle/dangling/self/dup, zero-write-on-failure), same shape as the other mutation verbs. Absorbs TASK-137 (the move-edge/reparent case had no CLI path). DEFERRED sibling of specs/027-roadmap-edge-mutation-and-cluster (the cluster + self-documenting-help + honest-header slice shipped; this verb set did not). FR-017.

## multi:gap/cli-verb-surface-consolidation
- status: planned
- part-of: multi:feature/lifecycle-industrialization, multi:feature/front-door-completeness
- ref: specs/027-roadmap-edge-mutation-and-cluster
Verb-surface consolidation rollout: migrate the remaining ~50 flat stackctl verbs onto the commander parser surface (as roadmap was in 027) — ~50 flat verbs to ~12-15 nouns, machine-adapter verbs marked internal, backwards-compat aliases for the old names, every verb adopting the self-documenting parser. DEFERRED sibling of specs/027-roadmap-edge-mutation-and-cluster (027 migrated only the roadmap verb as the proof). FR-017.

## multi:gap/govern-per-phase-friction-burndown
- status: planned
- part-of: multi:feature/lifecycle-industrialization
- ref: TASK-289
Burn down the per-phase governance friction surfaced while implementing 027 — the dominant cost was govern tooling, not the feature code. Headline defects: TASK-289 (O(n^2) shared-file checkpoint staleness — a later phase editing an earlier phase's file re-stales its checkpoint, forcing repeated re-governance and ad-hoc overrides; the structural fix is fingerprinting per-phase HUNKS not whole files, or a govern-at-end mode for shared-file features); the audit-barrage severity NON-DETERMINISM (HIGH oscillated 2->0->2 and LOW->HIGH on identical code, defeating the convergence dampener and forcing overrides on phases 4+6); TASK-263 (per-phase scoping derives the payload from tasks.md backtick paths, so a file split out during implementation — e.g. cluster.ts — is excluded from its own audit, and the no-grounding claude lane then raises FALSE HIGHs it cannot disconfirm). Also fold in the 027 code residuals: TASK-288 (promote the no-grounding claude-lane fix to the shipped default), TASK-290 (test ! hygiene), TASK-291 (roadmap SKILL.md cluster doc), TASK-292 (uniform list-flag stray-comma handling + dead branch), TASK-293 (rewriteEdgeLine fence-awareness). OFFING-TEAM ADOPTER FRICTION: TASK-294 (tooling-feedback guidance should route adopter friction to GitHub issues against audiocontrol-org/deskwork, not a local tooling-feedback.md the maintainers never see — overlaps TASK-16; imported from GitHub #488, now closed). NOTE: the CUSTOMER-BLOCKING govern clone-step non-TS blocker (#487 / TASK-295) was PULLED OUT into its own dedicated item `impl:fix/govern-clone-step-language-agnostic` — it is a live adopter blocker, not burndown-queue hygiene, and is not tracked here. Promoted from the 027 govern dogfood + the offing adopter dogfood.

## impl:fix/govern-clone-step-language-agnostic
- status: shipped
- part-of: multi:feature/lifecycle-industrialization
- ref: TASK-295
CUSTOMER-BLOCKING (offing-team adopter friction, GitHub #487, imported as TASK-295). govern's advisory clone-detection step hardcodes --format typescript,tsx, so on a non-TypeScript adopter repo jscpd matches zero files, writes no report, and the resulting throw ABORTS govern before the (language-agnostic) cross-model barrage ever runs — making per-phase governance and therefore /stack-control:execute unusable on any non-TS adopter codebase (found running execute on offing's Bash/PHP/WordPress change-runbook feature, zero .ts files). Fix: the clone step must be language-aware (detect/extend formats) OR non-fatal when it finds no matching files (skip the advisory clone step, do not abort the language-agnostic barrage). Pulled out of multi:gap/govern-per-phase-friction-burndown as its own item because it is a live adopter blocker, not burndown-queue hygiene.

## multi:feature/front-door-completeness
- status: in-flight
- design: docs/superpowers/specs/2026-06-19-front-door-completeness-design.md
- design-approved: 2026-06-19
Umbrella: make the entire stack-control front door complete, discoverable, and governed now that 026 teeth forbid reaching around it. Every backend op reachable pre-026 gets a sanctioned skill+verb, --help parity, mediation/recovery, and a check-front-door guardrail. See docs/front-door-completeness/plan.md.

