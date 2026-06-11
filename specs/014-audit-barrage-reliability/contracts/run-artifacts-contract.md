# Contract: barrage run artifacts & terminal-state surfacing

Consumers: `run-artifacts.ts` (writer), `audit-barrage-lift` (reader), govern convergence loop (reader), operators (forensics). Entity semantics in [data-model.md](../data-model.md).

## Run directory layout (delta from v1)

```
.stack-control/audit-runs/<stamp>-<feature>/
├── PROMPT.md                # unchanged
├── INDEX.md                 # EXTENDED — see below
├── <model>.md               # UNCHANGED CONTRACT (FR-010): final per-model markdown report.
│                            # Present IFF the lane produced a final report (stream-json lanes:
│                            # a terminal result event was received; text lanes: stdout non-empty
│                            # at completed settle). NEVER fabricated for killed/failed lanes.
├── <model>.events.ndjson    # NEW — stream-json lanes only: verbatim event capture (forensics,
│                            # liveness post-mortems). Not consumed by lift.
├── stderr/<model>.txt       # unchanged
└── tip.sha                  # unchanged
```

## INDEX.md per-model row — required fields

Existing: exit code, duration, stdout/stderr bytes, paths, timed out. New (FR-002/FR-006):

- `terminal state: completed | timed-out | spawn-failed | killed-no-liveness`
- `enforcement: enforced | unenforced`
- `liveness: monitored (window Ns) | unmonitored`; on a liveness kill: staleness at kill
- `timeout basis: derived (payload N bytes × S s/KB, floor F) → T s` or `override → T s`

## INDEX.md fleet report block

`produced` counts **converged-eligible** lanes (`terminalState === completed` AND `exitCode === 0` AND report artifact present — the `isModelRunConverged` predicate), so a fast non-zero exit (e.g. a CLI-rejected model pin) counts as degradation, not production. When `produced < configured` (FR-007):

```
## Fleet report
- configured: N, produced: M  ⚠ DEGRADED
- <lane>: <terminalState> [<enforcement>, <liveness>]
- quorum: cross-model agreement impossible (produced ≤ 1)   # only when true
```

## Reader obligations (the part that makes degradation loud)

1. **Lift** (`audit-barrage-lift`): a lane with `terminalState ≠ completed` is reported with its state and contributes ZERO findings — it is never folded in as "clean / no findings". Lift output prints each lane's enforcement state **unconditionally** (FR-004 requires the write-unenforced marking at synthesis always, not only on degradation) and repeats the fleet report when degraded.
2. **Govern convergence loop**: round status lines include the fleet report; a `0 HIGH` round computed over a degraded fleet is annotated as degraded; repeated same-lane kills across rounds are visible in loop output, not only in per-run INDEX files (US3 scenario 3).
3. **Dampener / models-attempted accounting**: only `completed` lanes count as attempts (the design-control pollution case).
4. **Fire-time (barrage verb stdout)**: an `unenforced` lane prints a warning at spawn; a degraded fleet prints the fleet report at run end.

## Compatibility

Pre-014 run directories (rows without the new fields) remain readable by forensic tooling but are not re-interpreted; readers require the new fields only for runs produced by the v2 writer (no synthetic backfill — Constitution V).
