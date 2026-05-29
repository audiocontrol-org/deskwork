---
slug: command-shortcuts
title: Command shortcuts for dw-lifecycle
targetVersion: "1.0"
date: 2026-05-11
datePublished: 2026-05-12
parentIssue: "#250"
deskwork:
  id: 49cb7baf-dc4f-4acc-a860-1fc2d2681831
designSpec: docs/superpowers/specs/2026-05-11-command-shortcuts-design.md
---

# PRD: Command shortcuts for dw-lifecycle

## Problem Statement

Claude Code requires plugin commands as `/<plugin>:<command>` (e.g. `/dw-lifecycle:implement`). Docs claim the prefix is optional when there are no collisions; in practice it's always required (anthropics/claude-code#15882 and #23589). For `dw-lifecycle` — 16 commands, daily use during feature work — the `/dw-lifecycle:` prefix is friction-heavy. The working workaround is user-level shim files at `~/.claude/commands/<name>.md` whose body forwards to the namespaced form (`/dw-lifecycle:<command> $ARGUMENTS`). This feature packages that workaround as an explicit, opt-in skill so operators don't have to author the shims by hand.

## Solution

Ship a new opt-in skill `/dw-lifecycle:install-shortcuts` (and a companion `/dw-lifecycle:uninstall-shortcuts`) that writes shim `.md` files into the operator's `~/.claude/commands/` directory. The skill prompts the operator to pick one of three naming schemes at install time — terse 2-letter (`dwi`), regular 3-letter (`dw-im`), or verbose (`dw-implement`) — and writes one shim per dw-lifecycle command using the chosen scheme. A manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json` records what was written so the companion uninstall skill can roll it back cleanly. The existing `/dw-lifecycle:install` skill gains a one-line nudge in its final report toward the new shortcuts skill. No changes to existing dw-lifecycle commands or behavior; the feature is purely additive and opt-in.

## Acceptance Criteria

- [ ] `/dw-lifecycle:install-shortcuts` exists as a slash command in any Claude Code session that has the dw-lifecycle plugin loaded
- [ ] The skill prompts the operator to pick between schemes A (2-letter terse), B (3-letter regular), and C (full verb — default), with example mappings rendered for each
- [ ] Running the skill writes exactly 16 shim files (one per dw-lifecycle command) plus 1 manifest file into `~/.claude/commands/`
- [ ] Each shim's content is one line: `/dw-lifecycle:<command> $ARGUMENTS`
- [ ] After install, the chosen shortcut (e.g. `/dw-implement`) is invokable from any Claude Code session and dispatches to the namespaced form
- [ ] Collision detection refuses to overwrite existing `~/.claude/commands/*.md` files unless `--force` is passed; lists collisions when refusing
- [ ] `/dw-lifecycle:uninstall-shortcuts` reads the manifest, drift-checks each shim, removes them, and removes the manifest
- [ ] Uninstall refuses to remove shims whose content drifted from what was originally written, unless `--force-uninstall` is passed
- [ ] Re-running install with a different scheme refuses unless `--replace` is passed
- [ ] `--dry-run` previews changes without writing for both install and uninstall
- [ ] Manual dogfood: install scheme C against this repo's `~/.claude/commands/`, exercise three shortcuts, uninstall, confirm clean state

## Out of Scope

- **Shortcuts for `deskwork` and `deskwork-studio` plugins.** Deferred until the dw-lifecycle pattern is validated by daily use. Re-evaluate after this feature ships.
- **Inner command renames** (workaround #3 from the design brief — e.g. renaming `implement` → `i`). Separate concern; defer to a follow-up if shims aren't enough on their own.
- **First-class alias mechanism.** Waiting on Claude Code [#23589](https://github.com/anthropics/claude-code/issues/23589). When that lands, this feature retires.
- **Per-project (rather than per-user) shims.** Claude Code reads user-level commands from `~/.claude/commands/` only; per-project scoping would require an upstream feature.
- **CI test infrastructure.** Per the deskwork rule *"No test infrastructure in CI."* Local vitest only.

## Technical Approach

`/dw-lifecycle:install-shortcuts` renders the three naming schemes in a terminal table with example mappings, asks the operator to pick A / B / C (default C), and invokes `dw-lifecycle install-shortcuts --scheme=<X>`. The CLI probes `~/.claude/commands/` for collisions; refuses to overwrite by default; supports `--force` / `--rename <prefix>` / `--replace` for the cases that need them; writes each shim's one-line body (`/dw-lifecycle:<command> $ARGUMENTS`) plus a JSON manifest recording the scheme, shim paths, and plugin version. `--dry-run` previews without writing. The companion `uninstall-shortcuts` skill reads the manifest, drift-checks each shim, deletes them, deletes the manifest. The existing `/dw-lifecycle:install` skill gets a one-line nudge in its final report. README adds a "Shortcuts" section. Unit tests cover the three scheme tables (all 16 commands × 3 schemes), no-duplicates invariant, manifest round-trip, collision logic, drift detection. Integration test runs the install + uninstall cycle against a tmp HOME fixture. The design rationale, error-table, data-flow diagram, and full file layout live in the design spec at `docs/superpowers/specs/2026-05-11-command-shortcuts-design.md`.
