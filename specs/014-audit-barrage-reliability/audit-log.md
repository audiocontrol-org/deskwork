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
