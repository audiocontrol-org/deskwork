# Phase 0 Research: Backlog slush-pile surface

All Technical-Context unknowns are resolved (no `NEEDS CLARIFICATION` remained after `/speckit-specify` + `/speckit-clarify`). This document records the decisions that ground the plan in the existing code and the settled design ADR (`docs/superpowers/specs/2026-06-09-backlog-surface-design.md`). Each was verified against source or the hands-on spike, not assumed.

## D1 — Substrate: backlog.md, the one concrete backend

- **Decision**: Back the verb with `backlog.md` (npm package `backlog.md`, bin `backlog`, verified 1.46.0), shelled out via a thin typed adapter. NOT a hand-rolled `SLUSH.md` on the in-tree `document-model` engine, and NOT `beads`.
- **Rationale**: backlog.md keeps the slush as git-diffable markdown in the working tree (thesis: memory loss → durable *written* artifacts), matches the TS/npm stack, and already implements query/board/cleanup/drafts well. A hand-rolled flat governed doc would flood (the very failure mode the pile exists to avoid). `beads` was rejected because its SSOT is an opaque binary Dolt DB (not prose-auditable), it needs a Go/Dolt toolchain, and its `init` is invasive. The decisive `beads` advantage (concurrent-merge safety) was operator-deferred.
- **Alternatives considered**: `beads` (`bd` 1.0.5) and a build-your-own `SLUSH.md` — both driven/evaluated hands-on; full head-to-head in the ADR § "Alternatives considered."

## D2 — External-backend adapter, port deferred (Principle II)

- **Decision**: `src/backlog/backend.ts` is a thin adapter **concretely typed to backlog.md** — NOT a formal backend-agnostic port + registry. The stackctl verb is the stable contract.
- **Rationale**: Constitution Principle II (integration-first, no speculative building) + the program's settled provider-port discipline (build against one real instance; generalize from real instances, not an imagined one). A port is extracted only if a real second backend appears — derived from reality.
- **Alternatives considered**: a backend port/registry up front — rejected as speculative (no second backend exists).

## D3 — Spawn precedent to mirror

- **Decision**: Implement the adapter on `spawnSync` (`node:child_process`), mirroring `src/scope-discovery/audit-barrage/spawn-cli.ts`, with a typed result and **throw-on-missing-binary / throw-on-non-zero-exit** (no fallbacks).
- **Rationale**: there is an established in-tree pattern for shelling out (audit-barrage spawns CLI model families; `src/govern/*` spawns `git`). Reusing the shape keeps the adapter auditable and consistent. Fail-loud is Principle V.
- **Alternatives considered**: a long-lived backlog.md MCP daemon — rejected (ADR § "Why MCP is not used": daemon lifecycle, config drift across worktrees, quiet handshake failures; `--plain`/JSON over a one-shot spawn recovers MCP's typed-output benefit).

## D4 — GitHub import: read-only, idempotent, tsx not shell

- **Decision**: `import-github` reads `gh issue list --json number,title,body,labels,url`, creates one backlog item per open issue, records a `gh-NNN` backlink, carries labels, and **skips issues whose `gh-NNN` already exists** (idempotent). Implemented in `tsx`, dry-run first. GitHub is never written.
- **Rationale**: FR-009..FR-015. tsx (not a shell pipeline) so arbitrary issue-body text — including `#` and markdown control characters — never trips the permission gate or corrupts an item (project rule + FR-015). Read-only honors Division of Labor (Principle IV): GitHub is an external intent source; deskwork never writes governance state back to it.
- **Alternatives considered**: mutating GitHub (closing/labeling imported issues) — explicitly deferred to a trial-outcome decision (spec § Out of Scope).

## D5 — slush-findings rewire: destination only, decision stays

- **Decision**: Keep the dampener DECISION in `src/scope-discovery/promote-findings/slush-remaining.ts` (HIGH-quiet engagement; HIGHs never slushed) **unchanged**. In `src/subcommands/slush-findings.ts`, change only the *destination* of a parked flip: instead of rewriting the audit-log status to `acknowledged-slush-pile-<date>`, create a backlog item (severity → priority, provenance = feature slug + barrage finding id, ref back to the audit-log entry) and record a `migrated-to-backlog <task-id>` disposition in the audit-log. Remove `--burn-down`. Add a one-time `import-slush` backfill for existing `acknowledged-slush-pile-*` entries.
- **Rationale**: FR-016..FR-022. The parked residuals are real bugs/gaps — the same found work the pile exists for; unifying them resolves the `slush-findings` naming collision and gives one burn-down queue. Coupling out only the destination (not the decision) keeps governance authoritative for *when* to park. The audit-log returns to a clean open/fixed ledger.
- **Alternatives considered**: a second slush concept partitioned inside the audit-log (status quo) — rejected (two slush piles); moving the dampener decision out of governance — rejected (governance owns convergence).
- **Source check**: `slush-findings.ts` today calls `slushRemaining(...)` then `atomicWriteFile(auditLogPath, res.newAuditLogText)` and has a `--burn-down`/`burnDownSlush` path. The rewire replaces the write target, not the decision call.

## D6 — Verb surface kept thin (Principle VIII faithfulness)

- **Decision**: v1 verb surface is `capture` · `list` · `import-github` · `import-slush`. Triage and detailed inspection (board view, per-item show, cleanup) are delegated to backlog.md's native commands, not re-wrapped.
- **Rationale**: faithful tool adoption — re-wrapping the backend's own surface would be reimplementation and drift; the verb is an opinionated facade that stamps project conventions (type/labels) and otherwise gets out of the way.
- **Alternatives considered**: wrapping the full backlog.md command set behind stackctl — rejected (Principle VIII; maintenance + drift).

## D7 — backlog.md config + dependency pinning (verified at implementation, RED-first)

- **Decision**: commit `backlog/config.yml` with `filesystem_only: true` (backlog does no git ops of its own — we commit, hooks intact), default statuses, and a `task_prefix`. Pin `backlog.md` in `plugins/stack-control/package.json`. The exact `backlog` subcommand/flag set the adapter invokes (e.g. `task create`, `--plain`) is pinned during implementation against the pinned version, with a RED integration test against the real binary as the source of truth (per the project rule: read the tool's own docs / drive the real binary before quoting commands — not from memory).
- **Rationale**: keeps backlog.md authoritative for its own file format and avoids hardcoding a flag surface from memory. The integration test is the contract check.
- **Alternatives considered**: hand-authoring backlog task-file markdown ourselves — rejected (reimplements the backend; drift on backlog.md format changes).
