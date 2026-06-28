# Phase 0 Research: Model-Sized Dispatch (declarative tier layer over adopted superpowers discipline)

Grounded in the superpowers execution-skill investigation (2026-06-28) and the real codebase
(`skills/execute/SKILL.md`, `src/config/`, the audit-barrage model config, the real `tasks.md`
format). The operator's two scoping decisions (adopt superpowers' stance as-is; backend-agnostic
tier discipline, no hard plugin dependency) fix the feature's shape; the decisions below resolve
the remaining design points.

---

## Background: what superpowers provides (the adopted discipline)

`superpowers:subagent-driven-development` (SDD) dispatches a **fresh subagent per task** with
isolated context, TDD, a **task-review loop**, and a **durable progress ledger**
(`.superpowers/sdd/progress.md`). Its **Model Selection** section already advises *"use the
least powerful model that can handle each role"* and *"**always specify the model explicitly when
dispatching a subagent** — an omitted model inherits your session's model."* It is **serial** for
implementers (*"never dispatch multiple implementation subagents in parallel — conflicts"*);
`superpowers:dispatching-parallel-agents` handles genuinely-independent batches concurrently, by
controller judgment.

**What this feature adds**: superpowers leaves model choice to per-session controller judgment.
This feature makes it **declarative** (a `[tier:]` tag per task) and **operator-controlled** (a
tier map in config), and makes the "specify the model explicitly" rule **non-negotiable and
fail-loud** (a missing tier is an error, not a silent session-default). We adopt the *patterns*,
not the plugin (FR-013).

---

## D1 — Adopt the discipline by reproducing the patterns, not by depending on the plugin

**Decision**: `/stack-control:execute`'s SKILL.md reproduces the SDD patterns directly
(fresh per-task subagent, isolated task brief, explicit model, task-review loop, durable
ledger). It does **not** invoke superpowers skills at runtime.

**Rationale**: the operator chose "backend-agnostic tier discipline" — stack-control stays
self-contained and behaves identically whether superpowers is installed (SC-006, FR-013). It also
honors the installation-isolation invariant (no cross-plugin runtime coupling) and Principle IX
(host-agnostic). Faithful Tool Adoption (Principle VIII) is satisfied by adopting the *practice*;
we are not reimplementing a `/speckit-*` step, we are shaping our own skill body after a proven
discipline.

**Alternatives considered**: hard-driving `superpowers:subagent-driven-development` as the
execute backend (rejected by the operator's coupling decision — adds a plugin dependency and
makes behavior depend on whether the adopter installed superpowers).

---

## D2 — Tier declaration syntax in tasks.md

**Decision**: a new inline bracket tag **`[tier:<label>]`** on the task line, consistent with the
existing `[P]` / `[USn]` bracket-tag convention:

```text
- [ ] T001 [P] [US1] [tier:fast] RED test: tier parser extracts the [tier:] tag — in tests/execute/...
- [ ] T002    [US1] [tier:powerful] Implement tier resolution fail-loud paths — in src/execute/tier-resolution.ts
```

The parser reads `[tier:<label>]` from the bracket-tag region of a task line; the label is a free
semantic string validated against the tier map (never a model identifier — Principle III).

**Rationale**: mirrors the format the tasks-template already documents (`[ID] [P?] [Story]
Description`); parses with the same bracket-tag approach; no frontmatter or out-of-line table.

**Alternatives considered**: a per-task metadata sub-line (breaks the one-line task convention);
a `## Tiers` block keyed by id (drifts from the task line, like the prose Dependencies section);
YAML frontmatter (no per-task granularity). All rejected.

---

## D3 — The tier map: where it lives and its shape

**Decision**: extend the existing installation config (`.stack-control/config.yaml`,
`InstallationConfig`) with an additive `tier_map` section (wire snake_case → in-memory camelCase
`tierMap`), parsed by the existing `src/config/config-loader.ts` following the `parsePaths`
precedent (fail-loud, unknown-key rejection, non-empty-string validation):

```yaml
version: 1
tier_map:
  fast: haiku
  balanced: sonnet
  powerful: opus
```

Keys are operator-chosen tier labels; values are model keywords the dispatch surface accepts.

**Rationale**: reuses the one concrete config instance (Principle II) and the existing fail-loud
loader rather than a new store. The audit-barrage `ModelConfig` precedent (*"per-model
configuration is data, not code … capability fields select behavior, never the binary name"*)
is the model: tiers are data that select a model, never hardcoded in the engine (FR-007,
Principle III).

**Seed default (harvested from superpowers SDD)**: SDD's complexity taxonomy — mechanical→cheap,
integration→standard, architecture→most-capable — is the natural default tier vocabulary
(`fast`/`balanced`/`powerful`). It is documented as the recommended starter map, not hardcoded
(the operator may rename/remap freely; FR-007).

**Alternatives considered**: a separate `.stack-control/tier-map.yaml` (needless second store);
model names in tasks.md (violates Principle III).

---

## D4 — Accepted-model set ownership (capability, not vendor)

**Decision**: the set of model values the tier map may map to is the **dispatch surface's**
capability — defined once as a constant (the host subagent mechanism's accepted models, e.g.
`haiku | sonnet | opus | fable` on a Claude Code host) — and the tier-map validator consults it.
A tier-map value outside the set is rejected loudly at config-load/validate time.

**Rationale**: keeps "what models exist" a host capability, not a tier-map concept, so a
different host's model set does not require editing the tier-map parser (Principle III/IX). This
is the only place the host's model vocabulary is named; the rest of the feature is label-only.

**Open consideration (captured)**: the accepted-model constant is host-specific. For the MVP it is
the Claude Code subagent model set. A second host (Codex) contributes its own accepted-model set
behind the same constant seam — built when that concrete instance exists (Principle II), not
designed speculatively now.

---

## D5 — Tier resolution is a CLI verb (the testable pre-dispatch gate)

**Decision**: a single CLI verb `stackctl resolve-tiers --spec <dir>` performs the entire
differentiated computation: parse `tasks.md` `[tier:]` tags, resolve each against the configured
tier map, and emit a per-task `{id, tierLabel, model}` resolution — **or** fail loud listing
**all** tier errors (missing tier, unknown tier, absent/malformed map, out-of-range model),
exiting non-zero, with **no** partial resolution emitted (FR-006). The execute skill runs this
**before** dispatching any subagent and uses its output to set each subagent's explicit model.

**Rationale**: puts 100% of the fail-loud, decidable logic behind a unit-testable CLI boundary
(the TDD floor; Principle I) and keeps the skill body a thin driver. Mirrors the existing
read-only computation verbs (`execute-check`, `spec-check`): strict arg parse, fail-loud, no
silent ignore. The verb is the mechanical interlock the thesis prefers over prose ("specify the
model explicitly" becomes a gate, not advice).

**Alternatives considered**: resolving tiers inline in SKILL.md prose (rejected — moves a
decidable fail-loud gate into the un-testable skill body, the exact gap that lets a silent
session-default slip through); folding resolution into the (non-existent) execute-check verb
(rejected — execute-check is a pure runnability check; tier resolution is a distinct concern).

---

## D6 — What changes in `/stack-control:execute` (clean break from serial /speckit-implement)

**Decision**: the dispatch step is rewritten (clean break — no serial-walk fallback retained):

1. **Gates unchanged**: compass precondition, front-door completeness gate, execute-check
   runnability, front-door `enter`/`exit` bracketing — all still run.
2. **Resolve tiers first**: run `stackctl resolve-tiers --spec <dir>`; on non-zero, surface the
   full error set and STOP (no dispatch) — FR-006 / SC-002.
3. **Dispatch per the adopted discipline**: for each task, dispatch a fresh subagent with an
   isolated task brief and the **explicit model** from the resolution (never an inherited
   default — FR-002/009, SC-001). Apply SDD's task-review loop and durable ledger (FR-010).
   Ordering/parallelism is controller judgment under the adopted stance (FR-012) — independent
   tasks MAY be dispatched in parallel; dependent tasks run in plan order.
4. **Governance unchanged**: `stackctl govern --mode implement` still fires once at the end over
   the committed feature (the non-discretionary `after_implement` hook).

**Rationale**: the spec says "change the default execute behavior"; a retained serial path would
be a deprecation honey-pot (zero-backwards-compat rule). Governance audits the committed diff and
is orthogonal to *how* the work was produced — untouched.

---

## D7 — Durable progress ledger (resume safety, FR-010)

**Decision**: reuse the project's existing session/working-file surface for the progress ledger
rather than invent a new store. (Implementation confirms the exact home in the tasks phase — the
candidates are an execute-scoped ledger under the installation's working-file set, mirroring
SDD's `.superpowers/sdd/progress.md` but anchored in the stack-control installation per the
installation-anchor invariant.) The ledger records, per completed task, the task id, declared
tier, resolved model, and the commit range — so a resumed/compacted run skips completed tasks
(SC-005) and the per-task tier/model is observable afterward (FR-011, SC-004).

**Rationale**: SDD's hard-won lesson — *"controllers that lost their place re-dispatched entire
completed task sequences — the single most expensive failure observed"* — makes the durable
ledger non-optional. Anchoring it in the installation honors the installation-isolation invariant.

**Captured for the tasks phase**: confirm whether the existing `session/working-file` surface
already exposes a suitable ledger path or whether a thin execute-ledger module is needed; either
way it is a small addition, not a new subsystem.

---

## Summary of decisions

| # | Decision |
|---|---|
| D1 | Reproduce SDD patterns in the execute skill; no runtime dependency on the superpowers plugin (FR-013) |
| D2 | New inline `[tier:<label>]` task tag |
| D3 | `tier_map` added to `.stack-control/config.yaml`; superpowers' complexity taxonomy seeds the recommended default map (not hardcoded) |
| D4 | Accepted-model set is a host capability constant the tier-map validator consults (capability, not vendor) |
| D5 | One CLI verb `resolve-tiers` is the testable, fail-loud pre-dispatch gate |
| D6 | Clean break: execute dispatches subagents with explicit per-tier model; gates + governance unchanged; ordering/parallelism is adopted-stance judgment (no mechanical scheduler) |
| D7 | Durable progress ledger (reuse the session/working-file surface) for resume safety; records tier + model |

## Explicitly NOT built (operator decision — adopt superpowers' stance as-is)

Dependency-DAG scheduler · cycle detection · wave engine · ExecutionGraph/RunReport artifacts ·
the `execute-graph`/`execute-report` verbs · a generated Workflow driver script. These belong to
the mechanical parallel+worktree engine, `impl:feature/execution-engine` (specs/002).
