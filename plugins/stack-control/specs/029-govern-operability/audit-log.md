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

## 2026-06-20 — audit-barrage lift (20260620T080151824Z-029-govern-operability-phase-2)

### AUDIT-20260620-21 — `DEGRADED_MARKER_RE` scans entire section body, not just the section preamble

Finding-ID: AUDIT-20260620-21 (claude-01 + codex-02; cross-model)
Status: migrated-to-backlog TASK-334
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:131-140 (new lines in `countHighPlusInSection`)

The `DEGRADED_MARKER_RE` check fires on **every line** inside the section, including the body text of individual findings (the `if (!ENTRY_HEADER_RE.test(line)) { i += 1; continue; }` block skips non-header lines from finding-count perspective, but the DEGRADED check happens *before* that guard and is not short-circuited). The pattern `/Fleet:\s*DEGRADED\b/i` is specific, but any finding whose body discusses the fleet-degradation feature — for example, an audit finding that quotes the marker, references the dampener behavior, or audits this very feature (029) — would false-positive set `degraded = true` for that section, causing the dampener to refuse convergence on what is actually a healthy run. This is a self-inflicted risk: `stack-control` is a self-hosted tool, so running audit-barrage *against itself* (as happened in the 029 session) will produce finding bodies that say things like `"The Fleet: DEGRADED marker is written when produced < configured…"`. Any such section in the audit log would be permanently un-dampenable regardless of how many subsequent clean runs follow. The fix is to restrict the scan: before the first `###` entry header is encountered, scan normally for the Fleet marker; once the first `ENTRY_HEADER_RE` match is seen, stop checking for the marker (it will never appear in a well-formed section preamble after that point). Alternatively, anchor the regex to a line that starts with `_Fleet:` or matches the exact escaped-markdown format the lift renders.

---

### AUDIT-20260620-22 — `singleRunCleanEngages` degraded-flag path has no isolated test

Finding-ID: AUDIT-20260620-22
Status: migrated-to-backlog TASK-335
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/promote-findings/degraded-not-quiet.test.ts:86-103

The new code adds `!mostRecent.degraded` to `singleRunCleanEngages` (line 204 in the diff), but no test case isolates this check. Every test that exercises a single degraded run uses `degradedSection`, which includes a MEDIUM finding — meaning `rawMediumCount > 0` already prevents `singleRunCleanEngages` from engaging, independent of the `!degraded` guard. A regression that removed `!mostRecent.degraded` while leaving the MEDIUM-count check intact would still pass all tests. A targeted case is: a degraded section containing 0 findings (or findings that are all status=`closed`/non-open) so `rawMediumCount === 0` and `rawHighPlusCount === 0`; in that configuration the new guard is the only thing preventing single-run dampening, and no test exercises it. The fix is to add one test case: a single degraded section with 0 HIGH+ and 0 MEDIUM finds, asserting `dampened === false`.

---

### AUDIT-20260620-23 — Diagnostic message silences degraded status when HIGH+ runs coexist in the window

Finding-ID: AUDIT-20260620-23
Status: migrated-to-backlog TASK-336
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:231-249 (diagnostic block ordering)

The `notQuiet` (HIGH+) diagnostic check fires before the degraded diagnostic check. When the recent window contains both a run with HIGH+ findings and a run with `degraded: true`, only the HIGH+ message is returned — the degraded run is never surfaced in the operator-facing reason. After the operator resolves the HIGH+ findings and re-runs, the dampener will produce the degraded message on the *next* invocation; but the first invocation's reason is incomplete. This means an operator who sees "1 run surfaced N HIGH+" and then fixes those N findings may expect the next clean healthy run to converge, not realising there is *also* a degraded run in the window requiring a full healthy re-run. The blast radius is a surprised operator on the re-run, not incorrect dampening. A straightforward fix: collect both the HIGH+ reason and the degraded reason and surface them together (e.g. by building a list of reasons rather than returning on first match).

---

### AUDIT-20260620-24 — Degraded runs with zero surviving findings are invisible to the dampener

Finding-ID: AUDIT-20260620-24 (claude-04 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=informational, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/audit-barrage-lift.ts:388-393 (comment), and the dampener as a whole

The comment in `audit-barrage-lift.ts` says `"the degraded+0-findings branch above already records nothing"` — when the fleet is degraded but zero findings came out of the surviving lanes, no section is written to the audit log. This means the dampener, which reads only the log, cannot see that a degraded run occurred. Consider the sequence: two clean healthy runs (sections in log), then a degraded+0-findings run (no section), then one more healthy clean run. The dampener sees three sections — all three clean — and may dampen even though an uninspected degraded run sits between the prior two clean runs and the latest one. Whether this is a correctness gap depends on spec intent: the spec may have decided that a degraded run producing nothing is not meaningful enough to block convergence, which is a defensible position (the surviving lanes produced no findings either). The current code and tests don't document this edge case or assert the intended behavior, making it a silent design assumption. Adding a spec comment or test asserting the intended behavior (either "degraded+0-findings is invisible and that is intentional" or "we should write a sentinel-only section to mark the degraded run") would close the documentation gap and prevent a future maintainer from patching the lift to write sentinel sections on degraded-0-findings runs, inadvertently changing the dampening semantics.

## 2026-06-20 — audit-barrage lift (20260620T080601577Z-029-govern-operability-phase-2)

### AUDIT-20260620-25 — T008 implementation surfaces absent from the diff — zero-byte detection and `Fleet: DEGRADED` stamp cannot be audited

Finding-ID: AUDIT-20260620-25
Status: migrated-to-backlog TASK-337
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/audit-barrage/terminal-state.test.ts:13-19 (imports); src/subcommands/audit-barrage-lift.ts (renderSection call site)

The two test files added in this commit import two symbols that must exist in implementation files, but neither implementation file appears in the diff:

- `completedNonConvergedAnnotation` from `src/scope-discovery/audit-barrage/types.ts` (tested in `terminal-state.test.ts` lines 13, 42–62)
- `renderSection` and the exported type `SectionFleetStatus` from `src/subcommands/audit-barrage-lift-render.ts` (tested in `terminal-state.test.ts` lines 15–18, and called in the modified `audit-barrage-lift.ts`)

The test docblock explicitly labels its coverage as `(T008, RED)` — meaning these tests are written in the RED phase and the GREEN implementation is not visible here. Yet the commit subject claims `T008-T012` complete. This creates an auditable gap: the correctness of the zero-byte lane detection contract (FR-006: `completed + exitCode=0 + reportBytes=0` → `zero-byte` annotation, not bare `completed`) and the actual prose shape of the `Fleet: DEGRADED` stamp that the dampener's regex reads back are both invisible in this diff. If those functions do not yet carry the expected signatures, TypeScript strict mode would reject the import at compile time and CI would fail. If they were silently added in a prior US1 commit without a test, the RED/GREEN split is inverted. Either way, the audit cannot verify the core T008 surface — the implementation files should be in the diff.

A reasonable fix: if the implementations were authored as part of this same commit but the diff was rendered selectively, re-run the diff to confirm all changed files are included. If the implementations were added in US1 (`11192f69`), the test docblock annotation should read `(T008, GREEN: impl in US1)` to avoid the confusion, and the audit log should confirm the T008 contract was governed then.

---

### AUDIT-20260620-26 — `DEGRADED_MARKER_RE` scans finding body lines — false-positive degraded detection possible

Finding-ID: AUDIT-20260620-26
Status: migrated-to-backlog TASK-338
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:130–133 (new lines in `countHighPlusInSection`)

The new degraded-detection line fires on every line the inner `while` loop visits before the `continue`:

```typescript
if (DEGRADED_MARKER_RE.test(line)) degraded = true;
if (!ENTRY_HEADER_RE.test(line)) {
  i += 1;
  continue;
}
```

Lines that are NOT an entry header (`### AUDIT-…`) are skipped via `continue`, but the degraded check already executed on them. This is correct for the section preamble (where the marker lives), but the loop also visits finding body lines — text that appears after a `### AUDIT-…` header but before the next `###` or the section end. If a finding body happens to contain the string `Fleet: DEGRADED` (e.g., a finding reporting on degraded-fleet logic), the section would be spuriously flagged as degraded.

The consequence is conservative rather than hazardous: a false-positive prevents dampening instead of allowing it. But it would produce a misleading diagnostic message ("Not dampened: … DEGRADED fleet") when the fleet was actually healthy and the finding body just happened to name the concept. The fix is to scan only the non-entry lines between the section header and the first `###` entry, or add an anchor to the marker regex (e.g., `^[_\s]*Fleet:\s*DEGRADED\b` checked only while `currentEntryHeader === null`).

---

### AUDIT-20260620-27 — `consecutiveQuietEngages` applies `every()` across the full `recentRunCounts` window — a single historical degraded run outside the threshold can block convergence indefinitely

Finding-ID: AUDIT-20260620-27 (claude-03 + codex-01; cross-model)
Status:     open
Severity:   blocking
Per-lane:   claude=informational, codex=blocking
Decision:   adjudicated (gate-counted blocking) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — blocking retained.
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:193–196 (`consecutiveQuietEngages`)

```typescript
const consecutiveQuietEngages =
    recentRunCounts.length >= threshold &&
    recentRunCounts.every((r) => r.rawHighPlusCount === 0 && !r.degraded);
```

`recentRunCounts.every(…)` checks ALL elements of the window, not just the most recent `threshold` of them. If the window holds more than `threshold` entries, a degraded run at position `threshold+1` (older than the threshold horizon) would still cause `every()` to return false, preventing `consecutiveQuietEngages` from firing even after `threshold` subsequent healthy+clean runs have been recorded.

The test suite exercises only exact threshold-sized windows (threshold=2, 2 runs in each test), so this scenario is untested. The US2 change only adds `&& !r.degraded` to the pre-existing `rawHighPlusCount === 0` condition, so this is a latent shape issue rather than a US2 regression — but the new condition makes it newly reachable in practice: before US2, a run with 0 HIGH+ could not block `consecutiveQuietEngages` regardless of how old it was; now a degraded-but-0-HIGH+ run at position threshold+1 can. Whether the window is genuinely capped at `threshold` (making `every()` correct) or is open-ended depends on the `recentRunCounts` construction upstream, which is not visible in this diff. The fix is either to confirm the window is capped, or to change the check to `recentRunCounts.slice(0, threshold).every(…)` to make the intent explicit.

## 2026-06-20 — audit-barrage lift (20260620T082027834Z-029-govern-operability-phase-2)

### AUDIT-20260620-28 — Integration gap: `renderQuietSection` degraded branch is not tested through the render→parse contract

Finding-ID: AUDIT-20260620-28
Status: migrated-to-backlog TASK-339
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/promote-findings/degraded-not-quiet.test.ts:28-43` and `src/subcommands/audit-barrage-lift-render.ts:91-109`

The dampener tests in `degraded-not-quiet.test.ts` drive `checkBarrageDampener` with hand-crafted section text (the `degradedSection()` helper, lines 28–43), not with the actual output of `renderQuietSection`. The `terminal-state.test.ts` file does verify that `renderSection` stamps `Fleet: DEGRADED` when degraded (lines 67–73), but there is no parallel test for the zero-findings branch — `renderQuietSection` with a degraded fleet — whose output format differs from `renderSection`'s degraded output.

The two functions produce different prose. `renderQuietSection` (degraded path, lift-render.ts:97-103) emits `"0 findings, but absence over killed/timed-out lanes is NOT a clean signal. This run is NOT counted..."`, while the hand-crafted helper used by the dampener tests emits `"— this run is NOT counted..."`. Both contain `Fleet: DEGRADED` so the dampener regex matches both — but only by coincidence of the shared substring, not because a test ever ran `renderQuietSection` → `checkBarrageDampener` end-to-end.

If `renderQuietSection`'s degraded branch were edited to use a different marker string (e.g. `Status: DEGRADED`), every existing test would still pass: `terminal-state.test.ts` only calls `renderSection`, and `degraded-not-quiet.test.ts` uses hand-crafted input. The dampener would silently start treating degraded-clean runs as quiet, which is exactly the failure this feature exists to prevent. A one-line test calling `renderQuietSection` with `{ produced: 1, configured: 2 }` and asserting the output matches `DEGRADED_MARKER_RE` would close the gap.

---

### AUDIT-20260620-29 — Stale comment: "degraded+0-findings branch above already records nothing" is wrong after fix commit

Finding-ID: AUDIT-20260620-29
Status: migrated-to-backlog TASK-340
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/audit-barrage-lift.ts` — the comment block immediately before the `renderSection` call (lines ~395-401 in the final file, added in commit 09d48928)

The comment reads: `"the degraded+0-findings branch above already records nothing; this covers degraded+findings, where 0 HIGH+ from the survivors is not clean."` This was correct when commit 09d48928 landed — at that point, the degraded+0-findings path returned early with no section written. The subsequent fix commit (2692615c) changed that path to record a DEGRADED-marked quiet section rather than nothing. The comment was not updated.

After the fix, the "branch above" (`if (findings.length === 0)`) now records a DEGRADED-marked section in both the healthy and degraded cases. The comment's claim that it "records nothing" is factually wrong and will mislead a future reader into thinking the zero-findings branch is still the silent early-return. A correct update would say the zero-findings branch records a DEGRADED-marked quiet section (not counted as quiet by the dampener), so the `renderSection` path below covers only the case where surviving lanes actually produced findings.

---

### AUDIT-20260620-30 — `DEGRADED_MARKER_RE` lacks a leading word boundary, allowing substring matches

Finding-ID: AUDIT-20260620-30
Status: migrated-to-backlog TASK-341
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/scope-discovery/promote-findings/check-barrage-dampener.ts:21`

The pattern is `/Fleet:\s*DEGRADED\b/i`. It has `\b` after `DEGRADED` but not before `Fleet`, so it would match a preamble line containing `badFleet: DEGRADED` or `notAFleet: DEGRADED`. The `sawEntry` guard (lines 130–134) prevents finding bodies from being scanned, making this a very low-probability false positive in practice. However, for a security- and correctness-sensitive signal — the `degraded` flag blocks convergence — a precise regex (`/\bFleet:\s*DEGRADED\b/i`) costs nothing and eliminates the ambiguity entirely.

## 2026-06-20 — audit-barrage lift (20260620T082345159Z-029-govern-operability-phase-2)

### AUDIT-20260620-31 — Stale JSDoc on `renderQuietSection` directly contradicts new implementation

Finding-ID: AUDIT-20260620-31
Status: migrated-to-backlog TASK-342
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift-render.ts:89-91 (the JSDoc comment above the updated function signature)

The block comment retained above `renderQuietSection` in the diff reads:

```
* (Degraded clean runs are NOT recorded — FR-007: absence over killed lanes is not
* a clean signal; that branch is gated in the lift, not here.)
```

This describes the OLD behavior — the early return that was removed in `audit-barrage-lift.ts`. The entire point of this commit is to make degraded clean runs ALWAYS record a section (carrying the `Fleet: DEGRADED` marker). The new `renderQuietSection` implementation does exactly the opposite of what the comment asserts: when `fleet.produced < fleet.configured`, it renders and returns a DEGRADED-marked section.

A reader — human or agent — encountering this function will read the doc comment as the authoritative contract statement, conclude degraded runs are not recorded here, and potentially write a new call-site that skips the fleet argument for degraded cases on the assumption the function is a no-op for them. The comment is also the explanation of *why* the function exists; the wrong explanation at the top undermines every other reasoning chain that flows from it.

The fix is to update the comment to describe the new contract: `renderQuietSection` now covers both the healthy-quiet path AND the degraded-quiet path; the `fleet` parameter controls which branch is rendered; both paths produce a section.

---

### AUDIT-20260620-32 — Stale inline comment at `renderSection` call site describes the removed early-return

Finding-ID: AUDIT-20260620-32
Status: migrated-to-backlog TASK-343
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts (the new `+` comment block immediately before the `renderSection` call at the bottom of the findings branch)

The newly-added comment says:

```
// specs/029 US2 (FR-007): when this findings-section is recorded over a
// DEGRADED fleet (a surviving lane found something while others were killed),
// stamp the `Fleet: DEGRADED` marker so the dampener never counts this run as
// quiet (the degraded+0-findings branch above already records nothing; this
// covers degraded+findings...
```

The parenthetical `"the degraded+0-findings branch above already records nothing"` is factually wrong in the post-commit state. The degraded+0-findings branch above NOW records a section — the entire change from `fix(029)` commit is that it records a `Fleet: DEGRADED`-marked section instead of returning early. This comment was drafted to describe the OLD two-branch split (record-nothing vs record-findings), but it was not updated when the zero-findings branch behavior was changed in the same commit.

An agent reading this comment to understand the branching logic will infer that the zero-findings/degraded case is handled by NOT recording anything. It will conclude that the `renderSection` call only needs the degraded marker when findings are non-empty, because "the other branch handles the degraded-quiet case by silence." This is the wrong mental model and could lead to a regression if the degraded-quiet path is touched later.

Fix: replace the parenthetical with the accurate description — both branches now record a section; the zero-findings branch records via `renderQuietSection` with the degraded fleet argument; this call covers degraded+findings.

---

### AUDIT-20260620-33 — `renderQuietSection` degraded path has no unit test

Finding-ID: AUDIT-20260620-33
Status: migrated-to-backlog TASK-344
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/audit-barrage/terminal-state.test.ts (entire file); src/subcommands/audit-barrage-lift-render.ts:97-113 (new degraded branch in `renderQuietSection`)

`terminal-state.test.ts` imports only `renderSection` — not `renderQuietSection`. The new conditional block inside `renderQuietSection` (lines 97–113 in the diff, the `if (fleet !== undefined && fleet.produced < fleet.configured)` branch) is exercised nowhere in the test suite. The dampener integration tests in `degraded-not-quiet.test.ts` use manually-constructed strings that look like what `renderQuietSection` would produce, but they never call the function.

The risk: if `renderQuietSection`'s degraded branch produced the wrong marker string — say, `Fleet:DEGRADED` (no space), or `fleet: DEGRADED` (lowercase), or omitted the keyword entirely — the `DEGRADED_MARKER_RE = /Fleet:\s*DEGRADED\b/i` regex in the dampener would still match the hand-crafted test strings, making all dampener tests green while the production path is silently broken. The test suite would never catch the discrepancy.

`renderSection`'s degraded path IS tested (three cases in `terminal-state.test.ts`). Adding parallel tests for `renderQuietSection` closes the gap: verify that `renderQuietSection(date, run, { produced: 1, configured: 2 })` matches `/Fleet:\s*DEGRADED/i` and that `renderQuietSection(date, run, { produced: 2, configured: 2 })` does NOT.

---

### AUDIT-20260620-34 — `completedNonConvergedAnnotation` silently drops nonzero-exit info when `reportBytes === 0`

Finding-ID: AUDIT-20260620-34
Status: migrated-to-backlog TASK-345
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/audit-barrage/types.ts:347 (the `kind` ternary)

The new ternary is:

```typescript
const kind = lane.reportBytes === 0 ? 'zero-byte' : `nonzero-exit (${lane.exitCode})`;
```

For a lane with `exitCode: 0 && reportBytes: 0` this is correct: the exit was clean but the output file is empty — `zero-byte` is the meaningful label. However for a lane with `exitCode: 3 && reportBytes: 0`, the function emits `DEGRADED [zero-byte] (exit 3, report bytes 0)`. The exit code IS printed in the longer string, but `kind` is labeled `zero-byte` exclusively. The `zero-byte` label suggests the process exited cleanly but produced no output; `exit 3` says otherwise.

This is a diagnostic readability issue rather than a correctness bug (the full annotation string does carry the exit code), and the combined case is likely rare in practice. The exit-code information is not lost. The blast-radius is limited to human-readable output interpretation. A minor fix would be to check both conditions: `lane.reportBytes === 0 && lane.exitCode === 0 ? 'zero-byte' : lane.reportBytes === 0 ? 'zero-byte/nonzero-exit' : \`nonzero-exit (${lane.exitCode})\`` — or equivalently use a two-step label that names both facts when both apply.

### AUDIT-20260620-35 — Stale comments still describe degraded clean runs as unrecorded

Finding-ID: AUDIT-20260620-35
Status: migrated-to-backlog TASK-346
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts:81-90; src/subcommands/audit-barrage-lift.ts:383-387

The implementation now records a DEGRADED-marked section for 0-finding degraded runs, but two comments still state the old contract. In `audit-barrage-lift-render.ts:89-90`, the function doc says “Degraded clean runs are NOT recorded”; in `audit-barrage-lift.ts:386`, the comment says “the degraded+0-findings branch above already records nothing.” Both contradict the new logic at `audit-barrage-lift.ts:347-378` and `renderQuietSection`’s degraded branch at `audit-barrage-lift-render.ts:104-110`.

Blast radius is low because the executable behavior is correct and nearby comments also explain the new contract, so an adopter running the code is not broken. The risk is documentation drift in a governance-heavy path: a maintainer or unattended editing agent could preserve or reintroduce the old “record nothing” behavior by trusting these stale comments. A reasonable fix is to update both comments so they consistently say degraded clean runs are recorded with `Fleet: DEGRADED` and excluded by the dampener.

## 2026-06-20 — audit-barrage lift (20260620T092356770Z-029-govern-operability-phase-2)

### AUDIT-20260620-36 — Stale parenthetical in `audit-barrage-lift.ts` comment contradicts the new behavior

Finding-ID: AUDIT-20260620-36
Status: migrated-to-backlog TASK-347
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts (the comment block immediately above the `renderSection` call in the findings-section branch)

The comment reads:

```
// specs/029 US2 (FR-007): when this findings-section is recorded over a
// DEGRADED fleet (a surviving lane found something while others were killed),
// stamp the `Fleet: DEGRADED` marker so the dampener never counts this run as
// quiet (the degraded+0-findings branch above already records nothing; this
// covers degraded+findings, where 0 HIGH+ from the survivors is not clean).
```

The parenthetical "the degraded+0-findings branch above already records nothing" describes the **old** behavior — the behavior that commit `2692615c` ("fix(029): US2 govern triage — degraded clean run must record a marked section") was explicitly shipped to retire. After that fix, the degraded+0-findings branch no longer silently returns 0: it records a DEGRADED-marked quiet section so the dampener sees it as the most-recent run and blocks convergence. The comment was written for the old shape and not updated to reflect the new shape.

This is not cosmetic. A future reader of the comment — including a fresh agent session — would conclude that the degraded+0-findings case leaves no audit-log entry. They could propose "fixing" the `renderSection` call by adding an early return for that case, or write a test that asserts no section is recorded for degraded+0-findings, re-introducing exactly the bug that FR-007 exists to close. The comment is the most-prominent documentation of the two branches' interaction and it currently inverts the post-fix invariant. Fix: update the parenthetical to state that the degraded+0-findings branch now records a DEGRADED-marked quiet section, and that the `renderSection` call here covers the degraded+findings path where surviving lanes found at least one entry.

---

### AUDIT-20260620-37 — No visible test coverage for US3 identity-keying and jitter-suppression logic (FR-010 / SC-001)

Finding-ID: AUDIT-20260620-37
Status: migrated-to-backlog TASK-348
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts (the `seenMaxRank` accumulation loop, lines ~268-320 in the diff) and tests/promote-findings/

The diff adds substantial new logic to `checkBarrageDampener`: a full file-order walk that accumulates a `seenMaxRank` map and produces per-section `newHighPlusCount` values. This logic implements two distinct behavioral contracts:

- **FR-010 (jitter suppression):** a HIGH+ finding whose signature was previously seen only at a lower severity is NOT counted — it is treated as a re-rating artefact, not new signal, and must not reset the consecutive-quiet streak.
- **SC-001 (persistent-high blocker):** a HIGH+ finding whose signature was previously seen at HIGH or blocking IS counted — a real defect that stays HIGH must continue to block convergence, never converge.

Both contracts live entirely in the `priorRank === undefined || priorRank >= HIGH_RANK` branch and the map fold that follows. Neither contract is exercised by any test file visible in the diff. The two new test files — `terminal-state.test.ts` (T008, US2, FR-006) and `degraded-not-quiet.test.ts` (T011, US2, FR-007/008) — cover the degraded-fleet-detection surface only. The commit messages claim T016-T018 cover US3, but no corresponding test files appear in the diff.

The missing cases are:

1. A log where a finding is MEDIUM in section N and HIGH in section N+1: `newHighPlusCount` for section N+1 should be 0 (jitter, FR-010).
2. A log where a finding is HIGH in section N and HIGH in section N+1: `newHighPlusCount` for section N+1 should be 1 (persistent, SC-001) — and the dampener should NOT converge.
3. The interaction of FR-010 suppression with the single-run-clean rule: if the most-recent run's only "HIGH" is a jitter re-rating, `singleRunCleanEngages` should fire.

Without these tests, the identity-keying logic is untestable by CI and a future refactor of the `seenMaxRank` loop (e.g. flipping `>=` to `>` in the persistent-high guard) would not be caught by the test suite. The correctness surface here is exactly the one the feature exists to harden.

---

### AUDIT-20260620-38 — `kind` label silently drops nonzero exit code when `reportBytes === 0`

Finding-ID: AUDIT-20260620-38
Status: migrated-to-backlog TASK-349
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/audit-barrage/types.ts (the `kind` computation, ~line 349 in the diff)

```typescript
const kind = lane.reportBytes === 0 ? 'zero-byte' : `nonzero-exit (${lane.exitCode})`;
return (
  ` — completed but DEGRADED [${kind}] (exit ${lane.exitCode}, ` +
  `report bytes ${lane.reportBytes}); not counted as produced`
);
```

The `kind` check prioritises `reportBytes === 0` over exit code. When a lane has both `exitCode > 0` **and** `reportBytes === 0`, the bracket label reads `DEGRADED [zero-byte]` — the nonzero exit is absent from the `kind` field. The full annotation still surfaces `exit N` in the parenthetical, so the information is not lost. But the structured `[kind]` slot is the first thing a reader's eye parses, and "zero-byte" is not equivalent to "zero-byte AND crashed". A consumer that parses the `[kind]` token to categorise lanes (for aggregation or alerting) would classify this as a zero-byte lane rather than a combined failure. A more precise label for this case would be `zero-byte+nonzero-exit (${lane.exitCode})` or at minimum `nonzero-exit (${lane.exitCode}, 0 bytes)`. The fix is a small string change in the ternary's true branch.

---

### AUDIT-20260620-39 — `renderQuietSection` name contradicts its new dual responsibility

Finding-ID: AUDIT-20260620-39
Status: migrated-to-backlog TASK-350
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts (~line 92 in the diff)

After the US2 fix, `renderQuietSection` conditionally renders two distinct section shapes depending on the `fleet` parameter: a quiet (clean) section when the fleet is healthy, and a DEGRADED-marked section when `fleet.produced < fleet.configured`. The name `renderQuietSection` accurately describes only the healthy-fleet branch. The degraded-fleet branch renders a section explicitly labelled "NOT counted as a quiet run" — the semantic opposite of "quiet". Any future caller that reaches for `renderQuietSection` expecting a clean-section renderer will be surprised to get a DEGRADED section if they pass a degraded fleet. The low-risk fix is a rename to `renderZeroFindingSection` or `renderCleanOrDegradedSection` plus a corresponding update to the call site in `audit-barrage-lift.ts`. The type signature already encodes the dual behaviour via the optional `fleet` parameter; the name should match.

### AUDIT-20260620-40 — Stale comments still describe degraded clean runs as unrecorded

Finding-ID: AUDIT-20260620-40
Status: migrated-to-backlog TASK-351
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts:81-90 and src/subcommands/audit-barrage-lift.ts:383-387

Two comments still encode the old behavior after the implementation changed to record DEGRADED-marked 0-finding sections. `renderQuietSection` says “Degraded clean runs are NOT recorded” at lines 89-90, but lines 104-110 now explicitly return a degraded quiet section. `runAuditBarrageLift` says the “degraded+0-findings branch above already records nothing” at lines 383-387, but lines 347-378 now write the degraded section.

Blast radius is low because the runtime behavior appears correct and the dampener reads the marker as intended. The risk is maintenance drift: a later edit could trust the stale comments and reintroduce the exact “degraded run is invisible” failure this feature is meant to prevent. The fix is to update both comments to match the current contract: degraded 0-finding runs are recorded, but marked so the dampener excludes them from quiet convergence.

## 2026-06-20 — audit-barrage lift (20260620T093052012Z-029-govern-operability-phase-3)

### AUDIT-20260620-41 — `extract-barrage-findings.ts` implementation is opaque — core identity-keying primitives are unauditable from this diff

Finding-ID: AUDIT-20260620-41
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts (binary diff)

The file containing `findingSignature`, `normalizeHeading`, `primaryFilePath`, and `NormalizedSeverity` shows as a binary diff. All three primitives are foundational to the entire US3 identity-keying mechanism: `normalizeHeading` determines whether two differently-worded headings collapse to the same key; `primaryFilePath` determines how `src/a.ts:42` and `src/a.ts:99:1` resolve to the same file token; `findingSignature` combines both into the Map key that drives FR-010 jitter suppression and SC-001 persistence detection.

The behavior of these functions is inferred entirely from the tests in `tests/promote-findings/finding-signature.test.ts`, not from their implementation. If the implementation handles any input differently than the tests assume — Unicode normalization, Windows-style `\` paths, bare filenames with no extension, surface fields with embedded semicolons or commas in unusual positions, empty-string inputs — those defects are invisible here. The blast radius is not hypothetical: a bug in `primaryFilePath` (e.g., failing to strip line numbers from a `:line` variant not covered by the four test cases) would cause signatures to diverge across runs even when the finding is the same, making FR-010 jitter suppression fail silently. The entire identity-keying contract rests on an implementation that cannot be reviewed.

---

### AUDIT-20260620-42 — Intra-section signature overcounting: duplicate signatures within one lift section each increment `newHighPlusCount`

Finding-ID: AUDIT-20260620-42
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:285–314

The identity-keying loop in `checkBarrageDampener` (lines ~285–314 of the post-diff file) separates counting from folding:

```typescript
for (const count of fileOrderedCounts) {
  let newHigh = 0;
  for (const finding of count.allFindings) {        // ← counting pass
    if (SEVERITY_RANK[finding.severity] < HIGH_RANK) continue;
    const priorRank = seenMaxRank.get(finding.signature);
    if (priorRank === undefined || priorRank >= HIGH_RANK) newHigh += 1;
  }
  newHighCounts.push(newHigh);
  for (const finding of count.allFindings) {        // ← folding pass
    ...
    seenMaxRank.set(finding.signature, rank);
  }
}
```

The counting pass runs to completion before `seenMaxRank` is updated for this section. This means that if `count.allFindings` contains the same signature twice at HIGH (two independent model lanes in a multi-model barrage that both reported the same root issue but under slightly different IDs with identical normalized heading + primary file), `newHigh` is incremented twice — once per occurrence — rather than once per unique logical finding.

In a real audit barrage (N models × 1 lift section), the same defect is often surfaced independently by multiple models and ends up as separate entries in the same lift section. After lift dedup (if any), entries with the same normalized heading and file could still both survive as separate `### AUDIT-…` entries with distinct IDs. The FR-011 contract says "a genuinely new HIGH (signature unseen in all earlier sections) MUST still reset/block the streak the first time it appears" — the unit is the logical finding, not the per-entry occurrence. The overcounting won't cause false dampening (it makes the system more conservative), but it violates the identity-contract's "one logical finding = one count" invariant and makes `newHighPlusCount` uninterpretable as a cardinality.

A fix: accumulate `allFindings` into a `Set<signature>` for HIGH+ during the counting pass rather than looping over the raw array.

---

### AUDIT-20260620-43 — Empty `Surface:` field produces signature collision for all same-heading entries

Finding-ID: AUDIT-20260620-43
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:220–232 (inner j-loop)

When an entry body contains no `Surface:` line, the `surface` variable stays `''`, and `findingSignature(heading, '')` is called. The behavior of `primaryFilePath('')` with an empty argument is not tested anywhere in `tests/promote-findings/finding-signature.test.ts` — the four test cases cover `src/x.ts:12:3`, multi-file, bare file path, and no-line variants, but never empty string.

If `primaryFilePath('')` returns `''`, then ALL no-surface entries whose headings normalize to the same value will share the same signature across ALL sections. Consider two structurally-unrelated findings both titled "Missing validation" (common in barrage output), neither with a Surface field. They would collide on signature. If one appeared at HIGH in run N and a different (but same-heading, no-surface) finding appeared at HIGH in run N+1, the second occurrence would be classified as a re-rate of the first (FR-010 jitter) and suppressed — meaning a real, genuinely-new HIGH defect escapes the dampener.

The surface field is optional in the audit log format (some findings are system-level rather than file-level). The code path `let surface = ''` / no-surface-line / `findingSignature(heading, '')` is a real production path, not a synthetic edge case. A test and, if necessary, a sentinel fallback (e.g., `primaryFilePath` returning a distinct empty-path sentinel) is needed to nail down the contract.

---

### AUDIT-20260620-44 — `seenMaxRank` never decreases — HIGH→MEDIUM→HIGH re-emergence treated as SC-001 persistent, not FR-011 new

Finding-ID: AUDIT-20260620-44
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:295–309 (folding pass)

The folding pass stores only the MAX-severity rank ever seen for a signature:

```typescript
const prior = seenMaxRank.get(finding.signature);
if (prior === undefined || rank > prior) seenMaxRank.set(finding.signature, rank);
```

`seenMaxRank` never decreases. A finding whose severity track is HIGH (run N) → MEDIUM (run N+1) → HIGH (run N+2) will have `seenMaxRank[sig] = HIGH_RANK` throughout. When run N+2 is counted, `priorRank >= HIGH_RANK` is true, so the finding is treated as SC-001 persistent — "a real defect that was already HIGH and stays HIGH." But semantically, the finding *downgraded* in run N+1, suggesting it was partially addressed. If it re-emerges at HIGH in run N+2, it may be a new root cause (or the fix was incomplete), and a fresh FR-011 "genuinely new" count would be the more accurate signal.

SC-001 as documented says "a same-HIGH-every-round blocker" — the phrase "every round" implies it was continuously HIGH, not that it ever dipped. The code implements "ever HIGH", not "continuously HIGH". This divergence from SC-001's wording could cause the dampener to stay blocked for a finding that appeared to have been resolved (downgraded to MEDIUM), thereby masking a real improvement while still demanding governance attention. No test covers the HIGH→MEDIUM→HIGH trajectory; the only SC-001 test (`run-1: HIGH, run-2: HIGH`) exercises the continuously-persistent case.

---

### AUDIT-20260620-45 — FR-012 test description contradicts what the test actually demonstrates

Finding-ID: AUDIT-20260620-45
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/promote-findings/dampener-identity.test.ts:6–19, 140–148

The module-level JSDoc comment (lines 6–19) describes FR-012 as:

> *"a HIGH that appears in ONLY ONE run of the recent window (transient, never persisted across ≥2 runs) is not treated as a stable/persistent blocker for the streak"*

But the only test under `describe('dampener: cross-round hysteresis (US3, FR-012)', ...)` is titled "a NEW HIGH seen in only ONE run of the window still resets the streak (FR-011 preserved)." The test asserts `r.dampened === false` — i.e., that a transient HIGH *does* block the streak. A developer reading the FR-012 comment first and the test title second will find an apparent contradiction: "not a stable/persistent blocker" vs. "still resets the streak."

The intended meaning (a transient HIGH blocks once but won't keep blocking after it disappears) is only inferable after understanding FR-011 and the dampener logic together — the comment alone reads as "transient HIGHs don't block," which is wrong. The second SC-001 test also sits in the same `describe` block, further muddling what FR-012 actually means. A future maintainer adding a "jitter suppression was too aggressive" fix could be misled by this framing into removing the FR-011 blocking behaviour.

---

### AUDIT-20260620-46 — No test for the recovery case: dampening re-engages after a HIGH disappears

Finding-ID: AUDIT-20260620-46
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/promote-findings/dampener-identity.test.ts (missing test surface)

The test suite covers: a jitter suppression (FR-010), a genuine new HIGH (FR-011), two consecutive jitter-only runs dampening (FR-010 + consecutive-quiet), first-occurrence HIGH (FR-011), and a persistent HIGH (SC-001). Missing is the recovery case: a HIGH appears in run N (blocking, FR-011), then is absent from runs N+1 and N+2 (both `newHighPlusCount === 0`, not degraded), after which the dampener should engage via the consecutive-quiet rule.

This is the scenario FR-012's hysteresis comment is trying to describe: a transient HIGH does block in the run where it appears, but once it disappears the streak counter resets and can reach dampening again. Without a test for this, the claim that seenMaxRank's max-rank map doesn't permanently block re-dampening after a HIGH is resolved rests entirely on code inspection. If a future change to `newHighCounts` calculation accidentally carries stale HIGH state across sections, no test would catch the regression.

### AUDIT-20260620-47 — Code-change-blind history can suppress a real HIGH and open the gate

Finding-ID: AUDIT-20260620-47
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:288-300

The dampener builds `seenMaxRank` from every earlier audit-log section and suppresses a current HIGH when the same signature was previously seen only below HIGH. The code has no checkpoint, run fingerprint, or “unchanged code” boundary in the identity/history map, even though FR-010 is specifically about a finding re-rated upward “on unchanged code.” If the code actually changed and the same heading/file now represents a real HIGH, lines 292-293 classify it as non-new jitter; then `singleRunCleanEngages` can open the gate at lines 337-341 because `newHighPlusCount === 0` despite `rawHighPlusCount === 1`.

Blast radius: an adopter can graduate with a real current HIGH after a code change if an earlier run logged the same signature at low/medium. A reasonable fix is to scope the “seen lower” suppression to the current unchanged checkpoint/fingerprint epoch, or include the relevant checkpoint/hunk fingerprint epoch in the dampener history key.

### AUDIT-20260620-48 — Line-range surfaces are not reduced to the primary file path

Finding-ID: AUDIT-20260620-48
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:144-146

`primaryFilePath()` only strips `:line` and `:line:col` suffixes via `/:\\d+(?::\\d+)?\\s*$/`. The audit-barrage output format uses line ranges such as `path:89-91`, and existing audit-log entries in this feature use that shape. Those do not match the regex, so the supposed `(normalized-heading, primary-file-path)` signature actually includes `:89-91`.

Blast radius: the same finding on the same file can get different signatures when a model reports a different line range, defeating both dampener identity and the planned lift dedup. A reasonable fix is to strip `:start-end` and `:start:end`/column variants before building the signature, with tests for the line-range shapes the prompt asks models to emit.

### AUDIT-20260620-49 — Shared signature source contains a literal NUL byte

Finding-ID: AUDIT-20260620-49
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:157-158

`findingSignature()` joins the normalized heading and file path with an actual NUL byte in the TypeScript source. That made Git report the file as binary in the audited diff, hiding the implementation changes from normal textual review. Even if the runtime string works, this violates the repository’s text-review workflow and makes future audits, patch review, and some text tooling brittle.

Blast radius: maintainers and audit tooling lose line-level visibility into a core governance primitive. A reasonable fix is to use an escaped delimiter such as `'\0'` or a printable delimiter with explicit escaping, so the source file remains normal UTF-8 text and diffs stay inspectable.

## 2026-06-20 — audit-barrage lift (20260620T093651476Z-029-govern-operability-phase-3)

### AUDIT-20260620-50 — Code-change-blind history can suppress a real current HIGH

Finding-ID: AUDIT-20260620-50
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:288-300, 337-341

The dampener suppresses a current HIGH when the same signature was previously seen only below HIGH, but the history key is just `finding.signature`; it has no checkpoint, hunk fingerprint, or unchanged-code boundary. FR-010 is scoped to a finding re-rated upward “on unchanged code,” but lines 288-300 build `seenMaxRank` across every earlier audit-log section regardless of whether the audited code changed.

Blast radius is high: a real current HIGH after a code change can be classified as jitter if an older LOW/MEDIUM had the same heading and primary file. Then the single-run-clean branch at lines 337-341 can dampen because `newHighPlusCount === 0` even though `rawHighPlusCount === 1`. The fix is to scope the “seen lower” suppression to the relevant unchanged checkpoint/fingerprint epoch, or include that epoch in the dampener identity history.

### AUDIT-20260620-51 — Line-range surfaces are not normalized to the primary file path

Finding-ID: AUDIT-20260620-51
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:144-146

`primaryFilePath()` strips only `:line` and `:line:col` suffixes with `/:\\d+(?::\\d+)?\\s*$/`. The audit prompt’s `Surface:` format allows line ranges, and the repo’s own audit logs use shapes like `src/file.ts:89-91`; those do not match this regex, so the signature keeps the range as part of the supposed primary file path.

Blast radius is high because the same finding on the same file can receive different signatures when models or rounds cite different line ranges. That defeats FR-010 jitter suppression and the planned FR-016 lift dedup. A reasonable fix is to strip `:start-end` and column/range variants before building the signature, with tests using the line-range shapes the prompt asks models to emit.

### AUDIT-20260620-52 — Shared signature source contains a literal NUL byte

Finding-ID: AUDIT-20260620-52
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:157-158

`findingSignature()` joins the normalized heading and primary file path with a literal NUL byte in the TypeScript source. That is why the supplied diff renders `extract-barrage-findings.ts` as binary, hiding the implementation of the core identity-keying primitive from normal line-level review.

Blast radius is medium: runtime behavior may work, but review, audit, patch, and text tooling lose visibility into a load-bearing governance primitive. Use an escaped delimiter such as `'\0'`, or a printable delimiter with explicit escaping, so the source remains normal text and future diffs stay inspectable.

## 2026-06-20 — audit-barrage lift (20260620T100206027Z-029-govern-operability-phase-2)

### AUDIT-20260620-53 — Stale comment says the degraded zero-finding branch records nothing

Finding-ID: AUDIT-20260620-53
Status: migrated-to-backlog TASK-352
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts:396-400

The comment for the degraded findings-section path still says “the degraded+0-findings branch above already records nothing,” but the new code intentionally changed that behavior: lines 349-391 now always record a section, and degraded zero-finding runs get a `Fleet: DEGRADED` marker. This is documentation drift inside the audited behavior.

Blast radius is low because the executable code and nearby earlier comment are clear, so adopters running the command get the correct behavior. The risk is mainly future maintenance: an unattended agent reading this line could preserve or reintroduce the old “record nothing” model. The fix is to update line 399 to say the degraded+0-findings branch records a DEGRADED-marked zero-finding section, while this branch handles degraded runs with extracted findings.

## 2026-06-20 — audit-barrage lift (20260620T101249184Z-029-govern-operability-phase-3)

### AUDIT-20260620-54 — Lift never consumes the new finding signature for cross-run dedup

Finding-ID: AUDIT-20260620-54
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:154-163; src/subcommands/audit-barrage-lift.ts:394-431

`findingSignature()` is documented as the shared key for both the dampener and “the lift cross-run dedup (FR-016)” at `extract-barrage-findings.ts:154-163`, but the lift path still only computes the next ID and appends every extracted finding (`audit-barrage-lift.ts:394-431`). There is no read of existing audit-log entries into signatures and no filtering/merging before `renderSection`.

The downstream consequence is moderate: the dampener now suppresses same-signature re-rate jitter, but the lift can still append duplicate audit-log entries for the same `(heading, primary-file-path)` across runs. That does not break the new dampener outright, but it leaves one of the stated shared-signature consumers unimplemented and lets audit-log noise compound over time. A reasonable fix is to parse existing lift sections into `findingSignature(heading, surface)` keys and have the lift skip or explicitly annotate already-recorded findings using the same helper.

### AUDIT-20260620-55 — Single-run-clean can engage after a run that raw-surfaced HIGH findings

Finding-ID: AUDIT-20260620-55
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:373-386

The single-run-clean branch was changed from raw `0 HIGH+ AND 0 MEDIUM` to `newHighPlusCount === 0 && rawMediumCount === 0` at `check-barrage-dampener.ts:373-386`. That means a most-recent run that raw-surfaced a HIGH re-rate on unchanged code, with no medium findings, immediately dampens via the single-run rule even though `rawHighPlusCount` is nonzero. The new tests even establish this state in the first case but only assert `newHighPlusCount`, not `dampened`.

Blast radius is high because this is the gate decision itself: a downstream operator can get “hook should skip” after the latest barrage visibly reported a HIGH finding. If FR-010 is meant to excuse re-rate jitter only from resetting the N-run identity-keyed quiet streak, the single-run-clean path should continue requiring `rawHighPlusCount === 0`; if the intended behavior really changed, the test suite needs an explicit assertion documenting that a raw-HIGH jitter run is considered “single-run clean.”

## 2026-06-20 — audit-barrage lift (20260620T102323012Z-029-govern-operability-phase-3)

### AUDIT-20260620-56 — Stale parenthetical `AUDIT-BARRAGE-codex-01` in render comments now ambiguously refers to two distinct findings

Finding-ID: AUDIT-20260620-56
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts:98, src/scope-discovery/promote-findings/check-barrage-dampener.ts:32

The existing comment in `renderQuietSection` (and its twin in `renderSection`) carries the tag `AUDIT-BARRAGE-codex-01` to name the US2 barrage finding about degraded-fleet sections. The new code in `check-barrage-dampener.ts` introduces an entirely separate concept — the audited code epoch (`Code-sha:`) — and attributes it *also* to `AUDIT-BARRAGE-codex-01`. Audit-barrage finding IDs reset to `-01` at the first finding each model emits per run, so two barrage runs (US2 and US3) can each independently produce a `codex-01`. That convention is fine in the audit log itself (where `specs/029 US2` vs. `specs/029 US3` disambiguates), but within source-code comments the `specs/029 US2` qualifier is easy to miss. A future reader who greps for `AUDIT-BARRAGE-codex-01` will find two comment clusters pointing at unrelated requirements, with no indication that the ID is ambiguous. The blast-radius is limited to comprehension — no runtime logic depends on these tags — but documentation rot that conflates the degraded-fleet rule with the code-epoch rule could mislead a future author into incorrectly changing either.

Fix: retag the US3 code-epoch comments with a unique discriminator (e.g., `AUDIT-BARRAGE-codex-US3-01` or `AUDIT-BARRAGE-codex-02`) so each comment resolves to exactly one finding.

---

### AUDIT-20260620-57 — `tip.sha` content embedded in audit log preamble without format validation

Finding-ID: AUDIT-20260620-57
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts:306-318

At lines 306–318 of the diff, `tipSha` is read from `opts.runDir/tip.sha`, trimmed, and written verbatim into the audit-log preamble as `Code-sha: ${tipSha}\n`. No validation is applied to confirm that the content is a valid 40-hex-character git SHA. If the file is absent the code skips the field correctly. But if the file *exists* with malformed content — a NUL byte, a stray newline embedded before the trim, or arbitrary text — the validation gap has two consequence paths:

1. **Preamble injection.** JavaScript's `String.prototype.trim()` strips only leading/trailing whitespace; it does not remove embedded `\n`, `\r`, or NUL bytes (`\x00`). A `tip.sha` file containing `abc123\nFleet: DEGRADED` would produce `Code-sha: abc123\nFleet: DEGRADED\n` in the preamble. The `DEGRADED_MARKER_RE = /Fleet:\s*DEGRADED\b/i` scan in `countHighPlusInSection` operates over every pre-entry line, so this injected line would set `degraded = true`, falsely blocking dampener convergence for a healthy run.

2. **Epoch key corruption.** A NUL byte in the file produces `tipSha = '\x00'`, which passes `raw.length > 0`. This becomes an epoch key that never matches any real git SHA, effectively isolating the run from all cross-run suppression — not a false-positive suppression, but a silent loss of FR-010 jitter suppression for that run.

The commit subject mentions "NUL byte" as a triaged item; this code path is the most likely site for that class of defect.

Fix: after reading `tipSha`, validate against `/^[0-9a-f]{40}$/i` and treat non-matching content as `undefined` (log a warning to stderr). This is one guard clause and eliminates both consequence paths.

---

### AUDIT-20260620-58 — `primaryFilePath` does not strip NUL bytes; `normalizeHeading` does — asymmetry breaks dedup when models emit NUL-corrupted locators

Finding-ID: AUDIT-20260620-58
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:135-148

`normalizeHeading` (diff line ~130) uses `[^a-z0-9 ]+` → space, which strips NUL bytes and other control characters from the heading portion of the signature. `primaryFilePath` (diff line ~142) uses `.replace(/:\d+(?:[:-]\d+)*\s*$/, '').trim()`. The regex `/:\d+(?:[:-]\d+)*\s*$/` requires `\d` after `:` and `\s*` (which excludes `\x00`) before `$`. If a model emits `Surface: src/spawn-cli.ts:89\x00` — a NUL byte after the line number — the trailing locator is NOT stripped because the regex cannot match `:89\x00` as `:` + `\d+` + `\s*$` (the NUL after `89` breaks both the `[:-]\d+` repetition and the `\s*$` anchor). The function returns `src/spawn-cli.ts:89\x00` instead of `src/spawn-cli.ts`, producing a different signature than a sibling model that emitted the same finding without the NUL.

The commit subject explicitly names "NUL byte" among the items triaged in `482b417a`. The heading path is addressed by `normalizeHeading`'s character-class filter; the surface path is not. There are no NUL-byte test cases in the new `finding-signature.test.ts` or `dampener-identity.test.ts` suites, confirming the surface NUL case is untested.

Fix: add a NUL-stripping step in `primaryFilePath` before the locator regex — e.g., `first.replace(/\x00/g, '')` — to make it symmetric with `normalizeHeading`'s control-character handling. Add a test case: `expect(primaryFilePath('src/x.ts:89\x00')).toBe('src/x.ts')`.

---

### AUDIT-20260620-59 — Empty `Surface:` produces a trailing-space signature; two no-surface findings with identical headings will false-dedup

Finding-ID: AUDIT-20260620-59
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:155-163, src/scope-discovery/promote-findings/check-barrage-dampener.ts:228-240

`findingSignature(heading, surface)` joins `normalizeHeading(heading)` and `primaryFilePath(surface)` with a space. When `surface` is `''`, `primaryFilePath('')` returns `''`, and the signature becomes `normalizeHeading(heading) + ' '` — a normalized heading with a trailing space. Two findings with the same normalized heading and no `Surface:` field produce identical signatures and would be treated as the same finding by the dampener's identity-keying logic. In practice, well-formed audit findings should always carry a `Surface:` line; however, neither `countHighPlusInSection` (diff line ~228-240) nor `findingSignature` validates or rejects the empty case — `surface` silently defaults to `''` when `SURFACE_LINE_RE` finds no match.

The blast-radius is limited: genuine audit findings without a surface are already unusual, and two findings sharing a heading AND both lacking a surface line are more likely to be the same underlying issue than distinct findings. But the silent nature of the collision — no warning emitted, no test covering it — is the problem; a future author won't know why apparently-distinct findings suppress each other.

Fix: either (a) emit a stderr warning when `surface` is empty and a finding's signature would contain a trailing space, or (b) use a canonical sentinel like `<no-surface>` for the path component so the join is unambiguous (`normalizeHeading(heading) + ' <no-surface>'`). The simpler path is (b): one-line change to `primaryFilePath` and `findingSignature`, with a test case for the empty-surface shape.

### AUDIT-20260620-60 — Re-rated HIGHs now satisfy the single-run-clean escape hatch

Finding-ID: AUDIT-20260620-60
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:373-384

`singleRunCleanEngages` used to require the most recent run to surface zero raw HIGH+ and zero raw MEDIUM. The new logic swaps the HIGH side to `mostRecent.newHighPlusCount === 0`, so a run that visibly surfaced a raw HIGH can still be treated as “single-run clean” when that HIGH is classified as a same-epoch re-rate jitter. That is broader than FR-010’s stated “does not reset the consecutive-quiet streak” behavior: it turns a noisy run into an immediate dampening trigger.

The blast radius is high because this is the gate decision itself. A downstream govern loop can skip the next audit hook immediately after a latest barrage section containing `Severity: high`, as long as the signature appeared earlier at lower severity and the latest run has no raw MEDIUM. A reasonable fix is to keep the single-run-clean branch on `rawHighPlusCount === 0 && rawMediumCount === 0`, while using `newHighPlusCount` only for the N-consecutive-quiet streak, unless the spec explicitly intends “re-rated HIGH” to be clean for the single-run rule too.

### AUDIT-20260620-61 — Lift dedup is documented as shared but not wired into the lift path

Finding-ID: AUDIT-20260620-61
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:154-163

`findingSignature()` is documented as the shared key for both “the dampener identity-key (FR-009) and the lift cross-run dedup (FR-016),” but the diff only wires it into `check-barrage-dampener.ts`. The lift path in `audit-barrage-lift.ts` still computes `highestExistingNn`, calls `renderSection(findings, ...)`, and appends all extracted findings; there is no read of existing audit-log entries into signatures and no filter that prevents duplicate lifted tasks across runs.

The blast radius is medium in this audited slice because the helper itself is reusable, but the code comment overstates integration and can mislead the next implementer or reviewer into believing FR-016 is already satisfied. A reasonable fix is either to remove the FR-016 claim from the helper comment until the lift dedup task is implemented, or wire `findingSignature()` into the lift append path with coverage for “same signature across N runs produces at most one task.”

## 2026-06-20 — audit-barrage lift (20260620T103934665Z-029-govern-operability-phase-2)

### AUDIT-20260620-62 — `singleRunCleanEngages` success-reason says "NEW-or-persistent HIGH+" but the rule gates on `rawHighPlusCount`, not `newHighPlusCount`

Finding-ID: AUDIT-20260620-62
Status: migrated-to-backlog TASK-355
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts (the `singleRunCleanEngages` reason-string push, visible in the diff around the `parts.push(...)` block after `if (singleRunCleanEngages && mostRecent !== undefined)`)

The success-reason emitted when Rule 2 fires reads: _"surfaced 0 NEW-or-persistent HIGH+ AND 0 MEDIUM findings (single-run rule)"_. The phrase "NEW-or-persistent HIGH+" is Rule 1's identity-keyed terminology (`newHighPlusCount`). Rule 2 deliberately uses `rawHighPlusCount === 0` instead — the code comment explains the design explicitly: _"This rule uses RAW counts on BOTH axes… a run that VISIBLY surfaced `Severity: high` must NOT trigger immediate single-run graduation even if that HIGH is same-epoch re-rate jitter."_ The message is therefore factually wrong about which count gated the decision. An operator or agent reading the reason would infer that jitter-suppression was applied to the single-run decision when it was not; they might then expect a jitter-only HIGH to pass the single-run gate and be confused when it does not. A more accurate message would say _"surfaced 0 RAW HIGH+ AND 0 MEDIUM findings (single-run fast-path; uses raw counts, stricter than the N-quiet streak)"_ so readers can distinguish Rule 2 (raw) from Rule 1 (identity-keyed). The blast-radius is wrong debugging hypotheses and misread dampener state, not a correctness defect in the dampening logic itself.

---

### AUDIT-20260620-63 — No round-trip integration test between `renderQuietSection` (degraded path) and `checkBarrageDampener`

Finding-ID: AUDIT-20260620-63 (claude-02 + codex-01; cross-model)
Status: migrated-to-backlog TASK-356
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    tests/audit-barrage/terminal-state.test.ts, tests/promote-findings/degraded-not-quiet.test.ts, src/subcommands/audit-barrage-lift-render.ts (`renderQuietSection` degraded branch)

The dampener's `Fleet: DEGRADED` detection is tested in `degraded-not-quiet.test.ts` exclusively against handcrafted section strings (the `degradedSection` helper function). `renderSection` with a degraded fleet is exercised in `terminal-state.test.ts` and the output is inspected for the marker, but the degraded-clean path (zero findings, degraded fleet) goes through `renderQuietSection`, which is never called in any test and never fed into `checkBarrageDampener` in the same test. This means the render-parse contract for that specific path is unverified end-to-end. If `renderQuietSection` produced a subtly different marker format — different casing, different spacing, a stray character before `Fleet:` other than `_`, or any format drift — `DEGRADED_MARKER_RE` might fail to match and the dampener would treat the degraded-clean section as non-degraded (`degraded: false`), allowing it to contribute to the consecutive-quiet streak or trigger single-run-clean. That is precisely the FR-007 failure this feature was built to prevent: _"a degraded run counted as convergence"_. A single integration test that calls `renderQuietSection(date, runDir, { produced: 1, configured: 2 }, sha)`, parses the resulting string through `checkBarrageDampener`, and asserts `recentRunCounts[0]?.degraded === true && dampened === false` would close this gap and serve as a permanent contract between the two surfaces.

## 2026-06-20 — audit-barrage lift (20260620T104601505Z-029-govern-operability-phase-3)

### AUDIT-20260620-64 — FR-011 test exercises isolated-epoch path, not same-epoch new-signature path

Finding-ID: AUDIT-20260620-64
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/promote-findings/dampener-identity.test.ts:172-189

The test `'a genuinely-NEW HIGH (signature unseen earlier) counts as new and blocks (FR-011)'` omits `codeSha` from both sections, so each section becomes its own unique epoch (keyed by `runBasename`). Because the recent section's epoch (`'run-recent'`) has never been seen before, every HIGH in it has `priorRank === undefined` and is trivially "new" — regardless of what earlier sections contain. The test would produce identical results even if the earlier section carried the same `HEADING_A`+`FILE_A` at `low`. The comment says "Earlier section: a DIFFERENT heading+file (so the recent HIGH is unseen)" but that condition is untested: the epoch isolation, not the different heading, is what makes the signature unseen.

The gap this leaves: no test verifies that within the **same code epoch**, a genuinely new signature (not seen in any prior same-epoch section, but possibly seen in a different epoch) is correctly counted as new. If a future change introduced cross-epoch contamination (checking all epoch maps, not just the current one), this test would not catch it. A proper FR-011 test should supply the same `codeSha` to both sections, use an unrelated heading in the earlier section, and confirm the recent HIGH counts as `newHighPlusCount === 1`. The existing "different sha → not suppressed" and "same sha → suppressed" epoch tests cover the cross-epoch boundary; the within-epoch new-signature case is the uncovered path.

---

### AUDIT-20260620-65 — Test describe block "intra-section signature dedup (MEDIUM finding)" exercises HIGH entries, not MEDIUM

Finding-ID: AUDIT-20260620-65
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/promote-findings/dampener-identity.test.ts:281-296

The `describe` block at line ~281 is titled `'dampener: intra-section signature dedup (MEDIUM finding)'`. The single `it` block inside constructs two entries both with `severity: 'high'` and asserts `rawHighPlusCount === 2` / `newHighPlusCount === 1`. No medium-severity logic is exercised. The name likely alludes to the inline code comment that mentions "MEDIUM (intra-section overcounting fix)", but a reader following the describe title expects to find tests for medium-ranked entries and will be confused. A reader auditing test coverage for medium-entry dedup will incorrectly believe it is covered.

Rename the describe block to something like `'dampener: intra-section signature dedup (same-signature two-entry section)'` or add an actual medium-entry dedup case if one is needed.

---

### AUDIT-20260620-66 — `findingSignature` produces a trailing-space key when `Surface:` is absent

Finding-ID: AUDIT-20260620-66
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:149-152 (new `findingSignature`), src/scope-discovery/promote-findings/check-barrage-dampener.ts:248-249

`findingSignature` is implemented as:
```ts
return `${normalizeHeading(heading)} ${primaryFilePath(surface)}`;
```

When a finding carries no `Surface:` field, `surface` is initialized to `''` (check-barrage-dampener.ts, inner loop). `primaryFilePath('')` returns `''` (the split, strip, and trim all pass through empty-string cleanly). The resulting key is `'normalized heading '` — a string ending in a space. Two distinct bugs with the same normalized heading but each lacking a `Surface:` field receive the same signature and will be incorrectly deduplicated by both the dampener identity map and the intra-section `countedThisSection` set.

In practice audit entries are expected to have surfaces, so this is unlikely to trigger in normal operation. However it is a silent correctness hazard: a model that omits `Surface:` on two different findings causes the second to shadow the first in the epoch map and in `allFindings` dedup. Fix: guard against empty surface in `findingSignature` (e.g., use `primaryFilePath(surface) || '<no-surface>'`) so that surface-less findings never share keys with each other.

---

### AUDIT-20260620-67 — `existsSync` call in `runAuditBarrageLift` is not injectable, creating a test-coverage gap for `tipSha` reading

Finding-ID: AUDIT-20260620-67
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts:309-315

The async file-reader is injectable via `args.read ?? (p => readFile(p, 'utf8'))`, but the `existsSync(tipShaPath)` guard on line 309 always hits the real filesystem. A unit test that injects `args.read` to simulate a `tip.sha` file cannot reach the sha-reading branch without also creating an actual file on disk — the sync existence check will return `false` and `tipSha` will stay `undefined`. The tests in `dampener-identity.test.ts` side-step this by calling `checkBarrageDampener` directly with hand-crafted log text, so the `runAuditBarrageLift`-level code path for reading `tip.sha` (and the resulting `Code-sha:` line in the rendered section) has no unit-level coverage. Making `existsSync` injectable (e.g., `args.exists ?? existsSync`) or converting to a try/catch read (which unifies the existence check and read into one async call) would close the gap without restructuring the surrounding logic.

### AUDIT-20260620-68 — Markdown-code-spanned surfaces do not normalize to the same finding signature

Finding-ID: AUDIT-20260620-68
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:149-151

`primaryFilePath()` strips trailing line locators only when the locator is at the absolute end of the string. Audit-log surfaces can already appear as markdown code spans, e.g. ``Surface:    `fixtures/spec.md:10` `` in existing fixtures, and the new normalizer does not remove either the backticks or the locator in that shape. For `` `src/x.ts:89` ``, line 151 leaves the value as `` `src/x.ts:89` `` because the trailing backtick prevents the `:\d+...$` match.

This breaks the feature’s stated identity-keying goal for upgraded or hand-edited logs: the same finding can get different signatures solely because one section/model emitted `src/x.ts:89` and another emitted `` `src/x.ts:89-91` `` or a different line number inside backticks. Downstream blast radius is high because the dampener will fail to suppress same-epoch severity jitter and can keep the audit barrage blocked despite the code path claiming line/line-range normalization. A reasonable fix is to unwrap optional markdown code-span delimiters before splitting/stripping, and add tests covering backticked single-line and range surfaces.

## 2026-06-20 — audit-barrage lift (20260620T105606594Z-029-govern-operability-phase-3)

### AUDIT-20260620-69 — Single-run-clean success message says "NEW-or-persistent" but the gate checks RAW

Finding-ID: AUDIT-20260620-69
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:395-401

The `singleRunCleanEngages` condition gates on `mostRecent.rawHighPlusCount === 0 && mostRecent.rawMediumCount === 0` (explicitly the RAW basis per the code comment and the codex-01 rationale: "a run that VISIBLY surfaced `Severity: high` must NOT trigger immediate single-run graduation even if that HIGH is same-epoch re-rate jitter"). But the success-path reason string emitted to the operator says:

```
the most recent run (${mostRecent.runDirBasename}) surfaced 0 NEW-or-persistent HIGH+ AND 0 MEDIUM findings (single-run rule)
```

"NEW-or-persistent" is the criterion for the N-consecutive-quiet rule (Rule 1), not for the single-run fast-path (Rule 2). An operator reading this message would form the mental model that jitter HIGHs are tolerated by the single-run path — but they are not: even a jitter HIGH in the most-recent section keeps `rawHighPlusCount > 0` and blocks the fast-path. The consecutive-quiet message (the other `parts.push(...)` call just above) correctly says "NEW-or-persistent" because Rule 1 really does use `newHighPlusCount`. The copy-edit that added "NEW-or-persistent" to the single-run message was applied to the wrong rule. The old message ("surfaced 0 HIGH+ AND 0 MEDIUM findings") was accurate; the new text introduced a factual inaccuracy. Fix: revert the qualifier in the single-run-clean arm — it should read "surfaced 0 RAW HIGH+ AND 0 MEDIUM findings (single-run rule)" to match what the code actually checks.

---

### AUDIT-20260620-70 — No test for FR-012 convergence scenario — transient HIGH disappears, subsequent clean runs dampen

Finding-ID: AUDIT-20260620-70
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/promote-findings/dampener-identity.test.ts:210-230

The `dampener: cross-round hysteresis (US3, FR-012)` describe-block only contains one test: "a NEW HIGH seen in only ONE run of the window still resets the streak (FR-011 preserved)". This verifies that FR-012 does NOT override FR-011 — a useful negative — but it does not test the positive FR-012 claim stated in the block header and the module-level JSDoc: "a HIGH that appears in ONLY ONE run of the recent window (transient, never persisted across ≥2 runs) is not treated as a stable/persistent blocker." The intended scenario is: section 1 introduces a genuinely-new HIGH; sections 2 and 3 are clean (the finding is fixed and disappears); with threshold=2, sections 2+3 should dampen. The implementation likely handles this correctly (no HIGH in sections 2+3 → `newHighPlusCount = 0` each → streak engages), but the contract is unverified. If future modifications to the epoch-accumulation loop accidentally carry forward a "seen-at-HIGH" signal into subsequent sections where the finding is absent, that regression would be invisible.

---

### AUDIT-20260620-71 — `findingSignature` with empty `surface` produces a trailing-space key — silent collision risk

Finding-ID: AUDIT-20260620-71
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:141-148

`primaryFilePath('')` returns `''` (the split, trim, and replace all produce the empty string). `findingSignature(heading, '')` therefore returns `"${normalizeHeading(heading)} "` — a normalized heading with a trailing space. Any two distinct findings that share the same normalized heading but have no `Surface:` line in the audit log would receive the same signature. This is a silent collision: the dampener would treat the second finding as a jitter re-rating of the first (or a persistent recurrence), potentially suppressing a genuinely-new HIGH or incorrectly counting SC-001 persistence.

The current test coverage (`finding-signature.test.ts`) exercises single-line locators, ranges, multi-ref surfaces, and the no-locator case (`src/no-line.ts`), but never calls `primaryFilePath('')` or `findingSignature(heading, '')`. The risk is bounded by how often a well-formed audit-barrage lift section omits the `Surface:` field — the render path always writes a `Surface:` line for known findings, so the gap may be theoretical in practice. But the function has no guard or assertion against an empty surface, and the join's comment ("The components join with a space; the join is unambiguous because a normalized heading is only `[a-z0-9 ]` while a file path carries `/`/`.`/`-`") relies on the file-path component being non-empty. A minimal fix is either (a) a `throw` in `findingSignature` when `primaryFilePath(surface)` is empty, or (b) a different join separator (e.g., `|`) that cannot appear in a normalized heading, making the empty-surface key distinguishable.

---

### AUDIT-20260620-72 — `renderQuietSection` and `renderSection` — new `tipSha` parameter has no JSDoc

Finding-ID: AUDIT-20260620-72
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/audit-barrage-lift-render.ts:93-98, 142-148

Both `renderQuietSection` and `renderSection` gained a new optional `tipSha?: string` parameter (the audited code epoch for FR-010 scope). Neither function has a JSDoc comment explaining what `tipSha` is, when it is undefined, or what the emitted `Code-sha:` preamble line does — the context that makes `undefined` correct (not an error) is currently only in the call-site comment in `audit-barrage-lift.ts`. A caller adding a new invocation of either render function would not know from the signature alone that omitting `tipSha` intentionally isolates the epoch rather than being a bug. Low blast-radius since the existing call sites are correct, but the parameter's contract is load-bearing for FR-010 correctness and worth surfacing to future readers.

## 2026-06-20 — audit-barrage lift (20260620T110516860Z-029-govern-operability-phase-3)

### AUDIT-20260620-73 — US7 hunk-fingerprint implementation is absent from the supplied audit diff

Finding-ID: AUDIT-20260620-73
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    Missing surfaces: `src/govern/checkpoint-state.ts`, `src/govern/phase-checkpoint-status.ts`, `src/govern/hunk-fingerprint.ts`, `tests/govern/hunk-fingerprint.test.ts`

The audited commit list includes `fa16ba93 feat(029): US7 — hunk-granularity checkpoint fingerprint (T040-T042, brought forward)`, but the supplied “Under audit” diff contains only barrage dampener/lift/signature files. There is no checkpoint fingerprint implementation or hunk-fingerprint test surface in the provided diff, even though US7’s stated contract is about checkpoint freshness and hunk-granularity staleness.

Blast radius is high if this shipped as represented: downstream governance would believe US7 is implemented and audited, while the code that actually decides whether earlier phase checkpoints go stale is not present in the review artifact. A reasonable correction is to include the govern checkpoint files and hunk-fingerprint tests in the audited diff, or remove the US7 commit/claim from this audit slice.

### AUDIT-20260620-74 — `findingSignature` claims lift dedup usage that is not wired in this diff

Finding-ID: AUDIT-20260620-74
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:160-169; src/subcommands/audit-barrage-lift.ts:329-408

The new helper comment says `findingSignature` is used by “the dampener identity-key (FR-009) and the lift cross-run dedup (FR-016)”, but the supplied diff only imports and uses it from `check-barrage-dampener.ts`. The lift path still extracts findings and renders/appends them directly; there is no parse of existing audit-log signatures and no skip/merge behavior in `runAuditBarrageLift`.

Blast radius is medium: the dampener behavior is implemented, but the helper’s contract overstates adoption and can mislead the next operator or agent into thinking FR-016 is already covered. Either wire the same signature into the lift append/dedup path, or narrow the comment to the behavior actually implemented here.

## 2026-06-20 — audit-barrage lift (20260620T111627778Z-029-govern-operability-phase-3)

### AUDIT-20260620-75 — `tipSha` read uses `.trim()` which does not strip NUL bytes — epoch key diverges if `tip.sha` is NUL-contaminated

Finding-ID: AUDIT-20260620-75
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts (the `tipShaPath` read block added in this diff)

The commit subject `482b417a fix(029): US3 govern triage — NUL byte, line-range signature, code-epoch suppression` implies that NUL byte handling is one of the three things fixed. The reader added in `audit-barrage-lift.ts` is:

```typescript
const raw = (await (args.read ?? ((p: string) => readFile(p, 'utf8')))(tipShaPath)).trim();
if (raw.length > 0) tipSha = raw;
```

`String.prototype.trim()` strips only Unicode whitespace (`\r`, `\n`, `\t`, space, etc.); it does **not** strip NUL bytes (`\x00`). If `tip.sha` was written by a tool or shell expansion that NUL-terminates its output (common in C-originated tooling and certain `git` invocations involving process substitution), the trimmed string would be `abc123…\x00`. This NUL-laden value would then be:

1. Written to the audit log as `Code-sha: abc123…\x00`.
2. Captured by `CODE_SHA_RE = /^Code-sha:\s*(\S+)/i` (since `\x00` matches `\S`).
3. Used as the epoch key in `seenMaxRankByEpoch.get('abc123…\x00')`.

The blast-radius is FR-010 suppression correctness: if one run wrote `abc123…\x00` (NUL) and a subsequent run on the same commit writes `abc123…` (clean), the two sections map to *different* epoch keys — the FR-010 re-rate suppression never fires across them, causing jitter HIGH+ findings to count as blocking when they should be suppressed. Conversely, once a NUL-contaminated key is in the epoch map, a clean run for the same actual SHA would be isolated into its own epoch, treating all findings as genuinely new regardless of prior sightings.

A minimal fix would be to strip NUL bytes before trimming:
```typescript
const raw = (await reader(tipShaPath)).replace(/\x00/g, '').trim();
```
A stricter fix would also validate the SHA format before assigning:
```typescript
const candidate = (await reader(tipShaPath)).replace(/\x00/g, '').trim();
if (/^[0-9a-f]{40}$/i.test(candidate)) tipSha = candidate;
```
The strict form additionally prevents malformed partial-SHA or path content from acting as an epoch key — it fails closed (runs with bad `tip.sha` fall back to the conservative `runDirBasename` isolation) rather than silently corrupting the key space.

---

### AUDIT-20260620-76 — Missing `Surface:` field produces a space-padded signature that can false-collide across distinct findings

Finding-ID: AUDIT-20260620-76
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts (`findingSignature`), src/scope-discovery/promote-findings/check-barrage-dampener.ts (`countHighPlusInSection`)

`findingSignature` is defined as:
```typescript
export function findingSignature(heading: string, surface: string): string {
  return `${normalizeHeading(heading)} ${primaryFilePath(surface)}`;
}
```

`primaryFilePath('')` returns `''` (no split tokens, empty regex replace, trim on `''`). So when `surface` is the empty string, `findingSignature(heading, '')` = `normalizeHeading(heading) + ' '` — a trailing-space key.

In `countHighPlusInSection`, `surface` is initialized as:
```typescript
let surface = '';
```
and only set when `SURFACE_LINE_RE` matches. An audit entry that omits the `Surface:` field entirely keeps `surface = ''`. Every such entry — regardless of which actual file it describes — gets a signature reduced to just its normalized heading plus a trailing space.

The consequence: two distinct findings in different sections, both lacking a `Surface:` field, with headings that normalize identically (e.g., minor punctuation differences) would collide to the same signature. If the first appears at LOW and the second re-rates to HIGH, the dampener treats the HIGH as FR-010 jitter and suppresses it. The dampener would report `newHighPlusCount === 0` when a genuinely new, novel HIGH is present.

This scenario is plausible with a cross-model barrage: one model may emit `Surface: src/foo.ts:42` while a sibling omits the field entirely. The sibling's finding would carry an empty-surface signature that mismatches the other's non-empty one, preventing cross-run dedup even when they describe the same defect. Conversely, the sibling's findings from different sections with the same heading but different actual surfaces would all collapse to one signature.

A reasonable fix is to treat an empty primary file path as a sentinel that disables suppression:
```typescript
export function findingSignature(heading: string, surface: string): string {
  const path = primaryFilePath(surface);
  // An empty path means no Surface: field — use a per-entry nonce rather than
  // a heading-only key that could collide across distinct no-surface entries.
  return path.length > 0
    ? `${normalizeHeading(heading)} ${path}`
    : `${normalizeHeading(heading)} (no-surface)`;
}
```
Though even `(no-surface)` still collides across headings that normalize identically. A stricter fix would append a per-section counter to surface-less entries to guarantee uniqueness.

---

### AUDIT-20260620-77 — No test coverage for `blocking` severity in the dampener identity-keying path

Finding-ID: AUDIT-20260620-77
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/promote-findings/dampener-identity.test.ts (entire file)

The new `dampener-identity.test.ts` exercises `low`, `medium`, and `high` severities but never `blocking`. The dampener logic in `checkBarrageDampener` performs:

```typescript
const HIGH_RANK = SEVERITY_RANK.high;
// ...
if (SEVERITY_RANK[finding.severity] < HIGH_RANK) continue;
```

`blocking` is a valid `NormalizedSeverity` (confirmed by `narrowSeverity` in `check-barrage-dampener.ts`) and presumably has a rank > `high` in `SEVERITY_RANK`. If `SEVERITY_RANK.blocking` is defined correctly (rank > HIGH), blocking findings would pass the `< HIGH_RANK` guard and be counted. But if `SEVERITY_RANK` in `cluster-severity.ts` omits `blocking` — which is not visible in this diff — the expression `SEVERITY_RANK['blocking']` evaluates to `undefined`, and `undefined < HIGH_RANK` is `false` in JavaScript. Blocking findings would then pass the severity guard (incorrectly treated as ≥ HIGH) but would fail the fold step: `undefined > prior` is always `false`, so blocking findings would never update the epoch map, causing their epoch rank to remain `undefined` for subsequent runs. FR-010 suppression and SC-001 persistence would both fail silently for `blocking`-severity findings.

A test exercising a `blocking`-severity finding through `checkBarrageDampener` would catch this class of defect. The test case that would demonstrate SC-001 for blocking (a blocking HIGH that persists across two runs) is the easiest to add and the most likely path to catch a missing `SEVERITY_RANK.blocking` entry.

---

### AUDIT-20260620-78 — All historical sections feed `seenMaxRankByEpoch` — suppression from outside the threshold window is invisible in the `reason` string

Finding-ID: AUDIT-20260620-78
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts (`checkBarrageDampener` epoch-accumulation loop, ~line 291–384 in the post-diff numbering)

The epoch-accumulation loop processes `fileOrderedCounts` — ALL sections, oldest to newest — before slicing the last `threshold` entries into `recentRunCounts`. This means a finding first seen at LOW severity in a section from months ago (outside the threshold window) contributes to `seenMaxRankByEpoch[epoch]`, and a HIGH re-rating of that finding in a recent section would be suppressed as FR-010 jitter even though the operator cannot see the old section in the dampener's `recentRunCounts` result.

The spec comment says "Walk ALL sections oldest→newest," so the behavior is intentional. The concern is operator experience: the `reason` string only mentions runs from `recentRunCounts`. If dampening fires via `consecutiveQuietEngages` and all `newHighPlusCount === 0` values are due to suppression by very old sections, the operator has no signal in the `reason` output that old context is doing work. An operator investigating "why is this dampened? I see a HIGH in the last run" would need to trace back to pre-window sections to understand the suppression, which is not currently surfaced.

A low-cost improvement would be to include in the `reason` string the oldest section whose finding triggered a suppression, if any suppression came from outside the threshold window. Even a count like "(N findings suppressed via epoch key seen first in section run-YYYYMMDD-abc outside the current window)" would make the suppressions auditable without changing the logic.

### AUDIT-20260620-79 — `tip.sha` is trusted verbatim into the audit-log preamble

Finding-ID: AUDIT-20260620-79
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts:314-318; src/subcommands/audit-barrage-lift-render.ts:103-104

`runAuditBarrageLift` trims `opts.runDir/tip.sha` and accepts any non-empty content as `tipSha`; the renderer then writes it directly into the preamble as `Code-sha: ${tipSha}`. There is no validation that the value is a single 40-hex git SHA, even though the comment says that is the artifact contract.

The blast radius is high because malformed content can alter dampener behavior, not just produce messy text. An embedded newline such as `abc\nFleet: DEGRADED` would be rendered into the pre-entry preamble, and `countHighPlusInSection` scans preamble lines for `Fleet: DEGRADED`, falsely marking a healthy run degraded. A malformed but non-empty token also becomes the epoch key, silently disabling or corrupting FR-010 same-code re-rate suppression. Validate the read value with a strict SHA regex before rendering it; invalid content should be treated as absent or fail loud with a clear message.

### AUDIT-20260620-80 — The shared finding signature is not actually shared with lift dedup

Finding-ID: AUDIT-20260620-80
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/extract-barrage-findings.ts:160-169; src/subcommands/audit-barrage-lift.ts:394-430

`findingSignature()` is documented as the shared key for both the dampener identity-key and “the lift cross-run dedup (FR-016)”, but the diff only imports and uses it from `check-barrage-dampener.ts`. The lift path still computes the next audit ID, renders every extracted finding, and appends the whole section; there is no parse of existing audit-log entries into signatures and no skip/merge step before `renderSection`.

The blast radius is medium: the dampener behavior can work, but the code comment and FR-019 contract overstate adoption of the primitive. A consumer reading this surface would reasonably believe cross-run lift dedup is already backed by the same signature, while repeated runs can still append near-duplicate findings/tasks for the same `(normalized-heading, primary-file-path)`. Either remove the lift-dedup claim from this helper until that path consumes it, or wire `findingSignature()` into the lift append path with coverage for repeated same-signature findings.

## 2026-06-20 — audit-barrage lift (20260620T121946771Z-029-govern-operability-phase-3)

### AUDIT-20260620-81 — Stale parenthetical in `singleRunCleanEngages` success message contradicts the actual check

Finding-ID: AUDIT-20260620-81
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:396-410 (approx, the `singleRunCleanEngages` message block)

The inline comment directly above the `singleRunCleanEngages` check is accurate — "A pristine run is `rawHighPlusCount === 0 AND rawMediumCount === 0` (no HIGH and no MEDIUM at all)" — but the operator-visible reason string emitted when the fast-path fires now says:

```
`the most recent run (${mostRecent.runDirBasename}) surfaced 0 NEW-or-persistent HIGH+ AND 0 MEDIUM findings (single-run rule)`
```

The phrase "NEW-or-persistent HIGH+" is the terminology of the identity-keyed `newHighPlusCount` (Rule 1 / `consecutiveQuietEngages`). The single-run fast-path deliberately does NOT apply jitter suppression — it uses `rawHighPlusCount === 0`, meaning even a same-epoch re-rate to HIGH (which `newHighPlusCount` would suppress) still blocks the fast-path. The comment in the code explicitly states this design intent:

> "A run that VISIBLY surfaced `Severity: high` must NOT trigger immediate single-run graduation even if that HIGH is same-epoch re-rate jitter — the jitter tolerance (`newHighPlusCount`) belongs to the safer 2-run N-quiet streak (Rule 1), not to the one-run fast-path."

The message contradicts this intent. Two downstream failure modes: (a) an operator reading the dampening reason when the fast-path fires believes jitter suppression was applied and may incorrectly conclude a re-rate finding was "handled," and (b) a future maintainer seeing the message might change the check to `newHighPlusCount === 0` to match the string — which would silently break the raw-basis guarantee for the fast-path and allow jitter runs to falsely trigger immediate graduation. Neither failure shows up in the new test suite, which does not assert the contents of `r.reason` in any dampened case.

Fix: change the message to say "0 HIGH+" (raw), not "0 NEW-or-persistent HIGH+", to match what the check actually measures. Add at least one assertion on the `reason` string for the single-run-clean dampened case.

---

### AUDIT-20260620-82 — `existsSync` in `runAuditBarrageLift` is hardcoded while the read is injectable

Finding-ID: AUDIT-20260620-82
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts:306-313 (the `tip.sha` read block)

The `tip.sha` read is split across two calls with different injection surfaces:

```typescript
const tipShaPath = join(opts.runDir, 'tip.sha');
let tipSha: string | undefined;
if (existsSync(tipShaPath)) {                          // hardcoded fs — not injectable
  const raw = (await (args.read ?? ((p: string) => readFile(p, 'utf8')))(tipShaPath)).trim();
  if (raw.length > 0) tipSha = raw;
}
```

`args.read` is injectable (used throughout the function to simulate audit-log content in tests). `existsSync` is not. A test that injects `args.read` to return a sha string must also create the physical `tip.sha` file on disk; a test that wants `tipSha` to remain `undefined` cannot simulate a missing file through the injected reader alone — it must ensure the file does not physically exist. This is an inconsistency in the testability seam: the two halves of the same conditional branch have different dependency channels.

The existing new tests avoid `runAuditBarrageLift` entirely and exercise the dampener directly. No test in this diff exercises the `tip.sha` → `tipSha` → `Code-sha:` preamble path through the lift function.

A minimal fix is to unify the guard: either catch ENOENT from `args.read` and treat the error as absent (`tipSha` stays undefined), or add an injectable `args.fileExists` parameter defaulting to `fs.existsSync`. The ENOENT approach is simpler and makes the logic consistent with how other optional files are typically handled in Node.js async code.

---

### AUDIT-20260620-83 — No end-to-end test for the `tipSha` plumbing from `runAuditBarrageLift` through render to dampener parse

Finding-ID: AUDIT-20260620-83
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts + src/subcommands/audit-barrage-lift-render.ts (new `tipSha` parameter paths)

The `tipSha` parameter is wired through two layers in this diff:

1. `runAuditBarrageLift` reads `tip.sha` and passes the value to `renderQuietSection`/`renderSection` as `tipSha`.
2. `renderQuietSection`/`renderSection` emit a `Code-sha: <sha>\n` line into the section preamble when `tipSha` is defined and non-empty.
3. `countHighPlusInSection` subsequently parses that `Code-sha:` line from the preamble to set `codeSha` on the returned `BarrageSectionCount`.
4. `checkBarrageDampener` uses `codeSha ?? runDirBasename` as the epoch key.

The new `dampener-identity.test.ts` tests the dampener at layer 4 by generating audit-log text directly with hand-crafted `Code-sha:` lines in a `section()` helper. This validates that the dampener parses and uses `codeSha` correctly. However, no test in this diff exercises layers 1–2 together: reading `tip.sha` from disk (or an injectable source) and verifying the rendered section actually contains the correct `Code-sha:` preamble line.

If `renderQuietSection` or `renderSection` silently drops `tipSha` (e.g., because of a condition mismatch on the `tipSha !== undefined && tipSha.length > 0` guard), the dampener's epoch-keying logic would silently degrade to `runDirBasename`-keyed epochs for all runs, making FR-010 jitter suppression ineffective without any test failing. The blast radius is bounded because the fallback (`runDirBasename`) is conservative (no cross-suppression), but it would mean the feature shipping in this diff never fires in production even though all unit tests pass.

A minimal integration test would: call `renderSection`/`renderQuietSection` with a known `tipSha` string, parse the output with `checkBarrageDampener` (or directly with the section-counting internals), and assert that the returned `codeSha` matches the input sha.
