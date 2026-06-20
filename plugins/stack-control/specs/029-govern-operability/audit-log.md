---
slug: 029-govern-operability
targetVersion: ""
---

# Audit log — 029-govern-operability

## 2026-06-20 — audit-barrage lift (20260620T070345178Z-029-govern-operability-phase-1)

### AUDIT-20260620-01 — `model_reasoning_summary="detailed"` passes literal quote characters as an argv element

Finding-ID: AUDIT-20260620-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `templates/audit-barrage-config.yaml` lines 108–109; `.stack-control/audit-barrage-config.yaml` lines 37–38

The YAML double-quoted string `"exec -m {{model}} -c model_reasoning_summary=\"detailed\" --sandbox read-only {{prompt-stdin}}"` is valid YAML: the parser processes the `\"` escapes and stores the literal value `exec -m {{model}} -c model_reasoning_summary="detailed" --sandbox read-only {{prompt-stdin}}`. When the harness then splits that string on whitespace to build an argv array (per the comment "Comma-joined single token so it survives the harness's whitespace split"), the element passed to Node.js `spawn()` for the `-c` arg value is `model_reasoning_summary="detailed"` — with **literal double-quote characters** in the string. This is spawned programmatically, not via a shell, so the shell never strips those quotes. Codex's `-c` parser receives the value `model_reasoning_summary="detailed"` (quotes included). Whether codex strips surrounding quotes from config-value tokens depends entirely on its argument parser; many expect bare `key=value` without shell-style quoting. If it does not strip them, the flag is either silently ignored or parsed as value `"detailed"` (literal quotes), meaning no reasoning-summary pulses reach stderr. The liveness watchdog then fires a false `killed-no-liveness` on a tight 60 s window — exactly the failure mode this feature exists to prevent. The tests in `spawn-liveness.test.ts` drive a `FakeChild` and never spawn a real codex process, so this is not caught. The correct form in a programmatically-spawned argv is `model_reasoning_summary=detailed` without quotes.

---

### AUDIT-20260620-02 — `--disallowedTools` comma-joined format not validated against Claude CLI's actual argument parser

Finding-ID: AUDIT-20260620-02
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `templates/audit-barrage-config.yaml` lines 115–117, 149–151; `tests/audit-barrage/config-default.test.ts` lines 67–77

Both Anthropic lanes set `readonly_enforcement` to `--disallowedTools Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Task,NotebookRead,NotebookEdit` — a comma-joined single token. The comment explains this is intentional to survive the harness's whitespace-split-into-argv step: the harness will inject exactly two argv elements — `--disallowedTools` and `Bash,Read,...` — rather than one flag per tool. The correctness guarantee of the whole "no-grounding = readonly by construction" claim therefore rests on Claude Code's `claude -p` flag accepting a comma-separated list as a single value for `--disallowedTools`. If Claude's argument parser requires either repeated flags (`--disallowedTools Bash --disallowedTools Read`) or space-separated values, the comma-joined single token is parsed as one tool name (the literal string `Bash,Read,...`), silently failing to deny any individual tool. The result is a lane the diff describes as "readonly by construction" that is in fact unrestricted — the grounding tool-loop this phase exists to eliminate would still run. The test in `config-default.test.ts` checks `lane.readonlyEnforcement.toContain('--disallowedTools')` and that the string contains specific tool-name substrings (lines 67–77), but these are string-presence assertions on the config object. They do not spawn a real `claude -p` process and confirm the tools are actually unavailable. The unverified assumption is load-bearing for FR-001.

---

### AUDIT-20260620-03 — Opus no-grounding timeout assumption shipped without calibration data

Finding-ID: AUDIT-20260620-03
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `templates/audit-barrage-config.yaml` lines 100–128; `specs/029-govern-operability/research.md` lines 9–11

The shipped template raises `timeout_floor_seconds` from 300 to 420 for the `claude/opus` lane, and the `research.md` addition explicitly acknowledges: "A dedicated live opus-no-grounding calibration run has **not** been executed in this phase." The 420 s floor derives from sonnet measurements (167–233 s no-grounding on 14–24 KB). Opus is a materially larger model and routinely takes 3–5× sonnet's wall-clock on equivalent token payloads. If no-grounding opus on a real per-phase payload (14–24 KB) takes 350–500 s — plausible given that prior opus-with-grounding runs filled the 300 s budget entirely — the lane will timeout systematically on real adopter installs. The consequence: the fleet's stated 3-lane composition (FR-005, "unchanged: opus + codex + sonnet") silently degrades to 2 effective lanes on every run, with no visible error to the operator (a timed-out lane produces a `killed-timeout` result, not a config error). The research note also says: "if a real template-config barrage shows opus cannot meet the timeout envelope even without grounding, that is a fleet-composition decision surfaced to the operator" — but that decision tree requires running the calibration first, which has not happened. A 420 s floor calibrated against sonnet observations is not evidence that opus meets 420 s.

---

### AUDIT-20260620-04 — Test suite validates config shape only — no runtime proof of the key reliability properties

Finding-ID: AUDIT-20260620-04
Status: migrated-to-backlog TASK-319
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/audit-barrage/config-default.test.ts` (all); `tests/audit-barrage/spawn-liveness.test.ts` (all)

Both new test files are structurally sound and correctly scoped to the testing philosophy (no CLI integration, fixture-based, no mocking of the filesystem). However, the two highest-risk assumptions in this diff — (a) that `model_reasoning_summary="detailed"` actually produces stderr pulses when codex is spawned, and (b) that `--disallowedTools Bash,Read,...` actually restricts a spawned claude process — are validated only at the config-shape level. `config-default.test.ts` confirms the config strings contain the right substrings; `spawn-liveness.test.ts` drives a `FakeChild` whose `stderr.write()` is called manually by the test itself. No test runs a real codex or claude subprocess and verifies the emergent behavior (pulse timing, tool denial). This is not a contradiction of the project's testing rules (which prohibit testing "Claude Code internals") but it does mean the end-to-end contract of both FR-001 and FR-003 is unverified by the automated suite. The practical blast-radius: if either runtime assumption is wrong, the barrage runs silently degrade (false liveness kills, unrestricted grounding) and the regression has no automated detector.

---

### AUDIT-20260620-05 — Synchronous `expect(child.kills)` after fake-timer advance is fragile if kill path is async

Finding-ID: AUDIT-20260620-05
Status: migrated-to-backlog TASK-320
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/audit-barrage/spawn-liveness.test.ts` lines 130–136

In the second test block ("a codex lane silent past the 60s window IS killed-no-liveness"), the pattern is:

```typescript
vi.advanceTimersByTime(90_000);
expect(child.kills).toContain('SIGTERM');   // synchronous assertion
child.emit('close', null, 'SIGTERM');
const result = await promise;
```

`vi.advanceTimersByTime` runs timer callbacks synchronously. If `spawnCliAgainstModel`'s liveness watchdog sets a `setTimeout` that calls `child.kill('SIGTERM')` directly and synchronously, the assertion is correct. If the watchdog callback is `async` (even with a trivial `await` before the kill, or if it schedules a microtask), the kill may not have happened at the point of the synchronous `expect`. In that case the assertion passes vacuously (no kill yet → toContain fails) or races with the microtask queue. This is not a current bug if the implementation is synchronous, but it couples the test to an implementation invariant that is not stated anywhere. A safer pattern would `await vi.runAllTimersAsync()` or check kills only after awaiting the promise.

### AUDIT-20260620-06 — Anthropic deny-list omits a file-mutating Claude tool

Finding-ID: AUDIT-20260620-06
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    templates/audit-barrage-config.yaml:112,147; .stack-control/audit-barrage-config.yaml:80; tests/audit-barrage/config-default.test.ts:66-74

The new Anthropic `readonly_enforcement` claims “No-tools = readonly by construction” but the `--disallowedTools` list omits `MultiEdit`, which is a file-mutating Claude Code tool. The shipped template and local override deny `Bash,Read,Grep,Glob,Edit,Write,...` but leave `MultiEdit` available, so the removal of `--permission-mode plan` can re-open a write path while the run artifacts still mark the lane enforced.

The new contract test locks in the incomplete shape: it checks only `Read`, `Write`, `Edit`, `Bash`, `Grep`, and `Glob`, so it would pass even though a mutating tool remains enabled. Blast radius is high because downstream adopters would inherit a config advertised as mechanically read-only, and a hostile or accidental tool call could mutate the repo. A reasonable fix is to include every mutating Claude tool in the deny-list, at minimum `MultiEdit`, and extend the test/probe expectation so this class of omission fails.

## 2026-06-20 — audit-barrage lift (20260620T071605678Z-029-govern-operability-phase-1)

### AUDIT-20260620-07 — Active override still bypasses the calibrated shipped fleet

Finding-ID: AUDIT-20260620-07
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    .stack-control/audit-barrage-config.yaml:49-85; templates/audit-barrage-config.yaml:97-155; specs/029-govern-operability/research.md:7-10; tests/audit-barrage/config-default.test.ts:48-70

The feature says to “Update installation config in lockstep” and records opus as calibrated-safe, with the shipped fleet kept as `opus+codex+sonnet` (research lines 7-10). The shipped template now has that three-lane composition: `claude` model `opus`, `codex`, and `sonnet` model `claude-sonnet-4-6` (template lines 97-155). But the active project override still takes precedence at runtime and remains a two-lane config: `codex` plus a single `claude` lane whose model is `sonnet` (override lines 49-85). Because `loadAuditBarrageConfig()` uses `.stack-control/audit-barrage-config.yaml` before the template, this repository’s real barrage will not exercise the calibrated opus lane or the three-lane composition the feature claims to preserve.

The blast radius is high because downstream governance in this active installation acts on the override as written: operators can see tests passing against the shipped template while actual runs use a different fleet. The new tests only load `DEFAULT_CONFIG_PATH` (config-default lines 48-70), so they cannot catch override/template drift. A reasonable fix is to either bring the active override into the same three-lane calibrated shape or add a lockstep test that loads the real active config for this installation and fails when its effective fleet diverges from the shipped/governed contract.

## 2026-06-20 — audit-barrage lift (20260620T073513991Z-029-govern-operability-phase-1)

### AUDIT-20260620-08 — `WebFetch` and `WebSearch` omitted from deny-list presence assertions

Finding-ID: AUDIT-20260620-08
Status: migrated-to-backlog TASK-321
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/audit-barrage/config-default.test.ts:93–107

The test that asserts every repo-mutating and grounding tool is present in `readonlyEnforcement` iterates over eight tools — `Write`, `Edit`, `NotebookEdit`, `Read`, `Grep`, `Glob`, `Bash`, `Task` — but omits `WebFetch` and `WebSearch`. Both appear in the actual deny-list that ships in the template (`Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Task,NotebookEdit`) and in the installation override. The test comment (lines 88–91) correctly describes the intent as "no tool-loop" covering both file-system AND web grounding, but the loop body doesn't verify the web leg.

The blast-radius: a future edit that accidentally drops `WebFetch` or `WebSearch` from either lane's `readonlyEnforcement` — say, a mechanical reformat or a copy-paste from an older config — would not be caught. A lane without `WebFetch`/`WebSearch` denied can still ground its findings via network search, defeating the "single text-only pass" invariant. Adding both names to the tool loop (the same structure as lines 94–103) closes the gap with minimal code change; they should also be included in the stale-name regression lock (alongside `MultiEdit`/`NotebookRead`) to make the full set explicit.

---

### AUDIT-20260620-09 — `timeoutSeconds` in `Partial<ModelConfig>` override — mismatched field name or silent dead property

Finding-ID: AUDIT-20260620-09
Status: migrated-to-backlog TASK-322
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/audit-barrage/spawn-liveness.test.ts:116, 131

Both `spawnWithFake` call-sites pass `codexShapedLane({ livenessWindowSeconds: 60, timeoutSeconds: 300 })`. The `codexShapedLane` factory (lines 79–93) builds a `ModelConfig` whose timeout field is `timeoutFloorSeconds: 300` — matching the naming everywhere else in the config and tests. The override property `timeoutSeconds` does not match that field name.

Two failure modes follow. If `ModelConfig` does not declare a `timeoutSeconds` field, TypeScript strict mode flags this as "Object literal may only specify known properties" — a compile-time error that `tsx` silently swallows (no type-stripping check), so the test runs but carries a latent `tsc` failure that a CI type-check step would surface. If `ModelConfig` does declare `timeoutSeconds`, the value is immediately superseded by `timeoutBasis: { mode: 'override', effectiveTimeoutSeconds: 300 }`, making the override a no-op; the intent is then opaque. Either way, the property is doing nothing visible and its provenance is unclear. The fix is to either remove the override (the `timeoutBasis` already governs), or replace it with `timeoutFloorSeconds: 300` if the intent was to tighten the floor in the fake-lane scenario and it IS the right field name.

---

### AUDIT-20260620-10 — `FakeChild.stdin = null` may cause null-dereference in `spawnCliAgainstModel`

Finding-ID: AUDIT-20260620-10
Status: migrated-to-backlog TASK-323
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/audit-barrage/spawn-liveness.test.ts:57 (`readonly stdin = null`)

`spawnCliAgainstModel` receives `prompt: 'audit this'` and a `spawnImpl` that returns the `FakeChild`. Real spawn implementations deliver the prompt by writing it to `child.stdin` (the harness `argsTemplate` uses `{{prompt-stdin}}` to signal this delivery path). `FakeChild` sets `stdin = null`, which means any `child.stdin.write(prompt)` call throws `TypeError: Cannot read properties of null (reading 'write')` before the test reaches the liveness-watchdog logic it is supposed to exercise.

The test's stated contract is "driving the real `spawnCliAgainstModel` with a fake child + fake timers." A null stdin breaks that contract for the stdin-delivery path. The tests might still pass if `spawnCliAgainstModel` guards against null stdin (e.g., only writes when `child.stdin !== null`), but that guard is not visible in the diff and was not called out in any comment. If the real implementation does NOT guard, both tests throw early and produce a misleading failure rather than the expected liveness signal. The fix is to supply a writable PassThrough for stdin — mirroring the stdout/stderr mocks already present — and let it drain silently.

---

### AUDIT-20260620-11 — Fixed liveness window does not scale with payload size unlike the timeout floor

Finding-ID: AUDIT-20260620-11
Status: migrated-to-backlog TASK-324
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    templates/audit-barrage-config.yaml (claude and sonnet lanes, liveness_window_seconds: 300 / timeout_secs_per_kb: 13)

The no-grounding Anthropic lanes carry `liveness_window_seconds: 300` (fixed) alongside `timeout_floor_seconds: 420` and `timeout_secs_per_kb: 13` (scaled). For a 33 KB payload the effective timeout is 429 s; for 50 KB it is 650 s; for 80 KB it reaches 1040 s. The liveness window stays at 300 s regardless of payload size.

The 300 s window is calibrated against an observed "170–233 s healthy completion" for 14–24 KB payloads (noted in the research.md addition). On a no-grounding single-pass run with a larger payload the model may enter a deep thinking phase with a stdout gap that exceeds 300 s — not a hang, just a long contiguous reasoning span. The watchdog would fire `killed-no-liveness` on a healthy lane, degrading the fleet the same way the pre-fix 60 s window did. Because `timeout_secs_per_kb` scales the kill-cap but nothing scales the window, the margin between "valid thinking pause" and "false kill" narrows as payload size grows.

This is not an immediate problem at current per-phase payload sizes (~14–25 KB). It becomes the problem when feature specs or large diffs push payloads past ~40 KB. A comment in the template noting the payload-size assumption that calibrates 300 s — and referencing where to revisit (e.g., research.md T006) — would leave a traceable breadcrumb for the next person who has to tune this.

---

### AUDIT-20260620-12 — Deferral phrase in research.md Alternatives section without a tracking issue

Finding-ID: AUDIT-20260620-12
Status: migrated-to-backlog TASK-325
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    specs/029-govern-operability/research.md (T006 US1 Alternatives bullet, newly added lines)

The diff adds: `"--json codex stream extractor (deferred — bigger parser change, only if reasoning-summary pulses prove insufficient)"`. Per the audit hard constraints and the project's agent-discipline rule, deferral phrases without a backing GitHub issue number are bug-factories — the prose note is the only record, and it will not be tracked to completion if reasoning-summary pulses later regress (e.g., on a gpt-6 model that doesn't support the flag). The rule's own examples name `--json` parsing as a legitimate conditional alternative, not a "never do this" call, which means the condition could be reached and the alternative would be invisible in any issue tracker.

The blast-radius is bounded: if reasoning-summary pulses become unreliable, codex false-kills return — the feature degrades but does not break. The fix is to either file a GitHub issue (referencing the condition "if reasoning-summary pulses prove insufficient") and replace the prose deferral with the issue link, or explicitly mark the alternative as "out of scope / will not do" with a rationale, matching the project's four-disposition model for design alternatives.

### AUDIT-20260620-13 — Research note keeps a prohibited future-work marker

Finding-ID: AUDIT-20260620-13
Status: migrated-to-backlog TASK-326
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    specs/029-govern-operability/research.md:9

Line 9 still records the `--json` codex stream extractor as postponed future work using a forbidden deferral marker. The audit prompt’s hard constraints explicitly reject those markers as operator-discipline traps, so leaving one in the governed research artifact creates avoidable friction for the dispatch wrapper and for unattended agents that may echo the phrasing.

Blast radius is low because this does not change runtime behavior: the template and override configuration are still explicit. A reasonable fix is to rewrite the Alternatives entry as a closed design disposition, for example stating that the stream extractor was rejected unless the current reasoning-summary mechanism fails a named acceptance condition, without using open-ended future-work language.

## 2026-06-20 — audit-barrage lift (20260620T074026297Z-029-govern-operability-phase-1)

### AUDIT-20260620-14 — `WebFetch` and `WebSearch` absent from the mandatory deny-list assertion

Finding-ID: AUDIT-20260620-14
Status: migrated-to-backlog TASK-327
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/audit-barrage/config-default.test.ts:97-112`

The test comment states "EVERY repo-mutating Claude Code tool must be denied … plus the grounding tools (Read/Grep/Glob/Bash/Task/web)" yet the `for (const tool of [...])` assertion loop at lines 98-111 enumerates only eight tools — `Write`, `Edit`, `NotebookEdit`, `Read`, `Grep`, `Glob`, `Bash`, `Task` — and omits `WebFetch` and `WebSearch` entirely. The actual shipped config correctly denies both (they appear in `templates/audit-barrage-config.yaml` at lines ~115 and ~170 under `--disallowedTools`), but the test doesn't lock them in. A future tuning pass that removes `WebFetch`/`WebSearch` from the deny-list would let the no-grounding lane silently reintroduce web-grounding (URL fetching of referenced sources in the diff) while all existing test assertions continue to pass.

Blast-radius: the entire US1 reliability story rests on these lanes being single text-only passes over the payload. Re-admitting `WebFetch` would allow the model to chase URLs in the diff and partially reconstitute the grounding tool-loop that caused the budget-exhaustion timeouts the feature set out to fix. The regression would be invisible until a live barrage observed unexpected latency or budget overrun.

Fix: add `'WebFetch'` and `'WebSearch'` to the required-tool array at line 98–108 of `config-default.test.ts`.

---

### AUDIT-20260620-15 — `FakeChild.stdin = null` while `argsTemplate` contains `{{prompt-stdin}}`

Finding-ID: AUDIT-20260620-15
Status: migrated-to-backlog TASK-328
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/audit-barrage/spawn-liveness.test.ts:67-68` (FakeChild), `tests/audit-barrage/spawn-liveness.test.ts:88-89` (codexShapedLane)

`FakeChild` sets `readonly stdin = null`. The `codexShapedLane` helper's base `argsTemplate` is `"exec -m {{model}} {{prompt-stdin}}"` — a template that signals stdin-delivery of the prompt. If `spawnCliAgainstModel` writes the prompt to `child.stdin` after spawning (the usual stdio-pipe pattern for `{{prompt-stdin}}`), it dereferences null and throws `TypeError: Cannot read properties of null`. The tests appear to pass, which means either (a) the harness silently skips stdin write when `child.stdin` is null, (b) `{{prompt-stdin}}` is resolved pre-spawn via file redirection rather than post-spawn via `child.stdin.write()`, or (c) the harness does write to stdin and the test is swallowing the error before the `await promise` resolves.

Blast-radius is bounded to test validity, not production behaviour. If path (a), the liveness tests are exercising the watchdog over an empty-prompt run, which still tests the right thing (timer fires vs. doesn't fire), but the code path where a real prompt is piped through stdin and the process actually starts reasoning is never exercised by the fake-child tests. The test is not wrong in purpose, but the null stdin is a silent coverage boundary. If path (c), the tests are passing for the wrong reason.

Fix: give `FakeChild` a `PassThrough` stdin (matching stdout/stderr) and document explicitly that the fake child ignores written data, or document in a comment that prompt delivery is out-of-scope for this test class.

---

### AUDIT-20260620-16 — Permissive assertion floor for `livenessWindowSeconds` (240 s) leaves 7 s headroom over observed max

Finding-ID: AUDIT-20260620-16
Status: migrated-to-backlog TASK-329
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/audit-barrage/config-default.test.ts:118`

```typescript
expect(lane.livenessWindowSeconds).toBeGreaterThanOrEqual(240);
```

The research.md records "~170–233 s" as the empirically observed healthy completion range for the no-grounding Anthropic lanes. The assertion floor of 240 s is 7 s above the observed maximum. The deployed value is 300 s (67 s headroom), which is defensible. But the regression lock only enforces 240 s — a future tuning pass that reduces the window to 240 s (still legal per the test) would leave a 7 s safety margin over the observed maximum, which is likely too thin for real-world queueing variance, model-side latency spikes, or slower operator hardware.

Blast-radius: a config tuned to `liveness_window_seconds: 240` would pass all tests and CI, then false-kill a healthy lane on payloads that take 241–300 s under load, degrading the fleet to 1/2 (quorum-impossible) exactly as described in the research's Phase-1 govern post-mortem. The test's stated purpose is to prevent that regression; its current floor doesn't encode enough of the headroom to reliably do so.

Fix: raise the assertion floor to match the design intent — e.g., `toBeGreaterThanOrEqual(270)` for a conservative 37 s margin, or `toBeGreaterThanOrEqual(300)` to lock the deployed value directly and surface any future lowering as a deliberate test-update decision.

---

### AUDIT-20260620-17 — Permissive assertion floor for `timeoutFloorSeconds` (`> 300`) allows values down to 301

Finding-ID: AUDIT-20260620-17
Status: migrated-to-backlog TASK-330
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/audit-barrage/config-default.test.ts:138-143`

```typescript
expect(lane.timeoutFloorSeconds).toBeGreaterThan(300);
```

The assertion only requires the timeout floor to exceed the old value (300 s). The deployed value is 420 s — 188 s above the observed ~233 s no-grounding completion, chosen to give the liveness watchdog (300 s window) headroom before the kill-cap fires. A config with `timeout_floor_seconds: 301` passes the test but provides essentially no headroom: a 300 s liveness window and a 301 s timeout floor are nearly indistinguishable in practice, and the watchdog can no longer pre-empt a true infinite hang before the timeout fires.

Blast-radius is similar to finding AUDIT-BARRAGE-claude-03: the test would green-light a config that breaks the invariant it claims to guard (liveness pre-empts timeout). The companion test at line 124 (`expect(lane.livenessWindowSeconds).toBeLessThan(floor)`) requires `300 < floor`, so a 301 s floor would still satisfy both tests even though a healthy run at 280 s would complete with only 21 s before the timeout and a liveness window that's 1 s shorter than the floor.

Fix: assert `timeoutFloorSeconds >= 360` (or `>= 420`) to encode the actual design intent that the floor must provide meaningful headroom above both the observed completion times and the liveness window.

---

### AUDIT-20260620-18 — `timeoutSeconds` override field in `codexShapedLane` not visible in `ModelConfig` from this diff

Finding-ID: AUDIT-20260620-18
Status: migrated-to-backlog TASK-331
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    `tests/audit-barrage/spawn-liveness.test.ts:112` and `130`

```typescript
codexShapedLane({ livenessWindowSeconds: 60, timeoutSeconds: 300 }),
```

`codexShapedLane`'s parameter is `Partial<ModelConfig>`. The base object inside the helper uses `timeoutFloorSeconds: 300` (camelCase of `timeout_floor_seconds`). The override here passes `timeoutSeconds: 300` — a different field name. Under TypeScript strict-mode excess-property checking, this is a compile error if `ModelConfig` has no `timeoutSeconds` property. Since the project enforces strict mode (`CLAUDE.md: Never bypass typing — No any, no as Type, no @ts-ignore`), and the diff doesn't include `src/scope-discovery/audit-barrage/types.ts`, it is not possible to verify from this diff alone whether `ModelConfig` has a `timeoutSeconds` field distinct from `timeoutFloorSeconds`.

Blast-radius is low if the TypeScript build covers test files (a compile error would surface immediately). The risk is if test files are excluded from `tsc` and only compiled by Vitest's esbuild transform, which may not enforce excess-property checks — in that case a stale field name silently passes without affecting the produced `ModelConfig` object (the spread discards the unknown key) and the timeout logic runs solely from `timeoutFloorSeconds`. Verify that `ModelConfig` has a `timeoutSeconds` field, or replace the override with `timeoutFloorSeconds: 300` if the intent is the same field.

### AUDIT-20260620-19 — Prohibited postponement wording remains in the research artifact

Finding-ID: AUDIT-20260620-19
Status: migrated-to-backlog TASK-332
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    specs/029-govern-operability/research.md:9

Line 9 describes the `--json` codex stream extractor with a postponement marker in the Alternatives entry. The audit prompt explicitly rejects that wording shape and asks reviewers to surface it when present in the diff. The blast radius is low because this does not change runtime behavior, but it is an operator-discipline trap in a spec artifact that unattended agents may treat as an acceptable planning pattern.

A reasonable correction is to phrase the alternative as a bounded conditional decision instead: the extractor is outside this feature’s selected design unless reasoning-summary pulses fail the stated acceptance criteria.

### AUDIT-20260620-20 — Web grounding tools are in the config but not regression-locked

Finding-ID: AUDIT-20260620-20
Status: migrated-to-backlog TASK-333
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/audit-barrage/config-default.test.ts:83-102

The test claims to enforce the no-grounding `--disallowedTools` set, and the template currently includes `WebFetch`/`WebSearch`, but the assertion loop only checks `Write`, `Edit`, `NotebookEdit`, `Read`, `Grep`, `Glob`, `Bash`, and `Task`. That leaves the web grounding part of the contract untested even though the surrounding comments and config treat web access as part of the tool loop being disabled.

The blast radius is medium: the shipped config is correct in this diff, but a later edit could drop `WebFetch` or `WebSearch` while this contract test still passes, silently weakening the “single text-only pass over the payload” invariant. The fix is to assert the full required deny-list, ideally by parsing the comma-separated value and comparing exact tool names rather than substring containment.
