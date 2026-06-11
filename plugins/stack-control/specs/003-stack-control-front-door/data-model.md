# Phase 1 Data Model: stack-control front door

This feature is filesystem- and process-oriented (a plugin + CLI + Spec Kit extension), not data-storage-oriented. The "entities" are the durable artifacts and their states, plus the validation rules the `stackctl` checks enforce. No database; all state lives on disk.

---

## Entities

### 1. stack-control plugin

The new plugin package. Physical manifestation of FR-001.

| Field | Source / value | Validation |
|---|---|---|
| plugin name | `.claude-plugin/plugin.json#name` = `"stack-control"` | non-empty; unique in `marketplace.json` |
| version | `.claude-plugin/plugin.json#version` == `package.json#version` == repo lockstep version | **shares the repo's single version** (all plugins lockstep; swept by `bump-version.ts`; matches `marketplace.json`) — R4 |
| package name | `package.json#name` = `@deskwork/plugin-stack-control` | private workspace package |
| CLI entry | `bin/stackctl` (bash shim → `tsx src/cli.ts`) | executable; resolves `tsx` per dw-lifecycle's resolution order |
| marketplace entry | `.claude-plugin/marketplace.json#plugins[]` with `path: plugins/stack-control` | present; `claude plugin validate` passes |

**Relationships**: hosts → Front-door skills (`define`, `extend`, `execute`); hosts → Governance extension (rehomed).

---

### 2. stackctl (CLI primitive)

The deterministic command surface the skills delegate to. Carries no agent-work.

| Verb | Input | Output / exit | Rule |
|---|---|---|---|
| `execute-check` | `--spec <dir>` | exit 0 if runnable; exit ≠0 + descriptive stderr naming the missing artifact otherwise | fail-loud (FR-008 / Principle V); never "assume runnable" |
| `spec-check` | `--spec <dir>` | reports which Spec Kit artifacts exist (spec/plan/tasks) | read-only; no prose authoring; serves `define` + `extend` |
| `version` | — | prints stack-control version | matches `plugin.json#version` |

Contract: [`contracts/stackctl-cli.md`](./contracts/stackctl-cli.md).

---

### 3. Front door (touch points)

Two Claude Code skills, invoked in-session. The operator-facing surface (FR-005, FR-006, FR-007).

| Touch point | Skill / command | Behavior | Maps to |
|---|---|---|---|
| Spec authoring — new | `/stack-control:define` (`skills/define/SKILL.md`, `commands/define.md`) | author a NEW Spec Kit spec (drive native `/speckit-specify`), in-session | US2, FR-005 |
| Spec authoring — existing | `/stack-control:extend` (`skills/extend/SKILL.md`, `commands/extend.md`) | refine the EXISTING spec in place (`/speckit-clarify`, re-plan, re-tasks), in-session | US2, FR-005 |
| Execution | `/stack-control:execute` (`skills/execute/SKILL.md`, `commands/execute.md`) | `execute-check` → drive native `/speckit-implement` via in-session agent → governance fires on `after_implement` | US1, FR-006/007 |

`define` / `extend` are **spec-authoring verbs only** — infra creation (worktree / docs) is a separate concern, not folded in (mirrors dw-lifecycle's `define` ≠ `setup`).

Contract: [`contracts/front-door-skills.md`](./contracts/front-door-skills.md).

---

### 4. Governance extension (rehomed)

The founding `after_implement` extension, physically moved into stack-control (FR-003/FR-004).

| Field | Value | Validation |
|---|---|---|
| source location | `plugins/stack-control/spec-kit/deskwork-governance/` (moved from `plugins/dw-lifecycle/spec-kit/`) | old path no longer exists; `git mv` preserves history |
| installed copy | `.specify/extensions/deskwork-governance/` (re-installed from new source) | `specify extension list` shows it enabled |
| hook | `extension.yml#hooks.after_implement → speckit.deskwork-governance.govern`, `optional: false` | fires automatically, no manual invocation (SC-002) |
| neutrality | `govern.sh` + command body contain **zero** provider/model/tool authoring-identity strings | grep gate PASS (SC-004 / Principle III) |
| outbound dep | `govern.sh` shells to `dw-lifecycle audit-barrage{,-render,-lift}` on PATH | fails loud if `dw-lifecycle` absent (no silent skip) |

Contract: [`contracts/governance-extension.md`](./contracts/governance-extension.md).

---

### 5. Spec Kit spec (the unit authored and run)

Not owned by stack-control — owned by the operator / native Spec Kit. stack-control reads its state, never corrupts it.

| State | Meaning | Detected by |
|---|---|---|
| authoring | spec.md exists, plan/tasks may be incomplete | `spec-check` |
| runnable | the artifacts native `/speckit-implement` requires are present | `execute-check` exit 0 |
| not-runnable | required artifact missing | `execute-check` exit ≠0 (names the gap) |

**Division of labor (Principle IV)**: stack-control reads spec state for execution/authoring gating; governance writes findings only into `audit-log.md`; neither writes governance state back into the spec.

---

## State transitions (front-door flow)

```text
[spec authoring] --/stack-control:define (new) | :extend (existing)--> [spec runnable]
[spec runnable] --/stack-control:execute--> execute-check(ok)
                                          --> native /speckit-implement (in-session agent)
                                          --> after_implement hook
                                          --> governance: audit-barrage → lift findings → audit-log.md
[spec not-runnable] --/stack-control:execute--> execute-check(fail) --> descriptive error, NO partial run
```

## Validation rules (cross-cutting)

- **VR-1** (FR-008): every "cannot proceed" path emits a descriptive error naming the missing piece; no silent no-op, no faked run.
- **VR-2** (FR-002/SC-003): no file under `plugins/dw-lifecycle/{src,bin,commands,skills,templates}` is modified by this feature (isolation). Only the governance source tree leaves dw-lifecycle.
- **VR-3** (SC-004): neutrality grep over `govern.sh` + command body returns zero authoring-identity matches after the move.
- **VR-4** (SC-001): from a clean install, `stackctl` resolves and the governance extension is registered in 0 manual wiring steps beyond the documented install.
