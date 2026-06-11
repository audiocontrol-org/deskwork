# Data Model: Audit-Barrage Reliability Hardening

**Feature**: specs/014-audit-barrage-reliability | **Date**: 2026-06-10

Entities map 1:1 onto the spec's Key Entities; field names are normative for the contracts in `contracts/`.

## ModelConfigEntry (config-side lane declaration)

One entry per backend lane in `audit-barrage-config.yaml` (`models:` list).

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | unique per config; existing rule unchanged |
| `binary` | string | yes | PATH-resolvable; existing rule unchanged |
| `model` | string | yes (NEW) | explicit model pin (alias or id); absence → load refusal (FR-001) |
| `args_template` | string | yes | MUST contain `{{model}}` AND exactly one of `{{prompt}}` / `{{prompt-stdin}}` (existing prompt rule unchanged); missing `{{model}}` → load refusal |
| `readonly_enforcement` | string \| `none` | yes (NEW) | CLI fragment injected into argv that makes the spawn mechanically read-only, or the explicit sentinel `none` (lane runs `unenforced`, loudly marked). No default (FR-004/FR-011) |
| `output_mode` | `text` \| `stream-json` | yes (NEW) | selects result extraction + liveness pulse source (research D1/D7) |
| `liveness_signal` | `stdout` \| `stderr` \| `none` | yes (NEW) | which stream carries the pulse; `none` → liveness `unmonitored` (FR-009) |
| `liveness_window_seconds` | int > 0 | when signal ≠ `none` | staleness threshold; default 60 in shipped template |
| `timeout_floor_seconds` | int > 0 | yes\* (NEW) | derivation floor (D5) |
| `timeout_secs_per_kb` | float > 0 | yes\* (NEW) | derivation slope (D5) |
| `timeout_seconds` | int > 0 | optional | explicit operator override; when present it displaces derivation and is recorded as `override` (FR-002) |

\* the pair is required unless `timeout_seconds` override is present; an entry with neither → load refusal. An entry missing any NEW required field is a pre-014 config → migration refusal naming file + fields (FR-011, SC-006).

## TimeoutBasis (per-spawn, recorded)

| Field | Type | Notes |
|---|---|---|
| `mode` | `derived` \| `override` | which path produced the budget |
| `payloadBytes` | int | rendered PROMPT.md size |
| `floorSeconds` / `secsPerKb` | numbers | inputs (derived mode) |
| `effectiveTimeoutSeconds` | int | the budget actually armed |

## ModelRunResult (spawn-side settle record) — extended

Existing fields (`exitCode`, `durationMs`, `stdoutBytes`, `stderrBytes`, `timedOut`, `spawnError`, paths) remain. New:

| Field | Type | Rules |
|---|---|---|
| `terminalState` | `completed` \| `timed-out` \| `spawn-failed` \| `killed-no-liveness` | exactly one, set at settle, single source of downstream truth (FR-006) |
| `enforcement` | `enforced` \| `unenforced` | from the lane's `readonly_enforcement` (`none` → `unenforced`) |
| `liveness` | `monitored` \| `unmonitored` | from `liveness_signal` |
| `timeoutBasis` | TimeoutBasis | always recorded (FR-002) |

### Terminal-state transitions (single-settle)

```
spawn attempt ──spawn error (ENOENT/E2BIG/…)──▶ spawn-failed
   │
   ▶ running
       ├─ close, before any kill ────────────▶ completed
       ├─ staleness > liveness window ──kill──▶ killed-no-liveness
       └─ budget elapsed ───────────────kill──▶ timed-out
```

Race rule: the first settle wins (existing `finish()` single-settle); a `close` arriving before a kill timer fires records `completed`. `timed-out` and `killed-no-liveness` are disjoint by construction — the watchdog disarms once the timeout kill begins, and vice versa.

### Derived predicates

- `isModelRunHealthy` / `isModelRunConverged` (existing): now require `terminalState === 'completed'` (plus existing liftability + `exitCode === 0`).
- Clean-accounting eligibility: ONLY `completed` lanes; any other state is never presented as "no findings" (FR-007).

## LivenessPulse (runtime-only, not persisted per-tick)

| Field | Type | Notes |
|---|---|---|
| `lastActivityAt` | timestamp | updated on every `data` event of the configured signal stream |
| `windowSeconds` | int | from config |
| `checkIntervalMs` | int | watchdog poll cadence (impl detail, ~5000) |

Persisted summary on kill: staleness duration at kill time (in INDEX.md model row).

## RunRecord (run directory) — extended

```
.stack-control/audit-runs/<stamp>-<feature>/
├── PROMPT.md                  # unchanged
├── INDEX.md                   # + per-model terminalState/enforcement/liveness/timeout basis
│                              # + fleet report block (configured N, produced M) when M < N
├── <model>.md                 # unchanged contract (FR-010); ABSENT when terminalState ≠ completed
│                              #   and no result event was produced (never fabricated)
├── <model>.events.ndjson      # NEW (stream-json lanes): full event capture, forensic
├── stderr/<model>.txt         # unchanged
└── tip.sha                    # unchanged
```

## FleetReport (synthesis-level, computed)

| Field | Type | Notes |
|---|---|---|
| `configured` | int | lanes in config |
| `produced` | int | lanes with `terminalState === completed` |
| `perLane` | list of {name, terminalState, enforcement, liveness} | the vocabulary every consumer prints |
| `quorumCollapsed` | boolean | `produced ≤ 1` → cross-model agreement structurally impossible; stated wherever agreement is reported |

Consumers: barrage fire-time summary, INDEX.md, `audit-barrage-lift` output, govern convergence-loop status, dampener accounting (skips non-completed lanes).
