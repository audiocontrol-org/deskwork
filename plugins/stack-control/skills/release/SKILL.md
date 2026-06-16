---
name: release
description: "Check the portable stack-control release contract and use the shared release surface instead of host-owned release semantics."
---

# /stack-control:release

Use the stack-control release surface as the portable contract for deskwork
releases. The workflow remains one monorepo release with one version line; host
surfaces are adapters, not separate release streams.

## Compass precondition (024 — the un-skippable lifecycle)

**Before doing ANY of this skill's work**, consult the compass for the roadmap item being released, declaring this skill as the intent:

```bash
plugins/stack-control/bin/stackctl workflow compass <item> --intent release
```

A **non-zero exit is a hard refusal**: print the compass's reason and **STOP — perform none of this skill's work**. `release` maps to the back-half `shipped` target, so an item that has not reached `governing` returns `ahead` (naming the skipped step) — you cannot release un-governed work. Proceed only on exit 0. Per `.claude/rules/enforcement-lives-in-skills.md` the gate lives in this skill body + the `stackctl workflow compass` verb, never a git hook.

## Shared-core contract

Start with the shared-core check:

```bash
plugins/stack-control/bin/stackctl release-check
```

The portable helper subcommands also live behind `stackctl` now:

```bash
plugins/stack-control/bin/stackctl release-helper check-preconditions
plugins/stack-control/bin/stackctl release-helper validate-version <version> <last-tag>
plugins/stack-control/bin/stackctl release-helper assert-not-published <version>
plugins/stack-control/bin/stackctl release-helper assert-published <version>
plugins/stack-control/bin/stackctl release-helper atomic-push <tag> <branch>
```

This is the authoritative preflight for portability:

1. It verifies the shipped monorepo artifacts remain in lockstep.
2. It verifies the stack-control Claude marketplace and Codex plugin manifests
   point at the same released version.
3. It fails loudly on drift instead of allowing a host-specific release stream.

## Current migration state

The historical operator procedure still lives in
[`/.claude/skills/release/`](../../../.claude/skills/release/), but its helper
implementation is now a compatibility wrapper over the stack-control-owned
release helper module. Treat the Claude-owned path as a host adapter, not the
portable source of truth.

## Adapter rule

Claude Code and Codex may present release steps differently, but they must both
consume the same shared release contract and must not invent host-only version
lines or publish flows.
