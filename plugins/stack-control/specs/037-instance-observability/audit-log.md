---
slug: 037-instance-observability
targetVersion: ""
---

# Audit log — 037-instance-observability

## 2026-07-19 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260719-01 — Real `plane serve` never enables the new host:path auth check

Finding-ID: AUDIT-20260719-01
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/plane.ts:185-188, src/plane/runtime.ts:85-96, src/plane/runtime-handlers.ts:390-399

The runtime only enforces the new instance identity check when `acceptedInstances` contains an entry for the bearer token: `requireAuthedInstance()` can return `undefined`, and then the ingest handler skips `refuseInstanceMismatch` entirely. The real CLI serve path constructs the runtime with only `acceptedTokens` and `commandStoreDir`, never `acceptedInstances`, so `stackctl plane serve` accepts telemetry for any `envelope.host:path` as long as the caller has the token and matching `installationId`.

This matters because T038’s stated security goal is “token→host:path check running alongside installationId.” The test surface exercises the runtime with an injected `acceptedInstances` map, but the production CLI path omits that map. Blast radius is high: a downstream adopter running the actual plane process gets the old spoofable host/path behavior while the code comments and tests imply the protection is live. A reasonable fix is to derive the served installation’s `host:path` in `runServe` and pass `acceptedInstances: new Map([[token, deriveInstanceId(installationRoot)]])`, or make the runtime require explicit instance authorization whenever this feature is enabled.

### AUDIT-20260719-02 — `--at` session commands mutate the wrong current-session store

Finding-ID: AUDIT-20260719-02
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/machine-state/current-session.ts:77-87, src/subcommands/session-start.ts:70-105, src/subcommands/session-end.ts:236-242

`session-start` and `session-end` resolve the target installation from `--at`, but the current-session helpers ignore that target and always call `resolveInstallation(process.cwd())`. In `session-start`, the event is emitted for `installation.root`, while `mintCurrentSession()` writes the record for the cwd installation. In `session-end`, `readCurrentSession()` and `clearCurrentSession()` read/clear cwd, then emit `session.ended` to the `--at` installation.

That means `stackctl session-start --at /target` from another checkout can create a session event for `/target` but persist the open-session record under the caller’s cwd; `session-end --at /target` can then fail to close `/target`’s real record or emit the wrong session id. Blast radius is high because unattended session lifecycle accounting becomes silently wrong for a supported CLI targeting mode. A reasonable fix is to make `mint/read/clear` accept an installation root, use it from `--at` callers, and keep cwd-default wrappers only where the caller truly has no target.

### AUDIT-20260719-03 — Existing event logs without 037 fields cannot replay after upgrade

Finding-ID: AUDIT-20260719-03
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/event-log.ts:121-130, src/fleet/event.ts:272-288

The replay path now requires every persisted log line to contain both top-level `snapshot` and the new envelope fields `host`, `path`, and `sessionId`. `parseLine()` throws if `snapshot` is absent, then calls `validateEnvelope()`, which throws if any of the new envelope fields are missing. Existing 036-era durable event logs were written before these fields existed, so an upgraded plane can fail during `createEventLog()` replay before serving anything.

This is a fresh-install path working at the expense of the upgrade path. Blast radius is high: an adopter with prior fleet telemetry can lose plane startup on upgrade, and the error is treated as corruption rather than schema migration. A reasonable fix is to add schema-aware replay normalization for older records, such as accepting schemaVersion 1 with explicit migrated defaults or a documented quarantine path, while preserving strict validation for newly ingested schemaVersion 2 events.

### AUDIT-20260719-04 — Fail-open guard tests for phase advance are vacuous once `emitAdvance` is async

Finding-ID: AUDIT-20260719-04 (claude-01 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    tests/instance/phase-emit.test.ts (FAIL-OPEN test, final `it()` block, ~lines 211-218) and tests/instance/emit-fail-open.test.ts (test `(c) phase advance ... completes without throwing when sidecar is unreachable`, ~lines 155-183)

Both tests assert the phase-advance fail-open contract with `expect(() => emitAdvance(ITEM, true, {})).not.toThrow()` — a *synchronous* throw check. But `tests/instance/phase-advance-delivery.test.ts` (added later in this same audited range, driving the D-E fix landed in commit `9a1789e6 T048(037): deliver phase.entered + session.* from the CLI (D-E) + shared emit-drain`) explicitly `await`s `emitAdvance(...)` and times it via `performance.now()` around the `await` — e.g. its "fail-open... returns PROMPTLY" test does `const startMs = performance.now(); await emitAdvance(ITEM, true, {}); const elapsedMs = performance.now() - startMs;`. This only makes sense if `emitAdvance` now returns a Promise that resolves after the bounded deliver-or-budget wait completes (the whole point of the D-E fix — "emitAdvance AWAITS it").

If `emitAdvance` is (now) an `async function`, wrapping a call to it in `expect(() => fn()).not.toThrow()` can never actually fail: any error thrown inside an async function — even before its first `await` — is caught by the function's implicit wrapper and turned into a **rejected Promise**, not a synchronous throw from the caller's perspective. Since neither test awaits or `.catch()`s the returned value, a real fail-open regression (e.g. the bounded wait hanging, or the internal telemetry call rejecting and propagating) would silently pass these two guard tests — the exact tests whose entire purpose is to catch that regression. `phase-advance-delivery.test.ts`'s own fail-open test uses the correct `await emitAdvance(...)` pattern, showing the author knew the right shape; the two older tests were not updated to match `emitAdvance`'s new async contract. Fix: change both assertions to `await expect(emitAdvance(...)).resolves.not.toThrow()` (or equivalent `resolves.toBeUndefined()`), mirroring the pattern already used for the session-start/session-end fail-open cases in the same `emit-fail-open.test.ts` file.

## 2026-07-19 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260719-05 — Regex-based read-only guard silently ignores any HTTP method other than GET/POST

Finding-ID: AUDIT-20260719-05
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/read-only-surface.test.ts:38-45

The FR-024 "read-only surface" guard is meant to fail if any state-changing route is ever added under `/v1/instances*`. Its extraction regex is:

```js
const routePattern =
    /\{\s*method:\s*'(GET|POST)',\s*pattern:\s*'([^']+)',\s*handler:\s*'[^']+'\s*\}/g;
```

The capture group is hardcoded to `(GET|POST)`. A `ROUTE_TABLE` entry using `method: 'DELETE'`, `'PUT'`, or `'PATCH'` will simply fail to match this regex at all — the whole `{...}` object literal is skipped, so that route never enters the `routes` array, never reaches the `/v1/instances` prefix filter, and is invisible to the `expect(route.method).toBe('GET')` assertion below it. The guard only actually catches a mutating route if someone adds it as `method: 'POST'` (which is captured and then correctly fails the assertion); any of the other three HTTP verbs sail through with the test staying green, which is precisely the failure mode this guard exists to prevent (a future PR wiring a `DELETE /v1/instances/:id` handler by accident).

Fix: widen the capture to any uppercase method token, e.g. `method:\s*'([A-Z]+)'`, so every declared method is captured and asserted against `'GET'` rather than silently dropped.

### AUDIT-20260719-06 — Fresh 037 ingest fixtures use schemaVersion 1

Finding-ID: AUDIT-20260719-06
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/api-instance-runs.test.ts:65-82; tests/instance/auth-host-path.test.ts:79-96; tests/instance/phase-payload-e2e.test.ts:104-119; tests/fleet/sidecar-daemon.test.ts:366-368

Several new tests construct fresh 037-shaped wire events with `host`, `path`, and `sessionId`, but keep `schemaVersion: 1`. That conflicts with the same diff’s stated contract in `sidecar-daemon.test.ts:366-368`: all producers stamp schemaVersion 2 once the envelope carries instance identity. The replay compatibility test correctly reserves schemaVersion 1 for pre-037 durable records without the new fields, while schemaVersion 2 is the 037 shape.

Blast radius is high because these tests define the unattended implementation boundary: an agent can reasonably build ingest to accept fresh schemaVersion-1 identity events, weakening the migration/version invariant and making v1 mean both “legacy without identity” and “new identity-bearing event.” The fixtures for new HTTP ingest paths should use schemaVersion 2 consistently; schemaVersion 1 should be isolated to explicit legacy replay cases.

### AUDIT-20260719-07 — Route-ordering guard's presence check accepts a `null` regex match as `toBeDefined()`, defeating the exec's own explanatory assertion

Finding-ID: AUDIT-20260719-07 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/instance/route-ordering.test.ts:57-64

`serverSource.match(...)` (line 47) returns `null`, not `undefined`, when the `ROUTE_TABLE` declaration doesn't match the expected regex shape (`const ROUTE_TABLE:\s*readonly RouteDefinition\[\]\s*=\s*\[...`). The guard at line 57-60 is `expect(routeTableMatch, '...').toBeDefined()`, but Vitest's `toBeDefined()` only asserts `!== undefined` — a `null` value satisfies it. So if `server.ts`'s type annotation ever drifts from the exact literal string this regex expects (e.g. drops `readonly`, or the array type changes to `Array<RouteDefinition>`), this custom assertion silently passes instead of failing with its intended message ("ROUTE_TABLE should be present in server.ts").

The subsequent line `const routeTableBlock = routeTableMatch![1];` then dereferences a `null` at runtime (the `!` non-null assertion is compile-time-only and provides no runtime protection), throwing an unhandled `TypeError: Cannot read properties of null (reading '1')`. The test still fails overall, so this isn't a false-pass, but it defeats the whole point of writing an explanatory custom assertion message — a future maintainer sees a cryptic stack trace instead of the intended diagnostic. Fix: use `expect(routeTableMatch).not.toBeNull()` (or `.toBeTruthy()`) instead of `.toBeDefined()`.

### AUDIT-20260719-08 — Supersede test does not enforce the required event order

Finding-ID: AUDIT-20260719-08
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/session-verbs.test.ts:275-312

The test title and contract say a second `session-start` must emit `session.ended{reason:"abandoned"}` for the old session before minting/emitting the new `session.started`. The assertions only check eventual presence: it waits for an abandoned event at lines 292-299, then waits for two started events at lines 305-312 and compares the set of IDs. An implementation that emits the new `session.started` first and the old `session.ended` second would still pass.

Blast radius is high because the ordering is a lifecycle contract, not cosmetic: downstream session accounting or replay consumers can observe a transient overlap with two started sessions and no intervening end. The test should inspect `eventPairs(peer)` in received order and assert the old `session.ended` index is less than the new session’s `session.started` index.

## 2026-07-19 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260719-09 — Session/phase folds skip the no-regress ordering guard every other field in the same accumulator uses

Finding-ID: AUDIT-20260719-09 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/plane/instance-accumulator.ts:135-159 (`applySessionEvent`), :171-186 (`applyPhaseEnteredEvent`)

The module's own header comment (lines ~20-32) states the invariant for this file in absolute terms: *"no-regress (an older `installationSequence` never walks a field backward) is enforced HERE, per-field, via the `*Sequence` high-water/low-water marks."* `applyInstanceEvent` honors this for `lastActivityAt`/`lastActivity` (`sequence > acc.lastActivitySequence`), `firstSeenAt` (`sequence < acc.firstSeenSequence`), and `lastHeartbeatAt` (`sequence > acc.lastHeartbeatSequence`) — but `applySessionEvent` and `applyPhaseEnteredEvent` are invoked unconditionally on event-array order, with no sequence check at all.

This matters because out-of-order delivery is not a theoretical edge case in this codebase — it's a first-class, already-tested scenario for the sibling run registry (`tests/fleet/dedupe-reorder.test.ts`, `tests/fleet/buffer-asymmetry.test.ts`, referencing T079/SC-015), and the ingest/registry layer explicitly tolerates out-of-order acceptance rather than rejecting it (hence the no-regress design in the first place). Two concrete failure scenarios:

1. **Negative/corrupted `phaseDurations` (FR-018, SC-009 violation).** `applyPhaseEnteredEvent` computes `elapsedMs = Date.parse(envelope.wallClock) - Date.parse(acc.phaseEnteredAt)` using array-processing order, not sequence order. If two `phase.entered` events for the same instance are delivered/replayed out of their true order (e.g. a sidecar retry after a transient POST failure lands after a later event that already succeeded), `elapsedMs` can go negative, corrupting the cumulative duration for a phase — worse than the "never fabricate 0" guarantee SC-009 explicitly protects against.
2. **`currentSession` can get stuck open forever.** `applySessionEvent`'s `session.ended` branch only clears `currentSession` when `acc.currentSession.sessionId === endedSessionId`. If a `session.ended` for the currently-open session arrives at the plane *before* its matching `session.started` (plausible since `session-start.ts`'s FR-009a supersede path opens two independent `emitSessionEvent` calls, each spinning up its own socket connection — order at the wire is only best-effort, not guaranteed), the `ended` event is silently dropped (no match yet), and when `started` later arrives it opens `currentSession` with no corresponding `ended` ever able to close it (the real `ended` already fired and won't be resent). The instance now reports a permanently open session.

A fix should key both folds off `envelope.installationSequence` the same way the other four fields already do — e.g. only apply a `session.*`/`phase.entered` event when its sequence is newer than a corresponding high-water mark tracked per-field (or reject/queue out-of-sequence session/phase events until missing predecessors arrive). No existing test in this diff (or the dogfood script) exercises reordered session/phase delivery, so this gap is currently unverified in either direction.

### AUDIT-20260719-10 — One malformed heartbeat can poison instance liveness until restart

Finding-ID: AUDIT-20260719-10
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/runtime-http.ts:156-162, src/plane/heartbeat-store.ts:44-48, src/plane/instance-accumulator.ts:233-240

`assertSessionLiveness` only checks that `emittedAt` is a string. `HeartbeatStore.record` then stores the first heartbeat unconditionally and compares later heartbeats with `Date.parse(...)`. If the first accepted heartbeat has an invalid timestamp, `Date.parse(prior)` is `NaN`, so every later valid heartbeat fails `Date.parse(emittedAt) > Date.parse(prior)` and the store never recovers. The registry then parses that invalid timestamp again, deriving `gone`/`disconnected` despite fresh valid heartbeats arriving later.

Blast radius is high because this affects the live/attached signal added by T050: a single bad authenticated heartbeat can make an instance appear disconnected until the plane process restarts. The boundary should validate `emittedAt` as a valid ISO wall clock before recording, or make the store reject/replace unparsable prior values, with a test proving recovery after a bad heartbeat.

### AUDIT-20260719-11 — `read-only-surface.test.ts`'s ROUTE_TABLE guard is a regex over source text that can silently under-extract routes, defeating the FR-024 invariant it exists to enforce

Finding-ID: AUDIT-20260719-11
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/read-only-surface.test.ts:39 (`ROUTE_TABLE` block regex), tests/instance/read-only-surface.test.ts:56 (`routePattern` regex)

The read-only invariant (FR-024: every `/v1/instances*` route must be `GET`) is enforced by regex-parsing `server.ts`'s source text rather than importing and inspecting `ROUTE_TABLE` as real data. The entry-matching regex — `/\{\s*method:\s*'([A-Z]+)',\s*pattern:\s*'([^']+)',\s*handler:\s*'[^']+'\s*\}/g` (line 56) — requires an EXACT field order (`method`, then `pattern`, then `handler`) with no extra properties and single-quoted strings. If a future `RouteDefinition` entry reorders fields, adds a property (e.g. `middleware:`), or is formatted differently, the regex simply fails to match that one entry — it is silently dropped from `extractInstanceRoutes()`'s output. The test's only "did we parse enough" guard is `expect(routes.length === 0)` throwing when the WHOLE table yields nothing (line ~55 area) and `instanceRoutes.length >= 2` — neither catches a partial miss.

This means a newly-added mutating route on `/v1/instances*` (e.g. a `POST /v1/instances/:id/ack`) whose object literal doesn't match the regex's assumed shape would be invisible to `extractInstanceRoutes()`, so the "every instance route is GET" assertion would trivially pass while the real invariant is violated — the exact silent-false-positive failure mode this project's own `.claude/rules/audit-barrage-is-stochastic-defense-in-depth.md` warns against generalized to test code (a fragile heuristic standing in for something a real import/type check would catch deterministically and completely). The robust fix is to export `ROUTE_TABLE` from `server.ts` and iterate it as data, not parse it as text; short of that, the test should fail loud if the number of extracted entries doesn't match an independently-counted total (e.g. count of `{ method:` occurrences in the block) rather than only failing on a total-zero extraction.

### AUDIT-20260719-12 — Systemic redundant/no-op `as` casts on `Server.address()` contradict this diff's own repeated "no `as`" convention

Finding-ID: AUDIT-20260719-12 (claude-04 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/instance/api-instance-runs.test.ts (`const address = server.address() as AddressInfo | string | null;`), tests/instance/invocation-fast-verb-delivers.test.ts (`(address as AddressInfo).port` after a null/string guard), tests/instance/phase-advance-delivery.test.ts (`const boundPort = (address as AddressInfo).port;`), and the same pattern repeated across most other new files in tests/instance/ and tests/fleet/plane-serve-instance-auth.test.ts

Two variants of the same unnecessary cast recur across most new test files in this diff: (1) `server.address() as AddressInfo | string | null` immediately after the call — a complete no-op since `Server.address()`'s declared return type already IS `AddressInfo | string | null`; and (2) `(address as AddressInfo).port` used AFTER an `if (address === null || typeof address === 'string') throw ...` guard, at which point TypeScript's control-flow narrowing has already reduced `address` to `AddressInfo` without any cast needed. Neither cast changes behavior, but both are explicit `as` type assertions in files whose own header comments state "No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI)" — a rule violated by the same files that claim to follow it. This is purely hygiene (no runtime consequence), but it's a mechanical, easily-fixed pattern (drop the cast; the type already narrows) worth cleaning up given how many files repeat it verbatim, suggesting the pattern was copied forward across the whole feature's test suite.

## 2026-07-19 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260719-13 — phase.entered duration accrual can go negative from non-monotonic wallClock

Finding-ID: AUDIT-20260719-13
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/instance-accumulator.ts:~200-215 (`applyPhaseEnteredEvent`)

`applyPhaseEnteredEvent` accrues cumulative `phaseDurations` using `Date.parse(envelope.wallClock) - Date.parse(acc.phaseEnteredAt)`, gated only by `installationSequence` (`sequence <= acc.currentBearingSequence` → skip). But the envelope-field documentation in `src/fleet/types.ts` explicitly states `wallClock` "describes; never orders (PT-013)" — i.e. the codebase's own contract is that `wallClock` is not guaranteed monotonic even when `installationSequence` is. There is no clamp (e.g. `Math.max(elapsedMs, 0)`) anywhere in this fold.

Two realistic ways this fires: (1) an ordinary system clock adjustment (NTP correction, VM resume-from-sleep, DST edge case) between two phase transitions of the same long-running workflow — no concurrency needed at all; (2) concurrent invocations for the same instance each independently calling `reserveNextSequence` then stamping `wallClock` at `constructEnvelope` time — sequence reservation and wallClock stamping are not atomic together, so under scheduling jitter a higher-sequence event can carry an *earlier* wallClock than the lower-sequence event it follows. Either way, `elapsedMs` goes negative and is added directly into `acc.phaseDurations[leaving]`, silently corrupting a served, operator-visible field (`InstanceState.phaseDurations`) with a nonsensical (possibly net-negative) cumulative duration — with no downstream validation catching it. Given this project explicitly parallelizes phase/task dispatch (`stack-control:execute`), concurrent phase transitions against the same instance are not a hypothetical. Notably, the sibling heartbeat path (`heartbeat-store.ts`, `assertPlausibleHeartbeatInstant`) was hardened against exactly this class of clock-skew problem (AUDIT-20260719-10) — this phase-duration computation was not given the same treatment. A minimal fix: clamp `elapsedMs` to `Math.max(0, elapsedMs)` before accruing, and/or gate on wallClock order as well as sequence order.

### AUDIT-20260719-14 — Dogfood script reports FAIL verdicts but still exits successfully

Finding-ID: AUDIT-20260719-14
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    scripts/dogfood-instance-observability.sh:26, scripts/dogfood-instance-observability.sh:143-151, scripts/dogfood-instance-observability.sh:281-289

The script calls itself the “PRIMARY ACCEPTANCE PATH”, but it uses `set -uo pipefail` without `-e` and the scenario checks only print `VERDICT: FAIL` instead of recording failure and exiting non-zero. For example, S2 prints failure when `currentSession` stays null, and S5 prints failure when heartbeat liveness is wrong, but neither path affects the process status. The same pattern appears throughout the script: command failures are often tolerated with `|| true` or only echoed.

Blast radius is high because an unattended consumer can run this acceptance path in CI or as release evidence and get exit 0 even when a stated scenario failed. A reasonable fix is to accumulate a failure count, keep printing the evidence, and exit non-zero at the end when any required scenario emitted FAIL; reserve non-fatal “see values above” / optional diagnostics for explicitly non-gating subchecks.

### AUDIT-20260719-15 — Inline `require('node:fs')` under node16/ESM likely breaks this test file's compilation, plus two dead imports

Finding-ID: AUDIT-20260719-15
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/instance-id.test.ts:22,24,111,133

Every sibling test file in this diff follows one explicit convention: "Relative `.js` imports under node16 resolution" (stated verbatim across dozens of files in this feature). `instance-id.test.ts` already imports `mkdtempSync, rmSync, readdirSync, symlinkSync, writeFileSync` from `'node:fs'` via ESM `import` at line 22 — then at lines 111 and 133 falls back to `const fs = require('node:fs'); fs.mkdirSync(...)` inside two test bodies, purely to reach `mkdirSync`, which was never added to the top-level import. Under a true node16-module-resolution/ESM TypeScript file, `require` is not an ambient global and this typically fails to compile (`Cannot find name 'require'`) or throws `ReferenceError: require is not defined` at runtime, depending on how strictly the harness enforces ESM — either way it is a live risk that the rest of the codebase's consistent `.js`-import convention was specifically designed to avoid. Compounding this: `writeFileSync` (line 22) and `relative` (line 24, from `'node:path'`) are imported but never referenced anywhere in the file — dead imports that `noUnusedLocals`/strict-mode compilation (mandated by CLAUDE.md: "TypeScript strict mode") would flag. Fix: add `mkdirSync` to the existing `node:fs` import and delete both `require(...)` calls and the two unused imports.

### AUDIT-20260719-16 — SchemaVersion 1 fixtures still claim instance identity

Finding-ID: AUDIT-20260719-16
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/instances-routes.test.ts:62-79; tests/instance/invocation-retained.test.ts:68-85; tests/instance/instance-rehydrate.test.ts:74-91; tests/instance/heartbeat-e2e.test.ts:111-131; tests/fleet/snapshot-threading.test.ts:78-94; tests/fleet/plane-serve-instance-auth.test.ts:88-104

Several new/updated tests build events with `schemaVersion: 1` while also supplying `host`, `path`, and expecting instance attribution. The production contract now says pre-037 schemaVersion 1 records have absent `host`/`path` and are not projected; `src/fleet/types.ts:82-94` documents that only schemaVersion >= 2 events carry identity by construction.

This matters because these tests teach the implementation that v1 can be identity-bearing, directly conflicting with the replay compatibility boundary added for AUDIT-20260719-03. An unattended agent could satisfy these tests by accepting/projecting v1 host/path events broadly, weakening the migration invariant. The reasonable fix is to make identity-bearing test events `schemaVersion: 2`, reserving v1 only for explicit legacy replay fixtures with absent identity.

### AUDIT-20260719-17 — Live-zero durable reads test no longer matches ClassifiedEvent shape

Finding-ID: AUDIT-20260719-17
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   adjudicated (gate-counted blocking) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — blocking retained.
Surface:    tests/instance/live-zero-durable-reads.test.ts:56-92; tests/instance/live-zero-durable-reads.test.ts:182; src/plane/instance-accumulator.ts:63-68

`live-zero-durable-reads.test.ts` declares a local `ClassifiedEvent` without `snapshot` and with `type: string`, then passes `ClassifiedEvent[]` into `buildInstanceRegistry`. The real exported `ClassifiedEvent` now requires `snapshot: SnapshotPayload` and `type: EventType` (`src/plane/instance-accumulator.ts:63-68`), so this fixture is structurally stale.

Blast radius is blocking because this can fail type-check/test execution before it verifies SC-007 at all. It also contradicts the D5 payload-threading work elsewhere in the diff. The fix is to use the exported `ClassifiedEvent` type or update the local fixture to include `snapshot: {}` and a narrowed `EventType`.

## 2026-07-19 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260719-18 — Legacy/malformed local-socket frame can crash the whole sidecar daemon

Finding-ID: AUDIT-20260719-18
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/sidecar/daemon.ts (`ingestFrame`, the new host/path guard added in this diff)

`ingestFrame` now does:
```ts
const { host, path } = env;
if (host === null || path === null) {
  throw new Error('sidecar ingestFrame: received a live event frame with absent host/path — ...');
}
```
with no visible `try/catch` around it, inside an `async` function invoked from the frame-received callback. If a frame ever arrives with `host`/`path` null — e.g. a stale cached CLI binary still on disk (schemaVersion 1, pre-037, never derives host/path) talking to an already-upgraded, already-running long-lived sidecar daemon during a version rollout, which is exactly the "upgrade skew" scenario the durable-log replay path (`validateEnvelopeForReplay`, AUDIT-20260719-03) was explicitly built to tolerate — this throws inside a promise with no evident `.catch()` at the call site. An unhandled rejection here would, by default Node behavior, terminate the entire sidecar process, taking every instance's telemetry uplink down with it.

This is precisely the "poison event must never crash the process" failure mode this same feature fixed twice elsewhere (`computeFleetTickGuarded` / `computeInstanceTickGuarded`, both explicitly citing AUDIT-20260718-04). The fix here should follow the same established pattern: catch the malformed-identity case, log it, and drop the one frame — never let it propagate uncaught out of the frame-ingest path. "Fail loud" should mean "surface + reject this one event," not "crash the daemon."

### AUDIT-20260719-19 — Bounded drain treats provisional writes as delivered

Finding-ID: AUDIT-20260719-19
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/telemetry/emit-drain.ts:50-65; src/telemetry/emit.ts:145-153,260-298

`awaitDeliveredOrBudget` returns as soon as the client is `connected` and the buffer is empty (`src/telemetry/emit-drain.ts:56-65`). But the emit client’s own protocol says buffer-drained events are still provisional until a matching `hello-ack` arrives: unconfirmed events are explicitly tracked at `src/telemetry/emit.ts:145-153`, buffer drains push events into `unconfirmed` at `src/telemetry/emit.ts:260-269`, and only a compatible `hello-ack` clears them at `src/telemetry/emit.ts:283-298`.

That means the new bounded-drain path can return before delivery is actually confirmed, after which the caller closes the client. On a protocol mismatch, slow ack, or peer close before ack, the existing requeue/reconnect protection cannot run because the helper already declared success based only on an empty buffer. Blast radius is high: this helper now gates `invocation.completed`, `session.*`, and `phase.entered` producer delivery, so a normal stale-sidecar/version-skew path can silently drop the exact events this feature depends on to create instances, sessions, and bearings.

A reasonable fix is to make the helper wait for the emit client’s delivery-confirmed state, not just `buffer.size === 0`; for example expose a read-only `pendingConfirmation`/`deliveryConfirmed` signal from `EmitClient`, or add an explicit drain method that resolves only after compatible ack or the bounded budget/unavailable/closed exits.

### AUDIT-20260719-20 — Two test files assert contradictory `connection` derivation semantics

Finding-ID: AUDIT-20260719-20
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/registry-instances.test.ts:150-168 vs tests/instance/heartbeat-liveness.test.ts:1-30,150-167

`tests/instance/registry-instances.test.ts` ("sets connection and liveness derived from the last-signal age") feeds `buildInstanceRegistry(events)` a **single** `session.heartbeat`-typed classified event with a fresh `wallClock`, passes **no** `heartbeats` map (the single-arg call form), and asserts `instance.connection === 'attached'`. That is: a recent event in the ordinary classified-event stream is sufficient to mark the instance `attached`.

`tests/instance/heartbeat-liveness.test.ts` (T050, the newer dogfood fix) states the contract explicitly in its header comment: *"derive liveness from max(lastActivityAt, lastHeartbeatAt), and **connection from heartbeat recency**"* — i.e. `connection` is NOT derived from generic activity recency at all, only from the out-of-band `heartbeats` map fed by `POST /v1/sidecar/liveness`. Its own test "connection lapses to disconnected once the heartbeat ages out, even with fresh activity" (lines 150-167) proves this precisely: an `invocation.completed` event only **1 second old** does *not* yield `connection: 'attached'` — only a fresh entry in the `heartbeats` map does.

These are two different rules for the same field, and neither test file documents the reconciliation (e.g. "`session.heartbeat`-typed events are themselves folded into the internal heartbeat-recency signal, distinct from ordinary activity events like `invocation.completed`"). If the implementation folds `session.heartbeat` into the heartbeat-recency channel as a special case, that's an undocumented second heartbeat channel that a future maintainer reading only the T050 comment (which says "connection from heartbeat recency" with no carve-out) would plausibly believe is dead/redundant and remove — silently breaking whichever real-world path `registry-instances.test.ts` exists to protect (in-band session-heartbeat telemetry with no sidecar-liveness POST wired up). If it is NOT folded that way, one of these two tests is currently failing. Either way, the ambiguity should be resolved with an explicit comment stating the actual multi-channel invariant, backed by a test that exercises both channels together (one stale, one fresh, asserting which wins).

### AUDIT-20260719-21 — Heartbeats are keyed by installationId, so one heartbeat can mark the wrong host:path live

Finding-ID: AUDIT-20260719-21
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/instance/heartbeat-liveness.test.ts:10-13, tests/instance/heartbeat-e2e.test.ts:138-143

The new heartbeat tests bake in the assertion that `installationId` is `1:1 with host:path`, and the HTTP body under test carries only `{ kind, installationId, emittedAt }`. That is the wrong invariant for this feature: 037 adds `host:path` precisely because installation UUID alone is not enough to distinguish copied or moved checkouts. The implementation then injects heartbeats into every accumulator matching the same installation UUID, so two observed instances with the same `installationId` but different `host:path` can both become `attached`/`live` from one sidecar heartbeat.

Blast radius is high because the operator-facing instance view can show a stale copied checkout as currently connected, which defeats the main observability goal. Add a regression with two events sharing one `installationId` but different `host:path`, then post a heartbeat from only one instance; the other must remain disconnected. A reasonable fix is to carry and authenticate the heartbeat’s `host:path` identity and key the heartbeat store by instance id, not only by installation UUID.
