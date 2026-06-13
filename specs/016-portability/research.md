# Research: Portable stack-control workflow across Claude Code and Codex

## Decision 1: `stackctl` is the authoritative workflow surface

**Decision**: Workflow behavior lives in `stackctl`; Claude Code and Codex are
thin adapters.

**Rationale**: If host-specific skills own behavior, portability decays into
two hand-maintained workflows. A shared CLI/core gives one place for validation,
state transitions, fail-loud behavior, and structured output.

**Alternatives considered**:
- Keep Claude skills authoritative and document Codex translation.
  Rejected: that preserves the current portability bug.
- Build a universal host abstraction first.
  Rejected: speculative; two real hosts are already enough to derive the shape.

## Decision 2: Backlog must be a true port, not an exposed backend

**Decision**: The user-facing backlog workflow speaks only in stack-control
terms; the concrete backend is hidden behind a stable seam.

**Rationale**: The operator may replace `backlog.md`. If backend concepts leak
into the workflow, backend replacement becomes a product rewrite instead of an
implementation swap.

**Alternatives considered**:
- Keep `backlog.md` as a named stable dependency.
  Rejected: contradicts the operator requirement.
- Build a multi-backend registry immediately.
  Rejected: more abstraction than the evidence supports today.

## Decision 3: Portability includes release/update behavior

**Decision**: The release path is part of the portability feature, not a later
ops concern.

**Rationale**: A workflow is not portable if runtime behavior is shared but
distribution/update semantics are host-specific and operationally split. Release
semantics are part of the user-visible lifecycle.

**Alternatives considered**:
- Keep release in a Claude-owned skill and port runtime only.
  Rejected: Codex would remain second-class operationally.
- Give Codex a separate release/update stream.
  Rejected: would fracture atomic monorepo release semantics.

## Decision 4: Preserve lockstep monorepo release behavior

**Decision**: The portable release surface must preserve the current lockstep
release of all shipped monorepo plugins/packages.

**Rationale**: The current release skill coordinates one version line, one tag,
one publish/verify flow, and one release event. Portability must rehost that
behavior, not split it.

**Alternatives considered**:
- Give `stack-control` an independent version/release workflow.
  Rejected: contradicts the monorepo release model.
- Introduce host-specific release channels with different versions.
  Rejected: creates drift and operator confusion.

## Decision 5: Codex consumes the same release contract through a host-neutral install/update path

**Decision**: Codex should consume plugin updates via the same released version
line and artifact contract as Claude marketplace, but through a host-neutral
installation/update path rather than a Claude marketplace dependency.

**Rationale**: Claude marketplace is a distribution channel, not the source of
truth. Codex needs first-class updates without cloning Claude's host-specific
packaging semantics.

**Alternatives considered**:
- Invent a Codex marketplace analogue first.
  Rejected: unnecessary additional product surface.
- Leave Codex on a manual local-path-only install forever.
  Rejected: fails the update portability goal.

## Decision 6: Decommission the old repo-wide feature workflow

**Decision**: Retire the old repo-wide feature workflow as an active path and
make `stack-control` the canonical feature workflow for the repository.

**Rationale**: Portability is undermined if operators and agents can still be
sent down a deprecated peer workflow. One canonical workflow is needed for both
behavioral clarity and host portability.

**Alternatives considered**:
- Keep both workflows live and let users choose.
  Rejected: keeps authority split and preserves migration ambiguity.
- Defer decommissioning to a later cleanup feature.
  Rejected: portability would ship with a deprecated competing path still live.
