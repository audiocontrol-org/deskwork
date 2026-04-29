# dw-lifecycle

Project lifecycle orchestration plugin for [Claude Code](https://claude.com/claude-code). Drives a managed-project feature through the full arc — **define → setup → issues → implement → review → ship → complete** — by composing two canonical Anthropic-shipped plugins (`superpowers` for process disciplines, `feature-dev` for specialist agents) instead of duplicating the practices they embody. The plugin owns the project-management substrate the canonical layer doesn't cover: PRD/workplan/README scaffolding, status-organized docs under `docs/<version>/<status>/<slug>/`, GitHub issue patterns, branch + worktree conventions, and session journal lifecycle.

## Status

Under development. v0.1.0 is not yet tagged. Local smoke test passes; tagged release is gated on upstream `audiocontrol-org/deskwork#81`.

Design and workplan live in the deskwork repo:

- [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md)
- [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md)
- [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md)

## Install

Install via the deskwork marketplace:

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install dw-lifecycle@deskwork
```

For local development against this workspace, point Claude Code at the plugin directory:

```
claude --plugin-dir plugins/dw-lifecycle
```

## Peer plugins

`dw-lifecycle` is a thin orchestration layer over two canonical plugins. Install both alongside it:

| Plugin | Posture | Effect if missing |
|---|---|---|
| `superpowers` | **Required** | Skills exit on first invocation with install instructions. Lifecycle skills delegate brainstorming, plan-writing, TDD, verification, code-review request/receipt, and worktree management to it. |
| `feature-dev` | **Recommended** | Skills run, but agent-dispatch steps (`code-explorer`, `code-architect`, `code-reviewer`) print a one-line warning and skip. Operator can install or ignore per project. |

Install both from their canonical sources before using `dw-lifecycle` in earnest. `/dw-lifecycle:doctor`'s `peer-plugins` rule detects missing peers and prints the install commands.

See [`design.md` §2 — Architecture](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md) for the dependency posture in full.

## Slash commands

All commands are under the `/dw-lifecycle:` namespace. Grouped by lifecycle stage; descriptions sourced from the integration map in [`design.md` §3](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md).

### Setup

| Command | Purpose |
|---|---|
| `install` | Bootstrap `.dw-lifecycle/config.json`; probe the host project and write a starter config after the operator confirms each detected value |
| `define` | Write a `feature-definition.md` envelope (problem / scope / approach / tasks); invokes `superpowers:brainstorming` for the interview |
| `setup` | Create `docs/<targetVersion>/001-IN-PROGRESS/<slug>/` with PRD / workplan / README; create branch + worktree via `superpowers:using-git-worktrees`; generate workplan via `superpowers:writing-plans` |

### Plan

| Command | Purpose |
|---|---|
| `issues` | Parse the workplan; create parent + per-phase GitHub issues; back-fill issue links into the workplan |
| `extend` | Add phases to an existing PRD/workplan; create new issues for the added phases |

### Build

| Command | Purpose |
|---|---|
| `implement` | Walk workplan tasks, update progress, commit at task boundaries; uses `superpowers:subagent-driven-development`, `dispatching-parallel-agents`, `test-driven-development`; opens with `feature-dev:code-architect` for multi-proposal design and `feature-dev:code-explorer` for orientation |
| `review` | Select scope, dispatch `feature-dev:code-reviewer`, collate findings; uses `superpowers:requesting-code-review` and `receiving-code-review` to integrate without performative agreement |

### Ship

| Command | Purpose |
|---|---|
| `ship` | Verify acceptance criteria, open the PR, **stop at PR creation** (operator owns the merge); uses `superpowers:verification-before-completion` and `finishing-a-development-branch` |
| `complete` | Move docs from `001-IN-PROGRESS/` to `003-COMPLETE/`; update ROADMAP; close issues |

### Operate

| Command | Purpose |
|---|---|
| `pickup` | Read workplan + check issue status + report next action — for resuming a feature mid-stream |
| `session-start` | Bootstrap a session: read workplan, latest journal entry, open issues; report context |
| `session-end` | Append a journal entry, update feature docs, commit documentation changes |
| `teardown` | Remove branch + worktree (infrastructure-only; no opinion on feature status) |
| `help` | Render the lifecycle diagram + current state of active features |

### Audit

| Command | Purpose |
|---|---|
| `doctor` | Audit binding between calendar/journal/docs/issues; opt-in `--fix=<rule>` for repair |

Fifteen commands total. Each is a single, composable action — UNIX-style — never a monolithic guided flow. See [`design.md` §3](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md) for the full integration map (per-command Layer 2 / Layer 1 invocations).

## Boundary contract

The architectural promise that distinguishes `dw-lifecycle` from a homegrown lifecycle stack: it never reimplements anything the canonical layer ships. Three rules from [`design.md` §2](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md):

1. **Layer 3 never reimplements a Layer 2 discipline.** If `superpowers` ships brainstorming, `/dw-lifecycle:define` calls into it; it does not have its own interview flow.
2. **Layer 3 never reimplements a Layer 1 agent.** If `feature-dev` ships `code-explorer`, `/dw-lifecycle:implement` dispatches it; it does not have its own codebase-analysis subroutine.
3. **Layer 3 is free to add** orchestration that no canonical layer covers — PRD scaffolding, status-organized doc moves, GitHub issue tracking, journal lifecycle. Those stay Layer 3 because nothing canonical does them.

The operating principle: **canonical disciplines stay canonical; lifecycle orchestration gets tailored.** Adopters who want a different flavor of brainstorming or code review change `superpowers` / `feature-dev` upstream — not this plugin.

## Architecture

Three layers, top-down dependency direction:

```
LAYER 3   dw-lifecycle    (this plugin; lifecycle orchestration; opinionated; tailored)
            │ requires
            ▼
LAYER 2   superpowers     (process disciplines; canonical)
            │ recommends
            ▼
LAYER 1   feature-dev     (specialist agents: code-explorer, code-architect, code-reviewer)
```

Dependency direction is strictly top-down: Layer 3 depends on Layer 2, which depends on Layer 1. Lower layers do not know Layer 3 exists. See [`design.md` §2](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md) for the full architecture, including the boundary-contract rationale and what each layer owns.

## Configuration

Configuration lives in `.dw-lifecycle/config.json` at the host project root. Written by `/dw-lifecycle:install` after probing the project and confirming detected values with the operator — no silent defaults that get wrong on first install. Validated against a Zod schema in `src/config.types.ts`.

Top-level keys:

| Key | Purpose |
|---|---|
| `docs` | Doc-tree shape: root path, version-aware layout toggle, default target version, known versions, and status directory names (`001-IN-PROGRESS`, `002-WAITING`, `003-COMPLETE`) |
| `branches` | Branch naming — currently just `prefix` (default: `feature/`) |
| `worktrees` | Worktree naming template (default: `<repo>-<slug>`) |
| `journal` | `DEVELOPMENT-NOTES.md` path and on/off toggle for the journal lifecycle |
| `tracking` | Issue-tracker integration; v1 supports `github` only; configurable parent and per-phase labels |
| `session` | Optional project-specific preamble text for `/dw-lifecycle:session-start` and `:session-end` |

What stays opinionated and **is not** configurable: the lifecycle stages themselves, the workplan-driven implementation pattern, the stop-at-PR rule in `/dw-lifecycle:ship`, the boundary contract with `superpowers` / `feature-dev`, the journal entry template (path is configurable; format is not), and the PRD / workplan / README templates. Adopters who want a different shape fork the plugin.

See [`design.md` §4 — Parameterization & config schema](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md) for the full schema, version-sensitive path resolution rules, and the doctor rule list.

## Design and workplan

- Design: [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md)
- Workplan: [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md)
- Feature README: [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md)

## License

GPL-3.0-or-later. See the monorepo `LICENSE`.

---

Status: v0.1.0 in active development. Local smoke test passes; gated on upstream `audiocontrol-org/deskwork#81` for tagged release.
