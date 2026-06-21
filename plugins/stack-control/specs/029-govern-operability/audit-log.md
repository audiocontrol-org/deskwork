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

## 2026-06-20 — audit-barrage lift (20260620T131025289Z-029-govern-operability-phase-2)

### AUDIT-20260620-84 — Missing test coverage for FR-010 re-rate jitter suppression and SC-001 persistent-HIGH behavior

Finding-ID: AUDIT-20260620-84
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:291–389 (the identity-keying epoch loop added in this diff)

The identity-keyed `newHighPlusCount` computation introduced in this diff implements two correctness-critical distinguishing behaviors: FR-010 (a finding seen at LOW/MEDIUM and re-rated to HIGH on the same code epoch is severity jitter — suppress it) and SC-001 (a finding already present at HIGH/blocking in a prior section of the same epoch stays blocking). These are the core reason US3 exists — without them, the dampener either over-blocks (counts jitter as new HIGH) or under-blocks (lets a persistent HIGH vanish into the "consecutive quiet" streak).

The two new test files in this diff (`terminal-state.test.ts`, `degraded-not-quiet.test.ts`) cover FR-006 and FR-007/FR-008 respectively. Neither contains a scenario that exercises FR-010 or SC-001. Specifically missing:

- **FR-010 scenario**: an audit-log with section A containing a finding at MEDIUM (`Surface: src/x.ts:1`), then section B containing the same signature at HIGH on the same `Code-sha:` — section B's `newHighPlusCount` must be 0 (jitter, suppress).
- **FR-011 scenario**: same signature at HIGH on a *different* `Code-sha:` — section B's `newHighPlusCount` must be 1 (genuinely new epoch, not jitter).
- **SC-001 scenario**: section A contains a HIGH finding; section B also contains that HIGH finding on the same epoch — section B's `newHighPlusCount` must be 1 (persistent real defect, keep blocking).
- **Combined scenario**: A:MEDIUM → B:HIGH (suppressed per FR-010, epoch map now HIGH) → C:HIGH (SC-001 fires on C, not suppressed).

The commits `dbf3bfc1` (US3 part 2, T016-T018) and `434cb5bb` (US3 part 1, T014-T015) are within the audited range and add the epoch-keyed logic. No new test file for these tasks appears in the diff, and no additions to existing test files for this surface are visible. If a regression is introduced (e.g., an off-by-one in the `priorRank >= HIGH_RANK` check or a wrong epoch key), the existing tests will not catch it.

---

### AUDIT-20260620-85 — FR-010/SC-001 interaction: epoch max-rank elevates jitter after first occurrence, making subsequent jitter appearances block

Finding-ID: AUDIT-20260620-85
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:315–344 (epoch map folding after `newHigh` computation)

The epoch map stores the **maximum severity rank** seen for each signature within a code epoch. After the `newHigh` count is computed for section N, ALL of that section's findings (any severity) are folded into the epoch map via `if (prior === undefined || rank > prior) epochMap.set(...)`. This means that if a finding fires at MEDIUM (run 1), then HIGH (run 2, suppressed as FR-010 jitter), the epoch map now carries that signature at `HIGH_RANK`.

In run 3, if the same finding appears at HIGH again (still on unchanged code — true oscillating jitter, M→H→M→H pattern), the check is:

```
const priorRank = epochSeen?.get(finding.signature);  // HIGH_RANK (from run 2's fold)
if (priorRank === undefined || priorRank >= HIGH_RANK) { newHigh += 1; }
```

`priorRank >= HIGH_RANK` is true → SC-001 fires → blocks. But this is the same jitter pattern FR-010 was written to suppress. FR-010 only shields the *first* HIGH occurrence after a lower-severity baseline; the fold-to-max in run 2 causes SC-001 to fire on all subsequent HIGH occurrences, even if the finding continues to oscillate. In a true M→H→M→H→M→H pattern, FR-010 suppresses only run 2; SC-001 causes runs 4 and 6 to block the dampener indefinitely.

Whether this behavior is intended (a finding that appeared HIGH twice on unchanged code is "real enough" to keep blocking) or unintended (true jitter can permanently elevate the epoch map and defeat FR-010) is not clear from the inline comments or the available spec text. The absence of a test for the two-or-more-occurrence jitter scenario (noted in finding -01 above) means this subtlety has no regression anchor. The fix — if the intent is to suppress repeated same-epoch jitter — would require tracking per-run severity rather than epoch-level max, or resetting the epoch map on a confirmed-clean run.

---

### AUDIT-20260620-86 — `existsSync` is not injectable alongside `args.read`, leaving the `Code-sha:` lift path untestable without filesystem side effects

Finding-ID: AUDIT-20260620-86
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts:307–315 (the `tipShaPath` / `existsSync` block added in this diff)

The `runAuditBarrageLift` function accepts `args.read` as an injectable file-reader, allowing tests to stub file I/O without touching the real filesystem. The new `Code-sha:` reading block uses `existsSync` (real filesystem, not injectable) to gate the `args.read` call:

```typescript
if (existsSync(tipShaPath)) {
  const raw = (await (args.read ?? ((p: string) => readFile(p, 'utf8')))(tipShaPath)).trim();
  if (raw.length > 0) tipSha = raw;
}
```

A test that injects `args.read` returning a fake sha cannot make `existsSync` return true without creating a real file. This breaks the injectable-IO contract the rest of the function establishes. Concretely: any test wanting to verify the `Code-sha:` marker is written into the audit-log section (and subsequently parsed by the dampener's `CODE_SHA_RE`) must create a real file in a temp directory, coupling the test to the OS. If the temp file leaks or the test runner parallelizes the suite across worktrees, the test can flake.

The new test files in this diff do not exercise the lift-to-audit-log-to-dampener pipeline for the `Code-sha:` path at all — the tests drive the dampener directly against hand-crafted audit-log text containing `Code-sha:` lines. The lift-side writing is untested by this diff. The fix is to extract existence-checking into an injectable `exists?: (p: string) => boolean` parameter (matching the `args.read` pattern already in place), or to replace the `existsSync` + `args.read` split with a single `try/catch` around `args.read` catching ENOENT.

---

### AUDIT-20260620-87 — `completedNonConvergedAnnotation`: combined `reportBytes === 0` + nonzero exit code annotated only as `zero-byte`, discarding the nonzero-exit signal in the kind label

Finding-ID: AUDIT-20260620-87
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/audit-barrage/types.ts:347 (the `kind` ternary added in this diff)

```typescript
const kind = lane.reportBytes === 0 ? 'zero-byte' : `nonzero-exit (${lane.exitCode})`;
return ` — completed but DEGRADED [${kind}] (exit ${lane.exitCode}, ...)`
```

When a lane completes with `exitCode !== 0` AND `reportBytes === 0`, the `kind` label is `'zero-byte'`. The full annotation does still include `exit ${lane.exitCode}`, so the exit code is not silently dropped — but it is demoted to the parenthetical while the bracket label (`[zero-byte]`) becomes the primary classification. A human triaging fleet health from this annotation may conclude the lane "exited cleanly but produced nothing" (the natural reading of `zero-byte`) rather than "crashed (exitCode=3) and also produced nothing." The test in `terminal-state.test.ts:71–79` validates the `nonzero-exit` path only for `reportBytes: 100`; there is no test for the combined `reportBytes === 0 && exitCode !== 0` case. A fix: `const kind = lane.reportBytes === 0 && lane.exitCode !== 0 ? 'zero-byte+nonzero-exit' : lane.reportBytes === 0 ? 'zero-byte' : 'nonzero-exit (${lane.exitCode})'`.

---

### AUDIT-20260620-88 — Dead defensive undefined check on `fileOrderedCounts[idx]` in `recentRunCounts` construction

Finding-ID: AUDIT-20260620-88
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts (the `recentRunCounts` construction loop, ~lines 333–338 in the diff)

```typescript
const lastIndex = fileOrderedCounts.length - 1;
for (let k = 0; k < threshold && k <= lastIndex; k += 1) {
  const idx = lastIndex - k;
  const base = fileOrderedCounts[idx];
  if (base === undefined) continue;   // <-- dead
  recentRunCounts.push({ ...base, newHighPlusCount: newHighCounts[idx] ?? 0 });
}
```

`fileOrderedCounts` is produced by `sections.map(...)` (no holes), `lastIndex = fileOrderedCounts.length - 1`, and `k` is bounded by `k <= lastIndex`, so `idx` is always in `[0, lastIndex]` — a valid index. `base` can never be `undefined`. The check is dead code. It creates a false impression of a possible sparse-array path that doesn't exist, and the `?? 0` fallback on `newHighCounts[idx]` has the same character (also dead, since the two arrays are constructed in lock-step). No functional consequence; the signal is misleading for a future reader trying to understand when `base` could be absent.

### AUDIT-20260620-89 — Duplicate-only HIGH runs are converted into pristine quiet sections

Finding-ID: AUDIT-20260620-89
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts:354-386

`runAuditBarrageLift` now filters extracted findings through `selectLiftableFindings` and then treats `liftableFindings.length === 0` as a zero-finding run. That conflates “the barrage surfaced nothing” with “the barrage surfaced only findings already present or fixed in the audit-log.” On a healthy fleet where the model re-surfaces an already-present open HIGH, `selectLiftableFindings` drops it as a duplicate, line 368 enters the zero-finding branch, and lines 386-393 render a quiet section with no `Severity:` lines.

The downstream blast radius is high because `checkBarrageDampener` uses the most recent section’s raw severity lines to decide convergence. This path can make a run that visibly re-surfaced a persistent HIGH look like a pristine single-run-clean section, allowing the dampener to engage even though SC-001 says a persistent HIGH keeps blocking. A reasonable fix is to reserve `renderQuietSection` for `findings.length === 0`; when `findings.length > 0` but `liftableFindings.length === 0`, record a non-quiet hygiene/duplicate signal that preserves raw surfaced severity for the dampener, or otherwise prevent that run from satisfying single-run-clean.

### AUDIT-20260620-90 — `renderQuietSection` documentation now states the opposite of the implemented degraded behavior

Finding-ID: AUDIT-20260620-90
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts:85-90

The JSDoc for `renderQuietSection` still says “Degraded clean runs are NOT recorded,” but the implementation immediately below accepts `fleet` and intentionally records a `Fleet: DEGRADED` section when `produced < configured` at lines 111-117. The call site in `audit-barrage-lift.ts` also depends on that new behavior.

The blast radius is low because runtime behavior is clear and covered by the code path, but this is a contract comment on an exported renderer and it now directs maintainers toward the pre-029 behavior that caused stale quiet sections to be treated as most recent. Update the comment to say degraded zero-liftable runs are recorded with a degraded marker and excluded by the dampener.

## 2026-06-20 — audit-barrage lift (20260620T131826637Z-029-govern-operability-phase-2)

### AUDIT-20260620-91 — TOCTOU race in `tip.sha` read — `existsSync` not injectable via test harness

Finding-ID: AUDIT-20260620-91
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts:307-316 (approximate, diff context)

`tip.sha` is probed with the synchronous `existsSync(tipShaPath)` and then read with the injectable `args.read ?? readFile`. These are two separate I/O operations with no atomicity guarantee. If `tip.sha` is deleted between the check and the read (rare in practice but possible in a concurrent CI environment where a prior lift run is cleaning up the run-dir), the read throws an unhandled `ENOENT` that propagates out of `runAuditBarrageLift` as a rejection — not caught anywhere visible in this diff.

More load-bearing: `existsSync` is NOT injectable through `args.read`. The test harness injects `args.read` to mock file content, but the existence check is always performed against the real filesystem. A unit test that wants to exercise the "tipSha present" branch must physically create a file, which is heavier than the rest of the injection-based test contract in this file. If the `tip.sha` reading is ever tested inline (without a real fixture file), the existence check silently short-circuits and `tipSha` is always `undefined` — silently giving wrong epoch isolation without test failure.

The idiomatic fix: drop `existsSync`, wrap the read in `try/catch { if (e.code !== 'ENOENT') throw e; }`, and make the missing-file case `tipSha = undefined`. This collapses the two I/O calls into one, removes the TOCTOU, and makes the function fully testable via the existing `args.read` injection point.

---

### AUDIT-20260620-92 — "NEW-or-persistent" terminology in single-run-clean reason message is misleading

Finding-ID: AUDIT-20260620-92
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts (reason-building block for `singleRunCleanEngages`)

The dampener's human-readable output when `singleRunCleanEngages` fires reads:

```
the most recent run (…) surfaced 0 NEW-or-persistent HIGH+ AND 0 MEDIUM findings (single-run rule)
```

But the actual check for `singleRunCleanEngages` is `mostRecent.rawHighPlusCount === 0 && mostRecent.rawMediumCount === 0` — raw counts, no identity-keying whatsoever. The code comment in the new diff is explicit that this is intentional: "jitter tolerance (newHighPlusCount) belongs to the safer 2-run N-quiet streak (Rule 1), not to the one-run fast-path." The message borrows Rule 1's "NEW-or-persistent" vocabulary for a rule that doesn't apply it.

For the case where `singleRunCleanEngages` actually fires (`rawHighPlusCount === 0`), `newHighPlusCount` is also 0 (you can't have new-or-persistent HIGH without raw HIGH), so the message is technically accurate. However, an operator reading the diagnostic output or a future developer auditing this path will incorrectly infer that jitter tolerance was applied to the single-run-clean gate. If they are trying to understand why a run that had visible `Severity: high` entries (that were same-epoch jitter) didn't dampen, the message leads them to wrong analysis — they'll look for the identity-keying path when none was taken.

The message for the `singleRunCleanEngages` branch should read "0 RAW HIGH+ AND 0 MEDIUM" to match the check and the documented rationale.

---

### AUDIT-20260620-93 — Redundant `args.read ?? readFile` expression at `tip.sha` read site

Finding-ID: AUDIT-20260620-93
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts (tipSha block and subsequent reader definition)

The `tip.sha` read constructs the reader expression inline:

```typescript
const raw = (await (args.read ?? ((p: string) => readFile(p, 'utf8')))(tipShaPath)).trim();
```

The `reader` constant that gives the same expression is defined **below** the `tipSha` block in the same function. Because `reader` isn't in scope yet, the `tipSha` read duplicates the expression. This creates a maintenance point: if the `reader` construction changes (e.g., adding encoding options or error wrapping), the `tipSha` inline version will silently diverge. The fix is to hoist the `reader` definition to before the `tipSha` block so it can be reused. As written the two constructions are logically identical but are not the same code path, which will confuse a future editor.

---

### AUDIT-20260620-94 — No round-trip test: `renderQuietSection` (degraded) → `checkBarrageDampener`

Finding-ID: AUDIT-20260620-94
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/ (absence of a round-trip test)

The test suite in this diff exercises the dampener against hardcoded audit-log strings (`degraded-not-quiet.test.ts`) and exercises the renderer in isolation (`terminal-state.test.ts`). There is no test that calls `renderQuietSection(date, basename, fleet, tipSha)` (the degraded-fleet branch) and feeds its output directly into `checkBarrageDampener`, then asserts `degraded === true` and `codeSha` is correctly extracted.

If `renderQuietSection` were to emit `Fleet: DEGRADED` in a subtly different format — for example with extra whitespace, a different casing, or the marker placed after a blank line the dampener's preamble scan doesn't reach — the unit tests would all pass while the end-to-end convergence behavior would silently regress. The same gap exists for the `Code-sha:` epoch marker: no test round-trips `renderSection(…, undefined, tipSha)` → dampener assertion on `codeSha`. Given that the FR-007 / codex-01 behavior is load-bearing for the convergence dampener, a round-trip test is the appropriate closure.

---

### AUDIT-20260620-95 — `selectLiftableFindings` (loop-hygiene.js) is a new critical dependency absent from this diff

Finding-ID: AUDIT-20260620-95
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/audit-barrage-lift.ts (selectLiftableFindings call site); src/govern/loop-hygiene.ts (not in diff)

The diff introduces `import { selectLiftableFindings } from '../govern/loop-hygiene.js'` and gates the entire lift path — including the zero-findings branch — on its output. The function is responsible for filtering already-resolved (`fixed-<sha>`) and already-present (cross-run dedup) findings before ID assignment and section writing. The correctness of FR-013/FR-016 loop-hygiene depends entirely on this function's behavior.

`loop-hygiene.ts/js` is not included in this diff, so its implementation, edge cases (empty findings list, malformed audit-log text, duplicate signatures, the `fixed-<sha>` sha-extraction), and tests cannot be reviewed here. If `selectLiftableFindings` under-filters (passes duplicate findings through), the audit log accumulates duplicates that pollute the identity-keying epoch map. If it over-filters (drops legitimate new findings), real defects are silently swallowed and the convergence dampener sees a quieter picture than reality. This is noted so the operator can confirm the dependency is separately audited.

### AUDIT-20260620-96 — Filtered HIGH findings can be recorded as a pristine run

Finding-ID: AUDIT-20260620-96
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts:350-368, src/scope-discovery/promote-findings/check-barrage-dampener.ts:373-387

`runAuditBarrageLift` filters extracted findings through `selectLiftableFindings` before deciding whether to render a zero-finding quiet section. If a fresh barrage surfaces only findings that are already present in the audit log, including HIGH findings, `liftableFindings.length === 0` and the lift writes a quiet section with no `Severity:` lines. The dampener then treats that most recent section as pristine because `singleRunCleanEngages` checks only the rendered section’s raw HIGH/MEDIUM counts.

That breaks the stated raw-signal contract in `check-barrage-dampener.ts:373-381`: “a run that VISIBLY surfaced `Severity: high` must NOT trigger immediate single-run graduation.” Downstream blast radius is high because an adopter can get an immediate dampened/skip decision after a run that did surface HIGH, as long as hygiene dedup removed the entries before rendering. A reasonable fix would keep loop-hygiene dedup from appending duplicate entries while still recording run-level raw extracted severity counts, or render a non-pristine marker section when extracted findings were present but all were filtered.

## 2026-06-20 — audit-barrage lift (20260620T132747277Z-029-govern-operability-phase-2)

### AUDIT-20260620-97 — Missing Code-sha round-trip test — epoch-keying for FR-010 jitter suppression is untested

Finding-ID: AUDIT-20260620-97
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/promote-findings/check-barrage-dampener.ts:38–56 (CODE_SHA_RE + codeSha field), src/subcommands/audit-barrage-lift-render.ts:93–96 and 136–139 (Code-sha: write), tests/promote-findings/degraded-not-quiet.test.ts (test fixtures)

The `Code-sha:` → `codeSha` → per-epoch `seenMaxRankByEpoch` keying is the load-bearing mechanism for FR-010/codex-01: a finding re-rated to HIGH on a DIFFERENT sha from its prior low/medium sighting must COUNT (different epoch, genuinely new), while the same finding re-rated on the SAME sha must be SUPPRESSED (jitter). The implementation correctly plumbs this — `CODE_SHA_RE = /^Code-sha:\s*(\S+)/i` parses the marker written by `renderSection`/`renderQuietSection`, and the epoch map uses `count.codeSha ?? count.runDirBasename` as the key.

However, none of the new test fixtures in this diff emit a `Code-sha:` line. All helper functions in `degraded-not-quiet.test.ts` — `degradedSection`, `healthyQuietSection`, `highSection` — produce sections without a `Code-sha:` marker. Every test therefore runs in the `codeSha === undefined` path, where the epoch key is the unique `runDirBasename` (one epoch per section, no cross-section suppression at all). The critical boundary — same sha, two sections, medium → HIGH = jitter; different sha, medium → HIGH = real new finding — has no test.

A regex drift between the written format (`Code-sha: ${tipSha}\n`) and `CODE_SHA_RE` (e.g., if `renderSection` ever writes `code-sha:` lowercase without the `i` flag catching it, or if the marker line gains leading whitespace), or a bug in the `codeSha?.[1]` capture, would silently fall back to per-`runDirBasename` isolation — which is conservative in the direction of over-counting new findings, not under-counting. That direction is safe for security but would defeat the entire purpose of FR-010 jitter suppression: the streak would never engage because every re-rate-up at the same sha would count as new. The audit-log test commits (T016-T018 in `dbf3bfc1`) likely cover identity-keying by signature, but the `Code-sha:` epoch isolation dimension is a distinct axis that those tests almost certainly don't exercise either (the referenced test IDs predate the codex-01 refinement).

A minimal fix: add a test that builds two audit-log sections sharing `Code-sha: abc123` where a finding escalates medium → HIGH, verifying `newHighPlusCount === 0` for the second section (jitter suppressed), and a parallel test where the second section carries `Code-sha: def456` and the same finding escalating HIGH is counted (`newHighPlusCount === 1`).

---

### AUDIT-20260620-98 — Stale comment claims "degraded+0-findings branch records nothing" after behavior was inverted

Finding-ID: AUDIT-20260620-98
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts (the comment block immediately above the `renderSection` call for the non-zero-liftable-findings path)

The comment block above the `renderSection` call reads (rendered from the diff at approximately the `// specs/029 US2 (FR-007): when this findings-section is recorded over a DEGRADED fleet...` block):

> `(the degraded+0-findings branch above already records nothing; this covers degraded+findings, where 0 HIGH+ from the survivors is not clean).`

This description matches the **removed** behavior — the old early-return block (`if (findings.length === 0 && fleet !== undefined && fleet.produced < fleet.configured) { ... return 0; }`) that explicitly recorded nothing for a zero-finding degraded run.

The new behavior is the opposite: the `if (liftableFindings.length === 0)` branch records a **DEGRADED-marked section** (not nothing) precisely so the dampener sees the degraded run as its most-recent entry and blocks convergence. The whole point of the US2 redesign was to make the stale-prior-clean-section bug impossible — and the comment documenting the resulting calling convention now describes the pre-fix world.

A future maintainer reading "the branch above records nothing" while staring at a DEGRADED-marked quiet section in the audit-log would be confused about the invariant and might reintroduce the old nothing-recording behavior thinking it's a regression. The fix is to update the comment to read something like: "the degraded+0-findings branch above records a DEGRADED-marked quiet section; this branch handles degraded+findings, where 0 HIGH+ from surviving lanes is equally not a clean signal."

---

### AUDIT-20260620-99 — `tip.sha` content is not validated as a hex sha before use as epoch key

Finding-ID: AUDIT-20260620-99
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts (tipShaPath read block, roughly the `if (existsSync(tipShaPath))` block)

```typescript
const raw = (await (args.read ?? ((p: string) => readFile(p, 'utf8')))(tipShaPath)).trim();
if (raw.length > 0) tipSha = raw;
```

The comment says "`tip.sha` — a single 40-hex line the barrage writes." The read accepts any non-empty string. If the barrage write fails partially and leaves an error message, a newline-only file that trims to empty is handled correctly, but a file containing e.g. `fatal: ...` or a relative path would be accepted as a sha and recorded as the `Code-sha:` marker.

The epoch key in the dampener is then `count.codeSha ?? count.runDirBasename`. Two sections with the same garbage sha value would share an epoch — potentially suppressing HIGH findings across sections that should be isolated. Two sections with different garbage values would each get a unique epoch (the per-`runDirBasename` fallback behavior), which is the conservative direction. The blast radius is limited: the worst case is insufficient jitter suppression (treated as different epochs, so re-rate-up jitter would block when it shouldn't). It does not enable false convergence.

A one-line guard like `if (/^[0-9a-f]{40}$/i.test(raw)) tipSha = raw;` (or a stderr warning when the content doesn't match) would make the epoch boundary predictable regardless of upstream barrage write quality.

---

### AUDIT-20260620-100 — `completedNonConvergedAnnotation` redundantly shows "exit 0" for zero-byte lanes

Finding-ID: AUDIT-20260620-100
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/scope-discovery/audit-barrage/types.ts:347–357

For the zero-byte sub-state (`exitCode === 0, reportBytes === 0`), the output is:

```
" — completed but DEGRADED [zero-byte] (exit 0, report bytes 0)"
```

The `[zero-byte]` label already names the sub-state. The `(exit 0, ...)` that follows is both redundant (zero-byte by definition exits 0) and visually ambiguous: `exit 0` conventionally reads as success, which conflicts with the `DEGRADED` label appearing in the same string. A reader skimming the fleet report could interpret `exit 0` as indicating the lane completed normally before noticing the DEGRADED context. For the `nonzero-exit` sub-state the exit code is non-redundant and useful; for `zero-byte` it adds noise.

The fix is minimal: omit the exit code from the zero-byte branch, e.g.:

```typescript
const kind = lane.reportBytes === 0
  ? 'zero-byte'
  : `nonzero-exit (${lane.exitCode})`;
const suffix = lane.reportBytes === 0
  ? `report bytes ${lane.reportBytes}`
  : `exit ${lane.exitCode}, report bytes ${lane.reportBytes}`;
return ` — completed but DEGRADED [${kind}] (${suffix}); not counted as produced`;
```

### AUDIT-20260620-101 — Deduped repeat HIGHs are rendered as quiet runs, so persistent defects can dampen

Finding-ID: AUDIT-20260620-101
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts:347-383; src/scope-discovery/promote-findings/check-barrage-dampener.ts:291-354

`runAuditBarrageLift` now filters extracted findings through `selectLiftableFindings(...)` before deciding whether to append a quiet section. If every extracted finding is “already-present” cross-run dedup, `liftableFindings.length === 0` records a quiet section with no `Severity:` lines. The dampener can only infer persistence from findings that appear in sections, so repeated HIGHs removed by loop hygiene disappear from the recent window instead of counting as persistent HIGHs.

This contradicts the new dampener contract in `check-barrage-dampener.ts`, which explicitly treats a signature “already seen at HIGH/blocking and stays HIGH+” as blocking. A realistic sequence is: run 1 records HIGH, run 2 surfaces same HIGH but lift dedups it and writes quiet, run 3 does the same, then the two most recent sections look clean and convergence engages while the auditor is still reporting the defect. Blast radius is high because this can falsely open the governance gate on an unresolved, repeatedly surfaced HIGH. A reasonable fix is to keep loop hygiene from appending duplicate full entries while still recording a per-run occurrence signal the dampener can count, or make the dampener consult deduped extracted findings before quiet-section rendering.

## 2026-06-20 — audit-barrage lift (20260620T161013243Z-029-govern-operability-phase-2)

Code-sha: 21f8547bc0e929f5e8844d116a1ba650a06dcfd6
### AUDIT-20260620-102 — `renderRereportEntry` omits the canonical pointer promised by its JSDoc

Finding-ID: AUDIT-20260620-102
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift-render.ts:161-173 (the `renderRereportEntry` private function)

The JSDoc block directly above `renderRereportEntry` (added in this diff) explicitly states that re-report entries carry "a pointer back to the canonical entry that already tracks this finding." The implementation renders only four fields — the `### heading`, `Status: re-reported (already tracked)`, `Severity:`, and `Surface:` — and no canonical-entry pointer:

```typescript
return [
  `### ${finding.heading}`,
  '',
  `Status:     re-reported (already tracked${suffix})`,
  `Severity:   ${finding.severity}`,
  `Surface:    ${finding.surface}`,
  '',
].join('\n');
```

An operator reviewing the audit log would see a re-reported entry and know only that *some* canonical entry tracks the finding, not which one. They would have to search the log by heading text or surface to locate the tracking entry. This is a traceability gap: if the heading was edited between rounds, or if the log is long, correlation becomes manual. A `Canonical: AUDIT-NN` line — populated from whatever field `ExtractedFinding` carries about its original assignment — would close it. The contract is documented but unimplemented, so a downstream consumer reading the docstring and the rendered output will encounter a silent discrepancy.

---

### AUDIT-20260620-103 — Stderr reports "extracted N finding(s)" after dedup partition, but N is the post-dedup count

Finding-ID: AUDIT-20260620-103
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts:401-404 (the `stderr.write` call after `renderSection`)

Before this diff, the log line read "extracted N finding(s)" where N came from `findings` — the raw extraction from the run directory. After this diff, the same phrasing is used but N now comes from `liftableFindings` — the post-partition count with dedup-suppressed and resolved findings removed:

```typescript
stderr.write(
  `audit-barrage-lift: extracted ${liftableFindings.length} finding(s) from ${opts.runDir}; ` +
    `assigning ${assignedIds[0]}..${assignedIds[assignedIds.length - 1]}.\n`,
);
```

If `partitionLiftableFindings` (which does log its own dedup decisions through the callback) suppressed three findings from a five-finding extraction, the operator reads "extracted 2 finding(s)" — ambiguous about whether the run produced two total or five-with-three-suppressed. The word "extracted" now means "liftable after partition". The semantic mismatch is especially notable because the `dedupSuppressedOpen.length > 0` branch below explicitly logs re-reports — so the operator does eventually see the right picture, but the "extracted" line understates the run at the first glance. Changing the phrasing to "liftable" or "assigning IDs to N of M finding(s)" would match what the code actually does.

---

### AUDIT-20260620-104 — `record-no-new-findings-section.ts` is imported but absent from the diff

Finding-ID: AUDIT-20260620-104
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/audit-barrage-lift.ts:42 (the import line)

The refactored `liftableFindings.length === 0` branch delegates entirely to `recordNoNewFindingsSection`, imported from `'./record-no-new-findings-section.js'`. This module handles three sub-cases that the old inline code handled: re-report-only runs, degraded-fleet runs, and genuine quiet runs. It is not present in the diff. Its return type must match the `Promise<number>` that `runAuditBarrageLift` expects (since it is `return`ed directly); its handling of the `dedupSuppressedOpen` array is the correctness-critical path for the graduation-safety fix (US3 SC-001). Similarly, `partitionLiftableFindings` from `'../govern/loop-hygiene.js'` is the partition primitive whose two-bucket semantics underpin the entire fix — also absent from the diff. These are the surfaces where the audited behavior lives; this audit covers only the caller site.

---

### AUDIT-20260620-105 — `appendSection` produces a leading newline on a fresh (empty) audit log

Finding-ID: AUDIT-20260620-105
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts:23-28 (`appendSection`)

When `existing` is the empty string (brand-new audit log, no prior content), `trimmed` is `''`, `trimmed.length > 0` is `false`, `separator` is `'\n'`, and the composed result is `'' + '\n' + section`. The written file therefore begins with a blank line before the first `## ` heading. The old inline logic in `audit-barrage-lift.ts` had identical behaviour (the same `'\n'` separator path), so this is preserved rather than introduced by the diff. The remark exists because the docstring describes this as "a single newline when the log was empty" — which is accurate — but the effect is a leading blank line rather than the section starting at column 0 of line 1. This is cosmetic for human readers and benign for the dampener's line-oriented parsing, but any downstream parser that assumes the first non-whitespace character of a fresh log is `#` would need to tolerate the leading newline.

## 2026-06-20 — audit-barrage lift (20260620T161307671Z-029-govern-operability-phase-2)

Code-sha: 21f8547bc0e929f5e8844d116a1ba650a06dcfd6
### AUDIT-20260620-106 — Re-report entries carry no canonical AUDIT-NN cross-reference

Finding-ID: AUDIT-20260620-106 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=high, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift-render.ts:167–177 (`renderRereportEntry`)

`renderRereportEntry` emits `Status: re-reported (already tracked...)` but never names the canonical `AUDIT-NN` entry the finding was matched against. An operator reading the audit log sees a finding heading resurface with "already tracked" but has no machine-readable or even human-readable pointer to the original entry. Cross-referencing requires manually scanning the full audit log for matching heading text — which is fragile (headings can drift between runs due to model phrasing variation) and operationally expensive for a large log.

The deeper issue is a type-system gap: `partitionLiftableFindings` must perform the signature-to-canonical-ID match internally (that is how it classifies `dedupSuppressedOpen`), but the return type delivers `ExtractedFinding` objects that carry no `canonicalId` field. The match result is discarded after classification. The fix is to widen the `dedupSuppressedOpen` element type to `{ finding: ExtractedFinding; canonicalId: string }` and thread the canonical ID through to `renderRereportEntry`, producing `Status: re-reported (see AUDIT-042)`. Without this, the re-report section is navigable only by human inspection — which defeats the stated goal of making the dampener's dampening decisions auditable.

---

### AUDIT-20260620-107 — Load-bearing modules absent from the diff — critical paths unauditable

Finding-ID: AUDIT-20260620-107
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts (import lines ~39–51); src/govern/loop-hygiene.ts (absent); src/subcommands/record-no-new-findings-section.ts (absent)

Two modules that carry the core US4 invariant are imported by the audited code but not present in the diff:

1. `partitionLiftableFindings` from `../govern/loop-hygiene.js` — this function is the gate that distinguishes FR-016 dedup-suppressed-open findings from FR-013 fixed/resolved findings and from genuinely new liftable ones. The entire correctness of the partition (the reason a deduped run cannot become a false-pristine run) lives here. The diff shows the call site and the destructuring `{ liftable: liftableFindings, dedupSuppressedOpen }`, but provides no surface to verify that the partition is keyed correctly, that `fixed-<sha>` findings are excluded from both output buckets, or that the signature comparison is the same one the dampener's identity-keyed counter uses.

2. `recordNoNewFindingsSection` from `./record-no-new-findings-section.js` — this function owns the three-sub-case branch (re-report-only / degraded / pure-quiet) that US4's stated graduation-safety goal depends on. The commit subject `c29ab734 feat(029): US4 — loop hygiene + override short-circuit (T020-T028)` places both files in scope of the audited range. Their absence means the most critical logic of the feature — the code that decides whether a zero-new-liftable run records a dampener-counted section — cannot be audited from the provided diff.

Blast radius: if `partitionLiftableFindings` mis-classifies a still-open HIGH as resolved, or if `recordNoNewFindingsSection` omits `Severity:` lines from re-report sections, the false-pristine run that US3 SC-001 was designed to block slips through undetected and the graduation gate passes a broken feature. That is the exact failure mode US4 exists to close.

---

### AUDIT-20260620-108 — "extracted N finding(s)" log message reports NET-NEW count, not total barrage findings

Finding-ID: AUDIT-20260620-108
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts:401 (stderr write after `renderSection`)

```typescript
`audit-barrage-lift: extracted ${liftableFindings.length} finding(s) from ${opts.runDir}; ` +
  `assigning ${assignedIds[0]}..${assignedIds[assignedIds.length - 1]}.\n`
```

`liftableFindings.length` is the count of findings that survived FR-013 and FR-016 suppression — the net-new set. The original message used `findings.length`, which was the total count extracted from the run directory. An operator correlating this log line against the raw barrage run files (which list all findings the models emitted) will observe a discrepancy and be unable to distinguish "findings suppressed because already fixed" from "findings suppressed because open and re-surfaced" from "findings that are genuinely net-new." A subsequent message logs the re-surfaced count, but the first line sets a false expectation. A clearer shape: `"extracted ${findings.length} finding(s) from ${opts.runDir} (${liftableFindings.length} new, ${dedupSuppressedOpen.length} persistent-open re-surfaced); assigning..."` makes the suppression accounting visible at a glance.

---

### AUDIT-20260620-109 — Mixed-section re-reports appended without explanatory preamble

Finding-ID: AUDIT-20260620-109
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift.ts:418–430 (re-report inline append); src/subcommands/audit-barrage-lift-render.ts:195–219 (`renderRereportSection`)

When a run produces both new findings and re-surfaced already-tracked ones, re-report entries are appended to the new-findings section via:

```typescript
const sectionWithRereports =
  rereportEntries.length > 0 ? `${section}\n${rereportEntries}` : section;
```

The pure-re-report path (`renderRereportSection`, used when `liftableFindings.length === 0`) wraps its entries in an explicit preamble:
> *"No NEW findings — every finding this run surfaced is already tracked in the audit-log (FR-016 cross-run dedup). Re-reported here, WITHOUT new IDs or backlog tasks, so the convergence dampener still sees their severity..."*

The mixed path has no equivalent. Re-report entries appear after new entries with only `Status: re-reported` as their signal. A section containing, say, four `Status: open` new entries followed by two `Status: re-reported` entries gives no structural hint that the entries represent different categories. Operators scanning the log quickly (the normal mode during triage) must read each `Status:` field individually to distinguish them. Adding even a single-line label — e.g. `_Re-surfaced persistent findings (already tracked; no new IDs assigned):_` — before the re-report block in the mixed-section case would bring the two paths to parity and make sections machine-scannable without full status-field parsing.

---

### AUDIT-20260620-110 — Fixed/resolved finding suppression produces no stderr accounting

Finding-ID: AUDIT-20260620-110
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts:349–364 (partition call site and stderr logging); src/govern/loop-hygiene.ts (absent)

The diff comment at lines ~352-360 describes a three-way partition: `liftable` (new), `dedupSuppressedOpen` (FR-016 dedup), and implicitly a third category — findings that matched `fixed-<sha>` log entries and were silently dropped (FR-013). The destructuring `{ liftable: liftableFindings, dedupSuppressedOpen }` captures only two buckets. No stderr message accounts for how many findings were suppressed because they were already resolved. An operator debugging "why did only 3 of the 10 barrage findings reach the log" has no signal for the FR-013-suppressed category; they see `liftableFindings.length = 3` and `dedupSuppressedOpen.length = 4` but cannot reconstruct the arithmetic to reach 10. Adding a `resolvedSuppressed` field to the partition result (even if only logged to stderr and never written to the audit log) would close this observability gap. The fix is low-cost: widen the return type, add one log line.

## 2026-06-20 — audit-barrage lift (20260620T162649539Z-029-govern-operability-phase-2)

Code-sha: e9f1d15e1c6677f6f31bac0668d1833ce80ec27e
### AUDIT-20260620-111 — Critical path delegated to `recordNoNewFindingsSection` — not in the diff

Finding-ID: AUDIT-20260620-111
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts:370–382 (the `liftableFindings.length === 0` return branch)

The `liftableFindings.length === 0` branch — the load-bearing path for the graduation-safety fix this whole US4 series targets — was previously ~30 lines of explicit, auditable logic directly in `runAuditBarrageLift`. It has been replaced entirely by a delegation to `recordNoNewFindingsSection`, which is imported from `./record-no-new-findings-section.js` but is **not present anywhere in this diff**. That function receives all decision inputs (`dedupSuppressedOpen`, `fleet`, `apply`, `write`, `stderr`, etc.) and is responsible for the three-way branch (re-report section / degraded-quiet section / clean-quiet section) plus the dry-run gate. None of those behaviors are auditable here.

Specifically unverifiable: (1) whether the three cases are dispatched in the documented priority order (re-report > degraded > quiet); (2) whether `apply: opts.apply` is actually honored — i.e., whether dry-run mode is preserved; (3) whether the function correctly returns `0` on success and a non-zero code on write failure; (4) whether `renderRereportSection` is called with the correct arguments when `dedupSuppressedOpen.length > 0`. The prior implementation had all of these visible and checkable. The new one hides them behind a module boundary the diff does not cross.

Blast-radius: if `recordNoNewFindingsSection` has a bug in any of these cases — most critically around the re-report path — a real still-open HIGH finding can be silently omitted from the recorded section, exactly the US3 SC-001 defeat the feature was written to prevent. The fact that the function is new (it's a new import) rather than an existing utility means there is no prior test coverage it can rely on.

---

### AUDIT-20260620-112 — Two detached JSDoc blocks on `RereportInput` — only the second attaches

Finding-ID: AUDIT-20260620-112
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift-render.ts (the two `/** */` blocks immediately before `export interface RereportInput`)

The diff adds two consecutive `/** ... */` comment blocks, then `export interface RereportInput`. TypeScript JSDoc binding attaches only the **immediately preceding** block to the declaration; the first block is syntactically floating — it is a comment on nothing, and no editor hover or `tsdoc` extraction will surface it on the interface.

The first block (the longer "graduation-safety fix" explanation) describes the *section* semantics and why re-reports carry no `Finding-ID:`. The second block describes the render-layer contract for the pairing. The first block's content is architecturally important but will be invisible to any tooling that reads JSDoc from the interface declaration. A developer reading `RereportInput` in an IDE hover will see only the shorter second comment. The longer explanation should either be converted to a non-JSDoc `//` block comment (if it is intended as module-level narrative), or merged into the single JSDoc block that precedes the interface.

---

### AUDIT-20260620-113 — `sectionWithRereports` appends to `section` without normalizing trailing whitespace

Finding-ID: AUDIT-20260620-113
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts — the `sectionWithRereports` composition (~line 435–440)

```typescript
const sectionWithRereports =
    rereportEntries.length > 0
      ? `${section}\n${REREPORT_MIXED_LABEL}\n\n${rereportEntries}`
      : section;
```

`section` is the return value of `renderSection`, whose trailing whitespace is not visible in this diff. If `renderSection` returns content ending with `\n\n` (a common render-function convention that ensures a blank line at end), the composition produces `\n\n\n` before `REREPORT_MIXED_LABEL` — three newlines, i.e. two blank lines in rendered markdown. This is cosmetically inconsistent with every other section boundary in the log, which uses a single blank line (two newlines).

By contrast, `appendSection` was introduced specifically to normalize this: it trims trailing whitespace from `existing` before inserting the separator. The `sectionWithRereports` composition bypasses that normalization for the `section → REREPORT_MIXED_LABEL` join while correctly using `appendSection` for the `auditLogText → sectionWithRereports` join. A simple `section.replace(/\s+$/, '')` before the template literal, or routing through a local `appendSection(section, REREPORT_MIXED_LABEL + '\n\n' + rereportEntries)` call, would make the two joins consistent.

---

### AUDIT-20260620-114 — `appendSection` inserts a leading newline for an empty `existing` argument

Finding-ID: AUDIT-20260620-114
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts — `appendSection`, line `const separator = trimmed.length > 0 ? '\n\n' : '\n';`

When `existing` is an empty string, `trimmed` is also empty, so `separator = '\n'`. The composed result is `'\n' + section` — the output file starts with a blank line before any content. The docstring acknowledges this as "a single newline when the log was empty," but the natural expectation for a new file is no leading blank line; the section header should be the first character.

In the current call sites this edge case does not arise: `buildAuditLogHeader` populates `auditLogText` for new logs before any `appendSection` call, so `existing` is always non-empty in practice. The risk is that a future caller of `appendSection` (it is now exported) passes an empty string and gets a file with a leading blank line without understanding why. A guard `const separator = trimmed.length > 0 ? '\n\n' : '';` would eliminate the edge case and is consistent with the intent.

---

### AUDIT-20260620-115 — `renderRereportSection` has no guard against empty `findings`

Finding-ID: AUDIT-20260620-115
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts — `renderRereportSection` function signature and body

`renderRereportSection` accepts `findings: readonly RereportInput[]` with no early-return for `findings.length === 0`. If called with an empty array, it produces a section that includes the preamble ("No NEW findings — every finding this run surfaced is already tracked…") followed by zero entries — a section whose preamble claims to list re-surfaced findings but contains none. This is misleading output.

The call site in `recordNoNewFindingsSection` (not visible in this diff) is responsible for guarding against this; but the function itself provides no contract enforcement. A one-line guard — `if (findings.length === 0) throw new Error('renderRereportSection: findings must be non-empty')` or a documented precondition — would make the contract explicit and catch miscalled sites at development time.

---

### AUDIT-20260620-116 — `partitionLiftableFindings` — the categorization driver — is not visible in this diff

Finding-ID: AUDIT-20260620-116
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/audit-barrage-lift.ts — `import { partitionLiftableFindings } from '../govern/loop-hygiene.js'`

The new `partitionLiftableFindings` function drives the entire three-way partition (`liftable`, `dedupSuppressedOpen`, `resolvedSuppressed`) that all of the US4 logic builds on. The correctness of the re-report section, the dampener severity counting, and the FR-016 dedup guarantee all depend on this function correctly categorizing every finding in the extracted set. Its implementation is not in this diff.

I am noting this as informational rather than high because the commits reference T020-T028 loop-hygiene work that presumably covers this function, and the diff's logic reads consistently against the stated contract (`dedupSuppressedOpen` = already-present-open, `resolvedSuppressed` = already-present-fixed). But any reader auditing the graduation-safety correctness end-to-end should trace through `partitionLiftableFindings` and its signature matching of findings against audit-log content, since a keying error there would silently misclassify findings and bypass the re-report path.

## 2026-06-20 — audit-barrage lift (20260620T163052556Z-029-govern-operability-phase-2)

Code-sha: e9f1d15e1c6677f6f31bac0668d1833ce80ec27e
### AUDIT-20260620-117 — `record-no-new-findings-section.ts` is entirely absent from the diff

Finding-ID: AUDIT-20260620-117
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/audit-barrage-lift.ts (the import at line ~52 and the `liftableFindings.length === 0` branch at ~365)

The prior inline `if (findings.length === 0)` block (~30 lines of code) has been removed and replaced with a call to `recordNoNewFindingsSection`, imported from `./record-no-new-findings-section.js`. That module does not appear anywhere in the diff. This is the exclusive handler for the three most operationally sensitive sub-cases: (a) pure quiet run over a healthy fleet, (b) pure quiet run over a degraded fleet, and (c) the pure-re-report case (all findings already tracked). The correctness of the graduation-safety fix rests heavily on case (c): an all-deduped re-run must produce a re-report section—not a pristine quiet section—so the dampener's single-run-clean rule cannot falsely graduate a feature with open HIGH findings. Without the module in the diff, none of those three branches can be audited for correctness, for consistent use of `appendSection`, for proper error handling, or for correct routing between the quiet/re-report paths. Blast-radius: if the module misroutes any case (e.g. produces a quiet section when it should produce a re-report section), US3 SC-001 is silently defeated—the exact failure this feature was shipped to fix.

---

### AUDIT-20260620-118 — `renderRereportSection` produces a factually incorrect preamble when called with empty `findings`

Finding-ID: AUDIT-20260620-118
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/audit-barrage-lift-render.ts:193–240 (`renderRereportSection`)

`renderRereportSection` accepts `findings: readonly RereportInput[]` and unconditionally emits:

```
_No NEW findings — every finding this run surfaced is already tracked in the audit-log
(FR-016 cross-run dedup). Re-reported here…_
```

followed by `renderRereportEntries(findings)`. When `findings` is empty, `renderRereportEntries` returns `''`, so the output is a section heading plus the preamble but zero entries. The preamble's claim—"every finding this run surfaced is already tracked"—is then literally false: no findings were surfaced at all. This is distinct from a quiet run. The function has no guard (no early-return, no assertion, no caller-visible contract) preventing the empty-input call. Whether the actual caller in `record-no-new-findings-section.ts` enforces this precondition is unknowable from this diff (see AUDIT-BARRAGE-claude-01). Blast-radius: if the caller passes an empty slice, the produced section has a misleading preamble that an operator reading the audit-log might mistake for a quiet-run record or a stale entry, which could confuse manual triage of graduation eligibility.

A minimal fix is an early-return `if (findings.length === 0) return '';` at the top of `renderRereportSection`, or a thrown error, so the confusion cannot be emitted silently. The function's design contract ("I was given deduped-open re-surfaces; I render them with a preamble") should be enforced at the boundary.

---

### AUDIT-20260620-119 — Two inconsistent predicates guard the same logical condition in the mixed-section path

Finding-ID: AUDIT-20260620-119
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts:421–440 (mixed-section composition block)

The mixed-section block checks `rereportEntries.length > 0` (a string-length test) to decide whether to append the re-report label and entries, then separately checks `dedupSuppressedOpen.length > 0` (an array-length test) to decide whether to emit the stderr accounting message:

```typescript
const rereportEntries = renderRereportEntries(dedupSuppressedOpen);
const sectionWithRereports =
  rereportEntries.length > 0
    ? `${section}\n${REREPORT_MIXED_LABEL}\n\n${rereportEntries}`
    : section;
if (dedupSuppressedOpen.length > 0) {
  stderr.write(`…`);
}
```

These are logically equivalent today because `renderRereportEntries` returns `''` iff its input is empty. However, using two different predicates for the same decision increases the surface area for divergence if `renderRereportEntries`'s contract ever changes (for example, if it emits a sentinel string for empty input). Preferring a single predicate—`dedupSuppressedOpen.length > 0`—in both branches removes the implicit coupling to `renderRereportEntries`'s empty-return contract.

---

### AUDIT-20260620-120 — Orphaned leading JSDoc block before `RereportInput` will not be associated with any declaration

Finding-ID: AUDIT-20260620-120
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift-render.ts:141–174 (two consecutive `/** */` blocks before `export interface RereportInput`)

TypeScript/TSDoc associates a doc-comment with the immediately following declaration. Two consecutive `/** */` blocks appear before `export interface RereportInput`: a large design-rationale block (~25 lines) followed by a shorter attribution block. TSDoc attaches only the second (shorter) block to `RereportInput`; the first block is a floating orphan—any documentation tooling will silently discard it. The large block reads as if it is intended to document the `renderRereportSection` concept that follows, but it is placed before the interface declaration that comes first. A reasonable fix is to move the large block immediately above `renderRereportSection` (its natural home), leaving the short attribution comment as the sole TSDoc for `RereportInput`. Alternatively, collapse both into one `/** */` block. As-is, a future reader looking for the design rationale in generated docs will not find it.

## 2026-06-20 — audit-barrage lift (20260620T170746034Z-029-govern-operability-phase-4)

Code-sha: 3f64cc86acf1b643ee521d85f43b6bea7f971d46
### AUDIT-20260620-121 — Override graduation swallows convergence-record write failure → CLI-success/gate-signal divergence

Finding-ID: AUDIT-20260620-121 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/govern/override-graduate.ts:52-69

`recordOverrideGraduation` wraps `recordGovernConvergence` in a try-catch that catches the error, emits a `WARNING` to stderr, and **returns normally** (`void`). The caller in `govern.ts` (line ~850-860) then unconditionally executes `emitTerminalOutcome('graduated')` and `process.exit(0)`. If the convergence record write fails at runtime (disk full, permission denied, parent directory missing), the CLI reports success and the govern workflow advances, but the durable gate file—the only artifact the `governing → shipped` gate reads—is never written. The gate remains CLOSED while the CLI says OPEN.

This directly undermines the invariant that FINDING 2 (codex HIGH, prior audit) was intended to fix: "CLI success must not diverge from the gate signal." The prior fix correctly ensures a roadmap node is resolved before any write is attempted, eliminating the pre-029 case where the node failed and no record was written. But it left the write-itself-fails case in the same divergent state.

The inconsistency with the normal convergence path amplifies this. For a normal (non-override) graduation, `recordGovernConvergence` is called without a try-catch; a write failure propagates to the outer catch in `govern.ts` (`govern: FATAL — …`, exit 1). So the normal path fails loud; the override path emits a WARNING and exits 0. The comment in `override-graduate.ts` claims this "mirrors the convergence graduation's fail-safe," but the normal path has no such fail-safe—it throws. The comment is incorrect, and the behavioral divergence is real.

Fix: remove the try-catch in `recordOverrideGraduation` and let `recordGovernConvergence` throw, or return a `{ ok: false; message: string }` discriminated union that the caller checks and converts to a FATAL + exit 2 before `emitTerminalOutcome('graduated')` is reached.

---

### AUDIT-20260620-122 — `GOVERN_OVERRIDE` env-var whitespace-only reason bypasses the empty-reason guard

Finding-ID: AUDIT-20260620-122 (claude-02 + codex-02; cross-model)
Status:     fixed-7c064bc3
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts:781-800 (override-reason resolution block)

The explicit-blank guard applies only to the CLI flag:

```typescript
if (flags.override !== undefined && flags.override.trim().length === 0) {
  // FATAL
}
const overrideReason = pick(flags.override, process.env.GOVERN_OVERRIDE);
if (overrideReason !== undefined && overrideReason.length > 0) {
  // override fires
```

`pick(undefined, process.env.GOVERN_OVERRIDE)` returns the env var when the flag is absent. If `GOVERN_OVERRIDE` is `"   "` (whitespace), `overrideReason.length > 0` is true (length 3), and the override block fires with a whitespace-only reason. The convergence-record validator in `convergence-record.ts:155-162` checks `overrideReason.length === 0`, which is false for whitespace, so the record is written with `overrideReason: "   "`. The comment at the guard site states: "an empty or whitespace-only reason is rejected so a blank flag cannot silently short-circuit into — or fall through to — a full barrage." That invariant holds for the CLI flag path but not for the env-var path.

The blast radius is bounded—`GOVERN_OVERRIDE` is an internal env var unlikely to be set to whitespace in practice—but the stated security property ("whitespace is rejected") is incomplete. Any CI or scripted use that reads the reason from an env var could silently accept a blank override. Fix: apply `.trim().length === 0` to `overrideReason` (after `pick`) rather than only to `flags.override`, mirroring the trim-check logic already in the CLI-flag guard.

---

### AUDIT-20260620-123 — `slush-findings` dry-run silently skips `reconcileFixedFindings`, giving incomplete preview

Finding-ID: AUDIT-20260620-123
Status:     fixed-89849396
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/slush-findings.ts:149-188 (reconcile block)

`reconcileFixedFindings` is gated entirely on `opts.apply`:

```typescript
if (opts.apply) {
  const rec = reconcileFixedFindings({...});
  ...
}
```

When run without `--apply` (dry-run mode), the reconcile is completely skipped—no output, no preview of which fixed-finding tasks would be auto-closed. An operator running without `--apply` to preview the slush operation sees the migration dry-run output but nothing about backlog closures. If several tasks would be auto-closed (findings flipped to `fixed-<sha>` since the last slush), the operator has no warning before the `--apply` run closes them.

This is an ergonomics/trust issue: the dry-run contract is "show me what `--apply` would do." The current behavior delivers an incomplete preview. Fix: unconditionally compute the would-be reconciliations (read-only: find fixed findings whose tasks are non-Done) and emit a "would close N task(s)" line on stdout, then guard only the `backend.close()` calls on `opts.apply`.

---

### AUDIT-20260620-124 — `writeResolvedPhaseCheckpoint` declares `string` return type that both callers ignore

Finding-ID: AUDIT-20260620-124
Status:     fixed-d3ef54fc
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts:462-490 (`writeResolvedPhaseCheckpoint` definition and call sites)

`writeResolvedPhaseCheckpoint` is typed to return `string` (it passes through the return of `writePhaseCheckpoint`). Both callers—the normal graduation path (~line 1042) and the per-phase override path (~line 827)—invoke it as a statement and discard the return value. The return type on the function creates a false contract: a reader implementing a new caller might believe the path is meaningful. If `writePhaseCheckpoint` uses the returned value as a confirmation path for logging and that value is important, both call sites silently drop it.

The fix is either to change the return type to `void` (if the checkpoint path is intentionally unused by callers) or to consume the return value in at least one call site, e.g., to emit a `stderr` line confirming the checkpoint file written—which would also close the gap where a silent no-op (phaseStatus not found) is indistinguishable from a successful write.

## 2026-06-20 — audit-barrage lift (20260620T171228743Z-029-govern-operability-phase-4)

Code-sha: 3f64cc86acf1b643ee521d85f43b6bea7f971d46
### AUDIT-20260620-125 — `reconcileFixedFindings` uses a stale `list()` snapshot — potential double-close on repeat finding IDs

Finding-ID: AUDIT-20260620-125
Status:     fixed-7c064bc3
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/backlog/reconcile-fixed.ts:54-64

`args.backend.list()` is called once at the top of the function and stored in `items`. The `task.status === BACKLOG_DONE_STATUS` guard on line 60 checks against this initial snapshot — it is never refreshed after `args.backend.close(task.id)` mutates the backend on line 61. If the audit log contains two entries with different `findingId` strings that both produce the same `canonicalAuditId` (e.g., `AUDIT-20260619-01-revision` and `AUDIT-20260619-01-follow-up` both extract `AUDIT-20260619-01`), or if the audit log is corrupted with a duplicate `Finding-ID`, both iterations find the same backlog task, the stale-snapshot guard passes for the second iteration (status still shows non-Done), and `backend.close(task.id)` is called twice. If `backend.close` is not idempotent on an already-Done task (i.e., it throws), the caller in `slush-findings.ts` catches it and exits 1 with FATAL — a surprising hard failure on an operation the JSDoc describes as "idempotent." The fix is either to reload the task after each close, to track closed IDs in a local Set, or to confirm and document that `backend.close` is idempotent on already-Done tasks and update the guard to match.

---

### AUDIT-20260620-126 — `GOVERN_OVERRIDE` env var with whitespace-only value bypasses the explicit-flag guard and produces a blank attribution reason

Finding-ID: AUDIT-20260620-126 (claude-02 + codex-02; cross-model)
Status:     fixed-7c064bc3
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    src/subcommands/govern.ts (override block, lines ~789-800)

The explicit-flag guard fires only when `flags.override !== undefined && flags.override.trim().length === 0` — i.e., it protects the `--override ""` / `--override "   "` CLI flag case. The comment deliberately notes this guard does NOT apply to the `pick` result (which also reads `GOVERN_OVERRIDE`). Consequently, `GOVERN_OVERRIDE="   "` (whitespace-only) causes `overrideReason = pick(undefined, "   ") = "   "`, and `overrideReason.length > 0` is true (length 3) — the override fires with a whitespace-only attribution reason. In `convergence-record.ts` the `overrideReason` validator checks `parsed.overrideReason.length === 0`, which passes for whitespace strings; the record is written with `overrideReason: "   "`. A downstream consumer reading the durable record sees a non-empty, non-informative attribution. The fix is to apply `.trim().length === 0` consistently in both the flag guard and the `overrideReason` guard in `convergence-record.ts`'s `validate` function.

---

### AUDIT-20260620-127 — `recordOverrideGraduation` catch-and-continue exits 0 while the durable gate signal stays closed

Finding-ID: AUDIT-20260620-127 (claude-03 + codex-01; cross-model)
Status:     fixed-7c064bc3
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/override-graduate.ts:57-67

When `recordGovernConvergence` throws (filesystem error), the catch block emits a WARNING and returns normally. The caller in `govern.ts` then calls `emitTerminalOutcome('graduated')` and `process.exit(0)`. The CLI exits with a "graduated" signal, but no durable convergence record was written — so the `governing → shipped` gate remains CLOSED. This is the CLI-success-diverges-from-gate-signal pattern that feature 029 US4 (Finding 2) was explicitly designed to eliminate. The comment says "mirroring the convergence graduation's fail-safe," implying the normal graduation path has the same behavior on FS failure. If both paths share this divergence, the risk is bounded to FS-failure scenarios (which are rare), but it contradicts the stated "CLI success ↔ gate signal" design principle. The lowest-risk fix is to convert the catch into a re-throw (exit non-zero) so the operator is forced to address the FS issue before the CLI reports graduation; if the warn-and-continue behavior is intentional policy, it should be documented in the spec as an accepted trade-off.

---

### AUDIT-20260620-128 — `built.checkpoint === phaseUnit.auditLogSection` invariant for phase units enforced only by code comment

Finding-ID: AUDIT-20260620-128
Status:     fixed-7c064bc3
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts:470-476 (writeResolvedPhaseCheckpoint comment)

The shared helper `writeResolvedPhaseCheckpoint` is the key mechanism keeping the normal-graduation path and the `--override` short-circuit path in sync for per-phase checkpoints. The normal path threads `built.checkpoint`; the override path threads `phaseUnit.auditLogSection`. The comment documents the invariant: "For a phase unit `built.checkpoint` equals `phaseUnit.auditLogSection` (`buildImplementVars` is passed the section as its checkpoint flag)." This invariant is load-bearing — if `buildImplementVars` ever computes `checkpoint` differently for a phase unit (e.g., by appending a run identifier), the two paths silently write different `checkpoint` values in the nominally-shared helper, defeating the "shared so the two paths can never drift" design intent. The invariant is not asserted at runtime (no `===` check or `throw`). A lightweight fix is to add a `console.assert` or a throw at the call site in govern.ts's normal graduation path, or to restructure `writeResolvedPhaseCheckpoint` so it derives `checkpoint` from `phaseUnit.auditLogSection` internally and neither caller supplies it.

---

### AUDIT-20260620-129 — `recordNoNewFindingsSection` not visible in the diff — re-report/degraded/quiet branching unverifiable

Finding-ID: AUDIT-20260620-129
Status: migrated-to-backlog TASK-364
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/audit-barrage-lift.ts:363 (import of `recordNoNewFindingsSection`)

The zero-new-liftable-findings path (`liftableFindings.length === 0`) previously contained its logic inline in `audit-barrage-lift.ts`; it has been extracted to `./record-no-new-findings-section.js`. That module is NOT present in this diff. The comment names three sub-cases ("re-report / degraded / quiet, in that priority order") and the prior inline code for those branches has been removed. Without the extracted module, the branching logic — including the FR-007 DEGRADED-fleet marker, the quiet-section separator, and the re-report priority — cannot be cross-verified against the prior behavior in this audit. The lift-dedup tests in `tests/promote-findings/lift-dedup.test.ts` exercise the end-to-end paths and would catch regressions; the gap is that the extracted module's internal structure (e.g., precedence of re-report over degraded when both apply) is opaque from this diff alone.

### AUDIT-20260620-130 — Auto-reconcile closes only the first backlog task matching a fixed finding

Finding-ID: AUDIT-20260620-130
Status:     fixed-7c064bc3
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/backlog/reconcile-fixed.ts:51-62

`reconcileFixedFindings` uses `items.find((item) => item.refs.includes(ref))`, so only one task is closed for a fixed finding. The file header and FR-015 wording say “any backlog task that referenced that finding” must be reconciled. This matters for upgraded installations or older runs that already accumulated duplicate migrated-finding tasks before FR-016 tightened deduplication.

Blast radius is medium because existing duplicate backlog records can remain open even after the audit-log source of truth says the finding is fixed, leaving burn-down state stale. Iterate all matching non-Done items for each fixed ref, or build a ref-to-items map and close every open task carrying that ref.

## 2026-06-20 — audit-barrage lift (20260620T181916746Z-029-govern-operability-phase-4)

Code-sha: 7c064bc321f3b0d2a792e197ce23bd8e537903e5
### AUDIT-20260620-131 — Normal-graduation record-write FATAL has no test

Finding-ID: AUDIT-20260620-131
Status: migrated-to-backlog TASK-366
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts (the convergence-record write block, lines ~1110–1145 of the post-diff file)

The diff promotes the normal convergence graduation's record-write failure from WARNING+exit-0 to FATAL+exit-1. This is the correct direction (US4 Finding-2: CLI success ⟺ gate signal), and the analogous path in the override short-circuit has a test (`FATALs (non-zero) when the durable convergence record cannot be written`). However, **no test covers the normal-graduation write-FATAL**. The old split was: resolve-node failure → WARNING (unchanged); write-record failure → WARNING → now FATAL. Any regression that re-introduces the swallow (e.g., a future refactor wrapping the throw) would be invisible to the suite.

The blast-radius: adopters scripting around exit codes now get exit-1 where they previously got exit-0-with-a-warning. Without a test pinning this, the behavior can silently regress to the old shape. Minimum fix: add a test that blocks the convergence write path (place a FILE where the directory must be created, as done in the override test) and asserts exit-1 + FATAL message + no "spec may graduate" message.

---

### AUDIT-20260620-132 — Exit codes are inconsistent across FATAL scenarios

Finding-ID: AUDIT-20260620-132
Status: migrated-to-backlog TASK-367
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts (override short-circuit block)

Three distinct FATAL scenarios in the override short-circuit exit with different codes:
- Blank/whitespace reason (`--override ''` or `GOVERN_OVERRIDE='   '`) → `process.exit(2)`
- No roadmap node resolves (throws or returns undefined) → `process.exit(2)`
- Convergence record write failure → `process.exit(1)`

The two tests that assert a specific exit code both check `exit(2)`. The write-failure test only asserts `expect(r.status).not.toBe(0)`, deliberately leaving the exit code unconstrained. There is no documented distinction between exit-1 and exit-2 in the govern CLI contract.

If an adopter's CI or workflow script distinguishes "bad input" (exit-2) from "operational failure" (exit-1), the write-failure case will be mis-classified. If the intent is to use 2 for usage-class errors and 1 for I/O errors, that distinction should be documented and pinned by the test (`toBe(1)` rather than `not.toBe(0)`). If there is no intended distinction, all override FATALs should use the same exit code for consistency.

---

### AUDIT-20260620-133 — Mixed-section path (new liftable + persistent re-reported in the same run) has no test

Finding-ID: AUDIT-20260620-133
Status: migrated-to-backlog TASK-368
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/audit-barrage-lift.ts (lines ~421–450 post-diff, `sectionWithRereports` composition)

The new `sectionWithRereports` logic runs only when `liftableFindings.length > 0 && dedupSuppressedOpen.length > 0` — i.e., a run that introduces at least one NEW finding while ALSO re-surfacing an already-tracked open finding. The test suite in `lift-dedup.test.ts` covers:
- Pure new finding (run 1 only) → `liftable > 0, dedupSuppressedOpen = 0`
- Pure re-report (run 2, same finding) → `liftable = 0, dedupSuppressedOpen > 0` (dispatched to `recordNoNewFindingsSection`)

But the third case — a run that contains a brand-new finding AND re-surfaces a persistent open finding in the same extraction — is never exercised. In that case `hasRereports = true` and the code appends `\n${REREPORT_MIXED_LABEL}\n\n${renderRereportEntries(dedupSuppressedOpen)}` to the rendered section. A bug in `REREPORT_MIXED_LABEL` formatting, in `renderRereportEntries` (e.g., producing entries that the dampener miscounts), or in the `appendSection` boundary placement when the section already has trailing content, would be invisible to the suite.

Blast-radius: the dampener's `rawHighPlusCount` for the most-recent section is the load-bearing graduation gate. If re-report entries in a mixed section are malformed, a persistent HIGH could appear zero to the dampener in the presence of new liftable findings, triggering a false graduation (US3 SC-001).

---

### AUDIT-20260620-134 — Phase-checkpoint write in override path is unwrapped; an I/O failure produces an opaque uncaught error

Finding-ID: AUDIT-20260620-134 (claude-04 + codex-01; cross-model)
Status:     fixed-21c1fe27
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/govern.ts (per-phase override block, `writeResolvedPhaseCheckpoint` call site ~line 855)

The per-phase override path writes the checkpoint before calling `recordOverrideGraduation`:

```typescript
if (phaseUnit?.granularity === 'phase' && phaseUnit.phaseId !== undefined && ...) {
  const phaseStatus = phaseCheckpointStatuses.find((status) => status.phaseId === phaseId);
  if (phaseStatus !== undefined) {
    writeResolvedPhaseCheckpoint({ ... }); // ← no try/catch
  }
}
try {
  recordOverrideGraduation({ ... }); // ← correctly wrapped
} catch (err) {
  process.stderr.write(`govern: FATAL — override graduation could not write the durable convergence record...`);
  process.exit(1);
}
```

If `writePhaseCheckpoint` throws (disk full, permission error), the exception propagates past the `recordOverrideGraduation` try/catch and is caught by the outer protocol-error catch (or becomes an unhandled rejection), producing an error message that bears no relation to "the checkpoint write failed." The operator sees a confusing stack trace instead of a actionable `govern: FATAL —` message.

The state after a checkpoint-write failure is also partially confusing: the convergence record has NOT been written (the throw interrupts before `recordOverrideGraduation`), so the gate stays closed. On retry the operator hits the same checkpoint failure again without a clear diagnostic. Minimum fix: wrap `writeResolvedPhaseCheckpoint` in the same try/catch pattern as `recordOverrideGraduation`, with a descriptive FATAL message and exit-1.

### AUDIT-20260620-135 — Diff adds an explicit deferred-work marker in the govern path

Finding-ID: AUDIT-20260620-135
Status: migrated-to-backlog TASK-369
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts:1092-1100

The added comment reintroduces an operator-discipline trap: it documents a known misleading exit-code behavior and ends by saying the distinction is “deferred to T041” at line 1100. The audit instructions explicitly reject deferral phrases in the audited work product because they normalize shipping a known bug shape without an enforceable guard.

The behavioral blast radius is low for this finding as phrased because it is a comment, not executable logic. It still matters because this file is a governance control surface and the comment sits directly above code that warns but exits 0 when no convergence item resolves. A reasonable fix is to remove the deferral wording and either encode the accepted behavior as an intentional standalone-mode rule, or make the unresolved workflow-node case fail loud where the code can distinguish it.

## 2026-06-20 — audit-barrage lift (20260620T182340587Z-029-govern-operability-phase-4)

Code-sha: 7c064bc321f3b0d2a792e197ce23bd8e537903e5
### AUDIT-20260620-136 — Phase checkpoint may be written without a convergence record on override path

Finding-ID: AUDIT-20260620-136 (claude-01 + codex-01; cross-model)
Status:     fixed-89849396
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts — override short-circuit block (~line 830–875 in the diff)

In the per-phase `--override` path inside `runGovern`, `writeResolvedPhaseCheckpoint` is called **before** `recordOverrideGraduation`. The phase-checkpoint write has no enclosing try/catch, while the convergence-record write is wrapped in its own try/catch that exits 2 on failure. If the phase-checkpoint write succeeds and the convergence-record write subsequently fails (e.g., ENOSPC, ENOTDIR), the implementation exits FATAL — but the phase-N checkpoint file has already landed on disk. The adjacent comment reads:

> "Runs ONLY after the node resolved above, so a FATAL leaves nothing half-written."

This claim is false for write-level failures. The "nothing half-written" guarantee only holds for the node-resolution FATAL (before either write). Once both writes begin, a failure mid-way leaves the phase-N checkpoint current while the convergence record is absent.

The practical consequence: after the FATAL the operator could run `govern --phase N+1`. The prior-phase staleness gate checks whether phase N's checkpoint is current — it is (step A succeeded) — so phase N+1 governance proceeds. Phase N+1 eventually writes the feature-level convergence record, superseding the incomplete phase-N override. The audit trail for the phase-N override intent (FR-018 attribution) is permanently absent from the convergence record; there is no `override: true / overrideReason` from phase N, and there is no AUDIT log entry recording it (FR-017 fires zero lift). The "CLI success ⟺ gate signal" invariant the diff explicitly targets (Finding-2, codex HIGH) is partially achieved — the FATAL prevents a successful CLI exit — but the half-written phase checkpoint enables a semantic path around the failed override without any record it occurred.

A minimal fix is to reverse the write order: write the convergence record first (inside its try/catch), and only write the phase checkpoint after the convergence record lands. An alternative is to wrap `writeResolvedPhaseCheckpoint` in its own try/catch and FATAL on failure before the convergence record is attempted. Either ordering removes the half-write window. The misleading comment should also be updated to reflect the actual guarantee boundary.

---

### AUDIT-20260620-137 — `overrideReason.length > 0` guard is dead code after the blank-reason FATAL

Finding-ID: AUDIT-20260620-137
Status:     fixed-89849396
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts — override short-circuit block

After the blank-reason FATAL guard:
```typescript
if (overrideReasonRaw !== undefined && overrideReasonRaw.trim().length === 0) {
  process.exit(2);
}
const overrideReason = overrideReasonRaw?.trim();
if (overrideReason !== undefined && overrideReason.length > 0) {   // ← dead code
```

At the point the second condition is evaluated, `overrideReason` can only be `undefined` (no override supplied — the `length > 0` arm is unreachable) or a non-empty, non-whitespace string (the FATAL guard eliminated every empty/whitespace case). The `.length > 0` sub-test therefore always evaluates to `true` when `overrideReason !== undefined` and adds no information. The condition reads as if a non-empty, non-null override could somehow exist and still be the zero-length string — which the first guard makes impossible. The dead sub-expression should be removed to avoid misleading future readers.

---

### AUDIT-20260620-138 — Silent skip when `phaseStatus` resolves to `undefined` — should be fail-loud

Finding-ID: AUDIT-20260620-138
Status:     fixed-89849396
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts — override path (~line 830) and normal graduation path (~line 1047)

In both the override and the normal convergence-graduation paths, the phase-checkpoint write is guarded by:
```typescript
const phaseStatus = phaseCheckpointStatuses.find((status) => status.phaseId === phaseId);
if (phaseStatus !== undefined) {
  writeResolvedPhaseCheckpoint({...});
}
```

If `find` returns `undefined` — meaning the resolved `phaseId` has no corresponding status in `phaseCheckpointStatuses` — the checkpoint write is silently skipped. Downstream gates that check whether all phases' checkpoints are current would then fail, but with no indication at the time of governance why the checkpoint is absent. At this point in the control flow, the phase unit was already successfully resolved and prior-phase staleness was already validated; a missing status for the resolved phase is not a normal operating condition — it indicates a programmer-contract violation (the phase ID resolved in one place does not appear in the status list derived from the same phase data). A silent skip is harder to diagnose than a `GovernProtocolError`. The fix is to replace the silent-skip branch with a loud assertion: if the phase was resolved and prior-phase gates passed, its status MUST be present in the list.

---

### AUDIT-20260620-139 — `slush-findings` dry-run does not report what `reconcileFixedFindings` would close

Finding-ID: AUDIT-20260620-139
Status:     fixed-89849396
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/slush-findings.ts (~line 153)

`reconcileFixedFindings` is gated on `opts.apply`. On a dry-run invocation (`--dry-run` / no `--apply`), the reconcile path is entirely skipped: no message indicates how many tasks would be closed. The slush migration's dry-run output (what would be migrated) is thus incomplete — an operator running without `--apply` to preview the effects of slush sees the migration candidate list but no reconcile candidate list. Given that FR-015 auto-reconciliation is a new behavior introduced in this diff, operators are likely to probe dry-run output to understand what will happen before committing. The fix is to run `reconcileFixedFindings` in read-only mode on the dry-run path and emit a `[dry-run] would close N task(s): …` line, mirroring the existing dry-run gate further down in the function.

## 2026-06-20 — audit-barrage lift (20260620T183658900Z-029-govern-operability-phase-4)

Code-sha: 898493961b7df1e13142410e94f01e9e23694e2e
### AUDIT-20260620-140 — Override catch block emits incorrect gate-state message when record write succeeds but checkpoint write fails

Finding-ID: AUDIT-20260620-140 (claude-01 + claude-02 + claude-04 + claude-05 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-21c1fe27
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/subcommands/govern.ts — the try/catch wrapping `recordOverrideGraduation` + `writeResolvedPhaseCheckpoint` in the `--override` short-circuit block

The `try` block in the override path calls `recordOverrideGraduation` first (which writes the convergence record with `converged: true, override: true`), then calls `writeResolvedPhaseCheckpoint`. Both live inside a single `catch`. If `recordOverrideGraduation` succeeds — persisting a `converged: true` convergence record — and `writeResolvedPhaseCheckpoint` then throws, the catch block emits:

> `"the convergence record or per-phase checkpoint write failed, so the governing -> shipped gate stays CLOSED and this override does NOT graduate."`

That message is materially wrong. The convergence record **was** written. If the gate evaluates the record (it reads `converged: true`), it will treat the feature as graduated — not closed. The operator, reading "gate stays CLOSED," will believe they need to fix an ungradated state. Depending on the gate's evaluation logic, the actual gate state could be OPEN with a missing phase checkpoint, which is a different (and potentially more serious) problem: later phases would be blocked by the prior-phase staleness check, not by a closed `governing → shipped` gate, but the operator's diagnostic path would be entirely wrong.

The companion test covers the inverse scenario (record write fails → no checkpoint written) but there is no test for `recordOverrideGraduation` succeeding followed by `writeResolvedPhaseCheckpoint` throwing, so this branch has no coverage and the incorrect message has never been exercised.

Fix: either (a) separate the two operations into independent try/catch blocks, emitting distinct messages for "record write failed" vs. "checkpoint write failed" — including an accurate "record IS written; gate may already be OPEN; retry to write the checkpoint" message for the latter; or (b) use a pre-check atomic ordering (write record to a temp path, write checkpoint, rename record into place) so both artifacts land together or neither does.

---

### AUDIT-20260620-141 — Override path calls `resolveGovernFeatureRoot` redundantly when `featureRoot` is already in scope

Finding-ID: AUDIT-20260620-141
Status:     fixed-21c1fe27
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts — the `if (overrideReason !== undefined)` block and the `featureRoot` reference visible in the convergence-record write section further below

The `runGovern` function resolves the feature root earlier in its body (the variable is named `featureRoot` and is in scope at the non-override convergence-record write: `resolveConvergenceItem(installation, featureRoot, slug)`). The override short-circuit block, inserted before the barrage/fleet path, makes an independent `await resolveGovernFeatureRoot(repoRoot, slug)` call, naming the result `overrideRoot`. These two lookups should produce the same value because `slug` and `repoRoot` are identical, but:

1. Two async filesystem reads are performed where one suffices — wasted I/O on the critical-path override call.
2. If any state changes between the two calls (concurrent write to the feature directory, a rename, a transient FS error), `overrideRoot` and `featureRoot` diverge. The `scopeFingerprint` in the convergence record depends on `scopePaths`, so an override graduation could write a different fingerprint than a normal graduation for the same feature, making the two records non-comparable.
3. The second `resolveGovernFeatureRoot` can throw independently; that error would surface as a different message than if the first call had failed, making diagnostics inconsistent.

Fix: hoist `featureRoot` (or its resolve call) to before the override check and pass it into the override block rather than resolving it a second time. Since the override short-circuit already requires the phase unit to be resolved (it runs after the phase block), `featureRoot` is necessarily available.

---

## 2026-06-20 — audit-barrage lift (20260620T184508456Z-029-govern-operability-phase-4)

Code-sha: 898493961b7df1e13142410e94f01e9e23694e2e
### AUDIT-20260620-142 — Checkpoint-write FATAL message misrepresents gate state when record succeeds but checkpoint fails

Finding-ID: AUDIT-20260620-142 (claude-01 + claude-05 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-21c1fe27
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts:851-860 (override catch block)

In the `--phase --override` path, `recordOverrideGraduation` is called first (writing the convergence record with `override: true, converged: true` to `.stack-control/govern/convergence/`), then `writeResolvedPhaseCheckpoint` is called second. If the checkpoint write throws, execution falls into the catch block which emits:

> `the governing -> shipped gate stays CLOSED and this override does NOT graduate`

This claim is only accurate when `recordOverrideGraduation` itself threw — i.e., the convergence record was never written. But when `recordOverrideGraduation` succeeds and `writeResolvedPhaseCheckpoint` throws, the convergence record **is already on disk** with `converged: true, override: true`. If the `governing → shipped` workflow gate reads the convergence record independently of the phase checkpoint, it would see the feature as graduated at the convergence-record layer, contradicting the FATAL message. A subsequent phase's gate might then proceed against a feature that the FATAL told the operator "did not graduate."

The intent (per the inline comment) is: "a checkpoint failure FATALs without printing a graduation-success line." That's true — the success line isn't printed — but the companion claim about gate state is inaccurate for the checkpoint-failure sub-case. The blast radius: an operator who takes the FATAL at face value might re-run, find the convergence record already present, and be confused about why subsequent-phase gates behave inconsistently. A reasonable fix is to distinguish the sub-cases in the error message: when the FATAL is due to the checkpoint write (after a successful record write), say "the convergence record was written but the per-phase checkpoint was not; re-run to write the checkpoint — the convergence-record gate may already see this feature as governed."

---

### AUDIT-20260620-143 — `resolveGovernFeatureRoot` called twice in override path — `overrideRoot` duplicates already-resolved `featureRoot`

Finding-ID: AUDIT-20260620-143
Status:     fixed-21c1fe27
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts — override block (`const { root: overrideRoot } = await resolveGovernFeatureRoot(repoRoot, slug)`)

The override path introduces a fresh `resolveGovernFeatureRoot(repoRoot, slug)` call that produces `overrideRoot`, which is then passed as `scopePaths: overrideRoot !== undefined ? [overrideRoot] : []` to `recordOverrideGraduation`. However, `featureRoot` — the same feature root — was already resolved earlier in the same function invocation (it is used in the normal convergence path at the `recordGovernConvergence` call). The two resolutions should produce identical values, but they are independent filesystem calls separated by the phase-unit resolution block.

The risk is not correctness in the common case, but **scope-fingerprint divergence on an unlikely race**: if the feature directory is renamed or an in-flight write changes the result of `resolveGovernFeatureRoot` between the two calls, the convergence record written by the override path would carry a different `scopeFingerprint` than the normal path would produce for the same invocation state. More concretely, the normal convergence path uses `featureRoot` for `[featureRoot]`; the override path uses `overrideRoot` for `[overrideRoot]`. If for any reason these differ, the record's `scopeFingerprint` field diverges — and the gate, which reads the fingerprint to detect stale records, may produce different verdicts.

A straightforward fix is to reuse the already-resolved `featureRoot` rather than re-resolving it. If `featureRoot` is not in scope at the override-path call site, thread it through from the earlier resolution rather than calling `resolveGovernFeatureRoot` a second time.

---

### AUDIT-20260620-144 — `GovernConvergenceRecord.override?: boolean` allows `false` but validator silently drops it

Finding-ID: AUDIT-20260620-144
Status: migrated-to-backlog TASK-377
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/workflow/workflow-types.ts:186-191 + src/govern/convergence-record.ts:178-183

`GovernConvergenceRecord` declares `readonly override?: boolean`. This permits `false` as a valid value. The validator in `convergence-record.ts` accepts `override: false` (it only rejects non-booleans and the impossible `override: true` without a reason), but the return spread only propagates `override` when `parsed.override === true`:

```typescript
...(parsed.override === true ? { override: true } : {}),
```

A hand-edited JSON with `"override": false` would pass validation silently and be returned as a record with no `override` field — the `false` is discarded. This creates a type/runtime mismatch: the type says `false` is valid, but the runtime treats it as equivalent to absent. Additionally, any downstream consumer that writes `override: false` (intending to explicitly mark a non-override) would have its value silently dropped on the next read.

The type should be narrowed to `readonly override?: true` (a boolean literal), matching the intent and the writer behaviour. Alternatively, the validator and spread should explicitly handle `override: false` by rejecting it (since the writer never produces it, a `false` in the JSON is a corrupt or externally-edited record, which should fail loud rather than silently coerce).

---

### AUDIT-20260620-145 — Test resource leak: `tmpBacklog()` dirs never cleaned up in `done.test.ts`

Finding-ID: AUDIT-20260620-145
Status: migrated-to-backlog TASK-378
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/backlog/done.test.ts (all five `it` blocks)

Each test case calls `tmpBacklog()` (which calls `mkdtempSync`) but none of the test cases clean up the created temporary directory via `rmSync` in a `finally` block or `afterEach` hook. Contrast with `tests/govern/override-short-circuit.test.ts`, where every `it` block that creates temp directories uses `try/finally { rmSync(repo, { recursive: true, force: true }) }`. In a CI environment running many test iterations, these leaked directories accumulate on the runner's `/tmp` (or equivalent). This is a hygiene gap, not a correctness defect, but it diverges from the cleanup discipline already established in the same PR's other test files.

---

## 2026-06-20 — audit-barrage lift (20260620T190155328Z-029-govern-operability-phase-4)

Code-sha: 21c1fe276b839feb8991d6ca6ecb74739d436274
### AUDIT-20260620-146 — Normal-path "record-first" invariant fails when convergenceItem is undefined — phase checkpoint written without a convergence record

Finding-ID: AUDIT-20260620-146 (claude-01 + codex-01; cross-model)
Status: migrated-to-backlog TASK-379
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts (normal-convergence graduation block — new code after the `non-converged` branch)

The diff adds this comment to the normal graduation path:

```
// AUDIT-BARRAGE codex-02 (HIGH): record-FIRST ordering — the convergence record is
// written BEFORE the per-phase checkpoint (the override path does the same), so a
// record-write failure FATALs before any checkpoint is touched (no orphan checkpoint
// that would let a later phase advance without the feature-level record).
```

The comment claims a hard invariant — no orphan checkpoint without a feature-level record. The code only upholds this invariant when `convergenceItem !== undefined`. When `resolveConvergenceItem` throws or returns `undefined` (the T041 WARNING branch), the code emits the warning and falls through to the phase-checkpoint write unconditionally:

```typescript
let convergenceItem: string | undefined;
try {
  convergenceItem = resolveConvergenceItem(installation, featureRoot, slug);
} catch (err) {
  process.stderr.write(`govern: WARNING ...`); // no exit
}
if (convergenceItem !== undefined) {
  try { recordGovernConvergence(...); }
  catch (err) { ...; process.exit(1); }
}
// ← convergenceItem === undefined arrives HERE
if (phaseUnit?.granularity === 'phase' && phaseUnit.phaseId !== undefined && phaseCheckpointStatuses !== undefined) {
  writePhaseCheckpointAfterRecordOrFatal({...}); // ← checkpoint written; no convergence record
}
```

So a phased feature on an orphan/standalone installation (no roadmap node) will have its `phase-<id>` checkpoint written — making the phase appear "current" to the `all-phase-checkpoints-current` gate — while the `governing → shipped` convergence record is absent. A later phase's prior-phase freshness check passes; the overall graduation gate does not open (record absent), but the state is internally inconsistent.

The override path correctly handles this by exiting non-zero when `convergenceItem === undefined`. The normal path's WARNING-and-continue is acknowledged in T041, but the comment's flat claim that the ordering is "the same as the override path" is factually wrong for this case. The comment should either be scoped ("when convergenceItem resolves") or the phase-checkpoint write should be gated on `convergenceItem !== undefined` to match the stated invariant.

---

### AUDIT-20260620-147 — "spec-governance gate" attribution label hardcoded in override-graduate.ts regardless of mode

Finding-ID: AUDIT-20260620-147
Status: migrated-to-backlog TASK-380
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/override-graduate.ts:52–54

```typescript
args.stderr(
  `spec-governance gate [${args.feature}]: OPEN by override — reason: ${args.reason}\n`,
);
```

`recordOverrideGraduation` receives `args.mode` ('spec' | 'impl') but the attribution line unconditionally says `spec-governance gate`. An `--mode implement --override` invocation emits "spec-governance gate" in its audit trail, which is misleading for an operator correlating `govern.ts` output against the convergence record. The record itself carries `mode: 'impl'` (set by the caller), so the record and the stderr attribution disagree. A one-line fix: `${args.mode === 'spec' ? 'spec' : 'impl'}-governance gate`. The existing test for impl mode only checks that "override" appears somewhere in stdout+stderr; it would not catch this mislabeling.

---

### AUDIT-20260620-148 — Graduation-safety critical path (partitionLiftableFindings, recordNoNewFindingsSection) absent from diff

Finding-ID: AUDIT-20260620-148
Status: migrated-to-backlog TASK-381
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/govern/loop-hygiene.ts (partitionLiftableFindings); src/subcommands/record-no-new-findings-section.ts (new file)

The diff's central graduation-safety claim is that a run whose findings are all cross-run deduped (all in `dedupSuppressedOpen`) must NOT render as a pristine quiet section to the dampener — persistent OPEN HIGHs must keep blocking (US3 SC-001). This invariant depends entirely on two modules that are not included in this diff:

1. `partitionLiftableFindings` in `src/govern/loop-hygiene.ts` — the function that classifies extracted findings into `liftable` / `dedupSuppressedOpen` / `resolvedSuppressed`. The diff imports it but does not show it.
2. `recordNoNewFindingsSection` in `src/subcommands/record-no-new-findings-section.ts` — the new file that handles the `liftableFindings.length === 0` branch. This is the code that must emit `Severity:` lines for re-surfaced open findings (so the dampener's `rawHighPlusCount` stays ≥ 1). If this function instead writes a quiet section (no Severity lines), the dampener clears and an all-dedup run graduates incorrectly.

Similarly, `appendSection` and `renderRereportEntries` — imported from `audit-barrage-lift-render.ts`, which is also absent — are load-bearing for the mixed-section (new findings + re-reports) path.

The end-to-end tests in `tests/promote-findings/lift-dedup.test.ts` do exercise these code paths and would catch the quiet-section failure if they run. This is not a defect claim — it is an audit surface limitation. The reviewer cannot independently verify the implementation of the graduation-safety logic from this diff alone and must rely on the test suite as the sole signal.

## 2026-06-21 — audit-barrage lift (20260621T002128759Z-029-govern-operability-phase-4)

### AUDIT-20260621-01 — `resolvePrePhaseDiffBase` priority-order logic is off-screen — the fix's core behavior is unverifiable from this diff

Finding-ID: AUDIT-20260621-01
Status: migrated-to-backlog TASK-382
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts:786–810 (call site)

The stated fix is "explicit `--diff-base` wins" over the auto-resolved `governedSha`. The call site correctly separates `explicitBase` from `fallbackBase: 'HEAD~1'` (lines ~795–810), but the function that implements the priority resolution — `resolvePrePhaseDiffBase` — is entirely absent from this diff.

In the **before** state, the explicit value was encoded as part of `fallbackBase` and presumably fell *below* `governedSha` in priority (hence the bug: the auto-resolved sha was shadowing an explicit operator flag). In the **after** state, `explicitBase` is passed as a separate field and must be consulted *before* `governedSha` for the fix to take effect. That priority logic lives exclusively in `resolvePrePhaseDiffBase`.

TypeScript would catch an undeclared property name (`explicitBase`) at the call site if the function's parameter type never included it, so the function's signature was presumably updated in a prior commit. However, TypeScript cannot catch a well-typed field that the function body reads at the wrong priority — i.e., `explicitBase` could be in the type and still be dead code or consulted only as a tertiary fallback. The entire behavioral regression being fixed (`explicit > governedSha > HEAD~1`) is implemented in off-screen code, so this audit cannot confirm the fix is complete. A reviewer reading only this diff would have to locate `resolvePrePhaseDiffBase` and verify its priority order manually.

---

### AUDIT-20260621-02 — Override-after-graduation silently clears a valid `governedSha`

Finding-ID: AUDIT-20260621-02
Status: migrated-to-backlog TASK-383
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts:482–495 (`writeResolvedPhaseCheckpoint`), ~969–984 (override call site)

When `recordGovernedSha` is `false`, `governedSha` is set to `undefined` (line ~484) and passed into `writePhaseCheckpoint`. JSON serialization silently drops `undefined` properties, so the written checkpoint carries no `governedSha` field.

The comments justify this for the case where the override "may run at an UNRELATED HEAD" — correct reasoning for a fresh override invocation. But the comments do not address the **override-after-graduation** scenario:

1. Phase N graduates normally → checkpoint written with `governedSha = sha_at_graduation`  
2. Later, operator re-runs phase N with `--override` for any reason  
3. `writePhaseCheckpoint` replaces the checkpoint file entirely (standard checkpoint semantics), erasing `sha_at_graduation`  
4. Phase N+1 calls `resolvePrePhaseDiffBase` → no `governedSha` for phase N → falls back to `HEAD~1`

If `HEAD~1` at the time phase N+1 runs happens to be inside phase N+1's own work rather than before phase N, the diff scope silently regresses. An operator who runs `--override` as a "force-accept" after a valid graduation would not expect the next phase's diff base to change. The code doesn't block this pattern, doesn't log a warning that `governedSha` is being cleared, and the existing comments do not describe the behavior.

A minimal fix is a log line on the override path noting that no `governedSha` will be recorded and downstream phases will fall back to `HEAD~1`.

---

### AUDIT-20260621-03 — `recordGovernedSha` boolean is control-coupling — caller intent leaks into callee body

Finding-ID: AUDIT-20260621-03
Status: migrated-to-backlog TASK-384
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts:466–497 (`writeResolvedPhaseCheckpoint`), 519–535 (`writePhaseCheckpointAfterRecordOrFatal`)

`recordGovernedSha: boolean` is a control flag threaded through two layers (`writePhaseCheckpointAfterRecordOrFatal` → `writeResolvedPhaseCheckpoint`) to gate a single expression: `args.recordGovernedSha ? currentHeadSha(repoRoot) : undefined`. This is classic boolean-parameter control coupling: the caller encodes a branching decision as data that the callee then switches on.

A cleaner shape would compute `governedSha` at each call site — `currentHeadSha(repoRoot)` for graduation, `undefined` for override — and pass it as `governedSha?: string` into the write function. The function then serializes whatever it receives, with no conditional branching and no hidden dependency on a caller intent flag. This removes the need for `recordGovernedSha` entirely and makes the two call sites self-documenting. With only two call sites the current shape is manageable, but it creates a maintenance trap if a third call site is added: the caller must know to set the flag correctly rather than seeing "pass a sha or omit it."

---

### AUDIT-20260621-04 — No test coverage visible in this diff for FR-020 priority-resolution or `recordGovernedSha` semantics

Finding-ID: AUDIT-20260621-04
Status: migrated-to-backlog TASK-385
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    (no test files in the diff)

The diff modifies two correctness-critical behaviors:

1. **`recordGovernedSha` toggle**: override path writes a checkpoint without `governedSha`; normal graduation writes one with `governedSha`. No test asserts either outcome.
2. **`explicitBase > governedSha > HEAD~1` priority**: the behavioral regression the commit fixes (explicit `--diff-base` was shadowed by auto-resolved sha). No test exercises the three-level priority stack.

The second case is the higher-risk gap: the priority logic lives in `resolvePrePhaseDiffBase` (off-screen), and a priority-order bug there would not surface in the call-site change visible here. A regression test that sets `--diff-base`, has a prior `governedSha` recorded, and asserts the explicit base wins would catch a priority-order defect that this diff cannot rule out. The absence of such a test means the only verification is manual.

## 2026-06-21 — audit-barrage lift (20260621T002539218Z-029-govern-operability-phase-5)

### AUDIT-20260621-05 — `readFileSync` catch in `foldReferencedOutOfWindowDeps` is silent — violates the "every inclusion/skip warned" contract

Finding-ID: AUDIT-20260621-05
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/govern/payload-implement.ts` — `foldReferencedOutOfWindowDeps`, the `readFileSync` catch block (diff line approximately +589–594 in the function body)

The JSDoc contract on `foldReferencedOutOfWindowDeps` states "every inclusion/skip warned (no silent change)." The function correctly emits a `warn` call for every other skip path: binary/empty files, budget overruns. But the `readFileSync` catch block does not call `warn` — it simply `continue`s:

```typescript
try {
  content = readFileSync(abs, 'utf8');
} catch {
  continue;          // ← no warn(); contradicts the stated contract
}
```

`statSync` has already confirmed the file exists (it ran inside `resolveRelativeSpecifier` and returned `isFile()`). A subsequent `readFileSync` failure represents a TOCTOU race (file deleted or permission-revoked between stat and read) or an unexpected I/O error. Neither case should be silent, because the consuming operator has no way to know an OOW dep was resolved and then dropped without warning. The contract says they can diagnose skips from the warn stream; this one disappears.

Blast radius: an operator diagnosing a false HIGH (the auditor flagged an import as missing) will inspect the `warn` stream, find no skip entry for the file in question, and incorrectly conclude the file was successfully folded in. The actual cause — a TOCTOU drop — is invisible. Fix is one `warn` call inside the catch before `continue`.

---

### AUDIT-20260621-06 — `CODE_ARTIFACT_FRAMING` now unconditionally asserts "this is a PER-PHASE diff" — misleading when the constant is used for whole-feature audit prompts

Finding-ID: AUDIT-20260621-06
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/payload-implement.ts` lines ~63–65 (`CODE_ARTIFACT_FRAMING` constant modification)

The diff appends a per-phase-specific note to the shared `CODE_ARTIFACT_FRAMING` constant:

> `NOTE — out-of-window scope (029 US5/FR-021): this is a PER-PHASE diff. A file the diff REFERENCES but does not itself change … is OUT OF THIS PHASE'S WINDOW … Do NOT raise a finding that such a referenced file is absent / not-imported / missing merely because its definition is not in this diff … Out-of-window deps that ARE present in the repo are folded in below under a "referenced dependency (out of phase window)" header for context only.`

`CODE_ARTIFACT_FRAMING` is an exported module-level constant — not a computed per-call value — so every consumer receives this text unconditionally. The whole-feature (`after_implement`) audit path calls `assembleImplementPayload` without `pathScope` (`hasPathScope = false`), which means: (1) no OOW deps are folded in (the `if (hasPathScope)` guard suppresses that code), and (2) the diff is a multi-phase union, not a per-phase window.

When an auditor model receives `CODE_ARTIFACT_FRAMING` for a whole-feature audit, it reads "this is a PER-PHASE diff" (false), "out-of-window deps are folded in below under a header" (false — none are), and is instructed to assume referenced files exist and are correct (the wrong posture for a whole-feature audit where a genuinely-missing implementation SHOULD surface). The note was designed to suppress false HIGHs in per-phase context; in whole-feature context it could suppress real HIGHs. This is an auditor-facing prompt that controls model behaviour — a wrong instruction at this layer has direct downstream impact on finding quality.

The fix: either (a) make the note conditional by building the framing string inside `assembleImplementPayload` based on `hasPathScope`, or (b) introduce a separate `CODE_ARTIFACT_FRAMING_PER_PHASE` constant used only on the per-phase path, keeping `CODE_ARTIFACT_FRAMING` as the generic form shared across audit modes. The test in `out-of-window.test.ts` imports and asserts on `CODE_ARTIFACT_FRAMING` directly — it would need updating to test the appropriate per-phase variant.

---

### AUDIT-20260621-07 — `resolvePrePhaseDiffBase` silently treats an unknown `phaseId` as "first phase" — configuration error is indistinguishable from legitimate fallback

Finding-ID: AUDIT-20260621-07
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/govern/incremental-audit.ts`, `resolvePrePhaseDiffBase` function (~lines 163–176 in the diff)

```typescript
const idx = args.orderedPhaseIds.indexOf(args.phaseId);
if (idx > 0) {
  for (let i = idx - 1; i >= 0; i -= 1) { … }
}
return args.fallbackBase;
```

When `args.phaseId` is absent from `args.orderedPhaseIds`, `indexOf` returns `-1`. The condition `idx > 0` is false, so the loop is skipped and `fallbackBase` is returned. This outcome is identical to the legitimate "phase 1 has no prior phases" path (`idx === 0` also skips the loop). A caller that passes a mis-typed or stale `phaseId` gets `fallbackBase` silently — no error, no warning — and the governed diff is computed from `HEAD~1` instead of the correct pre-phase anchor. The caller in `govern.ts` is guarded upstream by `assertPriorPhaseCheckpointsCurrent`, which should reject an unknown phase before this function is reached. But `resolvePrePhaseDiffBase` is exported (it's imported in the test file), and as a standalone exported function it carries no internal defense: a test or a future caller could supply mismatched inputs without being warned.

Blast radius: the misconfigured call silently falls back to `HEAD~1`, producing the TASK-263 under-scope bug that this very feature was designed to fix — the false HIGH resurfaces invisibly, with no diagnostic signal. A simple guard (`if (idx === -1) throw new Error(...)` or at minimum a `warn`) would surface the misconfiguration immediately. The `idx === 0` (first phase) path should be left alone since that is legitimate; only `idx === -1` needs the guard.

### AUDIT-20260621-08 — Stored governedSha is trusted without verifying it still resolves

Finding-ID: AUDIT-20260621-08
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/incremental-audit.ts:164-170; src/subcommands/govern.ts:800-807; src/govern/checkpoint-state.ts:430-438

The new resolver returns the first non-empty prior `governedSha` directly, and `runGovern` threads checkpoint values into that resolver without checking whether the object still exists in the current repo. The checkpoint validator only enforces “non-empty string”, not “valid reachable commit”. If a branch was rebased, history was pruned, or the checkpoint file was edited/corrupted, the auto-selected base can be an invalid git revision.

The blast radius is high because `assembleImplementPayload`’s git wrapper degrades failed git commands to an empty string, and `runGovern` explicitly treats empty diffs as plan-context-only governance. A downstream phase audit can therefore silently stop auditing the phase payload after selecting a stale stored SHA. A reasonable fix is to verify the resolved checkpoint SHA with git before using it as a diff base, and fail loud with an actionable message when a stored governed anchor is invalid.

### AUDIT-20260621-09 — Re-export dependencies are not folded as out-of-window context

Finding-ID: AUDIT-20260621-09
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/payload-implement.ts:472-473; src/govern/payload-implement.ts:564-569

The out-of-window dependency scanner only recognizes `from` imports, dynamic imports, `require(...)`, and bare imports. It does not recognize TypeScript/ESM re-export references such as `export { foo } from "./dep.js"` or `export * from "./dep.js"`, even though those are dependency references with the same false-absence risk the feature is trying to eliminate.

The blast radius is medium: projects using barrel modules or re-export based phase surfaces can still produce per-phase payloads that reference an out-of-window file without folding the present target, leaving auditors to report the same “missing/absent dependency” class this change intends to suppress. The scanner should include export-from syntax, ideally via a small parser or at least an expanded tested pattern for `export ... from "relative"`.

### AUDIT-20260621-10 — Failed reads of resolved out-of-window deps are silently dropped

Finding-ID: AUDIT-20260621-10
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/payload-implement.ts:588-592

After resolving and sizing an out-of-window dependency, the code catches `readFileSync` failures and simply continues. That contradicts the new contract in the same helper that “every inclusion/skip is warned”; it also creates a governance blind spot when a permission error or race makes a resolved dependency unreadable.

The blast radius is medium because the operator gets no warning that a referenced dependency was selected but omitted from the payload, so an audit can still see an unresolved reference with no clue that context was dropped. A reasonable fix is to emit a warning for the read failure, or fail loud if an already-resolved dependency cannot be read.

## 2026-06-21 — audit-barrage lift (20260621T003919044Z-029-govern-operability-phase-5)

### AUDIT-20260621-11 — Override-after-graduation silently clears a valid `governedSha`

Finding-ID: AUDIT-20260621-11
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/govern.ts:480-499, src/subcommands/govern.ts:978-984

The `writeResolvedPhaseCheckpoint` function computes `governedSha` conditionally based on `recordGovernedSha`:

```typescript
const governedSha = args.recordGovernedSha ? currentHeadSha(repoRoot) : undefined;
writePhaseCheckpoint(repoRoot, {
  ...
  ...(governedSha !== undefined ? { governedSha } : {}),
  ...
});
```

The override path passes `recordGovernedSha: false`, so `governedSha` is `undefined`, and the spread omits the field entirely. `writePhaseCheckpoint` takes a complete `PhaseCheckpointRecord` and writes it as a full replacement — a field absent from the object will be absent from the JSON on disk. If a phase was previously graduated normally (acquiring a `governedSha`), a subsequent `govern --override --phase N` call (e.g., to re-disposition a finding, to re-run with override after a stale checkpoint) fires the override path, replaces the checkpoint file, and silently discards the previously-recorded sha. The next phase's `resolvePrePhaseDiffBase` then walks past this phase (its status now returns `governedSha: undefined`), finds the nearest earlier ancestor, and audits against a wider-than-intended diff-base — or falls all the way back to `HEAD~1`. This narrowing/widening of the audit scope happens silently, with no warning.

The blast-radius: the per-phase union-payload guarantee (the fix for TASK-263) is silently violated for all phases governed after an override-on-graduated-phase. A fix would preserve any previously-recorded `governedSha` through an override write — either by reading the existing checkpoint before writing and carrying the field forward, or by splitting `writeResolvedPhaseCheckpoint` into a path that only sets `governedSha` once (on first graduation) and does not overwrite it thereafter.

---

### AUDIT-20260621-12 — `foldReferencedOutOfWindowDeps` silently skips on `readFileSync` failure

Finding-ID: AUDIT-20260621-12 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=low
Decision:   agreement (gate-counted low)
Surface:    src/govern/payload-implement.ts:564-569 (approximately, in the `foldReferencedOutOfWindowDeps` function body)

The function's stated invariant (from the JSDoc: "every inclusion/skip warned (no silent change)") is broken for the `readFileSync` branch:

```typescript
try {
  content = readFileSync(abs, 'utf8');
} catch {
  continue;   // no warn() call — silent skip
}
```

The `isBinaryOrEmpty` and budget-exceeded paths both call `warn(...)` before skipping. A permission-denied, mid-write race, or any other I/O failure silently drops a dep the auditor would have expected to see. The fix is a `warn(...)` call in the catch block before the `continue`, consistent with the other skip cases above it.

---

### AUDIT-20260621-13 — `recordGovernedSha` boolean is caller-intent control coupling

Finding-ID: AUDIT-20260621-13
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts:466-499 (`writeResolvedPhaseCheckpoint`)

The `recordGovernedSha: boolean` parameter encodes caller context ("am I on the override path or the graduation path?") inside the callee body. This is a textbook control-coupling anti-pattern: the callee's behaviour changes based on the caller's identity rather than on its own data. The current two call sites are correctly annotated, but a future third call site (e.g., a `--dry-run` path, a `--re-govern` path, an override-of-an-override path) must know to set this flag correctly or it silently mis-records the sha. The flag also makes the interaction between the override path and the `governedSha` field non-local — the connection between "this is an override" and "therefore do not record sha" is a runtime truth that only lives in the boolean; a reader of `writeResolvedPhaseCheckpoint` cannot derive the intent from the callee alone.

A cleaner shape: pass the sha explicitly (or `undefined`) as a typed argument — `governedSha: string | undefined` — computed at the call site. The callee then becomes a pure writer. The decision of whether to call `currentHeadSha` belongs at the call site, adjacent to the `if (isOverride)` branch where the context is explicit, not hidden inside the callee via a flag.

---

### AUDIT-20260621-14 — `resolvePrePhaseDiffBase` has no test for `phaseId` absent from `orderedPhaseIds`

Finding-ID: AUDIT-20260621-14
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/incremental-audit.ts:158-170 (`resolvePrePhaseDiffBase`), tests/govern/payload-union.test.ts

When `phaseId` is not present in `orderedPhaseIds`, `indexOf` returns `-1`. The condition `idx > 0` is `false`, so the function falls through directly to `return args.fallbackBase`. This is the correct defensive behaviour (unknown phase → safe fallback), but the path is untested. The test suite covers the first-phase case (`idx === 0`, which also satisfies `idx > 0 === false`), but not the degenerate `idx === -1` case. If `orderedPhaseIds` and `governedShaByPhase` are built from different sources (e.g., a tasks.md parse vs. a checkpoint scan), a phase-id mismatch could silently fall back without any diagnostic. A test and/or a `warn(...)` call when `idx === -1` would make the fallback visible.

## 2026-06-21 — audit-barrage lift (20260621T005644765Z-029-govern-operability-phase-4)

### AUDIT-20260621-15 — `gitRefResolves` does not check `r.error` — silent mis-classification on git-not-found

Finding-ID: AUDIT-20260621-15
Status: migrated-to-backlog TASK-386
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts:458-469 (new `gitRefResolves` function)

`spawnSync` sets `r.error` (a Node.js `Error` object) when the child process cannot be spawned at all — e.g., `git` is not on `PATH`, the OS returns `ENOENT`, or the process was killed by a signal that left `r.status === null`. The function returns `r.status === 0`, which evaluates `null === 0 → false` in these cases, so the safe-fallback direction is correct: an unresolvable-git environment causes `isResolvable` to return `false` and govern falls back to `HEAD~1` rather than crashing.

The blast-radius is therefore bounded, but the silent false-negative has a diagnostic cost: if `git` is misconfigured in a CI environment, every governed phase silently degrades to the `HEAD~1` fallback with no stderr message indicating *why*. An operator would see subtly under-scoped diffs and no error to act on. A one-liner guard (`if (r.error) throw new Error(...)` or at minimum `process.stderr.write(...)`) would surface the root cause immediately. The existing `gitRefResolves` surface area is small and self-contained, so the fix is cheap.

---

### AUDIT-20260621-16 — Stale-anchor fallback path (`isResolvable → false`) has no test coverage

Finding-ID: AUDIT-20260621-16
Status: migrated-to-backlog TASK-387
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/govern/override-short-circuit.test.ts (new test block, lines 424–476); src/subcommands/govern.ts:824-829 (`isResolvable` wiring)

AUDIT-20260621-08 introduced the `isResolvable` callback so that a recorded `governedSha` that no longer resolves in the repo (post-rebase, pruned reflog, shallow clone) degrades gracefully to `HEAD~1` instead of handing a dead SHA to `git diff`. The test added in this diff exercises the *opposite* case: the SHA is valid, the override is run, the SHA is preserved. That path passes through `isResolvable` returning **true**.

There is no test in this diff (or in the existing suite as far as the diff shows) for the case where `isResolvable` returns **false** — i.e., the SHA recorded in the checkpoint no longer resolves. The contract of `resolvePrePhaseDiffBase` when `isResolvable(ref) === false` is therefore unverified: does it fall back to `HEAD~1`? Does it throw? Does it silently use the stale ref anyway? If the callback result is accidentally ignored inside `resolvePrePhaseDiffBase`, this diff's primary safety net for AUDIT-20260621-08 would be a no-op and nothing in the test suite would catch it.

This is not a hypothetical path: any team doing interactive rebases, force-pushes, or shallow fetches between governance passes would hit it in practice. A minimal test would: (1) write a checkpoint with a `governedSha` that is fabricated / not present in the repo's object store, (2) run govern, (3) assert the diff is computed from `HEAD~1` (or whatever the declared fallback is) and govern exits cleanly.

---

### AUDIT-20260621-17 — `pathScope` as proxy for per-phase framing could silently suppress findings on a phase with an empty file scope

Finding-ID: AUDIT-20260621-17
Status: migrated-to-backlog TASK-388
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/govern.ts:362-370 (`artifact_framing` selection in `buildImplementVars`)

The framing selection is:

```typescript
artifact_framing:
  pathScope !== undefined && pathScope.length > 0
    ? CODE_ARTIFACT_FRAMING_PER_PHASE
    : CODE_ARTIFACT_FRAMING,
```

The comment explains the intent correctly: `CODE_ARTIFACT_FRAMING_PER_PHASE` includes a note telling the audit model that out-of-window dependencies are intentionally folded out, which is only true for a per-phase call with an explicit path scope. For a whole-feature call, that note would falsely suppress cross-feature missing-impl findings.

The condition is sound for the common cases. The edge it doesn't cover: a phase-granularity call where the resolved `pathScope` ends up empty (e.g., the phase's `diffScope` resolves to zero files — a phase touching only deleted files, or a brand-new phase with no committed files yet). In that case `pathScope.length === 0`, the generic framing is used, and the audit model is *not* told that out-of-window deps are intentionally folded. For a zero-file phase that genuinely has nothing to audit, this is harmless. But if the zero-scope is itself a symptom of an incorrectly resolved diff-base (the very category AUDIT-20260621-08 addresses), the generic framing would allow the model to flag missing implementations in the out-of-window area — false positives rather than false negatives.

Blast-radius is limited: the worst outcome is noisy audit findings on an empty-scope phase, not missed correctness bugs. Low severity, but worth a comment on the assumption ("pathScope non-empty iff per-phase context") or a more direct signal (e.g., an explicit `isPerPhase` flag from the call site).

---

## 2026-06-21 — audit-barrage lift (20260621T005921085Z-029-govern-operability-phase-5)

### AUDIT-20260621-18 — `gitRefResolves` returns `false` on spawn failure — git-unavailable misattributed as corrupt checkpoint

Finding-ID: AUDIT-20260621-18
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/govern.ts` — `gitRefResolves` function (lines visible in diff, after `currentHeadSha`)

When `git` is not on `PATH` (container without git, broken `PATH` in CI), `spawnSync` sets `r.error` and `r.status = null`. The function evaluates `null === 0` → `false` and returns "does not resolve." `resolvePrePhaseDiffBase` then throws: "no longer resolves to a git object (branch rebased / history pruned / corrupt checkpoint)". The operator is sent on a false recovery path — checking for rebase history — when the real issue is git unavailability. The adjacent `currentHeadSha` correctly guards with `r.status !== 0 || typeof r.stdout !== 'string'`; `gitRefResolves` should mirror that defensive shape by checking `r.error !== undefined || r.status === null` first and either returning `false` with a distinct diagnostic path, or surfacing the spawn error directly. The blast radius is a misleading diagnostic in an already-abnormal failure scenario; it doesn't corrupt data, but it burns operator time chasing the wrong cause.

---

### AUDIT-20260621-19 — In-scope-but-unchanged files are excluded from out-of-window folding — auditor still cannot see their content

Finding-ID: AUDIT-20260621-19 (claude-02 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    `src/govern/payload-implement.ts` — `foldReferencedOutOfWindowDeps`, the `inPathScope` skip at lines

```typescript
if (inDiff.has(dep)) continue;      // already in payload
if (inPathScope(dep, pathScope)) continue;  // in-window — ← this is the gap
resolved.add(dep);
```

A file `dep` that is (a) listed in `pathScope` (this phase's designated scope) AND (b) unchanged since the phase base is excluded by the `inPathScope` check. It therefore does NOT appear in the diff and is NOT folded in as an out-of-window dep. The auditor sees a `+line` importing `dep` but has no definition for it in the payload. Because `dep` is in `pathScope`, it is not covered by the "out-of-window deps are folded in below" sentence in `CODE_ARTIFACT_FRAMING_PER_PHASE`; an AI auditor might reasonably infer "if it were present in-repo and in-scope it would be in the diff, so it must be missing" — reintroducing the false HIGH the folding logic was built to eliminate.

The concrete scenario: phase 5 designates `src/feature.ts` and `src/helper.ts` in pathScope; only `feature.ts` is modified; `feature.ts` imports from `./helper.js`; `helper.ts` was committed before the phase base and is unchanged. `inPathScope('src/helper.ts', pathScope)` returns `true` → skipped. The auditor sees `feature.ts` referencing `helper.ts` but gets no context about `helper.ts`.

The fix depends on intent: (a) replace the `inPathScope` skip with `inDiff.has(dep)` only — fold in any file that exists on disk and isn't already in the diff, regardless of pathScope membership; or (b) extend `CODE_ARTIFACT_FRAMING_PER_PHASE` to explicitly state that in-scope files absent from the diff are unchanged (not missing), not just that out-of-window files are folded in. Option (b) alone is weaker because it relies on the AI auditor applying the framing correctly to a category the framing does not name.

---

### AUDIT-20260621-20 — Budget-exhaustion branch in `foldReferencedOutOfWindowDeps` has no test coverage

Finding-ID: AUDIT-20260621-20
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/govern/payload-implement.ts` — `foldReferencedOutOfWindowDeps` budget check; `tests/govern/out-of-window.test.ts`

The branch:
```typescript
if (foldedBytes + sz > budgetBytes) {
  warn(`govern: out-of-window dep ${dep} (${sz} bytes) would exceed...`);
  continue;  // NOT break — smaller later deps can still be included
}
```

The `continue` (not `break`) is a load-bearing semantic choice: alphabetically later deps that are small enough still get folded even after the budget is hit by a large dep. No test in `out-of-window.test.ts` exercises this path. A test should assert: given two deps where dep A exhausts the budget and dep B (alphabetically later, smaller) fits, dep B is included and dep A is not, and the warn is emitted for A. Without this test, the `continue` semantics are undocumented by the test suite, making a future refactor that changes it to `break` undetectable until a real audit payload silently loses small deps.

### AUDIT-20260621-21 — Per-phase govern resolves the pre-phase base, then discards it

Finding-ID: AUDIT-20260621-21
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/subcommands/govern.ts:820-832, src/subcommands/govern.ts:1082-1087, src/subcommands/govern.ts:319

The phase path correctly computes `diffBase` with `resolvePrePhaseDiffBase(...)` and passes it into `resolvePhaseUnit` at lines 820-832, but the actual payload is built later with `buildImplementVars(..., flags.diffBase, ..., payloadPathScope, ...)` at lines 1082-1087. Inside `buildImplementVars`, line 319 re-resolves the base from `diffBaseFlag ?? GOVERN_DIFF_BASE ?? 'HEAD~1'`, so an auto-resolved prior `governedSha` is not used unless the operator explicitly passed the same value as `--diff-base`.

That breaks FR-020’s core goal: a normal per-phase run without explicit `--diff-base` still audits `HEAD~1`, not the union from the pre-phase commit. The blast radius is blocking because the feature’s stated fix for TASK-263 does not actually affect the governed payload in the default path. A reasonable fix is to pass `phaseUnit.diffScope.base` into `buildImplementVars` for implement mode when a phase unit was resolved, or change `buildImplementVars` to accept the already-resolved audit unit/base rather than independently recomputing it.

## 2026-06-21 — audit-barrage lift (20260621T011659497Z-029-govern-operability-phase-5)

### AUDIT-20260621-22 — `gitRefResolves` misclassifies git-binary-absent as sha-unresolvable

Finding-ID: AUDIT-20260621-22
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/govern.ts` — `gitRefResolves` function (added in this diff)

When the git binary is not on PATH, `spawnSync` sets `r.error` (ENOENT) and `r.status` to `null`. The check `return r.status === 0` evaluates `null === 0 → false`, so the function returns `false`. `resolvePrePhaseDiffBase` then treats this as a confirmed sha-resolution failure and throws: *"which no longer resolves to a git object (branch rebased / history pruned / corrupt checkpoint)"* — a message that is factually wrong when the real failure is git unavailability.

Compare with `currentHeadSha` in the same diff, which explicitly guards `if (r.status !== 0 || typeof r.stdout !== 'string') return undefined;` — `null !== 0` is `true`, so it handles the git-absent case gracefully. `gitRefResolves` has no parallel check for `r.error` or `r.status !== null`. An operator on a machine without git (CI image, restricted environment) would receive a "branch rebased / corrupt checkpoint" error directing them to investigate phantom history problems, rather than a clear "git not available" signal.

The fix is minimal: `if (r.error !== undefined || r.status === null) return false;` with a stderr warning, or—better—throw a distinct error distinguishing the two failure modes (git-not-found vs. sha-not-found), so the operator gets an actionable message. Note: this finding was filed previously as AUDIT-20260621-15 (visible as untracked `task-386` in the working tree); the current diff does not address it.

---

### AUDIT-20260621-23 — `orderedPhaseIds` ordering assumption is not asserted at the `resolvePrePhaseDiffBase` call site

Finding-ID: AUDIT-20260621-23
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/govern.ts` lines ~830–845 (the `resolvePrePhaseDiffBase` call)

`resolvePrePhaseDiffBase` requires `orderedPhaseIds` to be in `tasks.md` parse order for its "latest prior phase" semantics to be correct: it iterates backward from `idx - 1` and returns the first non-empty `governedSha` it finds. In `govern.ts`, the argument is sourced from `phaseCheckpointStatuses.map((status) => status.phaseId)`. If `resolvePhaseCheckpointStatuses` (not in this diff) returns statuses in any order other than `tasks.md` order — filesystem order of checkpoint JSON files, lexicographic sort of `phaseId` strings, etc. — the wrong `governedSha` would be selected as the diff-base, silently under-scoping or over-scoping the audit payload. Phase IDs that are multi-part strings or numbers > 9 are especially vulnerable to string-sort vs. numeric-sort divergence.

The call site has no assertion that the returned array is in `tasks.md` order. The function's JSDoc says "parsePhases order" but that contract is only enforceable if `resolvePhaseCheckpointStatuses` is verified to return in that order. There is no test that exercises the production `govern.ts` call path with a multi-phase fixture to confirm the ordering. Confirmed as previously filed AUDIT-20260621-01 (untracked `task-382`); not addressed in this diff.

---

### AUDIT-20260621-24 — `foldReferencedOutOfWindowDeps` budget selection is alphabetical, not priority-based

Finding-ID: AUDIT-20260621-24
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/govern/payload-implement.ts` — `foldReferencedOutOfWindowDeps`, budget-skip loop (~line 590–610 of added code)

When a resolved dep exceeds the remaining fold budget, the code skips it and continues: `"skipping it but continuing with smaller deps (not silently)"`. The iteration is over `Array.from(resolved).sort()` — strict alphabetical order. This means a large, semantically load-bearing dep (e.g., `a-contract.ts`) may be skipped while a small, peripheral dep (e.g., `z-utils.ts`) is included. In the exact scenario this feature is solving — where an auditor raises a false HIGH because it cannot see the definition of a referenced file — the referenced file is by definition the high-priority dep. If that file is large and appears early alphabetically, it may be the first to be skipped when the budget is tight.

The warn message accurately documents the skip behavior, and the framing instruction says the fold is best-effort, so the operator is not misled. However, the operator has no mechanism to influence inclusion priority short of using `--diff-base` to bypass the whole mechanism. A priority-based selection (e.g., prefer deps referenced by more import sites, or prefer deps referenced in added lines over context lines) would be more resilient, but is a design enhancement beyond a bug fix.

---

### AUDIT-20260621-25 — Second-order out-of-window deps are not folded; no test pins this boundary

Finding-ID: AUDIT-20260621-25 (claude-04 + codex-02; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    `src/govern/payload-implement.ts` — `foldReferencedOutOfWindowDeps`; `tests/govern/out-of-window.test.ts`

When a dep is folded as out-of-window context, its own imports are not scanned. A second-order dep — a file imported by the folded dep, itself outside the phase window — is not included in the payload. An LLM auditor examining the folded dep's content might flag those second-order imports as missing implementations. The framing instruction (`CODE_ARTIFACT_FRAMING_PER_PHASE`) says "assume it exists and is correct unless the diff itself shows a genuinely-missing implementation," which is intended to cover this case, but that instruction is framed around the *phase diff*, not around the *folded context blocks*. An auditor reading a folded dep's code that references an unshown file has less contextual guidance that this is also not-missing.

The test suite in `out-of-window.test.ts` covers: (a) a present dep is folded, (b) a re-export dep is folded, (c) a genuinely-missing dep is not fabricated. None of these tests assert the second-order case — that a dep-of-dep is neither folded nor fabricated. The omission is by design (unbounded recursive folding would explode the payload), but without a pinning test the boundary could silently regress if the fold logic is later extended. A test asserting that `dep → sub-dep` where `sub-dep` is out-of-window does NOT appear in the fold would make the design contract explicit.

### AUDIT-20260621-26 — Legacy intermediate checkpoints can make the next phase diff start too early

Finding-ID: AUDIT-20260621-26
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/incremental-audit.ts:183-198

`resolvePrePhaseDiffBase` walks backward until it finds any prior `governedSha`, skipping prior phases that are current but legacy/no-sha. If phase 5 follows a current phase 4 checkpoint with no `governedSha`, but phase 3 has one, this returns the phase 3 commit as phase 5's base. That is not the pre-phase commit for phase 5; it predates phase 4.

The blast radius is upgraded features with mixed checkpoint formats, especially where phases share files. The resulting per-phase payload can include already-governed phase 4 hunks in a phase 5 audit, contradicting the new per-phase framing that says the diff shows only files this phase changed. A reasonable fix is to treat a sha-less intervening current phase as an unresolved boundary and require an explicit `--diff-base`, rather than skipping past it to an older anchor.

## 2026-06-21 — audit-barrage lift (20260621T015655993Z-029-govern-operability-phase-6)

Code-sha: 52e8ff6d5c8b9fdeb656e410a8bf01aeaccf863c
### AUDIT-20260621-27 — `shipped` phase `derive: record-converged impl` may not recognise the opt-in whole-feature graduation path

Finding-ID: AUDIT-20260621-27 (claude-01 + codex-01; cross-model)
Status: migrated-to-backlog TASK-390
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    templates/WORKFLOW.md:95-100 + src/workflow/gate-eval.ts:174-184

The `graduate-impl` criterion now admits two graduation paths: (A) all per-phase checkpoints current, or (B) `ctx.implRecordConverged` (the whole-feature record). The change correctly updates the `governing` exit, the `shipped` entrance, and the `transition:graduate` exit-gate from `all-phase-checkpoints-current impl` to `graduate-impl impl`. However, the `shipped` phase's `derive: record-converged impl` is **unchanged**.

The workflow-types.ts comment states: "the composed `record-converged impl` signal is **derived from** [all-phase-checkpoints-current]." If the `record-converged impl` criterion evaluates per-phase checkpoint composition (i.e. calls `composeConvergedImpl` directly), then a feature that graduated via opt-in path B (whole-feature record, no per-phase checkpoints) would satisfy `graduate-impl impl` (entering `shipped`), but the `shipped` phase's `derive: record-converged impl` would evaluate to false — the feature entered `shipped` yet its derive criterion is unmet. Depending on how the compass engine uses the derive field, this could silently strand the feature's displayed state.

The `record-converged impl` evaluator is out-of-window, so this finding is conditional: if that criterion maps to `ctx.implRecordConverged` (which path B sets to true), there is no issue. If it calls `composeConvergedImpl` independently, the `shipped` phase becomes inconsistent for opt-in users. The diff does not update `derive: record-converged impl` in the `shipped` phase and does not add a note explaining why no update is needed — that gap should either be closed (update the derive to `graduate-impl impl`) or annotated (explain why `record-converged impl` already covers both paths).

---

### AUDIT-20260621-28 — research.md amendment conflates the `record-converged impl` criterion with `ctx.implRecordConverged`

Finding-ID: AUDIT-20260621-28
Status: migrated-to-backlog TASK-391
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/025-unskippable-workflow-protocol/research.md (new lines 27–38)

The amendment reads: "the graduate gate is now `graduate-impl impl` = `all-phase-checkpoints-current` **OR** a converged whole-feature `record-converged impl`." The backtick-formatted `record-converged impl` looks like a reference to the criterion of that name. However in gate-eval.ts the OR branch is `ctx.implRecordConverged` — a pre-computed GateContext field — not the `record-converged impl` criterion.

The distinction matters for a spec-reading agent. If an agent implements `graduate-impl` by ORing `all-phase-checkpoints-current` with the criterion `record-converged impl`, the opt-in escape would be semantically vacuous: `record-converged impl` (which the comment says derives from per-phase composition) would only be true when `all-phase-checkpoints-current` is also true, making the OR reduce to `all-phase-checkpoints-current` alone and silently breaking the whole-feature escape path.

A minimal fix: replace `` `record-converged impl` `` in the amendment text with `ctx.implRecordConverged` (the field, not the criterion), or add a parenthetical: "*(the `implRecordConverged` GateContext field, not the `record-converged impl` criterion — the field is true when a whole-feature convergence record exists)*."

---

### AUDIT-20260621-29 — Test suite does not cover `specDirPath = null` + `implRecordConverged = true`

Finding-ID: AUDIT-20260621-29
Status: migrated-to-backlog TASK-392
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/workflow/either-of-gate.test.ts:42-51

The `ctxFor` helper always supplies a non-null `specDirPath` (line 46: `specDirPath: join(f.root, f.specDirRel)`). The `allPhaseCheckpointsCurrent` function returns `false` when `ctx.specDirPath === null`, so for `graduate-impl` the evaluation is `false || ctx.implRecordConverged`. With `implRecordConverged = true` and a null spec dir, the gate graduates the feature — a feature with no spec dir at all can graduate via the whole-feature opt-in path.

Whether this is intended is not documented. If it is intended (the whole-feature path does not require a tasks.md), a test should assert the behavior explicitly and the feature spec should acknowledge it. If it is not intended (graduation should require a spec dir regardless of path), `allPhaseCheckpointsCurrent` returning `false` is not sufficient — the `graduate-impl` case must also guard on `ctx.specDirPath !== null` before checking `ctx.implRecordConverged`.

No code change is required if the behaviour is intentional, but an explicit test documents the intent and guards against a future "fix" that inadvertently breaks this case.

---

### AUDIT-20260621-30 — Test suite does not cover the "both conditions true simultaneously" case

Finding-ID: AUDIT-20260621-30
Status: migrated-to-backlog TASK-393
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/workflow/either-of-gate.test.ts (entire file)

The four test cases cover: default-only true, opt-in-only true, neither true, partial-default-without-opt-in. The combination "all per-phase checkpoints current AND `implRecordConverged = true`" (both arms of the OR satisfied simultaneously) has no explicit test. While `A || B` with both true is trivially correct, this is the realistic state after an operator runs per-phase govern AND then also runs a whole-feature govern (e.g. to verify before shipping). An explicit test would document the expected behaviour (gate still passes) and ensure that no future change to `graduate-impl` accidentally introduces an unexpected `A && B` or `XOR` semantic.

## 2026-06-21 — audit-barrage lift (20260621T020306457Z-029-govern-operability-phase-6)

Code-sha: ce7c1db6924f710490325d7412276c28f4dea105
### AUDIT-20260621-31 — Missing test for the canonical path-B use case: stale per-phase checkpoints + converged whole-feature record

Finding-ID: AUDIT-20260621-31 (claude-01 + codex-01; cross-model)
Status: migrated-to-backlog TASK-394
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    tests/workflow/either-of-gate.test.ts:57-64

The test "graduates via the OPT-IN whole-feature record path (no per-phase checkpoints)" exercises path B with `implRecordConverged = true` and zero checkpoints written — `allPhaseCheckpointsCurrent` returns false because `composeConvergedImpl` finds nothing to compare. That's a valid test, but it's not the motivating use case for the opt-in path. The documented motivation for path B is the **O(n²)-painful shared-file feature** where per-phase checkpoints were written, then source files were edited, leaving the checkpoints stale. In that scenario `allPhaseCheckpointsCurrent` still returns false (staleness detection fires), and path B's `ctx.implRecordConverged` should graduate the feature. This is the scenario `editPhaseFile` in `unskippable-fixtures.ts` was built for — it's never called in this test file. A reasonable fix: add a test that calls `f.checkpointPhase('1/2/3')`, then `f.editPhaseFile(path, newContent)` to induce staleness, and asserts that `evaluateCriterion(GRADUATE, ctxFor(f, true)) === true` (path B rescues the stale state). Without this, the central user story for the either-of gate remains undemonstrated in the test suite.

---

### AUDIT-20260621-32 — `graduate-impl` invalid-target error path is untested

Finding-ID: AUDIT-20260621-32
Status: migrated-to-backlog TASK-395
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/workflow/gate-eval.ts:176-178 / tests/workflow/either-of-gate.test.ts

The `graduate-impl` case validates its target and throws:
```typescript
if (c.target !== 'impl') {
  throw new WorkflowError(`criterion 'graduate-impl' has unknown target '${c.target}' (expected impl)`);
}
```
The analogous throw in `all-phase-checkpoints-current` is likely also untested (out of this diff's window), so this is a consistent gap rather than a novel regression. Still, the new criterion's error path is unexercised. A one-line test — `expect(() => evaluateCriterion({ kind: 'graduate-impl', target: 'spec' as any }, ctx)).toThrow(WorkflowError)` — would close it. Low blast-radius since the validated field comes from the workflow template, which already hardcodes `impl` as the only target; the error path fires only on a hand-edited workflow file.

---

### AUDIT-20260621-33 — Existing instantiated workflow files won't automatically benefit from the either-of gate

Finding-ID: AUDIT-20260621-33
Status: migrated-to-backlog TASK-396
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    templates/WORKFLOW.md:89,98,143 (template); any instantiated WORKFLOW.md in the repo

The template is updated from `all-phase-checkpoints-current impl` → `graduate-impl impl` in three positions (phase:governing exit, phase:shipped entrance, transition:graduate exit-gate). This is correct for new features. Existing features whose WORKFLOW.md was instantiated from the old template still carry `all-phase-checkpoints-current impl`. They continue to work — the old criterion is still valid — but they cannot use the opt-in path B (a converged whole-feature record) without manual edits. There is no doctor rule, migration utility, or guidance note explaining this. Operators who want to use path B on an in-flight feature must discover and apply the change themselves. Blast-radius: no feature silently breaks; the gap is exclusively that opt-in functionality is inaccessible without operator awareness. A doc note in `specs/029-govern-operability/` or a targeted doctor rule checking for `all-phase-checkpoints-current impl` in the graduate position would close the discoverability gap.

## 2026-06-21 — audit-barrage lift (20260621T020821857Z-029-govern-operability-phase-7)

Code-sha: 00a64d2e6d1ae6aa5d7259ecd778d227001f5d02
### AUDIT-20260621-34 — SHA-format gap: `governedSha` is validated only as a non-empty string, not as a plausible git ref

Finding-ID: AUDIT-20260621-34
Status: migrated-to-backlog TASK-397
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/checkpoint-state.ts:427–437

The validation added in `validateCheckpointRecord` checks that `governedSha` is a non-empty string when present, but accepts any non-empty string:

```typescript
if (typeof parsed.governedSha !== 'string' || parsed.governedSha.length === 0) {
  throw new Error(`…governedSha must be a non-empty string when present`);
}
```

A checkpoint file with a plausible-looking but invalid value — `"not-a-sha"`, `"abc"` (too short), a whitespace-only string containing invisible characters — passes this gate cleanly. The error surface then shifts downstream to wherever `governedSha` is fed to `git diff` or `git rev-parse`, where the error message will be a raw git exit-code rather than a clear checkpoint-parse diagnostic.

The code already applies the "fail loud" principle at the empty-string case; adding a basic hex-and-length check (e.g. `/^[0-9a-f]{7,40}$/i`) gives the same loud failure at parse time. Blast-radius reasoning: this is a checkpoint file written by the tooling itself, so a malformed SHA in the wild is unlikely — but an operator who hand-edits or cherry-picks a checkpoint across repos would hit a cryptic downstream error. Severity is low because the failure is ultimately surfaced (just at the wrong layer) and the common case is unaffected.

---

### AUDIT-20260621-35 — Test coverage for new `governedSha` code paths not visible in diff

Finding-ID: AUDIT-20260621-35
Status: migrated-to-backlog TASK-398
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/govern/checkpoint-state.ts (validation throw-path, ~line 433); src/govern/phase-checkpoint-status.ts (propagation paths, lines ~93 and ~102)

The diff adds three new code branches that should have corresponding test cases:

1. `validateCheckpointRecord`: the throw path when `governedSha` is present but not a non-empty string (the new `if`-branch at ~line 433).
2. `resolvePhaseCheckpointStatuses`: the 'missing' path now explicitly sets `governedSha: undefined` (line ~93).
3. `resolvePhaseCheckpointStatuses`: the record path propagates `record.governedSha` (line ~102), covering both the `undefined` (pre-US5 record) and `string` (US5+ record) cases.

Commit `ce7c1db6` is titled "address phase-6 govern findings (AUDIT-20260621-27..30: record-converged criterion vs field clarity + **test gaps**)" — it explicitly claims to close test gaps. Yet neither a test file for `checkpoint-state` nor for `phase-checkpoint-status` appears in this diff. Per the phase-window instructions, those test additions may live in an earlier commit in the range or in an out-of-window file. This is flagged as informational: confirm that the test suites for these two modules exercise the new `governedSha` paths (valid present, invalid-throws, undefined-from-missing-record, and string-from-US5-record). If they do not, the throw path in `validateCheckpointRecord` is the highest-priority gap — an untested error branch is a common source of silent regressions.

## 2026-06-21 — audit-barrage lift (20260621T021357125Z-029-govern-operability-phase-8)

Code-sha: c3f0eef5a527c7f85e91431abd77d09de8ce15aa
### AUDIT-20260621-36 — Round-0 self-red-team driver in audit prompt uses executor-perspective phrasing mismatched to the reviewer audience

Finding-ID: AUDIT-20260621-36
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    templates/audit-barrage-prompt.md (diff +44)

The **round-0 self-red-team** driver in the audit prompt reads: *"Before re-firing after a fix, do a self-red-team pass over the fix diff itself."* The phrase "before re-firing" presupposes the reader controls when the barrage re-fires — but the reviewer (the audit model reading this prompt) does not re-fire anything. The reviewer emits findings and exits; the executor re-fires. The verb "re-firing" belongs to the executor's perspective (correctly stated in `skills/execute/SKILL.md`: *"Before re-firing the barrage, do a self-red-team pass over your fix diff itself"* — where the executor is the subject).

Blast-radius: this document is read by AI agents operating as audit reviewers. The phrase "before re-firing" is an imperative directed at a reviewer who has no re-fire action to take. An agent reviewer might (a) interpret "re-firing" as "before I produce findings that would trigger another round" — and correctly apply the spirit of the check, or (b) become confused about what action is being requested. In a spec designed to drive unattended agent behavior, the more natural reading the agent reaches first should be the intended one. Here, the natural reading requires the reviewer to infer a reframe. A clearer phrasing would drop "before re-firing": *"When reviewing a fix, do a self-red-team pass over the fix diff itself: what new edge did this fix open? what did it move rather than remove? Treat the fix as a fresh surface under audit."*

The execute skill version is correctly scoped to the executor and requires no such inference.

---

### AUDIT-20260621-37 — Test file is located under `tests/skills/` but its scope covers both skills and templates surfaces

Finding-ID: AUDIT-20260621-37
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/skills/process-drivers.test.ts:1–44

The file lives at `tests/skills/process-drivers.test.ts` and is named as though it covers skills. Its first `describe` block is labelled "process drivers in the barrage prompt template" and reads `templates/audit-barrage-prompt.md` — a `templates/` surface, not a `skills/` surface. A developer navigating to `tests/skills/` to find tests for `templates/` would not look there. The `tests/skills/` prefix also means a future `tests/templates/` directory would not include this coverage, silently leaving the template surface less discoverable.

Blast-radius: cosmetic, but test-location drift makes coverage gaps harder to notice. A developer auditing the `templates/` surface for test coverage would scan `tests/templates/` (or root-level tests) and might miss this file. Suggestion: move to `tests/process-drivers.test.ts` (or add a corresponding entry to `tests/templates/`) so the scope matches the path.

---

### AUDIT-20260621-38 — Presence-only test assertions pass if a driver is moved to a non-operative section

Finding-ID: AUDIT-20260621-38 (claude-03 + codex-01; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    tests/skills/process-drivers.test.ts:28–44

Each test in `process-drivers.test.ts` asserts that a regex matches somewhere in the lowercased full text of the target file. If a driver were relocated to a commented-out block, a deactivated heading, an HTML comment, or a section that renders as a code block (and therefore does not participate in instruction rendering), the test would still pass. For example, if `channel-enumeration` were moved inside a fenced code block in the audit template, the regex `/channel[\s-]enumeration/` would still match — but the instruction would no longer be operative.

Blast-radius: low. The tests are declared as "presence assertions" in their header comment (line 1), so this is a conscious design choice. The risk materializes only if a driver is accidentally moved somewhere non-operative — which is unlikely in practice. Worth noting for completeness: a location-sensitive assertion (e.g., verifying the keyword appears outside a code fence, or under a specific heading) would be a stronger contract, though it would also be more brittle. The current tradeoff is reasonable given the stated purpose.

---

### AUDIT-20260621-39 — `multiline / composition` sub-channel in channel-enumeration driver is underspecified relative to peers

Finding-ID: AUDIT-20260621-39
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    templates/audit-barrage-prompt.md (diff +37); skills/execute/SKILL.md (diff +93)

Both documents list three sub-channels under the **channel-enumeration** driver: **value** ("other inputs now accepted"), **state** ("new reachable states"), and **multiline / composition** ("how it composes with adjacent surfaces"). The first two sub-channels have concrete, unambiguous definitions. The third — "how it composes with adjacent surfaces" — is considerably vaguer. An agent applying this driver would have clear guidance for the value and state channels (specific things to enumerate), but no concrete cue for what "adjacent surfaces" means in the governance context, or what an opened composition channel looks like.

Blast-radius: informational. An agent would likely omit composition-channel checks or interpret them narrowly (e.g., only considering the parser's caller). In practice, the omission is bounded because the other two channels and the self-red-team driver together cover most surface growth. A concrete example (e.g., "what happens when this parser branch is applied to a multiline block, or inside a fence, or inside a list item") would make the third channel as actionable as the first two.

## 2026-06-21 — audit-barrage lift (20260621T021753230Z-029-govern-operability-phase-8)

Code-sha: 11e61c30a429743062230b4052538dd6a9c9ac5a
### AUDIT-20260621-40 — Test describe label names wrong skill file

Finding-ID: AUDIT-20260621-40
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/skills/process-drivers.test.ts:39

The second `describe` block (line 39) reads `'US8 FR-029 — process drivers in the implement/govern skill body'`, but the constant it exercises is `EXECUTE`, populated from `skills/execute/SKILL.md`. There is no `skills/implement/SKILL.md` or `skills/govern/SKILL.md` in the plugin. When this block's tests fail — say, because a driver heading is accidentally removed from the execute skill — a maintainer reading the Vitest output will see "implement/govern skill body" and may scan for a non-existent file before discovering the mismatch. The label should read `'… in the execute skill body (skills/execute/SKILL.md)'` to match the actual surface being asserted. Blast-radius: misleading failure messages that slow debugging. Semantically the execute skill IS the implement/govern entry-point in stack-control, so there is no behavioral defect, but the divergence between description and reality is a maintenance smell that compounds as the test suite grows.

---

### AUDIT-20260621-41 — Channel-enumeration driver wording diverges between the two canonical surfaces

Finding-ID: AUDIT-20260621-41
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    skills/execute/SKILL.md (new lines) vs templates/audit-barrage-prompt.md (new lines)

The channel-enumeration driver's parenthetical reads differently in the two files. The template version (`audit-barrage-prompt.md`) writes "a new flag, a new accepted value, a new parser branch, a new fold path" — the article "a new" qualifies each item explicitly. The execute skill version writes "a new flag, accepted value, parser branch, fold path" — "a new" qualifies only "flag", leaving the remaining items without a qualifier. In context the intended meaning is clear, but the execute skill phrasing is technically ambiguous: "accepted value" could be read as modification of an existing accepted value rather than addition of a new one. Both files are canonical sources for the same driver; divergence between them is a maintenance smell. A future editor updating one surface may not update the other, and the slight ambiguity in the skill version may seed a subtly wrong reading in an automated downstream consumer. A one-word fix (add "a new" before each item in the skill version) would align both surfaces.

---

### AUDIT-20260621-42 — Test comment over-promises: driver CONTENT is not verified, only driver HEADING presence

Finding-ID: AUDIT-20260621-42
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    tests/skills/process-drivers.test.ts:1-13, 23-28

The comment block at lines 1–13 describes what each driver is supposed to enforce ("a surface-adding fix enumerates the value / state / multiline / composition channels it opens (with fixtures) before re-firing," etc.). The actual test assertions at lines 23–28 use coarse regex patterns that match only the driver's heading token: `/channel[\s-]enumeration/`, `/invariant[\s-]first/`, etc. A future edit that retained each heading keyword while deleting or replacing the behavioral guidance under it would pass the test suite without surfacing the loss. The test is documented as a "presence assertion" regression guard, which is an honest statement of scope, but the comment's per-driver descriptions create an expectation of content-correctness that the assertions do not fulfill. No behavioral defect today; the risk is that the test is read as a completeness guarantee when it is only an existence check. If the intent is purely presence-guarding, trimming the comment to match ("presence of driver headings") would make the contract honest without requiring fuller assertions.

### AUDIT-20260621-43 — New test uses CommonJS `__dirname` in an ESM package

Finding-ID: AUDIT-20260621-43
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/skills/process-drivers.test.ts:18

The new test computes `PLUGIN_ROOT` with bare `__dirname`, but this package is ESM (`package.json` has `"type": "module"`), and the existing test code that needs this value derives it from `fileURLToPath(import.meta.url)`. In an ESM Vitest run, bare `__dirname` is not defined, so this test file can fail before it ever asserts the FR-029 contract.

Blast radius is high because downstream CI or an unattended agent running the suite will hit a test-runtime failure introduced by this phase, not a mere assertion failure about the intended behavior. A reasonable fix is to mirror the existing repo pattern: import `dirname` and `fileURLToPath`, define `__filename = fileURLToPath(import.meta.url)`, then derive `__dirname = dirname(__filename)` before building `PLUGIN_ROOT`.

## 2026-06-21 — audit-barrage lift (20260621T022238079Z-029-govern-operability-phase-8)

Code-sha: b313ec91eeec25e605ff13fa714181d159c30790
### AUDIT-20260621-44 — Severity-rubric driver in execute skill references US3 rubric by citation only — text is inaccessible to an unattended executor

Finding-ID: AUDIT-20260621-44
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    skills/execute/SKILL.md (new lines in the "Process drivers" section, `severity-rubric anchoring` bullet)

The `severity-rubric anchoring` driver in the execute skill reads: *"Triage findings by the blast-radius rubric (US3), not by alarm — a quietly-plausible wrong reading an unattended agent would build outranks an obvious contradiction a reader would resolve."*

The reference `(US3)` is a citation to a spec user story, not a link and not inline text. The actual rubric (`blocking / high / medium / low / informational` with blast-radius definitions) lives in the barrage prompt template's **Output format** section — a different file entirely. An executor working inside the govern-fix-refire loop reads the execute skill, triages a list of findings, and is told to apply the blast-radius rubric — but the rubric text is absent from the only document they are following. An unattended agent executing this skill has no path to the rubric text short of separately opening `templates/audit-barrage-prompt.md`.

Blast-radius reasoning: an executor who misapplies severity (treating every finding as `high` because it feels alarming, or deprioritising a `blocking` finding that reads as cosmetic) will misroute the fix effort. The driver exists specifically to prevent that failure mode — its own inaccessibility partly defeats its purpose for the executor audience. The barrage prompt version is correct (it has the rubric inline directly below), but the execute skill version is structurally incomplete for its audience.

Reasonable fix: inline a condensed version of the rubric under the `severity-rubric anchoring` bullet in the execute skill (e.g. a one-line summary table mirroring the prompt's rubric), or cross-link to the precise anchor in `audit-barrage-prompt.md` where the rubric text lives.

---

### AUDIT-20260621-45 — Test describe label names the wrong file — "implement/govern skill body" does not correspond to execute/SKILL.md

Finding-ID: AUDIT-20260621-45
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/skills/process-drivers.test.ts:43

Line 43: `describe('US8 FR-029 — process drivers in the implement/govern skill body', () => {`

The describe block's label says **"implement/govern skill body"** but the test reads `skills/execute/SKILL.md` (line 21). The execute skill _is_ the implement/govern orchestrator in this plugin, but that mapping is not obvious from the label alone. A developer reading a failure message from this describe block would look for a file named `implement` or `govern` and find neither. The label in the corresponding `it` strings compounds this: *"the execute skill body carries the …"* — naming `execute`, not `implement/govern` — making the mismatch visible at two levels of the same suite.

Blast-radius: no runtime defect; the test passes and fails correctly on the right file. The harm is navigational: a contributor triaging a red test wastes a lookup cycle reconciling the label against the actual file path. Low severity.

Reasonable fix: change the describe label to `'US8 FR-029 — process drivers in skills/execute/SKILL.md'` for unambiguous traceability.

---

### AUDIT-20260621-46 — Presence-only test contract cannot catch audience-framing regression

Finding-ID: AUDIT-20260621-46
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/skills/process-drivers.test.ts:24-44

The test comment on line 5 explicitly acknowledges this is a "Presence assertion: a future edit that drops a driver fails here." That acknowledgement is correct but incomplete — the contract has a second gap the comment does not name: **both files are asserted with the same regex set**, so a future edit that copies the executor-phrased text verbatim into the barrage prompt (or vice versa) passes the suite even though the audience framing would be wrong.

The barrage prompt's self-red-team driver is phrased for a *reviewer* audience ("When the work under audit is itself a FIX…, audit the fix diff as a fresh surface in its own right") while the execute skill's version is phrased for an *executor* audience ("Before re-firing the barrage, do a self-red-team pass over your fix diff itself"). Commit 11e61c30 was a targeted fix specifically to correct this framing difference. The tests provide no gate against that fix regressing: if the barrage prompt's driver text reverted to the executor phrasing, every test in the suite would still be green.

Blast-radius: the audience-framing distinction matters — an unattended auditor reading executor-framed instructions and an unattended executor reading reviewer-framed instructions could both misapply the driver. The harm is bounded by the fact that the two framings are functionally similar, but the framing precision was specifically the point of the 11e61c30 fix.

Reasonable fix: add a lightweight assertion that the two files differ on the self-red-team driver text — for example, verify that the barrage prompt contains a reviewer-audience anchor phrase (`"when the work under audit is itself a fix"` or similar) that is absent from the execute skill, and vice versa for the executor-audience phrase.

---

### AUDIT-20260621-47 — Channel-enumeration driver lists three channels by name but neither document states the list is exhaustive or extensible

Finding-ID: AUDIT-20260621-47
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    templates/audit-barrage-prompt.md (channel-enumeration bullet); skills/execute/SKILL.md (channel-enumeration bullet)

Both documents enumerate **value**, **state**, and **multiline / composition** as the channels to check when a fix adds to an allowlist or surface. Neither document states whether this is an exhaustive enumeration or an illustrative set. An unattended agent applying the channel-enumeration driver will stop after checking these three — it has no signal that other channels (e.g. a **concurrency** channel for a fix that adds a new async path, or a **error-path** channel for a fix that adds a new branch with a distinct failure mode) should also be considered.

Blast-radius: informational — the three named channels cover the most common fix-induced surface growth patterns, and the text's phrasing ("a new flag, a new accepted value, a new parser branch, a new fold path") implies the list of *examples* is open. But the channel names themselves read as closed. An agent that treats the three as exhaustive will under-check a fix that opens a fourth.

No immediate action required; the finding is surfaced for the operator to decide whether adding "and any other channels the fix opens" is worth the prose burden.

## 2026-06-21 — audit-barrage lift (20260621T022626789Z-029-govern-operability-phase-8)

Code-sha: b313ec91eeec25e605ff13fa714181d159c30790
### AUDIT-20260621-48 — Barrage prompt section heading scopes all five drivers to fix-reviews only, but three drivers are general quality controls

Finding-ID: AUDIT-20260621-48
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    templates/audit-barrage-prompt.md:35 (section heading)

The section added to `audit-barrage-prompt.md` carries the heading **"apply these when reviewing a fix"**. However, only two of the five drivers are fix-specific: channel-enumeration (#1, which explicitly addresses a surface-adding fix) and round-0 self-red-team (#3, whose body says "when the work under audit is itself a FIX"). The other three — **invariant-first boundary** (#2), **fleet-degradation pricing** (#4), and **severity-rubric anchoring** (#5) — are unconditional audit quality controls that apply to every round regardless of whether the subject is a fix or original work.

The blast-radius reasoning: the prompt explicitly invokes the unattended-agent scenario in its own severity rubric ("a quietly-plausible wrong reading an unattended agent would build outranks an obvious contradiction a reader would resolve"). An agent that reads the section heading as a scope gate and skips all five drivers when reviewing original feature work would (a) mis-rate findings by alarm rather than blast-radius (missing severity-rubric anchoring) and (b) over-claim convergence on degraded fleet runs (missing fleet-degradation pricing). These are exactly the systematic quality failures the drivers exist to prevent, and the heading creates a natural conditional that leads an unattended reader to the wrong path. The corresponding heading in `skills/execute/SKILL.md` is correctly scoped — "apply when fixing a govern finding before re-firing" — making the prompt heading the asymmetric entry.

A fix would restructure the section into a fixed preamble for universal drivers (invariant-first boundary, fleet-degradation pricing, severity-rubric anchoring) and a conditional note for fix-specific ones, or simply change the heading to remove the conditional framing (e.g., "apply these on every audit round; the fix-specific drivers are called out below").

---

### AUDIT-20260621-49 — Test describe label says "implement/govern skill body" but checks `skills/execute/SKILL.md`

Finding-ID: AUDIT-20260621-49
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/skills/process-drivers.test.ts:42-48

The second `describe` block at line 42 is labelled `'US8 FR-029 — process drivers in the implement/govern skill body'` but the file it reads is `skills/execute/SKILL.md` (line 22, bound to the variable `EXECUTE`). The execute skill IS the implement/govern surface in stack-control's vocabulary, so the test exercises the correct file. The blast-radius is cosmetic: a future contributor scanning test output for a failure in "the implement/govern skill body" would need to look up which file that maps to, rather than having the path named directly. The fix is a one-word label change in the `describe` string to name the actual file path (`skills/execute/SKILL.md`) or to rename the binding variable from `EXECUTE` to `EXECUTE_SKILL` and update the label to match, whichever the project's test-labelling convention prefers.

---

### AUDIT-20260621-50 — Process-driver presence tests are purely syntactic — section displacement would pass undetected

Finding-ID: AUDIT-20260621-50
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    tests/skills/process-drivers.test.ts:28-48

The test suite checks that each driver's keyword regex matches somewhere in the lowercased file content. This is correct for the stated goal (ensuring a future edit that drops a driver fails). However, the assertions do not verify that all five drivers are co-located in a single section, that the section carries an appropriate heading, or that the section appears at the expected position relative to `{{audit_lens}}` in the prompt template. A future edit that moves the drivers into a comment block, a non-rendered section, or disperses them across unrelated headings would still pass every test in this file. This is not a defect in the tests as written — presence assertions for prose content in markdown files are common and appropriate — but it is worth noting as a coverage gap if the "co-located process drivers section" structural invariant is ever considered load-bearing.

## 2026-06-21 — audit-barrage lift (20260621T024529166Z-029-govern-operability-phase-9)

Code-sha: fa70b25f3320e057f61416bcc7f5321459db5796
### AUDIT-20260621-51 — `--into` clean-success test decomposes an item into itself — likely exits non-zero

Finding-ID: AUDIT-20260621-51
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/roadmap/list-flag-guard.test.ts:73-78

The "clean single id succeeds" loop at lines 73–78 iterates uniformly over all four `LIST_FLAGS`, invoking `argsFor(flag, 'impl:feature/a', docWithItems())` for each. For `'--into'`, `argsFor` builds:

```
['roadmap', 'decompose', 'impl:feature/a', '--into', 'impl:feature/a', '--doc', docPath, '--apply']
```

The document created by `docWithItems()` already contains `## impl:feature/a`. Asking `decompose` to decompose `impl:feature/a` into a child also named `impl:feature/a` is self-referential. One of two failure modes is almost certain at the model layer: (a) the `decompose` mutation tries to create a new unit with identifier `impl:feature/a`, which already exists → duplicate-identifier error, non-zero exit; or (b) it adds a `depends-on: impl:feature/a` edge on itself → the acyclicity check (roadmap grammar declares `depends-on` as `acyclic: true`) rejects it, non-zero exit. Either way, `expect(r.status).toBe(0)` fails.

The blast-radius: this is a concrete test-suite failure. Any CI run that exercises this file will report a red test on the `--into` variant of the clean-success case, while the three stray-comma variants (which call `parseListFlag` and exit 2 before the model is ever touched) remain green. The repair is to use a fresh identifier not already in the document — e.g., `'impl:feature/new'` for the `--into` case, or to add a branch to `argsFor` that supplies a non-self child. Reusing `'impl:feature/a'` uniformly works for `--depends-on` (adding a depends-on edge from `impl:feature/new` to an existing item) and `--part-of` (same shape), and happens to work for `--children` (clustering an existing item under a newly-created parent), but `decompose` requires the `--into` ids to be children of the target, not the target itself.

---

### AUDIT-20260621-52 — `rewriteEdgeLine` (type-aware fence) diverges from `scopeOf` (type-agnostic toggle) for mixed-delimiter documents

Finding-ID: AUDIT-20260621-52
Status: migrated-to-backlog TASK-399
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/mutations.ts:52-85 and src/roadmap/roadmap-model.ts (out of window, SCOPE_FENCE block)

The new fence-aware `rewriteEdgeLine` correctly uses type-matched close detection (a backtick fence opened by `` ``` `` is only closed by a subsequent `` ``` `` line; a tilde line inside it is treated as ordinary content and does not toggle state). This is the right CommonMark behavior.

The pre-existing `scopeOf` function in `roadmap-model.ts` (shown in the referenced dependency block) uses a simple toggle:

```typescript
if (SCOPE_FENCE.test(line)) {
  inFence = !inFence;  // toggles on ANY delimiter line, regardless of type
  return true;
}
```

For a document body containing a tilde line inside an open backtick fence:

```
```
~~~           ← scopeOf: toggles inFence → false (wrong)
content       ← scopeOf: sees this as OUTSIDE the fence, drops it if it's a bullet
~~~           ← scopeOf: toggles inFence → true (wrong)
```           ← scopeOf: toggles inFence → false
```

`rewriteEdgeLine` would (correctly) treat `~~~` as non-closing, keep `content` inside the fence, and close only on the final `` ``` ``. The two functions therefore disagree on which lines are "inside a fence" for any document that mixes fence delimiter types. An operator who writes a roadmap unit with a backtick-fenced block containing a tilde line (a nested language example, for instance) would see `scopeOf` strip field bullets from it as if they were outside a fence, while `rewriteEdgeLine` correctly leaves them alone.

The inconsistency is introduced by this diff (which adds the type-aware logic to `rewriteEdgeLine` without updating `scopeOf` to match). The fix is either: (a) update `scopeOf` to share `fenceDelimiterChar` and the same type-aware state machine, or (b) leave `scopeOf` as-is and document that the two functions intentionally use different fence models. Neither is done here.

---

### AUDIT-20260621-53 — `cluster-no-nonnull.test.ts` regex matches `!` in string literals, not only postfix type assertions

Finding-ID: AUDIT-20260621-53
Status: migrated-to-backlog TASK-400
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/cluster-no-nonnull.test.ts:20

The pattern used to detect non-null assertions is:

```typescript
const NON_NULL_ASSERTION = /[\w$)\]]!(?!=)/g;
```

The comment-stripping filter removes lines whose trimmed form starts with `//` or `*`. Non-comment code lines that contain a string or template literal with `!` after an identifier character (e.g., `'not found!'`, `` `item ${x} done!` ``) would pass through the filter and match the regex, producing a false positive. The test would then fail spuriously.

In the current `cluster.test.ts`, the string literals used in assertions (`'impl:feature/b'`, `'multi:feature/grp'`, `'in-flight'`, `'planned'`) contain no trailing `!` after identifier characters, so the false positive does not trigger today. The risk is that a future test added to `cluster.test.ts` with a description string or expect message like `'item not found!'` silently causes this meta-test to fail, and the diagnosis is non-obvious. The fix is to either (a) scope the regex more narrowly to known non-null assertion contexts (e.g., only at end of an expression token before `.` or `;`), or (b) document the known limitation and note that the test is a heuristic guard, not a parse-accurate check.

### AUDIT-20260621-54 — Four-backtick fences can still be corrupted

Finding-ID: AUDIT-20260621-54
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/document-model/chrome.ts:45-48; src/roadmap/mutations.ts:70-76

`fenceDelimiterChar` tracks only the fence character, not the delimiter length. `rewriteEdgeLine` then closes an open fence on any later line that starts with three of the same character. That mishandles a common Markdown composition case: an outer ```` fence used to document an inner ``` fenced example. The inner ``` line will be treated as the close of the outer fence, so a later example line like `- depends-on: impl:feature/old` inside the outer fence becomes “outside” and gets rewritten.

This matters because the stated goal of FR-033 is to prevent silent prose corruption in documented edge examples. A downstream operator with nested Markdown examples in a roadmap item can still have `decompose` / `reclassify` rewrite example text while reporting a successful mutation. A reasonable fix is to have the delimiter helper return both character and run length, then close only on the same character with a run length at least as long as the opener; add a fixture with an outer four-backtick fence containing an inner triple-backtick example and an edge-looking bullet.

## 2026-06-21 — audit-barrage lift (20260621T030027921Z-029-govern-operability-phase-9)

Code-sha: 57d730c31f48d3162b8dda832be0cfaec9ff654b
### AUDIT-20260621-55 — `fenceDelimiter` does not distinguish opening from closing fences — info-string lines can prematurely close an open fence

Finding-ID: AUDIT-20260621-55 (claude-01 + codex-01; cross-model)
Status: migrated-to-backlog TASK-401
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/document-model/chrome.ts:59-66 and src/roadmap/mutations.ts:63-80 (rewriteEdgeLine)

`fenceDelimiter` returns a non-null result for any line whose trimmed form begins with three or more backticks or tildes, including lines that carry an info string (e.g., ` ```typescript` or ` ```yaml`). Per CommonMark §4.5, a *closing* fence "must be followed optionally by spaces only" — an info string on a potential closing-fence line disqualifies it as a closer. `fenceDelimiter` does not check for trailing non-whitespace, so a line like ` ```typescript` produces `{ char: '`', length: 3 }` regardless of whether it appears in an opening or closing position.

In `rewriteEdgeLine` (`mutations.ts:63-80`), when `openFence` is `{char: '`', length: 3}` and the algorithm encounters ` ```typescript`, the condition `fence.char === openFence.char && fence.length >= openFence.length` (3 ≥ 3) evaluates to `true`, which sets `openFence = null` — incorrectly closing the fence. Any line below that point (still inside the outer fence according to CommonMark) is now treated as real edge content and may be rewritten if it matches the edge regex. The same `fenceDelimiter` call with the same pattern appears in `scopeOf` (`roadmap-model.ts`, referenced dependency), where it causes the analogous early-close: field-bullet lines that are part of a fenced example would be incorrectly stripped from scope prose.

The missing test case that would expose this: a body with an outer ` ``` ` fence (length 3) whose first interior line is ` ```typescript` (also length 3, with info string). The existing test in `rewrite-fence-aware.test.ts` covers the *different-length* inner fence case (4-backtick outer / 3-backtick inner), but not the *same-length-with-info-string* case. A reasonable fix is to resolve the ambiguity at the call site — when `openFence !== null`, additionally verify the remainder of the trimmed line after the fence run is empty or only spaces before treating it as a closer (i.e., `line.trimStart().slice(fence.length).trim().length === 0`). Alternatively, `fenceDelimiter` could expose `hasInfoString` and callers check it before accepting a close.

---

### AUDIT-20260621-56 — `cluster-no-nonnull.test.ts` comment-stripping does not cover `/* */` block comments

Finding-ID: AUDIT-20260621-56
Status: migrated-to-backlog TASK-402
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/cluster-no-nonnull.test.ts:28-33

The stripping pass before the non-null assertion scan filters lines whose trimmed form starts with `//` or `*`, which covers `//` line comments and interior lines of `/** ... */` JSDoc blocks (the ` * ` lines). It does not cover a `/* ... */` block comment on a single line, e.g. `/* fallback x! */`. After `.filter(line => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))`, such a line survives into the code-only string. If `cluster.test.ts` ever acquires a single-line block comment containing `!` (e.g., as part of an error-message description or a test label), the scan would report a false positive and the CI gate would fail spuriously. In the current codebase `cluster.test.ts` uses only `//` comments, making this a dormant risk rather than an active defect. Extending the filter to also reject lines whose trimmed form starts with `/*` (or stripping `/* ... */` spans as part of the replace chain) would harden the meta-test against future comment style drift.

## 2026-06-21 — audit-barrage lift (20260621T030759551Z-029-govern-operability-phase-9)

Code-sha: 57d730c31f48d3162b8dda832be0cfaec9ff654b
### AUDIT-20260621-57 — `!` non-null assertions introduced in production source while the phase simultaneously codifies the no-`!` rule

Finding-ID: AUDIT-20260621-57
Status: migrated-to-backlog TASK-403
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/document-model/chrome.ts:57–58 (added lines in diff)

The newly-added `fenceDelimiter` function contains two non-null assertion operators (`!`) in production source code:

```typescript
if (backticks !== null) return { char: '`', length: backticks[1]!.length };
...
if (tildes !== null) return { char: '~', length: tildes[1]!.length };
```

These are semantically safe: both regex patterns have a capturing group that is always populated when the overall match succeeds, so `[1]` will never be `undefined` at runtime. The correctness risk is low. The blast-radius concern is different: the same phase that introduces these `!` expressions also ships `cluster-no-nonnull.test.ts`, whose inline comment explicitly cites the project's prohibition — "The project bans `!` (no non-null assertions — .claude/CLAUDE.md 'Never bypass typing')". An unattended agent reading `chrome.ts` sees `!` in production code that was committed this phase; it sees a guard in `cluster-no-nonnull.test.ts` scoped only to `cluster.test.ts`. The agent's natural inference is: "`!` is allowed in source files, disallowed only in that one test file." That reading will propagate the pattern. Pre-existing `!` in `roadmap-model.ts` (`targets[0]!`, `m[2]!`) compounds the signal.

The appropriate fix is to eliminate the capturing group and restructure the match: capture the full leading-fence string separately, derive its length from the string itself rather than an index into the match array.

---

### AUDIT-20260621-58 — `cluster-no-nonnull.test.ts` guard does not strip regex literals; regex-internal `!` would be a false positive

Finding-ID: AUDIT-20260621-58
Status: migrated-to-backlog TASK-404
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/cluster-no-nonnull.test.ts:23–34

The file-scan logic strips single-quoted strings, double-quoted strings, and template literals, then applies the `NON_NULL_ASSERTION` regex `/[\w$)\]]!(?!=)/g`. It does not strip regex literals (e.g., `/pattern!/`). If `cluster.test.ts` ever contains a regex literal whose body contains `!` following a word character, the test would report a false positive. More subtly, the multi-line join-then-replace approach means that a regex literal which spans multiple lines (rare but possible with the `x` flag or by having the closing `/` on a later line) would not be cleanly erased; and any line inside a multi-line template literal that happens to start with `//` or `*` would be filtered out before the template-literal erasure regex runs, potentially breaking the template literal match and leaving raw literal content (including any `!`) in `codeOnly`.

In the current state of `cluster.test.ts` none of these conditions apply, so the test functions correctly. The risk manifests only if the test file evolves. The appropriate fix is to add regex-literal stripping (e.g., `/regex-literal pattern/flags`) to the erasure chain, or to use a TypeScript AST-level scan (ts-morph / TypeScript compiler API) rather than regex-on-text — the latter being more robust but heavier.

---

### AUDIT-20260621-59 — `session-end/SKILL.md` hardcodes `audiocontrol-org/deskwork` as the upstream GH repo; no configuration hook for external adopters

Finding-ID: AUDIT-20260621-59
Status: migrated-to-backlog TASK-405
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    skills/session-end/SKILL.md (added lines, approx. lines 65–75 in post-diff view)

The new tooling-friction routing guidance says:

> file a GitHub issue against [`audiocontrol-org/deskwork`](https://github.com/audiocontrol-org/deskwork/issues) (`gh issue create --repo audiocontrol-org/deskwork`)

For the current deployment this is accurate — `stackctl` and the stack-control plugin are maintained in that repository. However, if stack-control is published as a standalone distributable and adopted by an organization whose `stackctl` friction should route to a different tracker, the hardcoded repo becomes wrong. The skill offers no interpolation hook (e.g., a `stackctl_upstream_repo` config key). Adopters following this guidance verbatim would file issues against the wrong repository. Whether this matters depends on the project's distributable-plugin roadmap; it is surfaced here as an artifact worth tracking, not as a current correctness defect.

---

### AUDIT-20260621-60 — `fenceDelimiter` uses `trimStart()` (unlimited indentation) rather than CommonMark's 0–3 space limit; acknowledged simplification but opens a latent divergence

Finding-ID: AUDIT-20260621-60 (claude-04 + codex-01; cross-model)
Status: migrated-to-backlog TASK-406
Severity:   medium
Per-lane:   claude=informational, codex=medium
Decision:   adjudicated (gate-counted medium) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — medium retained.
Surface:    src/document-model/chrome.ts (fenceDelimiter body, added lines)

CommonMark §4.5 specifies that a fenced code block's opening delimiter may be indented by at most 3 spaces before the backtick/tilde run. `fenceDelimiter` calls `line.trimStart()`, which strips any amount of leading whitespace before checking for the run. This means a line indented by 4+ spaces that happens to start with ```` ``` ```` will be identified as a fence delimiter, even though CommonMark would not treat it as one. The inverse — a line indented by 1–3 spaces — is correctly handled. The original comment ("We keep this deliberately simple") acknowledges this class of simplification. The concern here is a channel-enumeration note: the `fenceDelimiter` function is now exported and used in two places (`mutations.ts`, `roadmap-model.ts`). If either of those call sites ever needs to handle deeply-indented content (e.g., items nested inside blockquotes or list items, which roadmap bodies can contain), the unlimited-trim will silently produce wrong fence detection. Since the scope is intentionally narrow (edge-mutation documents with field bullets), this is informational rather than actionable.
