---
name: release
description: "Run the hard-gated deskwork monorepo release flow: preconditions, version bump, operator-side publish, smoke, tag, and atomic push."
---

# Release

DEPRECATED as a canonical repo-level release entry point. The portable release
contract now lives under `plugins/stack-control/skills/release/` and is checked
through `plugins/stack-control/bin/stackctl release-check`. The portable helper
subcommands also live behind `plugins/stack-control/bin/stackctl release-helper
...`. The older `.claude/skills/release/` flow is now only a host adapter over
that shared implementation.

Until that work lands fully:

1. Treat `plugins/stack-control/skills/release/` + `stackctl release-check` as the portable contract.
2. Treat `.claude/skills/release/` as legacy implementation detail, not the desired long-term surface.
3. Preserve the current lockstep monorepo release behavior across all shipped plugins/packages.
4. Do not invent a separate Codex-only release stream.
