# dw-lifecycle

Project lifecycle orchestration plugin for [Claude Code](https://claude.com/claude-code). Drives a managed-project feature through the full arc — **define → setup → issues → implement → review/audit → ship → complete** — by composing two canonical Anthropic-shipped plugins (`superpowers` for process disciplines, `feature-dev` for specialist agents) instead of duplicating the practices they embody. The plugin owns the project-management substrate the canonical layer doesn't cover: PRD/workplan/README scaffolding, status-organized docs under `docs/<version>/<status>/<slug>/`, GitHub issue patterns, branch + worktree conventions, session journal lifecycle, and feature-local audit logs.

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
| `review` | Run the three-track audit/review protocol: controller-side verification re-run, spec-compliance review, code-quality review; persist findings in `audit-log.md` with `superpowers:requesting-code-review` and `receiving-code-review` |
| `audit` | Synonym of `review`; same three-track protocol and durable audit-log workflow |

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
| `customize` | Copy a built-in markdown template into `.dw-lifecycle/templates/` for project-local tailoring |
| `teardown` | Remove branch + worktree (infrastructure-only; no opinion on feature status) |
| `help` | Render the lifecycle diagram + current state of active features |

### Audit

| Command | Purpose |
|---|---|
| `doctor` | Audit binding between calendar/journal/docs/issues; opt-in `--fix=<rule>` for repair |

### Shortcuts (opt-in)

| Command | Purpose |
|---|---|
| `install-shortcuts` | Install user-level shim files at `~/.claude/commands/<short>.md` that forward to `/dw-lifecycle:<command>` — three naming schemes (terse / regular / verbose) |
| `uninstall-shortcuts` | Remove the shim files and manifest installed by `install-shortcuts`; drift-checks each shim before deletion |

See [Shortcuts](#shortcuts) below for the schemes, manifest layout, and drift behavior.

Nineteen commands total. Each is a single, composable action — UNIX-style — never a monolithic guided flow. See [`design.md` §3](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md) for the full integration map (per-command Layer 2 / Layer 1 invocations).

## Shortcuts

Claude Code requires plugin commands to be invoked as `/<plugin>:<command>` (e.g. `/dw-lifecycle:implement`). For day-to-day use across 19 commands, the `/dw-lifecycle:` prefix is friction-heavy. The opt-in `install-shortcuts` skill writes user-level shim files at `~/.claude/commands/<short>.md` that forward to the namespaced form, so the operator can type `/dw-implement` (or another scheme they pick) instead.

This is the documented workaround for upstream [anthropics/claude-code#15882](https://github.com/anthropics/claude-code/issues/15882) (plugin commands are always namespaced) and [#23589](https://github.com/anthropics/claude-code/issues/23589) (feature request for first-class shorthand aliases). The shortcuts feature retires when #23589 lands.

### Schemes

`/dw-lifecycle:install-shortcuts` offers three naming schemes — the operator picks one at install time:

| Scheme | Pattern | Example mappings |
|---|---|---|
| **A** | 2-letter `dw<initial>` w/ disambiguation suffixes | `dwi` (implement), `dws` (setup), `dwsh` (ship), `dwss` (session-start), `dwse` (session-end), `dwd` (define), `dwdo` (doctor), `dwc` (customize) |
| **B** | 3-letter `dw-<2-char>` (regular pattern, zero collisions) | `dw-im`, `dw-se`, `dw-sh`, `dw-ss`, `dw-en`, `dw-de`, `dw-do`, `dw-cu` |
| **C** | `dw-<verb>` — **default** | `dw-implement`, `dw-setup`, `dw-ship`, `dw-session-start`, `dw-session-end`, `dw-define`, `dw-doctor`, `dw-customize` |

The trade-off: A is terse but cryptic and needs disambiguation suffixes; B is regular but still abbreviated; C preserves discoverability at the cost of verbosity. The CLI's default is C; operator overrides with `--scheme=A` or `--scheme=B`.

### Install / uninstall

```
dw-lifecycle install-shortcuts --scheme=<A|B|C> [--force] [--dry-run] [--rename <prefix>] [--replace]
dw-lifecycle uninstall-shortcuts [--force-uninstall] [--dry-run]
```

The skill flow (`/dw-lifecycle:install-shortcuts`) walks the operator through scheme selection before invoking the CLI. A `--dry-run` preview is always available.

### Manifest

The install writes a manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json` recording: scheme picked, rename prefix (if any), dw-lifecycle plugin version, and the list of shim files. The manifest is what `uninstall-shortcuts` reads to roll back cleanly. The schema is versioned (`version: 1`) so a future schema migration can detect old installs.

**Do not edit the manifest by hand** — it would put uninstall into drift-refusal.

### Drift behavior

`uninstall-shortcuts` compares each shim's on-disk content against the canonical body (`/dw-lifecycle:<command> $ARGUMENTS\n`):

- **Match** — file deleted.
- **Missing** — recorded as a non-fatal note; cleanup proceeds.
- **Modified** — drift detected. The helper lists each drifted path with an `expected:` / `actual:` diff and refuses (exit code 2). The operator runs again with `--force-uninstall` to override, or inspects the modified files first.

The manifest is removed **last**, so a partial failure mid-cleanup leaves the manifest on disk as a recovery breadcrumb; a re-run picks up where the previous run stopped.

### Collision handling

Install-side, the helper refuses to clobber existing files by default:

- **Foreign shim collision** — a file exists at a target shim path that's not part of a prior dw-lifecycle install. Refused with exit 2; operator passes `--force` to overwrite, or `--rename <prefix>` to avoid the collision entirely (e.g. `--rename mt` produces `mti` / `mt-implement` etc.).
- **Prior dw-lifecycle install** — a manifest already exists. Refused with exit 2; operator passes `--replace` to uninstall the prior install before installing the new scheme. `--replace` and `--force` are orthogonal — both can be set if migrating from a prior install AND clobbering an unrelated foreign file in the new scheme's path.

## Hygiene — permanent debt burndown

The `/dw-lifecycle:hygiene*` skill family ships UNIX-style verbs that surface and burn down four classes of permanent debt across a project: stale GitHub issues, workplan TBD/defer markers, parked branches, and stale worktrees. The family is operator-triggered (no continuous polling) and integrates with the natural feature-lifecycle waypoints (session-end captures observations, complete enforces a no-bare-TBDs gate, release closes shipped-in-this-version issues).

### The core verbs

| Skill | Purpose | Mutation? |
|---|---|---|
| `/dw-lifecycle:debt-report` | Cross-source snapshot of three streams (GitHub issues bucketed by label/age/stale-since-last-comment; workplan TBD totals per in-progress feature; parked-branch list with ahead/behind). Markdown + JSON output. | Read-only |
| `/dw-lifecycle:worktree-report` | Fourth-stream read for stale + orphan worktrees. Surfaces nine per-criterion staleness signals (branch fully merged, PR merged/closed, feature-doc complete, no recent commits, branch gone from origin, working tree clean, commits on origin, prunable, orphan-directory) + a verdict + a recommended disposition (keep / dismantle / archive-then-dismantle / prune-orphan / operator-triage). Markdown + JSON output. | Read-only |
| `/dw-lifecycle:triage-issues` | Operator-triggered batched-proposal cycle for stale GitHub issues. Two verbs (`propose` + `apply`); intermediate JSON file as the contract. Four disposition shapes. | gh write |
| `/dw-lifecycle:promote-deferrals` | Scan a target workplan for TBD/defer/follow-up/out-of-scope markers; per-item propose promote-to-issue OR inline-wontfix; the wontfix path enforces a substantive-reason validator (≥40 chars, no gaming phrases). | gh write + workplan edit |
| `/dw-lifecycle:archive-branch` | Preserve a parked branch as `archived/<branch>-<date>` annotated tag, push, delete local + remote. All-or-nothing pre-flight gate. | git write + push |
| `/dw-lifecycle:dismantle-worktrees` | Batched propose+apply for stale + orphan worktrees. Composes with `:archive-branch` via `--archive-first` (per-item decision `archive-then-dismantle`). Safety rails: refuses on current/main worktree, dirty tree without substantive reason, local-only commits without substantive reason, force-push divergence, external path. | git write (+ optional push via archive) |
| `/dw-lifecycle:close-shipped` | Walk four evidence sources (commit-log + audit-log + tooling-feedback + workplan-checkbox) between two release tags; comment + label matching issues with `pending-verification`. Does NOT close — closure waits for operator verification. | gh write |
| Lifecycle wiring | `session-end` captures hygiene observations (commit markers + workplan TBDs + issues filed + stale worktrees) + writes a next-session recommendation block; `session-start` displays the prior recommendation (no fresh scan); `complete` refuses on bare TBDs before merge (with `--skip-tbd-gate --reason "<text>"` override). | Mixed |

### Operational pattern

The skills share NO persistent state. Every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The batched-proposal pattern (introduced by `triage-issues`, reused by `promote-deferrals`) writes a hand-editable intermediate JSON file at `.dw-lifecycle/<skill>/proposals-<timestamp>.json` between the propose and apply verbs — the operator's chat agent fills in dispositions, the apply step validates all-or-nothing then dispatches.

This mechanizes the project's "Just for now is bullshit" rule (see `.claude/rules/agent-discipline.md`): code-side workplan TBD markers AND workplan deferral lines are surfaced; the only valid dispositions are "promote to tracked GitHub issue" (with a back-link in the workplan) or "inline-wontfix with substantive reason ≥40 chars, no gaming phrases."

### Quick reference

```
# Read-only snapshot of all three debt sources:
dw-lifecycle debt-report

# JSON output for downstream consumers:
dw-lifecycle debt-report --json

# Walk the four-source evidence trail for a release tag range:
dw-lifecycle close-shipped --from-tag v0.24.0 --to-tag v0.25.0

# Triage stale issues (batched proposal cycle):
dw-lifecycle triage-issues propose --bucket stale-30d --limit 10
# operator fills in the proposal JSON
dw-lifecycle triage-issues apply --from-file .dw-lifecycle/triage-issues/proposals-*.json

# Promote workplan TBDs to tracked issues OR inline-wontfix:
dw-lifecycle promote-deferrals propose --workplan docs/1.0/001-IN-PROGRESS/<slug>/workplan.md
# operator fills in dispositions + substantive reasons
dw-lifecycle promote-deferrals apply --from-file .dw-lifecycle/promote-deferrals/proposals-*.json

# Archive a parked branch (annotated tag preserved; branch deleted local + remote):
dw-lifecycle archive-branch feature/studio-bridge --rationale "Security gap on auth bridge; tag preserves work."

# Find stale + orphan worktrees:
dw-lifecycle worktree-report

# Dismantle stale worktrees (batched proposal cycle):
dw-lifecycle dismantle-worktrees propose
# operator fills in per-worktree decisions
dw-lifecycle dismantle-worktrees apply --proposal .dw-lifecycle/dismantle-worktrees/proposals-*.json
```

### Cross-references

- Design spec: [`docs/superpowers/specs/2026-05-28-hygiene-design.md`](../../docs/superpowers/specs/2026-05-28-hygiene-design.md).
- Canonical rule the family mechanizes: [`.claude/rules/agent-discipline.md`](../../.claude/rules/agent-discipline.md) § "Just for now is bullshit."
- Issue-closure rule the `close-shipped` verb honors: [`.claude/rules/agent-discipline.md`](../../.claude/rules/agent-discipline.md) § "Issue closure requires verification in a formally-installed release."

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

What stays opinionated and **is not** configurable: the lifecycle stages themselves, the workplan-driven implementation pattern, the stop-at-PR rule in `/dw-lifecycle:ship`, the boundary contract with `superpowers` / `feature-dev`, and the PRD / workplan / README templates. The journal entry template is now the smallest supported customization seam: `/dw-lifecycle:customize templates journal-entry` copies the bundled markdown skeleton into `.dw-lifecycle/templates/journal-entry.md`, and the session skills use the project override automatically.

Broader feature-doc portability remains deferred. The larger `#123` scope — customizable PRD/workplan/README file sets, frontmatter schemas, and alternate status taxonomies — is not part of the journal-entry override slice.

See [`design.md` §4 — Parameterization & config schema](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md) for the full schema, version-sensitive path resolution rules, and the doctor rule list.

## Design and workplan

- Design: [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md)
- Workplan: [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md)
- Feature README: [`docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md`](../../docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md)

## License

GPL-3.0-or-later. See the monorepo `LICENSE`.

---

Status: v0.1.0 in active development. Local smoke test passes; gated on upstream `audiocontrol-org/deskwork#81` for tagged release.
