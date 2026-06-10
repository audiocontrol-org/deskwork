# Implementation Plan: Native session-start / session-end lifecycle skills (session-skills)

**Branch**: `feature/stack-control` (one long-lived program branch) | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-session-skills/spec.md`

## Summary

Deliver two native `stackctl` verbs — `session-start` and `session-end` — plus their thin `/stack-control:{session-start,session-end}` skill adapters, generalizing the two existing hardcoded session ceremonies (the branch-local `.claude/skills/session-{start,end}` and `plugins/dw-lifecycle/skills/session-{start,end}`) into a project-portable pair (constitution Principle II — derive the abstraction from two concrete instances, never one imagined shape).

**session-start** (read-only) orients a fresh agent: it resolves the enclosing installation, then reports the governed roadmap's ready/next + blocked items, the active spec's position in the Spec Kit authoring chain (inferred from which artifacts exist → the next `/speckit-*` step), the latest journal entry, the open **local backlog** items (the `backlog` verb — NOT GitHub issues), and a **branch-staleness advisory** (branch behind its base). It reports and **stops** — no authoring/implementation step fires (the two-session boundary).

**session-end** (capture-only) records the close: it assembles a journal entry (auto-deriving the mechanical/quantitative sections from `git log`, leaving the narrative for the agent), captures tooling friction, runs an advisory clone-snapshot over the configured source scope, surfaces the backlog items that progressed (evidence; operator owns the status transition), and **commits + pushes** the doc changes.

The load-bearing decoupling: **every working file is resolved through the shared installation config + resolution port** that `multi:feature/project-doc-setup` (009) introduces (`src/config/{installation,resolve-paths,config-loader,types}.ts`) — never a hardcoded path, branch name, or feature slug. session-skills **extends** that shared config's managed key set with three new working-file keys it owns — `journal`, `tooling_feedback`, `clone_scope` — exercising 009's explicitly-extensible managed set (009 spec FR-001) as a second real consumer of the port (Principle II).

## Technical Context

**Language/Version**: TypeScript (strict), executed via `tsx` (Node ≥20) — matches the existing plugin.

**Primary Dependencies**:
- Existing in-tree: the shared `src/config/` port from 009 (`resolveInstallation`, `resolvePaths`, config loader, `WorkingFileKey`); the `backlog` backend (008, `src/backlog/backend.ts` — `list()` + `BacklogItem`); the `roadmap` document-model reasoner (006, for ready/blocked); the inbox/journal markdown reads; `src/repo.ts` git helpers (`currentBranch`, `repoRoot`, the `execSync`/`execFileSync` precedent).
- External: none new. The clone-snapshot reuses the existing snapshot capability (today `.dw-lifecycle/scope-discovery/clone-snapshot.sh`; the vendored per-codebase detector arrives with `design:feature/migrate-scope-discovery`).
- No new runtime dependency.

**Storage**: per-installation governed working files on disk (markdown), bound by the one `.stack-control/config.yaml` per installation. session-skills reads roadmap/inbox/journal + the backlog store and writes journal + tooling-friction, all at config-resolved locations. No database.

**Testing**: Vitest. Integration tests build real installation trees in tmp dirs (testing rule: never mock the filesystem), invoke the CLI verbs via the `runCli` spawn helper (`src/__tests__/_run-helpers.ts`) with env seams, init real git repos in the tmp tree for staleness + commit/push assertions (push asserted against a local **bare** remote), and run the real `backlog` binary for the open/progressed surfaces. RED-first per Principle I.

**Target Platform**: `stackctl` CLI (Node), runnable by any agent or human in a plain shell — no Claude Code surface required (FR-018/SC-007).

**Project Type**: single project (the stack-control plugin; CLI tool).

**Performance Goals**: session-start is a handful of local reads + one upward walk + a few `git` calls (sub-second). session-end adds the clone-snapshot (the dominant cost, advisory) + a commit/push. No throughput concern.

**Constraints**: no fallbacks / fail-loud (Principle V) — run-outside-an-installation raises a descriptive error naming the missing installation + directing to `stackctl setup`, never a bundled-copy fallback; the staleness check and the clone-snapshot **degrade cleanly** (skip with an explicit note) when their inputs are undeterminable, but never silently fabricate; session-start is strictly read-only (0 on-disk changes); session-end never auto-transitions a backlog item and never queries GitHub issues; files ≤ 500 lines (Principle VI); no `any`/`as`/`@ts-ignore`.

**Scale/Scope**: a handful of working files per installation; a small number of installations per repo. The journal is append-only and grows by design (the continuity record); session-start reads only the latest entry.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | ✅ | Every unit RED-first: orientation assembly, chain-position inference, branch-staleness (behind/level/undeterminable), journal auto-derive, commit+push, decoupling (resolve-through-config + fail-loud-outside), progressed-backlog surfacing, read-only invariant, and CLI-first plain-shell parity. |
| II. Integration-First, No Speculative Building | ✅ **(load-bearing here)** | The pair is generalized from **two concrete instances** (branch-local + dw-lifecycle session skills), not one imagined shape. It consumes the **real** backlog backend (008), roadmap reasoner (006), and the shared config port (009) — and is the **second real consumer** that proves 009's "extensible managed set" by adding the `journal`/`tooling_feedback`/`clone_scope` keys. No provider port is built. |
| III. Branch on Capabilities, Never Provider Identity | ✅ (mostly N/A) | No provider/plan-source branching. Staleness branches on a capability ("is an upstream set?"), never a vendor. Chain-position is concretely Spec-Kit-based (the provider port is deferred per the constitution); recorded as such, not generalized speculatively. |
| IV. Division of Labor | ✅ | deskwork owns the progress/substrate it writes (journal, tooling-friction, the doc commit). session-start reads `.specify/feature.json` (the authoring tool's pointer) but never writes it; session-end never writes governance state back into a provider artifact. One-way. |
| V. No Fallbacks / fail-loud | ✅ | Run-outside-installation → descriptive error directing to `stackctl setup`, never a bundled-copy fallback (FR-014). Staleness/clone-snapshot degrade cleanly **with an explicit note** when undeterminable (FR-017, edge cases) — a named skip, not a silent fabrication. |
| VI. Strict Typing & Composition | ✅ | Composition: pure orient/chain-position/staleness/journal/progressed-backlog modules injected into the two thin verb handlers. Interface-typed config extension. Each new module well under the 500-line cap. No `any`/`as`/`@ts-ignore`. |
| VII. Commit & Push Early and Often | ✅ | One logical change per commit (RED then GREEN), pushed at task boundaries; no AI attribution. (session-end's own commit+push behavior is itself FR-010.) |
| VIII. Faithful Tool Adoption | ✅ | Authored through the Spec Kit chain in order; chain-position detection reads Spec Kit's own `.specify/feature.json` + artifact set rather than inventing a parallel notion of "active feature." |
| IX. Execution-Backend Pluggability | ✅ (N/A axis) | No execution engine/backends in this feature. |

**Result: PASS — no violations.** Complexity Tracking is empty.

### Dependency-sequencing note (surfaced, not decided)

session-skills' implementation **consumes 009's `src/config/` port** (`resolveInstallation` / `resolvePaths` / config loader / `WorkingFileKey`) and **extends its managed key set** with `journal` / `tooling_feedback` / `clone_scope`. 009 is being developed on a separate branch. Two build-orders are possible: **(a)** 009 lands first → session-skills reuses the port and adds the three keys (cleanest; the two features are then two real consumers — Principle II); **(b)** session-skills implements before 009 merges → it would need the port (or the subset it reads) to exist, which means either waiting on 009 or building the upward-walk resolver + loader here for 009 to reuse. This is an **operator/roadmap sequencing call** (mirrors 009's own scope-coordination note), flagged for `/speckit-tasks` and a `roadmap reconcile` — **not decided in this plan**. The spec is written to the *contract*, so DEFINE is unaffected either way.

### Scope-coordination note (surfaced, not decided)

session-start surfacing **open backlog items** and session-end surfacing **progressed backlog items** are new read-consumers of the backlog backend (008). The backend exposes `list()` + a `status` field but **no built-in "changed-since" API** (code map item 3). "Progressed this session" is therefore derived mechanically from **backlog-item references in the session's git commits** (the same shape as dw-lifecycle deriving issues-touched from `#NNN` refs, retargeted to backlog IDs). Whether the backlog backend should grow a first-class "changed-since" surface is a **008-owned question**, flagged — not built speculatively here.

## Project Structure

### Documentation (this feature)

```text
specs/010-session-skills/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions grounded in the code map + 009 contract + the two concrete instances
├── data-model.md        # Phase 1 — config key extension, orientation report, journal entry, staleness signal, chain-position
├── quickstart.md        # Phase 1 — runnable validation scenarios (all 5 user stories + SC-007 plain-shell)
├── contracts/
│   ├── session-start-cli.md       # Phase 1 — the `stackctl session-start` verb contract
│   ├── session-end-cli.md         # Phase 1 — the `stackctl session-end` verb contract
│   └── session-config-extension.md# Phase 1 — the journal/tooling_feedback/clone_scope keys added to 009's config
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── cli.ts                          # +register `session-start: runSessionStartCli`, `session-end: runSessionEndCli`
│   ├── config/                         # 009's shared port — CONSUMED + EXTENDED here
│   │   └── types.ts                    # MODIFIED — extend WorkingFileKey + ResolvedPaths with journal, toolingFeedback, cloneScope
│   │   # installation.ts / resolve-paths.ts / config-loader.ts CONSUMED as-is (009 deliverables)
│   ├── session/                        # NEW — pure logic, injected into the two verbs
│   │   ├── orient.ts                   # gather orientation inputs (roadmap ready/blocked, latest journal, open backlog)
│   │   ├── chain-position.ts           # infer Spec Kit authoring-chain position from .specify/feature.json + artifacts present → next step
│   │   ├── staleness.ts                # branch-staleness: base = upstream else repo default branch; ahead/behind; skip-clean (FR-016/017)
│   │   ├── journal.ts                  # journal entry assembly: auto-derive mechanical/quantitative from git log; narrative slots (FR-006)
│   │   ├── progressed-backlog.ts       # backlog items referenced in the session's commits (touched/progressed; FR-009)
│   │   └── report.ts                   # render the orientation report
│   ├── subcommands/
│   │   ├── session-start.ts            # NEW — runSessionStartCli (read-only; resolve installation; orient; report; STOP)
│   │   └── session-end.ts              # NEW — runSessionEndCli (resolve installation; journal; friction; clone-snapshot; commit+push)
│   └── repo.ts                         # MODIFIED — add upstream/default-branch + ahead/behind helpers (or a sibling src/session/git.ts)
├── skills/
│   ├── session-start/SKILL.md          # NEW — thin adapter over `stackctl session-start`
│   └── session-end/SKILL.md            # NEW — thin adapter over `stackctl session-end`
└── tests/
    └── session/
        ├── orient.test.ts              # roadmap ready/blocked + latest-journal + open-backlog assembly (US1)
        ├── chain-position.test.ts      # artifact-set → next-step inference, incl. no-active-spec + partial chain (US1, FR-003/005)
        ├── staleness.test.ts           # behind → advisory; level/ahead → none; undeterminable → clean skip (US4, FR-016/017)
        ├── start-readonly.test.ts      # session-start makes 0 on-disk changes (SC-008)
        ├── end-journal.test.ts         # auto-derived mechanical sections + narrative slots + sparse-but-honest entry (US2, FR-006)
        ├── end-commit-push.test.ts     # commits AND pushes to a local bare remote; warns on uncommitted non-doc changes (US2, FR-010/011)
        ├── progressed-backlog.test.ts  # progressed items from commit refs; 0 auto-transitions; no GitHub-issue query (US2, FR-009/SC-006)
        ├── decoupling.test.ts          # both verbs resolve through config at custom locations; fail loud outside any installation (US3, FR-012/014)
        ├── monorepo.test.ts            # nearest-enclosing installation + explicit override; sibling untouched (US3, FR-015)
        └── cli-first.test.ts           # both verbs run in a plain shell with no Claude Code surface (US5, SC-007)
```

**Structure Decision**: Two new thin verb handlers (`session-start.ts`, `session-end.ts`) over a `src/session/` module of pure, separately-tested functions (orient / chain-position / staleness / journal / progressed-backlog / report) — composition over a monolith, each file well under the cap. The decoupling rides entirely on **consuming** 009's `src/config/` port and **extending** its `WorkingFileKey`/`ResolvedPaths` with three new keys — not a parallel config. Git work extends the existing `repo.ts` helper rather than inventing a second git layer. The skills are documentation-thin adapters that quote the CLI verb (the established inbox/backlog skill pattern).

## Complexity Tracking

> No constitution violations — no entries.
