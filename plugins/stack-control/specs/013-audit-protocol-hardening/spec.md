# Feature Specification: Audit-Protocol Hardening — Layout-Aware Feature & Audit-Log Resolution

**Feature Branch**: `feature/stack-control` (one-long-lived-branch convention; spec dir resolved via the CLAUDE.md SPECKIT marker / `.specify/feature.json`, not the branch)

**Created**: 2026-06-10

**Status**: Draft (narrowed per operator scoping pass, 2026-06-10)

**Input**: Operator direction (2026-06-10): the audit protocol's **rigid path resolution** is the absolute must-fix — *"it expects the audit log to be in a rigid path spec which no longer applies to the way we structure our files."* The audit protocol resolves a feature's root (and its `audit-log.md`) **only** under the legacy `docs/<version>/001-IN-PROGRESS/<slug>/` layout, so a Spec Kit feature structured as `specs/NNN-slug/` is invisible to lift, the convergence gate, `govern`, and the scope-* verbs. This blocks running governance on spec-structured features at all (including this very spec).

## Context — origin, narrowing, and the verified ground truth

This feature graduated from the backlog and was **narrowed by an explicit operator scoping pass** on 2026-06-10. The narrowing was driven by a Phase-0 verification pass that read the current code for every candidate defect rather than trusting the (partly stale) backlog assumptions:

| Candidate | Verified state (current code) | Disposition |
|---|---|---|
| **Feature/audit-log path is `docs/*/001-IN-PROGRESS/`-only** (TASK-14 / gh-442) | ❌ open — `src/scope-discovery/util/feature-root.ts:94-103` walks only `<docs>/<version>/001-IN-PROGRESS/<slug>` | **IN — US1 (the must-fix)** |
| **First-barrage stranding / no audit-log scaffold** (TASK-13 / gh-441) | ❌ open — `audit-barrage-lift.ts:273-274` aborts `return 2` on missing `audit-log.md` | **IN — US2 (companion)** |
| Gate counts raw pre-slush severity (TASK-18 / gh-432 Facet A) | ✅ already fixed — commit `eed196b3`; `check-barrage-dampener.ts:176-188` uses `rawHighPlusCount`/`rawMediumCount` | OUT — done |
| Convergence loop as a code driver (gh-432 Facet B) | ❌ open (loop is skill-body prose) | OUT — operator declined ("not a blocker; don't implement") |
| Lift merges distinct-mechanism findings (TASK-12 / gh-440) | ❌ open — `extract-barrage-findings.ts:23` clusters by same file regardless of mechanism | OUT — deferred to backlog |
| Slush two-walk silent drop (TASK-2 / AUDIT-20260609-19) | ❌ open — `slush-findings.ts:156` vs `:171-172` | OUT — deferred to backlog |
| No graduation record (TASK-19 / gh-434) | ❌ open — gate prints bool; `reconcile.ts:9` "not yet" | OUT — deferred to backlog |
| Barrage self-referential input (gh-431) | ❌ open, implement-mode only | OUT — stays on roadmap node `multi:fix/audit-barrage-self-referential` |

**Originating backlog items for THIS narrowed feature** (recorded for bidirectional navigability): **TASK-14** (spec lead) and **TASK-13** (task). The out-of-scope items are listed, with their tracking homes, in the *Out of Scope* section below — they are deferred, not dropped.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The audit protocol finds a feature's audit-log regardless of file layout (Priority: P1)

An operator (or unattended loop) runs any audit-protocol step — `audit-barrage-lift`, the convergence gate, `govern`, or a scope-* verb — against a feature whose files live under the Spec Kit layout `specs/NNN-slug/`. The step resolves that feature's root and its `audit-log.md` and proceeds, exactly as it does for a legacy `docs/<version>/001-IN-PROGRESS/<slug>/` feature — with no manual path flag and no "not found" abort.

**Why this priority**: This is the must-fix and the actual blocker. Today the single shared resolver `resolveFeatureRoot` (`feature-root.ts`) — and every consumer that depends on it (`audit-barrage-lift`, `workplan-aware-gate`, the gate/`govern` audit-log resolution, `scope-inventory`/`scope-widen`/`scope-export`) — walks **only** `<docs>/<version>/001-IN-PROGRESS/<slug>`. The project now structures features as `specs/NNN-slug/` (this spec is `specs/013-...`). The audit protocol therefore cannot locate a spec-structured feature's audit-log at all: running governance on `specs/013` fails before it starts. The rigid path is a single chokepoint whose breakage cascades to the entire audit surface.

**Independent Test**: Place a feature at `specs/NNN-<slug>/` with an `audit-log.md`. Call the resolution path used by lift/gate/govern with that feature's slug (or spec dir). Assert it returns the `specs/NNN-<slug>/` root and the audit-log path underneath it, with no manual override — and that the identical call for a legacy `docs/<v>/001-IN-PROGRESS/<slug>/` feature still resolves unchanged.

**Acceptance Scenarios**:

1. **Given** a feature at `specs/013-audit-protocol-hardening/` with an `audit-log.md`, **When** `audit-barrage-lift` / the gate / `govern` resolves the feature, **Then** it returns that spec dir as the feature root and reads/writes the audit-log there.
2. **Given** a legacy feature at `docs/1.0/001-IN-PROGRESS/<slug>/`, **When** the same resolution runs, **Then** it resolves unchanged (the existing `feature-root.test.ts` lex-greatest-version contract is preserved — no regression).
3. **Given** a slug resolvable under **both** layouts, **When** resolution runs, **Then** a deterministic, documented precedence selects one (no nondeterministic split-brain — the AUDIT-06 determinism contract extends to the two-layout case).
4. **Given** a slug resolvable under **neither** layout, **When** resolution runs, **Then** it fails loud naming both layouts searched (no silent wrong-target, no fallback — Constitution Principle V).
5. **Given** every existing consumer of the resolver, **When** the layout-awareness lands, **Then** each resolves through the **one** shared helper (no second hardcoded `docs/*/001-IN-PROGRESS` path reintroducing the split-brain AUDIT-20260530-15 closed).

---

### User Story 2 — A feature's first barrage scaffolds its audit-log instead of aborting (Priority: P2)

The first end-of-task barrage of a brand-new feature lands its findings even though no `audit-log.md` exists yet — lift creates the audit-log from the canonical header at the resolved path (auto-scaffold-on-first-use), rather than aborting and stranding the fired barrage.

**Why this priority**: Companion to US1 on the same surface. Even once the path resolves correctly (US1), a brand-new `specs/NNN-slug/` feature has no `audit-log.md` on its first barrage, and today `audit-barrage-lift` aborts (`return 2`, "audit-log not found"); the no-new-diff guard then blocks a re-lift, so the first audit strands until hand-recovered. P2 because the failure is loud and currently hand-recoverable — but it defeats unattended execution and is pointless to leave broken once US1 makes the path resolvable.

**Independent Test**: Run the end-of-task barrage + lift against a `specs/NNN-slug/` feature with no `audit-log.md`. Assert lift scaffolds the audit-log from the canonical header at the resolved path and writes the findings, with no manual step and no abort.

**Acceptance Scenarios**:

1. **Given** a resolved feature root with no `audit-log.md`, **When** lift runs, **Then** it scaffolds the audit-log from the canonical header (the same auto-scaffold-on-first-use pattern the backlog store already uses) and writes the findings.
2. **Given** a barrage already fired but un-lifted (run-dir present, tip unchanged), **When** lift is re-run against that explicit run-dir, **Then** the no-new-diff guard does not strand the already-fired findings.

---

### Edge Cases

- **Slug → spec-dir mapping:** legacy dirs are named exactly `<slug>`; Spec Kit dirs are `NNN-<slug>` (numbered). Resolution against `specs/` must map a bare slug to its `NNN-<slug>` dir (suffix match after the numeric prefix) — OR consume the already-resolved spec dir from `.specify/feature.json` / the SPECKIT marker. Which input the resolver takes (bare slug vs. spec dir) is a design decision for the plan; both call shapes (slug-driven for lift, dir-driven for spec-mode govern) must work.
- **No version dir under `specs/`:** `specs/` is flat (`specs/NNN-slug/`), unlike `docs/<version>/001-IN-PROGRESS/`; the resolver's version-walk + lex-greatest pick does not apply to the `specs/` branch and must not be forced onto it.
- **Both layouts present for one logical feature:** precedence must be deterministic and documented (AS-3).
- **Numeric-prefix collision:** two `specs/` dirs sharing a slug suffix but different numbers — define the match (exact `NNN-slug`, or highest number, or fail-loud on ambiguity).
- **Empty barrage + scaffold:** a first barrage that surfaces zero findings — does US2 still create the audit-log (so the ledger exists), or skip? (Capture: create it, so the feature has a ledger from run one.)
- **Cross-consumer reach:** `scope-inventory`/`scope-widen`/`scope-export` build `docs/1.0/001-IN-PROGRESS/<slug>/...` paths directly (`scope-*-cli.ts`), not only via the helper — these direct constructions are part of the same rigid-path class and must be reconciled or explicitly scoped.

## Requirements *(mandatory)*

### Functional Requirements

**Layout-aware resolution (US1)**
- **FR-001**: `resolveFeatureRoot` MUST resolve a feature root for a feature structured as `specs/NNN-<slug>/`, in addition to the legacy `docs/<version>/001-IN-PROGRESS/<slug>/`.
- **FR-002**: The `audit-log.md` path MUST be derived from the resolved feature root, identically across layouts.
- **FR-003**: Every current consumer of feature-root resolution (`audit-barrage-lift`, `workplan-aware-gate`, the gate/`govern` audit-log resolution, and — at minimum reconciled or explicitly scoped — `scope-inventory`/`scope-widen`/`scope-export`) MUST resolve through the one shared helper; no second hardcoded `docs/*/001-IN-PROGRESS` path may remain that reintroduces the split-brain.
- **FR-004**: Legacy `docs/<version>/001-IN-PROGRESS/<slug>/` resolution MUST be preserved unchanged, including the lex-greatest-version contract pinned by `feature-root.test.ts` (backward compatible).
- **FR-005**: When a slug resolves under both layouts, resolution MUST apply a single deterministic, documented precedence (no nondeterministic split-brain).
- **FR-006**: When a slug resolves under neither layout, resolution MUST fail loud naming both layouts searched — no fallback, no silent wrong-target (Constitution Principle V).

**First-barrage scaffold (US2)**
- **FR-007**: `audit-barrage-lift` (or the hook) MUST scaffold `audit-log.md` from the canonical header at the resolved feature root when it is absent, instead of aborting.
- **FR-008**: An already-fired-but-un-lifted barrage MUST be liftable against its explicit run-dir without the no-new-diff guard stranding it.

**Cross-cutting**
- **FR-009**: No requirement may be satisfied by a fallback or mock outside test code (Constitution Principle V).
- **FR-010**: Every behavioral change MUST be pinned by a RED-first test that reproduces the defect before the fix (Constitution Principle I); US1 and US2 each carry a regression test exercising the spec-layout resolution and the missing-audit-log scaffold respectively.

### Key Entities

- **Feature root**: the directory that holds a feature's governance artifacts (workplan / prd / spec / `audit-log.md`). Today exclusively `docs/<version>/001-IN-PROGRESS/<slug>/`; US1 adds `specs/NNN-<slug>/`.
- **Resolver (`resolveFeatureRoot`)**: the single shared helper (`feature-root.ts`) that maps a feature identity (slug or spec dir) to its feature root + version list. The chokepoint US1 widens.
- **Audit-log**: the per-feature ledger at `<feature-root>/audit-log.md`; located by US1, scaffolded by US2.
- **Run / run-dir**: one barrage execution's per-model outputs; lifted into the audit-log (US2 covers the explicit-run-dir re-lift).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An audit-protocol step (lift / gate / `govern`) runs end-to-end against a `specs/NNN-slug/` feature and resolves its `audit-log.md` with zero manual path flags (the `specs/013` governance run that is blocked today succeeds).
- **SC-002**: 100% of existing `docs/*/001-IN-PROGRESS/` features resolve unchanged after the change (no regression; the lex-greatest contract test stays green).
- **SC-003**: The first barrage of a brand-new `specs/` feature scaffolds its audit-log and lands findings with zero manual scaffolding steps.
- **SC-004**: A slug resolvable under neither layout produces a fail-loud error naming both searched layouts (no silent skip, no fallback).
- **SC-005**: There is exactly one feature-root resolver in the codebase after the change; no consumer reintroduces a hardcoded `docs/*/001-IN-PROGRESS` path (grep-verifiable).
- **SC-006**: Every behavioral change ships with a RED-first test reproducing the original failure; the suite fails on pre-fix code and passes on post-fix code.

## Out of Scope — deferred, not dropped (operator scoping pass 2026-06-10)

These were captured during the broader audit-protocol investigation and **explicitly scoped out of 013** by the operator. Each retains a tracking home so it is not lost:

| Item | Tracking home | State |
|---|---|---|
| Lift merges distinct-mechanism findings under one ID | backlog **TASK-12** / gh-440 | open; un-promoted from 013, remains in the backlog pile |
| Slush dry-run vs apply two-walk silent drop | backlog **TASK-2** / AUDIT-20260609-19 | open; un-promoted from 013, remains in the backlog pile |
| No durable governance-graduation record | backlog **TASK-19** / gh-434 | open; un-promoted from 013, remains in the backlog pile |
| Convergence gate Facet A (raw-count) | backlog **TASK-18** / gh-432 | **already fixed** (`eed196b3`); a Facet-A regression-lock test is an open option, not scheduled here |
| Convergence loop as a code driver (Facet B) | backlog **TASK-18** / gh-432 | open; **declined by operator** — "not a blocker; don't implement" |
| Barrage self-referential input + untracked-fold pollution | roadmap **`multi:fix/audit-barrage-self-referential`** / gh-431 | open; stays on its existing roadmap node (implement-mode only) |

> The backlog items above remain `To Do` in the pile; only their 013 promotion linkage was removed. The roadmap node remains on the roadmap. Re-promoting any of them into a future feature is the normal next-burn-down path.

## Assumptions

- The resolver and its consumers live in stack-control (`src/scope-discovery/util/feature-root.ts` and the audit/scope surfaces that call it). The FRs bind behavior (layout-aware resolution + scaffold), not a specific refactor shape.
- The `specs/NNN-slug/` layout is the project's current Spec Kit structure (this spec is `specs/013-...`); the `docs/<version>/001-IN-PROGRESS/<slug>/` layout remains in use for legacy features and must keep working.
- Two-layout precedence (FR-005) defaults toward the `specs/` layout for new work, but the exact rule is a plan-level decision the operator can confirm.
- The scaffold (US2) reuses the canonical audit-log header already defined in the codebase; it does not invent a new header format.

## Dependencies

- **`feature-root.ts` resolver** — the single chokepoint US1 widens; its lex-greatest-version regression test is the backward-compat guard.
- **`audit-barrage-lift` / gate / `govern` / scope-* verbs** — consumers that must resolve through the widened helper.
- **`.specify/feature.json` / CLAUDE.md SPECKIT marker** — the spec-mode source of the active feature's spec dir (a candidate dir-driven input to the resolver).
