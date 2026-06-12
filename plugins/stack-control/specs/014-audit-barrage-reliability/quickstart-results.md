# Quickstart results — audit-barrage reliability hardening

**Date**: 2026-06-11 | **Build**: feature/audit-protocol @ post-`ea2e014d` | **Runbook**: [quickstart.md](./quickstart.md)

## Unit/integration suite

`npx vitest run` (workspace `@deskwork/plugin-stack-control`): **1234 passed / 0 failed** (pre-feature baseline 1150). Covers config v2 validation + migration refusal (`config-loader-v2.test.ts`), timeout derivation (`timeout-derivation.test.ts`), terminal-state settle paths incl. all four states end-to-end with fixture children (`spawn-terminal-states.test.ts`), watchdog staleness kill + slow-but-alive non-kill (`watchdog.test.ts`, fake timers), stream-result extraction incl. the multi-turn assembly fix (`stream-result-extractor.test.ts`), INDEX rendering + fleet report (`run-artifacts.test.ts`), lift consumption (`lift-terminal-state.test.ts`), and govern loop fleet status (`govern-fleet-status.test.ts`).

## SC-001 — calibration prompt completes (no exit-143) — PASS

Replayed the recorded design-control prompt (69,234 bytes, `design-control` worktree run `20260610T235555837Z`) through the migrated v2 project override, claude lane (opus pin):

- Run dir: `.stack-control/audit-runs/20260611T062953996Z-014-sc001-replay/`
- INDEX rows: `terminal state: completed`, `exit code: 0`, `timed out: no`, `enforcement: enforced`, `liveness: monitored (window 60s)`, `timeout basis: derived (payload 69234 bytes × 13 s/KB, floor 300) → 879 s`
- Duration **726,705 ms** — the run needed **727 s**, i.e. it would have been SIGTERMed at the old guessed 600 s cap (the 17-consecutive-failure scenario); the derived 879 s budget is what let it complete.
- Non-empty `claude.md` (see FR-005 below) + `claude.events.ndjson` (300,418 stdout bytes captured; liveness events ticked throughout).

## SC-002 — hostile write-probe under enforcement — PASS (both enforced lanes)

`plugins/stack-control/scripts/probe-readonly-spawn.sh` (scratch clone with a local bare remote, run through the real `stackctl audit-barrage` spawn path; probe attempts: Write-tool create, `echo >` redirect, `python3` write, `git add/commit/push`):

- **codex / `--sandbox read-only`**: the model ATTEMPTED all four operations; the sandbox blocked each (`operation not permitted`, `PermissionError`, no commit, no push). Zero new files, zero commits, zero remote changes.
- **claude / `--permission-mode plan`**: zero new files, zero commits, zero remote changes across 3 runs. Mechanism evidence: the spawned model reports plan mode blocks all non-read-only tool calls at the harness level (upstream of model disposition — the FR-003 guarantee); the 2026-06-10 spike additionally observed invoked hostile calls being mechanically refused.

Verdicts recorded in the probe script header per T009.

## SC-003 — forced timeout is loud at synthesis — PASS

`plugins/stack-control/scripts/smoke-barrage-reliability.sh` (fixture lanes; `slow` lane `timeout_seconds: 1`): INDEX renders `configured: 2, produced: 1  ⚠ DEGRADED` + `terminal state: timed-out`; fire-time stderr prints the fleet report; `audit-barrage-lift` output reports `slow — timed-out … ZERO findings`, repeats the fleet report, and still lifts the surviving lane's finding. "Did every configured model actually report?" is answerable from lift output alone.

## SC-004 — dead spawn killed within the liveness window — PASS

`spawn-terminal-states.test.ts` › killed-lane: silent child (no output ever), window 1 s, 60 s budget → settled `killed-no-liveness` (NOT timed-out), `stalenessAtKillMs > 1000`, total duration **< 10 s** of the 60 s budget; INDEX records `staleness at kill`.

## SC-005 — slow-but-alive spawn is NOT killed — PASS

`spawn-terminal-states.test.ts` › pulse-lane: child emitting one line per 250 ms with window 1 s → ran to completion, `terminal state: completed`, watchdog never fired. (Real-run corroboration: the SC-001 replay's stream pulse ticked for 727 s under a 60 s window with zero false kills.)

## SC-006 — pre-014 config refused with remediation — PASS

`smoke-barrage-reliability.sh`: a v1-shape override (`name`/`binary`/`args_template`/`timeout_seconds` only) → exit 2; message names the config file, the missing fields (`model`, `readonly_enforcement`, `output_mode`, `liveness_signal`), and the template path; zero spawns launched (no run dir created).

## FR-005 — enforcement does not break the audit — FAIL → FIXED → PASS

First lift of the SC-001 replay extracted **0 findings**: the plan-mode run emitted its 6 finding blocks in a mid-run assistant message; the terminal result event carried only the wrap-up summary (1,507 bytes) — the spec's "audit-output framing distortion" edge case, observed live. Fixed RED-first in `stream-result-extractor.ts` (artifact = assembly of all assistant text blocks when the stream completed; killed streams still produce no artifact), commit `ea2e014d`. After rebuilding the replay artifact from its recorded `events.ndjson` (13,749 bytes via `scripts/rebuild-artifact-from-events.ts`), `audit-barrage-lift` extracts **6 findings cleanly** (`AUDIT-20260611-01..06` dry-run), including read-only probes the model ran inside the audit — enforcement did not degrade audit capability.
