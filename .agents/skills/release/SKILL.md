---
name: release
description: "Run the hard-gated deskwork monorepo release flow: preconditions, version bump, operator-side publish, smoke, tag, and atomic push."
---

# Release

DEPRECATED as a canonical repo-level release entry point. The current release
implementation still lives under `.claude/skills/release/`, but `016/017-portability`
is rehoming release/update semantics behind a host-neutral stack-control-facing
surface while preserving lockstep monorepo release behavior.

Until that work lands fully:

1. Treat `.claude/skills/release/` as legacy implementation detail, not the desired long-term surface.
2. Preserve the current lockstep monorepo release behavior across all shipped plugins/packages.
3. Do not invent a separate Codex-only release stream.
