# Implementation Plan: Backlog slush-pile surface

**Branch**: `feature/stack-control` (one long-lived program branch) | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-backlog-surface/spec.md`

## Summary

Add a `stackctl backlog` verb that makes found-work capture a first-class, one-move operation into a structured slush pile kept deliberately separate from the curated `ROADMAP.md`. Unlike `inbox`/`roadmap` (which consume the in-tree `document-model` engine), `backlog` is the plugin's **first external-backend adapter verb**: a thin typed adapter shells out to the `backlog.md` CLI (the one concrete backend; the backend-agnostic port is deferred per Principle II), which owns the markdown task-file format and native triage/inspection (`board`/`show`/`cleanup`). The verb stamps project conventions (type, labels) and delegates. Three intake sources feed one pile: ongoing agent `capture`, a one-time idempotent `import-github` snapshot (GitHub unmutated, each item backlinked `gh-NNN`), and the audit-barrage residual stream — `slush-findings` is rewired so dampener-parked MEDIUM/LOW findings become backlog items (with provenance + a `migrated-to-backlog` disposition recorded in the audit-log) instead of an indefinitely-held `acknowledged-slush-pile` status, plus a one-time `import-slush` backfill. HIGHs are never slushed; the dampener *decision* stays in governance, only the destination moves; `--burn-down` is removed (the backlog IS the burn-down queue).

## Technical Context

**Language/Version**: TypeScript (strict), executed via `tsx` (Node ≥20) — matches the existing plugin.

**Primary Dependencies**:
- **NEW external runtime dependency**: `backlog.md` (npm; bin `backlog`; verified hands-on at 1.46.0 in the 2026-06-09 design session). Pinned in `plugins/stack-control/package.json`. It owns the task-file format and native operations.
- Existing in-tree: the audit-barrage slush engine (`src/scope-discovery/promote-findings/slush-remaining.ts` — the dampener decision, **unchanged**) and `src/subcommands/slush-findings.ts` (destination **rewired**).
- The spawn precedent to mirror: `src/scope-discovery/audit-barrage/spawn-cli.ts` (`spawnSync` from `node:child_process`).
- GitHub access via the existing `gh` CLI (read-only `gh issue list --json …`).

**Storage**: `backlog.md` task files (YAML-frontmatter markdown, one per item) under a repo-root `backlog/` tree, committed to the working tree (Principle: durable *written* artifacts). `backlog/config.yml` committed (`filesystem_only: true` — backlog performs no git ops of its own; we commit, hooks intact). Audit-log entries for migrated findings gain a `migrated-to-backlog` disposition.

**Testing**: Vitest. Integration tests spawn the **real** `backlog` binary against tmp-dir fixtures (testing rule: never mock the filesystem; exercise the adapter + verb boundary). Unit tests cover label/type and severity→priority mapping and GitHub-import idempotency. RED-first per Principle I.

**Target Platform**: `stackctl` CLI (Node), local interactive session.

**Project Type**: single project (the stack-control plugin; CLI tool).

**Performance Goals**: capture is a single backend shellout (sub-second). `import-github` is a one-shot batch over the open-issue set (tens — 37 today); `import-slush` over the parked-finding set (tens). No throughput/scale concern.

**Constraints**: no fallbacks / fail-loud (Principle V) — a missing `backlog` or `gh` binary, or a non-zero backend exit, raises a descriptive error naming the dependency + remediation, never a silent skip or empty success; imports are idempotent and dry-run-first; GitHub is never mutated; files ≤ 500 lines (Principle VI); no `any`/`as`/`@ts-ignore`. The GitHub import is implemented in `tsx` (not a shell pipeline) so `#` characters in issue bodies never trip the permission gate or corrupt items (FR-015).

**Scale/Scope**: 37 open issues + the parked-finding set + ongoing captures — well within backlog.md's demonstrated handling. Concurrency/merge-safe IDs are explicitly deferred (spec § Out of Scope).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | ✅ | Every unit is RED-first: backend-adapter, capture, import-github (incl. idempotency + `#`-body), import-slush, and mapping tests are written and seen failing before implementation. Integration tests run the real `backlog` binary. |
| II. Integration-First, No Speculative Building | ✅ **(load-bearing here)** | The adapter is concretely typed to the ONE real backend (backlog.md); the backend-agnostic port/registry is **deferred** until a real second backend exists — exactly Principle II. Spec captured everything; scope was set by explicit operator decisions (the 6-decision ADR), not agent cuts. |
| III. Branch on Capabilities, Never Provider Identity | ✅ (N/A axis) | No provider/plan-source branching. The backlog store is neither the execution engine nor a plan provider; the single-backend adapter is the Principle-II concrete instance, not a vendor branch in the differentiated back half. |
| IV. Division of Labor | ✅ | The backlog is deskwork-owned substrate. GitHub issues are an external intent source: the import is strictly one-way (read-only snapshot); deskwork NEVER writes back to GitHub (FR-010). |
| V. No Fallbacks / fail-loud | ✅ | Missing `backlog`/`gh` binary, non-zero backend exit, empty/blank capture → descriptive error; never a silent no-op, fallback, or empty-success (FR-023/024). |
| VI. Strict Typing & Composition | ✅ | Composition over the adapter; interface-typed inputs; new modules kept under the cap (adapter, verb, github-import, mappings each small). No `any`/`as`/`@ts-ignore`. |
| VII. Commit & Push Early and Often | ✅ | One logical change per commit (RED test, then GREEN impl), pushed at task boundaries; no AI attribution. |
| VIII. Faithful Tool Adoption | ✅ | Two faithfulness layers: authored through the Spec Kit chain in order; and the verb is a thin facade that delegates triage/inspection to backlog.md's native commands rather than re-wrapping them. |
| IX. Execution-Backend Pluggability | ✅ (N/A axis) | No execution engine/backends in this feature. (The backlog *store* adapter is a Principle-II concrete instance, a separate axis from the execution-backend port.) |

**Result: PASS — no violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/008-backlog-surface/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions grounded in the existing code + the ADR
├── data-model.md        # Phase 1 — backlog item shape + mappings + slush migration state
├── quickstart.md        # Phase 1 — runnable validation scenarios (all 4 user stories)
├── contracts/
│   ├── inbox-cli.md      # (pre-existing, 007 — untouched)
│   └── backlog-cli.md    # Phase 1 — the `stackctl backlog` verb contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── cli.ts                          # +register `backlog: runBacklogCli` in SUBCOMMANDS
│   ├── subcommands/
│   │   ├── backlog.ts                  # NEW — runBacklogCli; subactions capture/list/import-github/import-slush; flag validation; dry-run/apply; exit 0/2
│   │   └── slush-findings.ts           # MODIFIED — flip destination rewired to the backlog (via the adapter); records `migrated-to-backlog` in audit-log; `--burn-down` REMOVED
│   ├── backlog/
│   │   ├── backend.ts                  # NEW — thin typed adapter spawning the `backlog` binary (mirrors scope-discovery/audit-barrage/spawn-cli.ts); parses --plain/JSON; throws on missing binary / non-zero exit (Principle V)
│   │   ├── github-import.ts            # NEW — `gh issue list --json …` → one item per open issue; idempotent (skip existing gh-NNN); tsx not shell (FR-015)
│   │   └── mappings.ts                 # NEW — type/label + severity→priority maps (pure, unit-tested)
│   └── scope-discovery/promote-findings/   # slush DECISION (slush-remaining.ts) UNCHANGED; only slush-findings.ts destination rewired
├── skills/backlog/SKILL.md             # NEW — /stack-control:backlog touch point: when to capture, capture≠scope, verb surface
├── backlog/config.yml                  # NEW committed — filesystem_only: true; default statuses; task_prefix
├── package.json                        # +backlog.md pinned dependency
└── tests/backlog/
    ├── fixtures/                       # committed sample backlog + audit-log fixtures
    ├── backend.test.ts                 # RED-first — spawns the REAL backlog binary on a tmp dir
    ├── capture.test.ts                 # one-move capture; ROADMAP untouched; siblings unchanged
    ├── import-github.test.ts           # idempotency, label carry, `#`-in-body, dry-run, GitHub-unmutated
    ├── import-slush.test.ts            # backfill of acknowledged-slush-pile entries; migrated disposition
    └── mappings.test.ts                # type/label + severity→priority
```

**Structure Decision**: One new verb namespace, `stackctl backlog`, with subactions `capture` / `list` / `import-github` / `import-slush`. It is the plugin's first **external-backend adapter** verb — distinct from `inbox`/`roadmap` (in-tree `document-model`) — backed by a thin typed adapter (`backlog/backend.ts`) that shells to the `backlog` binary, mirroring the established `scope-discovery/audit-barrage/spawn-cli.ts` spawn precedent. Triage and detailed inspection are delegated to backlog.md's native `board`/`show`/`cleanup`, not re-wrapped (Principle VIII). The `slush-findings` rewire lands in the same feature (the parked residuals are the same kind of found work the pile exists for).

## Complexity Tracking

> No constitution violations — no entries.
