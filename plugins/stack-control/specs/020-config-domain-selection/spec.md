# Feature Specification: Config-domain discovery and sticky selection

**Feature Branch**: `020-config-domain-selection`

**Created**: 2026-06-13

**Status**: Draft

**Roadmap codename**: `design:feature/config-domain-selection`

**Input**: User description: "We need config discovery and a per-session or per-branch sticky preference for which stack control config domain to use."

## Context & Problem

`stack-control` resolves the nearest enclosing `.stack-control/config.yaml` by
walking upward from the current working directory or `--at <dir>`. That
behavior is correct inside a chosen installation, but it breaks the natural
adopter workflow in a monorepo whose installations live under `plugins/<name>/`
while the agent's cwd is the repo root.

Today the operator must remember and retype `--at plugins/stack-control` (or
`cd` first) on every command. In a repo with several valid installation
domains, the problem is worse: there is no native way to say "for this session,
target `plugins/stack-control`" or "on this branch, default to
`plugins/dw-lifecycle`" and let ordinary verbs resolve that choice.

The missing capability is not a new installation model. The governed unit is
still the nearest enclosing installation when one exists. The gap is an
adopter-facing selection layer for the case where the cwd encloses no
installation but a surrounding git repo contains one or more valid candidate
domains below it.

This feature adds two behaviors:

1. repo-local discovery of candidate installation domains when the normal
   upward walk finds none, and
2. a sticky selector so the operator can choose a preferred domain for the
   current session or current branch.

## Clarifications

### Session 2026-06-13

- Q: Should this change replace the nearest-enclosing rule inside an
  installation? → A: **No. Upward nearest-wins remains canonical once inside an
  installation.**
- Q: What is the target failure mode when several candidate domains exist and no
  preference is set? → A: **Fail loud and require an explicit choice.**
- Q: Must the choice be reusable without repeating `--at` on every command? →
  A: **Yes.**
- Q: Is the requested stickiness scoped to either a session or a git branch? →
  A: **Yes. Support both scopes.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover a usable installation domain from the repo root (Priority: P1) 🎯 MVP

An adopter runs `stackctl` from a repo root or sibling directory that encloses
no installation, but the surrounding git repo contains valid stack-control
installations below that point.

**Why this priority**: This is the root usability failure surfaced during
adopter dogfooding.

**Independent Test**: Create a git repo with plugin-local installations under
`plugins/*`, run a verb from the repo root, and verify discovery chooses the
right domain or fails loudly when ambiguous.

**Acceptance Scenarios**:

1. **Given** the cwd is outside any installation and the enclosing git repo
   contains exactly one valid `.stack-control/config.yaml`, **When** the
   operator runs `stackctl session-start`, **Then** the verb resolves that one
   candidate automatically.
2. **Given** the cwd is outside any installation and the enclosing git repo
   contains multiple valid candidate domains, **When** no sticky preference is
   set, **Then** the verb fails loudly naming the candidates and directing the
   operator to choose one explicitly.
3. **Given** the cwd is already inside an installation, **When** the operator
   runs any governed verb, **Then** the existing nearest-enclosing upward-walk
   behavior remains unchanged.

---

### User Story 2 - Reuse a preferred domain for a work session or branch (Priority: P1)

An adopter chooses one installation domain once and expects subsequent
stack-control commands to target that domain without repeating `--at`.

**Why this priority**: Discovery alone still leaves multi-installation repos
friction-heavy; the operator needs a durable choice mechanism.

**Independent Test**: Set a session-scoped preference and a branch-scoped
preference in a multi-domain repo, then run ordinary verbs from the repo root
and verify resolution honors the expected precedence.

**Acceptance Scenarios**:

1. **Given** multiple candidate domains exist, **When** a session-scoped
   preference is set, **Then** ordinary verbs resolve that preferred domain from
   the repo root without `--at`.
2. **Given** both session and branch preferences exist for the current branch,
   **When** the operator runs a verb, **Then** the session preference overrides
   the branch preference.
3. **Given** a branch-scoped preference exists and no session preference is set,
   **When** the operator switches back to that branch later, **Then** ordinary
   verbs resolve the branch preference automatically.

---

### User Story 3 - Inspect, set, and clear the preference explicitly (Priority: P2)

An adopter can see which domain is currently preferred and can change or clear
that preference with an explicit CLI surface.

**Why this priority**: Ambiguity resolution must be operator-controlled and
observable; implicit hidden state is not acceptable.

**Independent Test**: Use the selector CLI to show, set, and clear preferences,
then confirm resolver behavior changes accordingly.

**Acceptance Scenarios**:

1. **Given** no preference is set, **When** the operator queries the domain
   preference surface, **Then** the tool reports that no session or branch
   preference is configured.
2. **Given** the operator sets a branch preference to a valid installation
   domain, **When** the selector reports current state, **Then** it shows that
   domain and scope explicitly.
3. **Given** a stored preference points at a path that no longer resolves to a
   valid installation, **When** a verb runs, **Then** the tool fails loudly
   naming the invalid preference rather than silently falling back.

## Edge Cases

- The cwd is outside any installation and outside any git repo.
- A branch-scoped preference exists but the current branch is detached `HEAD`.
- A stored preference points at a deleted path or a path that no longer carries
  `.stack-control/config.yaml`.
- The repo contains nested installations and the preferred domain points at the
  parent while the cwd is inside the child.
- The repo contains many candidates under unrelated plugin trees and the
  discovery path must not guess among them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the cwd is inside an installation, stack-control MUST keep
  the existing nearest-enclosing upward-walk behavior unchanged.
- **FR-002**: When the upward walk finds no installation, stack-control MUST
  discover candidate domains by inspecting the enclosing git repo for descendant
  `.stack-control/config.yaml` markers.
- **FR-003**: If discovery finds exactly one valid candidate domain,
  stack-control MUST resolve it automatically.
- **FR-004**: If discovery finds multiple valid candidate domains and no valid
  sticky preference applies, stack-control MUST fail loudly and list the
  candidates.
- **FR-005**: Stack-control MUST provide an explicit CLI surface to show, set,
  and clear a preferred domain.
- **FR-006**: The preferred domain surface MUST support at least `session` and
  `branch` scopes.
- **FR-007**: When both session and branch preferences are present, the session
  preference MUST take precedence.
- **FR-008**: When a stored preference is invalid for the current repo state,
  stack-control MUST fail loudly naming the invalid preference; it MUST NOT
  silently ignore it and guess another domain.
- **FR-009**: Ordinary verbs that currently resolve installations through the
  shared resolver MUST honor the same discovery and preference rules without
  per-verb reimplementation.

### Key Entities

- **Candidate Domain**: A descendant directory within the enclosing git repo
  whose `.stack-control/config.yaml` marks a valid installation root.
- **Session Preference**: A repo-local sticky selection that applies before any
  branch preference until explicitly changed or cleared.
- **Branch Preference**: A repo-local sticky selection keyed to the current git
  branch.
- **Domain Selector Surface**: The explicit CLI surface used to inspect, set,
  and clear preferred domains.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a repo root with one candidate domain below it,
  `stackctl session-start` succeeds without `--at`.
- **SC-002**: From a repo root with multiple candidate domains and no
  preference, `stackctl session-start` fails loudly and lists the candidate
  domains.
- **SC-003**: After setting a session or branch preference, ordinary verbs
  resolve the selected domain from the repo root without `--at`.
- **SC-004**: Tests cover invalid stored preferences and precedence between
  session and branch scope.

## Assumptions

- The enclosing git repo is the only acceptable search boundary for downward
  discovery; stack-control will not scan outside that repo.
- Preference state is repo-local operator state, not committed product state.
- The selector surface is CLI-first and host-neutral; Codex and Claude both
  benefit through the shared resolver.
