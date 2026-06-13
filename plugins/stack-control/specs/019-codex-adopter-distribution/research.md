# Research: Public Codex distribution for adopters

## Decision 1: A manifest alone is not distribution

**Decision**: Shipping `.codex-plugin/plugin.json` is necessary but not
sufficient. The feature must also provide public adopter-facing distribution
metadata and install instructions.

**Rationale**: A local payload proves compatibility, not discoverability or
adopter installability.

## Decision 2: Codex must consume the release line, not the repo checkout

**Decision**: The Codex adopter channel must resolve to released stack-control
versions, not mutable repo-local state.

**Rationale**: Adopters need a stable install/update story equivalent in rigor
to Claude’s release path.

## Decision 3: Docs must separate adopter flow from local development flow

**Decision**: Product docs present the adopter install/update path first, with
repo-local development instructions explicitly labeled as maintainer flow.

**Rationale**: The current ambiguity comes from treating a maintainer workflow
as if it were the product distribution story.

## Decision 4: Release checks should enforce Codex alignment

**Decision**: Existing release/version checks should be extended so missing or
stale Codex distribution wiring fails loud.

**Rationale**: Otherwise Codex distribution will silently drift behind Claude.
