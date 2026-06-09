# Feature Specification: Post-Install Project Setup (project-doc-setup)

**Feature Branch**: `feature/stack-control` (spec dir `009-project-doc-setup`)

**Created**: 2026-06-09

**Status**: Draft

**Roadmap codename**: `multi:feature/project-doc-setup`

**Input**: User description: "project-doc-setup — Post-install project setup for stack-control. Scaffold the governed documents + config that the stackctl verbs require (ROADMAP.md, DESIGN-INBOX.md, the backlog store, stack-control config) into a freshly-installed adopter project, so stackctl inbox/roadmap/backlog work without hand-authoring the docs. The create-side complement to design:gap/project-relative-doc-discovery (which resolves an adopter's own docs at read time)."

## Context & Problem

When someone installs the `stack-control` plugin into their own project (the publicly-advertised `claude plugin install` path), the `stackctl` governed-document verbs — `inbox`, `roadmap`, `backlog` — all assume a set of project-local artifacts already exist:

- a **governed roadmap** the `roadmap` verb reads and reasons over,
- a **design inbox** the `inbox` verb captures into and triages from,
- a **backlog store** the `backlog` verb shells out to,
- a **stack-control project config** that tells every verb where those artifacts live.

In this monorepo those artifacts exist because they were hand-authored for the in-repo dogfood. A fresh adopter has none of them. Today their only path is to hand-author each document in exactly the shape each verb's parser expects — an undocumented, error-prone barrier that the adopter discovers only by hitting a failure when they run their first verb.

This feature is the **create-side**: a one-step setup that scaffolds the four artifacts (and only those) into an adopter's project so the governed verbs work out of the box. Its read-side complement, `design:gap/project-relative-doc-discovery`, resolves an adopter's own documents at read time; the two share one config contract — this feature *writes* what that feature *resolves*.

This is **not** a website concern and carries no renderer assumptions; it operates on a project's governed-document tree the same way for any adopter.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fresh adopter is set up in one step (Priority: P1)

An operator has just installed the `stack-control` plugin into a project that has never used `stackctl`. They run the setup once. Afterward, the four required artifacts exist in their project in valid form, and `stackctl inbox`, `stackctl roadmap`, and `stackctl backlog` all work against the operator's own project documents without any further hand-authoring and without passing an explicit document path.

**Why this priority**: This is the feature's reason to exist — it removes the hand-authoring barrier that otherwise blocks every governed verb for a new adopter. Without it, the plugin's capture/roadmap/backlog surfaces are unreachable on a real install.

**Independent Test**: In a throwaway project with the plugin installed and none of the four artifacts present, run setup, then run a capture and a list against each of `inbox`, `roadmap`, and `backlog` with no document-path argument; all succeed and operate on the newly-scaffolded project-local artifacts.

**Acceptance Scenarios**:

1. **Given** a project with no stack-control artifacts, **When** the operator runs setup, **Then** a governed roadmap, a design inbox, a backlog store, and a stack-control project config all exist and are well-formed.
2. **Given** setup has completed, **When** the operator runs a governed verb (e.g. `inbox capture`) with no explicit document path, **Then** the verb resolves and operates on the project-local artifact created by setup.
3. **Given** setup has completed, **When** the operator inspects the result, **Then** they receive a clear report listing each artifact that was created and where it lives.
4. **Given** a project with no stack-control artifacts and no prior explicit setup, **When** the operator runs a governed verb directly (e.g. `inbox capture`), **Then** the verb announces the artifacts it scaffolds, creates them empty-but-valid, and then completes the operator's original request (auto-on-first-use), producing the same project state an explicit setup would.

---

### User Story 2 - Re-running setup never destroys existing content (Priority: P1)

An operator runs setup in a project that is already partly (or fully) set up — some artifacts present, some missing, or an artifact that already contains real captured work. Setup scaffolds only what is missing, leaves every existing artifact and its contents byte-for-byte untouched, and reports clearly what it created versus what it left in place. The operator is never at risk of losing captured inbox notes, roadmap items, or backlog tasks by re-running setup.

**Why this priority**: A content store's purpose is to preserve history; a setup step that could overwrite or truncate an existing governed document would be a data-loss footgun, exactly the failure the project's "preserve, don't delete" discipline forbids. Idempotent, non-destructive re-run is what makes setup safe to run habitually (e.g. after an upgrade) and is therefore co-equal P1 with the fresh-setup path.

**Independent Test**: Seed a project with a non-empty roadmap and inbox plus a missing backlog store and missing config; run setup; assert the pre-existing roadmap and inbox files are unchanged (same content hash), the missing backlog store and config are created, and the report distinguishes created from already-present.

**Acceptance Scenarios**:

1. **Given** an artifact already exists with operator content, **When** setup runs, **Then** that artifact is not modified, not truncated, and not deleted.
2. **Given** a partially-set-up project (some artifacts present, some absent), **When** setup runs, **Then** only the absent artifacts are created and the report names which were created and which were already present.
3. **Given** a fully-set-up project, **When** setup runs again, **Then** nothing changes on disk and the report states everything was already present.

---

### User Story 3 - Setup proves the project is actually usable (Priority: P2)

After scaffolding (or finding) the artifacts, setup verifies that each one is well-formed for the verb that consumes it — that the roadmap parses as a governed roadmap, the inbox parses as a governed inbox, the backlog store is a valid store, and the config points at real, resolvable locations. If any artifact is present but malformed, setup fails loudly and names exactly which artifact is wrong and why, rather than reporting success over a project that will fail at the first verb invocation.

**Why this priority**: "The artifacts exist" is weaker than "the verbs work." Per the constitution's fail-loud principle, setup must surface a broken or drifted document immediately instead of leaving the adopter to discover it as a confusing downstream parse error. P2 because it hardens US1/US2 rather than delivering the core capability alone.

**Independent Test**: Place a structurally-invalid roadmap in a project, run setup, and assert it fails with a message naming the roadmap as malformed; then repeat with all artifacts valid and assert setup reports a clean, verb-ready project.

**Acceptance Scenarios**:

1. **Given** all artifacts are present and valid, **When** setup runs its verification, **Then** it reports the project is ready for the governed verbs.
2. **Given** an artifact is present but malformed, **When** setup runs, **Then** it fails loudly, names the offending artifact, and does not report success.
3. **Given** the config references a location that does not resolve, **When** setup runs verification, **Then** it reports the mismatch rather than silently passing.

---

### Edge Cases

- **Pre-existing artifact with operator content** — never overwritten or truncated (US2). The artifact is reported as already-present.
- **Pre-existing artifact that is malformed / not the governed shape** — setup does not silently replace it; it surfaces the drift and asks for an operator decision rather than clobbering possibly-real content.
- **Partial prior setup** — config present but backlog store missing (or any subset). Setup completes the missing pieces only.
- **Backlog store initialization constraints** — the underlying backlog tooling's native initializer is interactive and requires a git repository (discovered in `008-backlog-surface`). Setup must initialize the store in a deterministic, non-interactive, git-independent way that produces an equivalent valid store.
- **Adopter's documents already live at non-default project-relative locations** — setup records the existing locations in config rather than scaffolding a second, duplicate set.
- **Run from an ambiguous or non-project directory** — setup must determine the project root deterministically (or fail loudly naming the ambiguity) rather than scattering artifacts into the wrong directory.
- **Plugin upgrade changes the expected artifact skeleton** — a re-run against artifacts authored by an older plugin version detects drift between what exists and what the current verbs expect, and reports it rather than silently over-writing the adopter's content.
- **Config already present but pointing at a now-missing artifact** — surfaced by verification (US3), not silently re-created in a way that abandons the configured location.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Setup MUST scaffold, into an adopter's project, the complete set of artifacts the governed verbs require to operate without hand-authoring: a governed roadmap document, a design inbox document, a backlog store, and a stack-control project config.
- **FR-002**: Each scaffolded document MUST be created in a form that the consuming verb's own parser accepts as valid and empty-but-usable (a roadmap with no items, an inbox with no captures, a backlog store with no tasks) — i.e. structurally valid, not merely a blank file.
- **FR-003**: After setup, each governed verb (`inbox`, `roadmap`, `backlog`) MUST resolve and operate on the adopter's project-local artifact **by default**, without the operator supplying an explicit document/store path.
- **FR-004**: Setup MUST be non-destructive: it MUST NOT modify, truncate, or delete any artifact that already exists, and MUST preserve existing artifact contents exactly.
- **FR-005**: Setup MUST be idempotent: running it on a fully- or partially-set-up project creates only the missing artifacts and changes nothing else.
- **FR-006**: Setup MUST report, per artifact, whether it was created, already present, or skipped — naming the resolved location of each.
- **FR-007**: Setup MUST write a single stack-control project config that records where each governed artifact lives, such that the config is the one source the read-side document-discovery resolves against (shared config contract with `design:gap/project-relative-doc-discovery`).
- **FR-008**: Setup MUST initialize the backlog store in a deterministic, non-interactive, git-independent manner that yields a store the `backlog` verb accepts (the native interactive initializer is not relied upon).
- **FR-009**: Setup MUST verify that every required artifact (created or pre-existing) is well-formed for its consuming verb, and MUST fail loudly — naming the offending artifact and the reason — when an artifact is present but malformed (no silent success over a broken project).
- **FR-010**: When an existing artifact is present but does not match the governed shape the current verbs expect, setup MUST surface the drift for an operator decision rather than overwriting possibly-real content.
- **FR-011**: Setup MUST determine the adopter's project root deterministically, and MUST fail loudly if the target location is ambiguous, rather than writing artifacts to an unintended directory.
- **FR-012**: When an adopter's artifacts already exist at non-default project-relative locations, setup MUST record those locations in config rather than creating duplicate artifacts elsewhere.
- **FR-013**: Setup MUST be reachable through the plugin's publicly-advertised surface (a `stackctl` verb and/or a `/stack-control:…` skill) so that an adopter who follows the install docs can run it without privileged or in-repo-only steps.
- **FR-014**: Setup MUST NOT require network access, secrets, or interactive prompts to produce a valid project (it scaffolds local governed documents only).
- **FR-015**: Setup MUST be reachable **both** as an explicit operator-invoked step (run once after install) **and** automatically the first time a governed verb (`inbox`, `roadmap`, `backlog`) finds its required artifacts missing — in which case the verb scaffolds the missing artifacts and then proceeds with the operator's original request (operator decision 2026-06-09).
- **FR-016**: When setup runs automatically on a verb's first use, it MUST **announce** exactly which artifacts it created (and where) as part of that verb's output — the scaffold is never a silent side effect — and it MUST create only empty-but-valid artifacts, never fabricated or example content. (This preserves the spirit of the fail-loud principle: state changes are visible and contentless, even though the missing-artifact state no longer aborts the verb.)
- **FR-017**: Explicit setup and auto-on-first-use setup MUST produce identical artifacts (same scaffolding logic), so a project bootstrapped lazily by a verb is indistinguishable from one bootstrapped by the explicit step.

### Key Entities *(include if feature involves data)*

- **Governed Roadmap document**: the heading-keyed governed work-item DAG the `roadmap` verb reads and reasons over (`next` / `blocked` / `order` / `graph` / `reconcile`). Scaffolded empty-but-valid.
- **Design Inbox document**: the governed out-of-sequence idea store the `inbox` verb captures into and triages (`capture` / `promote` / `drop` / `list`). Scaffolded empty-but-valid, including whatever structural registry its parser requires.
- **Backlog store**: the external-tool-managed task store the `backlog` verb shells out to and reads from (capture / list / import). Scaffolded as a valid, empty, non-interactively-initialized store.
- **stack-control project config**: the single configuration artifact recording the resolved locations of the three documents/store above; the authoritative input to read-side document discovery. The create-side (this feature) writes it; the read-side resolves it.
- **Setup report**: the per-artifact created / already-present / skipped / malformed summary returned to the operator, including resolved locations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from a project with the plugin installed and none of the four artifacts present, an operator reaches a state where `inbox`, `roadmap`, and `backlog` all work on their own project documents through a single setup invocation and zero hand-authored files.
- **SC-002**: Re-running setup any number of times on a project with existing captured content results in zero modifications, truncations, or deletions of pre-existing artifacts (measured by content-hash equality before and after).
- **SC-003**: 100% of artifacts produced by setup are accepted as valid by the parser of the verb that consumes them (verified by running each verb against the scaffolded artifact).
- **SC-004**: After setup, every governed verb resolves the adopter's project-local artifact by default — no run in the verb-ready test requires an explicit document/store path.
- **SC-005**: A project containing a malformed required artifact never returns a "setup succeeded / project ready" result; setup instead names the offending artifact (0% false-clean reports).
- **SC-006**: Setup produces a valid project with no network access, no secrets, and no interactive input.

## Assumptions

- **Trigger model (operator decision 2026-06-09 — resolved, FR-015/016/017)**: setup is reachable **both** as an explicit operator-invoked step **and** automatically on a governed verb's first use when artifacts are missing. The fail-loud principle is honored in spirit rather than by aborting: auto-scaffold is always **announced** in the verb's output and only ever creates empty, contentless artifacts — there is no hidden state change and no fabricated data. (The alternative considered and not chosen: explicit-only with missing-artifact reads aborting; rejected in favor of the lower-friction adopter experience.)
- **Shared config contract**: this feature and the read-side `design:gap/project-relative-doc-discovery` agree on one config schema and resolution model; the abstraction is derived from these two concrete uses (constitution Principle II), not designed speculatively. Exact config schema, file name, and on-disk locations are a plan/contracts concern, not fixed by this spec.
- **Scope is exactly the four named artifacts.** The deskwork Ideas-stage hand-off, any web/TUI setup surface, multi-project/workspace setup, and migration of an existing dw-lifecycle project's documents are explicitly **out of scope** for this feature and tracked separately (capture, not cut — these are recorded here so they are not silently absorbed).
- **Empty-but-valid seeding**: scaffolded documents carry no example/business content beyond the minimal structure their parsers require; they start empty so the adopter's first real capture is their own.
- **Backlog store mechanism**: the deterministic non-interactive initialization equivalent established in `008-backlog-surface` (a hand-authored filesystem-only store config in place of the interactive initializer) is the intended approach; the precise mechanism is a plan/contracts concern.
- **Project-relative locations**: default scaffold locations are resolved relative to the adopter's project, not the plugin's bundled in-repo copies (the bundled `DESIGN-INBOX.md` / `ROADMAP.md` are the dogfood's own artifacts, correct only for in-repo use).

## Dependencies

- **`multi:feature/front-door`** — the plugin shell, `stackctl` CLI, and `/stack-control:…` skill surface this feature is reached through already exist.
- **`design:gap/project-relative-doc-discovery`** (read-side complement) — shares the config contract this feature writes; the two are designed together so create-side and read-side agree.
- **`008-backlog-surface`** — defines the backlog store shape and the non-interactive initialization constraint this feature reuses.
- **`007-insight-capture` / `006-roadmap-protocol`** — define the governed inbox and roadmap document formats whose empty-but-valid skeletons this feature must produce.
