---
name: setup
description: "Scaffold a stack-control installation in a project: write .stack-control/config.yaml and the governed working files (ROADMAP.md, DESIGN-INBOX.md, the backlog store, the program audit log) the inbox/roadmap/backlog/governance verbs read through. Non-destructive + idempotent; dry-run first, --apply to write. Fails loud on a malformed required file. Wraps `stackctl setup`."
---

# /stack-control:setup

Bootstrap a **stack-control installation** — the governed working files the `inbox` / `roadmap` / `backlog` / governance verbs operate on — into a project, plus the shared `.stack-control/config.yaml` that binds them. After setup, every governed verb resolves the project-local file with no `--doc`.

This is a thin adapter over the **CLI**, which is the sole capability path (FR-025): `stackctl setup` is runnable by any agent or human in a plain shell, no Claude Code surface required. Prefer the CLI directly when scripting.

```bash
stackctl setup [--at <dir>] [--apply]
```

## What it scaffolds (the managed set)

| Key | Default location | Empty-but-valid skeleton |
|---|---|---|
| `config` | `<root>/.stack-control/config.yaml` | the config itself (`version: 1`) |
| `roadmap` | `<root>/ROADMAP.md` | governed roadmap, zero items |
| `inbox` | `<root>/DESIGN-INBOX.md` | governed design inbox, zero captures |
| `backlog` | `<root>/.stack-control/backlog` | `filesystem_only` backlog store |
| `audit_log` (program) | `<root>/.stack-control/audit-log.md` | audit-log header, zero findings |
| `fleet_knowledge` | `<root>/.stack-control/fleet-knowledge.yaml` | default audit-barrage lane capacities (per-lane `max_prompt_bytes`) |

Per-feature audit logs (`specs/<feature>/audit-log.md`) and operation-products (governance runs, scope-discovery registries) are **not** scaffolded here — the feature lifecycle / the producing verb create them.

## How resolution works

The config's **presence marks the installation root**. Verbs resolve their working file by walking **up** from the invocation directory to the nearest ancestor with a `.stack-control/config.yaml` (nearest-wins on nesting), then per-file: **override > base dir > audience-split default** (human docs at the root; internal stores under `.stack-control/`).

- **Configurable locations.** Pre-author `.stack-control/config.yaml` with `paths.<key>` overrides to record an existing/custom layout; `setup` fills in only what's missing. The setup **report** records every resolved location; the **config** records only per-file *overrides* (an unset `paths.<key>` implies the audience-split default), keeping the common config a one-liner (`version: 1`).
- **Monorepo.** `--at <pkg>` targets a subtree as its own installation. Sibling installations are isolated; a capture in one never reaches another's files.
- **Auto-on-first-use.** A governed verb inside an installation whose working file is missing scaffolds it (announced, contentless) and proceeds — byte-identical to what `setup` would create. A verb **outside** any installation fails loud directing you here (no bundled-copy fallback).

## The discipline (why this exists)

- **Non-destructive + idempotent.** `setup` never overwrites, truncates, or deletes existing content — a pre-existing file is left byte-for-byte untouched. Re-running converges with zero changes when already complete.
- **Dry-run first.** Without `--apply`, `setup` reports what it *would* create and writes nothing. Add `--apply` to perform the writes.
- **Fails loud, never false-clean.** A present-but-malformed required file is surfaced by name with `ready: no` and exit 1 — and is **not** overwritten (drift is your decision to resolve). A configured location that escapes the installation root or collides with another key/installation is refused (exit 2).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Installation is ready (all required items present + well-formed) |
| 1 | A required item is malformed, or a write failed (fail-loud; named) |
| 2 | Usage error: unknown flag, stray positional, ambiguous `--at`, or a config collision/escape refusal |

## Examples

```bash
# fresh project — see the plan, then create
stackctl setup            # dry run; writes nothing
stackctl setup --apply    # scaffold the managed set

# monorepo — set up one package as its own installation
stackctl setup --at packages/foo --apply

# custom locations — pre-author .stack-control/config.yaml with paths.roadmap: docs/ROADMAP.md,
# then setup fills the rest and records the location
stackctl setup --apply
```

> Per `.claude/rules/enforcement-lives-in-skills.md`, the setup discipline lives in this skill body + the `stackctl setup` verb it calls — not in a git hook.
