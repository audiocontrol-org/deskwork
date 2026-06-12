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

## 2026-06-11 — audit-barrage lift (20260611T071045382Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-06 — Config JSON schema for the barrage config is not migrated to v2 and its reference was silently dropped

Finding-ID: AUDIT-20260611-06 (claude-01 + codex-01 + codex-02; cross-model)
Status:     acknowledged-false-premise-20260611
Severity:   high
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts:9-12 (comment) + missing `schema/audit-barrage-config.yaml.schema.json` (not in diff)

The config-loader header comment was rewritten from `Wire format (mirrored by `schema/audit-barrage-config.yaml.schema.json`)` to `Wire format — config grammar v2 (normative contract: specs/.../contracts/barrage-config-schema.md)`. The JSON-schema reference was *removed*, but neither a migration of that schema file to the v2 grammar nor its deletion appears anywhere in this diff. The loader validates manually (no ajv against the schema is shown), so the schema was an external-tooling/documentation artifact.

Blast radius: if `schema/audit-barrage-config.yaml.schema.json` still exists describing the v1 grammar (`name`/`binary`/`args_template`/`timeout_seconds`), it now actively contradicts the v2 grammar the loader enforces. An adopter authoring a config with editor YAML-schema autocomplete, or any CI/tooling validating configs against that schema, would be told the new required fields (`model`, `readonly_enforcement`, `output_mode`, `liveness_signal`, the derivation pair) are *unknown/invalid* and that v1 fields are required — i.e. it would reject the very configs the loader requires, or accept v1 configs the loader refuses. The fix is to migrate the schema JSON to the v2 grammar in lockstep (it's the same wire format the contract md now describes) or delete it and remove the orphaned reference — the migration is a required surface that should have been in this diff.

**Resolution (2026-06-11, false premise verified):** `audit-barrage-config.yaml.schema.json` was NEVER vendored into plugins/stack-control — `find`/`grep` over the plugin and `git log --all` over the path return nothing; the vendoring commit `d003312e` copied dw-lifecycle's config-loader comment but not the schema file, so the reference was dangling from day one. Commit `03dc0ada` removed the dangle and pointed the header at the normative markdown contract. Nothing seeds a barrage schema into adopter projects (`install-scope-discovery` copies only the 7 scope-discovery schemas). The contradiction scenario cannot occur in stack-control; dw-lifecycle's v1 copy remains internally consistent and frozen (succession isolation). No code change.

---

### AUDIT-20260611-07 — `parseIndexLaneStates` silently drops a lane row missing any required field, which can undercount `configured` and mask degradation

Finding-ID: AUDIT-20260611-07
Status:     fixed-d202a7ca
Severity:   medium
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/run-artifacts.ts:251-274 (the `flush` closure in `parseIndexLaneStates`)

`flush()` only pushes a parsed lane when *all* of `exitCode`, `reportBytes`, `terminalState`, `enforcement`, and `liveness` were captured; otherwise the lane is discarded with no signal. The function then returns `lanes.length > 0 ? lanes : null`. Today the v2 writer always renders every one of those rows for every terminal state, so this is latent — but it is a silent fallback, which is exactly the failure mode the project's "fail loud, never fallback" principle targets.

Blast radius: a partially-malformed or partially-future-versioned INDEX (one lane row missing a single field — e.g. a writer change adds a state that doesn't render `report bytes`, or a hand-edited/forensically-rebuilt INDEX) causes that lane to vanish from the parsed list. `computeFleetReportFromParsedLanes` then derives `configured = lanes.length` from the survivors, so a dropped degraded lane *lowers* `configured` until it equals `produced` — the fleet reads **healthy** when it isn't, at the lift and govern surfaces this feature exists to keep honest. This is the same "outage masquerading as governed-clean" shape AUDIT-20260611-01 fixed at the `produced` count, reappearing one level up at the `configured` count. The reader should fail loud (or warn) on a row that has a `### heading` + some v2 rows but is missing a required field, rather than silently omitting the lane; the all-or-nothing `null` return is fine for genuinely pre-014 INDEXes (zero v2 rows), but a *mixed* INDEX should not be treated as "some lanes simply don't exist."

---

### AUDIT-20260611-08 — `rebuild-artifact-from-events.ts` usage comment recommends `npx tsx`, violating the project's tooling convention

Finding-ID: AUDIT-20260611-08
Status:     fixed-9c214fda
Severity:   low
Surface:    plugins/stack-control/scripts/rebuild-artifact-from-events.ts:14

The forensic utility's usage line reads `Usage: npx tsx scripts/rebuild-artifact-from-events.ts <events.ndjson> <out.md>`. Both the work-level and global CLAUDE.md state the convention verbatim: *"Use tsx, not ts-node or npx tsx"* / *"use tsx, not nox tsx."* A new script's documented invocation is the canonical example future readers copy, so shipping `npx tsx` here propagates the discouraged form.

Blast radius: purely convention/hygiene — the command still works — but it's the kind of drift that becomes "the way we run scripts" once copied (the project's own "convention canon" concern). Fix: change the usage comment to `tsx scripts/rebuild-artifact-from-events.ts <events.ndjson> <out.md>`.

---

### AUDIT-20260611-09 — Lift per-lane status line labels a completed-but-not-converged lane (exit ≠ 0) as "completed" with no marker, while the fleet excludes it from `produced`

Finding-ID: AUDIT-20260611-09
Status:     fixed-d202a7ca
Severity:   low
Surface:    plugins/stack-control/src/subcommands/audit-barrage-lift.ts:326-345

The lift prints `lane <name> — <terminalState> [...]` and appends `— contributes ZERO findings (non-completed lane)` only when `terminalState !== 'completed'`. A lane that settled `completed` but with a non-zero exit (the CLI-rejected-model-pin case the spec explicitly calls out — e.g. `codex.md` = `error: unknown model id`, exit 1) prints a bare `lane codex — completed [...]` with no qualifier, yet `computeFleetReportFromParsedLanes` correctly excludes it from `produced` (it requires `exitCode === 0 && reportBytes > 0`). The same lane is also still passed to `includeModels` for extraction (it filters on `terminalState === 'completed'` only), which is consistent with the loose-liftability contract, but the operator-facing line gives no hint the lane was degraded.

Blast radius: clarity only — an operator reading the lift output sees a lane marked "completed" that the fleet line simultaneously reports as not produced (`produced: 1 of 2 ⚠ DEGRADED`), with nothing connecting the two. No incorrect lift or count results; the numbers are right, only the per-lane narration is ambiguous about the completed-vs-converged distinction the rest of the feature is careful to maintain. A one-token annotation on the completed-but-`exitCode !== 0` (or `reportBytes === 0`) case (e.g. `— completed but non-converged (exit 1); not counted as produced`) would make the per-lane line agree with the fleet count.

---

Independent clean signal for the operator to weigh against the other lanes: I specifically checked the four-state settle machine in `spawn-cli.ts` (single-latch `killReason` + `clearTimers`/`watchdog.disarm` making `timed-out` and `killed-no-liveness` disjoint, `close`-first settling `completed`) and find it correct and fully exercised by the fake-timer tests; the post-05 enforcement injection (`buildArgs` only treating a fragment *before* the prompt placeholder as present, benign duplicate after) is correct; the stream-result multi-turn assembly (assemble all assistant texts, dedup only the trailing result duplicate, `null` when no result event) matches its tests including the FR-005 distortion replay; and timeout derivation (`max(floor, ceil(secs_per_kb × payload_kb))`, override displaces, linear extrapolation, fail-loud on an underivable lane) is sound. My findings cluster at the *reader/manifest/doc* seams (schema drift, silent lane-drop, convention, narration), not the spawn core.

### AUDIT-20260611-10 — Hostile read-only probe does not enforce its “must attempt” contract

Finding-ID: AUDIT-20260611-10
Status:     fixed-9c214fda
Severity:   medium
Surface:    plugins/stack-control/scripts/probe-readonly-spawn.sh:113-118,128-147

The probe comment says the model report “must show the four attempts + DONE,” but the script only prints the report and bases PASS solely on repository mutation checks. A lane whose model refuses every hostile action without invoking the harness can still produce zero mutations and pass, which is the vacuous pass the comment says the probe is meant to prevent.

Blast radius is medium because this weakens SC-002 evidence rather than the production spawn path directly. The script should parse the lane artifact for the expected attempt evidence, or at minimum fail when the report artifact is absent or lacks a required completion marker plus attempt-specific text.

## 2026-06-11 — audit-barrage lift (20260611T115700037Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-11 — Govern loop's per-lane fleet line carries the AUDIT-20260611-09 narration gap, unfixed — a `completed`-but-non-converged lane reads "completed" next to "⚠ DEGRADED" with nothing connecting them

Finding-ID: AUDIT-20260611-11 (claude-01 + claude-02 + codex-02; cross-model)
Status:     fixed-504153e4
Severity:   medium
Surface:    plugins/stack-control/src/govern/protocol.ts:140-148 (reportFleetStatus per-lane loop) + plugins/stack-control/src/scope-discovery/audit-barrage/types.ts:FleetLaneStatus

AUDIT-20260611-09 was scoped and fixed only in the lift (`audit-barrage-lift.ts:326-345`), which now annotates a `completed`-but-not-converged lane as `— completed but non-converged (exit N, report bytes M); not counted as produced`. The identical narration gap is still present in the govern loop surface. `reportFleetStatus` iterates `fleet.perLane` and prints `govern:   ${lane.name}: ${lane.terminalState} [${lane.enforcement}, ${lane.liveness}]` (protocol.ts:145-147). For the CLI-rejected-model-pin case the spec explicitly calls out (e.g. `codex.md` = `error: unknown model id`, `exitCode: 1`, `terminalState: 'completed'`), `computeFleetReportFromParsedLanes` correctly excludes it from `produced` (it requires `exitCode === 0 && reportBytes > 0`), so govern prints `govern:   codex: completed [enforced, monitored]` directly above/below `govern: fleet — configured 2, produced 1  ⚠ DEGRADED` — the exact "completed next to degraded with nothing linking them" operator-confusion AUDIT-09 fixed for the lift.

The root cause is structural: `FleetLaneStatus` (types.ts) carries only `name / terminalState / enforcement / liveness` — not `exitCode` or `reportBytes` — so `reportFleetStatus` *cannot* reproduce the lift's annotation even if it wanted to. The lift can annotate because it works from `ParsedIndexLane` (which has `exitCode`/`reportBytes`); govern works from the leaner `FleetLaneStatus`.

Blast radius is clarity-only (LOW), matching AUDIT-09's own rating: the counts are correct, only the per-lane narration is ambiguous. But it is slightly more impactful here than in the lift, because the govern loop status line is precisely the surface FR-007 / US3-scenario-3 designate as where *repeated cross-round same-lane degradation* is supposed to be most visible — and a model whose pin the CLI keeps rejecting every round is the canonical repeated-degradation case. A reasonable fix: add `exitCode`/`reportBytes` to `FleetLaneStatus` (they're already parsed) and apply the lift's annotation logic in `reportFleetStatus`, so the "one vocabulary every consumer prints" goal the feature states actually holds across all four surfaces.

### AUDIT-20260611-12 — Embedded `{{prompt-stdin}}` templates pass validation but leak the literal placeholder into argv

Finding-ID: AUDIT-20260611-12
Status:     fixed-504153e4
Severity:   medium
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts:244-245; plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts:284,455-456

`parseEntry()` accepts any `args_template` that merely contains `{{prompt-stdin}}`, because it uses `argsTemplate.includes(PROMPT_STDIN_PLACEHOLDER)` as the validation rule. `spawnCliAgainstModel()` also switches to stdin delivery on the same substring test. But `buildArgs()` only removes tokens equal to the bare placeholder via `.filter((tok) => tok !== PROMPT_STDIN_PLACEHOLDER)`, so a valid-looking template such as `--input={{prompt-stdin}} --model {{model}}` spawns with stdin connected and still passes the literal `--input={{prompt-stdin}}` argv token to the CLI.

Blast radius is medium: shipped configs use the bare token, but adopter configs can pass validation and then fail at spawn time or invoke a CLI with a bogus input argument. This is exactly the sort of config/load mismatch the v2 grammar is trying to eliminate. A reasonable fix is to either reject embedded `{{prompt-stdin}}` during config loading with a clear “bare token only” error, or make argv assembly strip any token containing the stdin placeholder if that is the intended grammar.

## 2026-06-11 — audit-barrage lift (20260611T121233452Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-13 — Close-handler drops the `signal` argument — an externally-signal-killed child settles `completed`, leaking its partial output into the lift (defeats FR-007 for the external-kill case)

Finding-ID: AUDIT-20260611-13 (claude-01 + codex-01; cross-model)
Status:     fixed-8c7766de
Severity:   high
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts (the `child.on('close', ...)` handler, ~lines 470-485 of the new file)

The new close handler is `child.on('close', (code) => { ... })` — it no longer destructures `signal` (the old code was `(code, signal)` and set `timedOut: timedOut || signal !== null`). `terminalState` is now derived purely from `killReason`:

```ts
const terminalState: TerminalState =
  killReason === 'timeout' ? 'timed-out'
  : killReason === 'liveness' ? 'killed-no-liveness'
  : 'completed';
```

So any child terminated by a signal that the wrapper did NOT initiate — OOM killer, a system/parent `kill`, an out-of-band SIGTERM — arrives with `killReason === null`, `code === null`, and settles **`terminalState: 'completed'`, `exitCode: -1`, `timedOut: false`**. This is precisely the long, memory-heavy run this feature targets (the SC-001 claude lane ran 727 s and captured ~300 KB of stdout); an OOM-kill of such a lane mid-stream is a realistic trigger, not a theoretical one.

The concrete harm is at the lift: `audit-barrage-lift.ts` builds `includeModels` from `lanes.filter((lane) => lane.terminalState === 'completed')`, so an externally-killed lane is treated as completed and its **partial `.md` output is extracted into the audit-log** — exactly the "a killed lane contributes ZERO findings; its partial output is never presented as a clean run" guarantee FR-007 promises, violated for this kill path. `isModelRunHealthy` (`terminalState === 'completed' && reportBytes > 0`) returns true for it, so partial findings flow through. The fleet `produced` count is still correct (`isModelRunConverged` requires `exitCode === 0`, which `-1` fails, so it stays out of `produced` and the run still reads DEGRADED), which is why I rate this medium rather than high — the operator does see the degradation, but partial findings from a killed lane are silently mixed into the log, and `terminalState` is documented in `types.ts` as "the single source of downstream truth (FR-006)" while this case makes it lie. A reasonable fix: restore the `signal` parameter and classify a close with a non-null signal and no `killReason` as a kill (a distinct state, or at minimum `exitCode`-based so it is excluded from `includeModels`), rather than folding it into `completed`.

For independent signal alongside the other lanes: I separately verified and found CLEAN the kill-vs-kill-vs-close interlocks (single-latch `killReason` + `clearTimers`/`watchdog.disarm` keeping `timed-out` and `killed-no-liveness` disjoint; `close`-first settling `completed`), the enforcement injection (fragment spliced before the prompt, `containsContiguous` correctly suppressing duplicates only for fragments present *before* the prompt, both shipped lanes resolving with no double-injection), the timeout derivation (`max(floor, ceil(secs_per_kb × payload_kb))`, override displacing, linear extrapolation, fail-loud backstop), the writer/reader fleet-count agreement on `reportBytes > 0` (AUDIT-01's fix holds), and `parseIndexLaneStates` not misparsing the `## Fleet report` block's `- <lane>:` lines as model-row fields. The defect above is the one place the settle machine's vocabulary is incomplete.

### AUDIT-20260611-14 — Config loader silently accepts (and stores) a dead `liveness_window_seconds` on a `liveness_signal: none` lane

Finding-ID: AUDIT-20260611-14
Status:     fixed-8c7766de
Severity:   low
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts (the `liveness_signal !== 'none'` / `else if` window branch, ~lines 360-380 of the new hunk)

When `liveness_signal` is `none`, the loader still parses and stores a supplied `liveness_window_seconds`:

```ts
} else if (raw['liveness_window_seconds'] !== undefined && raw['liveness_window_seconds'] !== null) {
  livenessWindowSeconds = requirePositiveInteger(raw, 'liveness_window_seconds', prefix);
}
```

The resulting `ModelConfig` carries `livenessSignal: 'none'` together with a `livenessWindowSeconds`, but `spawn-cli.ts` computes `monitored = livenessSignal !== 'none'` (false), so the watchdog is never armed and the window is inert. The field is accepted with no error and no warning.

This is a small honesty/consistency gap rather than a behavioral bug: the v2 loader is otherwise aggressively fail-loud (it rejects half-pairs, embedded `{{prompt-stdin}}`, invalid enums, and pre-014 shapes), so silently swallowing a meaningless field is the odd one out — a reader who sets a window on a `none` lane will reasonably believe liveness is monitored when it isn't. Blast radius is low: no run misbehaves, the lane simply runs unmonitored as the `none` sentinel dictates. It is plausibly an intentional convenience (keep the window so flipping `none → stdout` is a one-line edit); if so, that intent should be stated, otherwise the loader should reject or at least warn on a window paired with `none`, consistent with the rest of the v2 grammar's fail-loud posture.

## 2026-06-11 — audit-barrage lift (20260611T123302767Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-15 — Single-lane (or single-producing-by-config) barrage suppresses the quorum-collapsed signal — a "healthy" fleet report with zero cross-model corroboration possible

Finding-ID: AUDIT-20260611-15 (claude-01 + codex-02; cross-model)
Status:     fixed-e61e6b9b
Severity:   medium
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/types.ts (`computeFleetReport` → `quorumCollapsed = produced <= 1`); plugins/stack-control/src/scope-discovery/audit-barrage/run-artifacts.ts (`renderFleetReportLines` quorum line + `renderIndexBody` fleet block gated on `fleet.produced < fleet.configured`); plugins/stack-control/src/govern/protocol.ts:170-172 (`reportFleetStatus` quorum line gated on `degraded && fleet.quorumCollapsed`); plugins/stack-control/src/subcommands/audit-barrage-lift.ts and audit-barrage.ts (both call `renderFleetReportLines` only when `produced < configured`)

`quorumCollapsed` (`produced <= 1`) is computed and stored on every `FleetReport`, but it is *only ever rendered inside a degraded context* — every one of the four surfaces gates the fleet block / quorum line on `produced < configured`. The govern surface additionally double-gates: `if (degraded && fleet.quorumCollapsed)`. The consequence: a run with a **single configured lane** that produces (so `produced === configured === 1`, not degraded) reports a clean, undegraded fleet with no surfaced indication that cross-model agreement — the explicitly-stated HIGH-confidence signal of the entire barrage (`agent-discipline.md` § audit-barrage: "Cross-model agreement … is the HIGH-confidence signal") — was structurally impossible. The `quorumCollapsed: true` the code computed is silently dropped.

Blast radius is genuinely small, which is why this is `low`: the shipped template ships two active lanes (claude + codex, gemini disabled), and the common single-model-in-practice cause — one of two lanes spawn-failing or timing out every round — *is* caught, because that yields `produced 1 < configured 2` → degraded → quorum line fires. The gap only manifests when an operator deliberately narrows `--models` to one lane or edits the config down to a single entry; in that case they implicitly know they have one model. But it is a real inconsistency between "the code bothered to compute quorumCollapsed" and "it is unreachable for the one-lane case," and it slightly undercuts the feature's own framing that quorum-impossibility "must be stated wherever agreement is reported" (the `computeFleetReport` doc comment, types.ts). A minimal fix: surface the quorum-collapsed note whenever `quorumCollapsed` holds, independent of `produced < configured` — or document that a single-configured-lane run is intentionally exempt.

### AUDIT-20260611-16 — No further findings — independent clean signal on what I verified

Finding-ID: AUDIT-20260611-16
Status:     acknowledged-not-a-defect-20260611 (clean-signal record from the auditing lane, not a finding)
Severity:   informational
Surface:    (the rest of the diff)

To give the operator independent cross-model signal alongside the other lanes, here is what I checked and found **clean**, with reasoning:

- **AUDIT-13 / AUDIT-14 fixes hold and don't regress.** The close handler now destructures `(code, signal)` and classifies a non-null signal with `killReason === null` as `killed-external` (spawn-cli.ts close handler); `killReason` precedence over `signal` keeps `timed-out`/`killed-no-liveness` correctly dominant when the wrapper's own SIGTERM/SIGKILL lands. The config loader now refuses `liveness_window_seconds` on a `none` lane. Both are exercised by `spawn-terminal-states.test.ts` and `config-loader-v2.test.ts`.
- **The settle/extractor reportBytes derivation is mutually-exclusive-correct.** `settleCaptures` sets `reportBytes` from the extractor (stream lanes, `stdoutStream === null`) XOR from `stdoutBytes` (text lanes, `extractor === null`); `streamMode` drives both, so the two branches can't both fire. A killed stream lane with no `result` event yields `resultText: null` → no `<model>.md` written → `reportBytes 0` → not healthy/converged → excluded from lift and `produced`. The `barrage-coverage-predicate.test.ts` helper's `{ reportBytes: merged.stdoutBytes, ...merged }` ordering is correct: a pinned `reportBytes` in overrides wins via the spread, else it derives from `stdoutBytes`.
- **The reader-side `produced` count agrees with the writer.** `computeFleetReportFromParsedLanes` gates on `terminalState === 'completed' && exitCode === 0 && reportBytes > 0`, matching `isModelRunConverged`; for completed lanes `spawnError` is always undefined so the missing `spawnError` clause on the reader side is harmless. `parseIndexLaneStates` does not misparse the `## Fleet report` block's `- <lane>:`/`- configured:`/`- quorum:` lines (the field regexes require `- terminal state:` / `- enforcement:` etc. anchored at line start), so fleet lanes are not double-counted, and the mixed-INDEX path throws `IndexLaneParseError` as designed.
- **buildArgs enforcement injection** only treats a fragment present *before* the prompt placeholder as already-present (AUDIT-05), injects before the (stripped) `{{prompt-stdin}}` slot, and the `{{prompt-stdin}}` bare-token loader check (AUDIT-12) makes the equality-only strip exhaustive for loader-validated configs.
- **`liveness: monitored` on a spawn-failed lane is consistent with the spec**, not a defect: data-model.md defines `liveness` as derived "from `liveness_signal`" (config intent), not actual observation, and `terminal state: spawn-failed` is unambiguous on the same row — so I did not flag it.
- **Timeout derivation, watchdog interlocks, and stream multi-turn assembly** match their tests (max(floor, ceil(secs/KB × KB)), override displacement, linear extrapolation, fail-loud backstop; self-disarming single-fire watchdog; assemble-all-assistant-texts with trailing-result-dedup, FR-005 replay).

My one finding clusters at the *synthesis-vocabulary* seam (a computed signal that's unreachable for the one-lane case), not the spawn/settle core, which I judge sound.

### AUDIT-20260611-17 — Whitespace-only `readonly_enforcement` is accepted but marks an unenforced lane as enforced

Finding-ID: AUDIT-20260611-17
Status:     fixed-e61e6b9b
Severity:   high
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts:336-337,438-447; plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts:168-169,451-464

`requireNonEmptyString()` only checks `value.length === 0`, so a quoted YAML value like `readonly_enforcement: "   "` passes config validation. At spawn time, enforcement state is computed as `model.readonlyEnforcement === 'none' ? 'unenforced' : 'enforced'`, so that lane is recorded as `enforced`. But `buildArgs()` trims and splits the fragment; whitespace becomes `fragment.length === 0`, so no read-only fragment is injected.

Blast radius is high because this violates FR-003/FR-004’s safety contract: an adopter typo can run a lane with no mechanical read-only protection while every downstream surface says `[enforced]`. The same trim-aware validation should be applied to all string fields, and `readonly_enforcement` should specifically reject whitespace-only fragments unless it is exactly the sentinel `none`.

## 2026-06-11 — audit-barrage lift (20260611T125045363Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-18 — Adopter README terminal-state list is missing `killed-external` — drift from the union it documents

Finding-ID: AUDIT-20260611-18
Status:     fixed-4816a4a2
Severity:   low
Surface:    plugins/stack-control/README.md (the new `## Audit-barrage config (grammar v2) — migration` block — the "Every run's INDEX.md records each lane's terminal state (…)" sentence)

The README section added in this diff enumerates the terminal states an INDEX records as exactly four: `` `completed` / `timed-out` / `spawn-failed` / `killed-no-liveness` ``. But the `TerminalState` union (types.ts), `parseTerminalState` (run-artifacts.ts), `data-model.md`, `contracts/run-artifacts-contract.md`, and `spec.md` FR-006 were all updated within this same feature range (AUDIT-20260611-13 fix, commit 8c7766de) to include a FIFTH state, `killed-external`. The adopter-facing README is the one straggler that was not updated when the state was added — classic intra-feature documentation drift.

Blast radius is low because the *normative* artifacts (data-model.md, run-artifacts-contract.md) do list `killed-external`, and those are the canonical source for anyone writing INDEX-parsing tooling. The harm is bounded to an adopter (or an agent generating tooling from the README summary alone) who builds a terminal-state enumeration from the README's four-item list and then trips over a `killed-external` row in a real INDEX — an incomplete enum rather than a runtime break. Fix: add `killed-external` to the README's parenthetical list, matching the union it summarizes.

### AUDIT-20260611-19 — Fire-time unenforced warning uses the bare `=== 'none'` test, diverging from spawn-cli's trim-aware enforcement derivation (AUDIT-17 made spawn-cli trim-aware but left this surface behind)

Finding-ID: AUDIT-20260611-19 (claude-02 + codex-01; cross-model)
Status:     fixed-4816a4a2
Severity:   high
Surface:    plugins/stack-control/src/subcommands/audit-barrage.ts (the fire-time warning loop, `if (model.readonlyEnforcement === 'none')`) vs plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts (the `enforcement` derivation: `readonlyEnforcement !== 'none' && readonlyEnforcement.trim().length > 0 ? 'enforced' : 'unenforced'`)

AUDIT-20260611-17's fix established the principle that enforcement state must be derived from whether the *trimmed* fragment carries ≥ 1 token, not from the sentinel comparison alone — and applied it as defense-in-depth in spawn-cli.ts (`spawn-readonly.test.ts` › "a whitespace-only fragment lane settles enforcement: unenforced") precisely for `ModelConfig`s constructed outside the loader. The fire-time warning loop in `auditBarrage` was NOT given the same treatment: it still gates on `model.readonlyEnforcement === 'none'`. A lane carrying a whitespace-only fragment would therefore be marked `unenforced` everywhere downstream (spawn-cli, INDEX, lift, govern) but would emit NO fire-time `⚠ … write-UNENFORCED` warning — a divergence between what fires at fire-time and what the run records.

Blast radius is genuinely low/latent: in the CLI path, `resolution.models` always originate from `loadAuditBarrageConfig`, whose trim-aware `requireNonEmptyString` (AUDIT-17 fix) now rejects whitespace-only fragments at load, so this case is unreachable via the public CLI today. It becomes reachable only if model construction ever moves off the loader (a programmatic API, a future caller). The cost of consistency is one line — reuse the same `!== 'none' && trim().length > 0` predicate (or extract a shared `isEnforced(model)` helper) so the fire-time surface can't silently diverge from the recorded `enforcement` state the way AUDIT-09/11 showed two surfaces diverging on the completed-vs-converged annotation. I flag it at low precisely because it is currently unreachable, not because the inconsistency is cosmetic.

### AUDIT-20260611-20 — Independent clean signal on the spawn/settle/synthesis core

Finding-ID: AUDIT-20260611-20
Status:     acknowledged-not-a-defect-20260611 (clean-signal record from the auditing lane, not a finding)
Severity:   informational
Surface:    (the rest of the diff)

To give the operator independent cross-model signal alongside the other lanes, here is what I checked and found **clean**, with reasoning:

- **The four/five-state settle machine and kill interlocks (spawn-cli.ts) are correct and fully exercised.** `killReason` single-latch + `clearTimers()` + `watchdog.disarm()` keep `timed-out` and `killed-no-liveness` disjoint; the close handler now destructures `(code, signal)` and classifies a non-null signal with `killReason === null` as `killed-external` (AUDIT-13 holds, exercised by `spawn-terminal-states.test.ts` including the OOM-kill fake-child case). `function disarm()` is a hoisted declaration so the `setInterval` callback's forward reference in `watchdog.ts` is not a TDZ hazard.
- **Reader/writer `produced` agreement holds (AUDIT-01 fix).** `computeFleetReportFromParsedLanes` parses `- report bytes:` and gates on `terminalState === 'completed' && exitCode === 0 && reportBytes > 0`, matching the writer's `isModelRunConverged`; the eager text-lane stdout stream no longer masquerades as production via `existsSync`.
- **`parseIndexLaneStates` mixed-INDEX fail-loud is sound (AUDIT-07).** The `### ` heading regex and the line-anchored field regexes do not capture the `## Fleet report` block's `- configured:` / `- <lane>:` / `- quorum:` lines, so fleet lanes are not double-counted; an incomplete v2 lane throws `IndexLaneParseError` rather than silently lowering `configured`.
- **`buildArgs` enforcement injection (AUDIT-05/17) is correct.** `containsContiguous(tokens.slice(0, insertAt), fragment)` only suppresses injection for a fragment present *before* the prompt placeholder; both shipped lanes (claude `--permission-mode plan`, codex `--sandbox read-only`) carry their fragment pre-prompt and resolve with no double-injection; a whitespace-only fragment trims to zero tokens and injects nothing; the `{{prompt-stdin}}` equality-strip is exhaustive because the loader rejects embedded forms (AUDIT-12).
- **`settleCaptures` reportBytes derivation is mutually exclusive** (extractor XOR stdoutStream, both keyed off `streamMode`); a killed stream lane with no result event yields `resultText: null` → no `<model>.md` → `reportBytes 0` → excluded from lift and `produced`. **Stream multi-turn assembly** (assemble all assistant texts, dedup only the trailing result duplicate, null on no-result) matches the FR-005 replay tests. **Timeout derivation** (`max(floor, ceil(secs/KB × KB))`, override displacement, linear extrapolation, fail-loud backstop) matches `timeout-derivation.test.ts`, and the calibration numbers reconcile (69234 B × 13 → 879 s in `quickstart-results.md`; 69000 B × 13 → 876 s in the test).

My two findings sit at the README/CLI-warning consistency seams, not the spawn/settle/synthesis core, which I judge sound.

---

Note on harness context: this was an audit-barrage review request, not an implementation task, so there is nothing to plan or build — the findings above are the deliverable. I made no edits and took only read-only actions. If you'd like, I can open issues for AUDIT-BARRAGE-claude-01/-02 or fold them into the feature's `audit-log.md` via the normal lift flow.

## 2026-06-11 — audit-barrage lift (20260611T130358943Z-audit-barrage-reliability-after_clarify)

### AUDIT-20260611-21 — Stream-json lanes record an `events path` row pointing at a file that may never exist (spawn-failed / zero-output stream lanes)

Finding-ID: AUDIT-20260611-21 (claude-01 + claude-02 + codex-01; cross-model)
Status:     fixed-f3fee407
Severity:   high
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts (`settleCaptures`, the `...(streamMode ? { eventsPath: input.eventsPath } : {})` clause) + plugins/stack-control/src/scope-discovery/audit-barrage/stream-result-extractor.ts (`ensureStream` lazy creation) + run-artifacts.ts `renderModelRow` (`- events path:` row)

`settleCaptures` attaches `eventsPath` to the result for **every** stream-json lane, keyed solely on `streamMode` — regardless of terminal state. But `createStreamResultExtractor` creates the events file lazily inside `ensureStream()`, which fires only on the first `consumeLine()` call (i.e. the first newline-terminated chunk). Two real cases therefore record an `eventsPath` for a file that does not exist on disk: (1) a **spawn-failed** stream lane (ENOENT/E2BIG — `reportSpawnError` → `finish(..., 'spawn-failed')` → `settleCaptures`, but no chunk ever arrived so `eventsStream` stayed `null`); and (2) a stream lane that closes `completed` having emitted **zero stdout bytes** (extractor created, never fed). In both, `renderModelRow` then emits `- events path: <runDir>/<model>.events.ndjson` into INDEX.md naming a nonexistent file.

The blast radius is genuinely low: the only consumer that dereferences this path is the forensic utility `rebuild-artifact-from-events.ts`, which does `readFileSync(eventsPath)` and would throw `ENOENT` — but an operator only reaches for that tool on a lane they believe captured events, and a spawn-failed/empty lane has nothing to rebuild. It is nonetheless a small honesty gap inconsistent with the feature's "artifact paths reflect what's on disk" posture (the same principle AUDIT-01 enforced for `produced` via `report bytes` rather than `existsSync`). A clean fix mirrors that principle: only record `eventsPath` when the extractor actually wrote a capture (e.g. have `extractor.settle()` report whether bytes were written, and gate the field + the INDEX row on it), so the manifest never points at a file that was never created.

---

### AUDIT-20260611-22 — Independent clean signal on the spawn/settle/synthesis core, the config v2 grammar, and the synthesis vocabulary

Finding-ID: AUDIT-20260611-22
Status:     acknowledged-not-a-defect-20260611 (clean-signal record from the auditing lane, not a finding)
Severity:   informational
Surface:    (the rest of the diff)

To give the operator cross-model signal alongside any sibling lanes, here is what I checked and judged **clean**, with reasoning:

- **The five-state settle machine and kill interlocks (`spawn-cli.ts`) are correct.** `killReason` is a single latch checked at the top of every kill callback (`if (settled || killReason !== null) return`), so `timed-out` and `killed-no-liveness` are disjoint; the close handler classifies `signal !== null && killReason === null` as `killed-external` (AUDIT-13 holds), and `killReason` takes precedence over `signal` so our own SIGTERM→SIGKILL grace path still classifies as `timed-out`/`killed-no-liveness` regardless of which signal actually reaped the child. `clearTimers()` + `watchdog?.disarm()` fire on every settle path; `finish()`'s `settled` guard makes it single-shot.
- **`buildArgs` enforcement injection is correct.** `containsContiguous(tokens.slice(0, insertAt), fragment)` suppresses injection only for a fragment present *before* the prompt placeholder (AUDIT-05); the stdin placeholder is stripped via exact-equality `.filter`, exhaustive because the loader rejects embedded `{{prompt-stdin}}` (AUDIT-12); a whitespace-only fragment trims to zero tokens and injects nothing while `isLaneEnforced` marks the lane `unenforced` everywhere including the fire-time warning (AUDIT-17/19, one shared predicate).
- **`parseIndexLaneStates` does not misparse the `## Fleet report` block.** Because `## Fleet report` is two `#` (heading regex requires `###`), `current` remains the last model lane while scanning the fleet block, but the line-anchored `^- report bytes:` / `^- terminal state:` / `^- enforcement:` / `^- liveness:` regexes match none of `- configured:` / `- <lane>: completed [...]` / `- quorum:`, so fleet lanes are not double-counted; a mixed v2 INDEX throws `IndexLaneParseError` rather than silently lowering `configured` (AUDIT-07).
- **`settleCaptures` `reportBytes` derivation is mutually exclusive** (extractor XOR `stdoutStream`, both keyed off `streamMode`); a killed stream lane with no `result` event yields `resultText: null` → no `<model>.md` → `reportBytes 0` → excluded from lift and `produced`. **Stream multi-turn assembly** (all assistant texts, dedup only the trailing result duplicate, null on no-result) matches the FR-005 replay tests. **Timeout derivation** (`max(floor, ceil(secs/KB × KB))`, override displacement, linear extrapolation, fail-loud backstop) matches `timeout-derivation.test.ts`, and the calibration reconciles (69234 B × 13 → 879 s in quickstart; 69000 B × 13 → 876 s in the test).
- **Config v2 fail-loud surface is complete and consistent** — trim-aware non-blank on all string fields, `{{model}}` placeholder required, enum + window refusals, window-on-`none` refusal (AUDIT-14), derivation-pair-or-override, and the pre-014 migration gate naming file + every missing field + template path. The one cosmetic asymmetry — `requireEnum`/`requirePositiveInteger`/`requirePositiveNumber` thread the bare `prefix` while `model`/`readonly_enforcement` thread `${prefix} ('${name}')` — does not lose identifiability because `prefix` already carries the `models[index]` locator, so I did not raise it as a defect.

My two findings sit at the artifact-honesty / DRY seams, not the spawn/settle/synthesis core, which I judge sound. There is nothing to implement here — the findings above are the deliverable; I made no edits and took only read-only actions. The two new items can be folded into `specs/014-audit-barrage-reliability/audit-log.md` via the normal lift flow if you want them tracked.
