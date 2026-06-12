# Research: Audit-Barrage Reliability Hardening

**Feature**: specs/014-audit-barrage-reliability | **Date**: 2026-06-10

All unknowns from the Technical Context are resolved below. Primary evidence: the 2026-06-10 model/timeout experiment (instrumented replays of the design-control 69 KB prompt) and direct CLI capability probes run during planning.

## D1 — Liveness signal per backend

**Decision**: per-model config field `output_mode: text | stream-json`. The claude lane moves to `stream-json` (spawn carries `--output-format stream-json --verbose`); its liveness pulse is *any stdout data event*. The codex lane stays `text`; its liveness pulse is *any stderr data event*. A lane whose configured mode offers no measured pulse runs with liveness `unmonitored` (FR-009).

**Rationale** (measured, 2026-06-10):
- claude text mode emits **0 stdout bytes and 0 stderr bytes until completion** on healthy runs (600s+ observed) — there is no liveness signal in text mode; "no stdout = dead" would kill every healthy run.
- claude stream-json emits its first events within seconds of spawn (init/hook events) and `thinking_tokens` events tick continuously on a healthy slow run (measured 60–90 events/min over 15+ min).
- codex `exec` writes continuous progress chatter to stderr (measured ~290 KB stderr per run) — stderr data events are a reliable pulse with no mode change.

**Alternatives considered**:
- `--debug-file <path>` heartbeat (rejected): harness-level log noise (settings loads, init phases — 41 KB on a trivial run), not model progress; requires per-run path templating the args_template has no substitution slot for; keeps stdout clean but adds a second artifact channel for a weaker signal.
- stderr in claude text mode (rejected): measured silent on healthy runs.
- External heartbeat *file* à la audiocontrol (rejected as transport): the orchestrator is the spawn's parent and already owns the stdio streams — in-process last-activity tracking is the same pattern without the file indirection.

## D2 — Watchdog mechanism (borrows audiocontrol e2e pattern)

**Decision**: in-process watchdog inside the spawn wrapper. Track `lastActivityAt` (updated on every stdout/stderr `data` event — the D1 pulse); a repeating staleness timer (check interval ~5 s) compares `now − lastActivityAt` against the lane's `liveness_window_seconds`; on staleness, terminate via the existing SIGTERM → 5 s grace → SIGKILL path and settle the run with terminal state `killed-no-liveness`. A lane with liveness `unmonitored` never arms the timer. Completion racing a kill settles deterministically through the existing single-settle `finish()` — `completed` wins if `close` fires first.

**Rationale**: direct translation of the proven audiocontrol pattern — producer stamps a heartbeat on every event; watchdog kills on staleness (`heartbeat-reporter.ts` writes `{timestamp, event, detail}` per Playwright event; `run-hardware-e2e.sh` polls and kills after 5 s of silence). Our producer events are the stdio data events we already receive; the watchdog collapses into the parent process.

**Source borrowed**: `audiocontrol-work/audiocontrol-editor-ux-refinement/modules/roland-sxx0-editor/test/e2e/reporters/heartbeat-reporter.ts` + `scripts/run-hardware-e2e.sh` (staleness loop). The *shape* (timestamp-on-event + staleness-kill + cleanup) ports; the file transport does not need to.

**Window default**: `liveness_window_seconds: 60` for stream-json claude (measured pulse gap is seconds; 60 s tolerates rate-limit stalls observed in the experiment) and for codex stderr. Operator-overridable per lane.

## D3 — Read-only enforcement per backend (capability snapshot)

**Decision**: new **required** per-model config field `readonly_enforcement` whose value is either the CLI fragment that makes the spawn mechanically read-only, or the explicit sentinel `none`. The loader injects the fragment into the spawn argv; `none` lanes run but are marked `unenforced` at fire time, in run artifacts, and at synthesis (clarified 2026-06-10). The field being *required with no default* makes the choice conscious and makes pre-feature configs fail loud (FR-011, Principle V).

**Per-backend capability findings**:
- **claude**: `--permission-mode plan` — spike-verified 2026-06-10: Write tool refused; bash output-redirection blocked by the security gate; interpreter write held for an approval that never arrives headless; zero files created under hostile probing. The plan-mode framing risk (audit report distorted by plan-flavored system prompt) is real but testable — FR-005 verification replays a recorded prompt under enforcement and lifts the result.
- **codex**: `--sandbox read-only` — documented sandbox policy (`codex exec --help`: `read-only | workspace-write | danger-full-access`). MUST be hostile-probe verified (same probe suite as claude) before the template ships it as `enforced`; verification is a task, not an assumption.
- **gemini**: disabled in the active project config; no equivalent verified. When re-enabled: `readonly_enforcement: none` until probed.

**Alternatives considered**: `--disallowedTools Edit Write …` (rejected: Bash remains an open mutation vector — the incident commit went through `git commit` in Bash); hoping prompts hold (rejected: the incident is the counterexample).

## D4 — Model pinning

**Decision**: new **required** per-model config field `model: <string>` plus a mandatory `{{model}}` placeholder in `args_template`. The loader fails loud when either is absent (FR-001) or when a legacy template (no `{{model}}`, no `model` field) is loaded (FR-011), with a remediation message naming the file and the required addition.

**Shipped defaults** (clarified 2026-06-10): claude lane pins `opus` (alias = the opus class; 586 s on the 69 KB calibration prompt, near-fable quality). fable documented as the thoroughness override. sonnet excluded (operator verdict: off-task + 2226 s); haiku excluded (zero verification depth). codex lane pins its model explicitly via `-m` (concrete id confirmed during implementation against the installed codex CLI).

**Alias vs full id**: pin the *alias* (`opus`), not the dated full id. The spec's requirement is "not floating on the user's ambient default" — an alias pins the class while tracking point releases; a dated id rots (documentation rule: no rot-prone specifics).

## D5 — Timeout derivation

**Decision**: replace guessed `timeout_seconds` with per-model calibration fields:

```
timeout_floor_seconds:  <int># minimum budget regardless of payload
timeout_secs_per_kb:    <float># payload-proportional budget
```

Effective timeout = `max(floor, ceil(secs_per_kb × payload_kb))` where payload = rendered PROMPT.md bytes (known pre-spawn). The basis (model, payload bytes, both inputs, computed value, and whether an explicit `timeout_seconds` override displaced it) is recorded in INDEX.md (FR-002). Explicit `timeout_seconds` remains legal as an operator override, recorded as `override`.

**Calibration from the 2026-06-10 measurements** (69 KB payload, includes ~1.5× safety margin over the observed wall time):

| Lane | Observed | secs_per_kb (with margin) | floor |
|---|---|---|---|
| claude/opus | 586 s | 13 | 300 |
| claude/fable (override profile) | 669–750 s | 17 | 300 |
| codex | 123–290 s | 7 | 300 |

Extrapolation beyond the calibration point is linear by design (Edge case: "payload larger than any measured calibration point — extrapolate, never silently truncate"). The numbers are template defaults; projects tune per lane.

## D6 — Terminal-state model & downstream consumption

**Decision**: `ModelRunResult` gains a single derived `terminalState: 'completed' | 'timed-out' | 'spawn-failed' | 'killed-no-liveness'` (FR-006), plus `enforcement: 'enforced' | 'unenforced'`, `liveness: 'monitored' | 'unmonitored'`, and the `timeoutBasis` record. `isModelRunConverged` / clean-accounting predicates require `terminalState === 'completed'`. The lift verb and the govern convergence loop render a **fleet report** line (`configured N, produced M`, per-model states) whenever `M < N`, and a non-completed model's empty output is never presented as a clean run (FR-007). Quorum collapse (M = 1) is stated explicitly where cross-model agreement is reported.

**Rationale**: today the only signals are `exitCode`/`timedOut` in INDEX.md — the synthesis layer reads none of it (the 17-round silent degradation). One enum, derived at settle time, gives every consumer the same vocabulary.

## D7 — stream-json result extraction (artifact contract survival)

**Decision**: a stream-result extractor consumes the claude lane's stdout NDJSON incrementally: every line is appended to `stderr/`-sibling forensic capture `<model>.events.ndjson`; at settle, the terminal `result` event's `result` text is written as `<model>.md` — byte-for-byte the artifact lift already consumes (FR-010). A stream that ends without a `result` event (killed, timed out) leaves `<model>.md` absent and the terminal state explains why; no partial fabrication (Principle V).

**Alternatives considered**: teaching lift to read NDJSON (rejected: spreads the wire format into every consumer; FR-010 pins the artifact contract precisely so consumers don't change).

## D8 — Config migration posture

**Decision**: config-loader version-detects by shape: an entry missing `model`/`readonly_enforcement`/derivation fields is a pre-014 config → load refuses with a migration message naming the file, the missing fields, and the template to copy from (FR-011, SC-006). No silent compatibility window. The plugin template and this repo's two project overrides (`.stack-control/audit-barrage-config.yaml`, `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` — the latter only if/when dw-lifecycle adopts; see isolation note) are updated in the same change.

**Isolation note (succession rule)**: all changes land in `plugins/stack-control/`. The dw-lifecycle barrage copy is untouched; its config keeps working against its own loader.
