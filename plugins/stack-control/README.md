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
| `stackctl archive --doc <path> [--apply]` | Move terminal-status items into the sibling `<doc>-archive.md` (with an in-archive provenance ledger). Dry-run by default. |
| `stackctl unarchive --doc <path> --id <id> [--apply]` | Return a named archived item to its live document at its declared-order position. Dry-run by default. |
| `stackctl curate --doc <path> [--apply]` | Ensure a document is well-formed, well-ordered, and properly archived; recognize (never run) a declared reconciliation seam; report ledger↔archive coherence. Dry-run by default. |
| `stackctl inbox capture "<title>" --idea "<text>" [--surfaced/--context/--home] [--apply]` | Capture an out-of-sequence design idea into the governed inbox in one move (status `captured`). Whole-document re-validation; zero-write-on-failure. Dry-run by default. |
| `stackctl inbox promote "<title>" --to <ref> [--apply]` | Triage: record a captured entry's graduation target (status → `promoted`). Records the reference only — does NOT create the target. Dry-run by default. |
| `stackctl inbox drop "<title>" --reason "<why>" [--apply]` | Triage: discard a captured entry with a recorded reason (status → `dropped`). Dry-run by default. |
| `stackctl inbox list [--doc <path>]` | Read-only: list each inbox entry's identifier + status. |

## Document primitives

`archive`, `unarchive`, and `curate` keep a **living document** (a roadmap, an idea inbox, a spec, any markdown that accretes settled material) lean and correct. A document becomes **governable** by declaring a block-level **grammar** — embedded as an HTML comment (`<!-- doc-grammar: … -->`) or referenced from frontmatter (`doc-grammar: <id>`, resolved from a project override or a built-in default). The grammar declares what a Unit is (a reserved heading level, or a table row), its status vocabulary + which statuses are terminal (archivable), its declared ordering relation, and its identifier shape. Identifiers are universally **unique / human-readable / non-ordinal** so identity never couples to position.

Each verb defaults to **dry-run** (report, write nothing); writing requires `--apply`. Every validation failure (ungovernable document, parse failure, identifier violation, unarchive locate failure / collision) fails loud with zero writes. Two built-in grammars ship under [`grammars/`](./grammars/) — a heading-keyed `design-inbox` and a row-keyed `roadmap` — and govern the plugin's own [`DESIGN-INBOX.md`](./DESIGN-INBOX.md) and [`ROADMAP.md`](./ROADMAP.md). The agent-facing skills are `/stack-control:archive`, `/stack-control:unarchive`, and `/stack-control:curate` (each: dry-run → confirm → apply).

## Insight capture

`stackctl inbox` makes out-of-sequence design-idea capture a first-class, **one-move, fail-safe** operation against the governed [`DESIGN-INBOX.md`](./DESIGN-INBOX.md) — the native capability that **replaces the retired interim hand-append convention**. Capture is instant and never requires finishing the current thread (**capture ≠ scope**); triage is a separate deliberate pass (`promote` records a graduation target and reuses the existing creators — it does not create the target; `drop` records a reason). Lean-keeping reuses the generic `curate`/`archive`/`unarchive` verbs. Every mutation re-validates the whole document and is zero-write-on-failure. The agent-facing skill is [`/stack-control:inbox`](./skills/inbox/SKILL.md).

## Governance extension

`stack-control` ships the **deskwork Governance** Spec Kit extension at [`spec-kit/deskwork-governance/`](./spec-kit/deskwork-governance/) (rehomed from `dw-lifecycle`). Installed into a project's `.specify/extensions/`, it registers an `after_implement` hook that automatically gathers the implemented diff, fires deskwork's cross-model `audit-barrage`, and lifts findings into the feature's `audit-log.md` — branching only on the diff, never on provider identity. If a dependency (`dw-lifecycle`, `jq`) is absent it fails loudly; it never silently skips. See its [README](./spec-kit/deskwork-governance/README.md).

## Conventions

- **In-tree TypeScript** run via `tsx` (fat plugin, mirroring `dw-lifecycle`) — not a thin shell over a published package.
- **Strict typing**: no `any` / `as` / `@ts-ignore`; source files under 300–500 lines; tests RED-first against tmp fixture trees (never fs mocks).
- **Lockstep version**: the plugin shares the monorepo's single version line, bumped by `scripts/bump-version.ts`.
- **Enforcement lives in skill bodies + CLI verbs, never in git hooks** — adopters get the discipline by installing the plugin.

## License

GPL-3.0-or-later.
