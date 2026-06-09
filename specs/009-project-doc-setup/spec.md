# Feature Specification: Post-Install Project Setup (project-doc-setup)

**Feature Branch**: `feature/stack-control` (spec dir `009-project-doc-setup`)

**Created**: 2026-06-09

**Status**: Draft

**Roadmap codename**: `multi:feature/project-doc-setup`

**Input**: User description: "project-doc-setup — Post-install project setup for stack-control. Scaffold the governed documents + config that the stackctl verbs require (ROADMAP.md, DESIGN-INBOX.md, the backlog store, stack-control config) into a freshly-installed adopter project, so stackctl inbox/roadmap/backlog work without hand-authoring the docs. The create-side complement to design:gap/project-relative-doc-discovery (which resolves an adopter's own docs at read time)." — extended 2026-06-09 (operator): also cover **multiple installations in one repo (monorepos)** and **configurable locations for every working file** stack-control needs (inbox, roadmap, backlog, audit logs, …).

## Context & Problem

When someone installs the `stack-control` plugin into their own project (the publicly-advertised `claude plugin install` path), the `stackctl` governed-document verbs — `inbox`, `roadmap`, `backlog`, and the governance/audit surfaces — all assume a set of project-local **working files** already exists:

- a **governed roadmap** the `roadmap` verb reads and reasons over,
- a **design inbox** the `inbox` verb captures into and triages from,
- a **backlog store** the `backlog` verb shells out to,
- an **audit log + governance working files** the audit-barrage / governance surfaces append to and read,
- a **stack-control project config** that tells every verb where those working files live.

Today, every verb resolves its working file to the **plugin-bundled copy** (the in-repo dogfood's own `DESIGN-INBOX.md` / `ROADMAP.md` / `backlog/` store / `audit-log.md`), overridable only by an explicit per-invocation path argument or an env-var test seam. There is no project config and no notion of "this adopter's own documents." A fresh adopter therefore has two problems: (1) the working files don't exist in their project in the shape each verb's parser expects, and (2) even if they did, nothing tells the verbs to use them instead of the bundled copies.

This feature is the **create-side**: a setup capability that scaffolds an adopter's governed working files and writes the config that points the verbs at them, so the governed verbs work out of the box. Its read-side complement, `design:gap/project-relative-doc-discovery`, resolves an adopter's own documents at read time; the two share one config + resolution contract — this feature *writes* what that feature *resolves*.

Two cross-cutting requirements, raised by the operator and first-class to this feature:

- **Multiple installations per repo (monorepos).** A single repository may host several independent stack-control installations — e.g. several packages/sub-projects in a monorepo, each with its own governed roadmap / inbox / backlog / audit log. (This very monorepo is an example: `plugins/stack-control/` is itself one installation.) Setup, config, and resolution must support N isolated installations in one repo, not assume one repo = one installation.
- **Configurable locations for every working file.** An adopter must be able to place each working file (inbox, roadmap, backlog store, audit log, and any other governed working file) where their project's conventions want it — not only at a single hardcoded default. Setup writes those locations into config; the verbs resolve through it.

This is **not** a website concern and carries no renderer assumptions; it operates on a project's governed-document tree the same way for any adopter.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fresh adopter is set up in one step (Priority: P1)

An operator has just installed the `stack-control` plugin into a project that has never used `stackctl`. They run setup once for that project. Afterward, the project's governed working files exist in valid form, a stack-control config records where each one lives, and `stackctl inbox`, `roadmap`, `backlog`, and the governance surfaces all work against the operator's own project working files without further hand-authoring and without passing an explicit path.

**Why this priority**: This is the feature's reason to exist — it removes the hand-authoring barrier that otherwise blocks every governed verb for a new adopter. Without it, the plugin's capture/roadmap/backlog/governance surfaces are unreachable on a real install.

**Independent Test**: In a throwaway project with the plugin installed and no stack-control working files present, run setup, then run a capture and a list against each governed verb with no path argument; all succeed and operate on the newly-scaffolded project-local working files (not the plugin-bundled copies).

**Acceptance Scenarios**:

1. **Given** a project with no stack-control working files, **When** the operator runs setup, **Then** a governed roadmap, a design inbox, a backlog store, an audit-log working file, and a stack-control config all exist and are well-formed.
2. **Given** setup has completed, **When** the operator runs a governed verb with no explicit path, **Then** the verb resolves and operates on the project-local working file created by setup, not the plugin-bundled copy.
3. **Given** setup has completed, **When** the operator inspects the result, **Then** they receive a clear report listing each working file that was created and its resolved location.
4. **Given** a project with no stack-control working files and no prior explicit setup, **When** the operator runs a governed verb directly (e.g. `inbox capture`), **Then** the verb announces the working files it scaffolds, creates them empty-but-valid, and then completes the operator's original request (auto-on-first-use), producing the same project state an explicit setup would.

---

### User Story 2 - Re-running setup never destroys existing content (Priority: P1)

An operator runs setup in a project (or installation) that is already partly or fully set up — some working files present, some missing, or a working file that already contains real captured work. Setup scaffolds only what is missing, leaves every existing working file and its contents byte-for-byte untouched, and reports clearly what it created versus what it left in place. The operator is never at risk of losing captured inbox notes, roadmap items, backlog tasks, or audit history by re-running setup.

**Why this priority**: A content store's purpose is to preserve history; a setup step that could overwrite or truncate an existing governed working file would be a data-loss footgun, exactly the failure the project's "preserve, don't delete" discipline forbids. Idempotent, non-destructive re-run is what makes setup safe to run habitually (e.g. after an upgrade) and is therefore co-equal P1 with the fresh-setup path.

**Independent Test**: Seed a project with a non-empty roadmap and inbox plus a missing backlog store and missing config; run setup; assert the pre-existing roadmap and inbox files are unchanged (same content hash), the missing working files are created, and the report distinguishes created from already-present.

**Acceptance Scenarios**:

1. **Given** a working file already exists with operator content, **When** setup runs, **Then** that file is not modified, not truncated, and not deleted.
2. **Given** a partially-set-up project, **When** setup runs, **Then** only the absent working files are created and the report names which were created and which were already present.
3. **Given** a fully-set-up project, **When** setup runs again, **Then** nothing changes on disk and the report states everything was already present.

---

### User Story 3 - Each working file's location is configurable (Priority: P1)

An adopter wants their governed working files placed according to their own project conventions — e.g. the roadmap at the repo root, the inbox under a docs directory, the backlog store and audit log under a dedicated tooling directory. They tell setup where each working file should live; setup creates the working files at those locations and records the locations in config, and every verb afterward resolves the configured location by default. When the operator does not specify a location for a working file, a sensible project-relative default is used.

**Why this priority**: The operator named configurable locations as critical for setting up a project that consumes the plugin. Different adopters (and different sub-projects within one repo) have different layout conventions; a single hardcoded default makes the plugin unusable for any project whose conventions differ, and is a prerequisite for the multi-installation model in US4.

**Independent Test**: Run setup specifying non-default locations for at least two working files; assert the files are created exactly at those locations, the config records them, and each consuming verb (run with no path argument) resolves the configured location rather than a default.

**Acceptance Scenarios**:

1. **Given** the operator specifies a custom location for a working file, **When** setup runs, **Then** the working file is created at that location and the config records it.
2. **Given** a working file's location is left unspecified, **When** setup runs, **Then** the working file is created at a documented project-relative default and the config records the resolved location.
3. **Given** setup recorded configured locations, **When** a governed verb runs with no explicit path, **Then** it resolves the configured location for that working file.
4. **Given** an adopter already has a working file at a non-default location, **When** setup runs, **Then** it records that existing location in config rather than scaffolding a duplicate elsewhere.

---

### User Story 4 - One repo, multiple isolated installations (monorepo) (Priority: P1)

A monorepo hosts several sub-projects, each of which uses stack-control independently. The operator sets up each sub-project as its own installation, with its own config and its own isolated set of working files. A verb invoked within one sub-project operates on that sub-project's working files and never on a sibling's. Setting up or re-running setup for one installation never creates, mutates, or deletes another installation's working files.

**Why this priority**: The operator named monorepo multi-installation as critical. Real adopter repos (including this one) are monorepos; a model that assumes one repo = one installation cannot set them up. Installation isolation is what prevents one sub-project's roadmap/inbox/backlog from bleeding into another's.

**Independent Test**: In one repo, set up two installations rooted at two different subtrees with distinct working-file locations; run a capture in each; assert each capture lands only in its own installation's working files, the two configs are independent, and re-running setup for one installation leaves the other's files byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** a repo with two installations, **When** a verb runs within one installation's scope, **Then** it resolves and mutates only that installation's working files.
2. **Given** two installations exist, **When** setup runs for one of them, **Then** the other installation's working files and config are untouched.
3. **Given** a verb is invoked from a location that is within a specific installation's scope, **When** it resolves its working file, **Then** the resolution is deterministic and selects that installation (never a sibling) — and fails loudly if the invocation context matches no installation or is genuinely ambiguous.

---

### User Story 5 - Setup proves the project is actually usable (Priority: P2)

After scaffolding (or finding) the working files, setup verifies that each one is well-formed for the verb that consumes it — the roadmap parses as a governed roadmap, the inbox as a governed inbox, the backlog store is a valid store, the audit log is a valid log, and the config points at real, resolvable locations. If any working file is present but malformed, setup fails loudly and names exactly which one is wrong and why, rather than reporting success over a project that will fail at the first verb invocation.

**Why this priority**: "The files exist" is weaker than "the verbs work." Per the constitution's fail-loud principle, setup must surface a broken or drifted working file immediately instead of leaving the adopter to discover it as a confusing downstream parse error. P2 because it hardens the other stories rather than delivering core capability alone.

**Independent Test**: Place a structurally-invalid roadmap in a project, run setup, and assert it fails naming the roadmap as malformed; then repeat with all working files valid and assert setup reports a clean, verb-ready project.

**Acceptance Scenarios**:

1. **Given** all working files are present and valid, **When** setup runs its verification, **Then** it reports the project is ready for the governed verbs.
2. **Given** a working file is present but malformed, **When** setup runs, **Then** it fails loudly, names the offending file, and does not report success.
3. **Given** the config references a location that does not resolve, **When** setup runs verification, **Then** it reports the mismatch rather than silently passing.

---

### Edge Cases

- **Pre-existing working file with operator content** — never overwritten or truncated (US2); reported as already-present.
- **Pre-existing working file that is malformed / not the governed shape** — setup does not silently replace it; it surfaces the drift for an operator decision rather than clobbering possibly-real content.
- **Partial prior setup** — config present but some working files missing (or any subset). Setup completes only the missing pieces.
- **Backlog store initialization constraints** — the underlying backlog tooling's native initializer is interactive and requires a git repository (discovered in `008-backlog-surface`). Setup must initialize the store deterministically, non-interactively, and git-independently, producing an equivalent valid store.
- **Configured location collisions across installations** — two installations configured to write the same working-file location, or one installation's configured location escaping its own scope into a sibling's. Setup must detect and refuse (or require explicit operator intent) rather than silently letting two installations share a file.
- **Nested installations** — one installation rooted inside another's subtree. Resolution precedence for a verb invoked in the overlap must be deterministic and documented.
- **Verb invoked from a location covered by no installation** — fail loud naming that no installation resolves, rather than falling back to the plugin-bundled copy.
- **Verb invoked from a location covered by multiple installations** — deterministic resolution (or loud ambiguity error), never an arbitrary pick.
- **Ambiguous or non-project working directory for setup** — setup must determine the installation root deterministically (or fail loudly naming the ambiguity) rather than scattering working files into the wrong directory.
- **Plugin upgrade changes the expected working-file skeleton** — a re-run against working files authored by an older plugin version detects drift between what exists and what the current verbs expect, and reports it rather than silently overwriting adopter content.
- **Config present but pointing at a now-missing working file** — surfaced by verification (US5), not silently re-created in a way that abandons the configured location.

## Requirements *(mandatory)*

### Functional Requirements

#### Scaffolding the working files

- **FR-001**: Setup MUST scaffold, into a stack-control installation, the complete set of governed working files the verbs require to operate without hand-authoring: at minimum a governed roadmap, a design inbox, a backlog store, an audit-log/governance working file, and a stack-control config. (The exact membership of the managed set in this feature's scope is an Open Question — see below.)
- **FR-002**: Each scaffolded working file MUST be created in a form its consuming verb's parser accepts as valid and empty-but-usable (a roadmap with no items, an inbox with no captures, a backlog store with no tasks, an audit log with no findings) — structurally valid, not merely a blank file.
- **FR-003**: After setup, each governed verb MUST resolve and operate on the installation's project-local working file **by default**, without the operator supplying an explicit path, and MUST NOT silently fall back to the plugin-bundled copy.
- **FR-008**: Setup MUST initialize the backlog store in a deterministic, non-interactive, git-independent manner that yields a store the `backlog` verb accepts (the native interactive initializer is not relied upon).

#### Non-destructive & idempotent

- **FR-004**: Setup MUST be non-destructive: it MUST NOT modify, truncate, or delete any working file that already exists, and MUST preserve existing contents exactly.
- **FR-005**: Setup MUST be idempotent: running it on a fully- or partially-set-up installation creates only the missing working files and changes nothing else.
- **FR-006**: Setup MUST report, per working file, whether it was created, already present, or skipped — naming the resolved location of each.
- **FR-010**: When an existing working file is present but does not match the governed shape the current verbs expect, setup MUST surface the drift for an operator decision rather than overwriting possibly-real content.

#### Configurable locations

- **FR-018**: An adopter MUST be able to configure the location of each governed working file independently; setup MUST create each working file at its configured location and record that location in the installation config.
- **FR-019**: When a working file's location is not configured, setup MUST use a documented project-relative default and record the resolved location in config.
- **FR-020**: When a working file already exists at a non-default location, setup MUST record that existing location in config rather than scaffolding a duplicate elsewhere.
- **FR-007**: Setup MUST write a single stack-control installation config that records where each governed working file lives, such that the config is the one source the read-side document-discovery resolves against (shared config + resolution contract with `design:gap/project-relative-doc-discovery`).

#### Multiple installations (monorepo)

- **FR-021**: The setup, config, and resolution model MUST support multiple independent stack-control installations within a single repository, each with its own config and its own isolated set of working files.
- **FR-022**: Setup MUST operate on exactly one installation per invocation and MUST NOT create, mutate, or delete any other installation's working files or config.
- **FR-023**: A governed verb MUST deterministically resolve which installation it operates on from its invocation context, MUST operate only on that installation's working files, and MUST fail loudly when the context matches no installation or is genuinely ambiguous (never an arbitrary pick, never a fallback to a bundled copy).
- **FR-024**: Setup MUST detect and refuse (or require explicit operator intent for) configurations in which two installations would share a working-file location, or in which an installation's configured location escapes its own scope — rather than silently allowing cross-installation interference.

#### Verification & reachability

- **FR-009**: Setup MUST verify that every required working file (created or pre-existing) is well-formed for its consuming verb, and MUST fail loudly — naming the offending file and the reason — when one is present but malformed (no silent success over a broken project).
- **FR-011**: Setup MUST determine the installation root deterministically, and MUST fail loudly if the target is ambiguous, rather than writing working files to an unintended directory.
- **FR-013**: Setup MUST be reachable through the plugin's publicly-advertised surface (a `stackctl` verb and/or a `/stack-control:…` skill) so that an adopter who follows the install docs can run it without privileged or in-repo-only steps.
- **FR-014**: Setup MUST NOT require network access, secrets, or interactive prompts to produce a valid installation (it scaffolds local governed working files only).

#### Trigger model (operator decision 2026-06-09)

- **FR-015**: Setup MUST be reachable **both** as an explicit operator-invoked step (run once after install, per installation) **and** automatically the first time a governed verb finds its required working files missing — in which case the verb scaffolds the missing files for that installation and then proceeds with the operator's original request.
- **FR-016**: When setup runs automatically on a verb's first use, it MUST **announce** exactly which working files it created (and where) as part of that verb's output — the scaffold is never a silent side effect — and it MUST create only empty-but-valid files, never fabricated or example content. (This preserves the spirit of the fail-loud principle: state changes are visible and contentless, even though the missing-file state no longer aborts the verb.)
- **FR-017**: Explicit setup and auto-on-first-use setup MUST produce identical working files (same scaffolding logic), so an installation bootstrapped lazily by a verb is indistinguishable from one bootstrapped by the explicit step.

### Key Entities *(include if feature involves data)*

- **Installation**: an independent stack-control unit scoped to a subtree of a repository. Owns one config and one isolated set of governed working files. A repo may contain N installations; setup operates on exactly one per invocation. (This monorepo's `plugins/stack-control/` is itself an installation — the dogfood.)
- **stack-control installation config**: the single configuration artifact for one installation, recording the resolved, individually-configurable location of every governed working file. The authoritative input to read-side document discovery. The create-side (this feature) writes it; the read-side resolves it.
- **Governed Roadmap document**: the heading-keyed governed work-item DAG the `roadmap` verb reasons over. Scaffolded empty-but-valid.
- **Design Inbox document**: the governed out-of-sequence idea store the `inbox` verb captures into and triages. Scaffolded empty-but-valid, including whatever structural registry its parser requires.
- **Backlog store**: the external-tool-managed task store the `backlog` verb shells out to. Scaffolded as a valid, empty, non-interactively-initialized store.
- **Audit log / governance working files**: the audit-log and associated governance/scope-discovery working files the audit-barrage and governance surfaces append to and read (e.g. audit log, slush/burn-down records). Membership-in-scope for this feature is an Open Question; the audit log itself is in the known set.
- **Setup report**: the per-working-file created / already-present / skipped / malformed summary returned to the operator, including resolved locations, scoped to the installation acted upon.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from a project with the plugin installed and no stack-control working files present, an operator reaches a state where every governed verb works on their own project working files through a single setup invocation and zero hand-authored files.
- **SC-002**: Re-running setup any number of times on a project with existing captured content results in zero modifications, truncations, or deletions of pre-existing working files (measured by content-hash equality before and after).
- **SC-003**: 100% of working files produced by setup are accepted as valid by the parser of the verb that consumes them (verified by running each verb against the scaffolded file).
- **SC-004**: After setup, every governed verb resolves the installation's project-local working file by default — no run in the verb-ready test requires an explicit path, and none falls back to a plugin-bundled copy.
- **SC-005**: A project containing a malformed required working file never returns a "setup succeeded / project ready" result; setup instead names the offending file (0% false-clean reports).
- **SC-006**: Setup produces a valid installation with no network access, no secrets, and no interactive input.
- **SC-007**: An operator can place every governed working file at a location of their choosing; 100% of consuming verbs then resolve the configured location by default (configurability is complete — no working file is location-locked).
- **SC-008**: In a single repo, two installations set up at different subtrees operate in full isolation: a capture in one appears in zero of the other's working files, and re-running setup for one installation produces zero changes to the other's files (content-hash equality).

## Assumptions

- **Trigger model (operator decision 2026-06-09 — resolved, FR-015/016/017)**: setup is reachable **both** as an explicit operator-invoked step **and** automatically on a governed verb's first use when working files are missing. The fail-loud principle is honored in spirit rather than by aborting: auto-scaffold is always **announced** and only ever creates empty, contentless files — no hidden state change, no fabricated data.
- **Shared config + resolution contract**: this feature and the read-side `design:gap/project-relative-doc-discovery` agree on one config schema and one installation-resolution model; the abstraction is derived from these two concrete uses (constitution Principle II), not designed speculatively. Exact config schema, file name, on-disk locations, and the resolution mechanism are a plan/contracts concern.
- **Configurable locations with project-relative defaults**: every governed working file's location is independently configurable; when unset, a documented project-relative default applies. An emerging `.stack-control/` per-project directory convention already exists in the code (used for grammars) and is a candidate home for config and co-located defaults — but whether defaults are co-located under `.stack-control/` or scattered at conventional repo paths is an Open Question.
- **Per-installation config**: a repo may host N installations, each scoped to a subtree, each with its own config and isolated working files. "One repo = one installation" is explicitly NOT assumed.
- **Empty-but-valid seeding**: scaffolded working files carry no example/business content beyond the minimal structure their parsers require.
- **Backlog store mechanism**: the deterministic non-interactive initialization equivalent established in `008-backlog-surface` (a hand-authored filesystem-only store config in place of the interactive initializer) is the intended approach; the precise mechanism is a plan/contracts concern.
- **Scope boundary (capture, not cut)**: the deskwork Ideas-stage hand-off, any web/TUI setup surface, and migration of an existing dw-lifecycle project's documents are recorded here as **out of scope** for this feature (tracked separately) so they are not silently absorbed.

## Open Questions *(to resolve at `/speckit-clarify`)*

These are genuine forks the operator owns; captured here rather than silently defaulted (constitution Principle II — capture-then-scope):

- **OQ-1 — Installation resolution model**: How does a verb determine which installation it belongs to? Candidates: nearest-enclosing config via upward directory walk from cwd (git-style); an explicit registry of installation roots; an explicit per-invocation selector. Drives FR-023 and the read-side contract.
- **OQ-2 — Default location convention**: When locations are unconfigured, are working files co-located under a single per-installation directory (e.g. `.stack-control/`) or scattered at conventional repo paths (roadmap/inbox at the installation root, as the current dogfood places them)? Drives FR-019.
- **OQ-3 — Configurable-location granularity**: Is each working file an independent path, or a base directory + conventional file names, or both (base dir with per-file overrides)? Drives FR-018.
- **OQ-4 — Managed-set membership**: Exactly which governed working files does *setup* scaffold (roadmap, inbox, backlog, config are in; audit log is named in scope — but do slush/burn-down records, scope-discovery registries/clones baselines, and governance run directories get scaffolded by setup, or created lazily by their own verbs)? Drives FR-001/FR-002.
- **OQ-5 — Installation definition / boundary**: What marks a subtree as an installation root (the presence of the config file itself? an explicit `init` that registers it?), and how are nested installations' precedence and collision rules defined? Drives FR-021/FR-024.

## Dependencies

- **`multi:feature/front-door`** — the plugin shell, `stackctl` CLI, and `/stack-control:…` skill surface this feature is reached through already exist.
- **`design:gap/project-relative-doc-discovery`** (read-side complement) — shares the config + installation-resolution contract this feature writes; the two are designed together so create-side and read-side agree (including the monorepo resolution model in FR-023).
- **`008-backlog-surface`** — defines the backlog store shape and the non-interactive initialization constraint this feature reuses.
- **`007-insight-capture` / `006-roadmap-protocol`** — define the governed inbox and roadmap document formats whose empty-but-valid skeletons this feature must produce.
- **The governance / audit-barrage surfaces** — define the audit-log working-file shape this feature must scaffold; their migration into stack-control (`multi:feature/migrate-audit-barrage`) is related but separate.
