---
name: release
description: "Check the portable stack-control release contract and use the shared release surface instead of host-owned release semantics."
---

# /stack-control:release

Use the stack-control release surface as the portable contract for deskwork
releases. The workflow remains one monorepo release with one version line; host
surfaces are adapters, not separate release streams.

## Shared-core contract

Start with the shared-core check:

```bash
plugins/stack-control/bin/stackctl release-check
```

This is the authoritative preflight for portability:

1. It verifies the shipped monorepo artifacts remain in lockstep.
2. It verifies the stack-control Claude marketplace and Codex plugin manifests
   point at the same released version.
3. It fails loudly on drift instead of allowing a host-specific release stream.

## Current migration state

The historical operator procedure still lives in
[`/.claude/skills/release/`](../../../.claude/skills/release/) while
`017-portability` rehomes the release helpers behind stack-control-owned
surfaces. Treat that Claude-owned path as legacy implementation detail, not the
portable source of truth.

## Adapter rule

Claude Code and Codex may present release steps differently, but they must both
consume the same shared release contract and must not invent host-only version
lines or publish flows.
