# stack-control

Provider-agnostic **control plane** for spec-driven development, built as a plugin for [Claude Code](https://claude.com/claude-code). It takes a dependency-annotated spec from an authoring provider (today: GitHub [Spec Kit](https://github.com/github/spec-kit)) and both **governs** it (cross-model audit-barrage + finding lift, firing automatically after execution) and **runs** it — branching only on capabilities, never on which tool authored or executed the plan.

> **Thesis:** *invest heavily in up-front design and tooling; industrialize execution.* The full grounding — hard-won principles + the origin story — is the devlog: [stackcontrol.org/blog](https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/) (and, in-repo for contributors, [`stack-control-thesis.md`](../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-thesis.md)).

`stack-control` (CLI `stackctl`; brand: stackcontrol.org) is the **successor to `dw-lifecycle`**, built alongside it via absorb-then-retire: keepers move out of `dw-lifecycle` into `stack-control` over successive features, and `dw-lifecycle` is retired once `stack-control` reaches parity. It is developed without destabilizing `dw-lifecycle`, which stays in active use until then.

## Status

In development — the **front door** (Feature 1) is the self-hosting bootstrap: author / refine / run a Spec Kit spec in-session, with governance firing automatically after native execution. Per-release notes on the [GitHub releases page](https://github.com/audiocontrol-org/deskwork/releases).

Feature docs live in the deskwork repo:

- [`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/`](../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/) — program README + roadmap
- [`specs/003-stack-control-front-door/`](../../specs/003-stack-control-front-door/) — the front-door feature spec (Spec Kit)

## Install

Install via the deskwork marketplace (pin to a tag from the releases page):

```
/plugin marketplace add https://github.com/audiocontrol-org/deskwork
/plugin install stack-control@deskwork
```

For local development against this workspace, point Claude Code at the plugin directory:

```
claude --plugin-dir plugins/stack-control
```

## Front-door skills

Three skills under the `/stack-control:` namespace, invoked in-session. They are the agent-facing touch points; each calls the deterministic `stackctl` CLI as its primitive and lets the in-session agent do the agent-work (skills-over-CLI, mirroring `dw-lifecycle`).

| Command | Purpose |
|---|---|
| `/stack-control:define` | Author a **new** Spec Kit spec — drive native `/speckit-specify` and the downstream chain in-session. Spec-authoring only (`define` ≠ `setup`; no worktree/docs infra). |
| `/stack-control:extend` | Refine an **existing** spec in place — the edit / iterate / review loop (`/speckit-clarify`, re-`/speckit-plan`, re-`/speckit-tasks`, edits) reusing the spec dir, bringing it to a runnable state. |
| `/stack-control:execute` | Run a runnable spec via **native** `/speckit-implement` in-session; the rehomed governance extension fires automatically on `after_implement` (cross-model audit-barrage + finding lift). The skill gates, drives, and reports — it does not reimplement Spec Kit or manually invoke governance. |

The three together are sufficient to author **and** run the next feature's spec through the front door — the self-hosting proof.

## `stackctl` CLI

The deterministic primitive the skills call (`bin/stackctl <verb>`, in-tree TypeScript run via `tsx`). Every verb is fail-loud — it never fabricates a verdict or papers over a missing artifact.

| Verb | Purpose |
|---|---|
| `stackctl execute-check --spec <dir>` | Gate: is the spec **runnable** for native `/speckit-implement`? Exit 0 (`runnable`) iff `tasks.md` is present; otherwise exit ≠0 naming the missing artifact. Read-only. |
| `stackctl spec-check --spec <dir>` | Report a spec's authoring state as a machine-readable line (`spec=yes plan=yes tasks=no`), exit 0 when it can report; exit ≠0 (fail-loud) on a missing/unknown flag, an absent dir, or a non-directory. Read-only; never gates on artifact *content* (a partial spec is a valid report). |
| `stackctl version` | Print the plugin version (lockstep with the rest of the monorepo). |
| `stackctl setup [--at <dir>] [--apply]` | Scaffold a **stack-control installation** — write `.stack-control/config.yaml` + the governed working files the verbs read through (roadmap, inbox, backlog store, program audit log). Non-destructive + idempotent; dry-run by default; fail-loud on a malformed required file (exit 1) or a config escape/collision (exit 2). |
| `stackctl archive --doc <path> [--apply]` | Move terminal-status items into the sibling `<doc>-archive.md` (with an in-archive provenance ledger). Dry-run by default. |
| `stackctl unarchive --doc <path> --id <id> [--apply]` | Return a named archived item to its live document at its declared-order position. Dry-run by default. |
| `stackctl curate --doc <path> [--apply]` | Ensure a document is well-formed, well-ordered, and properly archived; recognize (never run) a declared reconciliation seam; report ledger↔archive coherence. Dry-run by default. |
| `stackctl inbox capture "<title>" --idea "<text>" [--surfaced/--context/--home] [--apply]` | Capture an out-of-sequence design idea into the governed inbox in one move (status `captured`). Whole-document re-validation; zero-write-on-failure. Dry-run by default. |
| `stackctl inbox promote "<title>" --to <ref> [--apply]` | Triage: record a captured entry's graduation target (status → `promoted`). Records the reference only — does NOT create the target. Dry-run by default. |
| `stackctl inbox drop "<title>" --reason "<why>" [--apply]` | Triage: discard a captured entry with a recorded reason (status → `dropped`). Dry-run by default. |
| `stackctl inbox list [--doc <path>]` | Read-only: list each inbox entry's identifier + status. |
| `stackctl backlog capture "<title>" --type bug\|gap [--ref/--body]` | Capture found work into the slush pile in one move — stamps `agent-found` + `type:<v>` labels, applies **no priority** (capture ≠ scope). Exit 0 prints the id; bad input → exit 2, nothing written; `ROADMAP.md` untouched. |
| `stackctl backlog list` | Read-only: list each item's id + status + type (a tier distinct from `ROADMAP.md`). Triage/inspection delegate to backlog.md's native `board`/`task <id>`/`cleanup`. |
| `stackctl backlog import-github [--apply]` | One-time, idempotent snapshot of open GitHub issues → `imported-issue` items (backlinked `gh-<n>`, labels + body carried). GitHub never mutated; dry-run by default; fail-loud on a missing/unauthenticated `gh`. |
| `stackctl backlog import-slush --feature <slug> [--apply]` | One-time backfill of existing `acknowledged-slush-pile` audit-log entries → `migrated-finding` items; rewrites each to `migrated-to-backlog <task-id>`. HIGHs never migrated; idempotent; dry-run by default. |

## Document primitives

`archive`, `unarchive`, and `curate` keep a **living document** (a roadmap, an idea inbox, a spec, any markdown that accretes settled material) lean and correct. A document becomes **governable** by declaring a block-level **grammar** — embedded as an HTML comment (`<!-- doc-grammar: … -->`) or referenced from frontmatter (`doc-grammar: <id>`, resolved from a project override or a built-in default). The grammar declares what a Unit is (a reserved heading level, or a table row), its status vocabulary + which statuses are terminal (archivable), its declared ordering relation, and its identifier shape. Identifiers are universally **unique / human-readable / non-ordinal** so identity never couples to position.

Each verb defaults to **dry-run** (report, write nothing); writing requires `--apply`. Every validation failure (ungovernable document, parse failure, identifier violation, unarchive locate failure / collision) fails loud with zero writes. Two built-in grammars ship under [`grammars/`](./grammars/) — a heading-keyed `design-inbox` and a row-keyed `roadmap` — and govern the plugin's own [`DESIGN-INBOX.md`](./DESIGN-INBOX.md) and [`ROADMAP.md`](./ROADMAP.md). The agent-facing skills are `/stack-control:archive`, `/stack-control:unarchive`, and `/stack-control:curate` (each: dry-run → confirm → apply).

## Insight capture

`stackctl inbox` makes out-of-sequence design-idea capture a first-class, **one-move, fail-safe** operation against the governed [`DESIGN-INBOX.md`](./DESIGN-INBOX.md) — the native capability that **replaces the retired interim hand-append convention**. Capture is instant and never requires finishing the current thread (**capture ≠ scope**); triage is a separate deliberate pass (`promote` records a graduation target and reuses the existing creators — it does not create the target; `drop` records a reason). Lean-keeping reuses the generic `curate`/`archive`/`unarchive` verbs. Every mutation re-validates the whole document and is zero-write-on-failure. The agent-facing skill is [`/stack-control:inbox`](./skills/inbox/SKILL.md).

> **Which inbox does `--doc` target?** When omitted, the verb resolves the enclosing **stack-control installation** (the nearest ancestor with `.stack-control/config.yaml`) and operates on its configured inbox — run [`/stack-control:setup`](./skills/setup/SKILL.md) once to create one. A missing inbox is auto-scaffolded on first use; outside any installation the verb fails loud directing you to `stackctl setup`. `--doc <path>` (or `STACKCTL_INBOX_DEFAULT_DOC`) overrides resolution for an explicit target. See [Project setup](#project-setup) below.

## Project setup

`stackctl setup` (and the thin [`/stack-control:setup`](./skills/setup/SKILL.md) skill over it) bootstraps a **stack-control installation** into a project — the governed working files the `inbox` / `roadmap` / `backlog` / governance verbs operate on, plus the shared `.stack-control/config.yaml` that binds them. After setup, every governed verb resolves the project-local file with no `--doc`.

The config's **presence marks the installation root**. Verbs resolve their working file by walking **up** from the invocation directory to the nearest `.stack-control/config.yaml` (nearest-wins on nesting), then per file: **per-file override > base dir > audience-split default** (human docs `ROADMAP.md` / `DESIGN-INBOX.md` at the root; internal stores — backlog, program audit log — under `.stack-control/`). Pre-author `paths.*` overrides to record an existing/custom layout; a monorepo holds several installations (`setup --at <pkg>`), each isolated. Setup is non-destructive (never overwrites existing content), idempotent (a complete re-run writes nothing), and fail-loud (a malformed required file is surfaced by name and never clobbered; a location that escapes the root or collides with another key/installation is refused).

```yaml
# .stack-control/config.yaml — presence marks the installation root
version: 1
paths:                              # all optional; each relative-to-root (or absolute within root)
  roadmap: "ROADMAP.md"
  inbox: "DESIGN-INBOX.md"
  backlog: ".stack-control/backlog"
  audit_log: ".stack-control/audit-log.md"
  feature_audit_log_pattern: "specs/{feature}/audit-log.md"
```

This repo dogfoods it: a root [`.stack-control/config.yaml`](../../.stack-control/config.yaml) records the plugin's own scattered layout (`ROADMAP.md` / `DESIGN-INBOX.md` under `plugins/stack-control/`, the program audit log under `docs/1.0/…/`), so the plugin's verbs resolve through the same config an adopter uses — no bundled-copy special case.

## Backlog slush pile — intake: three sources, one pile

`stackctl backlog` is a structured, agent-easy **slush pile** for found-mid-work bugs/gaps, kept deliberately **separate from the curated `ROADMAP.md`** so the roadmap stays a small hand-curated DAG while the backlog absorbs the flood. Unlike `inbox`/`roadmap` (in-tree governed documents), `backlog` is the plugin's first **external-backend adapter** verb: it shells to **backlog.md** (the `backlog` binary, pinned in the plugin), which owns the git-diffable YAML-frontmatter task files under `backlog/` and the native triage surface. The verb stamps project conventions (type, labels, provenance) and delegates triage/inspection to backlog.md's native `board` / `task <id>` / `cleanup` (faithful tool adoption — not re-wrapped). The agent-facing skill is [`/stack-control:backlog`](./skills/backlog/SKILL.md).

**Capture ≠ scope.** A plain `capture` records found work in one move with no priority/triage; classifying, prioritizing, and any promotion to `ROADMAP.md` is a separate, later, operator-driven pass.

**Three intake sources feed one pile** — the single burn-down queue:

1. **Ongoing agent capture** (`backlog capture`) — found work recorded mid-task.
2. **A one-time GitHub-issue snapshot** (`backlog import-github`) — open issues imported read-only and idempotently (GitHub never mutated; backlinked `gh-<n>`).
3. **Audit-barrage parked residuals** — when the convergence dampener parks a MEDIUM/LOW finding, it routes into the pile. `stackctl slush-findings` was **rewired**: a parked flip now becomes a `migrated-finding` backlog item and its audit-log entry records `migrated-to-backlog <task-id>` instead of an indefinitely-held `acknowledged-slush-pile` status — leaving the audit-log a clean open/fixed convergence ledger. The dampener **decision** stays in governance (`slush-remaining.ts`, unchanged); only the destination moved. HIGHs are **never** slushed. `backlog import-slush` backfills existing parked entries. The old **`--burn-down` flag is removed — working the backlog IS the burn-down queue.**

> **Which backlog does the verb target?** When `STACKCTL_BACKLOG_DIR` is unset, the verb resolves the enclosing **stack-control installation** (the nearest ancestor with `.stack-control/config.yaml`) and operates on its configured backlog store — run [`/stack-control:setup`](./skills/setup/SKILL.md) once to create one. A missing store is auto-scaffolded on first use; outside any installation the verb fails loud directing you to `stackctl setup`. `STACKCTL_BACKLOG_DIR` remains the explicit override. See [Project setup](#project-setup) above. The backend (`backlog.md`) is pinned in the plugin's `package.json`; a missing binary fails loud with remediation.

## Scope discovery — per-codebase duplication + drift gates

`stack-control` vendors the **scope-discovery** surface (migrated from `dw-lifecycle`): a jscpd-backed clone detector with a dispositioned baseline, upfront discovery + mid-implementation widening, registry-driven checks, a sub-agent dispatch grammar gate, and install/doctor/export tooling. Every capability is a `stackctl` verb (the vendor-neutral core — runnable in a plain shell, no Claude Code surface required); each `/stack-control:*` skill is a thin adapter.

**Per-codebase by default.** The clone detector and the registry checks scope to the **nearest-enclosing stack-control installation** (the dir whose `.stack-control/config.yaml` encloses your cwd), excluding any nested child-installation subtrees — never the whole repo. So duplication aligns with the same boundary every governed verb resolves against, and a copy vendored from another codebase (e.g. audit-barrage vendored from `dw-lifecycle`) is **not** flagged as a clone of its origin. `--root` overrides the default.

- **Clone detection / disposition:** `check-clones` (per-codebase; `--gate-mode` exits 1 on a NEW group), `dispose-clone`, `batch-dispose`, `refresh-clones-baseline`, `check-disposition-survivor`, `check-refactor-preconditions` (Step 0a/0b refactor preconditions refused when incomplete).
- **Discovery:** `scope-inventory <feature>` (fans the discovery agents → a schema-valid manifest + run evidence; a green run with novel-shape candidates is **not** all-clear), `scope-widen "<complaint>"`, `scope-summary`, `scope-export`.
- **Registry-driven checks (config-activated):** `check-anti-patterns`, `check-adopters`, `check-module-symmetry`, `check-deprecations`. An absent/empty default registry is a clean no-op (zero cost until the project opts in).
- **Dispatch discipline:** `wrap-prompt` / `validate-return` (Searched/Included/Excluded grammar + forbidden-deferral rejection), `validate-scope-discovery` (adversarial gutted-stub self-check).
- **Install / health:** `install-scope-discovery` (seeds empty-but-valid registries + schemas + `config.yaml` under `.stack-control/scope-discovery/`; idempotent, non-destructive), `customize <name>` (project override > plugin default), `scope-doctor` (`--fix`), `install-drift` (advisory, non-blocking — warns when local `.specify` extension copies drift from the plugin source).

**Config contract.** Scope-discovery's registries + dispositioned baseline live under the installation's `.stack-control/scope-discovery/` (`clones.yaml`, `anti-patterns.yaml`, `adopter-manifests.yaml`, `migration-map.yaml`, and a `config.yaml` with its own `schemaVersion`). They are **created lazily-and-announced** by the verb that first needs them (or eagerly by `install-scope-discovery`), never pre-scaffolded into the 009 working-file set. Malformed input fails loud and is never treated as empty. Governance `--mode implement` runs the per-codebase clone step and surfaces NEW intra-codebase duplication alongside the gate verdict.

## Governance extension

`stack-control` ships the **deskwork Governance** Spec Kit extension at [`spec-kit/deskwork-governance/`](./spec-kit/deskwork-governance/) (rehomed from `dw-lifecycle`). Installed into a project's `.specify/extensions/`, it registers an `after_implement` hook that automatically gathers the implemented diff, fires deskwork's cross-model `audit-barrage`, and lifts findings into the feature's `audit-log.md` — branching only on the diff, never on provider identity. If a dependency (`dw-lifecycle`, `jq`) is absent it fails loudly; it never silently skips. See its [README](./spec-kit/deskwork-governance/README.md).

## Conventions

- **In-tree TypeScript** run via `tsx` (fat plugin, mirroring `dw-lifecycle`) — not a thin shell over a published package.
- **Strict typing**: no `any` / `as` / `@ts-ignore`; source files under 300–500 lines; tests RED-first against tmp fixture trees (never fs mocks).
- **Lockstep version**: the plugin shares the monorepo's single version line, bumped by `scripts/bump-version.ts`.
- **Enforcement lives in skill bodies + CLI verbs, never in git hooks** — adopters get the discipline by installing the plugin.

## License

GPL-3.0-or-later.
