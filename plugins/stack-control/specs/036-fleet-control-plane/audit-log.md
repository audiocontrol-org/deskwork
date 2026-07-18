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
