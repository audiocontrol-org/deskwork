---
name: release
description: "Run the hard-gated deskwork monorepo release flow: preconditions, version bump, operator-side publish, smoke, tag, and atomic push."
---

# Release

DEPRECATED as a canonical repo-level release entry point. The portable release
contract now lives under `plugins/stack-control/skills/release/` and is checked
through `plugins/stack-control/bin/stackctl release-check`. The older
`.claude/skills/release/` flow is legacy implementation detail while
`016/017-portability` finishes rehoming release/update semantics behind the
host-neutral stack-control surface.

Until that work lands fully:

1. Treat `plugins/stack-control/skills/release/` + `stackctl release-check` as the portable contract.
2. Treat `.claude/skills/release/` as legacy implementation detail, not the desired long-term surface.
3. Preserve the current lockstep monorepo release behavior across all shipped plugins/packages.
4. Do not invent a separate Codex-only release stream.
