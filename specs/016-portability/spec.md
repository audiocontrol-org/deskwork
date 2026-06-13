# Feature Specification: Portable stack-control workflow across Claude Code and Codex

**Feature Branch**: `feature/portability` (session-pinned; spec dir `016-portability`)

**Created**: 2026-06-12

**Status**: Draft

**Roadmap codename**: `multi:feature/portability`

**Input**: User description: "Make the stack-control plugin portable across coding agents. Use the stack-control plugin workflow for this effort. The plugin workflow should be natively usable without workarounds in Codex and Claude Code. Much of the user-facing work is managing backlog issues; the backend implementation of backlog must be completely invisible to the plugin workflow, because backlog.md may be replaced entirely."

## Context & Problem

`stack-control` is intended to be a provider-agnostic control plane, but its
current front-door workflow is still materially coupled to Claude Code. The
plugin README, skill bodies, and execution assumptions treat Claude Code as the
default host session model, so an agent outside Claude Code can only use the
workflow by translating it by hand, bypassing parts of it, or driving the
underlying files directly instead of through the intended surface.

That breaks the portability claim in the place it matters most: the native
plugin workflow for authoring and running work should feel first-class in both
Claude Code and Codex, without one host acting as the "real" workflow and the
other acting as an imitation. The portability gap is not just wording; it
shows up in how workflow steps are expressed, where behavior lives, and which
host assumptions are treated as load-bearing.

There is a second portability problem under the same surface: the current
backlog workflow still leaks its backing implementation (`backlog.md`) into the
plugin UX and documentation. The operator does not like that backend UI and may
replace the backend entirely. If user-facing workflow semantics depend on
`backlog.md` concepts or commands, then the plugin is not portable even inside
its own backlog surface. The backend must be a replaceable implementation
detail behind a stable stack-control contract.

There is also a release/distribution portability constraint. The current release
skill is Claude-owned in implementation location, but the behavior it orchestrates
is monorepo-wide and atomic: all shipped plugins and packages in this repository
release in lockstep from one version line, one tag, and one verification flow.
Portability must not fracture that atomic release model. Claude marketplace
distribution and any Codex-consumable install/update path must come from the
same release event rather than separate host-specific version streams.

The repository also still carries an older repo-wide feature workflow in
parallel with `stack-control`. If that older path remains active, feature-work
authority stays split and operators/agents can still be routed into the
deprecated system. For portability to become canonical rather than optional,
the old repo-wide feature workflow must be decommissioned as an active path.

This feature resolves both issues with the same architectural move: make
`stackctl` the host-neutral authority for workflow behavior, keep Claude Code
and Codex as thin host-native adapters over that shared core, and harden the
backlog abstraction so the user-facing workflow does not leak backend
implementation details.

## Clarifications

### Session 2026-06-12

- Q: Which coding agents must be supported in v1? → A: **Claude Code and
  Codex**.
- Q: What is the done-condition? → A: **The plugin workflow is natively usable
  without workarounds in both Codex and Claude Code.**
- Q: Must Claude Code behavior be preserved exactly? → A: **No.** Claude can
  change if needed for true portability, but the resulting workflow must feel
  natural in both Claude Code and Codex.
- Q: Where should the portability work be centered? → A: **Both the core and
  the adapters, with the CLI/core as the authority.** Behavior lives in
  `stackctl`; host adapters remain thin and natural-feeling.
- Q: What is explicitly load-bearing about backlog? → A: **The backend
  implementation must be invisible to the plugin workflow.** `backlog.md` may
  be replaced, so the stable user-facing contract cannot leak backend-specific
  concepts.
- Q: Which front-door surfaces are in scope? → A: **The full front door:
  `define`, `extend`, and `execute`.**
- Q: What release behavior is non-negotiable? → A: **The current monorepo
  lockstep release behavior must be preserved.** All shipped plugins/packages
  continue to release together from one version line and one release event.
- Q: What should happen to the old repo-wide feature workflow? → A:
  **Decommission it as an active path** so `stack-control` becomes the
  canonical feature workflow for the repository.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the front door natively in either host (Priority: P1) 🎯 MVP

An operator starts work on a stack-control feature from either Claude Code or
Codex. They use the native plugin workflow to define a spec, extend it, and
execute it. They do not need host-specific workaround instructions, file-level
manual intervention, or a second workflow vocabulary to compensate for a
Claude-first design.

**Why this priority**: This is the portability feature's reason to exist. If
the full front door is not natively usable in both hosts, the plugin is still
host-coupled in the core path that matters most.

**Independent Test**: Starting from a repo with Spec Kit installed, run the
front-door workflow for a throwaway feature from both Claude Code and Codex and
confirm the same feature artifacts are created and progressed without host-
specific workaround steps.

**Acceptance Scenarios**:

1. **Given** a Claude Code session in a stack-control project, **When** the
   operator uses `define`, `extend`, and `execute`, **Then** the full workflow
   completes through the plugin's native surface without portability regressions
   that make Claude feel like a second-class host.
2. **Given** a Codex session in the same project, **When** the operator uses
   `define`, `extend`, and `execute`, **Then** the same workflow completes
   natively without host-translation steps or manual file surgery.
3. **Given** both hosts run the same feature through the front door, **When**
   the resulting artifacts are compared, **Then** the workflow semantics and
   core outcomes match even if the host-facing phrasing differs.

---

### User Story 2 - Manage backlog work without seeing the backend (Priority: P1)

An operator or agent manages backlog work through stack-control's backlog
workflow from either Claude Code or Codex. They capture, list, and promote
items using stack-control concepts only; they are not asked to understand,
invoke, or even know about the backing backlog engine.

**Why this priority**: Much of the user-facing plugin workflow is backlog work.
If the backlog surface leaks `backlog.md`, then portability is false at a daily
workflow level even if the front door is portable on paper.

**Independent Test**: Capture, list, and promote backlog items from both hosts,
confirm the workflow language and outcomes are backend-agnostic, then swap or
stub the backing backend in tests without changing user-facing behavior.

**Acceptance Scenarios**:

1. **Given** a user captures a backlog item from Claude Code or Codex, **When**
   the capture succeeds, **Then** the workflow reports stack-control backlog
   semantics only, not backend-specific commands or file-shape concepts.
2. **Given** the backlog backend is unavailable or malformed, **When** a backlog
   operation runs, **Then** the plugin fails loudly using stack-control terms
   rather than surfacing backend internals as the user contract.
3. **Given** the backlog backend is replaced with another implementation behind
   the same abstraction, **When** the same user-facing workflow is exercised,
   **Then** no workflow redesign is required.

---

### User Story 3 - Keep host behavior aligned through a shared core (Priority: P2)

The maintainers add or change workflow behavior once in the shared core and
keep Claude Code and Codex aligned through thin adapters. A new feature does not
need two hand-maintained behavioral implementations, and if one host cannot
support a capability yet, that limitation is explicit and fail-loud rather than
silent divergence.

**Why this priority**: Without an explicit parity strategy, portability decays
back into two drifting workflows. The shared-core rule is what keeps the
feature maintainable after the initial port lands.

**Independent Test**: Add or adjust a shared workflow behavior in the core,
confirm both adapters expose it through thin invocation tests, and verify that
any unsupported host capability is surfaced explicitly rather than being worked
around silently.

**Acceptance Scenarios**:

1. **Given** a new shared workflow behavior is added, **When** both hosts expose
   it, **Then** the behavior is implemented once in `stackctl` and each host
   adapter only maps intent and output presentation.
2. **Given** one host lacks a needed capability, **When** the operator invokes
   the affected workflow step, **Then** the adapter fails loudly and explicitly
   instead of diverging silently or fabricating success.
3. **Given** the core behavior is tested at the CLI boundary, **When** adapter
   tests run, **Then** they prove invocation parity rather than duplicating the
   business logic.

---

### User Story 4 - Release and updates stay atomic across hosts (Priority: P2)

A maintainer performs a release through the portable workflow. The release still
behaves like one monorepo release: all shipped plugins and packages move in
lockstep under one version line, one tag, and one verification flow. Claude
marketplace consumers and Codex consumers both receive updates from that same
release event rather than from host-specific version streams.

**Why this priority**: If portability requires a second release/update path,
then the workflow has split operationally even if the runtime behavior looks
portable. Release atomicity is part of the product contract, not a side concern.

**Independent Test**: Perform a dry-run or fixture-backed release validation and
confirm every shipped plugin/package advances together, with both Claude-facing
and Codex-consumable artifacts derived from the same version/tag event.

**Acceptance Scenarios**:

1. **Given** a maintainer runs the portable release workflow, **When** the
   release version is chosen and applied, **Then** every shipped plugin/package
   in the monorepo is bumped and verified in lockstep.
2. **Given** Claude marketplace distribution and a Codex install/update path
   both exist, **When** a release completes, **Then** both distributions point
   at the same released version rather than separate host-specific versions.
3. **Given** a host-neutral release surface replaces a Claude-owned skill
   implementation, **When** maintainers use it, **Then** the current atomic
   monorepo release semantics remain intact.

---

### User Story 5 - The deprecated repo-wide feature workflow is retired (Priority: P2)

An operator or agent working in this repository is guided onto the
`stack-control` feature workflow rather than the old repo-wide feature
workflow. Deprecated entry points are removed, redirected, or clearly marked so
they are not treated as equally valid active paths.

**Why this priority**: If the old workflow stays live, the repository still has
two competing feature workflows. That keeps authority split and makes the
portable workflow optional instead of canonical.

**Independent Test**: Attempt to follow the old repo-wide feature path and
confirm the repository now routes the operator to `stack-control` or clearly
refuses the deprecated path, with the active `stack-control` path remaining
usable.

**Acceptance Scenarios**:

1. **Given** an operator reaches for the old repo-wide feature workflow,
   **When** they invoke or read its entry point, **Then** they are redirected to
   the `stack-control` workflow or told explicitly that the old path is
   deprecated.
2. **Given** repository guidance documents describe feature work, **When** they
   are read, **Then** `stack-control` is presented as the canonical active
   feature workflow and the older repo-wide workflow is not presented as a peer.
3. **Given** the decommissioning is complete, **When** a new feature is started,
   **Then** there is one clear canonical path rather than two competing ones.

---

### Edge Cases

- What happens when Claude Code and Codex expose the same workflow step through
  different surface mechanics, but the underlying core capability is identical?
- How does the workflow behave when the host supports the front door but cannot
  support a convenience affordance that previously existed only in one host?
- What happens when the backlog backend is missing, malformed, or replaced while
  old user-facing docs still reference its prior implementation?
- How does the workflow report partial portability, where a host can invoke the
  core command but cannot yet provide an equally ergonomic adapter?
- What happens when a host-neutral release surface is introduced but one host's
  distribution channel still has legacy packaging/update mechanics?
- What happens when old repo-wide workflow entry points are still referenced in
  project guidance after `stack-control` becomes canonical?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The authoritative behavior for the portable workflow MUST live in
  `stackctl`, not in host-specific skill or adapter business logic.
- **FR-002**: The plugin MUST support the full front door (`define`, `extend`,
  `execute`) from both Claude Code and Codex without host-specific workaround
  steps.
- **FR-003**: Claude Code and Codex adapters MUST be thin host-native layers
  that gather intent, invoke the same core contract, and present outcomes in a
  natural host style.
- **FR-004**: A host adapter MUST NOT introduce workflow-state transitions,
  validation rules, or success semantics that do not also exist in the shared
  core.
- **FR-005**: When a host cannot support a workflow capability or required host
  primitive, the adapter MUST fail loudly and explicitly rather than silently
  diverging, fabricating success, or requiring implicit operator knowledge.
- **FR-006**: The portable workflow contract MUST cover both front-door
  progression and backlog operations; backlog cannot be treated as a separate,
  host-coupled exception path.
- **FR-007**: The backlog surface MUST expose only stack-control backlog
  semantics to the user-facing workflow; backend implementation details MUST NOT
  be part of the stable contract.
- **FR-008**: The backlog backend MUST be replaceable behind a stable abstraction
  layer without requiring a redesign of the user-facing workflow.
- **FR-009**: User-facing docs and workflow text MUST describe stack-control as
  a portable workflow across Claude Code and Codex, not as a Claude-only
  workflow that Codex users must translate manually.
- **FR-010**: The plugin MUST carry parity-focused tests at the shared-core
  boundary so workflow behavior is asserted once and reused by both host
  adapters.
- **FR-011**: Host-specific tests MUST verify invocation and presentation
  mapping only; they MUST NOT become a second source of workflow behavior.
- **FR-012**: The portable workflow MUST preserve the current monorepo lockstep
  release behavior across all shipped plugins and packages in this repository.
- **FR-013**: Claude marketplace distribution and any Codex-consumable
  install/update path MUST be produced from the same release event and version
  line, not separate host-specific release streams.
- **FR-014**: The release orchestration MUST move behind a host-neutral surface
  without changing the current atomic semantics of version bump, tag, publish,
  verification, and multi-plugin/package coordination.
- **FR-015**: Portability changes MAY alter the existing Claude Code workflow if
  needed, but the resulting workflow MUST still feel natural in Claude Code and
  MUST NOT demote Claude to a second-class host.
- **FR-016**: The old repo-wide feature workflow MUST be decommissioned as an
  active path so `stack-control` becomes the canonical feature workflow for this
  repository.
- **FR-017**: Deprecated repo-wide workflow entry points MUST either redirect to
  the `stack-control` workflow, fail loudly with deprecation guidance, or be
  removed from active guidance so operators are not routed into the old path by
  accident.
- **FR-018**: Repository guidance and workflow docs MUST present
  `stack-control` as the canonical active feature workflow rather than as one of
  two peer options.
- **FR-019**: Every portability behavior change in this feature MUST land
  RED-first, per the constitution's Test-First rule.

### Key Entities *(include if feature involves data)*

- **Portable workflow contract**: the stable set of core stack-control commands,
  outputs, and fail-loud behaviors that both hosts consume.
- **Host adapter**: the Claude Code or Codex-facing layer that gathers user
  intent, invokes the shared contract, and presents the result in host-native
  form.
- **Workflow capability**: a discrete behavior exposed by the plugin (for
  example `define`, `extend`, `execute`, backlog capture/list/promote) that must
  have one authoritative core implementation.
- **Backlog abstraction**: the stable stack-control-facing seam that defines
  backlog operations and hides the concrete backend implementation.
- **Backlog backend**: the current or future concrete engine that stores and
  mutates backlog data behind the backlog abstraction.
- **Parity verdict**: the evidence that both hosts expose the same shared-core
  capability and report explicit host limitations instead of diverging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The full front door (`define`, `extend`, `execute`) is completed
  natively in both Claude Code and Codex for the same feature with **zero
  host-specific workaround steps**.
- **SC-002**: The authoritative workflow behavior is implemented once in the
  shared core, and adapter tests carry **zero adapter-only business-logic
  assertions**.
- **SC-003**: The backlog workflow exposes **zero required user-facing
  references** to `backlog.md` or another backend-specific UI.
- **SC-004**: Replacing the backlog backend behind the abstraction requires
  **zero user-facing workflow changes** in the plugin contract.
- **SC-005**: User-facing portability docs describe Claude Code and Codex as
  supported first-class hosts, and Codex usage requires **zero manual workflow
  translation notes**.
- **SC-006**: For every unsupported host capability encountered during v1
  validation, the user receives an explicit fail-loud message in **100%** of
  cases; silent divergence occurs **0%** of the time.
- **SC-007**: A portable release updates **100% of shipped monorepo
  plugins/packages in lockstep** from one version/tag event, with **0
  host-specific version drift** between Claude-facing and Codex-consumable
  distributions.
- **SC-008**: Starting feature work in this repository exposes **one canonical
  active workflow path** (`stack-control`) and **0 active deprecated peer
  paths** in repository guidance.

## Assumptions

- `stackctl` remains the vendor-neutral primitive beneath host-facing workflow
  surfaces.
- Claude Code and Codex are the only required hosts for v1; broader host
  generalization is deferred until these two integrations prove the right shape.
- Existing backlog operations already have an implementation seam under
  `plugins/stack-control/src/backlog/`; this feature hardens that seam into a
  true stable abstraction rather than inventing a speculative multi-backend
  registry.
- GitHub Spec Kit remains the authoring framework the front door drives; this
  feature is about host portability of stack-control around that chain, not a
  new authoring substrate.
- The current release process is monorepo-wide and lockstep by design; this
  feature rehosts that orchestration portably rather than changing its atomic
  semantics.
- The repo-wide feature workflow being retired is deprecated in favor of
  `stack-control`; this feature completes that transition rather than preserving
  both indefinitely.
- Portability may require changing Claude-oriented wording or workflow posture,
  but the outcome must feel natural in both hosts rather than preserving Claude
  wording as a privileged baseline.

## Out of Scope

- Supporting every coding agent or IDE host beyond Claude Code and Codex.
- Designing a universal multi-host abstraction before the concrete Claude
  Code/Codex integration proves the correct shape.
- Preserving the exact current Claude Code workflow if that blocks genuine
  portability.
- Locking `backlog.md` in as the permanent backlog backend.
- Rebuilding every plugin surface at once; this feature centers on the full
  front door plus the load-bearing backlog workflow.
