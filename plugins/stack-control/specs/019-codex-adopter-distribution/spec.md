# Feature Specification: Public Codex distribution for adopters

**Feature Branch**: `019-codex-adopter-distribution`

**Created**: 2026-06-13

**Status**: Draft

**Roadmap codename**: `distribution:codex-adopters`

**Input**: User description: "We need a mechanism that works for adopters, not this project."

## Context & Problem

`stack-control` now ships a Codex plugin manifest at
`plugins/stack-control/.codex-plugin/plugin.json`, but adopters still do not
have a first-class Codex distribution path. The current state proves payload
compatibility, not product distribution.

That means the Codex story is still effectively maintainer-local: use a repo
checkout, point Codex at a local plugin path, or improvise a local marketplace
entry. That is acceptable for development, but it is not an adopter install
mechanism. An adopter should be able to consume a released `stack-control`
plugin through a stable Codex distribution channel the same way Claude adopters
consume it through the Claude marketplace.

The release and versioning constraints remain non-negotiable. Claude Code and
Codex must consume the same logical `stack-control` release line. Codex should
not become a forked packaging stream, nor should the plugin require adopters to
clone this deskwork repository just to install it.

This feature establishes a public Codex adopter distribution mechanism for
`stack-control`: one released plugin artifact line, one Codex-facing catalog or
marketplace channel for adopters, clear install/update guidance, and tests/docs
that enforce the distinction between maintainer-local development flow and
adopter distribution flow.

## Clarifications

### Session 2026-06-13

- Q: Should the mechanism be repo-local to deskwork? → A: **No. It must work
  for adopters.**
- Q: What is the target host for this feature? → A: **Codex**, specifically the
  adopter install/update experience.
- Q: Must Claude and Codex share a version line? → A: **Yes.**
- Q: Is cloning the deskwork repo an acceptable adopter install story? → A:
  **No.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install stack-control in Codex as an adopter (Priority: P1) 🎯 MVP

An adopter who is not developing inside the deskwork repo installs the released
`stack-control` plugin in Codex through a stable public distribution mechanism.

**Why this priority**: This is the missing product capability. Without it,
Codex support is still maintainers-only.

**Independent Test**: Starting from a clean environment with no local deskwork
checkout, install `stack-control` in Codex using the documented public
distribution flow and verify the plugin loads.

**Acceptance Scenarios**:

1. **Given** an adopter in Codex, **When** they follow the documented install
   flow, **Then** they can install `stack-control` without cloning deskwork or
   hand-authoring a local marketplace entry.
2. **Given** a released version of `stack-control` exists, **When** the adopter
   installs from the Codex distribution channel, **Then** the installed version
   matches the released version line.
3. **Given** the plugin is installed in Codex, **When** the adopter starts a
   new thread, **Then** the plugin’s declared skills are available through the
   Codex host surface.

---

### User Story 2 - Update Codex adopters from the same release line as Claude (Priority: P1)

A released `stack-control` version becomes available to both Claude and Codex
consumers from the same version line, without host-specific drift.

**Why this priority**: Distribution portability is false if Codex receives a
separate version stream or manual-only updates.

**Independent Test**: Publish or simulate a release and verify that Claude and
Codex distribution metadata both resolve to the same released version.

**Acceptance Scenarios**:

1. **Given** `stack-control` is released at version `vX.Y.Z`, **When** Codex
   distribution metadata is inspected, **Then** it resolves to that same
   released version.
2. **Given** Claude marketplace metadata is inspected for the same release,
   **When** the two host channels are compared, **Then** there is no
   host-specific version drift.
3. **Given** an adopter updates `stack-control` in Codex, **When** the update
   completes, **Then** the resulting installed version matches the release line
   published for Claude.

---

### User Story 3 - Distinguish adopter distribution from maintainer/dev flow (Priority: P2)

Maintainers and adopters can tell the difference between local development
install paths and the public Codex adopter install path, and the docs do not
present maintainer-local steps as the product story.

**Why this priority**: The current confusion exists because a dev payload was
mistaken for a product distribution mechanism.

**Independent Test**: Review product docs and install guidance and confirm they
separate adopter distribution from repo-local development flow.

**Acceptance Scenarios**:

1. **Given** an adopter reads the stack-control README, **When** they look for
   Codex install guidance, **Then** they see a public adopter path first, not a
   repo-local dev path.
2. **Given** a maintainer reads the same docs, **When** they need local
   development instructions, **Then** those steps are clearly marked as local
   development flow.
3. **Given** tests assert the distribution contract, **When** docs regress to a
   repo-local-only Codex story, **Then** the regression is caught.

---

### Edge Cases

- What happens when a new release is published for Claude but the Codex
  distribution metadata is missing or stale?
- What happens if the Codex catalog entry exists but points at an unreleased or
  mutable source instead of a released artifact or pinned release ref?
- How does the plugin communicate the difference between local dev install and
  public adopter install without making either path ambiguous?
- What happens if Codex requires a marketplace registration step before install?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `stack-control` MUST provide a public Codex adopter distribution
  mechanism that does not require cloning the deskwork repository.
- **FR-002**: The Codex adopter distribution mechanism MUST resolve to released
  `stack-control` versions, not mutable maintainer-local state.
- **FR-003**: Codex and Claude distribution channels MUST consume the same
  logical `stack-control` release line.
- **FR-004**: Product-facing docs MUST document the public Codex adopter
  install/update path explicitly.
- **FR-005**: Product-facing docs MUST distinguish adopter install flow from
  repo-local development flow.
- **FR-006**: Distribution metadata and tests MUST fail loudly on version drift
  or missing Codex distribution wiring.
- **FR-007**: The Codex distribution channel MAY require a one-time marketplace
  or catalog registration step, but that step MUST be documented as part of the
  adopter flow rather than left implicit.

### Key Entities

- **Codex Distribution Channel**: The public adopter-facing catalog or
  marketplace route by which Codex installs `stack-control`.
- **Released Plugin Artifact**: The versioned plugin payload consumed by host
  channels.
- **Distribution Metadata**: The host-facing metadata that points Codex and
  Claude consumers at the same release line.
- **Development Install Flow**: The repo-local path used by maintainers during
  local plugin development.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clean Codex environment can install the released plugin without
  a local deskwork checkout.
- **SC-002**: Codex distribution metadata resolves to the same released version
  line as Claude for each release.
- **SC-003**: The stack-control README clearly separates adopter install/update
  guidance from maintainer-local development flow.
- **SC-004**: Tests catch missing or stale Codex adopter distribution wiring.

## Assumptions

- Codex can consume plugins through a marketplace or catalog concept rather than
  only through local checkout paths.
- The released stack-control payload remains suitable for both Claude and Codex
  with host-specific metadata layered on top.
- The deskwork monorepo remains the source of truth for released stack-control
  versions.
