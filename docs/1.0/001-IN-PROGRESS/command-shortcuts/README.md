---
slug: command-shortcuts
targetVersion: "1.0"
date: 2026-05-11
branch: feature/command-shortcuts
parentIssue: 
designSpec: docs/superpowers/specs/2026-05-11-command-shortcuts-design.md
---

# Feature: command-shortcuts

Ship a new opt-in skill `/dw-lifecycle:install-shortcuts` (and companion `/dw-lifecycle:uninstall-shortcuts`) that writes user-level shim files into `~/.claude/commands/<short>.md`, each forwarding to the namespaced `/dw-lifecycle:<command>` form. Three naming schemes are offered at install time (terse 2-letter, regular 3-letter, verbose `dw-<verb>` default). A manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json` enables clean rollback. This is the documented workaround for Claude Code's always-required `/<plugin>:` prefix; the feature retires when Claude Code [#23589](https://github.com/anthropics/claude-code/issues/23589) lands.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Schemes module + CLI helpers (install + uninstall + tests) | Not started |
| 2 | Skills + plugin integration (install / uninstall / install-skill nudge) | Not started |
| 3 | Documentation + dogfood | Not started |

## Key Links

- Branch: `feature/command-shortcuts`
- Worktree: `/Users/orion/work/deskwork-command-shortcuts`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Design spec: `../../../superpowers/specs/2026-05-11-command-shortcuts-design.md`
- Parent Issue: (to be filed by `/dw-lifecycle:issues`)

## Upstream references

- [anthropics/claude-code#15882](https://github.com/anthropics/claude-code/issues/15882) — plugin commands are always namespaced (doc contradiction)
- [anthropics/claude-code#23589](https://github.com/anthropics/claude-code/issues/23589) — feature request: shorthand aliases for plugin commands (this feature retires when this lands)
