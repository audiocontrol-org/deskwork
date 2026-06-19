# Feature Specification: Front-Door Completeness

**Feature Branch**: `028-front-door-completeness` (program convention: one long-lived branch; the active spec dir is resolved via the `CLAUDE.md` SPECKIT markers, not the branch name — TF-09)

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "front-door-completeness — make the entire stack-control front door complete, discoverable, and governed now that 026 capability-mediation teeth forbid reaching around it." Authored from the approved design record `plugins/stack-control/docs/superpowers/specs/2026-06-19-front-door-completeness-design.md` (roadmap node `multi:feature/front-door-completeness`, design-approved 2026-06-19) and the captured plan `docs/front-door-completeness/plan.md`.

> **Scope is COMPLETE by operator mandate (2026-06-19).** *"THE WHOLE FRONTEND MUST WORK OR NONE OF IT IS FUNCTIONAL."* The four user stories below are all in scope; their P1–P4 priorities denote **build sequence and adopter-pain severity, NOT optionality**. None may be deferred, tiered out, or YAGNI'd. This is a capture artifact (Constitution Principle II): it records everything known or knowably-implied; scoping already happened and the answer was "all of it."

## Why this feature exists

Spec 026 (capability-interface-mediation, shipped) put teeth in the front door: a plugin-shipped PreToolUse hook plus the per-phase graduate gate mean a coding agent can no longer reach *around* the `/stack-control:*` skills to the raw backend. That is correct and load-bearing — but it converts every front-door **gap** from friction into a hard wall. An adopter agent can now do only what the front door **sanctions**, and only what it can **discover**.

Ground truth (2026-06-19 audit): **34 skills, 46 `stackctl` verbs, but only 2 verbs (`govern`, `roadmap`) are self-documenting; 37 emit no `--help` at all.** Three classes of wall, plus the absence of any guard against re-opening them:

1. **Missing operations** — a captured backlog item cannot be closed/archived or un-promoted; roadmap edges cannot be mutated (reparent/add/remove/rename/remove-node); orphan spec dirs cannot be reconciled; the design-approval marker has no writing verb — all now require a *forbidden* hand-edit of a governed document.
2. **Undiscoverable surface** — 37/46 verbs have no `--help`; flags are discoverable only by reading source; several SKILL.md docs lag the real verb surface; some discovery output is actively wrong.
3. **Teeth that over-refuse with no escape** — a no-installation context refuses the adopter's *own* backend with an unsatisfiable redirect; a corrupt marker file permanently wedges a session with no recovery verb.
4. **No regression guard** — nothing mechanically prevents the *next* backend verb from re-opening the gap.

**Root cause:** the front door grew as N parallel, independently-maintained surfaces — SKILL.md vs. the verb's real flags vs. the source vs. the mediation registry — and the drift between them *is* the walls. The fix is a single source of truth plus a mechanical guard.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover any operation without reading source (Priority: P1)

An adopter agent (or operator) needs to perform a stack-control operation it has not memorized. It runs `stackctl <verb> --help` — and, for a multi-action verb, `stackctl <verb> <sub-action> --help` — and gets complete usage: a description, the sub-actions, and every flag with its argument and meaning, exiting 0. The skill surface in the `/` picker matches the verb surface, and every SKILL.md accurately documents what its verb actually accepts. Discovery output never lies (no nominating a finished spec as active, no quoting a path that 404s in a host install).

**Why this priority**: Discoverability is the foundation the rest derives from — the single command-tree descriptor that powers `--help` is the same source the fronted-operations registry and the `check-front-door` guardrail read. Build it first and the registry/guard come for free; skip it and an adopter cannot even find the operations the other stories add.

**Independent Test**: Run `--help` against all 46 verbs and every sub-action; assert exit 0 and a non-empty usage body listing flags. Cross-check each skill's documented verbs against the command tree. Fully testable without any of US2–US4.

**Acceptance Scenarios**:

1. **Given** any of the 46 verbs, **When** `stackctl <verb> --help` runs, **Then** it prints usage (description + sub-actions + flags with descriptions) and exits 0.
2. **Given** a multi-action verb (e.g. `backlog`, `inbox`, `workflow`), **When** `stackctl <verb> <sub> --help` runs, **Then** it prints that sub-action's flags and exits 0.
3. **Given** a fresh host install (not the source repo), **When** `session-start` reports the active spec and quotes any path, **Then** every quoted path resolves in that install and no fully-implemented spec is nominated with a next `/speckit-*` step.
4. **Given** any `/stack-control:*` skill, **When** its SKILL.md is compared to the command tree, **Then** every verb/sub-action/flag it documents exists and every sub-action the verb exposes is documented.

---

### User Story 2 — Complete an item's full lifecycle through the front door (Priority: P2)

An adopter takes work all the way through without ever hand-editing a governed file: capture a backlog item, list it, promote it, **un-promote** it if that was a mistake, and **close or archive** it when done. On the roadmap, they add/remove/reparent (`move-edge`)/rename a node and remove a node, reconcile an orphan spec dir into a node, and record a design approval — all through sanctioned verbs that dry-run then `--apply` and revalidate the graph.

**Why this priority**: These are the operations 026 made unreachable. Today an adopter can *capture* into the backlog but can never *close* anything through the interface, and can only reshape the roadmap by a forbidden hand-edit. This is the most acute "you can put things in but not take them out" wall.

**Independent Test**: Drive a backlog item capture → list → promote → unpromote → done → archive entirely through verbs; reparent a roadmap node via `move-edge` and confirm `roadmap order` stays clean; write a design-approval marker via a verb (no file edit). Testable without US1's full help rollout (though it benefits from it).

**Acceptance Scenarios**:

1. **Given** a captured backlog item, **When** `backlog done <id> --reason <r>` runs, **Then** the item records a terminal disposition through the interface (no hand-edit), and `backlog archive <id>` moves it out of the live store while preserving it (never deletes).
2. **Given** a mistakenly promoted backlog item, **When** `backlog unpromote <id>` runs, **Then** the promotion linkage is removed through the interface.
3. **Given** a roadmap node under the wrong parent, **When** `roadmap move-edge` (reparent) runs with `--apply`, **Then** the edge moves and `roadmap order` revalidates clean (no cycle/dangling ref).
4. **Given** an orphan spec dir, **When** `roadmap reconcile --unorphan <spec>` runs, **Then** the orphan is resolved into a node without hand-editing ROADMAP.md.
5. **Given** an approved design, **When** the operator runs the sanctioned approve-design verb, **Then** the `design-approved` (and, symmetrically, `analyze-clean`) marker is written without a hand-edit.
6. **Given** a captured item with a long title, **When** `backlog capture` runs, **Then** the on-disk filename is slugified/truncated within OS limits (no `ENAMETOOLONG`), and a duplicate `--ref` is deduped rather than silently re-created.
7. **Given** a terminal roadmap node that is still a `depends-on`/`part-of` target, **When** `curate`/archive runs, **Then** it does not dangle the edge (edge-aware archival).

---

### User Story 3 — Never get wedged or wrongly refused by the teeth (Priority: P3)

An adopter working in a repo that is *not* a stack-control installation runs their own backend tool (their own `/speckit-*`, their own scripts) and is **never refused** — the front door only governs operations inside an installation. And when something does go wrong inside an installation — a corrupt or stale mediation marker — the adopter recovers through a sanctioned verb in a single command, never by hand-deleting YAML.

**Why this priority**: These are the only failures that can *hard-stop* a session with no escape, or that refuse legitimate work the front door was never meant to govern. They erode trust in the teeth themselves.

**Independent Test**: In a no-installation directory, invoke a backend call and assert no refusal. Corrupt the marker file in an installation and assert a sanctioned recovery verb clears it and unblocks the session. Testable independently of US1/US2/US4.

**Acceptance Scenarios**:

1. **Given** a directory with no enclosing stack-control installation, **When** an adopter invokes their own backend tool, **Then** the interceptor does not refuse it (mediation only fires inside an installation).
2. **Given** a refusal does occur, **Then** an installation necessarily encloses the cwd, so the redirect to `stackctl setup` is always satisfiable (never a dead end).
3. **Given** a corrupt or stale mediation marker, **When** the adopter runs the sanctioned recovery verb (`front-door reset` / `mediate-recover --session <id>`), **Then** the markers are listed and cleared and the session is unblocked — no hand-edit of marker YAML.
4. **Given** a sanctioned drive right after a successful `enter`, **When** the cwd/session-id linchpins are evaluated, **Then** the drive is not silently refused (marker contents bound to the requested session; cwd drift reconciled).
5. **Given** the interceptor cannot reach `stackctl` (crash), **When** it fails open, **Then** the skip is signalled, not silent.

---

### User Story 4 — The front door cannot silently regress (Priority: P4)

A contributor adds a new backend verb, deletes a skill, or breaks a `--help`. `check-front-door` — derived from the command tree, run as an advisory in `session-start` and as a gate in `implement`/`review` — goes RED and names the gap, so the regression cannot ship. And a smoke proves the PreToolUse interceptor is actually registered and fires, so the teeth are never silently inert.

**Why this priority**: Without the guard, every fix in US1–US3 is a snapshot that the next change re-opens — the exact "myopic, forgetful" failure mode that produced this feature. It is last only because it checks the surface the other stories complete; it must ship *with* them, not after.

**Independent Test**: With the surface complete, assert `check-front-door` passes; then delete a skill / break a `--help` / add an unfronted verb and assert it exits non-zero naming the gap. Assert the interceptor-loaded smoke passes.

**Acceptance Scenarios**:

1. **Given** the complete front door, **When** `check-front-door` runs, **Then** it exits 0.
2. **Given** a deleted skill, a broken `--help`, or a new unfronted/unmediated verb, **When** `check-front-door` runs, **Then** it exits non-zero and names the specific gap (proven by a RED test for each case).
3. **Given** the fronted-operations registry, **When** it is built, **Then** it is derived by walking the command tree (no hand-authored manifest as the source of truth).
4. **Given** `check-front-door`, **When** it evaluates an operation, **Then** it asserts both surfaces: a sanctioned skill exists AND the verb/sub-actions emit working `--help`, mutation-bearing ops are mediation-registered, and skill↔verb parity holds in both directions.
5. **Given** the installed plugin, **When** the interceptor-registration smoke runs, **Then** it proves `hooks/hooks.json` is auto-discovered and the interceptor fires.

### Edge Cases

- A read-only query verb (`roadmap next`, `backlog list`, `session-start`) — is it mediation-exempt, or must it also be marker-bracketed? (See FR-050 / Clarification.)
- An operation that is an in-session `/speckit-*` step driven by `execute`/`define` and is NOT a `stackctl` verb — how does the registry enumerate it for `check-front-door`? (See FR-051 / Clarification.)
- A verb that legitimately accepts only a subset of a shared status vocabulary — `--help` must show the subset, not the full grammar.
- A nested/parallel backend drive — each gets its own token; one `exit` never clears another's (existing 026 invariant; must be preserved).
- A deprecated verb (e.g. `speckit-guard`, `check-editor-symmetry`) — `check-front-door` must treat it as a documented alias, not a gap.

## Requirements *(mandatory)*

### Functional Requirements

**Discoverability parity (US1)**

- **FR-001**: Every `stackctl` verb MUST emit, on `--help`, a usage body with a description, its sub-actions (if any), and every flag (name, argument, description), exiting 0.
- **FR-002**: Every sub-action of a multi-action verb MUST emit, on `<verb> <sub> --help`, that sub-action's flags and exit 0.
- **FR-003**: All 46 verbs MUST be defined through a single shared self-documenting command surface (one definition per verb/sub-action); `--help`, usage, the verb reference, and the fronted-operations registry MUST all derive from that single source — no second hand-maintained description of the surface.
- **FR-004**: The system MUST provide an auto-generated verb reference derived from the command tree (never a hand-maintained list that can drift).
- **FR-005**: Every `/stack-control:*` skill's SKILL.md MUST accurately document its verb surface; the known lags MUST be fixed (roadmap `cluster`/`group`; backlog empty-session guard + token handling; execute/extend editing residue).
- **FR-006**: Discovery output MUST be correct: `session-start` MUST NOT nominate a fully-implemented spec as "active" with a bogus next `/speckit-*` step, and MUST NOT quote a source-repo-only path that 404s in a host install.
- **FR-007**: Adopter documentation MUST cover the Codex install path; tooling-feedback guidance MUST route to GitHub issues (not an invisible local file); SKILL.md capability ids MUST be fully test-covered so a mismatch cannot silently kill skill invocation.

**Complete the operation set (US2)**

- **FR-010**: `backlog` MUST expose a sanctioned terminal-closure sub-action (`done`/`close <id> --reason`) that records terminal disposition through the interface.
- **FR-011**: `backlog` MUST expose `archive <id>` that moves a terminal item out of the live store while preserving it (databases preserve; never delete).
- **FR-012**: `backlog` MUST expose `unpromote <id>`, the inverse of `promote`, removing the promotion linkage through the interface.
- **FR-013**: `backlog capture` MUST derive on-disk filenames within OS limits (slugify + truncate; no `ENAMETOOLONG`) and MUST dedupe by `--ref` rather than silently creating a duplicate.
- **FR-014**: `roadmap` MUST expose edge-mutation sub-actions — `add-edge`, `remove-edge`, `move-edge` (reparent), `rename`, `remove-node` — each dry-run-by-default with `--apply`, revalidating the graph (fail loud on cycle/dangling ref/duplicate id).
- **FR-015**: `roadmap reconcile` MUST provide an `--unorphan` assist that resolves an orphan spec dir into a node without hand-editing ROADMAP.md.
- **FR-016**: A sanctioned verb MUST write the `design-approved` and `analyze-clean` roadmap markers (today only read; recording requires a forbidden hand-edit).
- **FR-017**: `curate`/archive MUST be edge-aware: it MUST NOT archive a terminal item that is still a `depends-on`/`part-of` target in a way that dangles the edge.
- **FR-018**: `roadmap close-related` MUST be re-pointed to call the new direct backlog-closure verb so there is exactly one closure mechanism, not two divergent paths.
- **FR-019**: (scope boundary) The one-move backlog→roadmap promotion and the post-release resolution cycle are owned by `multi:feature/lifecycle-industrialization`; this feature only asserts their **raw** operations (`backlog promote`, `roadmap add`) are fronted, discoverable, and `--help`'d — it does not build the mechanized convenience.

**Teeth recovery & legitimate-op handling (US3)**

- **FR-020**: Mediation MUST fire only inside a stack-control installation. With no enclosing installation, the interceptor MUST NOT refuse an adopter's own backend call. A refusal therefore MUST imply an installation exists, making the `setup` redirect always satisfiable.
- **FR-021**: A sanctioned recovery verb (`front-door reset` / `mediate-recover --session <id>`) MUST list and clear mediation markers so a corrupt/stale/wedged marker is recoverable in one command without hand-editing marker YAML. A session MUST NEVER be unrecoverable through the interface.
- **FR-022**: Mediation marker state MUST be discoverable through a sanctioned verb (list markers for a session).
- **FR-023**: Marker validation MUST bind the marker contents to the requested session, and the cwd/session-id linchpins MUST be reconciled so a sanctioned drive immediately after a successful `enter` is not silently refused.
- **FR-024**: The deprecated `speckit-guard` MUST read the 026 file marker (not the legacy env var) so its decision matches the interceptor; its widened refusal set MUST be audited and justified or narrowed.
- **FR-025**: When the interceptor fails open (e.g. `stackctl` crash), the skip MUST be signalled, not silent; the staleness bound MUST NOT prune an actively-bracketed drive; the per-invocation cold-start cost MUST be addressed.
- **FR-026**: Marker examples in shipped SKILL.md blocks MUST actually authorize the wrapped backend call they illustrate.

**The governed guardrail (US4)**

- **FR-030**: The fronted-operations registry MUST be derived from the command tree (walked, not hand-authored as the source of truth).
- **FR-031**: `stackctl check-front-door` MUST assert, for every registered operation: (a) a sanctioned `/stack-control:*` skill exists; (b) the verb and each sub-action emit working `--help` (exit 0); (c) mutation-bearing operations are mediation-registered; (d) skill↔verb parity holds in both directions. It MUST exit non-zero on any gap and name it.
- **FR-032**: A doctor rule and a `/stack-control:check-front-door` skill MUST wrap the verb.
- **FR-033**: A RED test MUST prove `check-front-door` fails on each of: a deleted skill, a broken `--help`, and a new unfronted/unmediated verb.
- **FR-034**: `check-front-door` MUST be wired into `session-start` (advisory snapshot) and `implement`/`review` (gate), per `enforcement-lives-in-skills` — NEVER a git hook.
- **FR-035**: A smoke MUST prove the PreToolUse interceptor is registered/auto-discovered (`hooks/hooks.json` wired into the plugin manifest) and fires — so the teeth are never silently inert.

**Cross-cutting decisions**

- **FR-040**: New operations MUST be sub-actions of existing skills (not new skills), except the guardrail skill (`/stack-control:check-front-door`) and, if needed, the recovery verb under the existing `front-door`/`mediate-*` family.
- **FR-041**: Any OpenAPI/JSON-schema descriptor artifact MUST be a generated downstream output of the command tree, never an authored source of truth.

**Open — carried to `/speckit-clarify` (not silently resolved)**

- **FR-050**: Read-only query verbs (`roadmap next/blocked/graph`, `backlog list`, `session-start`) [NEEDS CLARIFICATION: are read-only query verbs mediation-exempt so the interceptor only gates mutation-bearing operations, or must they also be marker-bracketed? Impacts the security boundary and the `check-front-door` "mediation-registered" assertion.]
- **FR-051**: The fronted-operations registry [NEEDS CLARIFICATION: how does it enumerate fronted operations that are in-session `/speckit-*` steps driven by execute/define and are NOT stackctl verbs in the command tree — via skill-declared capability ids, an explicit supplement, or both? Determines completeness of the guardrail.]
- **FR-052**: The generated descriptor artifact [NEEDS CLARIFICATION: is the OpenAPI/JSON-schema-analogue artifact in scope for this feature, or a follow-on? It is downstream of the command tree either way (FR-041), so shipping it now is optional polish vs. deferred output.]

### Key Entities

- **Command-tree descriptor**: the single source of truth — one definition per verb/sub-action (name, flags, types, required-ness, description). `--help`, the verb reference, the registry, and `check-front-door` all derive from it.
- **`stackctl` verb / sub-action**: an executable front-door operation; carries a discoverability state (has working `--help`?) and a mediation class (mutation-bearing → must be registered).
- **`/stack-control:*` skill**: the sanctioned interface an agent invokes; documents a verb surface that must match the command tree.
- **Fronted-operations registry**: the derived ground truth of operations that must be fronted, discoverable, and (where mutating) mediated.
- **Mediation marker**: session-keyed authorization the interceptor reads; must be bound to its session, discoverable, and recoverable.
- **Backlog item**: a captured found-work record with a terminal disposition (one disposition + reason) and a separate archive (preserve-not-delete) state.
- **Roadmap node**: a heading-keyed graph unit with typed edges (`depends-on`/`part-of`/`deferred-until`) and markers (`design-approved`, `analyze-clean`) that must be mutable/writable through verbs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `stackctl` verbs and their sub-actions return a usage body on `--help` and exit 0 (today: 2 of 46 verbs).
- **SC-002**: An adopter can complete every step of the lifecycle through the front door with **zero** hand-edits of a governed file and **zero** source reads to find a flag (verified by an end-to-end lifecycle walkthrough).
- **SC-003**: A backlog item can be driven capture → list → promote → unpromote → done → archive, and a roadmap node reparented and an orphan reconciled, entirely through sanctioned verbs (0 forbidden hand-edits).
- **SC-004**: In a no-installation context, the interceptor produces **0** false refusals of an adopter's own backend.
- **SC-005**: A corrupt/wedged mediation marker is recovered through a single sanctioned verb invocation (no YAML hand-edit).
- **SC-006**: `check-front-door` exits 0 on the complete surface and exits non-zero (naming the gap) when a skill is deleted, a `--help` is broken, or an unfronted verb is added — each proven by a test.
- **SC-007**: The PreToolUse interceptor is provably loaded and firing (smoke passes).

## Assumptions

- **Single-source descriptor = the existing parser's command tree** (commander, already in use), per the governed-markdown-foundation ADR ("adopt a parser library; help derives from one command definition") and the approved design record. No new parser framework is introduced.
- **Backlog terminal vocabulary = one disposition (`done`/`closed`) + `--reason`, with `archive` separate.** A richer `closed` vs `done` distinction is a reasonable-default deferral flagged for `/speckit-clarify`; the default here is the single disposition (mirrors `inbox drop`).
- **Gate firing surfaces honor "no test infrastructure in CI"** (project rule): `check-front-door` runs as a local pre-PR smoke plus an `implement`/`review` skill-body gate and a `session-start` advisory — not a CI job. Flagged for `/speckit-clarify` to confirm exact surfaces.
- **This program runs on one long-lived branch** with numbered spec dirs; the spec dir is resolved via the `CLAUDE.md` SPECKIT markers, not the git branch (TF-09). No per-feature branch is created.
- **`multi:feature/lifecycle-industrialization` owns** the one-move promotion + post-release resolution mechanization (FR-019); this feature depends only on their raw operations existing and being fronted.
- **026 invariants are preserved**, not reopened: session-keyed, nesting-safe markers; lock-serialized writes; the per-phase graduate gate remains the load-bearing guarantee (the interceptor is best-effort defense-in-depth).
- The four user stories ship together as one feature; the family-by-family parser rollout is ratcheted by `check-front-door` so partial progress cannot regress, but the feature is not "done" until SC-001–SC-007 all hold.
