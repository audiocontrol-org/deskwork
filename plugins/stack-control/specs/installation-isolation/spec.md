# Feature Specification: Installation Isolation — stack-control state never leaves the installation tree by default

**Feature Branch**: `feature/stack-control` (one-long-lived-branch convention; spec dir `specs/installation-isolation` — the first spec under the descriptive-slug naming convention, operator directive 2026-06-10)

**Created**: 2026-06-10

**Status**: Draft

**Input**: Operator directive (2026-06-10): *"Installations MUST be isolated. It is completely unacceptable to write outside the installation tree by default."* Promoted from backlog **TASK-45** (anchor unification), which carries the originating research and the operator's refinements; see also AUDIT-20260611-13 / TASK-40 (the cwd-anchoring instance).

## Context

Two anchor models coexist in stack-control today. The 009-era verbs (backlog, roadmap, inbox, session-start, check-clones, scope-export base root, install-scope-discovery) resolve **through the nearest-enclosing installation** — the directory carrying the `.stack-control/config.yaml` marker. The dw-lifecycle-ported surfaces (govern's `--repo-root` plumbing, the audit-barrage config override load, the audit-run directories, clone-detector-reader's baseline path, scope-widen's auto-seed, the feature-root consumers) resolve against a **caller-supplied repo root** — and write stack-control state wherever that root points, whether or not it is an installation.

The observed consequence in this very repository: the monorepo root is a *half-installation* — it holds `.stack-control/audit-barrage-config.yaml` and a growing `.stack-control/audit-runs/` tree with **no** `config.yaml` marker, created entirely by repo-root-keyed write paths, while the actual installation lives at `plugins/stack-control/`. The audit protocol has surfaced the seam three times (most recently AUDIT-20260611-13: govern's backlog-store exclusion anchored on `process.cwd()`).

The only legitimate non-installation facts are **external-tool anchors**, and they are *derived*, never free parameters:

- **git** is not a repo-root constraint: `git -C <installation> diff --relative` and `git ls-files` (cwd-relative by default) anchor the diff engine at the installation cleanly (operator refinement on TASK-45).
- **Spec Kit** roots at the nearest-enclosing `.specify/` directory by upstream design (v0.9.4 `common.sh` walks up, prioritized over the git toplevel), so the framework can live *inside* an installation; `SPECIFY_FEATURE_DIRECTORY` / `.specify/feature.json#feature_directory` override the per-feature dir. Only the literal `specs/` and `.specify` names are fixed upstream.

While spec artifacts live outside the installation (this monorepo's transitional layout), an installation-scoped diff omits the feature's spec artifacts from the governed payload — so the design must either fold the resolved feature root into the governed payload explicitly, or relocate the Spec Kit root inside the installation (supported upstream).

## Clarifications

### Session 2026-06-10

- Q: What happens to the `--repo-root` flag on state-writing verbs once the installation is the primary anchor? → A: **Retired.** State-writing verbs expose no repo-root parameter; the installation walk-up (cwd as start point) plus the explicit installation-naming flag (`--at`) are the only anchors. External anchors (git toplevel, Spec Kit root) are derived internally from their own markers. Old invocations passing the retired flag get the loud unknown-flag usage error.
- Q: Is relocating this repo's Spec Kit root (`.specify/` + `specs/` → the installation) in scope? → A: **In scope as the P3 closing story (US6).** US3's explicit cross-tree fold covers the transitional layout until the relocation dissolves it permanently.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - State-writing verbs anchor in the installation (Priority: P1)

An operator (or an unattended loop) runs any state-creating or state-mutating stack-control verb — a barrage, a govern pass, a scope-widen with auto-seed, a backlog capture — from any working directory, in a repository where the installation is a subdirectory of a larger tree. Every piece of stack-control-owned state the verb creates (run directories, baselines, seeded registries, backlog items, working files) lands inside the installation tree. Nothing is written outside it by default.

**Why this priority**: This is the operator directive verbatim — the isolation invariant is the feature. Every other story is a consequence or an enabler of this one.

**Independent Test**: In a fixture where an installation is nested inside a larger repository, run each state-creating verb and diff the filesystem outside the installation tree before/after: zero changes (OS temp directories exempt).

**Acceptance Scenarios**:

1. **Given** an installation at `<repo>/sub/` and a barrage invoked from `<repo>` against work in the installation, **When** the run completes, **Then** the run directory and all captured artifacts are under `<repo>/sub/.stack-control/` and nothing was created under `<repo>/.stack-control/`.
2. **Given** the same nested fixture, **When** scope-widen auto-seeds missing scope-discovery state, **Then** the seeded state lands under the installation's `.stack-control/scope-discovery/`, not under the outer repository root.
3. **Given** the same nested fixture, **When** the barrage loads its model-battery configuration, **Then** the configuration is read from the installation tree (the outer root's config, if any, is ignored with a loud notice — never silently preferred).

---

### User Story 2 - No installation, no write: fail loud (Priority: P1)

An operator runs a state-writing verb from a directory with **no** enclosing installation. The verb refuses, names the start directory it walked up from, and states the remediation (`stackctl setup`). It never falls back to writing at the git toplevel, the supplied repo root, or the current directory.

**Why this priority**: The complement of US1 — without the refusal, "isolation by default" silently degrades to "isolation when an installation happens to exist." This is the no-silent-fallbacks rule applied to placement.

**Independent Test**: Run each state-writing verb in a git repository that has no `.stack-control/config.yaml` anywhere above the start dir; every one exits non-zero with the setup remediation and a filesystem diff shows zero new stack-control state anywhere.

**Acceptance Scenarios**:

1. **Given** a repository with no installation, **When** a state-writing verb runs, **Then** it exits non-zero, names the directory it resolved from, and points at `stackctl setup`.
2. **Given** the same repository, **When** a *read-only* verb runs (e.g. a check against committed state passed by explicit path), **Then** it behaves as today — the refusal applies to writes, not reads.

---

### User Story 3 - Governance anchors at the installation (Priority: P2)

A govern pass (implement or spec mode) anchors everything it owns at the installation: the diff engine is invoked against the installation subtree with installation-relative paths, the prompt payload, run directories, and barrage configuration all resolve through the installation, and the recorded protocol artifacts (audit-log excerpts, lift targets) reach the feature's own artifact tree. The free `--repo-root` parameter no longer exists on state-writing verbs (Clarification 2026-06-10: retired) — the installation walk-up and the explicit installation-naming flag are the only anchors, and the external anchors (git toplevel, Spec Kit root) are derived internally.

**Why this priority**: Governance is the heaviest writer (run dirs per round, config reads per verb, payload assembly) and the surface where every seam bug so far has been found. It depends on US1's anchor primitive.

**Independent Test**: A govern pass over a nested-installation fixture produces a payload whose paths are installation-relative, writes run state only inside the installation, and — when the feature's spec artifacts live outside the installation subtree — the governed payload still demonstrably contains them (the cross-tree fold) or the run refuses with a loud explanation, never silently audits a partial change.

**Acceptance Scenarios**:

1. **Given** a nested installation and a committed change inside it, **When** govern runs, **Then** the audited diff covers the installation subtree with installation-relative paths and the run directory lands inside the installation.
2. **Given** feature spec artifacts that live outside the installation subtree (the transitional monorepo layout), **When** govern assembles the payload, **Then** the spec artifacts are explicitly folded in (or the run fails loud naming the cross-tree gap) — they are never silently dropped from the audit.
3. **Given** a legacy invocation passing the retired repo-root flag to a state-writing verb, **When** it runs, **Then** it fails with the loud unknown-flag usage error (never a silent acceptance that places state).

---

### User Story 4 - The working directory never decides placement (Priority: P2)

A verb invoked from *anywhere* — repo root, installation root, a deep subdirectory, a different repository entirely (with explicit anchors) — places state identically. The current working directory's only role is as the default *start point* for the installation walk-up; it is never itself a write anchor. (This generalizes TASK-40 / AUDIT-20260611-13, where a cwd-resolved store silently diverged from the `--repo-root`-resolved payload.)

**Why this priority**: cwd-sensitivity is the mechanism by which isolation violations hide — the same command does different things in different shells. Depends on US1's primitive.

**Independent Test**: Run the same state-writing verb from three different working directories against the same installation; the resulting filesystem state is identical in all three runs.

**Acceptance Scenarios**:

1. **Given** an installation, **When** the same verb runs from the installation root, from a subdirectory of it, and from the outer repo with an explicit anchor, **Then** all state lands in the same places.
2. **Given** two sibling installations, **When** a verb runs from inside installation A naming installation B explicitly, **Then** state lands in B and the verb says so.

---

### User Story 5 - Legacy out-of-tree state is detected and announced (Priority: P2)

An operator whose repository carries legacy repo-root-keyed state (this repo's half-installation: a root `.stack-control/` with config and audit-runs but no marker) is told loudly, at the moment a verb would have read or written that state, that it is legacy, where the installation-anchored location is, and how to migrate — mirroring the legacy-config notice pattern shipped in the audit-protocol-reliability feature (announce; never silently move or clobber; the remediation never overwrites existing operator-tuned state).

**Why this priority**: Without detection, the old state silently bitrots or — worse — keeps being *read* while new state lands elsewhere, splitting the source of truth. Migration execution is the operator's action; the system's job is loud, safe advice.

**Independent Test**: A fixture with root-level legacy state plus a proper nested installation produces the notice on every verb that would have consumed the legacy state, with a remediation that is safe to paste.

**Acceptance Scenarios**:

1. **Given** legacy state at an outer root and an installation below it, **When** a verb runs, **Then** the legacy state is named, ignored for writes, and the migration advice never targets an existing tuned file destructively.
2. **Given** no legacy state, **When** verbs run, **Then** no notice fires (no cry-wolf).

---

### User Story 6 - The Spec Kit root can live inside the installation (Priority: P3)

For this repository: the Spec Kit framework (`.specify/`, `specs/`) relocates into the installation (`plugins/stack-control/`), exercising upstream's nearest-`.specify`-wins resolution, so feature artifacts and governed payloads stop spanning trees. All consumers that assume `<repoRoot>/specs` — the layout-aware feature-root resolver, the active-plan marker in the repo-root agent context file, the governance payload's feature-root fold, the spec-governance extension wiring — resolve the relocated root correctly. Recorded references to pre-relocation paths (the promotion linkage on TASK-45, prior specs' cross-references) remain navigable.

**Why this priority**: It completes the isolation story for this repo's own dogfood and dissolves the cross-tree fold permanently — but US3's explicit fold already covers the governed-payload gap in the transitional layout, so this is sequenced last.

**Independent Test**: After relocation, `spec-check`, the authoring chain, governance, and the feature-root resolver all operate on a spec under the installation; no tool recreates or consults the old root-level `specs/` location.

**Acceptance Scenarios**:

1. **Given** the relocated framework, **When** a new spec is authored, **Then** its artifacts land under the installation and the full authoring chain (specify → plan → tasks → execute-check) passes against them.
2. **Given** the relocated framework, **When** govern runs over a feature, **Then** the payload contains the feature's spec artifacts without any cross-tree fold machinery.

---

### Edge Cases

- **Nested installations**: nearest-enclosing wins (009 semantics). A verb explicitly told to operate on an *outer* installation from inside an inner one must state which installation it chose.
- **The resolved feature root lies outside the installation** (transitional layout): writes to the feature's own artifact tree (audit-log, evidence) are permitted as the *feature anchor* — a designated, announced anchor — not as a default-write escape hatch. The isolation probe treats them as exempt only when they go to the resolved feature root.
- **OS temp directories**: exempt from the invariant (ephemeral by contract).
- **Explicit operator overrides** (e.g. an environment seam pointing the backlog store elsewhere): honored — "by default" is the operative phrase — but the override's effect is announced, not silent.
- **An explicit `--at` naming a different installation than the cwd's enclosing one**: the explicit flag wins (it is an explicit anchor), and the verb states the installation it operates on.
- **Read-side compatibility window**: legacy out-of-tree state may still be *discoverable* for reads during a transition, behind the US5 notice — never written to.
- **Worktrees**: a git worktree of an installation is its own filesystem tree; the walk-up resolves the worktree's own copy of the marker, and state lands in the worktree (no cross-worktree writes).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every verb that creates or mutates stack-control-owned state MUST anchor that state inside the nearest-enclosing installation (or an explicitly named installation). Writing outside the installation tree by default is prohibited.
- **FR-002**: When no installation encloses the resolved start point and a verb needs to write, the verb MUST refuse loudly, naming the start point and the `stackctl setup` remediation. There is no fallback write location.
- **FR-003**: The current working directory MUST NOT determine where state lands. Its only sanctioned role is as the default start point of the installation walk-up.
- **FR-004**: External-tool anchors (the git toplevel; the Spec Kit root) MUST be derived from their own markers, never accepted as free parameters that can place stack-control state. The repo-root parameter is RETIRED on state-writing verbs (Clarification 2026-06-10); explicit anchoring is expressed only as a named installation.
- **FR-005**: Governance MUST anchor its diff engine, payload paths, run directories, and configuration at the installation. When the feature's artifacts span outside the installation subtree, the governed payload MUST include them explicitly or the run MUST fail loud — partial payloads are never silent.
- **FR-006**: Legacy out-of-tree state MUST be detected at the decision site and announced with safe migration advice (never a destructive command targeting existing operator-tuned files; mirroring the established legacy-notice pattern). Writes never target legacy locations.
- **FR-007**: Explicit overrides (named installation, environment seams) remain honored but MUST be announced in the verb's output — "by default" is the contract; silent redirection is not.
- **FR-008**: The isolation invariant MUST be enforceable by an automated probe: every state-creating verb, run against a nested-installation fixture, produces zero filesystem changes outside the installation tree (exemptions: OS temp dirs; the resolved feature root as a designated anchor; explicitly announced overrides).
- **FR-009**: For this repository, the Spec Kit root and the program's spec artifacts MUST be relocatable into the installation with all consumers (feature-root resolution, the active-plan marker, governance payload assembly, extension wiring) resolving the relocated root; recorded references remain navigable.
- **FR-010**: The installation-anchor rule MUST be recorded as a governance-level principle (constitution or equivalent) so future verbs inherit it by default rather than re-deciding it.

### Key Entities

- **Installation**: a directory tree rooted at the `.stack-control/config.yaml` marker; the unit of isolation; owns all stack-control state beneath it.
- **External anchor**: a fact derived from another tool's own marker (git toplevel; Spec Kit `.specify/` root) — consulted, never a write target for stack-control state.
- **Feature anchor**: the resolved feature artifact root (spec dir / legacy docs dir); a designated write target for the feature's own protocol artifacts (audit-log, evidence), wherever it lives.
- **Legacy state**: stack-control-shaped files outside any installation (the half-installation); read-discoverable behind a notice during transition; never a write target.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The isolation probe passes for 100% of state-creating verbs: in a nested-installation fixture, zero filesystem changes outside the installation tree (per the FR-008 exemptions).
- **SC-002**: Running the full governance loop (render → barrage → lift → slush → gate) on a nested-installation fixture leaves the outer tree byte-identical outside the installation.
- **SC-003**: The same verb invoked from three different working directories produces byte-identical state placement.
- **SC-004**: In this repository, after migration, no stack-control state exists at the monorepo root without a marker — the half-installation is gone, and a probe (re-runnable by the operator) demonstrates no verb recreates it.
- **SC-005**: A repository with no installation refuses every state-writing verb with the setup remediation — zero new state directories appear anywhere.
- **SC-006**: Every legacy-state and override announcement is observable in the verb's standard error output — an operator can quote the line that told them where state went and why.

## Assumptions

- The 009 installation model (`.stack-control/config.yaml` marker; nearest-enclosing walk-up; `--at`/explicit-root overrides) is the settled foundation; this feature extends its reach, it does not redesign it.
- backlog.md remains the adopted backlog tool; its store stays where the installation's configuration puts it (already installation-anchored via the root seam).
- The dw-lifecycle plugin is out of scope: its surfaces are retired by the succession program, not converted (per the stack-control-succession rule, dw-lifecycle stays undisturbed).
- Spec Kit's upstream behavior (nearest-`.specify` resolution, `feature.json` override) is as verified on v0.9.4 and current `main` (TASK-45 research); no upstream changes are required.
- Migration of this repo's existing legacy state (root audit-runs, barrage config) is an operator-approved step within this feature, not an automatic side effect of upgrading.
- Exit-code contracts remain frozen adopter contracts; new refusals use existing fail-loud channels and codes additively where possible.
