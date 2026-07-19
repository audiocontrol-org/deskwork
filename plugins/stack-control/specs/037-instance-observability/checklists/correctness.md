# Correctness Checklist: Instance Observability

**Purpose**: Requirements-quality gate ("unit tests for the spec") — validates that the load-bearing, easy-to-get-wrong invariants are **specified** completely, clearly, consistently, and measurably. Tests the requirements, not the implementation.
**Created**: 2026-07-18
**Feature**: [spec.md](../spec.md)

## Identity Requirements

- [ ] CHK001 - Is the requirement that instance identity is **never written to a version-controlled file** stated unambiguously and with a verifiable criterion? [Clarity, Spec §FR-002/§SC-004]
- [ ] CHK002 - Are the identity's required **properties** (stable-across-restart, collision-free across machines, human-legible) each individually specified, rather than only implied by the `host:path` derivation? [Completeness, Spec §FR-001–004]
- [ ] CHK003 - Is the distinction between the **identity's fixed properties** and its **current derivation** (which may later change) made explicit, so a future derivation change does not silently invalidate requirements? [Clarity, Spec §FR-001]
- [ ] CHK004 - Is "same checkout path on two machines ⇒ two distinct instances" stated as a measurable outcome? [Measurability, Spec §SC-003]

## Fail-Open Requirements

- [ ] CHK005 - Is the fail-open guarantee specified for **all** producer surfaces — invocations, the session verbs, and the phase advance — not only invocations? [Coverage, Spec §FR-014/§FR-009/§SC-005]
- [ ] CHK006 - Is "never slowed, blocked, or failed by plane/sidecar/network state" given a **measurable** acceptance criterion (vs. a qualitative adjective)? [Measurability, Spec §SC-005]
- [ ] CHK007 - Is it explicit that emission failures are swallowed and **never** masked with fallback/mock data? [Clarity, Consistency with Constitution V]

## Projection-Integrity Requirements

- [ ] CHK008 - Does the spec state explicitly that `InstanceState`/the registry is a **materialized projection over the authoritative event log**, never an independent source of truth? [Clarity, Spec §FR-015]
- [ ] CHK009 - Are **no-regress / effectively-once** requirements defined for the instance registry under duplicate or reordered delivery? [Completeness, Spec §FR-019]
- [ ] CHK010 - Is the requirement that lifetime counters **survive a plane restart** (via rehydrate) stated with a measurable criterion? [Measurability, Spec §SC-006]
- [ ] CHK011 - Is "serving live state performs **zero durable-store reads**" specified unambiguously, and is the live-vs-durable boundary defined? [Clarity, Spec §FR-023/§SC-007]

## Absent-Not-Fabricated Requirements

- [ ] CHK012 - Is "an unobserved phase duration is reported **absent**, never a fabricated `0`" specified without ambiguity? [Clarity, Spec §FR-018/§SC-009]
- [ ] CHK013 - Is the **exclusion** of a `waiting`/`blocked` field stated explicitly (rather than left as an implied omission)? [Completeness, Spec §FR-017]

## Session-Semantics Requirements

- [ ] CHK014 - Is "session" defined unambiguously as the **`session-start`..`session-end` span** and explicitly distinguished from the Claude Code session? [Clarity, Spec §FR-006]
- [ ] CHK015 - Is the **unclosed-session** state fully specified — a first-class "open since X" observable that never blocks the session verbs? [Completeness, Spec §FR-009]
- [ ] CHK016 - Is the **supersede** behavior for a second `session-start` while one is open specified (which session becomes current; what happens to the prior)? [Completeness, Spec §FR-009a]
- [ ] CHK017 - Is "phaseDurations accrue **cumulatively across re-entries**" defined unambiguously (vs. latest-span or reset)? [Clarity, Spec §FR-018]
- [ ] CHK018 - Is "`currentBearing` **persists** through session end / idle" specified (not cleared to empty)? [Clarity, Spec §FR-016c]
- [ ] CHK019 - Is the attribution rule — invocations during a session carry its `sessionId` — specified? [Completeness, Spec §FR-008]

## Connection-vs-Liveness Requirements

- [ ] CHK020 - Are `connection` and `liveness` defined as **two independent axes** with distinct value sets, and is their independence stated (they can diverge)? [Consistency/Clarity, Spec §FR-016a]
- [ ] CHK021 - Are the liveness boundaries (`live→stale`, `stale→gone`) **quantified** and traceable to a pinned plan-time contract rather than left qualitative? [Measurability/Traceability, Spec §FR-016a, plan §D1]

## API-Surface Requirements

- [ ] CHK022 - Is the **read-only** constraint stated for the entire `/v1/instances*` surface (no state-changing route), with control explicitly excluded? [Completeness/Consistency, Spec §FR-024]
- [ ] CHK023 - Is the **route-ordering** requirement (`/v1/instances/stream` before `/v1/instances/:id`) documented so it is not left to chance? [Gap→addressed, plan §D7]

## Snapshot-Threading Requirements

- [ ] CHK024 - Is the requirement that a `phase.entered` payload **survives ingest → registry AND a rehydrate** specified end-to-end (the D5 seam), not just at ingest? [Completeness, plan §D5]
- [ ] CHK025 - Is the snapshot size bound (`≤ 32 KiB`) stated and unchanged from 036? [Clarity, contracts/telemetry-events.md]

## Scope & Dependency Requirements

- [ ] CHK026 - Is the observability/control **boundary** explicit, and are excluded items (control/commanding, TASK-461 sidecar run-frame routing) named rather than silently omitted? [Consistency/Completeness, Spec §Out of Scope]
- [ ] CHK027 - Is the decision to **add `host:path` alongside `installationId`** (leaving storage/auth UUID roles unchanged, not re-keying) documented as a settled constraint? [Clarity/Assumption, plan §D8]
- [ ] CHK028 - Are the 036 dependencies this feature reuses (sidecar/spool/uplink/HTTP/auth/classification) documented as assumptions rather than assumed silently? [Dependency, Spec §Assumptions]

## Verification-Discipline Requirements

- [ ] CHK029 - Is the **real-producer dogfood** acceptance requirement stated as **mandatory and distinct** from the automated suite (the suite is floor, not proof)? [Clarity/Measurability, Spec §FR-027/§SC-010]
- [ ] CHK030 - Are the plan-time constants (heartbeat, liveness window, reconciliation grace, `recentActivity` N, retention) each traceable to a decision and marked for RED-test pinning? [Traceability, plan §D1]

## Notes

- Items test whether the **requirements are well-written**, not whether code behaves — pass/fail is judged against `spec.md` + the design artifacts, before and during implementation.
- Any `[Gap]` that cannot be traced to a spec section is a spec-completeness defect to fix before `/speckit-analyze`.
