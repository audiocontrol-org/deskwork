# Contract: Convergence loop driver (thread 2; FR-004/005)

Lifts the multi-round loop out of skill-body prose into code. The gate (`spec-governance-gate.ts`) is UNCHANGED — it still emits exactly one OPEN/BLOCKED boolean (004 #432). The driver consumes that boolean and owns iterate/stop + the ceiling.

## `convergence-loop.ts`

### `runConvergenceLoop(args): Promise<ConvergenceOutcome>`

```text
args:
  ceiling: number                 // caller-supplied. FR-014's per-checkpoint ceiling is 5
                                  // (autonomous-loop target); govern passes 1 (no in-process
                                  // fixer → >1 just re-barrages an unchanged tree).
  runPass: () => Promise<{ gateOpen: boolean }>   // one render→barrage→lift→slush→gate pass
  dispatchFix: () => Promise<void>                // the agent's only in-loop action
```

The driver does NOT take an `AuditUnit` or an `override` (AUDIT-20260612-05): it sequences passes only (findings are recorded by the lift, not the loop), and override is a gate concern (below).

**Behavior (state machine in data-model.md):**
1. `rounds = 0`. Loop:
   a. `rounds += 1`; `const { gateOpen } = await runPass()`.
   b. `gateOpen === true` → return `{ kind: 'converged', rounds }`.
   c. `gateOpen === false && rounds >= ceiling` → return `{ kind: 'non-converged', rounds, ceiling }`.
   d. `gateOpen === false && rounds < ceiling` → `await dispatchFix()`; continue.

**Invariants (tested RED-first with a stub `runPass`):**
- Stub returns OPEN on pass 1 → `converged, rounds: 1`, `dispatchFix` never called.
- Stub returns BLOCKED always, ceiling 5 → `non-converged, rounds: 5, ceiling: 5`; `dispatchFix` called exactly 4 times (not on the final ceiling round).
- Stub returns BLOCKED twice then OPEN, ceiling 5 → `converged, rounds: 3`; `dispatchFix` called twice.
- The function ALWAYS resolves to exactly one `ConvergenceOutcome` variant — it never throws past a pass error without a terminal (a `runPass` rejection propagates as a loud failure, not a silent stop).

### Integration: `govern.ts`

`govern.ts` no longer runs a single pass and exits for the agent to re-invoke. It builds `runPass` (the existing `protocol.ts` chain behind a step API), `dispatchFix` (surfaces findings to the agent), and `ceiling`, then calls `runConvergenceLoop` and maps the outcome to its exit:
- `converged` → exit 0 (graduation permitted; the existing govern success message). An operator `--override` reaches here as `converged`: it is routed through the gate (records the reason + returns OPEN with a barrage record), NOT a driver short-circuit (AUDIT-20260612-05).
- `non-converged` → exit 1 with the recorded non-converged terminal (bounded; not an unbounded grind).

Within one invocation the agent NEVER holds the iterate/stop decision (SC-004); unattended passes are deterministic in every branch (FR-005) and the driver never auto-edits the work. The **cross-round** loop (fix → re-invoke govern) remains agent-paced at the default ceiling 1, since govern applies no in-process fix between rounds (AUDIT-20260612-03/-04).

## What does NOT change

- `spec-governance-gate.ts` — still one OPEN/BLOCKED boolean, exit 0 evaluated / 2 fatal.
- `check-barrage-dampener.ts` — unchanged (the gate's input).
- The slush step ordering (render → barrage → lift → slush → gate) — unchanged; it is one `runPass`.
