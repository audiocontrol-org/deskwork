# stack-control

Provider-agnostic **control plane** for spec-driven development, built as a plugin for [Claude Code](https://claude.com/claude-code). It takes a dependency-annotated spec from an authoring provider (today: GitHub [Spec Kit](https://github.com/github/spec-kit)) and both **governs** it (cross-model audit-barrage + finding lift, firing automatically after execution) and **runs** it — branching only on capabilities, never on which tool authored or executed the plan.

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

## Governance extension

`stack-control` ships the **deskwork Governance** Spec Kit extension at [`spec-kit/deskwork-governance/`](./spec-kit/deskwork-governance/) (rehomed from `dw-lifecycle`). Installed into a project's `.specify/extensions/`, it registers an `after_implement` hook that automatically gathers the implemented diff, fires deskwork's cross-model `audit-barrage`, and lifts findings into the feature's `audit-log.md` — branching only on the diff, never on provider identity. If a dependency (`dw-lifecycle`, `jq`) is absent it fails loudly; it never silently skips. See its [README](./spec-kit/deskwork-governance/README.md).

## Conventions

- **In-tree TypeScript** run via `tsx` (fat plugin, mirroring `dw-lifecycle`) — not a thin shell over a published package.
- **Strict typing**: no `any` / `as` / `@ts-ignore`; source files under 300–500 lines; tests RED-first against tmp fixture trees (never fs mocks).
- **Lockstep version**: the plugin shares the monorepo's single version line, bumped by `scripts/bump-version.ts`.
- **Enforcement lives in skill bodies + CLI verbs, never in git hooks** — adopters get the discipline by installing the plugin.

## License

GPL-3.0-or-later.
