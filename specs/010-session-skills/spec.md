# Feature Specification: Native session-start / session-end lifecycle skills (session-skills)

**Feature Branch**: `feature/stack-control` (spec dir `010-session-skills`)

**Created**: 2026-06-10

**Status**: Draft

**Roadmap codename**: `multi:feature/session-skills`

**Input**: User description: "Native, Spec-Kit-aware session-start / session-end lifecycle skills for the stack-control plugin (CLI `stackctl`), built NATIVE (not ported from dw-lifecycle). session-start bootstraps a fresh agent into the project's active work and stops until the operator confirms a goal; session-end captures the closing record (journal, tooling friction, advisory clone-snapshot, issue surfacing) and commits + pushes. De-couple from project-specific conventions (#122) by resolving every working file through the surface-agnostic stack-control config + installation-resolution contract; add a branch-staleness advisory at session boot (#422); keep it CLI-first / surface-agnostic."

## Context & Problem

Every working session on a stack-control project has two boundaries that need a repeatable ceremony: **boot** (a fresh, blank-context agent must be oriented into the project's active work before it does anything) and **close** (the session's record — what was tried, what worked, what is open — must be captured durably or it is lost at the next context boundary). These two ceremonies are the load-bearing answer to the thesis's *"memory loss → durable written artifacts"* principle: an agent that boots un-oriented re-derives (or re-implements) settled work, and a session that closes without a written record loses its continuity thread.

Two concrete implementations of this ceremony already exist in this repository, and **both are coupled to a specific project's conventions** — which is exactly why the native pair must be rebuilt rather than ported:

1. **`plugins/dw-lifecycle/skills/session-{start,end}`** — hardcoded to deskwork's conventions: a `README.md` status table + `workplan.md` check-off spine, a fixed `DEVELOPMENT-NOTES.md` journal with deskwork's taxonomy, `.dw-lifecycle/config.json` preambles, and the dw-lifecycle structural-chain verbs. It assumes the deskwork document model ([#122](https://github.com/audiocontrol-org/deskwork/issues/122)).
2. **`.claude/skills/session-{start,end}` (branch-local)** — already Spec-Kit-aware (it detects where a feature sits in the authoring chain, reads the governed roadmap, captures tooling friction, runs the advisory clone-snapshot), but hardcoded to **this branch**: fixed paths under `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/`, the literal branch name `feature/pluggable-lifecycle-providers`, the single feature slug. It is explicitly marked *"temporary, reconcile at merge."*

The native pair generalizes both into `plugins/stack-control/skills/session-start` and `session-end` (with their `stackctl` CLI verbs underneath), keeping the useful behaviors — boot-orientation, report-and-stop, closing-capture — while removing every hardcoded path, branch name, feature slug, and journal-shape assumption. It does this by resolving **every working file it touches** (governed roadmap, design inbox, journal/development-log, tooling-friction log, program audit log, and the clone-snapshot's source scope) through the **surface-agnostic stack-control installation config + resolution contract** — the same contract that `multi:feature/project-doc-setup` (009) *writes* and `design:gap/project-relative-doc-discovery` *resolves at read time*. This feature is specified **to that contract**, not to 009's in-flight implementation: the dependency is recorded as an edge, so DEFINE can proceed independently of 009's branch.

Two further constraints, both first-class:

- **Branch-staleness advisory at boot** ([#422](https://github.com/audiocontrol-org/deskwork/issues/422)): session-start warns when the working branch is behind its base, so a stale-branch session does not silently re-implement work that already shipped. **Advisory, never a hard block.**
- **CLI-first / surface-agnostic** (constitution Principle VIII + 009 FR-025/026): the capability is reachable through the `stackctl` CLI by any agent or a human with no Claude-Code-specific surface required; the `/stack-control:…` skills are thin adapters over the CLI, never the sole path.

This is **not** a website concern and carries no renderer assumptions; it operates on a project's governed-document tree the same way for any adopter.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A fresh agent is oriented at boot and does not start uninvited (Priority: P1) 🎯 MVP

A blank-context agent begins a session on a stack-control project. It runs session-start once. Afterward it has a concise, accurate picture of the project's active work — the governed roadmap's ready/next and blocked items, the active spec and **where that spec sits in the authoring chain** (which artifacts exist → the next step in the lifecycle), the latest journal entry, and the open work/issues — and it **reports that picture and stops**, taking no implementation action until the operator confirms a session goal.

**Why this priority**: This is the feature's reason to exist and the direct mechanization of *"memory loss → durable written artifacts"* + *"an un-oriented agent re-derives settled work."* Without it, every fresh session starts blind. The report-and-stop boundary is what keeps the agent from the "started before the operator finished thinking" failure mode.

**Independent Test**: In a configured installation with a populated roadmap, an active spec partway through its authoring chain, and a prior journal entry, run session-start; assert the report names the next roadmap work, the active spec's chain position (and the next authoring step), the last journal entry, and open issues — and that no implementation action is taken before the operator confirms.

**Acceptance Scenarios**:

1. **Given** a configured installation with active work, **When** session-start runs, **Then** it reports the governed roadmap's ready/next + blocked items, the active spec and its position in the authoring chain (with the next step), the latest journal entry, and open issues — in one concise summary.
2. **Given** session-start has reported state, **When** the report completes, **Then** the agent takes no implementation action and waits for the operator to confirm the session goal.
3. **Given** the project sits between features (no single active spec), **When** session-start runs, **Then** it still reports the roadmap's next/blocked work and the latest journal entry, and says plainly that there is no active spec rather than failing.
4. **Given** session-start is re-run in the same session, **When** it runs, **Then** it produces the same orientation with zero side effects (read-only).

---

### User Story 2 - A session's record is captured and durably saved at close (Priority: P1)

At the end of a session the agent runs session-end. It writes a development-log journal entry recording the session (goal, what was accomplished, what failed, course corrections, quantitative counts, insights), captures any tooling friction that surfaced, runs an advisory clone-snapshot to catch duplication written this session, surfaces the issues that progressed (as evidence — never auto-closing them), and **commits and pushes** the documentation changes so the record survives the container being reclaimed.

**Why this priority**: The journal is the continuity thread the next session-start consumes; a session that closes without a committed-and-pushed record loses that thread, and an unpushed record is lost when the ephemeral worktree is dismantled. Capture-at-close is co-equal P1 with orient-at-boot — the two are the read and write halves of the same durable-artifact loop.

**Independent Test**: After a session with at least one commit, run session-end; assert a journal entry is appended in the project's configured journal location, the documentation changes are committed AND pushed, the clone-snapshot ran and any new duplication is surfaced, and any progressed issue is surfaced as evidence with no automated closing transition.

**Acceptance Scenarios**:

1. **Given** a session with progress, **When** session-end runs, **Then** a journal entry recording the session is appended to the configured journal working file.
2. **Given** session-end composed a journal entry, **When** it finishes, **Then** the documentation changes are committed and pushed (pushing is part of "done," not a later step).
3. **Given** code was written this session, **When** session-end runs, **Then** an advisory clone-snapshot runs over the installation's configured source scope and any new duplication is surfaced (advisory, non-blocking).
4. **Given** an issue progressed this session, **When** session-end runs, **Then** the issue is surfaced as evidence and the closing transition is left to the operator (never auto-closed).
5. **Given** little or nothing changed this session, **When** session-end runs, **Then** it still writes an honest, possibly-sparse journal entry rather than skipping (empty records beat missed records).

---

### User Story 3 - The skills work in any project without hardcoded conventions (Priority: P1)

An adopter whose project is **not** deskwork — different document locations, a different journal file, a renderer-less governed-document tree, or a monorepo sub-project — installs stack-control and runs the session skills. Both skills resolve every working file they read or write through the installation config (governed roadmap, inbox, journal, tooling-friction log, audit log, clone-snapshot source scope), at the locations that project configured. No hardcoded deskwork path, branch name, feature slug, or journal taxonomy is assumed; when the skills are invoked outside any installation, they fail loudly directing the operator to set the installation up rather than silently reading a plugin-bundled copy.

**Why this priority**: This is the entire reason the pair is rebuilt native rather than ported ([#122](https://github.com/audiocontrol-org/deskwork/issues/122)). The dw-lifecycle and branch-local instances both fail this test by construction. Project-portability is the load-bearing native property; without it the skills are just a third hardcoded copy.

**Independent Test**: In an installation whose journal, roadmap, and clone-snapshot scope are configured at non-default locations, run session-start and session-end; assert every read and write lands at the configured location, and that running either skill outside any installation fails loudly naming the missing installation rather than falling back to a bundled file.

**Acceptance Scenarios**:

1. **Given** an installation with custom working-file locations, **When** session-start runs, **Then** it reads the roadmap, active spec, journal, and open work from the configured locations.
2. **Given** an installation with a custom journal location, **When** session-end runs, **Then** it writes the journal entry, tooling-friction, and commit at the configured locations.
3. **Given** the skills are invoked from a directory inside no installation, **When** either runs, **Then** it fails loudly naming that no installation resolves and directs the operator to setup — it does not fall back to a plugin-bundled copy.
4. **Given** a monorepo with multiple installations, **When** a skill runs within one installation's scope, **Then** it resolves the nearest enclosing installation and operates only on that installation's working files.

---

### User Story 4 - Session-start warns when the branch is stale (Priority: P2)

An operator resumes work on a feature branch that has fallen behind its base (work merged to the base since the branch was last synced). At boot, session-start surfaces an advisory warning that the branch is behind, so the agent does not start a task that re-implements something already shipped. The warning is informational — it never blocks the session from starting.

**Why this priority**: [#422](https://github.com/audiocontrol-org/deskwork/issues/422) — the stale-branch failure mode (silently re-implementing shipped work) is real and expensive, but the cure is a pre-merge early warning, not a gate. P2 because it hardens the orient-at-boot story rather than delivering the core capability alone.

**Independent Test**: With a branch deliberately set behind its base, run session-start and assert the advisory appears naming that the branch is behind; with the branch up-to-date, assert no warning appears; in both cases assert the session is allowed to start.

**Acceptance Scenarios**:

1. **Given** a working branch behind its base, **When** session-start runs, **Then** it surfaces an advisory naming that the branch is behind (and by how much, when determinable) and still allows the session to proceed.
2. **Given** a working branch level with or ahead of its base, **When** session-start runs, **Then** no staleness warning is shown.
3. **Given** the base cannot be determined (no upstream/remote available), **When** session-start runs, **Then** it skips the staleness check cleanly without erroring and proceeds.

---

### User Story 5 - The capability runs from a plain shell with no Claude Code surface (Priority: P2)

An agent or human invokes session-start and session-end through the `stackctl` CLI directly, in a plain shell, with no Claude Code session, slash command, or hook present. Both run to completion and produce the same orientation report and closing record they would when invoked through the `/stack-control:…` skills. The Claude Code skills are thin adapters over the CLI verbs; they are one surface over the capability, never the only path to it.

**Why this priority**: Constitution Principle VIII (faithful tool adoption is surface-agnostic) and 009 FR-025/026 — the CLI is the vendor-neutral core so the capability survives any single host surface (Agent-Skills, `AGENTS.md`, a future MCP server are all adapters). P2 because it is a distribution property layered on the behavior US1/US2 define.

**Independent Test**: In a plain shell (no Claude Code), run the session-start and session-end CLI verbs against a configured installation; assert each runs to completion and produces the same report/record as the skill path.

**Acceptance Scenarios**:

1. **Given** no Claude Code session is present, **When** the session-start CLI verb runs in a configured installation, **Then** it produces the orientation report.
2. **Given** no Claude Code session is present, **When** the session-end CLI verb runs, **Then** it produces and commits + pushes the closing record.
3. **Given** the Claude Code skills are present, **When** a skill is invoked, **Then** it delegates to the same CLI verb (the skill adds no behavior the CLI lacks).

---

### Edge Cases

- **Invoked outside any installation** — both skills fail loudly naming that no installation resolves (consistent with the resolution contract's fail-loud), never falling back to a plugin-bundled working file.
- **First session / empty journal** — session-start reports "no prior journal entry" as a friendly signal and proceeds; it does not treat a missing journal as an error.
- **Between features (no active spec)** — session-start reports roadmap next/blocked + latest journal and states there is no active spec, rather than failing on a missing spec.
- **Partial authoring chain** — when only some authoring artifacts exist for the active spec, session-start infers and names the next step from which artifacts are present.
- **Branch base undeterminable / detached HEAD** — staleness check skips cleanly (US4 AS3); never errors the boot.
- **Uncommitted non-doc changes at close** — session-end warns that non-doc changes are uncommitted (so the closing commit stays doc-only) but does not silently absorb or block them.
- **Nothing progressed this session** — session-end still writes an honest sparse entry (empty records beat missed records) and commits it.
- **Clone-snapshot scope unconfigured or the snapshot tool unavailable** — session-end skips the snapshot cleanly with a note, rather than failing the close.
- **Push fails (e.g. transient network)** — session-end surfaces the failure (the record is committed locally; the push is retried/surfaced) rather than reporting a clean close over an unpushed record.
- **Monorepo nested installations** — a skill invoked in an overlap resolves the nearest enclosing installation (consistent with the resolution contract's nearest-wins), never a sibling or parent by accident.
- **Two-session boundary** — session-start orients for whatever session type the operator is running (orchestrator/DEFINE or implementation/`/speckit-implement`); it never itself runs an authoring or implementation step — it reports and stops.

## Requirements *(mandatory)*

### Functional Requirements

#### session-start — orientation at boot

- **FR-001**: session-start MUST orient the agent to the project's active work in one concise report: the governed roadmap's ready/next and blocked items, the active spec and its position in the authoring chain (which artifacts exist → the next step), the latest journal entry, and the open work/issues.
- **FR-002**: session-start MUST report the oriented state and then STOP — it MUST NOT begin any implementation or authoring step until the operator confirms the session goal (the report-and-stop boundary).
- **FR-003**: session-start MUST determine the active spec's position in the authoring chain from which artifacts are present (and name the next step), without hardcoding a specific feature, branch, or document path.
- **FR-004**: session-start MUST be read-only and side-effect-free; re-running it MUST change nothing on disk.
- **FR-005**: session-start MUST handle the no-active-spec, first-session/empty-journal, and partial-chain states gracefully (a clear "none" signal, not an error).

#### session-end — capture at close

- **FR-006**: session-end MUST write a development-log journal entry recording the session, appended to the installation's configured journal working file. The entry is always written, even when little progressed (an honest sparse entry beats a skipped one).
- **FR-007**: session-end MUST capture any tooling friction that surfaced during the session into the installation's configured tooling-friction log (append-only), and skip cleanly when none surfaced.
- **FR-008**: session-end MUST run an advisory clone-snapshot over the installation's configured source scope and surface any new duplication. The snapshot is advisory — it MUST NOT block the close.
- **FR-009**: session-end MUST surface the issues that progressed this session as evidence, and MUST NOT perform the closing transition itself (the operator/issue-author owns closure — never an automated close).
- **FR-010**: session-end MUST commit AND push the documentation changes; an unpushed record is not a completed close (pushing is the final mile).
- **FR-011**: session-end MUST warn when non-doc changes are uncommitted (so the closing commit stays doc-only), without blocking the close or absorbing those changes into the doc commit.

#### De-coupling — config-resolved, no hardcoded conventions

- **FR-012**: Both skills MUST resolve every working file they read or write — governed roadmap, design inbox, journal/development-log, tooling-friction log, program audit log, and the clone-snapshot source scope — through the stack-control installation config + resolution contract, NOT through hardcoded paths, branch names, or feature slugs.
- **FR-013**: Both skills MUST NOT assume a specific project's journal taxonomy, document model, or renderer; the journal entry's shape MUST follow the project's configured journal template/convention rather than a baked-in deskwork taxonomy.
- **FR-014**: When invoked outside any installation, both skills MUST fail loudly naming that no installation resolves and directing the operator to set the installation up — never falling back to a plugin-bundled working file.
- **FR-015**: Both skills MUST resolve the nearest enclosing installation when run inside a monorepo with multiple installations (consistent with the shared resolution contract's nearest-wins), and operate only on that installation's working files.

#### Branch-staleness advisory

- **FR-016**: session-start MUST surface an advisory warning when the working branch is behind its base (naming by how much when determinable), so a stale-branch session does not silently re-implement shipped work. The warning MUST be advisory and MUST NOT block the session from starting.
- **FR-017**: session-start MUST skip the staleness check cleanly (no error, session proceeds) when the base cannot be determined (no upstream/remote, detached HEAD).

#### Surface-agnostic distribution (CLI-first)

- **FR-018**: session-start and session-end MUST be fully invocable through the `stackctl` CLI by any agent or a human, with no Claude-Code-specific surface (skill, slash command, hook) required to reach the capability.
- **FR-019**: The `/stack-control:…` session-start / session-end skills MUST be thin adapters that delegate to the CLI verbs and add no behavior the CLI lacks.
- **FR-020**: The orientation/closing contract MUST be surface-agnostic: it derives the invocation context from a generic working directory/root (a CLI cwd today, a client-supplied root in future) and MUST NOT bake in an assumption that a specific host surface is present.

#### Two-session boundary

- **FR-021**: The session skills MUST respect the orchestrator/implementation two-session boundary: session-start orients and stops regardless of which session type the operator intends; it MUST NOT itself invoke an authoring (`/speckit-*`) or implementation step.

### Key Entities *(include if data involved)*

- **Orientation report**: the concise boot-time state summary session-start produces — roadmap ready/next + blocked, active spec + authoring-chain position + next step, latest journal entry, open issues, and the branch-staleness advisory. Read-only; not persisted.
- **Journal / development-log entry**: the durable per-session record session-end appends to the configured journal working file (goal / accomplished / didn't-work / course-corrections / quantitative / insights, in the project's configured shape). The continuity thread the next session-start reads.
- **Tooling-friction log**: the append-only record of friction with the tooling/governance/CLI that session-end captures, one friction per entry; the cumulative ship-gate signal for the program's own dogfood.
- **Clone-snapshot (advisory)**: the duplication report session-end runs over the installation's configured source scope to catch this-session duplication; advisory, non-blocking.
- **Installation config + resolution contract**: the shared, surface-agnostic configuration that records where each working file lives and the nearest-enclosing-installation resolution model. **This feature consumes it** (read + write paths resolved through it); `multi:feature/project-doc-setup` writes it and `design:gap/project-relative-doc-discovery` resolves it at read time. A dependency edge, not built here.
- **Branch-staleness signal**: the advisory comparison of the working branch against its base used at boot.
- **Authoring-chain position**: the inferred "where the active spec sits" derived from which authoring artifacts are present, and the implied next step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a cold start in a configured installation, a single session-start invocation leaves the agent oriented (it can name the next roadmap work, the active spec's chain position and next step, the last journal entry, and open issues), and **zero implementation actions are taken before the operator confirms a goal**.
- **SC-002**: Every session that runs session-end ends with a journal entry committed AND pushed — 0 sessions end with the record uncommitted or unpushed (including sparse "little changed" sessions).
- **SC-003**: In a project whose working-file locations differ from any default, 100% of the skills' reads and writes resolve through the installation config — 0 hardcoded-path accesses, and 0 fallbacks to a plugin-bundled copy.
- **SC-004**: When invoked outside any installation, both skills fail loudly naming the missing installation in 100% of cases (0 silent bundled-copy fallbacks).
- **SC-005**: When the working branch is behind its base, session-start surfaces the advisory in 100% of determinable cases; when the branch is current, 0 false staleness warnings; in 0 cases does the advisory block the session from starting.
- **SC-006**: session-end performs 0 automated issue closures — every progressed issue is surfaced as evidence for the operator to close.
- **SC-007**: Both session-start and session-end run to completion in a plain shell with no Claude Code session present (CLI-first), producing the same report/record as the skill path.
- **SC-008**: Re-running session-start produces 0 on-disk changes (read-only).
- **SC-009**: In a monorepo with two installations, a session skill run within one installation's scope resolves the nearest enclosing installation and touches 0 of the sibling installation's working files.

## Assumptions

- **Spec to the contract, not to 009's implementation** (operator decision 2026-06-10): this feature is specified against the surface-agnostic installation config + resolution contract that `multi:feature/project-doc-setup` writes and `design:gap/project-relative-doc-discovery` resolves. The dependency is recorded as an edge; DEFINE proceeds independently of 009's branch. The exact config schema, file name, and resolution mechanism are owned by that contract, not invented here.
- **Branch-staleness is advisory, not blocking** (operator decision per [#422](https://github.com/audiocontrol-org/deskwork/issues/422)): a pre-merge early warning, never a gate.
- **CLI-first / surface-agnostic** (constitution Principle VIII + 009 FR-025/026): the `stackctl` CLI is the vendor-neutral core; the Claude Code plugin skills, Agent-Skills, and a future MCP server are adapters over it.
- **Native, not ported** (operator decision 2026-06-09, succession rule): the pair generalizes the two concrete instances (the branch-local `.claude/skills/session-{start,end}` and `plugins/dw-lifecycle/skills/session-{start,end}`) into `plugins/stack-control/skills/session-{start,end}` with `stackctl` verbs underneath. Neither concrete instance is forked or imported wholesale.
- **The journal is the continuity contract**: the next session-start reads what the prior session-end wrote; the two halves agree on the journal working file's location (via config) and its project-configured shape.
- **Invocation, not auto-wiring**: the skills/verbs are invocable on demand; per `.claude/rules/enforcement-lives-in-skills.md` the plugin does NOT ship git-hook / SessionStart auto-wiring — wiring the verbs into an automatic trigger is an adopter's own choice.
- **Capture, not cut** — recorded as out of scope for this feature so they are not silently absorbed: (1) **the dw-lifecycle deskwork-specific closing ceremony** (README status-table + `workplan.md` check-offs) — stack-control tracks work via Spec Kit artifacts + the governed roadmap, not the dw-lifecycle workplan spine; (2) **the dw-lifecycle "refuse-to-end" closing gates** (`check-disposition-survivor` / `check-open-findings` / bare-TBD refusal) — those depend on scope-discovery + audit-barrage being migrated in (`design:feature/migrate-scope-discovery`, `multi:feature/migrate-audit-barrage`) and are owned by that migration, not this feature; session-end here is capture-only, matching the operator's scoping of the close ceremony; (3) **building the installation resolver itself** (009's job); (4) **retiring dw-lifecycle** (`multi:feature/retire-dw-lifecycle`).

## Open Questions

Genuine operator-owned forks captured rather than silently defaulted (constitution Principle II). Each carries a recommended default for `/speckit-clarify` to confirm or override.

- **OQ-1 — Branch-staleness base resolution**: what defines "the base" the branch is compared against — the repository's default branch (e.g. `origin/main`), the branch's configured upstream, or a configured target? *Recommended default*: the branch's upstream if set, else the repository default branch; skip cleanly when neither resolves (FR-017).
- **OQ-2 — session-end closing-gate posture**: session-end is specified capture-only for this feature (the refuse-to-end gates are deferred to the scope-discovery/audit-barrage migrations — see Assumptions). Confirm that capture-only is the intended v1 posture, versus folding a minimal advisory open-findings surface into session-end now. *Recommended default*: capture-only now; the enforcing gates arrive with their owning migrations.
- **OQ-3 — Active-installation selection when a session spans work**: when the cwd resolves one installation but the operator's intended work is in another (monorepo), does session-start orient strictly by cwd-resolved installation, or accept an explicit installation target? *Recommended default*: cwd-resolved nearest installation, with an explicit override argument available (surface-agnostic context per FR-020).
- **OQ-4 — Journal entry authorship boundary**: how much of the journal entry does the skill compose automatically (quantitative counts from `git log`, issues touched) versus leave for the operator/agent to fill (goal, insights, course corrections)? *Recommended default*: auto-derive the mechanical/quantitative sections from source; leave the narrative sections for the agent to compose, operator-editable before commit (mirrors the dw-lifecycle hygiene-block pattern).

## Dependencies

- **`multi:feature/front-door`** (COMPLETE) — the plugin shell, `stackctl` CLI, and `/stack-control:…` skill surface these skills are built on already exist.
- **`multi:feature/project-doc-setup` (009) + `design:gap/project-relative-doc-discovery`** — define and write/resolve the installation config + resolution contract this feature consumes for every working-file read/write. Specified-to-the-contract dependency edge (not coupled to 009's implementation branch).
- **`design:feature/roadmap-protocol` (006)** — defines the governed roadmap format session-start reads (ready/next/blocked).
- **`design:feature/insight-capture` (007)** — defines the governed inbox format (when session-start surfaces captured-but-untriaged inbox items).
- **`design:feature/migrate-scope-discovery`** — owns the clone-snapshot capability session-end consumes (today the interim `.dw-lifecycle/scope-discovery/clone-snapshot.sh`; the vendored, per-codebase-scoped detector arrives with that migration) and the refuse-to-end structural gates deferred out of this feature.
- **`multi:feature/migrate-audit-barrage`** — owns the audit-log/governance working-file shape and the open-findings gate deferred out of this feature's session-end.
