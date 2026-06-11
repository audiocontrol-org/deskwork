# Contract: Convergence loop driver (thread 2; FR-004/005)

Lifts the multi-round loop out of skill-body prose into code. The gate (`spec-governance-gate.ts`) is UNCHANGED — it still emits exactly one OPEN/BLOCKED boolean (004 #432). The driver consumes that boolean and owns iterate/stop + the ceiling.

## `convergence-loop.ts`

### `runConvergenceLoop(args): Promise<ConvergenceOutcome>`

```text
args:
  unit: AuditUnit                 // what is being audited (phase | feature)
  ceiling: number                 // FR-014 per-checkpoint ceiling (default 5)
  runPass: () => Promise<{ gateOpen: boolean }>   // one render→barrage→lift→slush→gate pass
  dispatchFix: () => Promise<void>                // the agent's only in-loop action
  override?: { reason: string }   // recorded operator override (mandatory reason)
```

**Behavior (state machine in data-model.md):**
1. If `override` is present at entry or recorded between rounds → return `{ kind: 'overridden', rounds, reason }`.
2. `rounds = 0`. Loop:
   a. `rounds += 1`; `const { gateOpen } = await runPass()`.
   b. `gateOpen === true` → return `{ kind: 'converged', rounds }`.
   c. `gateOpen === false && rounds >= ceiling` → return `{ kind: 'non-converged', rounds, ceiling }`.
   d. `gateOpen === false && rounds < ceiling` → `await dispatchFix()`; continue.

**Invariants (tested RED-first with a stub `runPass`):**
- Stub returns OPEN on pass 1 → `converged, rounds: 1`, `dispatchFix` never called.
- Stub returns BLOCKED always, ceiling 5 → `non-converged, rounds: 5, ceiling: 5`; `dispatchFix` called exactly 4 times (not on the final ceiling round).
- Stub returns BLOCKED twice then OPEN, ceiling 5 → `converged, rounds: 3`; `dispatchFix` called twice.
- `override` set → `overridden` regardless of gate; `runPass` not required to have run.
- The function ALWAYS resolves to exactly one `ConvergenceOutcome` variant — it never throws past a pass error without a terminal (a `runPass` rejection propagates as a loud failure, not a silent stop).

### Integration: `govern.ts`

`govern.ts` no longer runs a single pass and exits for the agent to re-invoke. It builds `runPass` (the existing `protocol.ts` chain behind a step API), `dispatchFix` (surfaces findings to the agent), and `ceiling`, then calls `runConvergenceLoop` and maps the outcome to its exit:
- `converged` / `overridden` → exit 0 (graduation permitted; the existing govern success message).
- `non-converged` → exit 1 with the recorded non-converged terminal (bounded; not an unbounded grind).

The agent NEVER holds the iterate/stop decision (SC-004). Unattended runs are deterministic in every branch (FR-005); the driver never auto-edits the work.

## What does NOT change

- `spec-governance-gate.ts` — still one OPEN/BLOCKED boolean, exit 0 evaluated / 2 fatal.
- `check-barrage-dampener.ts` — unchanged (the gate's input).
- The slush step ordering (render → barrage → lift → slush → gate) — unchanged; it is one `runPass`.
