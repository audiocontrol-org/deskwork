# Contract: fix-fanout (parallel worktree-isolated fix dispatch)

> **STATUS — DEFERRED (TASK-424).** The autonomous worktree fix-fanout (FR-009) is **not wired**: the end-govern runtime omits `applyFixes` (operator decision 2026-06-22), so the pipeline surfaces `override-eligible` and the **agent-in-the-loop** fixes the findings and re-governs. This contract is the captured design for the deferred backend; the `makeFixFanout` builder + `dispatchFixSubagents`/`mergeFixWorktrees` primitives exist and are tested, but no runtime path injects them yet. Wiring is tracked as **TASK-424**.

Applies findings grouped by chunk via worktree-isolated fix-subagents in parallel, merges back to the feature branch, and surfaces what it cannot resolve. Autonomous (apply + commit), capability-not-vendor (Principle IX), fail-loud (Principle V).

## Input

| Field | Type | Notes |
|---|---|---|
| `findingsByChunk` | `Map<chunkId, Finding[]>` | the round's findings grouped by chunk |
| `concurrencyCap` | `number` | configurable worktree-fix cap (OQ-2; default ≈4); excess queues |
| `featureBranch` | `string` | the branch fixes land on |
| `dispatch` | `CapabilityPort` | the execution-backend port (below) |

## Capability port (Principle IX — no vendor branch)

The port exposes a single capability: **dispatch a fix task** (chunk + findings + worktree path) → a fix result. Concrete backends:

- **in-session sub-agent dispatch** — the host's Agent surface (Claude Code / Codex), or
- **batch CLI shell-out** — a headless backend.

Selection is by **declared capability**, never vendor identity. The engine runs to completion when only one backend kind is available; when no available backend declares the dispatch capability, it **fails loud** (Principle V) — it does not silently skip the fix step. It MUST NOT hard-depend on any vendor's batch/headless CLI mode.

## Behavior

1. **Dispatch** — for each chunk with findings, allocate a git worktree off `featureBranch` and dispatch a fix-subagent **concurrently** (bounded by `concurrencyCap`; excess queues — no unbounded fan-out, Edge case "worktree exhaustion") via the capability port. Fixing is **autonomous**: the subagent applies AND commits its fix in its worktree (Clarification 2026-06-21 — no propose-only step).
2. **Merge** — merge each fix worktree back to `featureBranch`. The coupling-grouped axis keeps cross-chunk file overlap low, so merges mostly stay clean (R4).
3. **Serialize conflicts** — when two chunks' fixes touch a shared file, **serialize** the conflicting pair (apply one, rebase/re-run the other) rather than merge blindly (FR-010, US5 Scenario 2).
4. **Surface unresolvable** — an unresolvable merge is **surfaced to the operator**, not resolved by fabrication (FR-010, US5 Scenario 3 — Principle V).
5. **Isolate failures** — a fix-subagent failure **isolates that chunk**, lets other chunks continue, and is **surfaced at reconcile** (FR-011, US5 Scenario 4).
6. **Lane outage** — degrades that round per existing fleet-degradation behavior; never fabricates a clean result.

## Output

| Field | Type | Notes |
|---|---|---|
| `fixCommits` | `string[]` (sha) | commits landed on `featureBranch` (drive the TouchedSet, R5) |
| `failedChunks` | `string[]` | chunks whose fix-subagent failed (surfaced at reconcile) |
| `unresolvableMerges` | `{ a: string; b: string }[]` | surfaced for operator decision |

## Invariants (testable)

- N disjoint-file chunks ⇒ N fix-subagents run concurrently (capped) in isolated worktrees and merge without conflict (US5 Scenario 1).
- A shared-file pair serializes, not merges blindly (US5 Scenario 2).
- An unresolvable merge surfaces to the operator; no fabricated resolution (US5 Scenario 3 / Principle V).
- A fix-subagent failure isolates its chunk, others continue, the failure reports at reconcile (US5 Scenario 4).
- Backend selection contains zero branches on vendor identity (Principle IX); single-backend availability still runs to completion.
