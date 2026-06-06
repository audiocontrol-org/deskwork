# Audit Log — feature/design-control

This document is the feature-local audit log for `feature/design-control`.

How to operate this log:

- Treat new or updated entries as actionable work, not bookkeeping.
- The audit log is the source of truth for current finding state.
- Never delete findings. Update entries in place under the same `Finding-ID`.
- `fixed-<sha>` means a fix landed; `verified-<date>` requires re-exercising the surface.
- If work is deferred, change `Status:` to `acknowledged-<ref>` with the issue, workplan section, or operator-approved plan.

Status quick-reference:

- `open` — reported; not yet resolved
- `acknowledged-<ref>` — accepted but deferred
- `fixed-<sha>` — fix landed, awaiting verification rerun
- `verified-<date>` — fix re-checked against the original surface
- `withdrawn-<date>` / `superseded-by-<finding-id>` — closed without deletion
- `informational` — observation only; no remediation required

Canonical grep queue:

- unfinished work: `grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" docs/1.0/001-IN-PROGRESS/design-control/audit-log.md`
- new findings: `grep -nE "^Status:[[:space:]]+open" docs/1.0/001-IN-PROGRESS/design-control/audit-log.md`
- awaiting verification: `grep -nE "^Status:[[:space:]]+fixed-" docs/1.0/001-IN-PROGRESS/design-control/audit-log.md`

---

## 2026-06-05 — audit-barrage lift (20260605T181608913Z-design-control)

### AUDIT-20260605-01 — EngineMethod union is hardcoded in three places with no compile-time link — silent drift on adding a method

Finding-ID: AUDIT-20260605-01 (claude-01 + claude-03 + claude-04 + codex-01 + codex-03; cross-model)
Status:     fixed-55e23a571aacbb3ebc78edf7bb58f5e1d3fd16e3
Severity:   medium
Surface:    plugins/design-control/src/engine-adapter/types.ts:24-27, conformance.ts:21-25, src/__tests__/engine-adapter/preflight.test.ts:9-13

Remediation (applied in working tree, pending commit; set Status to fixed-<sha> at commit time):
- 1a single-source method vocabulary: `ENGINE_METHODS` const added to types.ts; `EngineMethod` derived from it; `z.enum(ENGINE_METHODS)` in conformance.ts; preflight.test.ts loop iterates `ENGINE_METHODS` (hand-retyped `ALL_METHODS` removed). Tests: types.test.ts ENGINE_METHODS block.
- 1b compile-time method/envelope binding: `EngineAdapterRequestFor<M>`/`EngineAdapterResponseFor<M>` generics added; `EngineAdapter` interface methods bound to their own method; wide `EngineAdapterRequest`/`EngineAdapterResponse` kept as `…For<EngineMethod>` unions. Test: types.binding.test.ts (@ts-expect-error on mismatched method).
- 1c preflight remedy: interpolates the actual missing `adapterId`; names `frontend-design` only when the default adapter is the one missing. Tests: preflight.test.ts custom-engine + default-adapter remedy cases.
- 1d single-source [0,1] check: `ConfidenceSchema = z.number().refine(isConfidence, …)`; `validateConformance` calls `isConfidence`. Test: conformance.test.ts boundary-agreement table.
- 1e deferral language removed from types.ts/preflight.ts/index.ts comments; grep over engine-adapter/*.ts for deferral words returns zero hits.

`EngineMethod` is a type-only union (`'author-wireframe' | 'translate-design-language' | 'referee-screenshot'`) with no runtime const array. As a consequence the same three method strings are re-typed by hand in `EngineMethodSchema = z.enum([...])` (conformance.ts:21) and again in `ALL_METHODS` (preflight.test.ts:9). Nothing ties the zod enum back to the type — there is no `z.infer`/`satisfies` relationship. If a fourth method is added to the `EngineMethod` union, the zod request/response schemas will silently keep rejecting it and the conformance test loop will silently skip it, with **no TypeScript error**.

This is asymmetric with the sibling `FAILURE_MODES` (types.ts:42-49), which IS single-sourced as a `const [...] as const` array with both the `FailureMode` type and `FailureModeSchema = z.enum(FAILURE_MODES)` derived from it. The fix is to mirror that pattern exactly: declare `export const ENGINE_METHODS = ['author-wireframe', 'translate-design-language', 'referee-screenshot'] as const`, derive `EngineMethod` from it, and feed it to both `z.enum(ENGINE_METHODS)` and the test's `ALL_METHODS`. That collapses the drift surface from three to one. Given this is the *seam* the whole portability claim rests on, single-sourcing the method vocabulary is load-bearing, not cosmetic.

### AUDIT-20260605-02 — Manual-authoring test is tautological — asserts a string literal against itself, covers no implementation

Finding-ID: AUDIT-20260605-02 (claude-02 + codex-02; cross-model)
Status:     fixed-55e23a571aacbb3ebc78edf7bb58f5e1d3fd16e3
Severity:   medium
Surface:    plugins/design-control/src/__tests__/engine-adapter/preflight.test.ts:63-81

Remediation (applied in working tree, pending commit): the tautological placebo test was deleted. Replaced by conformance.test.ts § 'non-execution conformance surface requires no engine probe (AUDIT-02)', which exercises ENGINE_METHODS + confidence validators + the request/response zod schemas + validateConformance + parseAndValidate end-to-end with no probe constructed, and asserts an always-absent probe has zero effect on any non-execution operation. The test does not claim a manual-authoring helper exists; it covers only the engine-free property of today's code.

The test `'manual authoring path does not invoke the probe and requires no engine'` exercises nothing in the library. It builds `const manualAuthoringResult = (() => 'manual-wireframe-authored')()` and asserts that literal equals itself, then asserts a mock that the test never wired into any call site was never called. The comment is candid about this: *"modeled here by simply not calling preflightEngine."* That is the definition of a test that doesn't test the contract it claims to.

This matters because the manual-authoring-needs-no-engine invariant is the central scaffold claim in the PRD (*"scaffold completion does not require the engine"*) and the workplan acceptance criteria. A green checkmark here reads as "the invariant is verified" when in fact no manual-authoring code path exists in this diff to verify — the test is a placebo. Two honest options: (a) delete the test and let the invariant be covered by the Phase-2 integrated engine-absent witness the workplan already names, or (b) if a manual-authoring helper is meant to exist now, add it and have the test drive *it* with an absent-engine probe and assert it returns without touching the probe. Shipping a self-confirming test is worse than no test because it underwrites a false "verified" claim — the same failure mode the project's `ui-verification.md` § spec-compliance probes rule was written to prevent.

### AUDIT-20260605-03 — validateConformance trusts its typed inputs — no structural parse, and no combined parse-then-echo helper is exported

Finding-ID: AUDIT-20260605-03
Status:     fixed-55e23a571aacbb3ebc78edf7bb58f5e1d3fd16e3
Severity:   low
Surface:    plugins/design-control/src/engine-adapter/conformance.ts:78-141, index.ts:24-29

Remediation (applied in working tree, pending commit): `parseAndValidate(rawRequest: unknown, rawResponse: unknown): ConformanceResult` added to conformance.ts and exported from index.ts. It runs `EngineAdapterRequestSchema.safeParse` + `EngineAdapterResponseSchema.safeParse` first; on either failure it returns `conformant: false` with structural messages WITHOUT running the echo check; only when both parse does it call `validateConformance`. Tests: conformance.test.ts § parseAndValidate (malformed confidence, missing manifestId, non-echoing pair, conformant pair).

`validateConformance` takes `EngineAdapterRequest`/`EngineAdapterResponse` and performs only the semantic echo checks; it never runs `EngineAdapterRequestSchema`/`EngineAdapterResponseSchema`. That's a defensible split (structural vs semantic), but the public surface (index.ts) exports the two zod schemas and the echo-validator as three independent pieces with no guidance and no convenience wrapper that does parse-then-echo in the correct order. A real adapter caller — wiring untrusted engine output across a process boundary — can call `validateConformance` on a raw, unparsed object (TypeScript won't stop them if they `as` the boundary, and the engine output genuinely arrives `unknown`), getting a `conformant: true/false` verdict on a shape that was never structurally validated.

Per the project's fail-loud / no-bug-factory posture, the seam should make the safe path the easy path: export something like `parseAndValidate(rawRequest, rawResponse): ConformanceResult` that runs both schemas first (collecting structural violations) and only then runs the echo check, so a caller can't accidentally skip structural validation. As-is the ordering contract lives only in the doc-comment, which is the weakest place to enforce an invariant.

### AUDIT-20260605-04 — New plugin lands version 0.37.0 on a v0.36.0-based branch with no matching plugin.json in the diff

Finding-ID: AUDIT-20260605-04
Status:     informational
Severity:   informational
Surface:    plugins/design-control/package.json:3, package-lock.json (plugins/design-control entry)

`plugins/design-control/package.json` declares `"version": "0.37.0"` and the lockfile records the same, but the session journal states the branch is v0.36.0-based and 42 commits behind main. The project's lockstep rule (`.claude/CLAUDE.md`: *"The plugin shell's plugin.json version MUST equal the published npm package version"*) ties this number to a `.claude-plugin/plugin.json` that is **not present in this diff** — the workplan places the plugin shell (plugin.json, bin shim, marketplace registration) in Phase 6, while this is Phase-1 work. So the version is being chosen before its lockstep counterpart exists, on a branch whose base version doesn't match it.

This is flagged as informational, not a bug: the package is `"private": true`, so it won't publish, and Phase-1 source legitimately lands in the plugin directory before the shell. But when the Phase-6 plugin.json is authored, whoever writes it must reconcile this 0.37.0 against the then-current release version (the branch is already behind main), or the lockstep invariant ships violated. Recording it here so the reconciliation isn't silently skipped at shell-creation time.

## 2026-06-05 — audit-barrage lift (20260605T183336448Z-design-control)

### AUDIT-20260605-05 — Adding `satisfies z.ZodType<…>` silently loosened the `payload` contract from required to optional — undocumented and unmentioned in any remediation note

Finding-ID: AUDIT-20260605-05 (claude-01 + claude-03 + codex-02; cross-model)
Status:     fixed-85e79ba4f581dd64f529467e09a71c60f6315045

Disposition override: the dampener slushed this (2 consecutive 0-HIGH runs), but it is a real cross-model MEDIUM regression in the load-bearing seam introduced by 55e23a57 — fixed in 85e79ba4 rather than left in the slush pile (project rule: slush "0 open" must not hide real defects). Request `payload` restored to required; schema enforces key-presence via `.superRefine`; conformance tests are the drift guard. Closes via commit trailer.
Severity:   medium
Surface:    plugins/design-control/src/engine-adapter/types.ts (EngineAdapterRequestFor `payload?: unknown`), conformance.ts:~40-52 (`}) satisfies z.ZodType<EngineAdapterRequest>`)

The diff changes `payload: unknown` (required) to `payload?: unknown` (optional) on the request envelope, with a comment rationalizing it as "Typed `unknown` (which already admits the absent value)." That rationalization conflates *value* `undefined` with *key* absence: under `exactOptionalPropertyTypes` (which this diff is clearly compiling under — see the new `imageHashes?: string[] | undefined` annotations), `payload: unknown` requires the key to be present while `payload?: unknown` makes a request with no `payload` key at all structurally valid.

This loosening was forced by the newly-added `satisfies z.ZodType<EngineAdapterRequest>` clause, not by any design decision. `z.unknown()` produces an *optional* output key in zod (`z.object({payload: z.unknown()})` ⇒ `{ payload?: unknown }`); reconciling that schema against an interface with **required** `payload` fails the `satisfies` check on both the `_output` and `_input` positions. The reconciliation went the wrong direction — instead of tightening the schema to enforce payload presence, the *type* was loosened to match the lenient schema. The net effect: `EngineAdapterRequestSchema.safeParse({ method, manifestId })` now returns `success: true` for an execution request carrying no method-specific input, which the PRD describes as the load-bearing `payload`. For a project with a fail-loud / no-bug-factory posture this is a real weakening of the seam's structural contract, and it rode in as an unannounced side effect of a type-binding fix — exactly the silent-scope-creep shape the project guards against. A reasonable fix: keep `payload` required in the type and enforce presence in the schema with `z.unknown().superRefine(...)` or a `.refine` that rejects the absent key, so `satisfies` passes against a required field instead of demoting the field.

### AUDIT-20260605-06 — The "always-absent probe has zero effect" test re-introduces the AUDIT-02 tautology in a milder form

Finding-ID: AUDIT-20260605-06
Status:     fixed-85e79ba4f581dd64f529467e09a71c60f6315045

Disposition override: slushed by the dampener; fixed in 85e79ba4 — deleted the tautological second probe case (the first case carries the real engine-free invariant).
Severity:   low
Surface:    plugins/design-control/src/__tests__/engine-adapter/conformance.test.ts (`'an always-absent probe has zero effect on any non-execution operation'`)

The replacement for the deleted tautological test is mostly good — the first case (`'exercises the schema + validateConformance + parseAndValidate end-to-end with no probe constructed'`) genuinely drives real code paths and proves the engine-free property. But the second case constructs `absentProbe` and then calls `EngineAdapterRequestSchema.safeParse`, `validateConformance`, `parseAndValidate`, and `isConfidence` — **none of which take a probe parameter**. Asserting that these functions "never consult the probe" is structurally guaranteed by their signatures, not an empirically verified property; the probe is not, and cannot be, an input to any of them. The trailing `expect(absentProbe.isAvailable('any')).toBe(false)` asserts only that the test's own stub returns its hardcoded value.

This is the same self-confirming shape AUDIT-02 condemned ("asserts a string literal against itself, covers no implementation"), just milder. It proves nothing the first case didn't, and the "zero effect of the probe" framing reads as coverage of a probe-isolation invariant that the test doesn't actually exercise (the only function that *does* consult a probe — `preflightEngine` — isn't called here). Either delete the second case (the first one carries the real invariant) or, if a probe-isolation property is genuinely wanted, route an absent probe through `preflightEngine` for a *non-execution* path and assert it returns without throwing — which would require such a path to exist.

### AUDIT-20260605-07 — Type-level binding tests are inert under the package’s test command

Finding-ID: AUDIT-20260605-07
Status:     fixed-85e79ba4f581dd64f529467e09a71c60f6315045

Disposition override: slushed by the dampener, but a real MEDIUM verification gap (the @ts-expect-error binding tests were inert under `vitest run`) — fixed in 85e79ba4: package `test` now runs `tsc --noEmit && vitest run`, so binding drift fails the normal test gate.
Severity:   medium
Surface:    plugins/design-control/src/__tests__/engine-adapter/types.binding.test.ts:67-77; missing package script/typecheck gate for plugins/design-control/package.json

`types.binding.test.ts` relies on `@ts-expect-error` to prove wrong-method envelopes are rejected, but the package test script is `vitest run`, which transpiles and executes tests without enforcing TypeScript diagnostics. That means these two negative assertions are not actually checked by the normal test command; if the adapter method types drift back to accepting wide `EngineAdapterRequest`, these tests still run as JavaScript and pass.

This matters because AUDIT-20260605-01’s remediation explicitly depends on compile-time method/envelope binding. The fix should add a real type-checking gate for this package, such as `tsc --noEmit` or a type-test command that is run in CI/hooks, or move these assertions into an existing type-test harness that fails on unused or missing `@ts-expect-error`.

## 2026-06-05 — audit-barrage lift (20260605T184408958Z-design-control)

### AUDIT-20260605-08 — Removing `satisfies z.ZodType<EngineAdapterRequest>` deleted the request schema's field-drift guard; the claimed replacement doesn't cover that drift

Finding-ID: AUDIT-20260605-08 (claude-01 + claude-03 + claude-04 + codex-01; cross-model)
Status:     fixed-6d99c0ea699a5e59aca025438c6c301842b6e642

Disposition override: slushed by the dampener, but a real cross-model MEDIUM drift-safety regression introduced by the AUDIT-05 fix. Fixed in 6d99c0ea — restored compile-time field-set drift detection as a key-set `Expect<Equal<...>>` assertion in types.binding.test.ts (verified teeth: a phantom field fails `tsc --noEmit` TS2344); the unreachable parseAndValidate branch now throws instead of fabricating a violation (claude-04); the zod `alwaysSet` reliance is documented + version-pinned (claude-03). Over-claiming doc-comments corrected.
Severity:   medium
Surface:    plugins/design-control/src/engine-adapter/conformance.ts:37-67 (request schema), and the response schema doc-comment still claiming a `satisfies` clause

The AUDIT-05 fix rewrote `EngineAdapterRequestSchema` from `z.object({...}) satisfies z.ZodType<EngineAdapterRequest>` to `z.object({...}).superRefine(...)` with **no `satisfies` clause**. The old doc-comment (now deleted) stated the explicit purpose of that clause: *"so adding/removing an envelope field surfaces here as a type error."* That compile-time drift guard is now gone for the request schema — but the **response** schema (conformance.ts, doc-comment unchanged: *"The `satisfies` clause keeps the schema's parsed output aligned…"*) still has it. The two sibling schemas now have asymmetric drift protection, and the *less*-protected one is the request envelope carrying the load-bearing `payload`.

The new doc-comment asserts *"the request/response conformance tests are the drift guard in its place."* They are not, for this class of drift. `validateConformance` performs semantic echo checks (response echoes request's method/manifestId/etc.); it never enumerates `EngineAdapterRequestFor`'s fields and asserts the schema parses them. So adding a new field to `EngineAdapterRequestFor` without adding it to the schema compiles clean AND passes every conformance test — exactly the drift the `satisfies` clause existed to catch (the AUDIT-01-class single-source concern). The fix for AUDIT-05 silently weakened a different invariant.

A reasonable fix: restore a compile-time guard the `ZodEffects` form can carry. Either split into a base `z.object` that keeps `satisfies z.ZodType<EngineAdapterRequest>` and apply `.superRefine` to that named base (the base object still type-checks against the interface), or add an explicit `Expect<Equal<z.input<typeof base>, EngineAdapterRequest>>` type-level assertion in `types.binding.test.ts` so field-addition drift fails `tsc --noEmit`. The doc-comment claim that conformance tests cover this should be removed or made true.

### AUDIT-20260605-09 — AUDIT-07's `tsc --noEmit` gate is unverifiable from the diff — the tsconfig that decides whether the binding tests are even type-checked is the missing surface

Finding-ID: AUDIT-20260605-09
Status:     fixed-6d99c0ea699a5e59aca025438c6c301842b6e642

Disposition override: slushed by the dampener. Resolved in 6d99c0ea: empirically verified the AUDIT-07 `tsc --noEmit` gate has teeth (removing a still-needed `@ts-expect-error` fails tsc with TS2322); the package tsconfig (commit c8c19f5d) includes `src/__tests__/**` under `exactOptionalPropertyTypes`, and the new key-set drift assertion further exercises the gate. The auditor flagged this because the tsconfig was outside the round-2 diff it reviewed — the gate was real; the doc-claims are now accurate.
Severity:   medium
Surface:    plugins/design-control/package.json:8-10 (new `tsc --noEmit` gate); missing plugins/design-control/tsconfig.json in the diff

AUDIT-07's remediation note claims: *"package `test` now runs `tsc --noEmit && vitest run`, so binding drift fails the normal test gate."* That claim is true only if the package's `tsconfig.json` `include` actually covers `src/__tests__/engine-adapter/types.binding.test.ts` and resolves the `@/engine-adapter` path alias. Neither the tsconfig nor any evidence of its `include`/`paths`/`exactOptionalPropertyTypes` settings is in this diff — and the fix's entire effectiveness rides on them.

Two concrete failure modes that the diff cannot rule out: (1) if `include` is scoped to runtime sources (e.g. `["src/engine-adapter"]` or excludes `__tests__`), then `tsc --noEmit` never type-checks `types.binding.test.ts`, the `@ts-expect-error` directives (types.binding.test.ts:67-83) remain inert exactly as before, AUDIT-07 is **not** actually fixed, *and the gate passes green* — a false "verified." (2) if there is no package-local tsconfig at all, `tsc --noEmit` runs with default options that don't resolve the `@/` alias, so the gate fails unconditionally; the fact that the commit landed suggests a tsconfig exists, but its scope is unconfirmed. Additionally, the AUDIT-05 narrative leans hard on `exactOptionalPropertyTypes` being enabled (*"clearly compiling under"*) — that too lives only in the unshown tsconfig.

The tsconfig is the surface that should be in this diff and isn't. The fix should include (or the reviewer should confirm) that the tsconfig `include`s `src/__tests__/**`, sets `strict` + `exactOptionalPropertyTypes` + `noUnusedLocals`, and that `tsc --noEmit` reports an error if a `@ts-expect-error` is removed from a still-erroring line. Without that, "binding drift fails the normal test gate" is an untested claim about an untested gate.

## 2026-06-05 — audit-barrage lift (20260605T185344732Z-design-control)

### AUDIT-20260605-10 — Request-schema field-set guard only compares key *names*, leaving field *types* unguarded — the AUDIT-08 asymmetry is only half-closed

Finding-ID: AUDIT-20260605-10
Status:     fixed-19af9658afef2509a21c411dfec3edda8e2a3c4e

Disposition override: slushed by the dampener; a real MEDIUM (single-model) — my AUDIT-08 fix restored only field-SET drift detection, not field-TYPE. Fixed in 19af9658: the request guard is now `Expect<Equal<Omit<z.input<S>,'payload'>, Omit<EngineAdapterRequest,'payload'>>>` (full structural equality ex-payload). Verified teeth: drifting manifestId's schema type fails `tsc --noEmit` (TS2344). Over-stated doc-comment corrected.
Severity:   medium
Surface:    plugins/design-control/src/__tests__/engine-adapter/types.binding.test.ts:112-114; plugins/design-control/src/engine-adapter/conformance.ts:48-53,87-96

The deleted `satisfies z.ZodType<EngineAdapterRequest>` enforced full structural assignability — key presence **and each field's type** **and** optionality. Its replacement, `Expect<Equal<keyof z.input<typeof EngineAdapterRequestSchema>, keyof EngineAdapterRequest>>`, compares only the **union of key names**. That is strictly weaker: a field whose *type* drifts between the schema and the interface compiles clean and passes the assertion, because the key set is unchanged.

Concretely: change `manifestId: z.string().min(1)` (conformance.ts:63) to `z.number()` while the interface keeps `manifestId: string` (types.ts:98). The old `satisfies` clause would have errored. The new `keyof` guard does not — `"method"|"manifestId"|...` is identical on both sides. `validateConformance` won't catch it either: its `response.manifestId !== request.manifestId` echo check (conformance.ts:131) passes when both parse as the same drifted type. So request-schema field-*type* drift now ships silently. Meanwhile the **response** schema still has `satisfies` (conformance.ts:96) and *does* catch type drift. The request/response asymmetry AUDIT-08 set out to close is only restored for the field-*set*, not the field-*type* — and the request envelope (the one carrying the load-bearing `payload`) is again the less-protected sibling, which is precisely the framing AUDIT-08 used to justify the fix.

The AUDIT-08 doc-comment is *technically* honest (it says "field-set drift"), but the finding's narrative ("restored compile-time field-set drift detection… asymmetric drift protection") reads as a full restoration when it isn't. A reasonable closure: assert full type alignment for everything except the one optionality-mismatched field, e.g. `Expect<Equal<Omit<z.input<typeof S>, 'payload'>, Omit<EngineAdapterRequest, 'payload'>>>` (which keeps field-type checking on `method`/`manifestId`/`imageHashes`/`rubricItemIds`) paired with the existing payload-presence `@ts-expect-error` test (types.binding.test.ts:99-104). That restores type-drift teeth without tripping over the `payload?`-vs-`payload` optionality difference that forced the `keyof` retreat. As written, the conformance.ts:48-53 claim that this assertion is the request schema's "equivalent drift guard" to the response's `satisfies` overstates the equivalence.

---

### AUDIT-20260605-11 — `parseAndValidate` can now throw, but its JSDoc still presents an always-returns contract

Finding-ID: AUDIT-20260605-11
Status:     fixed-19af9658afef2509a21c411dfec3edda8e2a3c4e

Disposition: fixed in 19af9658 — added an `@throws` note to parseAndValidate's JSDoc documenting the (unreachable) invariant-violation throw introduced by the AUDIT-08/claude-04 fail-loud branch.
Severity:   low
Surface:    plugins/design-control/src/engine-adapter/conformance.ts:213-256

The unreachable branch (conformance.ts:241-253) was changed from returning a `ConformanceResult` to `throw new Error(...)`. The fail-loud posture is correct and consistent with project guidelines, and the branch is genuinely unreachable (the `.superRefine` at conformance.ts:68-76 rejects an absent `payload` before `safeParse` can return success, so `narrowParsedRequest` at line 201 can never see a payload-less success). So there is no practical runtime impact.

The gap is documentation drift: `parseAndValidate`'s JSDoc (conformance.ts:213-222) describes only return behavior ("returns the structural violations…", "return its result") and never mentions that the function may now throw on invariant violation. This sits directly beside `validateConformance`, whose JSDoc explicitly promises "Does NOT throw" (conformance.ts:106-107) — so a caller reasonably infers the same of `parseAndValidate` and may wrap it in `if (!result.conformant)` without a try/catch. Because the throw is unreachable this is low severity, but the contract a caller reads is now incomplete. A one-line `@throws` note (e.g. "@throws if the parsed request violates the payload-presence invariant the schema is expected to enforce") would keep the documented contract aligned with the code. This is the same doc-vs-code alignment the project's other rules guard against; flagging so the JSDoc isn't left describing the pre-throw behavior.

---

### AUDIT-20260605-12 — Context: the new field-set guard is inert when tests run outside the exact `npm test` invocation

Finding-ID: AUDIT-20260605-12
Status:     informational

Disposition: informational, no code change. The auditor explicitly flagged this as the already-dispositioned AUDIT-07/09 shape ("not re-litigating") — the compile-time field-set/type guards are tsc-only by design (their teeth live in the `tsc --noEmit` prefix of the package `test` script, confirmed effective under AUDIT-09). Recorded so the run-context fragility (bare `vitest run` / watch / IDE runners skip the type gate) is on the record.
Severity:   informational
Surface:    plugins/design-control/src/__tests__/engine-adapter/types.binding.test.ts:106-119

This is the already-dispositioned AUDIT-07/AUDIT-09 shape, surfaced only because this diff adds a **new** instance of it — I am not re-litigating the disposition. The `it('pins each schema field-set…')` block's runtime body asserts `expect([requestKeysAligned, responseKeysAligned]).toEqual([true, true])`, where both locals are literally `= true` (types.binding.test.ts:112-118). The real teeth are entirely at compile time via `tsc --noEmit`; the runtime `it()` is tautological by construction (the comment at line 111 is honest about this — "keeps the locals used"). The consequence worth recording: any test run that does **not** go through the `tsc --noEmit && vitest run` package script — a bare `vitest run`, `vitest --watch`, or an IDE/editor test runner during development — executes this block as JavaScript, passes green, and verifies nothing. A developer iterating in watch mode who introduces field-set drift gets a passing test locally; the drift only surfaces at the `npm test` / CI boundary.

This is the documented design (the teeth deliberately live in `tsc`, not vitest), and AUDIT-09 confirmed the gate has teeth via the package `test` script. I flag it only so the operator knows the *new* AUDIT-08 guard inherits the same run-context fragility as the AUDIT-05/07 binding assertions — three of the four meaningful assertions in this file (`@ts-expect-error` × 3 plus the new `Expect<Equal<...>>`) are now compile-time-only and share a single point of enforcement (the `tsc --noEmit` prefix in one package script). If that prefix is ever dropped or reordered, all of them silently go green at once.

---

**What I checked that came back clean:** the `keyof` guard's teeth for field add/remove (confirmed `EngineAdapterRequest` is a flat single interface, not a union, so `keyof` doesn't collapse to common keys — the failure mode that would have silently weakened the guard); the `Equal<A,B>` definition (standard, correct for unions of string-literal keys); the unreachability of the new throw (superRefine rejects absent payload pre-parse); zod `z.input`/`alwaysSet` reasoning in the doc-comment (internally consistent with how `z.unknown()` materializes keys); and the response schema's double-guard (`satisfies` + `keyof` pin) which is harmless belt-and-suspenders, not a conflict.

## 2026-06-06 — audit-barrage lift (20260606T060403205Z-design-control)

> **Lift note (TF-002 recurrence):** the lift merged FIVE distinct findings under one ID
> (`claude-01 + claude-02 + claude-03 + codex-01 + codex-02`) but documented only the data-uri
> one. Per the project rule that slushed "0-open" must not hide real defects, and the TF-002
> *Medium* fix shape (distinct-mechanism findings stay separate), the merge is SPLIT below into
> `-01` (data-uri over-rejection + precedence), `-02` (mixed-rel bypass), `-03` (control-char
> scheme obfuscation). The dampener's `acknowledged-slush-pile` disposition is OVERRIDDEN — these
> are real defects in code committed this session, fixed with TDD in the same commit that closes
> them.

### AUDIT-20260606-01 — data-uri rule ran over EVERY attribute value (over-rejection) + value-rules preceded allowlist membership (mislabel)

Finding-ID: AUDIT-20260606-01 (claude-01 + claude-02; cross-model with codex on the surface)
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (`checkElement` attribute loop)

Disposition override: the dampener slushed the merged entry (2 consecutive 0-HIGH runs), but this is a real over-rejection defect introduced by 5a5a1699. Fix applied in the working tree, closed by commit trailer.

`DATA_URI_RE.test(value)` ran on *every* attribute value of every allowed element, before the allowlist-membership check. So `<div class="data:x">` and `<meta content="…data:…">` / `<div title="…data:…">` were wrongly rejected as `data-uri` — directly contradicting the round-8 invariant (class values are permitted-but-inert because the pinned stylesheet is the sole CSS source) that allowlist.ts documents and a sibling test asserts (the old negative test used `metadata-row`, no colon, so the contradiction was untested). Separately (claude-02), because value-shape rules ran before `isAllowedAttr`, a disallowed attribute carrying a `data:`/presentational value was mislabeled under the wrong rule.

Fix: reorder so allowlist MEMBERSHIP is decided first; scope the `data:` (and scheme) value-checks to `href` only — the single URL-bearing allowed attribute. Regression tests: `class="data:x"` passes, `<meta content="…data:…">`/`title` prose passes, a `data:`-bearing *disallowed* attr reports `disallowed-attribute` not `data-uri`, and `data:` in a link `href` still rejects.

### AUDIT-20260606-02 — mixed `<link>` rel tokens bypass the non-stylesheet rejection

Finding-ID: AUDIT-20260606-02 (codex-01)
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (the `<link>` rel gate)

Disposition override: slush-merged under -01 by the lift; a real MEDIUM. Fixed in the same commit.

The rel gate tested `rel.includes('stylesheet')`, so `rel="stylesheet icon"` / `rel="stylesheet preload"` passed while still pulling a non-CSS resource (favicon/preload) — weakening the "closed channel" guarantee an allowlist exists to provide. Fix: require the normalized rel token set to be EXACTLY `['stylesheet']`. Regression test: `rel="stylesheet icon"` → `disallowed-link-rel`.

### AUDIT-20260606-03 — control-char-obfuscated script schemes decode past the start-anchored regex

Finding-ID: AUDIT-20260606-03 (codex-02 + claude-03; cross-model)
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (`SCRIPT_URI_RE`)

Disposition override: slush-merged under -01; cross-model agreement (two independent models flagged it) = high-confidence. claude framed it as the axis-1 boundary for tasks 6–7; codex as a MEDIUM the rule under-delivers on. Closed now (cheap) rather than deferred, per scope-don't-defer.

parse5 decodes HTML entities in attribute values, so `href="java&#x0a;script:alert(1)"` reaches the check as an embedded-newline `java\nscript:` that a start-anchored `^\s*(javascript|vbscript):` regex misses, while browsers that strip the control would still navigate. Fix: reject any C0 control character (U+0000–U+001F) in an `href` value outright, before scheme detection. Regression test: `href="java&#x0a;script:alert(1)"` → `disallowed-uri-scheme`. (The deeper "parse the URL scheme rather than regex-anchor" hardening remains the explicit probe target for the tasks 6–7 adversarial corpus.)
