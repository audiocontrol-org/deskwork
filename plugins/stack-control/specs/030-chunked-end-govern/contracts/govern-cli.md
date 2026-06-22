# Contract: `stackctl govern` CLI surface (changed)

The observable command surface after the clean break. End-govern over committed work is the **only** govern path; the per-phase surface is removed (FR-017..FR-020).

## Synopsis

```
stackctl govern --mode implement [--diff-base <ref>] [--at <installation-dir>] [--override <reason>]
```

End-govern resolves the feature base anchor, audits the whole committed diff in chunks, fixes + re-audits autonomously, and reconciles once into a graduation decision.

## Flags

| Flag / var | Status | Behavior |
|---|---|---|
| `--mode implement` | KEPT | the implementation-govern mode (spec mode is separate/parked). |
| `--diff-base <ref>` | KEPT | overrides the resolved `governedSha` feature-base anchor (FR-001). |
| `--at <dir>` | KEPT | the installation anchor (FR-010 invariant; default = nearest-enclosing). |
| `--override <reason>` | KEPT | the 029 US4 short-circuit graduation with an attributable reason (a blank reason fails loud). |
| `--phase <id>` | **REMOVED** | passing it is an **unknown-flag usage error** — clean break, no legacy accept (FR-017, US2 Scenario 1). |
| `--checkpoint` / `GOVERN_CHECKPOINT` | **REMOVED (implement mode)** | rejected loud (FATAL) in implement mode — no per-phase checkpoint path exists (FR-017, TASK-125). SPEC mode retains the `--checkpoint` label as a legitimate spec-governance input (FR-029), so the tokens still appear in `src/`. |

## Base anchor resolution (FR-001)

1. If `--diff-base <ref>` (or `GOVERN_DIFF_BASE`) is given → use it.
2. Else reuse the **029 US5 `governedSha`** anchor resolved at feature start.
3. The audit scope is the committed diff `base..HEAD`. A legitimately moved base is a *different audit scope by design* (OQ-4 RESOLVED), not a determinism violation — the same `base..HEAD` endpoints always yield the same chunk set (FR-004).

## Terminal outcomes

The run **never** terminates with `boundary-too-large` (FR-002 — that terminal is deleted from `protocol.ts`). The terminal outcomes are:

| Outcome | Meaning | Exit semantics |
|---|---|---|
| `graduated` (`converged`) | the whole-feature convergence record converged; the graduate gate passes on it alone (FR-018). | success |
| `override-eligible` | residual findings are present but the run completed; operator may `--override`. | non-graduating, actionable |
| `round-cap-surfaced` | a coupling cycle hit the hard max-round cap; the stall is surfaced for operator override — NOT auto-graduated (FR-013). | STOP, surfaced (Principle V) |
| `fix-failure-surfaced` | a fix-subagent failed; its chunk was isolated, others continued, and the failure is surfaced at reconcile (FR-011). | STOP/partial, surfaced |
| `unresolvable-merge-surfaced` | two chunks' fixes could not be merged/serialized; surfaced rather than fabricating a resolution (FR-010). | STOP, surfaced |
| `degraded-fleet-surfaced` | the convergence-determining (final clean) audit round ran on a degraded fleet — a quiet round from fewer lanes is not full cross-model convergence, so it does NOT reconcile to `converged`. Ensure every configured model CLI is reachable & re-govern, or `--override` to accept the weakened audit (AUDIT-20260622-10). | STOP, surfaced |

**No `boundary-too-large` terminal exists** under any of these — SC-001 asserts 0 occurrences across the test matrix.

## Invariants (testable)

- In implement mode, invoking `--phase` or setting `GOVERN_CHECKPOINT` / `--checkpoint` is a clean usage error (no silent accept) — US2 Scenario 1. (Spec mode keeps `--checkpoint`, FR-029.)
- No `phase-checkpoints/*.json` is written by any path — US2 Scenario 3.
- A feature of any committed-diff size reaches a graduation decision (never `boundary-too-large`) — US1 / SC-001.
- The graduate gate consults only the whole-feature convergence record — US2 Scenario 2.
