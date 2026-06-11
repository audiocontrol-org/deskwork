---
slug: audit-barrage-reliability
targetVersion: ""
---

# Audit log — audit-barrage-reliability

## 2026-06-11 — audit-barrage lift (20260611T065138556Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-01 — Reader-side fleet `produced` count uses `existsSync` as a proxy for output, miscounting empty completed lanes and masking degradation at the lift + govern surfaces

Finding-ID: AUDIT-20260611-01 (claude-01 + codex-01; cross-model)
Status:     fixed-bb5cae4b
Severity:   high
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/run-artifacts.ts:283-309 (computeFleetReportFromParsedLanes) vs plugins/stack-control/src/scope-discovery/audit-barrage/types.ts:computeFleetReport/isModelRunConverged

There are two implementations of the fleet `produced` count, and they disagree. The writer-side `computeFleetReport` (types.ts) counts a lane as produced via `isModelRunConverged` → `isModelRunHealthy`, which requires `reportBytes > 0`. The reader-side `computeFleetReportFromParsedLanes` (run-artifacts.ts:294-299) instead counts `terminalState === 'completed' && exitCode === 0 && existsSync(<model>.md)`. For a **text lane** (`output_mode: text` — the shipped `codex` lane), `spawn-cli.ts` eagerly does `createWriteStream(input.stdoutPath)` at spawn time (spawn-cli.ts:177-ish), so an empty file is created on disk even when the child emits zero bytes. A lane that exits 0 with **no output** therefore has an empty `codex.md`: the writer (INDEX, fire-time stderr) reports it NOT produced → degraded; the reader (lift output and the govern loop, both routed through `computeFleetReportFromParsedLanes`) sees the empty file via `existsSync`, counts it produced, and reports the fleet **healthy**.

The blast radius is exactly the silent degradation this feature exists to kill: a model CLI that returns success but emits nothing (auth-expired-but-exit-0, empty success, mid-stream drop that still closes 0) is the canonical "outage masquerading as clean." At the lift and govern synthesis surfaces — the two places FR-007 promises degradation is loud — an empty completed text lane is folded in as a producing lane, can flip `quorumCollapsed` off (`produced` of 2 instead of 1), and suppresses the `⚠ DEGRADED` line. The `report bytes:` value is already rendered into the INDEX (run-artifacts.ts:331) but `parseIndexLaneStates` (run-artifacts.ts:235-282) never parses it. The fix is to parse `- report bytes:` and gate `produced` on `reportBytes > 0` instead of `existsSync`, making the reader agree with the writer.

### AUDIT-20260611-02 — Project-override config comment claims a `fable` / `17 s-per-KB` thoroughness pin that the lane does not apply (it pins `opus` / `13`)

Finding-ID: AUDIT-20260611-02
Status:     fixed-07ae4c6e
Severity:   medium
Surface:    .stack-control/audit-barrage-config.yaml (header comment vs the `claude` lane body)

The migrated project override's header comment states verbatim: *"Thoroughness override (operator choice): pin the claude lane to `model: fable` with `timeout_secs_per_kb: 17` (2026-06-10 calibration)."* The actual `claude` lane immediately below pins `model: opus` and `timeout_secs_per_kb: 13` — i.e. it is identical to the shipped template default, with no fable override applied at all. The comment and the code directly contradict each other in the same file.

This is a config the operator hand-edits, and per `.claude/rules/agent-discipline.md` the operator owns model selection. A reader trusting the comment will believe the more-thorough fable lane is auditing this repo when opus actually runs; a maintainer "reconciling" the file could flip it to fable/17 to match the comment, silently changing which model audits and the timeout budget. Blast radius is operator confusion / wrong ground truth about the audit fleet rather than a runtime crash, hence medium. Fix: either apply the fable/17 pin the comment describes, or correct the comment to state that the override ships the opus/13 default (the template already documents fable as an *available* profile, so the project override comment is the stale half).

### AUDIT-20260611-03 — `rebuild-artifact-from-events.ts` has duplicate `node:fs` import statements

Finding-ID: AUDIT-20260611-03
Status:     fixed-07ae4c6e
Severity:   low
Surface:    plugins/stack-control/scripts/rebuild-artifact-from-events.ts:14-15

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
```

Two separate import statements pull from the same `node:fs` module on consecutive lines; they should be a single statement. Purely hygiene — no behavioral consequence — but it is the kind of dead-weight a linter or a future reader trips over. Collapse to one `import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';`.

### AUDIT-20260611-04 — `probe-readonly-spawn.sh` default-lane assignment builds a single-element array, then is immediately overwritten

Finding-ID: AUDIT-20260611-04
Status:     fixed-07ae4c6e
Severity:   low
Surface:    plugins/stack-control/scripts/probe-readonly-spawn.sh:54-56

```bash
LANES=("${@:-claude codex}")
if [ "$#" -eq 0 ]; then LANES=(claude codex); fi
```

When invoked with no arguments, `"${@:-claude codex}"` expands to the single quoted word `claude codex` — a one-element array `["claude codex"]`, not the intended two lanes. The very next line unconditionally re-assigns `LANES=(claude codex)` correctly for the no-arg case, so the first line is dead/misleading rather than broken. It still reads as if it sets the default, which invites a later edit that deletes the `if` guard and silently regresses to a one-element array (the probe would then run a lane literally named `claude codex` and never test `codex` enforcement). Drop the first assignment's default and rely on the explicit branch, or quote-split correctly.

---

Two notes on things I checked that came back clean, to give you independent signal alongside the other models:

- The kill-vs-close interlocks in `spawn-cli.ts` (timeout disarms watchdog and vice-versa via `killReason` single-latch + `clearTimers`/`watchdog.disarm`, with `close` settling `completed` only when neither kill fired) are correct — the fake-timer tests in `spawn-terminal-states.test.ts` exercise all three orderings and the latch guards (`if (settled || killReason !== null) return`) prevent double-settle.
- `parseIndexLaneStates` does **not** misparse the `## Fleet report` block's `- <lane>: <state> […]` lines as model rows (the heading regex requires `###`, and none of the field regexes match `- <name>:`), so the reader doesn't double-count fleet lanes. I initially suspected the T020 "dampener/models-attempted counts only completed lanes" subclause was unimplemented in the govern diff, but verified it is handled at the substrate: the INDEX now renders `models configured`/`models completed`, the converged predicate requires `terminalState === 'completed'`, and the dampener (`check-barrage-dampener.ts`) counts audit-log lift sections, which the lift now restricts to completed lanes via `includeModels` — so killed lanes contribute no section and are not counted.

### AUDIT-20260611-05 — Enforcement de-duplication can leave enforcement after the prompt

Finding-ID: AUDIT-20260611-05
Status:     fixed-66ec1fed
Severity:   high
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts:421-440

`buildArgs()` skips injection whenever the readonly fragment appears contiguously anywhere in the template. If an adopter config has `{{prompt}} --sandbox read-only` or otherwise places the fragment after the prompt, this code treats enforcement as already present and does not reinsert it before the prompt placeholder, even though the contract says enforcement is injected before the prompt.

Blast radius: for CLIs that stop option parsing at the prompt/subcommand boundary, a custom v2 lane can be marked `enforced` while the effective argv is not mechanically read-only. The duplicate check should only suppress injection when the fragment is already present in an effective position before the prompt placeholder, or config validation should reject fragments after the prompt.
