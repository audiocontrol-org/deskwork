---
slug: 036-fleet-control-plane
targetVersion: ""
---

# Audit log — 036-fleet-control-plane

## 2026-07-17 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260717-01 — cli-emits.test.ts asserts nothing about the actual `cli.ts` dispatcher it claims to verify

Finding-ID: AUDIT-20260717-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/cli-emits.test.ts (all four `it()` blocks)

`emit.ts`'s own module doc calls it "THE HIGHEST-RISK FILE IN THE FEATURE: every `stackctl` invocation runs this code," and T044's job (per the test file's header comment) is specifically to prove `cli.ts` wires a real `installationId` and a real monotonic `installationSequence` into the emitted envelope, and that dispatcher behavior is unaffected when the sidecar is unavailable. None of the four tests in this file actually exercise `cli.ts`.

- The "RED" test hand-builds an `EnvelopeInput` with `installationId: ''` via `constructEnvelope` directly and asserts `validateEnvelope` throws. This proves `validateEnvelope` rejects an empty string — a fact already covered by `event.test.ts` — and says nothing about whether `cli.ts` ever produces such an envelope.
- The "GREEN" test hand-builds an `EnvelopeInput` with `installationId: expectedInstallationId` (computed via `mintOrReadInstallationId` directly, not read back from anything `cli.ts` produced) and asserts the hand-built envelope validates. Again, `cli.ts` is never imported or invoked.
- The last two tests, `'an unavailable emit target does NOT change dispatcher output/exit code'` and `'emit adds no measurable latency vs a telemetry-disabled baseline'`, contain a single assertion each: `expect(redirectedStore.runtimeDir).toBeTruthy()`. This is true by construction of `useMachineStateStore()` and has no relationship to dispatcher output, exit code, or latency — the titles describe SC-001/SC-002 fail-open guarantees that are not measured anywhere in the file.

Because these tests will pass regardless of what `src/cli.ts`'s actual dispatch/wiring code does, a real regression (e.g., `cli.ts` reverting to a hardcoded `installationSequence: 1`, or an unavailable sidecar adding real latency to every invocation) would ship with this suite green. This is exactly the "TDD spec tests have systematic blind spots" failure mode: passing tests create false confidence in the wiring of the feature's highest-risk file. Fix: import and invoke the real dispatcher path (or the actual seam `cli.ts` calls to construct/emit the envelope) and assert on its output, and replace the two placeholder tests with real latency/output-invariance measurements against a live vs. absent socket.

### AUDIT-20260717-02 — Buffered events are dropped on protocol-version mismatch

Finding-ID: AUDIT-20260717-02
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/telemetry/emit.ts:223-256

`onConnect()` immediately drains the long-run buffer and writes all held events before the sidecar has accepted the `hello` handshake. If the sidecar later replies with a mismatched `hello-ack`, `onData()` calls `markUnavailable()` after the buffer has already been emptied, so those held events are neither delivered to a compatible sidecar nor retained for the restart path.

This breaks the stated long-run restart-gap buffer contract exactly during upgrade/skew, where C3 says the mismatch has a defined restart path. The blast radius is high because a downstream operator can lose the buffered telemetry for a long-running command during a common stale-sidecar case. A reasonable fix is to keep drained events pending until a matching `hello-ack` is observed, or requeue them before marking the socket unavailable on mismatch.

### AUDIT-20260717-03 — CLI telemetry wiring tests do not exercise CLI telemetry wiring

Finding-ID: AUDIT-20260717-03
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/cli-emits.test.ts:46-134

This test file claims to prove dispatcher telemetry emission, fail-open output/exit behavior, live sidecar receipt, real installation identity, and monotonic installation sequence, but the tests never invoke `cli.ts`, never create an `EmitClient`, and never assert socket traffic. The last two tests only assert that the redirected runtime directory exists (`tests/fleet/cli-emits.test.ts:119-134`), so they pass even if dispatcher telemetry is entirely absent.

The blast radius is high because this is the test surface for every `stackctl` invocation emitting telemetry; a downstream implementation can ship with no real CLI telemetry path and still get a green signal here. The fix should drive an actual dispatched short verb through the CLI entry surface under the machine-state harness and assert unchanged output/exit plus exactly one emitted event with real identity and advancing sequence.

### AUDIT-20260717-04 — dedupe-reorder.test.ts asserts `progressEventCount: 2` for events that no-regress must reject as stale/late

Finding-ID: AUDIT-20260717-04
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/dedupe-reorder.test.ts:150-188

The delivery order in this test is `[started(seq1), completed(seq4), progress2(seq3), progress1(seq2), progress2(seq3) dup, started(seq1) dup]` (sequences assigned by `pipeline.receive()` in call order, per the file's own header comment). After `started` and `completed` are ingested and accepted, the run's high-water mark for no-regress purposes is 4. `progress2` (seq3) and `progress1` (seq2) then arrive with sequences *lower* than the already-accepted 4 — under the no-regress contract this exact PR establishes in `tests/fleet/ingest.test.ts` case (c) ("an older-invocationSequence event does NOT regress applied state… `older.kind` toBe `'stale'`") and reinforces in `tests/fleet/dedupe-is-optional.test.ts`'s second scenario, these two events must be classified `'stale'` (or possibly `'late'`, per `ingest.test.ts` case (e)'s finalized-run handling) — never `'accepted'`. Since the test only pushes into its local `accepted` array `if (outcome.kind === 'accepted')` (line 176-178), neither progress event can ever land in that array under any correct implementation of the no-regress rule pinned elsewhere in this same commit range.

Yet the final assertion at line 187 requires `finalEntry.progress.progressEventCount).toBe(2)`, which is only satisfiable if the registry counts two `run.progress` events — impossible unless the implementation special-cases progress-event counting to bypass no-regress (which nothing in `data-model.md`, `ingest.test.ts`, or this file's own comments documents), thereby reintroducing exactly the correctness bug FR-042/no-regress exists to prevent (double-counting/over-counting a stale-delivered event). As written, this RED test is unsatisfiable by an implementation that also satisfies `ingest.test.ts`'s no-regress contract — a fix would either break the no-regress test suite or ship progress-counting that silently applies stale/late events. The correct expectation is `progressEventCount: 0` for this delivery sequence (only `started` and `completed` are ever legitimately accepted).

### AUDIT-20260717-05 — Command idempotence test encodes rejection, not harmless replay

Finding-ID: AUDIT-20260717-05
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/command-idempotence.test.ts:31-99

The file states that re-delivering an already-applied command is “harmless” and produces “no error” at lines 6-8, but every executable assertion encodes the opposite: retries must throw (`nextCommandState(..., 'deliver')` / `'apply'`) at lines 40, 51-53, 75, and 96. A downstream implementation agent can satisfy this test by making replay an error path, which is not the same as idempotent at-least-once delivery.

Blast radius is high because command replay on reconnect is a normal protocol path. If the built behavior treats replay as an error rather than returning/observing the existing terminal state without reapplying effects, operators can see false command failures under ordinary retry conditions. The test should assert a replay handler or command-application seam returns the existing terminal state without throwing and without repeating side effects.

### AUDIT-20260717-06 — Credential import-graph guard only scans one direct source file

Finding-ID: AUDIT-20260717-06
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=reachable, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/no-creds-in-cli.test.ts:46-70

The T110 test claims to prove the token-custody module is not on the CLI emit path’s import graph, but the executable guard only reads `src/telemetry/emit.ts` and regex-checks that one file for direct imports/references. It would pass if `emit.ts` imports `./client-auth.js`, `./spawn.js`, or any other helper that imports `src/machine-state/token.ts`, even though the credential module would still be loaded into the CLI process transitively.

Blast radius is high because this is the credential-custody boundary: moving token access one hop away would satisfy the test while violating “credentials live in the sidecar only.” The fix should walk the static module graph from `src/telemetry/emit.ts` or run an instrumented import/load check and fail if any reachable module resolves to `src/machine-state/token.ts`.

### AUDIT-20260717-07 — installationSequence high-water mark has a read-modify-write race across concurrent CLI invocations

Finding-ID: AUDIT-20260717-07
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/cli.ts (telemetry-emit block, `const installationSequence = advanceHighWaterMark(location, readHighWaterMark(location) + 1)`) + src/machine-state/highwater.ts (`advanceHighWaterMark`)

`src/cli.ts` computes the next `installationSequence` as `readHighWaterMark(location) + 1` and passes it to `advanceHighWaterMark`. This is a classic TOCTOU (read-then-write) pattern with no cross-process lock anywhere in `locate.ts`/`highwater.ts` (only `mkdirSync`/`chmodSync` for directories — no `flock`, no lockfile, no compare-and-swap on the durable file itself beyond `advanceHighWaterMark`'s own monotonic check).

Trace the race: process A and process B both call `readHighWaterMark` and see mark `5`, both compute target `6`. A calls `advanceHighWaterMark(location, 6)`: current on disk is `5`, `6 < 5` is false, so it writes `6` and returns `6`. B then calls `advanceHighWaterMark(location, 6)`: current on disk is now `6` (A's write already landed), and the guard is `if (target < current) throw` — `6 < 6` is false, so B's call is treated as the documented "legitimate no-op (idempotent re-advance to the same point)" (see the doc comment on `advanceHighWaterMark`), writes `6` again, and returns `6`. Both invocations now emit an `invocation.completed` event with `installationSequence: 6` for two distinct `invocationId`s.

Since `installationSequence` is FR-039's single per-installation counter that's supposed to "interleave every concurrent invocation... into ONE counter" and is the sole input to gap classification (`src/fleet/sequence.ts`'s `classifyGap`/`highWaterMark`), a duplicate value directly corrupts the diagnostic this feature exists to provide — two genuinely different events now collide on the value gap-detection uses to distinguish "in-flight" from "lost" from "never-sent." This isn't a hypothetical: the CLI dispatcher wires telemetry into *every* `stackctl` invocation (T044), and this project's own execution model dispatches many `stackctl` subcommands in parallel (task-level parallel subagent dispatch in `/stack-control:execute`), so concurrent same-installation CLI invocations are an expected, common runtime shape, not an edge case. A fix needs either a real file lock (e.g. `flock`/an exclusive-create lockfile) around the read-modify-write, or an atomic increment primitive (e.g. `open(O_CREAT|O_EXCL)` retry loop, or an OS-level advisory lock) instead of two separate `readHighWaterMark`/`advanceHighWaterMark` calls.

### AUDIT-20260717-08 — Handler failure skips telemetry emission entirely and leaks the emit-client socket

Finding-ID: AUDIT-20260717-08
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/cli.ts, `main()` — `await handler(args);` is not wrapped in try/finally around the telemetry-emit block that follows it

In `main()`, the sequence is:
```
await handler(args);
// Emit invocation.completed event (best-effort, never blocks/throws).
if (emitClient !== undefined) { try { ... emitClient.emit(event); } catch {...} finally { emitClient.close(); } }
```
If `handler(args)` throws — and the file's own tail (`main().catch((err: unknown) => {`) proves this is an expected, handled path for CLI usage errors and internal exceptions — execution never reaches the telemetry block. Two consequences: (1) FR-012 ("every invocation emits an invocation.completed event") is violated for every failing invocation — precisely the invocations an operator/fleet-monitoring surface would most want visibility into; (2) `emitClient` (holding an open local-socket connection per `createEmitClient`) is never `.close()`d on this path, leaking the connection/resource until process exit.

The fix is to wrap `await handler(args)` and the emit block in a single try/finally (or try/catch/finally) so the invocation.completed event — ideally carrying a success/failure signal — fires and the socket is closed regardless of whether the handler threw. As written, the "fail-open, never blocks" telemetry design accidentally became "fails silently and telemetry disappears exactly when it's most needed."

### AUDIT-20260717-09 — Command expiry is never plumbed through the HTTP command-issue API — held commands can never expire, only grow unbounded

Finding-ID: AUDIT-20260717-09
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/http/api.ts (`issueCommand`, `issueFleetCommand` — both hardcode `expiresAt: null`); src/plane/commands/store.ts (`AcceptCommandInput`/`CommandRecord` have no `expiresAt` field); src/plane/commands/dispatch.ts (`HeldCommand.expiresAt` / `isExpired` — fully implemented but never fed a real value from this path)

`contracts/sidecar-plane-protocol.md` § C7 promises a command is "held until delivered-and-acknowledged, expired, or superseded." `dispatch.ts`'s `isExpired`/`replayOnReconnect` correctly implement the expiry check when given a real `expiresAt`. But the only two callers that create `HeldCommand`s in this diff — `issueCommand` and `issueFleetCommand` in `src/plane/http/api.ts` — both construct the held record with `expiresAt: null` unconditionally, and neither `AcceptCommandInput` (store.ts) nor `CommandRecord` (store.ts) carries an `expiresAt` field at all for the caller to even supply one. `null` means "never expires" per `isExpired`'s own semantics (`if (expiresAt === null) return false;`).

The practical consequence: every command issued through the plane's operator-facing HTTP surface can only leave the `held` map via `acknowledge()` reaching a terminal state. If a sidecar goes permanently dark before ever acknowledging a command (the exact "fleet says nothing, honestly" scenario this feature is built around — FR-025/026), that command sits in the in-memory `held` Map forever — it can never transition to `expired`, contradicting the C7 promise and causing unbounded memory growth in a long-running plane process (the intended deployment shape, per `plane serve`'s "stays alive... until stopped"). A fix needs `AcceptCommandInput`/`issueCommand`/`issueFleetCommand` to accept and thread through a real TTL/expiry, not silently drop the field the dispatch layer already knows how to honor.

### AUDIT-20260717-10 — Fleet-wide commands overwrite all but one accepted target

Finding-ID: AUDIT-20260717-10
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/commands/dispatch.ts:113-130; src/plane/http/api.ts:370-385

`issueFleetCommand()` accepts one durable command, then calls `dispatch.hold()` once per reachable target using the same `commandId` for every target. But `createCommandDispatch()` stores holds in `const held = new Map<string, HeldCommand>()` and writes them with `held.set(command.commandId, command)`, so each target overwrites the previous target's hold. The response can report `accepted: ['inst-a', 'inst-c']`, but only the last accepted target remains replayable.

Blast radius is high because this directly breaks FR-062/C7 delivery semantics: an operator sees multiple targets accepted, while all but one silently never receive the command on reconnect. A reasonable fix is to key held delivery state by `(commandId, installationId)` or to store a per-command collection of target holds, and add a test that calls `issueFleetCommand()` with two reachable targets then asserts `replayOnReconnect()` returns the command for each target independently.

### AUDIT-20260717-11 — Ingest trusts wire-provided event classification instead of enforcing the catalog

Finding-ID: AUDIT-20260717-11
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/fleet/event.ts:216-219; src/plane/http/ingest.ts:178-184,203-204

`validateEnvelope()` only checks that `classification` is one of `live-only | aggregated | durable`; it does not verify that the classification matches `classifyEvent(type)`. `ingestEvent()` then converts the accepted telemetry into a `ClassifiedEvent` by copying `envelope.classification` verbatim. That means a sidecar can send `type: 'run.started'` with `classification: 'live-only'`, and the plane accepts a lifecycle event whose storage-cost class contradicts the event catalog.

Blast radius is high because FR-015 makes classification load-bearing: it decides durable-object cost and history retention. A malformed or buggy sidecar can downgrade durable lifecycle events into non-durable classes without failing loud. A reasonable fix is to enforce `envelope.classification === classifyEvent(envelope.type)` at the ingest boundary, rejecting unknown or mismatched types, with a regression test for a durable run lifecycle event mislabeled as `live-only`.

### AUDIT-20260717-12 — Spool-redaction test bypasses the pipeline it claims to verify

Finding-ID: AUDIT-20260717-12
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/spool-redacted.test.ts:61-117, tests/fleet/spool-redacted.test.ts:140-168

The test title and header claim an integrated guarantee: sensitive event content is redacted before the sidecar pipeline writes to the WAL. But the actual pipeline path exercised at lines 61-78 sends only identity/type/classification, then lines 98-117 explicitly verify the current spooled snapshot is `{}`. The sensitive case starts at line 140 by calling `redactEvent` directly, and lines 166-168 append that already-redacted payload directly to `openWal`, bypassing `createPipeline` entirely.

That means the test can pass even if the sidecar pipeline spools raw snapshot fields before redaction, because no sensitive snapshot ever crosses the pipeline boundary in this test. The blast radius is high: this is a safety contract for on-disk secret exposure, and a downstream implementer could treat this green test as proof that SC-013 is covered. A reasonable repair is to make the sensitive snapshot travel through the same public pipeline or daemon ingestion path that production uses, then assert the WAL bytes after that path returns.

### AUDIT-20260717-13 — History/timings endpoints permanently non-functional — fully-built archival read path never wired into the runtime

Finding-ID: AUDIT-20260717-13
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/plane/runtime.ts:275-289 (runHistory/runTimings handlers) vs. src/plane/http/history-api.ts (entire file, unused)

`src/plane/http/history-api.ts` (T101) is a complete, carefully-validated implementation of `runHistory`/`runTimings` that reads a run's archived summary through an injected `CdnReader`. But `src/plane/runtime.ts` (T124) — the module that actually assembles and serves the running plane — never imports `history-api.ts`, `cdn-reader.ts`, or `storage/b2.ts` at all. Its `runHistory` handler is hardcoded:

```js
runHistory: (ctx) => {
  // ... until it is wired here, this endpoint honestly
  // reports "no archived history yet" rather than fabricating one.
  respondJson(ctx.res, 200, { found: false, runId: ctx.params.runId });
},
runTimings: (ctx) => {
  respondJson(ctx.res, 200, {
    runId: ctx.params.runId,
    phases: { design: undefined, spec: undefined, execution: undefined, governance: undefined },
  });
},
```

`PlaneRuntimeOptions` (runtime.ts:57-73) exposes no seam for injecting a `CdnReader`/`ObjectStorePort`, so no other file in this chunk can wire it in either — this is a structural gap, not a missing call site. The comment's own phrasing ("until it is wired here") is exactly the "just for now" pattern `.claude/rules/agent-discipline.md` names as forbidden: a placeholder shipped without a tracked, verified disposition inside this diff. The consequence: the C7 `GET /v1/runs/{runId}/history` and `/timings` routes are dead on arrival in the actual running plane regardless of what the archive contains, and the entire b2.ts/cdn-reader.ts/history-api.ts subsystem this same commit range built is orphaned code from the runtime's perspective. A fix wires `createB2Store` + `createCdnReader` + `history-api.ts`'s functions into `createPlaneRuntime`, with an injectable `CdnReader` option so tests aren't forced onto real B2 credentials.

### AUDIT-20260717-14 — Plane's live fleet state is unbounded, in-memory-only, and unrecoverable across a restart

Finding-ID: AUDIT-20260717-14
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/runtime.ts:180 (`const events: ClassifiedEvent[] = [];`), src/plane/http/ingest.ts:117-131 (`seenEventIds`/`runs`)

`createPlaneRuntime` holds the entire ingested-event history in a single in-process array, `const events: ClassifiedEvent[] = [];` (runtime.ts:180), with no eviction, no capacity bound, and no persistence. Every fleet-facing read — `fleetSnapshot`, `runDetail`, `issueFleetCommand`'s reachable-installation computation, and the `fleetStream` SSE handler's periodic 15s tick — calls `buildRegistry(events)`, which folds the *entire* array from scratch each time. Two consequences follow directly from this design:

1. **Unbounded growth.** For a long-running plane process ingesting continuous telemetry (progress ticks, heartbeats, etc.), memory and per-request CPU cost both grow monotonically with total telemetry volume ingested since process start — there is no cap analogous to the sidecar's own spool-size cap + drop policy (`src/sidecar/spool/drain.ts`'s FR-017 discipline), even though this feature elsewhere treats bounded resource usage as a first-class concern.
2. **Total loss of fleet visibility on any plane restart.** Because `events` is never durably persisted (the only durable write path, `createFileDurableEventStore`, only fires for the narrow already-finalized "late event" case — runtime.ts:200-210), a plane process restart (deploy, crash, supervisor bounce) wipes the entire live registry: every run's status, progress, and timing data. Nothing rehydrates it on boot, and the ingesting sidecars will not naturally replay already-accepted (200'd) events, since their WAL drain cursor already advanced past them (`src/sidecar/daemon.ts`'s `drainTick`). The feature's stated purpose — durable operational visibility into a fleet — does not survive the plane's own restart.

`ingest.ts`'s `seenEventIds: Set<string>` and `runs: Map<string, RunIngestState>` (ingest.ts:117-131) have the identical unbounded-growth property for the same reason. A fix needs either a bounded/windowed in-memory registry with periodic archival-then-eviction, or persistence of the live event log (e.g., replaying from the durable store on boot) — both currently absent.

### AUDIT-20260717-15 — Runtime history endpoints never call the implemented CDN-backed reader

Finding-ID: AUDIT-20260717-15
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/plane/runtime.ts:332-343

`history-api.ts` implements `runHistory()` / `runTimings()` through `CdnReader`, but the runnable plane never wires those functions. The runtime handlers always return `{ found: false }` and all phase durations as `undefined`, regardless of whether `runs/{installationId}/{runId}/summary.json` exists.

This breaks the feature’s stated C7/US5 behavior in the shipped server path, not just a helper path. Blast radius is blocking because an adopter using `plane serve` can never retrieve archived run history or real timings. A reasonable fix is to make `PlaneRuntimeOptions` accept a `CdnReader` or archive-read dependency, derive the run’s installation id, and call the implemented `runHistory` / `runTimings` functions from these handlers.

### AUDIT-20260717-16 — Run-scoped commands are held for the caller token, not the run owner

Finding-ID: AUDIT-20260717-16
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/runtime.ts:345-355

`POST /v1/runs/:runId/commands` uses `requireAuthedInstallation(ctx.req)` as the command’s `installationId`. But `issueCommand()` stores that `installationId` into the held command, and `CommandDispatch.replayOnReconnect()` only delivers commands whose `command.installationId` matches the connecting sidecar. For a fleet plane, the command target must be the installation that owns `runId`, not whichever installation id the bearer token maps to.

The blast radius is high: commands against another installation’s run are durably accepted and then replayed to the wrong sidecar, or to no sidecar. The handler should resolve the target run from `buildRegistry(events)` first, reject unknown runs, and pass `entry.installationId` into `issueCommand()`.

### AUDIT-20260717-17 — Production sidecar consumes command frames without delivering or acknowledging them

Finding-ID: AUDIT-20260717-17
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/sidecar/daemon.ts:284-295

The sidecar’s SSE command handler only calls optional `options.onCommand?.(JSON.parse(e.data))`. In the production default path, no handler is required, so command frames are parsed and then dropped. The same file also states that `register-run` / local command delivery is a “not-yet-wired concern” at `src/sidecar/daemon.ts:183-185`, which means the runnable daemon has no built-in route from plane command to local run and no acknowledgement path back to the command lifecycle.

The blast radius is high: the plane can report a command as accepted and hold it for replay, the sidecar can receive it, but an operator-visible pause/cancel/reconcile never reaches the target run in the default daemon. The daemon needs a concrete local delivery mechanism or should fail command consumption loudly until that dependency is supplied, rather than making command delivery optional in the production path.

### AUDIT-20260717-18 — Placeholder test asserts nothing about the claimed behavior — deferral phrase left in test body

Finding-ID: AUDIT-20260717-18 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    tests/fleet/supersession.test.ts:100-109

The test titled `'a resume does NOT supersede a pause when the pause is already applied (terminal)'` (lines 100-109) does not exercise the behavior its title claims. Its body constructs a `pause` and a `resume` command, then — instead of asserting anything about applied-state supersession — runs `expect(typeof supersedes).toBe('function')` (line 108), which is true regardless of whether the "already applied" boundary is implemented correctly, implemented incorrectly, or not implemented at all. The comment directly above it (lines 106-107) says *"This assumes the Command type can express applied state... Placeholder here."* — an explicit deferral, which the audit instructions call out as a hard-constraint violation to surface when found in the diff.

This matters because the data-model.md § Supersession contract (cited at the top of the file, FR-057) explicitly scopes pause/resume supersession to "while un-applied" — the applied-boundary is part of the load-bearing contract, not an edge case. The `makeCommand` helper (line 28) even declares an `opts.state` parameter that is never read or used anywhere in the file, confirming the "applied" dimension was planned but never wired into either the fixture or any real assertion. A reader (human or an unattended agent building on this suite) sees a green, on-topic-titled test and would reasonably conclude the applied/terminal boundary is verified; it is not. If `supersedes()` incorrectly lets a `resume` supersede an already-applied `pause`, this suite will not catch it. Fix: either give `Command`/`makeCommand` a way to express "applied" state and assert `supersedes(appliedPause, resume) === false`, or remove the test and file a tracked gap instead of shipping a no-op assertion under a contract-sounding title.

## 2026-07-18 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260718-01 — tests/fleet/structured-error.test.ts — test titled "rejects extra fields" performs no rejection or stripping assertion at all

Finding-ID: AUDIT-20260718-01 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    tests/fleet/structured-error.test.ts:178-192 (test "rejects extra fields that are not part of the bounded shape")

```js
it('rejects extra fields that are not part of the bounded shape', () => {
  const literal = wellFormedError() as Record<string, unknown>;
  literal.details = { nested: 'error info' };
  const error = validateStructuredError(literal);
  const _: StructuredError = error;
  expect(_ satisfies StructuredError).toBeDefined();
});
```
The test's own comment says "The validator should accept it (objects can have extra keys), but the returned type should not carry the details field" — yet the test asserts neither. It doesn't call `.toThrow()` (so it isn't actually testing rejection despite the title), and it doesn't assert `expect(error).not.toHaveProperty('details')` or inspect the serialized/returned object for a leaked `details` key (the pattern already used correctly elsewhere in this same audit chunk, e.g. `tests/fleet/token-not-on-socket.test.ts`'s repeated `expect(parsed).not.toHaveProperty('token')` checks). `const _: StructuredError = error` also provides no compile-time protection: `error`'s static type is already `StructuredError` (the function's declared return type), so assigning it to another `StructuredError`-typed variable cannot catch excess runtime properties — TypeScript's excess-property check only fires on fresh object literals, not on values flowing through a function call. `expect(_ satisfies StructuredError).toBeDefined()` at runtime just checks the object is truthy.

The file's header comment states this test exists to pin FR-046's bounded-shape contract ("details fetched on demand, never carried in the fleet payload"). As written, this test provides zero runtime protection against `validateStructuredError` silently passing through a `details` field into the fleet payload — the exact regression FR-046 exists to prevent. A reviewer or CI dashboard seeing this test pass would reasonably (but wrongly) conclude the bounded-shape/no-leaked-details guarantee is verified. Fix: add `expect(Object.prototype.hasOwnProperty.call(error, 'details')).toBe(false)` (or equivalent) so the test actually exercises the claim in its title.

### AUDIT-20260718-02 — Terminal SSE retry behavior is not exercised by the “no retry” tests

Finding-ID: AUDIT-20260718-02
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/sse-terminal.test.ts:60-90

The “end-to-end” 401 test never invokes the SSE client or reconnect loop. It constructs a fake transport, manually calls `transport.connect()` once at line 80, manually classifies the response at line 83, and then asserts `connectCallCount` is still `1` at line 89. That result is guaranteed by the test body itself, even if the real client retries terminal 401/403 responses forever.

Blast radius is high because terminal auth failures are explicitly non-retryable; a sidecar that retries revoked credentials can create noisy loops and mask the operator-facing terminal state. The test should drive the production `runSseClient` or reconnect driver against a fake transport returning 401/wrong content type, then assert no second `connect()` occurs and the terminal close path is reported.

### AUDIT-20260718-03 — Last-Event-ID reconnect wiring is only tested as manual helper composition

Finding-ID: AUDIT-20260718-03
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/sse-last-event-id.test.ts:112-228

The tests under “Reconnect with SSE transport” manually call `buffer.observe(...)`, manually call `buildReconnectHeaders(...)`, and manually pass those headers to `transport.connect()` at lines 131-137 and 203-227. That proves the helper can be composed by test code, but it does not prove the production reconnect path observes decoded event IDs, preserves the buffer across stream closures, or sends `Last-Event-ID` on the next real connection.

Blast radius is high because this is the cursor contract for reconnect. A client that parses events correctly and has a valid helper, but never wires the helper into reconnect attempts, would still pass these tests while replaying from the wrong point after every disconnect. A stronger test should run the actual client/reconnect loop through two connections: first receive an event with `id`, then force a stream end, then assert the next captured connect request includes `Last-Event-ID` as a header and not in the URL.

### AUDIT-20260718-04 — Fleet-stream SSE tick can crash the entire plane process on any unexpected event

Finding-ID: AUDIT-20260718-04
Status:     open
Severity:   blocking
Per-lane:   claude=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/plane/runtime.ts — `fleetStreamHandler`'s `scheduler.setInterval(() => { const next = buildRegistry(events).entries(); ... }, KEEPALIVE_INTERVAL_MS)` (the fleet-stream SSE handler, mounted at `GET /v1/fleet/stream`)

`fleetStreamHandler` arms a bare, synchronous `setInterval` callback that calls `buildRegistry(events).entries()` on every tick, for every connected consumer, with **no try/catch**. `buildRegistry` → `applyRunEvent`/`newRunAccumulator` → `requireRunStatus` throws a hard `Error` for any run-scoped event whose `type` is not one of the five literal keys in `RUN_LIFECYCLE_STATUS` (`registry.ts`). `registry.ts`'s own header asserts "these are the ONLY event types that carry a non-null runId… every one maps" — but that invariant is enforced nowhere in this diff; it depends entirely on `classification.ts` (not in this chunk) never introducing a new run-scoped event type, and on no malformed/unexpected data ever slipping past `ingestEvent`'s validation. Any exception thrown inside a bare `setInterval` callback is an **uncaught exception** in Node — by default this terminates the process. Because `events` accumulates forever (see finding -04) and is shared across every route including this interval, a single anomalous event anywhere in that array poisons every subsequent tick for every connected client, at which point the entire plane (all consumer routes, all sidecar routes, everything) goes down — not merely the request that surfaced the bad data. The router's own `try/catch` in `server.ts`'s `dispatch()` does not protect this: `fleetStreamHandler` returns synchronously after registering the interval, so the try/catch has long since exited by the time the interval fires. A fix should wrap the interval body in try/catch and log-and-skip-this-tick (or close the connection) rather than letting the exception propagate to the event loop.

### AUDIT-20260718-05 — Sidecar drain loop permanently head-of-line-blocks on a single rejected record; FR-017's drop policy is implemented but never wired into it

Finding-ID: AUDIT-20260718-05 (claude-02 + codex-03 + codex-04; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/sidecar/daemon.ts — the `drainTick` closure inside `runSidecarDaemon` (loops `drainWal.replay()` records, `break`s on the first non-2xx `/v1/ingest` response); src/sidecar/spool/drain.ts — `drainOnce`/`selectDropVictims` (implemented, but not imported by daemon.ts — only `BackoffSchedule` is imported from `./spool/drain.js`)

`drainTick` replays the whole WAL, skips anything `<= drainCursor`, and for each remaining record POSTs to `/v1/ingest`; on the first non-2xx response it sets `failed = true` and **`break`s**, without advancing `drainCursor` past that record. Because the very next tick replays the same WAL from the same `drainCursor`, it will hit the identical un-transmittable record first and break again — forever. Any record the plane permanently rejects (a genuinely malformed payload, or the classification-downgrade guard added in `ingest.ts` at AUDIT-20260717-11, which throws → 400 on a mismatch that would recur identically on every retry since the payload is byte-identical replay) becomes a poison pill: every event spooled *after* it in the WAL is never transmitted, indefinitely, with no operator-visible signal beyond a swallowed `onError` call. This is a distinct and unaddressed head-of-line hazard from the one this codebase already guards against (SSE-vs-POST connection pooling, `no-head-of-line.test.ts`). Compounding this: `spool/drain.ts` already implements exactly the FR-017-mandated remedy — a named drop policy (`selectDropVictims`, `drainOnce`) for exactly this "the spool has something it can't durably keep transmitting" scenario — but `daemon.ts`'s real drain loop never calls either; it hand-rolls a simpler loop with no drop/skip path at all. The live system therefore has no actual defined-drop-policy enforcement despite the primitive existing and being tested. A fix needs the drain loop to distinguish "transient" failures (network error, 5xx — worth backing off and retrying the same record) from "permanent" ones (4xx from the ingest boundary) and either skip-and-advance past a permanently-rejected record (recording it, per FR-017's discipline) or otherwise unblock the records behind it.

### AUDIT-20260718-06 — Accepted telemetry event is ACKed to the sidecar before it is durably logged on the plane

Finding-ID: AUDIT-20260718-06
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/runtime.ts — `ingestHandler`: `events.push(outcome.event); eventLog.append(outcome.event);` immediately followed by `respondJson(ctx.res, 200, outcome)`

`eventLog.append(outcome.event)` is called with **no `await`, no `void` prefix, and no `.catch()`** — the only such call site in this file; every other genuinely-fire-and-forget call elsewhere in this feature (`void ingestFrame(...).catch(...)` and `void poster.post(...).catch(...)` in `daemon.ts`) is explicitly marked `void` with an attached `.catch()`, which is the codebase's own established convention for "I intend not to await this." The bare, unmarked call here reads as an accidental missing `await`. Given every other durable-write primitive in this feature (`spool/wal.ts`'s `append`, `plane/commands/store.ts`) explicitly documents "fsync BEFORE the promise resolves" as the load-bearing durability contract, and the module header for `runtime.ts` states the accepted-event log exists precisely so "fleet visibility survives a bounce," failing to await `eventLog.append` before responding `200` means: if the plane process crashes between sending the 200 and the (possibly still in-flight, possibly async) append completing, the sidecar has already treated the event as delivered (it will advance past it on its own drain cursor and never resend it — see the drain loop in finding -02), while the plane's own durable event log never recorded it. That is a permanent, silent loss of exactly the "durable" telemetry class this whole subsystem exists to protect (FR-066/FR-049's byte-identity/replay guarantees are moot if the plane never durably received the write in the first place). Fix: `await eventLog.append(outcome.event)` before responding 200, or explicitly document (and verify) that `EventLog.append` is synchronous under the hood so ordering is preserved regardless.

### AUDIT-20260718-07 — `invocationSequence` is not durably recovered across a sidecar restart, silently breaking the no-regress guarantee for an invocation spanning a bounce

Finding-ID: AUDIT-20260718-07 (claude-04 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/sidecar/pipeline.ts — `invocationSequences = new Map<string, number>()` (fresh, empty on every `createPipeline` call) vs. `ensureInstallationSequenceRecovered`/`nextInstallationSequence` (durably recovered from `wal.replay()`)

The module's own header explains, correctly, that `installationSequence` is recovered on pipeline construction by replaying the WAL and taking `max(sequence) + 1` — durable across restart by design. `invocationSequence`, by contrast, is tracked purely in the in-process `invocationSequences` map, seeded empty on every `createPipeline(walDir)` call, with **no equivalent recovery step** from the WAL's already-spooled records (which do carry the prior `invocationSequence` values inside their JSON payload). If the sidecar restarts mid-invocation — a normal occurrence given this feature's own idle-exit design (`lifecycle.ts`, `DEFAULT_IDLE_EXIT_MS`) and the bind-wins re-election model for a crashed sidecar — any further events for that SAME `invocationId` will have their `invocationSequence` numbering restart at 1, colliding with (or, more precisely, falling below) sequence numbers already applied on the plane side for events emitted before the restart. Since `registry.ts`'s `applyRunEvent` no-regress guard advances state only on a **strictly-newer** `invocationSequence`, and `ingest.ts`'s own no-regress guard behaves identically, every post-restart event for that invocation will be silently classified `stale` and dropped from live state — the plane will appear to simply stop hearing from that run after the bounce, with the sidecar believing it successfully transmitted (200 OK from `/v1/ingest`, since `ingestEvent` treats `stale` as a legitimate non-error outcome). This directly undermines FR-040's domain-ordering guarantee exactly at the failure mode (sidecar restart) this feature is built to be resilient to. Fix: recover the per-invocation high-water mark from the WAL the same way `installationSequence` is recovered (scan replayed records' payloads for the max `invocationSequence` per `invocationId`), not just the flat installation counter.

### AUDIT-20260718-08 — Commands accepted by the plane are not delivered by the production sidecar

Finding-ID: AUDIT-20260718-08
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/sidecar/daemon.ts:120-132, src/sidecar/daemon.ts:326-333

The runnable sidecar only delivers SSE commands when an injected `onCommand` test seam is provided. In the default production path, a received command is written to stderr as “undelivered” and is not routed to the local run. That means the plane can accept run/fleet commands and mark them as delivered over SSE, while the actual sidecar drops them before they affect the target invocation.

Blast radius is high because C6 is an operator-promise surface: an adopter issuing `pause`, `cancel`, or `config-push` through the newly runnable plane will see the control plane accept the command, but the sidecar has no default local-run delivery path. A reasonable fix would wire command frames into the local socket/run registration path, or refuse/mark command delivery as unavailable until a concrete run sink exists.

### AUDIT-20260718-09 — AUDIT-BARRAGE-claude-01

Finding-ID: AUDIT-20260718-09
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/telemetry/emit.ts — `FailOpenEmitClient.close()` / `destroySocket()`

`close()` sets state to `'closed'` and calls `destroySocket()`, which does `socket.removeAllListeners()` then `socket.destroy()` — with no call to `requeueUnconfirmed()`. `invocation-telemetry.ts` always calls `emitClient.emit(event)` immediately followed by `emitClient.close()` in the same synchronous tick (in a `finally` block). If the write to the peer hasn't yet been flushed past Node's internal buffering (e.g., a slow/backpressured sidecar, exactly the condition `_local-socket-peer.ts`'s `'stall'` mode was built to simulate), `destroy()` can discard it per Node stream semantics. Since this is typically the *only* event a short verb ever emits (`invocation.completed`), FR-012 ("every invocation emits") can be silently violated in a way the AUDIT-20260717-02 unconfirmed-requeue mechanism doesn't cover, because that mechanism only fires from `markUnavailable()`/`onClose()`, never from the deliberate `close()` shutdown path.

### AUDIT-20260718-10 — AUDIT-BARRAGE-claude-02

Finding-ID: AUDIT-20260718-10
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/storage/cdn-reader.ts — `createCdnReader().readObject()`

`readObject()` checks `cache.get(key)`, and only on a miss awaits `origin.getObject(key)` before calling `cache.set(key, result)`. There is no in-flight-request coalescing (no per-key promise dedup or lock), so N concurrent calls for the same not-yet-cached key each independently reach `origin.getObject`. The module's own header comment states its entire purpose is to keep "origin transactions FLAT as client traffic scales (SC-008)" because B2 read transactions are capped in production — concurrent cold reads of the same key directly amplify origin transactions with client traffic, the exact defect this module exists to prevent.

### AUDIT-20260718-11 — Requeued mismatch events never reconnect without another emit

Finding-ID: AUDIT-20260718-11
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/telemetry/emit.ts:275-344

On a protocol-version mismatch, `onData()` calls `markUnavailable()` after requeueing the unconfirmed events. `markUnavailable()` sets the state to `unavailable`, destroys the socket, and fires `onSocketUnavailable`, but it does not arm another connect attempt. The only reconnect trigger is inside `emit()` when state is `idle` or `unavailable` (`src/telemetry/emit.ts:191-197`). So buffered long-run events retained after a mismatch sit in memory until another telemetry event happens to arrive.

That is a correctness bug in the C3 restart path: a long-running command can emit its final event, hit a stale sidecar mismatch, and then never emit again, leaving the retained event undelivered for the rest of the process. The existing regression test only asserts `buffer.size` after mismatch, so it proves “not lost from memory” but not “drains to a compatible sidecar.” A reasonable fix is to explicitly schedule or trigger a reconnect after the incompatible socket is torn down, while preserving the non-blocking contract.

### AUDIT-20260718-12 — `sidecar run` ignores configured plane URL and leaves the daemon idle

Finding-ID: AUDIT-20260718-12
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/sidecar.ts:10-17, src/subcommands/sidecar.ts:80-86

`sidecar run` accepts only `--plane-url` and otherwise relies on `runSidecarDaemon` to read `STACKCTL_CP_URL`; the comment explicitly says config-file `plane.url` is a “KNOWN GAP” and would currently fail through the loader. The runtime call passes only `installationRoot` and the optional flag (`src/subcommands/sidecar.ts:83-86`), so an operator who configures the installation and runs `stackctl sidecar run` gets a local spooler with no uplink.

The blast radius is high because this is the front-door daemon command: the sidecar can appear elected and healthy locally while never connecting to the plane unless the operator supplied an env var or flag. The comment is also a process trap because it records an intentional missing production channel in code. The command should either honor the documented configuration source or reject this mode with an actionable error instead of starting an idle daemon when the plane URL is expected from config.

### AUDIT-20260718-13 — Pause lifecycle tests are placeholders, not contract checks

Finding-ID: AUDIT-20260718-13
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/pause-cooperative.test.ts:43-119

This suite says it proves requested-vs-applied observability, supersession, terminal applied behavior, and delivered-vs-received distinction, but the assertions only check a local string array or that `buildPauseCommand()` returns `{ kind: 'pause', commandId }`. Lines 85-96 are explicit placeholder language: the test “would assert” supersession, but “for now” only verifies the pause surface exists. Lines 98-119 similarly describe terminal and delivered/received behavior without asserting any transition or queryable state.

The blast radius is high because FR-059’s operator promise is exactly that “sent” is never reported as “applied.” With these tests green, an implementation could collapse `accepted`, `delivered`, `received`, and `applied` into one state and still pass most or all of this file. The fix should drive the real command state machine or command status API through those transitions and assert distinct observable states, including the received-but-not-applied pause and supersession behavior.

### AUDIT-20260718-14 — `redactEvent`'s path policy silently skips PII substring scrubbing for the most common case (absolute paths inside the installation)

Finding-ID: AUDIT-20260718-14
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/fleet/redact.ts — `redactPath` (and the `scrubSubstrings` doc comment directly above it)

The module's own doc comment for `scrubSubstrings` states it is "applied on top of the `path` policy's own absolute-path handling, since free text can embed a home-directory segment or username anywhere, not only as a leading path component." The implementation contradicts this claim. `redactPath` only calls `scrubSubstrings` in the early-return branch for values that are *not* absolute:

```js
function redactPath(value: string, context: RedactionContext): string | undefined {
  if (!isAbsolute(value)) {
    return scrubSubstrings(value, context);
  }
  const rel = pathRelative(context.installationRoot, value);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return undefined;
  }
  return rel;   // <-- returned WITHOUT scrubSubstrings
}
```

For an absolute path inside the installation root — the ordinary, expected shape for a `path`-policy field — the computed `rel` is returned verbatim, with zero substring scrubbing. If any path segment of `rel` (a directory or filename inside the installation, e.g. a project folder or file literally named after the operator's username, or a hostname baked into a build-output path) matches `context.username` / `context.hostname` / `context.homeDir`, that PII is emitted unredacted to the plane. This is exactly the leak PT-008's "deny-by-default field policy" (research.md, spec.md FR-047/048) exists to prevent, and it fails silently on the code path that will fire most often (the majority of path fields the sidecar redacts are absolute paths under the installation, not already-relative strings). A downstream consumer of this module (the sidecar pipeline) will ship this PII off-machine believing it went through the documented "scrub everywhere except branch" contract.

### AUDIT-20260718-15 — `reserveNextSequence`'s lock-acquisition can synchronously block a `stackctl` invocation for up to 10 seconds, contradicting the feature's own "fail-open, never blocks" telemetry invariant

Finding-ID: AUDIT-20260718-15
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/machine-state/highwater.ts — `acquireSequenceLock`, `sleepSyncMs`, `LOCK_ACQUIRE_TIMEOUT_MS`, `LOCK_POLL_MS`

`reserveNextSequence` acquires a cross-process lockfile via a synchronous poll loop: on contention it calls `sleepSyncMs(LOCK_POLL_MS)` (15ms, implemented with a genuinely blocking `Atomics.wait` on the main thread) repeatedly for up to `LOCK_ACQUIRE_TIMEOUT_MS` (10,000ms) before throwing. This is real, synchronous, single-threaded blocking of the whole `stackctl` process — not an async operation an outer `try/catch`/timeout can interrupt, since the block happens *inside* the synchronous call before it ever returns or throws.

`src/cli.ts`'s own change in this diff wraps every verb with `runInvocationWithTelemetry(handler, args)` under the explicit contract "emission never blocks, throws, or affects exit code/output." The `reserveNextSequence` doc comment claims the same: "a timeout drops one event rather than ever blocking or corrupting the invocation" — but a 10-second wait *is* blocking; the fail-open behavior only kicks in *after* up to 10 seconds have already elapsed. The same file's own header (AUDIT-20260717-07) states the motivating scenario is exactly this project's own execution model: "this project's own execution model dispatches many `stackctl` subcommands in parallel — so concurrent same-installation invocations are a common runtime shape, not an edge case." Under real parallel dispatch (e.g. this repo's own Workflow tool running up to 16 concurrent agents, each shelling out to `stackctl`), lock contention on this single per-installation lockfile could routinely stall multiple concurrent invocations for seconds at a time, directly violating the "never blocks" UX promise the telemetry wiring is supposed to guarantee.

### AUDIT-20260718-16 — `event-log.ts` has no fsync and fails loud on any corrupt trailing line, so a crash mid-append can permanently brick plane startup

Finding-ID: AUDIT-20260718-16
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/event-log.ts — `append`, `createEventLog`, `parseLine`

`append` writes with plain `appendFileSync(path, ...)` — no `fsyncSync` call, unlike the atomic durable-write pattern this same feature already established in `src/plane/commands/store.ts` (`persistRecord`: write-to-temp, fsync file, atomic rename, fsync directory). On boot, `createEventLog` reads the entire log and calls `parseLine` on every non-empty line; `parseLine` throws a hard error on any line that isn't valid JSON or is missing `envelope` — there is no skip-and-continue, no truncation recovery, no quarantine of a bad tail line.

If the plane process (or host) crashes mid-write to this log — a realistic event for a long-running server process — the last line can be left truncated. On the next boot, `createEventLog`'s replay hits that truncated line, `JSON.parse` throws, `parseLine` re-throws a descriptive error, and (absent any caller-side recovery not shown in this chunk) the plane fails to start at all. This turns a single transient crash into total, indefinite plane unavailability until an operator manually edits or truncates the log file by hand — a severe availability regression for a feature whose whole point is durable operational visibility into a fleet, and a sharp contrast with the crash-safe pattern the same author already wrote for `commands/store.ts` in this very feature.

### AUDIT-20260718-17 — Command status endpoint never observes lifecycle transitions

Finding-ID: AUDIT-20260718-17
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/plane/commands/store.ts:81-94; src/plane/commands/store.ts:260-294; src/plane/commands/dispatch.ts:177-190; src/plane/http/api.ts:332-334

`CommandStore` exposes only `accept`, `get`, and `list`; `accept()` persists every command with `state: 'accepted'`, and nothing in the store API can persist a later state. `CommandDispatch.acknowledge()` only mutates in-memory delivery bookkeeping, while `commandStatus()` returns `store.get(commandId)` verbatim, so `GET /v1/commands/{commandId}` keeps reporting `accepted` even after a sidecar acknowledges `applied`, `failed`, `expired`, or `superseded`.

Blast radius is high because C6’s operator promise is that the full command lifecycle is queryable and “sent” is never reported as “applied”; as written, the query surface is stuck at “sent.” The fix needs a durable state-transition operation in the command store, used when acknowledgements arrive, with `commandStatus()` reading the updated durable record.

### AUDIT-20260718-18 — One target’s terminal ack clears every fleet-wide target hold

Finding-ID: AUDIT-20260718-18
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/commands/dispatch.ts:177-189; src/plane/http/api.ts:380-388

Fleet-wide issue correctly creates one held command per accepted target, keyed by `(commandId, installationId)`. But `acknowledge(commandId, state)` has no target parameter, and on any terminal ack it sweeps every held entry whose `command.commandId` matches. That means the first reachable sidecar to acknowledge a fleet-wide command removes the pending holds for every other target, even if those sidecars never received or applied it.

Blast radius is high because this directly violates the non-atomic fan-out promise and makes per-instance state unobservable. A reasonable fix is to make acknowledgements target-scoped, for example `acknowledge(commandId, installationId, state)`, and delete only that target’s hold while preserving aggregate command status separately.

### AUDIT-20260718-19 — Production runtime never wires command acknowledgements

Finding-ID: AUDIT-20260718-19
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/runtime.ts:334-338; src/plane/runtime.ts:372-397; src/plane/http/stream.ts:155-193

The runtime issues commands and holds them for delivery, and the SSE stream reads `dispatch.replayOnReconnect()`, but the production wiring never calls `CommandDispatch.acknowledge()`. The sidecar stream handler is deliberately narrowed to replay-only access, and ingest accepts telemetry by appending accepted events to the event log without interpreting command lifecycle events or settling the dispatch buffer.

Blast radius is high because commands issued without `expiresAt` are held forever unless acknowledged, expired, or superseded; in this runtime, acknowledgement has no production path, so a command can be replayed on every reconnect after it was already handled. The runtime needs a command-ack ingestion path that updates dispatch state and the durable command record.

### AUDIT-20260718-20 — Fan-out command acknowledgment silently collapses ALL targets' holds, but the regression test's title claims the opposite of what it asserts

Finding-ID: AUDIT-20260718-20
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/fleet-command-replay.test.ts (second `it()` block, "a terminal ack on a fleet target does not resurrect it, and the other target still replays")

The test title says *"the other target still replays"*, but the assertions immediately below prove the opposite for **both** targets:

```js
dispatch.acknowledge(result.commandId, 'applied');
expect(dispatch.replayOnReconnect(targetA).some((h) => h.commandId === result.commandId)).toBe(false);
expect(dispatch.replayOnReconnect(targetB).some((h) => h.commandId === result.commandId)).toBe(false);
```

Both `targetA` and `targetB` return `false` — neither replays. The inline comment right above the call even says *"neither target replays a terminal command"*, directly contradicting the `it()` description. This isn't just a copy-paste naming slip: it reveals a real design gap that the sibling file's whole raison d'être (fixing AUDIT-20260717-10, "fleet-wide commands overwrite all but one accepted target") was supposed to close. `dispatch.acknowledge(commandId, state)` takes no `installationId` parameter (confirmed by its identical call shape in `command-blip.test.ts`), so it operates on the *commandId* only. For a fan-out command shared across N targets (same `commandId`, per-target holds keyed by `installationId+commandId` per the AUDIT-10 fix), a single target's acknowledgment terminates the hold for **every** target sharing that commandId — even targets that are still offline and have never received the command. That directly violates FR-062 ("fan-out is never atomic... per-instance state individually observable") and the C7 promise that a held, unexpired, unacknowledged command is replayed on that specific target's reconnect. Concretely: issue a fleet-wide `cancel` to targets A and B; A comes online first, receives it, and acks `applied`; B is still offline. B's hold silently vanishes — B never receives the cancel, and no error surfaces anywhere. Given this codebase's own framing that a silent no-op on `cancel` is "the worst failure in the design" (per `command-blip.test.ts`), this is a live correctness gap masquerading as a passing, correctly-named regression test. Fix: either scope `acknowledge` by `(commandId, installationId, state)`, or make the AUDIT-10 fix's independent per-target holds carry independent acknowledgment state, and correct this test's title/assertions to actually prove "the other target still replays" (i.e., acknowledging targetA's copy must NOT clear targetB's).

### AUDIT-20260718-21 — `observeCommandReplay`'s "illegal-transition guard is preserved" claim is asserted only in a comment, never verified against the actual function

Finding-ID: AUDIT-20260718-21
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/command-idempotence.test.ts:96-109 (last `it()` block, "at-least-once delivery survives command replay on reconnect")

The final test in this file closes with:

```js
// A genuinely illegal LIVE transition still throws (replay-harmless does
// not weaken the state machine's real protocol guard) — e.g. apply from
// 'accepted' skips delivered/received.
expect(() => nextCommandState('accepted', 'apply')).toThrow();
```

This assertion calls `nextCommandState`, not `observeCommandReplay` — the function this whole file is otherwise built to pin. Nowhere in `command-idempotence.test.ts` does any assertion call `observeCommandReplay('accepted', 'apply')` (or any other illegal, *non-terminal* transition) and check that it throws. Every other place `observeCommandReplay` is exercised is either (a) replay onto an already-terminal state (which is supposed to be swallowed/no-op per FR-054), or (b) a genuinely legal forward transition (`delivered→received→applied`). The boundary the comment claims is enforced — "illegal transitions still throw even under replay" — is asserted in prose but never in code against the actual seam. If `observeCommandReplay` were implemented as a blanket try/catch that swallows *any* error and returns the input state unchanged (a very natural over-generalization of "replay is harmless"), this entire test file would stay green while an actually-broken sidecar sending a malformed/out-of-order live command would be silently no-op'd instead of failing loud — exactly the kind of masked protocol bug this feature's "honesty under failure" theme (and this project's fail-loud discipline, Principle V) is designed to prevent. Fix: add `expect(() => observeCommandReplay('accepted', 'apply')).toThrow()` (and a couple of other illegal non-terminal cases) directly, so the claim in the comment is actually pinned against the function it describes.

### AUDIT-20260718-22 — Fleet ack wrongly settles every target

Finding-ID: AUDIT-20260718-22
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/fleet-command-replay.test.ts:81-107

The regression test says “the other target still replays” at line 81, but the assertions enforce the opposite: after `dispatch.acknowledge(result.commandId, 'applied')`, both `targetA` and `targetB` must stop replaying the command. That encodes a single command-level terminal ack as settling every per-target delivery hold.

This contradicts the same file’s stated contract at lines 12-16: fan-out delivery state is per-instance and each target must replay independently. If this ships as-written, one target applying a fleet-wide command can erase still-undelivered holds for other accepted targets, so operators are told those targets accepted the command but they never receive it. A reasonable correction is to make acknowledgements target-scoped, or otherwise model per-target command delivery state explicitly and assert that an ack from one target does not remove another target’s hold.

### AUDIT-20260718-23 — Expiry can become invisible state loss

Finding-ID: AUDIT-20260718-23
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/command-expiry-plumbing.test.ts:69-72; tests/fleet/command-expiry.test.ts:42-49

`command-expiry-plumbing.test.ts` claims the command becomes a “visible terminal 'expired'” at lines 69-70, but only asserts it is absent from replay at line 72. Separately, `command-expiry.test.ts` forbids `accepted -> expired` at lines 42-49, even though a TTL can expire while the command is still held and never delivered.

The blast radius is operator-visible: a command can pass `expiresAt` and simply stop replaying while its durable status remains `accepted`, which is exactly the silent loss FR-055 says expiry must avoid. The test should assert the durable/queryable command status transitions to `expired` for an expired held command, including the accepted-but-never-delivered case, rather than treating “not replayed” as sufficient.

### AUDIT-20260718-24 — Reconcile does not actually diff manifest contents

Finding-ID: AUDIT-20260718-24
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/manifest-reconcile.test.ts:125-137

The test states reconciliation is a backstop that “diffs stored objects against a manifest,” but the present-manifest case only verifies that any manifest object suppresses all orphan reporting. It seeds a manifest containing exactly the event keys and then asserts `orphanedEventKeys` is empty, but it never covers the more important partial-manifest case: event objects exist, a manifest exists, and the manifest omits some event keys.

That omission matters because a truncated or stale manifest is also a lie of omission. Acting on this surface as written lets reconciliation declare the run clean solely because `manifest-1.json` exists, even when listed event objects are absent from the manifest. A reasonable fix is to parse the manifest in the test fixture and assert listed event keys minus manifest event keys are reported as orphaned or otherwise discrepant.

## 2026-07-18 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260718-25 — command-vs-cursor.test.ts asserts FR-058 without ever exercising real implementation code

Finding-ID: AUDIT-20260718-25 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    tests/fleet/command-vs-cursor.test.ts:1-109

Every `it()` block in this file manipulates plain local variables (`let commandState: CommandState = 'delivered'`, `let cursorPosition: string = 'event-100'`) and asserts trivial facts about those local variables — it never calls into any real "cursor vs command state" implementation from `src/`. The only real import, `nextCommandState`, is invoked exactly once, inside a top-level guard clause (`if (typeof nextCommandState !== 'function') throw ...`) whose sole purpose is to force RED at module load if the module is missing — it is never called from inside any test body to prove the independence claim against actual code.

The file's own describe block claims to pin "command state vs cursor position are independent (T060, FR-058)" — a real, load-bearing contract about how the plane's ingest/dispatch layer must NOT infer command application from SSE stream cursor advancement. But nothing here touches `src/plane/http/ingest.ts`, `src/plane/commands/dispatch.ts`, or any SSE cursor-tracking code. A future regression that actually conflates `Last-Event-ID` with command application state in the real implementation would sail through this suite green, because the suite only proves that two independently-declared `let` variables in the test file itself don't alias each other — a tautology. This is exactly the "tests that don't test the contract they claim to test" anti-pattern the review checklist calls out, and it's a false-confidence generator for a genuinely important honesty invariant (FR-058) — a maintainer citing "T060 passes" as evidence the contract holds would be wrong. Fix: either delete this file (if FR-058 is meant to be covered by the real ingest/dispatch integration tests elsewhere in this chunk) or rewrite it to drive the actual cursor-tracking and command-status code paths with a real or realistic fake SSE/command flow.

### AUDIT-20260718-26 — A single malformed /v1/ingest request flips the shared uplink health status to "degraded"

Finding-ID: AUDIT-20260718-26
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/dogfood.test.ts:349-373 (Scenario 4b, "a severed uplink degrades the uplink hop")

The test sends one intentionally malformed POST to `/v1/ingest` (`{ not: 'a valid telemetry event' }`), gets back a `400`, then queries `/v1/health/store` and asserts `uplink.status === 'degraded'` with a non-empty `lastError`. The test's own comment frames this as proof that "a severed uplink degrades the uplink hop" — but what it actually demonstrates is that ordinary client-side input validation failures (a 400, which is the CORRECT and complete response to a bad request) also corrupt the plane's shared health-reporting surface. Nothing in the flow simulates an actual network partition or storage failure; a single caller sending garbage JSON is sufficient to make `/v1/health/store` report the installation's uplink as unhealthy to every subsequent caller of that endpoint.

This conflates two very different failure classes under one status field: "the uplink transport/infrastructure is broken" (the thing FR-074/C9 promises to honestly report) versus "some client sent a malformed payload" (routine, expected, already handled correctly by the 400 response). The operational blast radius: any misbehaving script, buggy retry, or malicious/careless caller can make the fleet's health dashboard cry wolf about uplink degradation, eroding trust in the exact honesty-under-failure signal this feature exists to provide (per US4 / SC-004-style guarantees elsewhere in this feature). The test doesn't assert the degraded status ever clears, so it's also unclear whether this is a sticky, unbounded false-positive. The health/uplink-degradation logic in `src/plane/health.ts` (not in this chunk) should be checked: a 400 rejected-at-the-boundary request must not be treated as evidence of uplink infrastructure failure; only failures downstream of successful schema validation (actual transport/storage errors) should move the health needle.

### AUDIT-20260718-27 — Command supersession contradicts the command state machine for `delivered`/`received` commands

Finding-ID: AUDIT-20260718-27
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/fleet/command.ts:83-107 (TRANSITIONS table) vs src/fleet/supersession.ts:39-108 (supersedes())

`src/fleet/supersession.ts`'s `supersedes()` treats any **non-terminal** existing command as eligible for supersession — the only guard is `isTerminalCommandState(existing.state)` (supersession.ts:44-46), and `accepted`, `delivered`, and `received` are all non-terminal per `command.ts`'s own `TRANSITIONS` table. This matches the stated spec (data-model.md § Supersession, quoted in the module header): "config-push: a newer revision supersedes an older un-applied one" — "un-applied" spans `accepted`, `delivered`, and `received`, not just `accepted`.

However, `command.ts`'s `TRANSITIONS` table (command.ts:83-107) only permits the `supersede` event from the `accepted` state:
```
accepted:  { deliver, reject, supersede, expire }
delivered: { receive, fail, expire }        // no supersede
received:  { apply }                         // no supersede
```
If a caller (per `src/plane/commands/store.ts`'s own contract at store.ts:73-76 — "the caller... validates legality via `nextCommandState` before calling") correctly determines via `supersedes()` that a `delivered` or `received` command should be superseded (e.g. a second `config-push` with a higher revision arrives while the first is in flight to the sidecar — an entirely ordinary race, not an edge case), and then calls `nextCommandState(existing.state, 'supersede')` to validate the transition before persisting it, that call throws `"illegal transition — event 'supersede' is not permitted from state 'delivered'"`. This is a genuine contradiction between two modules in the same commit that are supposed to agree on when supersession is legal. A fix should either add `supersede` transitions for `delivered`/`received` in `command.ts`'s table (to match the spec's "un-applied" scope), or narrow `supersedes()`'s guard to `existing.state === 'accepted'` if supersession really is meant to be accepted-only (in which case the FR-057/data-model.md language needs updating too, and the currently-undelivered commands would silently proceed to apply against stale config).

### AUDIT-20260718-28 — `src/plane/commands/dispatch.ts` is unreadable in this diff (shown as binary), hiding the exact logic that reconciles the supersession/transition mismatch

Finding-ID: AUDIT-20260718-28
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/plane/commands/dispatch.ts (entire file — diff renders as "Binary files /dev/null and b/src/plane/commands/dispatch.ts differ")

The diff for `src/plane/commands/dispatch.ts` — the file the ledger (T070) describes as "dispatch: hold/replay-on-reconnect, fanout non-atomic" and the file that is architecturally the one place `supersedes()` and `nextCommandState()` (see finding -01) would have to be reconciled — renders as a binary diff rather than text. This means this audit (and any cross-model sibling relying on the same diff payload) cannot verify: (a) whether the `delivered`/`received` supersede gap in finding -01 is actually hit at runtime, (b) whether dispatch.ts bypasses `nextCommandState` validation entirely for supersession (itself a discipline concern, since `store.ts`'s `transition()` explicitly relies on the caller doing that validation), or (c) any other correctness property of the command-dispatch hot path.

A TypeScript source file rendering as "binary" in a git diff is itself worth investigating independently of the supersession question — it usually indicates an embedded null byte, a stray control character, a BOM, or a mixed-encoding artifact in the file. Given the project's own gates report `tsc --noEmit` clean and the full test suite green (T132/T134 in the ledger), the file evidently parses and executes correctly, so this is most likely a tooling/diff-generation artifact rather than actual file corruption — but that can't be confirmed from the material provided, and either way it's a blind spot in this governance pass over exactly the surface most relevant to finding -01. Recommend re-running this audit chunk with dispatch.ts's actual text content included, and separately checking why git considers the file binary.

### AUDIT-20260718-29 — Command acknowledgements never reach or persist in the plane

Finding-ID: AUDIT-20260718-29
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/sidecar/daemon.ts:371-395; src/plane/runtime.ts:466-469; src/plane/commands/dispatch.ts:202-210

The sidecar consumes `event: command` frames and either calls `onCommand` or records the command as undelivered, but it never sends a received/applied/failed acknowledgement back to the plane. The runtime mounts only `/v1/ingest`, `/v1/sidecar/stream`, and `/v1/sidecar/liveness`, so there is also no sidecar-facing acknowledgement route. `CommandDispatch.acknowledge()` exists, but no production path calls it, and it only clears in-memory hold state without persisting `CommandStore.transition()`.

Blast radius is high: shipped as written, an operator can issue a command and see `accepted`, and the sidecar can receive it, but the plane cannot learn or durably report what happened next. Commands remain replayable across reconnects unless a test manually calls `acknowledge()`, and `GET /v1/commands/:id` stays stale except for expiry. A fix should add a real sidecar-to-plane command outcome path and have it validate transitions, call both dispatch acknowledgement and durable store transition, and cover restart visibility.

### AUDIT-20260718-30 — High-water reservations are not crash-durable

Finding-ID: AUDIT-20260718-30
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/machine-state/highwater.ts:229-233; src/machine-state/highwater.ts:390-403

`writeHighWaterMarkAtomic()` writes JSON with `writeFileSync()` and renames the temp file over the durable mark, but it never fsyncs the temp file or the containing directory. `reserveNextSequence()` then returns the reserved sequence after that non-fsynced write. A crash after the caller emits an event but before the filesystem commits the rename can roll the high-water mark back, allowing the restarted sidecar to reserve and emit a duplicate `installationSequence`.

Blast radius is high because this file is the single durability boundary for FR-039/R-02 sequencing. The comments promise the reserved value is persisted before return, but the implementation does not provide the same crash-safety discipline used in `commands/store.ts`. A fix should write through an fd, fsync it, rename, and fsync the durable directory before returning the reserved sequence.

### AUDIT-20260718-31 — The read-idle watchdog never closes the stalled connection — a "timed-out" SSE stream can resurrect and deliver duplicate events

Finding-ID: AUDIT-20260718-31
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/sidecar/uplink/sse-client.ts:243-260 (`startWatchdog`), :279-303 (`run`'s for-await loop)

`startWatchdog()`'s `setInterval` callback, on detecting `readIdleMs` elapsed, does:
```js
fired = true;
clearWatchdog();
opts.onReadIdleTimeout();
fireClosed('idle-timeout');
```
It never calls `connection?.close()`. Meanwhile the `for await (const chunk of conn.chunks)` loop in `run()` is still awaiting the next chunk from the transport and has no dependency on `fired` or `stopped` being set by the watchdog — it only checks `stopped` (set solely by the public `stop()` method). So when the watchdog fires, the underlying transport connection (e.g. the `fetch` request in `FetchSseTransport`) is left open. If the "dead" peer later resumes sending data (a slow-but-not-actually-dead link, or a proxy that buffers), the for-await loop wakes up, calls `rearm()` and `opts.onEvent(...)` for every subsequent frame — even though the caller was already told via `onReadIdleTimeout`/`onClosed('idle-timeout')` that this connection ended and, per the documented C4 reconnect contract, has presumably already started a fresh connection with backoff.

The consequence: two live connections deliver the same logical event stream, producing duplicate `onEvent` callbacks (duplicate telemetry ingested by the plane) and a leaked socket/fetch request that is never torn down — exactly the failure category Phase 8 US6 ("hostile-network uplink") exists to harden against. The fix is for the watchdog's fire handler to call `connection?.close()` (mirroring what `stop()` does) so the abandoned connection is actually torn down and its `for await` loop unwinds via the `AbortError`-swallowing catch already in place.

### AUDIT-20260718-32 — `armReconnect()` is only wired into one of four `markUnavailable()` call sites — the AUDIT-20260718-11 fix silently drops the final buffered event on 3 of 4 failure paths

Finding-ID: AUDIT-20260718-32
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/telemetry/emit.ts:227-233 (`beginConnect` catch), :246 (socket `'error'` handler), :383-390 (`writeRaw` catch), vs :302-309 (`onData`'s mismatch branch, correctly wired) and :319-332 (`onClose`)

`markUnavailable()` is called from four places: (1) `beginConnect()`'s synchronous `createConnection` catch, (2) the socket `'error'` listener, (3) `writeRaw()`'s catch, and (4) `onData()`'s version-mismatch branch. Only site (4) follows `markUnavailable()` with an explicit `this.armReconnect()` call (line 309, with a comment explicitly citing AUDIT-20260718-11's rationale: "otherwise they sit until another emit() arrives, which for a long-run command that already emitted its FINAL event is never"). Sites (1)-(3) rely on the subsequent socket `'close'` event to reach `onClose()`, which calls `armReconnect()` — but `onClose()` opens with:
```js
if (this.stateValue === 'closed' || this.stateValue === 'unavailable') { return; }
```
Since `markUnavailable()` already set `stateValue = 'unavailable'` synchronously before the socket's `'close'` event can fire (Node emits `'error'` strictly before `'close'`), `onClose()`'s guard always short-circuits for these three paths, so `armReconnect()` is never invoked.

Practical effect: for a `'long-run'` caller (`execute`/`govern`), if the sidecar connection fails via a connect error (sidecar not yet up), a mid-stream socket error, or a write error — rather than a version mismatch or a clean post-connect stream end — any event buffered at that moment is retained in `EventBuffer` but no background reconnect is armed. If no further `emit()` call happens (the exact "last event before `close()`" scenario the AUDIT-20260718-11 comment names as the motivating case), `close()` runs immediately afterward, `flushAndDestroySocket()` sees `this.socket === undefined` (already cleared by `destroySocket()`) and no-ops, and the buffered final event is silently dropped — precisely the defect AUDIT-20260718-11 claims to have fixed, just reachable via three of its four trigger paths. Per the round-0 self-red-team driver, this fix diff should be treated as a fresh surface: it resolved the one path it was tested against (mismatch) while leaving the more common paths (plain connect/write failure) unfixed. Fix: call `this.armReconnect()` at the end of `markUnavailable()` itself (once, guarded the same way it already avoids double-invocation), rather than only at call site (4).

### AUDIT-20260718-33 — Read-idle timeout leaves the stale SSE socket alive

Finding-ID: AUDIT-20260718-33
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/sidecar/uplink/sse-client.ts:222-237, src/sidecar/uplink/sse-client.ts:287-293

The watchdog fires `onReadIdleTimeout()` and `onClosed('idle-timeout')`, but it does not close the active `SseConnection`, mark the client stopped, or otherwise break the `for await (const chunk of conn.chunks)` loop. A stalled TCP/SSE connection can therefore remain open indefinitely after the reconnect driver has been told to establish a replacement. If bytes eventually arrive on the old stream, the loop can still call `opts.onEvent(...)` because `stopped` remains false.

Blast radius is high: under hostile-network behavior, one timed-out stream can leak sockets and continue delivering stale commands/events after a replacement connection exists. A reasonable correction is to close the current connection and prevent later event delivery when the idle timeout fires.

### AUDIT-20260718-34 — `sidecar run` ignores configured plane URL

Finding-ID: AUDIT-20260718-34
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/sidecar.ts:10-16, src/subcommands/sidecar.ts:80-84

The front door only passes `--plane-url` into `runSidecarDaemon`; otherwise the daemon falls back to `STACKCTL_CP_URL`. The file explicitly states config-file `plane.url` is not parsed, so an installation with a configured plane URL but no env var or flag cannot use the canonical `sidecar run` path.

Blast radius is high because this is operator-facing configuration: the feature already added plane settings to installation config, but the runnable sidecar path does not honor them. The correction should make config parsing and precedence executable, with `--plane-url` overriding env/config and env overriding config.

### AUDIT-20260718-35 — `plane serve` can authenticate only one installation token

Finding-ID: AUDIT-20260718-35
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/plane.ts:175-197

`plane serve` accepts a single `--token` and maps it to `mintOrReadInstallationId(process.cwd())` via `acceptedTokens: new Map([[token, installationId]])`. That means the runnable plane cannot accept distinct tokens for multiple installations. If every sidecar shares that one token, their auth resolves to the plane host’s installation ID; if each sidecar uses its own provisioned token, all but one are refused.

Blast radius is high because this breaks the “fleet” control plane at the authentication boundary. The runtime already accepts a token-to-installation map; the CLI should load that map from an operator-controlled registry instead of collapsing the served fleet to one token and one installation ID.

### AUDIT-20260718-36 — `isPermanentRejection` classifies auth failures (401/403) as permanent, causing irrecoverable telemetry loss

Finding-ID: AUDIT-20260718-36 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/sidecar/daemon.ts — `isPermanentRejection` (~line 165) and its use in `drainTick`

```ts
function isPermanentRejection(status: number): boolean {
  if (status < 400 || status >= 500) return false;
  if (status === 408 || status === 429) return false;
  return true;
}
```

`isPermanentRejection` classifies every 4xx status except 408/429 as permanent, and `drainTick` acts on that: for a permanent rejection it calls `recordDroppedRecord(...)` and advances `drainCursor` past the record, permanently discarding it from the WAL's replay set (`drainWal.replay()` will still return it on the next tick, but `record.sequence <= drainCursor` causes it to be skipped forever). This means a bearer-token auth failure — `401` (missing/unknown token) or `403`, per `src/plane/http/auth.ts`'s `AuthOutcome` reasons `'missing' | 'unknown' | 'revoked'` returned by the plane's `withAuth` guard (`src/plane/runtime.ts`) — is treated exactly like a genuinely-malformed, byte-identical-will-always-fail payload (the classification-downgrade guard in `src/plane/http/ingest.ts` is the documented motivating case for "permanent").

But an auth failure is not a fact about the payload — it's a fact about credentials. The module's own reasoning for permanence ("the payload replays byte-identical so it is skipped rather than retried") does not apply: retrying the *same* record after the token is corrected (operator fixes a plane restart's `--token` seed mismatch, rotates a revoked token, or the plane finishes booting its token registry) would succeed. As written, any window where the plane briefly rejects a valid sidecar's bearer (plane restarted with a different `--token` argument, a race during plane startup, an operator credential rotation) causes every currently-spooled WAL record to be silently discarded (logged to stderr only) rather than retried — a direct violation of the feature's own at-least-once/durability promise (FR-049, the "spool now, transmit when the plane is reachable" posture documented in this same file's header). The fix is to treat 401/403 as transient (back off and retry, mirroring 408/429) rather than lumping them into the byte-identical-payload-rejection bucket.

### AUDIT-20260718-37 — Accepted events can be lost when the durable append fails

Finding-ID: AUDIT-20260718-37
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/plane/runtime.ts:414-433, src/plane/http/ingest.ts:270-350

`ingestHandler` calls `ingestEvent(...)` before `eventLog.append(...)`, but `ingestEvent` mutates `ingestState` as part of deciding the outcome: it records the `eventId` in `seenEventIds` and advances per-run high-water/finalization state. If `eventLog.append(outcome.event)` then throws, the handler returns 400 and does not push to `events`, but the in-memory ingest state has already marked the event as seen/applied.

On retry, the same event can be classified as `duplicate` or `stale`, the handler responds 200 for that non-accepted outcome, and the event is still never appended to the durable log or admitted to the live registry. That directly breaks the comment and contract in `runtime.ts:419-428` that durability happens before the 200 and before live admission. Blast radius is blocking because a sidecar can be told an event was not accepted, retry it, then receive a 200 for an event the plane never durably recorded.

A reasonable fix is to separate ingest decision from ingest-state mutation, or make accepted-state mutation commit only after `eventLog.append` succeeds. The durable append must be the first irreversible step for accepted events.

### AUDIT-20260718-38 — Missing coverage for the actual highest-risk crash scenario: torn/partial writes mid-append

Finding-ID: AUDIT-20260718-38
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/wal-crash.test.ts:52-124

Both `it()` blocks in this file only simulate a "crash" *after* every `append()` call has already resolved (`await beforeCrash.append(...)` completes for all three records before the handle is abandoned; same pattern in the second test). Per the file's own contract comment, the WAL's whole reason for existing is fsync-before-ack durability under a `SIGKILL`, which — per R-03/PT-003 as cited in the header comment — can interrupt a process at *any* point, including mid-write-syscall, mid-fsync, or mid-frame (e.g., a length-prefixed or newline-delimited record only partially flushed to disk). This file, despite being named `wal-crash.test.ts` and carrying the crash-safety contract in its header, never exercises that scenario: it never kills the process (or aborts a write) while an `append()` is in flight, so replay-after-torn-write behavior (does `replay()` skip the truncated trailing record cleanly, or does it throw/corrupt subsequent records?) is completely unspecified and unverified.

The blast radius: an implementer (or an unattended agent building `src/sidecar/spool/wal.ts` from this test alone) will reasonably conclude "crash safety is proven" once these two tests pass, because the file's name and header comment claim exactly that. In production, a real `SIGKILL` arriving mid-write (not just between two completed appends) is the actual common case the WAL exists to survive, and it is untested. A reasonable fix is to add a case that truncates the on-disk WAL file/segment by some number of trailing bytes (simulating a torn write) before opening a fresh handle, and assert `replay()` either recovers all fully-written prior records and cleanly drops the trailing partial one, or documents/asserts the specific error behavior — rather than leaving this the one truly unverified path in a "-crash" test suite.

### AUDIT-20260718-39 — WAL crash test models process death with concurrent live handles

Finding-ID: AUDIT-20260718-39
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/wal-crash.test.ts:83-93, tests/fleet/wal-crash.test.ts:108-116

The test claims to model `SIGKILL`, but it leaves the pre-crash `WalHandle` alive in the same process and immediately opens another handle over the same directory. A real `SIGKILL` releases process file descriptors and advisory locks; this test instead requires the WAL implementation to tolerate two simultaneously live handles for one spool directory.

That is a meaningful contract distortion. A correct WAL may reasonably use an exclusive lock or single-writer invariant to prevent concurrent sidecars from corrupting the spool. Acting on this test as written could push an unattended implementer to weaken that invariant just to satisfy the test. The blast radius is high because the test can reject a safer implementation or encourage multi-writer behavior on a persistence surface.

A better test shape would run the writer in a child process and kill it, or use an implementation-supported crash-test hook that simulates process termination while releasing OS resources before reopening the WAL.

### AUDIT-20260718-40 — manifest-reconcile.test.ts never exercises a multi-revision manifest — could silently repeat the R-01 sort-order defect the manifest mechanism exists to avoid

Finding-ID: AUDIT-20260718-40
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/fleet/manifest-reconcile.test.ts:1-194 (specifically the hardcoded key `runs/${installationId}/${runId}/manifest-1.json` at lines ~140, ~152, ~176)

Every test case in this file seeds at most **one** manifest object, always at the literal, hand-typed key `manifest-1.json`. There is no exported/tested key-construction helper for manifests analogous to `eventObjectKey` (pinned by `tests/fleet/object-key.test.ts`) or `derivedObjectKey` (pinned by `tests/fleet/late-event.test.ts`) — both of which this same feature already had to FIX once for exactly this class of bug: research.md's R-01 documents that an *unpadded* sequence number in an object key "does not sort" (`10-` sorts before `2-` lexicographically), and the fix was to zero-pad. The manifest key is also described as revision-numbered ("data-model.md § Derived artifact: revision lives in the key"), and per the AUDIT-20260718-24 fix comment in this very file, manifests must reflect the *latest* content-complete state of a run (they are declared to be rewritten as new events are archived, since objects are never mutated per FR-066).

If the real manifest key format is `manifest-{revision}.json` with an **unpadded** revision (mirroring the test's own `manifest-1.json` literal), and `reconcileRun` must find "the latest" manifest via a bucket `listObjects` + string sort (the same mechanism `eventObjectKey` needed zero-padding to fix), then once a run accumulates more than 9 manifest revisions, reconciliation could pick the wrong (stale, incomplete) manifest as "the" manifest, under-report orphaned events, and silently declare a run's history complete when it isn't — exactly the "lie of omission" this whole mechanism (R-04/PT-004) was built to catch. None of the four test cases here ever seed more than one manifest revision, so this defect class — already proven to occur once in this same feature — has zero coverage on the reconciliation backstop specifically. A reasonable fix is to add a case with ≥10 manifest revisions (crossing the digit-count boundary, exactly as `tests/fleet/object-key.test.ts` does for event keys) and assert `reconcileRun` selects the correct latest one.

### AUDIT-20260718-41 — Static import walker misses bare side-effect imports

Finding-ID: AUDIT-20260718-41
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    tests/fleet/no-creds-in-cli.test.ts:71-89

The hardened credential-boundary guard claims it walks “every relative `.js`/`.ts` import” from `src/telemetry/emit.ts`, but `RELATIVE_IMPORT_RE` only matches `from ...`, `require(...)`, and dynamic `import(...)`. It does not match valid bare side-effect imports like `import '../machine-state/token.js';`. That means a credential module could still load into the CLI emit process through a side-effect import and the test at lines 168-187 would pass.

Blast radius is high because this test is meant to close a prior credential-custody finding. A downstream agent could rely on it as proof that the emit graph is credential-free while an actual static import channel remains unchecked. The self-check at lines 136-165 only exercises `import { ... } from`, so it does not prove the missing channel is covered. A reasonable fix is to include bare static imports in the parser and add a self-check fixture with `import './token-like.js';`.
