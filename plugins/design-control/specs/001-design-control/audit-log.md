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

- unfinished work: `grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" plugins/design-control/specs/001-design-control/audit-log.md`
- new findings: `grep -nE "^Status:[[:space:]]+open" plugins/design-control/specs/001-design-control/audit-log.md`
- awaiting verification: `grep -nE "^Status:[[:space:]]+fixed-" plugins/design-control/specs/001-design-control/audit-log.md`

> Ported 2026-06-10 from `docs/1.0/001-IN-PROGRESS/design-control/audit-log.md` into the
> stack-control regime (this file moved; history preserved by git). Historical `Surface:` lines
> below that name the old path describe where findings lived at the time — left verbatim
> (append-only log; never rewrite history).

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
Status:     fixed-a718683ccaa739fd213ac797bff59ed96460d721
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (`checkElement` attribute loop)

Disposition override: the dampener slushed the merged entry (2 consecutive 0-HIGH runs), but this is a real over-rejection defect introduced by 5a5a1699. Fix applied in the working tree, closed by commit trailer.

`DATA_URI_RE.test(value)` ran on *every* attribute value of every allowed element, before the allowlist-membership check. So `<div class="data:x">` and `<meta content="…data:…">` / `<div title="…data:…">` were wrongly rejected as `data-uri` — directly contradicting the round-8 invariant (class values are permitted-but-inert because the pinned stylesheet is the sole CSS source) that allowlist.ts documents and a sibling test asserts (the old negative test used `metadata-row`, no colon, so the contradiction was untested). Separately (claude-02), because value-shape rules ran before `isAllowedAttr`, a disallowed attribute carrying a `data:`/presentational value was mislabeled under the wrong rule.

Fix: reorder so allowlist MEMBERSHIP is decided first; scope the `data:` (and scheme) value-checks to `href` only — the single URL-bearing allowed attribute. Regression tests: `class="data:x"` passes, `<meta content="…data:…">`/`title` prose passes, a `data:`-bearing *disallowed* attr reports `disallowed-attribute` not `data-uri`, and `data:` in a link `href` still rejects.

### AUDIT-20260606-02 — mixed `<link>` rel tokens bypass the non-stylesheet rejection

Finding-ID: AUDIT-20260606-02 (codex-01)
Status:     fixed-a718683ccaa739fd213ac797bff59ed96460d721
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (the `<link>` rel gate)

Disposition override: slush-merged under -01 by the lift; a real MEDIUM. Fixed in the same commit.

The rel gate tested `rel.includes('stylesheet')`, so `rel="stylesheet icon"` / `rel="stylesheet preload"` passed while still pulling a non-CSS resource (favicon/preload) — weakening the "closed channel" guarantee an allowlist exists to provide. Fix: require the normalized rel token set to be EXACTLY `['stylesheet']`. Regression test: `rel="stylesheet icon"` → `disallowed-link-rel`.

### AUDIT-20260606-03 — control-char-obfuscated script schemes decode past the start-anchored regex

Finding-ID: AUDIT-20260606-03 (codex-02 + claude-03; cross-model)
Status:     fixed-a718683ccaa739fd213ac797bff59ed96460d721
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (`SCRIPT_URI_RE`)

Disposition override: slush-merged under -01; cross-model agreement (two independent models flagged it) = high-confidence. claude framed it as the axis-1 boundary for tasks 6–7; codex as a MEDIUM the rule under-delivers on. Closed now (cheap) rather than deferred, per scope-don't-defer.

parse5 decodes HTML entities in attribute values, so `href="java&#x0a;script:alert(1)"` reaches the check as an embedded-newline `java\nscript:` that a start-anchored `^\s*(javascript|vbscript):` regex misses, while browsers that strip the control would still navigate. Fix: reject any C0 control character (U+0000–U+001F) in an `href` value outright, before scheme detection. Regression test: `href="java&#x0a;script:alert(1)"` → `disallowed-uri-scheme`. (The deeper "parse the URL scheme rather than regex-anchor" hardening remains the explicit probe target for the tasks 6–7 adversarial corpus.)

## 2026-06-06 — audit-barrage lift (20260606T061605069Z-design-control)

> **Lift note (TF-002 recurrence, 3rd time):** the lift merged claude-01 + claude-02 + codex-01
> under `-04`, documenting only claude-01. Split below into `-04` (the MED coupling), `-05`
> (claude-02 LOW test-name honesty), `-06` (codex-01 LOW breadcrumb drift). Slush OVERRIDDEN —
> claude-01 is a real latent-coupling defect introduced by the round-1 fix a718683c; all three
> fixed with TDD in the same commit that closes them. This is the documented convergence pattern
> (each fix round surfaces a finer finding); round-3 verifies.

### AUDIT-20260606-04 — value-shape checks hardcoded to `attr === 'href'`, making RESOURCE_URL_ATTRS dead + the cross-module URL-attr coupling latent

Finding-ID: AUDIT-20260606-04 (claude-01)
Status:     fixed-512e312ccf4a004e28be5ada0aa8d1fa78a94ebc
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (value-shape block); plugins/design-control/src/lint/allowlist.ts (RESOURCE_URL_ATTRS)

Disposition override: slush-merged by the lift; a real MED latent-coupling defect introduced by the round-1 fix (a718683c). Fixed in this commit.

The round-1 fix narrowed value-shape scanning by wrapping the whole block (control-char, data:, script:, external-resource) in `if (attr === 'href')`. That made `RESOURCE_URL_ATTRS` (a per-tag `Record`) effectively dead — its branch can only fire when `attr === 'href'` — and rested the data:/scheme narrowing on the implicit, unenforced assumption that href is the only URL-bearing allowed attr. If a future task added a non-href URL attr (`img src`, `source srcset`, `a ping`), its value would pass completely unscanned, silently weakening the "lint green ⇒ lo-fi" guarantee with no signal.

Fix: introduce `URL_ATTRS` in allowlist.ts as the SSOT of URL-bearing attrs; gate value-shape scanning on `URL_ATTRS.has(attr)` instead of the hardcoded literal; keep external-resource on the `RESOURCE_URL_ATTRS` resource-loading subset. Coverage test asserts every `RESOURCE_URL_ATTRS` attr is in `URL_ATTRS`, making the cross-module invariant explicit — adding a resource attr without scheme coverage now fails a test instead of shipping a latent gap.

### AUDIT-20260606-05 — pre-existing test name "rejects a data: URI in any attribute" contradicts the now-href-scoped contract

Finding-ID: AUDIT-20260606-05 (claude-02)
Status:     fixed-512e312ccf4a004e28be5ada0aa8d1fa78a94ebc
Severity:   low
Surface:    plugins/design-control/src/__tests__/lint/check-mockup-lofi.test.ts

Disposition override: slush-merged under -04; a real (LOW) test-honesty defect — the suite advertised a guarantee the round-1 fix intentionally removed. Fixed in this commit.

After AUDIT-20260606-01 scoped data: rejection to href only, the test named `rejects a data: URI in any attribute` (which passes only because its fixture uses a link href) sat three lines from the new `permits … data: in a non-URL attribute` tests — an apparent self-contradiction that obscures the real contract. Fix: renamed to `rejects a data: URI in a stylesheet href` (no behavior change; keeps the suite an honest spec).

### AUDIT-20260606-06 — regression-test/source comment breadcrumbs cite the pre-split merged ID

Finding-ID: AUDIT-20260606-06 (codex-01)
Status:     fixed-512e312ccf4a004e28be5ada0aa8d1fa78a94ebc
Severity:   low
Surface:    plugins/design-control/src/__tests__/lint/check-mockup-lofi.test.ts; plugins/design-control/src/lint/check-mockup-lofi.ts

Disposition override: slush-merged under -04; a real (LOW) breadcrumb-drift defect. Fixed in this commit.

The round-1 fix's code/test comments labeled mixed-rel as `AUDIT-20260606-01/codex-01` and control-char as `AUDIT-20260606-01/...` even though those findings were split into `-02` and `-03` in the audit-log. An operator following the breadcrumb would land on the data-uri entry. Fix: updated the comments to cite `-02` (mixed-rel) and `-03` (control-char) to match the audit-log.

## 2026-06-06 — audit-barrage lift (20260606T062311240Z-design-control)

### AUDIT-20260606-07 — Invariant test + audit-log claim guard only the resource-attr direction, leaving AUDIT-04's own `a ping` example unprotected

Finding-ID: AUDIT-20260606-07 (claude-01; codex CLEAN — convergence signature)
Status:     fixed-74b824cc (2026-06-10; via backlog TASK-1+TASK-7, operator-selected; was migrated-to-backlog TASK-1)
Severity:   low
Surface:    plugins/design-control/src/__tests__/lint/check-mockup-lofi.test.ts (coverage test); plugins/design-control/src/lint/allowlist.ts (URL_ATTRS doc)

Disposition (present-tense invariant, not a defer — reworded per AUDIT-20260606-09/codex-02): the `URL_ATTRS` doc comment now states a COMPLETE invariant: every URL-bearing attribute in the allowlist is a member of `URL_ATTRS`, so its values are scanned. That invariant holds today and is non-vacuous — the allowlist's only URL attr is `href`, which is present in `URL_ATTRS`. The RESOURCE direction is test-enforced (`RESOURCE_URL_ATTRS ⊆ URL_ATTRS`); the non-resource direction (`a ping`, `form action`, `q cite`) is vacuously satisfied because no such attr is in the allowlist. Machine-checking the non-resource direction (deriving `URL_ATTRS` from URL-tagged allowlist entries) is tracked as filed enhancement **#428** — not promised in a code comment. There is no outstanding code change while the invariant holds. (Reworded under AUDIT-20260606-14, then -17, to replace the future-patch promise and then the residual scheduling language with a bare #428 reference.)

The new test asserts `RESOURCE_URL_ATTRS ⊆ URL_ATTRS` ("every resource attr is scheme-scanned"). That direction is solid: adding `img: Set(['src'])` to `RESOURCE_URL_ATTRS` while forgetting `URL_ATTRS` fails the test. But the value-shape gate fires on `URL_ATTRS.has(attr)`, and an attribute only reaches that gate after passing `isAllowedAttr` (allowlist membership). So the failure mode that actually leaves a value *unscanned* is **allowlisted-URL-attr ∉ URL_ATTRS** — and nothing enforces that direction. The test guards `RESOURCE_URL_ATTRS → URL_ATTRS`, not `allowlist → URL_ATTRS`.

This matters because AUDIT-04's own stated motivation names `a ping` as a non-href URL attr to worry about — and `ping` is a navigation-beacon attribute, *not* resource-loading, so a future dev would add it to `TAG_ATTRS['a']` (allowlist) without touching `RESOURCE_URL_ATTRS`. Its value would then pass completely unscanned for `data:`/`javascript:`/control-char schemes, and **no test would fail**. Same for `form action`, `blockquote/q cite`, `area href`. The fix's audit-log claim ("adding a resource attr without scheme coverage now fails a test instead of shipping a latent gap") is true but narrower than AUDIT-04's framing implies — the general "URL attr" coupling it set out to close is only closed for the resource-loading subset.

The clean structural fix is to make URL-bearing-ness a property of the allowlist itself (e.g. tag the URL attrs at the point they're added to `TAG_ATTRS`/`GLOBAL_ATTRS`, and derive `URL_ATTRS` from that tagging) so the `allowlist → scanning` invariant is machine-checkable rather than relying on a dev remembering two SSOTs. Short of that, at minimum the audit-log entry and the `URL_ATTRS` doc comment should scope their guarantee honestly ("resource-loading URL attrs are test-guarded; non-resource URL attrs added to the allowlist must be manually added to `URL_ATTRS`") so the next session doesn't read "auto-scanned" and trust a guarantee that doesn't extend to `a ping`.

## 2026-06-06 — audit-barrage lift (20260606T142538039Z-design-control)

> **Lift note (TF-002 recurrence, 4th time):** the lift merged claude-01 + claude-02 + claude-03 +
> claude-04 + codex-01 under `-08`, body = the MED. Split below: `-08` (MED rel match, claude-01 +
> codex-01 cross-model), `-10` (claude-02 arbitrary read), `-11` (claude-03 lexical-path prose),
> `-12` (claude-04 SRI multi-hash). Slush OVERRIDDEN — the MED is a real regression (the round-1
> task-3 fix's exact-rel hardening was not mirrored into the new pin module); all fixed with TDD in
> the same commit that closes them.

### AUDIT-20260606-08 — stylesheet-pin reintroduced the weak `rel.includes('stylesheet')` match that AUDIT-20260606-02 closed in axis-1

Finding-ID: AUDIT-20260606-08 (claude-01 + codex-01; cross-model)
Status:     fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e
Severity:   medium
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (collectStylesheetLinks)

Disposition override: slush-merged by the lift; a real cross-model MED. Fixed in this commit — extracted `isStylesheetRel(relValue)` (exact `['stylesheet']`) to allowlist.ts and used it in BOTH the axis-1 link gate and `collectStylesheetLinks`, so the two axes share one predicate. Standalone regression test: `checkStylesheetIdentity` on `rel="stylesheet icon"` now returns `stylesheet-missing`, not `[]`.

AUDIT-20260606-01 hardened the axis-1 rel gate to require the normalized rel token set to be **exactly** `['stylesheet']` (`check-mockup-lofi.ts:132` — `rel.length !== 1 || rel[0] !== 'stylesheet'`), specifically so that `rel="stylesheet icon"` / `rel="stylesheet preload"` can't pass while pulling a non-CSS resource. The new `collectStylesheetLinks` then matches stylesheet links with `rel.includes('stylesheet')` (line 71) — the precise weaker predicate that fix removed. The two sibling modules now disagree about what counts as a stylesheet `<link>`.

The combined `lintWireframe` path is incidentally saved because axis-1 still runs and emits `disallowed-link-rel`. But `checkStylesheetIdentity` is a **public, independently-exported** function (re-exported from `lint/index.ts`) and is tested standalone. Called on its own against `<link rel="stylesheet icon" href="sketch-kit.css">`, it collects exactly one "stylesheet" link, passes path + hash, and returns `[]` — asserting a clean identity-pin for a link that is *also* loading a favicon. That is exactly the "closed channel" guarantee AUDIT-01 was protecting, re-opened in the module whose entire job is to assert that channel is closed. It also means the singleton count (`links.length`) is computed under different membership rules than axis-1, so the two axes can disagree on "how many stylesheets are here."

Fix: make the two modules share one rel predicate. Either import a single `isStylesheetRel(relValue): boolean` helper (exact `['stylesheet']`) used by both axis-1 and `collectStylesheetLinks`, or have `collectStylesheetLinks` apply the same `rel.length === 1 && rel[0] === 'stylesheet'` test. Add a standalone regression test: `checkStylesheetIdentity(page('<link rel="stylesheet icon" href="sketch-kit.css">'), pin)` must NOT return `[]` (it should treat the link as not-a-clean-stylesheet, e.g. via the missing/not-singleton path).

### AUDIT-20260606-10 — stylesheet identity-pin read the href off disk before the path-mismatch check (arbitrary file read)

Finding-ID: AUDIT-20260606-10 (claude-02)
Status:     fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (checkStylesheetIdentity)

Disposition override: slush-merged under -08; a real (LOW) security-adjacent smell. Fixed in this commit — when the href resolves off the pinned canonical path, the function now returns `stylesheet-path-mismatch` and STOPS without `readFileSync`, so an absolute or `../`-escaping href can't pull arbitrary files off disk. Regression test: `href="../../../../etc/passwd"` returns exactly `['stylesheet-path-mismatch']`.

### AUDIT-20260606-11 — "canonical path" prose implied realpath but the comparison is lexical

Finding-ID: AUDIT-20260606-11 (claude-03)
Status:     fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (StylesheetPin.canonicalPath doc)

Disposition override: slush-merged under -08; a real (LOW) doc-honesty defect. Fixed in this commit — the `canonicalPath` JSDoc now states the comparison is LEXICAL (`path.resolve`, no `realpathSync`), explains why the default `buildSketchKitPin` can't produce a spurious symlink mismatch (href and canonicalPath derive from the same `baseDir`), and bounds the explicit-canonicalPath caveat. Content identity is anchored by the hash regardless.

### AUDIT-20260606-12 — SRI integrity compared by exact string, rejecting a spec-valid multi-hash

Finding-ID: AUDIT-20260606-12 (claude-04)
Status:     fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (SRI check)

Disposition override: slush-merged under -08; a real (LOW) correctness defect. Fixed in this commit — the SRI check now tokenizes `integrity` on whitespace and tests membership (`tokens.includes(expectedHash)`), so a spec-valid `integrity="sha384-… sha256-<pinned>"` is accepted. Regression test added.

### AUDIT-20260606-09 — diff contained explicit deferred-work wording in the audit log and source comment

Finding-ID: AUDIT-20260606-09 (codex-02)
Status:     fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e
Severity:   low
Surface:    docs/1.0/001-IN-PROGRESS/design-control/audit-log.md (AUDIT-07 disposition); plugins/design-control/src/lint/allowlist.ts (URL_ATTRS comment)

Disposition override: slush-pile; a real (LOW) operator-discipline catch — my AUDIT-07 disposition + `URL_ATTRS` comment used deferral phrasing ("parked," "warranted the moment," "becomes actionable"), which `.claude/rules/agent-discipline.md` § "Just for now is bullshit" treats as bug-factory language. Fixed in this commit — both reworded to a present-tense, complete invariant ("every URL-bearing allowlist attr is in `URL_ATTRS`"; the non-resource direction is vacuously satisfied today) with the enforcement clause stated as part of the invariant, no deferral framing.

The hard constraints for this audit say to surface deferral phrases in the diff. The new audit-log disposition said the structural half "is parked with a CONCRETE TRIGGER," and the `URL_ATTRS` comment said the robust fix "is warranted the moment the allowlist grows such an attr." Those were documented deferrals, even though carefully scoped — now reworded to a present-tense invariant + enforcement clause.

## 2026-06-06 — audit-barrage lift (20260606T143340410Z-design-control)

### AUDIT-20260606-13 — SRI multi-hash fix ignores SRI's "strongest-algorithm-wins" rule — passes a pin the browser would not enforce

Finding-ID: AUDIT-20260606-13 (claude-01)
Status:     fixed-efe3f2106e8a58e28ffe87c1d5d12781b6c60595
Severity:   medium
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (SRI check)

Disposition override: slush-pile; a real MED — the round-1 AUDIT-12 SRI fix was itself spec-incorrect (any-match instead of strongest-algorithm-wins). Fixed in this commit: the SRI check now flags integrity that (a) carries a stronger-than-sha256 token (which would override the pinned sha256 in the browser) OR (b) lacks the pinned sha256 token; only a same-algorithm sha256 list containing the pin is accepted. The comment now states the strongest-algorithm-wins rule, and the test asserting `sha384-other sha256-<pinned>` is clean was corrected to assert rejection (+ a same-algo-accept test).

The AUDIT-20260606-12 fix tokenizes `integrity` and accepts the link if `tokens.includes(pin.expectedHash)` (line 146), with the comment "SRI permits a whitespace-separated list of digests; the resource is accepted if ANY listed digest matches" (lines 140-141). That description of SRI is incorrect, and the implementation inherits the error. Per the W3C SRI algorithm ("Do bytes match metadataList" → *get the strongest metadata from set*), when an `integrity` value lists digests of **different algorithms**, the user agent selects the **single strongest algorithm present** and validates against *only* those digests — the weaker ones are discarded, not OR'd in. So for the exact value the new test asserts as valid — `integrity="sha384-other sha256-<pinned>"` (test line ~131) — a browser uses `sha384-other` and **ignores** the pinned `sha256`. If `sha384-other` is not the real sha384 of the kit, the browser **rejects** the (correct) stylesheet; the lint reports `[]` (clean). The lint's guarantee ("the served page is SRI-pinned to the kit") is now weaker than it claims: it greenlights pages whose *effective* SRI digest is something other than the pin.

The direct content-hash check (lines 133-139) still anchors content identity, so this isn't a content-substitution hole — but the SRI axis exists precisely to assert the *browser-enforced* pin, and it now passes configurations the browser would not honor. Worse, the comment and the new test **cement the misunderstanding** for the next dev: the test name says "spec-valid multi-hash" for a value that is spec-valid syntax but defeats the pin semantically.

A correct fix respects strongest-algorithm semantics: since the pin only carries a `sha256`, accept iff the pinned digest is present **and** no stronger-algorithm token (`sha384-`/`sha512-`) coexists with it (a stronger token would override the sha256 in the browser); or upgrade `hashStylesheet`/the pin to emit the strongest algorithm and compare within that algorithm group. Either way, drop the "ANY listed digest matches" framing and the test asserting `sha384-other sha256-<pinned>` is clean.

---

### AUDIT-20260606-14 — Reworded URL_ATTRS "invariant" still encodes a triggered future structural fix with no tracking artifact

Finding-ID: AUDIT-20260606-14 (claude-02 + codex-01; cross-model)
Status:     fixed-efe3f2106e8a58e28ffe87c1d5d12781b6c60595
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts (URL_ATTRS comment); docs/1.0/001-IN-PROGRESS/design-control/audit-log.md (AUDIT-07 disposition)

Disposition override: slush-pile; a real cross-model LOW — the AUDIT-09 reword still left a future-structural-change promise in the comment ("the patch that first adds… replaces this hand-maintained coupling"), the IOU-in-a-comment shape the "Just for now is bullshit" rule names. Properly terminated in this commit: filed the structural-derivation work as #428, dropped the IOU sentence, and the comment now states the present invariant + a bare `tracked in #428` reference (a pointer, not a promise). The AUDIT-07 disposition below is likewise updated to reference #428.

The AUDIT-20260606-09 rework replaced the earlier "parked with a CONCRETE TRIGGER" language, but the substance of the deferral survives the rewrite. allowlist.ts lines 77-81: *"The patch that first adds a non-resource URL attr to the allowlist adds it here in the same change AND **replaces this hand-maintained coupling with URL-tagged allowlist entries** that derive this set."* That clause describes the robust structural fix AUDIT-07 actually asked for (derive `URL_ATTRS` from URL-tagged allowlist entries so `allowlist → scanning` is machine-checkable) as conditional future work, gated on a trigger, recorded only in a code comment — no GitHub issue, no workplan task. The same shape is in the audit-log disposition.

Per the project's own `.claude/rules/agent-discipline.md` § "Just for now is bullshit", a deferral must terminate in one of: addressed now, filed as an issue with link, scoped into the workplan, or an explicit operator decision with acceptance criteria — and "a code comment promising future work" is explicitly named as the failure mode, not a valid disposition. The hard constraints for this audit also direct surfacing deferral phrasing found in the diff. The rewording is genuinely better (the *present* state is described as a complete-while-vacuous invariant, which is accurate), so the latent coupling itself is correctly characterized — but the structural fix is still IOU'd in a comment rather than tracked. I flag it acknowledging it was already triaged once under AUDIT-09; the recommendation is narrow: either file the structural-derivation work as an issue and reference the number in the comment, or drop the "the patch that first adds… replaces this hand-maintained coupling" sentence entirely (the vacuous-today invariant stands on its own without promising the future refactor).

## 2026-06-06 — audit-barrage lift (20260606T143934682Z-design-control)

### AUDIT-20260606-15 — SRI fix flags legitimately-stronger (sha384/sha512) pins as a mismatch and tells the operator a true pin is "defeating the pin"

Finding-ID: AUDIT-20260606-15 (claude-01)
Status:     fixed-a7c1ef0e5c13778e2d706707a5ea9fd2e723db39
Severity:   medium
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (SRI check)

Disposition override: slush-pile; a real MED over-rejection (my round-2 sha256-only guard flagged a legitimately-stronger pin as "defeating the pin"). Fixed with the BETTER fix the AUDIT-13 disposition named, not the minimum reword: `buildSketchKitPin` now computes the kit's digest at sha256/sha384/sha512 (`expectedSri`), and the SRI check selects the strongest algorithm present in the integrity and verifies one of its tokens equals the kit's digest AT THAT ALGORITHM. So `sha384-<kit-sha384> sha256-<kit-sha256>` is ACCEPTED (stronger, correct), `sha384-wrong …` is rejected, and an unrecognized-algorithm-only integrity is rejected. Message no longer overstates ("defeating the pin" removed).

The new guard is `if (hasStrongerAlgo || !tokens.includes(pin.expectedHash))`, where `hasStrongerAlgo = tokens.some((t) => /^sha(?:384|512)-/i.test(t))` (lines 150-152). This correctly closes the false-*negative* the prior any-match reading opened — I verified there's no way to greenlight a page the browser wouldn't enforce, because for an all-sha256 list the browser validates every sha256 token and the content-hash check (133-138) already anchors the served bytes to the pin. That direction is sound.

The problem is the false-*positive* direction. Because the pin is sha256-only (`hashStylesheet`, line 48-49), the guard flags *every* page that pins with a stronger algorithm — including the common best-practice case `integrity="sha384-<genuine-hash-of-the-kit> sha256-<pinned>"`, where the sha384 token IS the real digest of the kit. In that case the browser uses sha384, it matches, and the page is *more* securely pinned than sha256 — yet the lint emits `stylesheet-sri-mismatch` with the message "carries a stronger-than-sha256 token that overrides the pinned … in the browser" (line 157). The message asserts the pin is *defeated* when it is actually *strengthened*; the comment at 146-147 makes the same overstatement ("would override the sha256 … defeating the pin"). The lint cannot distinguish "stronger token that matches the kit" from "stronger token that doesn't" because it only holds the sha256 digest — that's the real limitation, and it's not documented at the surface. The disposition for AUDIT-13 names the correct fix ("upgrade `hashStylesheet`/the pin to emit the strongest algorithm and compare within that algorithm group") but the conservative path was taken without recording that an adopter who upgrades their SRI to sha384/sha512 will now get a hard lint failure. Minimum fix: reword the comment + message to say "this lint only verifies a sha256 pin; a stronger-algorithm token cannot be verified against the pin and is therefore flagged" (accurate) rather than "defeating the pin" (false for the genuine-stronger-hash case). Better fix: emit the pin at the strongest algorithm so the secure path passes.

### AUDIT-20260606-16 — No test covers sha512 or the stronger-algorithm-only case; coverage asserts only the sha384 + sha256 shape

Finding-ID: AUDIT-20260606-16 (claude-02)
Status:     fixed-a7c1ef0e5c13778e2d706707a5ea9fd2e723db39
Severity:   low
Surface:    plugins/design-control/src/__tests__/lint/stylesheet-pin.test.ts

Disposition override: slush-pile; a real (LOW) test-coverage gap. Fixed in this commit — added a sha512 strongest-algo case (accept real / reject wrong), a stronger-algo-only case, and a no-recognized-algorithm case, so both message branches and all three algorithms are exercised.

The two new tests cover exactly one stronger-algo shape (`sha384-other <pin>` → rejected) and one same-algo shape (`sha256-decoyAAAA <pin>` → accepted). The `hasStrongerAlgo` regex matches `sha512-` too (line 151), but nothing exercises it — a regression that dropped `512` from the alternation would pass the suite while silently letting a sha512-overriding integrity through the membership branch. Likewise there is no test for the stronger-algo-*only* case (`integrity="sha384-foo"` with no sha256 token at all), which routes through the `hasStrongerAlgo` branch and produces the "overrides the pinned" message rather than the "does not assert the pinned" message — the two message branches at 156-158 are a behavior contract and only one is asserted. Add: (a) a sha512-token rejection case, and (b) a stronger-algo-only case asserting `stylesheet-sri-mismatch`. This is hygiene, not a live bug — the implementation is correct for these inputs today; the gap is that the test suite wouldn't catch a future narrowing of the regex or a swap of the two message branches.

I checked the security-critical direction (no false-negative / no path that greenlights an unenforced pin), the `#428` reference (issue exists and is OPEN — disposition grounded), the regex for backtracking/anchoring issues (clean), the empty/garbage-integrity edge cases (all flagged correctly), and the audit-log rewordings for residual deferral phrasing (the AUDIT-07 reword and the allowlist comment now terminate in the `#428` pointer, no IOU). Those are clean; the two findings above are the only ones worth surfacing.

### AUDIT-20260606-17 — URL_ATTRS comment still contains conditional future-work wording

Finding-ID: AUDIT-20260606-17 (codex-01)
Status:     fixed-a7c1ef0e5c13778e2d706707a5ea9fd2e723db39
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts (URL_ATTRS comment); docs/1.0/001-IN-PROGRESS/design-control/audit-log.md (AUDIT-07 disposition)

Disposition override: slush-pile; a real (LOW) residual of AUDIT-14 — the #428 reference still carried scheduling language ("to be done when the allowlist first gains a non-resource URL attr"). Fixed in this commit — both the comment and the AUDIT-07 disposition now read "tracked as filed enhancement #428" with no scheduling clause.

The diff removes the untracked promise shape, but the replacement still says the machine-checking work is “tracked in #428 — to be done when the allowlist first gains a non-resource URL attr.” That is still conditional future-work wording in a code comment, and the audit prompt’s hard constraint explicitly says to surface deferral phrasing found in the diff.

The issue link is a real improvement over the previous untracked comment, so this is narrower than AUDIT-20260606-14. The code comment should state the current invariant and reference `#428` without scheduling language. The audit-log disposition should mirror that wording so the record does not reintroduce the same operator-discipline smell it is claiming to close.

## 2026-06-06 — audit-barrage lift (20260606T144629059Z-design-control)

### AUDIT-20260606-18 — SRI algorithm-prefix comparison is case-sensitive — a browser-valid uppercase-prefixed integrity (e.g. `SHA384-<correct-digest>`) is flagged as a mismatch

Finding-ID: AUDIT-20260606-18 (claude-01 + codex-01; cross-model)
Status:     fixed-2fe77b14043eef692c0bb2b788cbc2cd5f76695e
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (SRI check)

Disposition: LIFTED from slush at operator request and FIXED in this commit. (Initially slushed at the round-4 0-HIGH/0-MED convergence; the operator chose to lift the cross-model case-sensitivity false-positive.) The lift had merged three sub-findings here (TF-002, 5th occurrence) — split into `-18` (this; case), `-19` (`?options`), `-20` (the dedup INFO). Fix: a single `normalizeSriToken` helper strips a trailing `?options` and lowercases ONLY the algorithm prefix (the base64 payload stays case-sensitive); detection, filtering, and membership all run on normalized tokens. Regression test: an uppercase `SHA384-<kit-digest>` integrity now returns `[]`.

The strongest-algorithm *detection* normalizes case (`tokens.some((t) => t.toLowerCase().startsWith(\`${algo}-\`))`, line 164, and the filter at line 173 likewise lowercases). But the *match* at line 174 — `strongestTokens.includes(pin.expectedSri[strongest])` — compares the **original-case** token against the always-lowercase expected value produced by `hashStylesheet` (`\`${algo}-\` + ...`, line 55, where `algo` is a lowercase `SriAlgo`). Per W3C SRI, the algorithm token is matched ASCII-case-insensitively (the grammar derives from CSP's case-insensitive `hash-algorithm` production; Chromium/Firefox lowercase it before lookup), so `integrity="SHA384-<genuine-kit-sha384>"` is a fully browser-honored, correct pin. This lint detects `strongest = 'sha384'` correctly but then `strongestTokens = ['SHA384-<digest>']` will never `.includes('sha384-<digest>')`, so it emits `stylesheet-sri-mismatch` against a correct, browser-enforced pin.

This is the same false-positive *class* that AUDIT-20260606-15 set out to close (telling the operator a true pin is broken), just via a different vector — case rather than algorithm strength. The fix is one line: normalize the token before membership, e.g. `tokens.map((t) => t.toLowerCase())` when building `strongestTokens`, or compare `t.toLowerCase() === pin.expectedSri[strongest]` (the expected value is already lowercase). A regression test with an uppercase or mixed-case algorithm prefix (`SHA384-…`) asserting `[]` would lock it in; none of the new tests exercise non-lowercase prefixes.

### AUDIT-20260606-19 — SRI `?options` suffix (spec-valid) on a correct digest is flagged as a mismatch

Finding-ID: AUDIT-20260606-19 (claude-02)
Status:     fixed-2fe77b14043eef692c0bb2b788cbc2cd5f76695e
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (SRI check)

Disposition: LIFTED + FIXED alongside -18 (same `normalizeSriToken` helper). The W3C SRI grammar is `hash-expression *("?" option-expression)`; the browser strips a trailing `?options` and validates the digest, so `integrity="sha384-<kit-digest>?foo=bar"` is a correct pin. `normalizeSriToken` now strips `?options` before comparison. Regression test added.

### AUDIT-20260606-20 — `expectedHash` duplicates `expectedSri.sha256` with no single-source guarantee in the type

Finding-ID: AUDIT-20260606-20 (claude-03)
Status:     informational
Severity:   informational
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (StylesheetPin)

Informational (no live bug): `buildSketchKitPin` is the only constructor of a pin and computes `expectedHash` and `expectedSri.sha256` from the same bytes, so they cannot drift in practice. The `StylesheetPin` interface does technically permit a hand-built pin to set them divergently. Recorded as an observation; the content check retains `expectedHash` for its own (non-SRI) identity assertion and the back-compat of existing callers/tests. No code change.

## 2026-06-06 — audit-barrage lift (20260606T150955447Z-design-control)

### AUDIT-20260606-21 — Base64-case-preservation — the central novel behavior of `normalizeSriToken` — is only incidentally tested; no test directly asserts a wrong-case payload is rejected

Finding-ID: AUDIT-20260606-21
Status:     fixed-ec6308cb (2026-06-10; via backlog TASK-2, operator-selected; was migrated-to-backlog TASK-2)
Severity:   low
Surface:    plugins/design-control/src/__tests__/lint/stylesheet-pin.test.ts:171-191 (and the helper at plugins/design-control/src/lint/stylesheet-pin.ts:80-86)

The entire reason `normalizeSriToken` slices at the first dash instead of calling `.toLowerCase()` on the whole token is to keep the base64 payload case-sensitive (the disposition for AUDIT-18 states this explicitly: "the base64 payload stays case-sensitive"). That is the load-bearing invariant of the fix — yet no test asserts it directly. The two new tests (lines 175-191) exercise (a) an uppercase *prefix* on a correct digest and (b) a `?options` suffix on a correct digest; neither plants a token whose *payload* case is mangled and asserts `stylesheet-sri-mismatch`. The uppercase-prefix test guards the "lowercase everything" regression only *incidentally* — it relies on the real sha384 digest's base64 happening to contain mixed-case characters (statistically near-certain for 48 random bytes, but not an asserted property). A refactor that changed `normalizeSriToken` to `noOptions.toLowerCase()` would be caught today, but only by luck of the fixture's digest; a refactor that lowercased the payload of a *user-supplied* token while leaving the expected value alone could slip a genuinely-wrong (case-mangled) digest past the lint, and the suite wouldn't say so in its own voice.

Two narrower gaps compound this: the new normalize tests are sha384-only (the sha512 strongest path through `normalizeSriToken` is unexercised — the same shape AUDIT-16 flagged for the strength feature), and there is no test combining uppercase-prefix *with* `?options` or a stronger-algo-only token carrying options, so the interaction of the two new normalization steps is untested.

A reasonable fix: add (1) a test planting `sha384-<correct-digest-with-one-payload-char-case-flipped>` asserting `stylesheet-sri-mismatch` (this is the direct assertion that payload case matters), (2) a sha512 uppercase-prefix accept case, and (3) one combined `SHA384-<digest>?foo=bar` accept case. These lock the invariant the disposition claims rather than leaning on the fixture's entropy.

## 2026-06-06 — audit-barrage lift (20260606T155241942Z-design-control)

### AUDIT-20260606-22 — Decomposed (NFD) accented Latin produces false positives — combining diacritical marks are rejected while only precomposed forms are accepted

Finding-ID: AUDIT-20260606-22 (claude-01)
Status:     fixed-39f4c4e952e3eb313e4ea42023cc02f748d1bd40
Severity:   low
Surface:    plugins/design-control/src/lint/codepoint.ts (findDisallowedCodepoints)

Disposition override: slush-pile; a real LOW false-positive on the feature's own "accented Latin" contract, in the operator's own OS (macOS emits NFD). Fixed in this commit — `findDisallowedCodepoints` now NFC-normalizes the text before scanning, so decomposed accented Latin composes to its allowlisted precomposed form. Same false-positive class as the lifted SRI findings (-18/-19). Regression test: NFD `café`/`Zürich` returns `[]`.

`isAllowedCodepoint` permits precomposed accented Latin (`é` = U+00E9, `ü` = U+00FC, etc. via the U+00C0–U+00FF and U+0100–U+017F ranges) but rejects the U+0300–U+036F combining-mark block, which is not in any allowed set. parse5 does not Unicode-normalize text content (it normalizes only line endings), so an NFD-normalized text node — `e` + combining acute (U+0301), or `u` + combining diaeresis (U+0308) — survives to the walk unchanged and yields a `disallowed-codepoint` finding on the combining mark. The same visible string `café`/`Zürich` therefore passes in NFC and **fails in NFD**.

This matters because the feature's stated contract (workplan: "permit … enumerated accented Latin") and the test suite's own canonical "this is allowed" case (`'café naïve Zürich Łódź Œuvre señor ÿ'`, line 39) establish accented Latin as a first-class permitted category. NFD is not exotic — macOS filesystem APIs emit NFD, and pasted text from assorted sources is frequently NFD — so a wireframe author writing legitimately-accented prose can get a hard lint failure that asserts their correct text is "designed typography outside the lo-fi allowlist." That is the same false-positive class (telling the operator a correct artifact is broken) the AUDIT-15/18/19 SRI fixes set out to close, just via the normalization vector instead of case/options. Reasonable fix: NFC-normalize each text node (`content.normalize('NFC')`) before scanning in `findDisallowedCodepoints` or at the `checkText` boundary, with a regression test planting an NFD `café`/`Zürich` asserting `[]`. If NFC input is instead being assumed as an invariant, that assumption should be documented at the `codepoint.ts` header and asserted somewhere, rather than left implicit.

### AUDIT-20260606-23 — Cross-text-node duplicate `disallowed-codepoint` findings carry no positional disambiguation

Finding-ID: AUDIT-20260606-23 (claude-02)
Status:     informational
Severity:   informational

Disposition: WON'T-DO (accepted observation, no change planned — reworded per AUDIT-20260606-26 to drop deferral phrasing). Position-less findings are the established, consistent pattern across this entire lint; cross-node duplicate `disallowed-codepoint` messages match that pattern and are neither a regression nor a correctness bug. No code change. Original auditor note follows.
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts:137-144 (`checkText`) + codepoint.ts:79-91 (`findDisallowedCodepoints`)

`findDisallowedCodepoints` dedupes per call (per text node), and the unit test at codepoint.test.ts:64-71 correctly asserts that. But `checkText` is invoked once per text node during the walk, and the pushed finding carries only `{ rule, message }` with no element/line/offset. So the same disallowed codepoint appearing in N separate text nodes (e.g. an emoji used as an icon in 10 buttons) produces N byte-identical findings — `disallowed codepoint U+1F389 ("🎉") in text content …` ×10 — which is pure noise to the operator since nothing distinguishes the occurrences. The workplan phrasing "deduped per codepoint" reads as a per-codepoint guarantee that holds within a node but not across the document.

This matches the existing position-less finding pattern in this lint, so it is not a regression and not a correctness bug — flagging it as informational. If the operator wants either (a) global per-document dedup of identical messages, or (b) positional context added to findings so duplicates become meaningful, that is a small enhancement at the `checkText`/walk boundary. As-is, a wireframe that reuses one off-allowlist glyph widely will emit a long run of identical findings.

## 2026-06-06 — audit-barrage lift (20260606T155832617Z-design-control)

### AUDIT-20260606-24 — Test only covers the accept path — the NFC-vs-strip invariant (combining marks still rejected when they can't compose) is unasserted

Finding-ID: AUDIT-20260606-24 (claude-01)
Status:     fixed-e281dad397e42a9afae5727acb312e671e27df0d
Severity:   low
Surface:    plugins/design-control/src/__tests__/lint/codepoint.test.ts

Disposition override: slush-pile; a real (LOW) test-integrity gap (same shape as AUDIT-21). Fixed in this commit — added a test asserting a non-composable combining mark (`String.fromCodePoint(0x0301)`, and `1` + the mark) is STILL flagged, directly pinning "NFC composes, it does not strip" rather than leaning on the accept-fixture's properties.

The fix's load-bearing design choice is *compose-where-possible* (NFC), **not** *strip all combining marks*. The two behaviors are observationally identical for the new test's input (`café Zürich` in NFD, where every combining mark has a composable base in the allowlisted ranges) but diverge on a combining mark that has **no** composable base — e.g. a leading `U+0301`, or a combining mark on a non-composing base like `1\u0301`. NFC leaves those untouched, so the lint must still emit `disallowed-codepoint` for them; a hypothetical strip-based "fix" would wrongly accept them. The new test (lines 75-78) asserts only the accept path (`expect(findDisallowedCodepoints(nfd)).toEqual([])`); nothing in the visible suite asserts the inverse — that a non-composable combining mark survives normalization and is *still* flagged.

This is the same shape the operator flagged in AUDIT-20260606-21 for the SRI fix: the suite verifies the invariant the disposition *claims* only incidentally, leaning on the fixture's properties rather than asserting the boundary directly. A reasonable lock-in: add a test planting a lone/non-composable combining mark (`findDisallowedCodepoints('\u0301')` or `'1\u0301'`) and asserting it returns `[{ codepoint: 0x0301, ... }]`. That directly pins "NFC composes, it does not strip," which is the property the disposition rests on.

### AUDIT-20260606-25 — NFC compose-boundary is narrower than the docstring implies — accents whose precomposed form falls outside the allowlisted ranges still fail in NFD

Finding-ID: AUDIT-20260606-25 (claude-02)
Status:     fixed-e281dad397e42a9afae5727acb312e671e27df0d
Severity:   informational
Surface:    plugins/design-control/src/lint/codepoint.ts (findDisallowedCodepoints docstring)

Disposition: fixed in this commit (doc-honesty; not a code bug). The docstring now qualifies that NFC rescues NFD input ONLY when the precomposed form is in the allowlisted ranges (Latin-1 Supplement / Latin Extended-A), states that off-allowlist accents (e.g. `Ǎ`=U+01CD) correctly fail in both NFC and NFD, and that NFC composes but does not strip.

The new docstring (lines 78-81) states NFD accented Latin "composes to its precomposed allowlisted form rather than tripping the combining-mark block." That is true only when the precomposed form lands in the allowlisted ranges (per AUDIT-22: U+00C0–U+00FF and U+0100–U+017F). For accented Latin whose precomposed form lives in Latin Extended-B (e.g. `Ǎ` = `A`+caron → U+01CD, outside U+0100–U+017F) or for marks with no precomposed form at all, NFC composition either produces a still-disallowed codepoint or leaves the combining mark in place — so the NFD input still fails.

This is **not a correctness bug** — the behavior is now consistent between NFC and NFD input (NFD `Ǎ` and precomposed `Ǎ` both fail because U+01CD is genuinely off-allowlist), which is the correct invariant. I'm flagging it only because the docstring reads as an unconditional "NFD accented Latin now passes" claim, and a future reader could mistake a legitimately-off-allowlist NFD failure for a regression of this fix. A one-clause qualifier ("…for accents whose precomposed form is in the allowlisted ranges") would make the boundary explicit and prevent that misread.

### AUDIT-20260606-26 — AUDIT-20260606-23 disposition uses soft-deferral phrasing ("not done now" / "optional future enhancement") without an issue link

Finding-ID: AUDIT-20260606-26 (claude-03 + codex-01; cross-model)
Status:     fixed-e281dad397e42a9afae5727acb312e671e27df0d
Severity:   low
Surface:    docs/1.0/001-IN-PROGRESS/design-control/audit-log.md (AUDIT-20260606-23 disposition)

Disposition override: slush-pile; a real cross-model LOW — my AUDIT-23 disposition reintroduced the deferral phrasing ("not done now", "optional future enhancement") that the project's "Just for now is bullshit" rule forbids and that I'd been closing elsewhere this session. Fixed in this commit — the AUDIT-23 disposition is reworded to a definitive WON'T-DO ("no change planned"; position-less findings are the established pattern), no scheduling or speculative-work language.

The new AUDIT-23 disposition records an informational observation and twice frames the remediation as deferred-but-coming: "Global per-document message dedup or positional context is an optional future enhancement at the `checkText`/walk boundary; **not done now**" (line 521) and "that is a small enhancement at the `checkText`/walk boundary" (line 526). Per the project's own discipline (`.claude/rules/agent-discipline.md` § "Just for now is bullshit") and the prior triage note at the top of this audit-log that explicitly flagged conditional future-work wording ("to be done when…"), "not done now" reads as the same soft-IOU smell — it implies the work *will* happen without any tracking surface to ensure it does.

The audit prompt's hard constraint also directs surfacing deferral phrasing found in the diff. An informational "no code change" disposition is legitimate, but the wording should commit one way or the other: either file an issue and reference it (`tracked in #NNN`), or state it as an accepted observation that is *not* planned ("position-less findings are the established pattern for this lint; no change planned"). Rewriting to drop "not done now" / "future enhancement" and adopting won't-do/issue-linked framing keeps the record from reintroducing the exact operator-discipline smell the surrounding entries have been closing.

## 2026-06-10 — lint adversarial barrage (runs 20260610T184044970Z + 20260610T184725158Z; codex + claude/fable via stackctl)

Triage notes: every defeating-input below was VERIFIED by executing the real lint
(not the auditor's prediction) before recording. Same-root-cause cross-model
findings are folded into one entry; distinct mechanisms stay separate (TF-002).
Per the backlog-first intake rule (plugin CLAUDE.md, 2026-06-10), each
work-bearing finding is captured into the installation backlog; the operator
selects work out. Claude's first pass timed out at 300s with zero output — the
TF-003 600s fix had landed only in the unread .dw-lifecycle config copy;
re-landed in .stack-control/audit-barrage-config.yaml (b0a8b24f) and re-fired.

### AUDIT-20260610-01 — Stylesheet pin is opt-in: bare `lintWireframe(html)` admits any local stylesheet

Finding-ID: AUDIT-20260610-01 (gpt-5-02 + fable-02; cross-model — HIGH-confidence)
Status:     fixed-f068e6af (2026-06-10; axis-1 kit-filename + singleton census; RESIDUAL stated in-code: a local non-kit file NAMED sketch-kit.css passes bare axis-1 — identity stays the pin's job)
Backlog:    TASK-8
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (stylesheetPin optional)

Without `options.stylesheetPin` no singleton/path/hash check runs; axis-1 accepts any
relative `<link rel="stylesheet" href="theme.css">` (not external, no bad scheme), so a
polished local stylesheet rides under a green lint — "lint green ⇒ lo-fi" does not hold
at the bare-function level. Verified: `ok=true`, zero findings. Candidate fixes: pure
axis-1 rejects any stylesheet href that is not the kit's canonical name, or the pin
becomes non-optional at every verb/skill call site (with the bare function documented
as axis-1-only).

### AUDIT-20260610-02 — Kit themes defeat the inertness premise: `class` alone switches designed typography/color/grid imagery under a green PINNED lint

Finding-ID: AUDIT-20260610-02 (fable-01; single-model, behaviorally verified)
Status:     acknowledged-mockups/sketch-kit/DECISION.md (2026-06-10; themes are the operator-sanctioned lo-fi surface — invariant wording amended in 3949b6b1; expected-theme pinning is a Phase-4 manifest concern)
Backlog:    TASK-9
Severity:   high
Surface:    plugins/design-control/src/lint/allowlist.ts (class inertness premise) + assets/sketch-kit (theme system)

`<body class="sk sk-theme-blueprint">` under a VERIFIED pin renders bundled designed
typefaces (Space Mono / Patrick Hand), a full palette, and a linear-gradient grid
background — via the exact channel (class values) axis-1 declares permitted-but-inert.
Verified: `ok=true` with the pin. The round-8 inertness invariant is false against the
file the pin certifies. Tension with the operator-approved multi-theme decision
(mockups/sketch-kit/DECISION.md: the three themes ARE the kit's lo-fi languages) —
needs an operator call: either the themes are lo-fi-by-definition (amend the invariant
wording to "inert excluding the closed `.sk-*` vocabulary") or theme-switching is an
authoring-time decision the lint should pin (e.g. expected-theme in the manifest).

### AUDIT-20260610-03 — Transitive font resources are not identity-pinned

Finding-ID: AUDIT-20260610-03 (gpt-5-01; single-model, behaviorally verified)
Status:     fixed-f9abab31 (2026-06-10; pin carries expectedFonts from the shipped kit; present-but-different font rejects, absent falls back)
Backlog:    TASK-10
Severity:   high
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (pin hashes CSS bytes only)

The pin certifies `sketch-kit.css` bytes; the `@font-face src: url("fonts/*.woff2")`
files the CSS loads are not hashed. A swapped brand/icon font renders polished
typography while pin + lint stay green. Candidate fix: extend `buildSketchKitPin` to
hash the kit's font manifest (the sketch-kit SSOT module already exports the font
paths) and verify on disk at pin-build time.

### AUDIT-20260610-04 — ASCII-art imagery channel through `<pre>` (and preserved whitespace generally)

Finding-ID: AUDIT-20260610-04 (gpt-5-03 HIGH + fable-07 low; cross-model on the channel, severity disagreement)
Status:     fixed-0bdccc5c (2026-06-10; pre removed from ALLOWED_TAGS — preserved whitespace was THE art channel; inline code stays)
Backlog:    TASK-11
Severity:   high
Surface:    plugins/design-control/src/lint/codepoint.ts (whitespace/punctuation imagery)

A logo/wordmark rendered as ASCII art in `<pre>` uses only allowlisted codepoints +
preserved whitespace. Verified: `ok=true`. Codex grades it HIGH (branding imagery);
claude grades it low (plausibly within structure-and-flow). Disposition needs the
operator's read on whether ASCII art violates the lo-fi guarantee; candidate
mechanical fixes (whitespace-run/line-art heuristics, `<pre>` removal from the
allowlist) each have over-rejection costs.

### AUDIT-20260610-05 — Attribute VALUES are never codepoint- or semantics-scanned (meta theme-color / color-scheme; title/aria glyph channels)

Finding-ID: AUDIT-20260610-05 (gpt-5-04 + fable-03 + fable-07c; cross-model — HIGH-confidence on the channel)
Status:     fixed-d7f4025a (2026-06-10, via AUDIT-20260610-19 — recurrence pressure promoted it from the parked backlog)
Backlog:    TASK-12
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts + check-mockup-lofi.ts (attr values beyond URL_ATTRS unconstrained)

`<meta name="theme-color" content="#ff0066">` paints browser chrome with brand color;
`color-scheme` flips dark mode; `title`/`aria-*`/`id` values accept any codepoints
(𝐃𝐞𝐬𝐢𝐠𝐧𝐞𝐝 tooltips). Verified: `ok=true`. The codepoint allowlist guards text nodes
only; the URL checks guard url-kind attrs only — everything else is an unscanned value
channel. Candidate fix: extend the kind vocabulary (74b824cc's `plain`/`url`) with a
value-policy per attr (e.g. `meta name` restricted to an enumerated set; codepoint-scan
human-visible value attrs).

**Recurrence (2026-06-10 round 2):** both halves independently re-surfaced — codex
gpt-5-03 (theme-color, MED) and claude fable5-04 (title-attr glyphs, informational).
Still parked as backlog TASK-12 per the dampener rewiring; the recurrence count now
argues for selection.

### AUDIT-20260610-06 — `integrity` is rejected by axis-1, so the pin's SRI branch is unreachable on any lint-green document

Finding-ID: AUDIT-20260610-06 (fable-04; single-model, behaviorally verified)
Status:     fixed-70c2c320 (2026-06-10, via AUDIT-20260610-20 — second surfacing promoted it from the parked backlog)
Backlog:    TASK-13
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts (link attrs) vs stylesheet-pin.ts (SRI verification)

Authoring the recommended hardening — a correct `integrity` digest on the kit link —
yields `disallowed-attribute`; the entire `normalizeSriToken`/strongest-algorithm
machinery (AUDIT-15/18/19/21 hardened) can never fire on a document axis-1 accepts.
Verified: `ok=false` with a CORRECT sha384. The two axes contradict. Fix: allowlist
`integrity` (kind: plain — its value is verified by axis-1.5, not URL-scanned), or
document SRI-must-be-absent and delete the dead branch.

### AUDIT-20260610-07 — Charset differential: the lint judges the caller's UTF-8 decode; the browser honors `<meta charset>`

Finding-ID: AUDIT-20260610-07 (fable-05; single-model)
Status:     migrated-to-backlog TASK-14
Backlog:    TASK-14
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (decoded-string API; charset unvalidated)

A wireframe stored in a declared legacy encoding renders different glyphs in the
browser than the UTF-8 string the lint scanned — a typography channel the codepoint
axis structurally cannot see. Not behaviorally probed (requires byte-level fixture);
mechanism confirmed by API shape (lint takes a decoded string; parse5 ignores meta
charset). Candidate fix: reject any `<meta charset>` other than utf-8 (cheap,
closes the differential).

### AUDIT-20260610-08 — Over-rejection: `label for` + `<input>` (structure-and-flow form controls)

Finding-ID: AUDIT-20260610-08 (gpt-5-05; single-model, behaviorally verified)
Status:     fixed-d3137b5d (2026-06-10, via AUDIT-20260610-24 — fourth surfacing promoted it from the parked backlog)
Backlog:    TASK-15
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts (element/attr omissions)
Direction:  false-positive

A legitimate lo-fi search-form wireframe (`<label for="q">` + `<input id="q"
placeholder="Query">`) is rejected (`disallowed-attribute(for)`,
`disallowed-element`). Verified. Form controls are structure, not polish. Fix needs
kind decisions per 74b824cc's vocabulary (input/type/placeholder/for all plain) and a
view on which controls belong (input/textarea/select/option?) — feeds the
positive-corpus task directly.

### AUDIT-20260610-09 — `EXTERNAL_URL_RE` misses backslash-authority hrefs

Finding-ID: AUDIT-20260610-09 (fable-06; single-model)
Status:     migrated-to-backlog TASK-16
Backlog:    TASK-16
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts (EXTERNAL_URL_RE)

`href="\\cdn.example.com\theme.css"` normalizes (WHATWG) to protocol-relative and
fetches remotely, but the regex requires literal `//`. Confined to the no-pin mode
(pinned mode catches it as path-mismatch), so low. Fix: normalize `\` → `/` before
the external test.

### AUDIT-20260610-10 — `media` can mute the pinned kit (informational)

Finding-ID: AUDIT-20260610-10 (fable-07a; single-model)
Status:     informational
Severity:   informational
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts (media not constrained)

`media="(min-width:99999px)"` passes the pin while the kit never applies — green
guarantees the kit is *linked*, not *in effect*. Renders as browser-default (not
polish), so observation only; recorded because it narrows the inertness reasoning's
stated precondition. No backlog item — informational entries are not work.

**Recurrence + supersession (2026-06-10 round 2):** codex independently re-found the
channel as gpt-5-04 (MED) — cross-round, cross-model. Superseded-by AUDIT-20260610-13,
which fixes it (media removed from link's allowlist, ee1537ab).

## 2026-06-10 — lint adversarial barrage ROUND 2 (run 20260610T192041895Z; codex + claude, full fleet)

Triage notes: fired after the round-1 fixes (f068e6af, 0bdccc5c, f9abab31,
3949b6b1). Every claim verified by executing the real lint before recording.
Claude additionally ran a grounded-CLEAN sweep (entities, foreign content,
noscript, second-stylesheet smuggling, font substitution) — all closed in pin
mode; "pin-mode polish leakage via parser/encoding/namespace channels: none
found." Round verdict: NOT converged (HIGHs present). Recurrences of parked
MEDs noted on their entries (AUDIT-05: gpt-5-03 theme-color + fable5-04 title
glyphs both re-surfaced; still parked as backlog TASK-12).

### AUDIT-20260610-11 — The pin is opt-in at the API level: the unsafe configuration is the default call

Finding-ID: AUDIT-20260610-11 (gpt-5-01 HIGH + fable5-01; cross-model — HIGH-confidence)
Status:     fixed-2f28003b (2026-06-10; pin REQUIRED at lintWireframe — pin-less call throws; lintWireframeStructural carries the no-guarantee axes; barrage prompt re-aimed at the pinned contract)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (LintOptions.stylesheetPin was optional)

Round-1's axis-1 narrowing (AUDIT-01, f068e6af) reduced the bare-call exposure but
the residual WAS the API shape: a designed local file named sketch-kit.css passed
the default invocation green. Both models converged on the contract-level framing
("the guarantee under audit is about lintWireframe(html), and in its default shape
that guarantee does not hold"). Fix splits the entry points: guarantee-bearing
lintWireframe requires the pin and throws without it (no fallbacks);
lintWireframeStructural is the explicitly non-guarantee filesystem-free form.

### AUDIT-20260610-12 — code+br punctuation rows reconstruct pixel-art imagery after the pre removal

Finding-ID: AUDIT-20260610-12 (gpt-5-02; single-model, behaviorally verified)
Status:     fixed-a0fb33ca (2026-06-10; axis-2 punctuation-density rule — >=8 non-ws codepoints at >=80% punctuation rejects; bounds the channel, referee stays the text-as-imagery backstop)
Severity:   high
Surface:    plugins/design-control/src/lint/codepoint.ts + check-mockup-lofi.ts checkText

The round-1 pre removal closed preserved-whitespace art; gpt-5-02 rebuilt the
wordmark from dense punctuation rows with br row control (verified ok=true pinned,
pre-fix). The channel is punctuation MASS — alternation defeats run-detection, so
the rule is density-shaped, with copy-shaped acceptance fixtures guarding the
specificity arm.

### AUDIT-20260610-13 — link media mutes the pinned kit (cross-round recurrence of AUDIT-10)

Finding-ID: AUDIT-20260610-13 (gpt-5-04 MED + round-1 fable-07a; cross-round, cross-model)
Status:     fixed-ee1537ab (2026-06-10; media removed from link's allowlisted attrs)
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts (link attrs)

media="print" passed the pin while the browser never applied the kit on screen —
green meant LINKED, not IN EFFECT. Two models across two rounds independently
found the channel; no kind decision makes the attr safe, and wireframes have no
print-styling use case. Supersedes informational AUDIT-20260610-10.

### AUDIT-20260610-14 — Over-rejection: cache-bust query/fragment on the kit href (axes disagreed)

Finding-ID: AUDIT-20260610-14 (fable5-03; single-model, behaviorally verified)
Status:     fixed-d2b04dc1 (2026-06-10; pin strips ?# before compare AND read, mirroring axis-1's basename handling)
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts
Direction:  false-positive

`sketch-kit.css?v=2` tripped stylesheet-path-mismatch (resolve kept the suffix)
while axis-1 accepted the same href. Fixed with a tampered-bytes-through-suffixed-
href fixture proving the identity check still fires.

### AUDIT-20260610-15 — Over-rejection: Romanian comma-below letters (Latin Extended-B boundary)

Finding-ID: AUDIT-20260610-15 (gpt-5-05; single-model, behaviorally verified)
Status:     fixed-d2b04dc1 (2026-06-10; enumerated U+0218–U+021B extension; rest of Extended-B stays rejected)
Severity:   low
Surface:    plugins/design-control/src/lint/codepoint.ts (accented-Latin allowlist)
Direction:  false-positive

"Conținut și acțiuni" — genuine lo-fi structural copy — was rejected; Ș/ș/Ț/ț sit
one block past the Extended-A ceiling. Four-codepoint enumerated extension, not a
block grant (Ǎ fixture pins the boundary).

### AUDIT-20260610-16 — template-nested stylesheet link trips the axis-1 singleton census (claim weakened on verification)

Finding-ID: AUDIT-20260610-16 (fable5-02)
Status:     informational
Severity:   informational
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (walk descends template.content) vs stylesheet-pin.ts (collector does not)
Direction:  false-positive (claimed)

Verification weakened the claim: the defeating input ALSO trips disallowed-element
— `template` was never in ALLOWED_TAGS, so no lint-green document can carry one and
the "legitimate author idiom" premise fails. The axes-disagreement (census counts
template content the pin's collector ignores) is latent-only on always-rejected
inputs. Recorded as observation; no code change, no backlog item.

## 2026-06-10 — lint adversarial barrage ROUND 3 (run 20260610T194644238Z; codex only — claude 0 bytes)

Triage notes: claude produced ZERO bytes (0 stdout / 0 stderr; the silent-timeout
shape — deskwork issue 447; the run dir also persists no per-model run record, the
BarrageRun JSON is stdout-only). Degraded fleet: no cross-model signal this round.
Codex: 2 HIGH false-negatives (both sharding responses to the round-2 density gate,
both behaviorally verified ok=true pre-fix), 1 LOW false-positive recurrence, plus
a grounded-clean list confirming base/SVG/style/script/mixed-rel/media/external/
swapped-kit/swapped-font/SRI/entity channels hold. Round verdict: NOT converged.

### AUDIT-20260610-17 — Sharded punctuation art defeats the per-text-node density gate (code shards; table-cell mosaic)

Finding-ID: AUDIT-20260610-17 (round-3 gpt-5-01 + gpt-5-02; one mechanism — shard below the per-node floor, reassemble at the rendered row)
Status:     fixed-1a783fe1 (2026-06-10; density also runs over each block container's aggregate descendant text; per-node check kept for diluted-block inline islands)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts + codepoint.ts

Adjacent `<code>` shards of 7 chars (below PUNCT_DENSITY_MIN_LENGTH) joined by br
row control, and one-glyph-per-`<td>` mosaics with the table supplying the raster,
both rendered wordmarks under a verified pin. Fixed at the granularity the shards
reassemble at: DENSITY_BLOCK_TAGS aggregate text. Specificity fixtures: data
tables, short placeholder rows, prose pages stay green; a letter-diluted block
containing one dense inline island still trips via the kept per-node check.

### AUDIT-20260610-08 recurrence — native form flow over-rejection (round-3 gpt-5-03, LOW)

Third surfacing of the form-controls theme (round-1 gpt-5-05 → AUDIT-08/TASK-15;
now `<form>` + `<input type=text>`). Still parked as backlog TASK-15 per the
intake rule; the recurrence count strengthens its selection case — it is also a
direct input to the Phase-1 positive-corpus task.

## 2026-06-10 — lint adversarial barrage ROUND 4 (run 20260610T200156342Z; codex only — claude 0 bytes, 2nd consecutive)

Triage notes: claude silent again (0 stdout / 0 stderr; deskwork issue 447 —
3 of 5 runs now). Codex: 1 HIGH + 2 MED, all behaviorally verified; both MEDs
are recurrences of parked items, which the dispositions below close. Codex's
clean list: base/foreign-content/img-iframe-object/mixed-rel/external/media/
cache-bust/swapped-kit/swapped-fonts all hold. Round verdict: NOT converged
(1 HIGH), but the HIGH is dispositioned as a declared scope boundary rather
than a code fix — see AUDIT-18.

### AUDIT-20260610-18 — Letter mosaic in table cells: text-as-imagery beyond content statistics (DECLARED BOUNDARY)

Finding-ID: AUDIT-20260610-18 (round-4 gpt-5-codex-01; behaviorally verified)
Status:     acknowledged-scope-boundary (2026-06-10, e9137d31; backlog TASK-17 holds the selectable heuristic option)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (mechanical closure limit)

A wordmark mosaic of one allowlisted LETTER per `<td>` (0% punctuation) renders
imagery no content-statistics gate can see; a single-char-cell heuristic is
statistically indistinguishable from a legitimate Y/N feature matrix, and
stacking shape heuristics is the round-7 whack-a-mole. Disposition is
claim-narrowing per the PRD's "claim matched to evidence" discipline: the lint
docstring + adversarial prompt now DECLARE general text-as-imagery from
allowlisted glyphs at structural granularity outside the mechanical closure,
assigned to the cross-model referee's gross-class imagery judgment (PRD gross
classes 5–7); a boundary fixture pins it. Future letter-mosaic findings are in
scope only if they show the boundary drawn wrongly.

### AUDIT-20260610-19 — Visible attr values (title/aria) carry designed glyphs; meta name unconstrained

Finding-ID: AUDIT-20260610-19 (round-4 gpt-5-codex-02 MED; THIRD surfacing of AUDIT-05 — rounds 1, 2, 4, both models)
Status:     fixed-d7f4025a (2026-06-10; title + aria-* values pass the codepoint allowlist; meta name enumerated {viewport, description} — theme-color/color-scheme rejected by NAME. Closes parked AUDIT-20260610-05 / backlog TASK-12)
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts + allowlist.ts

The recurrence pressure (three rounds, both models independently) promoted the
parked finding into the loop. class/id stay value-unconstrained (inert under the
pin, round-8 as amended by AUDIT-02's disposition).

### AUDIT-20260610-20 — Correct SRI over-rejected (recurrence of AUDIT-06; SRI branch unreachable)

Finding-ID: AUDIT-20260610-20 (round-4 gpt-5-codex-03 MED; second surfacing of fable-04 = AUDIT-06)
Status:     fixed-70c2c320 (2026-06-10; integrity allowlisted plain-kind on link — its value is axis-1.5's to verify. Closes parked AUDIT-20260610-06 / backlog TASK-13)
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts (link attrs)
Direction:  false-positive

End-to-end fixtures: a correct digest passes the FULL lint; a wrong digest still
rejects through the now-reachable normalizeSriToken machinery (AUDIT-15/18/19/21
hardening finally exercisable on green documents).

## 2026-06-10 — lint adversarial barrage ROUND 5 (run 20260610T202003272Z; codex only — claude 0 bytes, 3rd consecutive)

Triage notes: claude silent again (4 of 6 runs; deskwork issue 447). Codex:
2 HIGH + 1 MED + 1 LOW, all behaviorally verified pre-fix. Notably two findings
are direct challenges to THIS loop's earlier fix rationales — the auditor is
reading the source comments and attacking the stated reasoning, which is the
adversarial process working as designed. Round verdict: NOT converged.

### AUDIT-20260610-21 — Tooltip carries the punctuation logo (AUDIT-19's fix was codepoint-only)

Finding-ID: AUDIT-20260610-21 (round-5 gpt-5-codex-02, MED)
Status:     fixed-acdf9b58 (2026-06-10; visible attr values get the density gate too)
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (title/aria values)

### AUDIT-20260610-22 — Stacked sibling rows below the per-block floor; parent diluted by prose

Finding-ID: AUDIT-20260610-22 (round-5 gpt-5-codex-03, HIGH)
Status:     fixed-acdf9b58 (2026-06-10; consecutive density-shaped sibling blocks accumulate as a RUN — ratio-qualified at any length, floor applied to the run; a prose sibling breaks the run)
Severity:   high
Surface:    plugins/design-control/src/lint/codepoint.ts + check-mockup-lofi.ts

7-char `<p>` rows slipped the per-block floor while the heading diluted the body
aggregate — vertical reassembly. punctuationRatio() extracted as the shared
primitive. Specificity fixtures: interleaved copy and short dash-placeholder
lists stay green.

### AUDIT-20260610-23 — Absent theme fonts fall through to local system DESIGNED fonts

Finding-ID: AUDIT-20260610-23 (round-5 gpt-5-codex-01, HIGH)
Status:     fixed-b7d5644e (2026-06-10; SKETCH_KIT_FONTS carries its theme; a USED font-bearing theme with the font absent → font-missing; absent stays clean for unused themes + fontless grayscale)
Severity:   high
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts + wireframe-kit/sketch-kit.ts

Direct refutation of AUDIT-03's "absent is clean: no foreign bytes load"
rationale — the marker theme's fallback stack IS designed local fonts
(cursive/handwriting). The fix narrows the absent-is-clean claim to themes the
document does not use.

### AUDIT-20260610-24 — Native form flow over-rejected (FOURTH surfacing; promoted)

Finding-ID: AUDIT-20260610-24 (round-5 gpt-5-codex-04 LOW; rounds 1/3/5 = AUDIT-08/TASK-15)
Status:     fixed-d3137b5d (2026-06-10; form/input/label[for] allowlisted; input type enumerated — image/color stay rejected. Closes parked AUDIT-20260610-08 / backlog TASK-15)
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 6 (run 20260610T204029454Z; codex only — claude 0 bytes, 4th consecutive)

Triage notes: claude silent (5 of 7 runs; deskwork issue 447). Codex: 1 HIGH +
2 MED + 1 LOW, all verified. The HIGH is a completion gap in this loop's own
round-5 fix; the MEDs and LOW probe the declared boundary and the gate's
trade-offs rather than the closures — the finding curve is flattening into
boundary territory. Round verdict: NOT converged (1 HIGH, fixed).

### AUDIT-20260610-25 — input placeholder/value are rendered text the visible-attr gates missed

Finding-ID: AUDIT-20260610-25 (round-6 gpt-5-codex-01, HIGH)
Status:     fixed-403bf02f (2026-06-10; placeholder + value join title/aria in the codepoint + density gates)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

Completion gap of AUDIT-19/-24: the field renders its placeholder; the submit
button renders its value. Designed glyphs/emoji and punctuation art rode both
under a green pin (verified pre-fix).

### AUDIT-20260610-26 — Native control chrome renders UA styling outside the kit (ACKNOWLEDGED)

Finding-ID: AUDIT-20260610-26 (round-6 gpt-5-codex-02, MED)
Status:     acknowledged-by-design (2026-06-10, b955ce03; kit-completeness styling captured as backlog TASK-18)
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (allowed native controls)

UA default chrome is the definitional UNSTYLED baseline, not author-supplied
polish — the guarantee targets designed detail an author can ship, and platform
chrome varies by machine and is read as default. The legitimate residual (themed
wireframes render controls inconsistently) is kit-completeness work, parked as
TASK-18.

### AUDIT-20260610-27 — Prose-diluted punctuation grid: the geometric boundary form (BOUNDARY EXTENDED)

Finding-ID: AUDIT-20260610-27 (round-6 gpt-5-codex-03, MED)
Status:     acknowledged-scope-boundary (2026-06-10, b955ce03; extends AUDIT-18 — geometry over glyph-class)
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (content statistics vs grid placement)

Punctuation columns draw an icon while a prose label cell dilutes every flow
aggregate below the density ratio. Codex correctly noted this is NOT the
declared letter-mosaic boundary as worded — so the boundary's wording was the
bug: the real line is FLOW art (mechanically gated: node / block / sibling-run
density) vs GEOMETRIC composition (cell placement, invisible to content
statistics — referee's gross-class domain). Docstring + prompt reworded; second
boundary fixture pins the punctuation-grid side.

### AUDIT-20260610-28 — Skeleton "________" line over-rejected (ACKNOWLEDGED-WONTFIX)

Finding-ID: AUDIT-20260610-28 (round-6 gpt-5-codex-04, LOW)
Status:     acknowledged-wontfix (2026-06-10; the kit's .sk-line is the placeholder idiom)
Severity:   low
Surface:    plugins/design-control/src/lint/codepoint.ts (density trade-off)
Direction:  false-positive

Exempting underscore runs reopens the horizontal-stroke channel the density gate
exists to bound; the finding messages already steer to the kit placeholders.
Accepted specificity cost, on the record.

## 2026-06-10 — lint adversarial barrage ROUND 7 (run 20260610T205614241Z; codex only — claude 0 bytes, 5th consecutive)

Triage notes: claude 6 of 8 silent (deskwork issue 447). Codex: 3 HIGH + 1 LOW,
all verified. One genuine new closure (kit root), one boundary-wording defect
(letter flow art), one recurrence of an acknowledged finding, one fair
completion of the form fix. Round verdict: NOT converged.

### AUDIT-20260610-29 — Kit loaded but IN EFFECT nowhere: the sk root class was never required

Finding-ID: AUDIT-20260610-29 (round-7 gpt-5-01, HIGH)
Status:     fixed-16bd38ae (2026-06-10; body must carry the bare sk token — kit-root-missing; fixture also rejects sk-theme-* without the root)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

A document with the pinned stylesheet but no `.sk` root rendered entirely
UA-styled — green meant linked-and-byte-true, not applied. The strongest
remaining real closure; the walk now censuses body's class tokens.

### AUDIT-20260610-30 — Native control chrome (recurrence of acknowledged AUDIT-26)

Finding-ID: AUDIT-20260610-30 (round-7 gpt-5-02; MED→HIGH regrade by the auditor)
Status:     superseded-by-AUDIT-20260610-26 (standing acknowledgment; prompt now declares the baseline with the in-scope exception so recurrences stop)
Severity:   high (claimed)
Surface:    same as AUDIT-26

### AUDIT-20260610-31 — Letter FLOW art: the boundary's geometry wording was wrong (BOUNDARY STABILIZED)

Finding-ID: AUDIT-20260610-31 (round-7 gpt-5-03, HIGH; behaviorally verified)
Status:     acknowledged-scope-boundary (2026-06-10, ba11126c; the stable statement is GLYPH CLASS, not layout)
Severity:   high
Surface:    plugins/design-control/src/lint/codepoint.ts

Monospace rows of letters draw a wordmark at 0% punctuation — flow-text, so the
round-6 "geometry" framing didn't cover it; the auditor was right that the
boundary as worded was leaky. Stable three-part statement now in docstring +
prompt: punctuation FLOW art = mechanically gated (density gates); LETTER
imagery in ANY layout + grid-diluted punctuation = referee's gross-class domain
(letter mass is what copy is made of; geometry is invisible to content
statistics); UA chrome = unstyled baseline. Third boundary fixture pins letter
flow art.

### AUDIT-20260610-32 — textarea over-rejected (completion of the form fix)

Finding-ID: AUDIT-20260610-32 (round-7 gpt-5-04, LOW)
Status:     fixed-16bd38ae (2026-06-10; textarea allowlisted with placeholder riding the visible-attr gates)
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 8 (run 20260610T211155471Z; codex only — claude 0 bytes, 6th consecutive)

Triage notes: codex 1 HIGH + 2 LOW; the HIGH is a channel THIS loop's round-7
textarea addition opened — the loop is now mostly auditing its own deltas, the
expected end-stage shape. Codex's grounded-clean list re-confirms mixed-rel /
SRI / swapped-fonts / foreign-content / URL-control-entity paths hold. Round
verdict: NOT converged (1 HIGH, fixed).

### AUDIT-20260610-33 — textarea content reopened the preserved-whitespace channel with scroll dilution

Finding-ID: AUDIT-20260610-33 (round-8 gpt-5-01, HIGH)
Status:     fixed-c890b79e (2026-06-10; textarea must be EMPTY — textarea-content rule; copy belongs in the gated placeholder)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

Visible viewport renders the art; scrolled-out prose dilutes the density
counter — statistics cannot see the viewport, so the closure is
allowlist-shaped (empty content), not statistical.

### AUDIT-20260610-34 — Backslash-relative kit href over-rejected by the pin's POSIX resolve

Finding-ID: AUDIT-20260610-34 (round-8 gpt-5-02, LOW)
Status:     fixed-c890b79e (2026-06-10; backslashes normalized to slashes before resolve, matching WHATWG + axis-1)
Severity:   low
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts
Direction:  false-positive

### AUDIT-20260610-35 — checked state over-rejected

Finding-ID: AUDIT-20260610-35 (round-8 gpt-5-03, LOW)
Status:     fixed-c890b79e (2026-06-10; checked allowlisted — structural form state)
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 9 (run 20260610T212520711Z; codex only — claude 0 bytes, 7th consecutive)

Triage notes: 1 HIGH + 1 MED (one mechanism, folded per TF-002) + 1 LOW fp.
The dilution lesson from round 8 turned against multiline ATTR values — the
loop continues auditing its own deltas. Round verdict: NOT converged (HIGH,
fixed same round).

### AUDIT-20260610-36 — Multiline visible-attr values render per LINE; density scanned the aggregate

Finding-ID: AUDIT-20260610-36 (round-9 gpt-5-01 HIGH + gpt-5-02 MED; one mechanism — placeholder viewport + title tooltip)
Status:     fixed-00a6cfec (2026-06-10; density gate runs per line of visible-attr values; legit multiline placeholder fixture green)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

### AUDIT-20260610-37 — select/option over-rejected

Finding-ID: AUDIT-20260610-37 (round-9 gpt-5-03, LOW)
Status:     fixed-00a6cfec (2026-06-10; allowlisted — same structural class as input/textarea; option text rides the text gates)
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 10 (run 20260610T213806274Z; codex only — claude 0 bytes, 8th consecutive)

Triage notes: 1 HIGH + 1 MED + 2 LOW, all verified, all fixed same round. The
HIGH (theme placement) is the best find in several rounds — a pinned-CSS polish
channel via class PLACEMENT, against the DECISION doc's one-theme-on-body
contract. Codex's grounded-clean list re-confirms all earlier closures.

### AUDIT-20260610-38 — sk-theme-* below body composes mixed-theme polish

Finding-ID: AUDIT-20260610-38 (round-10 gpt-5-01, HIGH)
Status:     fixed-bdecbd70 (2026-06-10; theme-placement rule — theme tokens on body only, at most one)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

### AUDIT-20260610-39 — Ratio-gaming: letter-embedded punctuation art at 75% under the 0.8 gate

Finding-ID: AUDIT-20260610-39 (round-10 gpt-5-02, MED)
Status:     fixed-bdecbd70 (2026-06-10; PUNCT_DENSITY_RATIO 0.8 → 0.6 — copy lines run far below; art diluted past 0.6 converges to the letter-art referee boundary)
Severity:   medium
Surface:    plugins/design-control/src/lint/codepoint.ts

### AUDIT-20260610-40 — disabled/selected over-rejected (state completions)

Finding-ID: AUDIT-20260610-40 (round-10 gpt-5-03 + gpt-5-04, LOW)
Status:     fixed-bdecbd70 (2026-06-10; structural form state, same class as checked)
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 11 (run 20260610T215139738Z; codex only — claude 0 bytes, 9th consecutive)

**FIRST ZERO-HIGH ROUND** (convergence count: 1 of 2). 2 MED + 1 LOW, all
verified and fixed same round. Codex's clean list re-confirms the closures.

### AUDIT-20260610-41 — viewport content is a rendering channel

Finding-ID: AUDIT-20260610-41 (round-11 gpt-5-01, MED)
Status:     fixed-f2db6029 (2026-06-10; disallowed-viewport — only the canonical responsive declaration, normalized pair-set compare)
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts + allowlist.ts

### AUDIT-20260610-42 — prefilled password renders masking bullets

Finding-ID: AUDIT-20260610-42 (round-11 gpt-5-02, MED)
Status:     fixed-f2db6029 (2026-06-10; password-value rule — wireframes don't prefill secrets; placeholder is the copy channel)
Severity:   medium
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

### AUDIT-20260610-43 — number input over-rejected

Finding-ID: AUDIT-20260610-43 (round-11 gpt-5-03, LOW)
Status:     fixed-f2db6029 (2026-06-10; number joins INPUT_TYPE_ALLOWLIST)
Severity:   low
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 12 (run 20260610T220538629Z; codex only — claude 0 bytes, 10th consecutive)

Zero-HIGH streak RESET (was 1). 2 HIGH + 2 LOW, all verified, all fixed in
7f660f27. Both HIGHs attack this loop's own earlier fixes — the run
accumulator's element-only blind spot, and AUDIT-14's query acceptance turning
out to be a swap channel.

### AUDIT-20260610-44 — Text-node sibling rows (br-separated) slipped the run accumulator

Finding-ID: AUDIT-20260610-44 (round-12 gpt-5-01, HIGH)
Status:     fixed-7f660f27 (2026-06-10; text-node children join the run; br transparent; prose still breaks)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

### AUDIT-20260610-45 — Query on the kit href is a swap channel (SUPERSEDES AUDIT-14's acceptance)

Finding-ID: AUDIT-20260610-45 (round-12 gpt-5-02, HIGH)
Status:     fixed-7f660f27 (2026-06-10; stylesheet-query rule — the browser requests the suffixed URL a query-aware host can map to different bytes; fragments stay fine; ?v over-rejection is the accepted cost)
Severity:   high
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts

### AUDIT-20260610-46 — Duplicate identical theme token over-rejected

Finding-ID: AUDIT-20260610-46 (round-12 gpt-5-03, LOW)
Status:     fixed-7f660f27 (2026-06-10; distinct-theme count)
Severity:   low
Direction:  false-positive

### AUDIT-20260610-47 — tel input over-rejected

Finding-ID: AUDIT-20260610-47 (round-12 gpt-5-04, LOW)
Status:     fixed-7f660f27 (2026-06-10; tel joins INPUT_TYPE_ALLOWLIST)
Severity:   low
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 13 (run 20260610T222034909Z; codex only — claude 0 bytes, 11th consecutive)

1 HIGH + 1 MED (one class — the composition boundary in its general form) +
1 LOW fp (fixed). Round verdict: the HIGH is dispositioned as the declared
boundary's general statement, not a code fix.

### AUDIT-20260610-48 — Imagery composed by geometric placement of SANCTIONED ATOMS (BOUNDARY, general form)

Finding-ID: AUDIT-20260610-48 (round-13 gpt-5-01 HIGH + gpt-5-02 MED; one class — kit-primitive grids + control-state rasters)
Status:     acknowledged-scope-boundary (2026-06-10, 803cd4e0; prompt clause 3 + docstring + two boundary fixtures)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts (composition channel)

.sk-dot grids and checked-checkbox rasters draw marks from atoms that are each
legitimate, in arrangements statistically indistinguishable from real idioms
(dot-status matrices, permission grids). The image exists only to an eye;
constraining placement would constrain STRUCTURE itself, which is what a
wireframe is. The referee looks; the lint does not pretend to. In-scope
exception declared: a new unsanctioned atom or a flow-statistical signature
the density gates should catch.

### AUDIT-20260610-49 — checkbox/radio submission values wrongly scanned as visible text

Finding-ID: AUDIT-20260610-49 (round-13 gpt-5-03, LOW)
Status:     fixed-803cd4e0 (2026-06-10; visible-value gates scope to types whose value renders)
Severity:   low
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 14 (run 20260610T223352761Z; codex only — claude 0 bytes, 12th consecutive)

3 HIGH + 1 LOW, all verified, all fixed in db8f5602. The strongest round in a
while: a whitespace-DEFINITION differential (a genuine parser-differential
class, the lint's founding threat model) and a rendered-value channel the
density aggregation never saw.

### AUDIT-20260610-50 — NBSP tokenization differential (rel + class) — JS \s vs HTML ASCII whitespace

Finding-ID: AUDIT-20260610-50 (round-14 gpt-5-01 + gpt-5-02, both HIGH; one mechanism)
Status:     fixed-db8f5602 (2026-06-10; splitHtmlTokens — HTML-spec ASCII set — at all four token sites: rel gate, class/theme tokens, pin theme collector, SRI tokens)
Severity:   high
Surface:    plugins/design-control/src/lint/allowlist.ts + check-mockup-lofi.ts + stylesheet-pin.ts

rel="stylesheet&nbsp;" / class="sk&nbsp;..." were clean tokens to the lint but
different tokens to the browser — kit silently NOT APPLIED under a green pin.

### AUDIT-20260610-51 — Punctuation rows sharded through RENDERED control values

Finding-ID: AUDIT-20260610-51 (round-14 gpt-5-03, HIGH)
Status:     fixed-db8f5602 (2026-06-10; renderedText — aggregate + rendered input values/placeholders — feeds the density block/run paths; form joins the block set)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

### AUDIT-20260610-52 — url input over-rejected

Finding-ID: AUDIT-20260610-52 (round-14 gpt-5-04, LOW)
Status:     fixed-db8f5602 (2026-06-10; url joins INPUT_TYPE_ALLOWLIST)
Severity:   low
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 15 (run 20260610T224855633Z; codex only — claude 0 bytes, 13th consecutive)

**ZERO-HIGH round (convergence count: 1 of 2).** 2 MED + 3 LOW, all verified,
all fixed in f5e6b516:

- AUDIT-20260610-53 (MED): dir layout-direction channel → dir dropped from the
  global allowlist (Latin-only v1 text axis; re-add with i18n)
- AUDIT-20260610-54 (MED): li value="-1" generated-marker punctuation columns →
  digits-only list numbering (list-numbering rule)
- AUDIT-20260610-55 (LOW): legacy/missing doctype = quirks rendering mode →
  standards doctype required (doctype-required rule)
- AUDIT-20260610-56 (LOW fp): percent-encoded kit href over-rejected → href
  compares percent-decode (browser-faithful)
- AUDIT-20260610-57 (LOW fp): initial-scale=1.0 over-rejected → numeric
  viewport values canonicalize

## 2026-06-10 — lint adversarial barrage ROUND 16 (run 20260610T230257429Z; codex only — claude 0 bytes, 14th consecutive)

Zero-HIGH streak RESET (was 1). 1 HIGH + 1 LOW, both verified, fixed in
62d578e6.

### AUDIT-20260610-58 — Font pin anchored at baseDir, but CSS url() is stylesheet-relative

Finding-ID: AUDIT-20260610-58 (round-16 gpt-5-01, HIGH)
Status:     fixed-62d578e6 (2026-06-10; font paths anchor at dirname(resolved stylesheet); tampered + genuine subdirectory-layout fixtures)
Severity:   high
Surface:    plugins/design-control/src/lint/stylesheet-pin.ts

A kit linked from a subdirectory (legal under the basename rule) loads fonts
beside ITSELF; the pin checked baseDir/fonts — a swapped designed font at the
real location passed green.

### AUDIT-20260610-59 — details/summary over-rejected

Finding-ID: AUDIT-20260610-59 (round-16 gpt-5-02, LOW)
Status:     fixed-62d578e6 (2026-06-10; disclosure allowlisted; open is structural state)
Severity:   low
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 17 (run 20260610T231601987Z; codex only — claude 0 bytes, 15th consecutive)

1 HIGH + 1 LOW, both verified, fixed in edbf7007. The HIGH is an ordering
COMPOSITION of two of this loop's own fixes (round-15 percent-decode ×
round-8 backslash separator).

### AUDIT-20260610-60 — Decode-before-segmentation: %5C smuggled a non-kit fetch under a kit basename

Finding-ID: AUDIT-20260610-60 (round-17 gpt-5-01, HIGH)
Status:     fixed-edbf7007 (2026-06-10; both href pipelines decode AFTER segmentation; a segment whose decode introduces a separator stays RAW — self-hardened against the a%2F..%2F resolve-alias variant found during the fix, fixture added preemptively)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts + stylesheet-pin.ts

### AUDIT-20260610-61 — Whitespace-padded input type over-rejected

Finding-ID: AUDIT-20260610-61 (round-17 gpt-5-02, LOW)
Status:     fixed-edbf7007 (2026-06-10; trim before the enumerated compare)
Severity:   low
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 18 (run 20260610T233031320Z; codex only — claude 0 bytes, 16th consecutive)

1 HIGH + 1 MED + 1 LOW; HIGH and LOW fixed, MED is a boundary recurrence
(clause generalized). All in 9ac50da5.

### AUDIT-20260610-62 — reversed + start composition counts down through negative punctuation markers

Finding-ID: AUDIT-20260610-62 (round-18 gpt-5-01, HIGH)
Status:     fixed-9ac50da5 (2026-06-10; a reversed list with explicit start must not run below 1; default-start reversed and positive countdowns stay green)
Severity:   high
Surface:    plugins/design-control/src/lint/check-mockup-lofi.ts

start="0" reversed renders 0., -1., -2. — the AUDIT-54 generated-marker channel
reopened through attribute COMPOSITION.

### AUDIT-20260610-63 — UA default link styling (boundary recurrence; clause generalized)

Finding-ID: AUDIT-20260610-63 (round-18 gpt-5-02, MED)
Status:     acknowledged-scope-boundary (2026-06-10, 9ac50da5; clause 2 generalized from control chrome to UA default rendering of semantic HTML; fixture pins the bare-link case)
Severity:   medium
Surface:    boundary clause 2

### AUDIT-20260610-64 — reset input over-rejected

Finding-ID: AUDIT-20260610-64 (round-18 gpt-5-03, LOW)
Status:     fixed-9ac50da5 (2026-06-10; reset joins INPUT_TYPE_ALLOWLIST)
Severity:   low
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 19 (run 20260610T234331253Z; codex only — claude 0 bytes, 17th consecutive)

**ZERO-HIGH round (convergence count: 1 of 2).** Codex's own summary: "I did
not find a high-confidence false-negative within the declared scope" — both
findings are select-surface false-positives, fixed in 930a718c.

### AUDIT-20260610-65 — select/option form-state completions

Finding-ID: AUDIT-20260610-65 (round-19 gpt-5-01 LOW + gpt-5-02 MED; one surface)
Status:     fixed-930a718c (2026-06-10; select.disabled + option.value/disabled allowlisted; visible-value gate rescoped to input-only rendered values)
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts + check-mockup-lofi.ts
Direction:  false-positive

## 2026-06-10 — lint adversarial barrage ROUND 20 (run 20260610T235555837Z; codex only — claude 0 bytes, 18th consecutive)

**ZERO-HIGH round — SECOND CONSECUTIVE (rounds 19 + 20): CONVERGED.** Codex:
"I did not find a high-confidence pinned false-negative inside the declared
scope." Residuals: 2 form-surface false-positives, fixed in 0e5b4b21.

### AUDIT-20260610-66 — fieldset/legend + required over-rejected

Finding-ID: AUDIT-20260610-66 (round-20 gpt-5-01 MED + gpt-5-02 LOW)
Status:     fixed-0e5b4b21 (2026-06-10; fieldset/legend allowlisted; required joins the structural-state attrs)
Severity:   medium
Surface:    plugins/design-control/src/lint/allowlist.ts
Direction:  false-positive

## CONVERGENCE RECORD — 2026-06-10 lint adversarial barrage loop (rounds 1–20)

**Stop criterion met:** two consecutive zero-HIGH rounds (19 + 20), per the
PRD's operator-set criterion. Twenty rounds fired via the committed
re-runnable process (audit/run-lint-barrage.sh → stackctl audit-barrage).

**Loop totals:**
- Findings recorded: AUDIT-20260610-01 .. -66 (66 IDs; same-mechanism
  cross-model/cross-finding folds applied per the TF-002 rule)
- Dispositions: every finding fixed-<sha>, acknowledged-<ref>, superseded, or
  informational — zero open, zero parked-without-record
- Test corpus: 151 → 286 (every genuine defeat is a deterministic fixture;
  every accepted boundary/residual is a documented BOUNDARY fixture)
- Two of the loop's own earlier dispositions were REVERSED on later evidence
  (AUDIT-14 query acceptance → AUDIT-45; AUDIT-03 absent-fonts-clean →
  AUDIT-23) — the protocol audited its own fixes, not just the original code
- Declared scope boundaries (in the lint docstring + the adversarial prompt,
  each pinned by fixtures): (1) punctuation FLOW art mechanically gated;
  letter-composed imagery and grid-diluted punctuation = referee's gross-class
  domain; (2) UA default rendering of semantic HTML = the unstyled baseline;
  (3) imagery composed by geometric placement of sanctioned atoms = referee's
  domain
- Fleet note: claude contributed rounds 1(retry)+2 then was 0-byte for 18
  consecutive runs (deskwork issue 447); from round 3 the loop ran on codex
  alone, so cross-model agreement was only available in rounds 1–2. The
  convergence verdict is correspondingly single-family — re-validation with a
  restored fleet is the natural post-447 follow-up.

**Verification discipline held throughout:** every defeating input was
executed against the real lint before recording (zero auditor predictions
trusted); every fix was RED-first with the verbatim defeating input as the
fixture; two self-caught transcription errors in fix shas were corrected in
dedicated commits.

## 2026-06-11 — audit-barrage lift (20260611T055621128Z-design-control-after_clarify)

### AUDIT-20260611-01 — Provenance mode can be silently rewritten — a later `recordDrivingWireframe` call overwrites a `derived` record and launders the exact claim the module exists to prevent

Finding-ID: AUDIT-20260611-01
Status:     fixed-0e4027c3 (2026-06-10; writeProvenance is append-once — refuses any overwrite, naming the existing mode; derived→driving laundering path closed; 5 RED-first tests incl. bytes-untouched-after-refusal)
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:84-98 (recordDrivingWireframe), 100-127 (recordDerivation), 70-75 (writeProvenance)

`writeProvenance` unconditionally `writeFileSync`s `<surfaceId>.provenance.json`. Nothing in `recordDrivingWireframe` or `recordDerivation` checks whether a sidecar already exists, so a surface recorded as `derived` (with its snapshot + hash baseline) can be flipped to `driving` with a single later call — after which `wireframeDroveImplementation` returns `true` and `checkDerivedAcceptance` passes unconditionally (lines 144-146 short-circuit on non-derived mode). The module's own header (lines 15-17) states the design goal: *"provenance distinguishes the two modes precisely so the claim cannot be laundered through acceptance."* The overwrite path is a one-call laundering vector that bypasses acceptance entirely. The derivation-time snapshot is also silently orphaned (the `.derived-snapshot.html` stays on disk but nothing references it), erasing the audit trail.

Blast radius: this is a library invoked under skill direction, so it requires a wrong call rather than happening by default — but the population this discipline explicitly defends against is an unattended agent looking for the path of least resistance past a failing `derived-unedited` gate, and the cheapest such path is exactly this call. It doesn't break the feature when used correctly, hence medium rather than high. A reasonable fix: `writeProvenance` (or both record functions) fails loud when a sidecar already exists for the surface, with mode transitions requiring an explicit, separately-named operation (or at minimum refusing the `derived → driving` direction outright, since that transition is semantically never legitimate).

### AUDIT-20260611-02 — `surfaceId` is interpolated into filesystem paths with no filename validation — `..` escapes the provenance dir, `/` breaks round-tripping

Finding-ID: AUDIT-20260611-02
Status:     fixed-896be642 (2026-06-10; shared zod surfaceIdSchema + assertPortableSurfaceId at all three path-building entries; pattern ^[a-z0-9][a-z0-9._-]*$/i; 23 RED-first assertions incl. zero-files-written on refusal)
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:66-67 (sidecarPath), 108 (snapshotFile), 31, 44 (zod schemas)

The zod schemas constrain `surfaceId` only to `z.string().min(1)`, but the id is used directly to build paths: `join(dir, `${surfaceId}.provenance.json`)` and `${surfaceId}.derived-snapshot.html`. A `surfaceId` of `../something` writes the sidecar and snapshot *outside* the operator-chosen provenance directory; an id containing `/` (e.g. `studio/content-browser` — an entirely plausible operator-meaningful id, given the codebase's route-style naming like `/dev/editorial-studio` which appears in this very diff's tests as a `source` value) either ENOENTs on write or silently lands in an unintended subdirectory. `loadProvenance` joins identically, so the misplacement round-trips invisibly rather than failing loud.

Blast radius: the id is operator/agent-supplied prose, not attacker input, so the realistic failure is accidental misplacement and confusing ENOENTs rather than exploitation — a design defect that compounds as more surfaces are recorded, hence medium. Fix: validate `surfaceId` against a portable-filename pattern (e.g. `/^[a-z0-9][a-z0-9._-]*$/i`) in the zod schema and at record time, failing loud with a message naming the constraint — consistent with the project's no-fallbacks rule.

### AUDIT-20260611-03 — The derived-acceptance gate and provenance recording have no executable firing surface — the skill directs the agent to call raw TypeScript functions

Finding-ID: AUDIT-20260611-03
Status:     fixed-3d32a2fb (2026-06-10; bin/wireframe-provenance with record-driving|record-derived|check-acceptance|verify-driving mirroring the check-wireframe seam; tested CLI core runWireframeProvenance, 24 RED-first tests; SKILL.md step 6 quotes the commands)
Severity:   medium
Surface:    plugins/design-control/skills/wireframe/SKILL.md:64-72 (step 6); plugins/design-control/src/provenance/derived.ts (whole module); plugins/design-control/bin/ (missing sibling to check-wireframe)

The lint gate got a proper seam: `bin/check-wireframe` → `check-wireframe-cli.ts` → tested `runCheckWireframe`, and SKILL.md step 5 quotes the exact command. The provenance path got none. SKILL.md step 6 instructs: *"record it via `recordDrivingWireframe` (`@/provenance`)"* — but an agent executing the skill has no documented way to invoke a TypeScript export. In practice it will improvise a `tsx -e` one-liner per invocation, which is precisely the "ad-hoc shell instead of proper scripts under `bin/`" anti-pattern the repo's plugin conventions forbid — or it will quietly skip the step, since unlike the lint there is no exit-code gate to fail. The same applies to `checkDerivedAcceptance`: it is a "non-negotiable" acceptance gate per the spec, yet nothing in the diff (no bin verb, no skill step, no caller anywhere) ever fires it. The plugin's own thesis, quoted in this SKILL.md (lines 13-16), is that *"policy is enforced by a process, not a rule"* — the lo-fi property got the process; the provenance property got a rule.

Blast radius: provenance recording will be inconsistent or absent across real wireframes, and the derived gate exists only as a tested library function nobody calls — the discipline degrades silently rather than breaking loudly, which is the compounding-design-issue shape, hence medium. Fix: a `bin/record-provenance` (or `bin/wireframe-provenance` with `record-driving | record-derived | check-acceptance` subcommands) mirroring the `check-wireframe` shim pattern, with SKILL.md steps quoting the commands the way step 5 does.

### AUDIT-20260611-04 — A `driving` provenance record carries no binding to the artifact it certifies — no filename, no hash

Finding-ID: AUDIT-20260611-04
Status:     fixed-40124302 (2026-06-10; drivingSchema gains driving:{wireframeFile,wireframeSha256} mirroring the derived sub-object; recordDrivingWireframe requires the on-disk file; verifyDrivingWireframe re-hashes and fails loud; 7 RED-first tests)
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:31-36 (drivingSchema) vs 38-53 (derivedSchema)

The `derived` record stores `snapshotFile`, `snapshotSha256`, and `source` — enough to identify and tamper-check its baseline. The `driving` record stores only `surfaceId`, `mode`, and `createdAt`. `wireframeDroveImplementation` therefore certifies a claim ("this wireframe drove the implementation") about an artifact the record cannot identify: the wireframe HTML next to the sidecar can be wholly replaced after recording and the claim still holds, with no tamper evidence of the kind the derived path deliberately built (lines 148-154). The asymmetry is visible side-by-side in the two schemas.

Blast radius: a downstream consumer (the future referee, or any "did a wireframe drive this change?" check) gets a `true` that is unfalsifiable against the on-disk artifact. Nothing breaks today, but every claim recorded under this schema is permanently unverifiable, and a later schema fix can't retro-bind old records — the cost compounds with adoption, hence medium. Fix: record the wireframe's filename and sha256 at `recordDrivingWireframe` time (the wireframe file already exists at that point per SKILL.md step ordering — lint at step 5 precedes provenance at step 6), and have `wireframeDroveImplementation` (or a sibling verifier) check the hash the way `checkDerivedAcceptance` checks the snapshot.

### AUDIT-20260611-05 — `recordDrivingWireframe` takes a parameter named `derivedAt` for a wireframe that is by definition not derived

Finding-ID: AUDIT-20260611-05
Status:     fixed-cc2b71e9 (2026-06-10; pure rename derivedAt → createdAt in both recorders + all call sites; suite green as regression net)
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:85-88; src/__tests__/provenance/derived.test.ts:118-122

The driving-path recorder's optional timestamp input is named `derivedAt` (`input: { dir; surfaceId; derivedAt?: Date }`), feeding the sidecar field `createdAt`. The name contradicts the mode it records — "derived" is the *other* mode, and the module spends its entire header explaining why the two must never be confused. The tests dutifully pass `derivedAt` when recording a driving wireframe (derived.test.ts lines 118-122), which reads as a category error at every call site.

Blast radius: no behavioral consequence — the value lands in `createdAt` correctly — but this is an exported public API (`@/provenance`), so the misleading name propagates to every future caller and to the eventual `bin/` verb's flag naming. Hence low. Fix: rename to `createdAt?` (or `at?`) in both record functions for symmetry, while the call-site count is still two test files.

### AUDIT-20260611-06 — `loadProvenance` does not verify the sidecar's inner `surfaceId` matches the requested one

Finding-ID: AUDIT-20260611-06
Status:     fixed-84bcc73c (2026-06-10; loadProvenance asserts the sidecar's inner surfaceId equals the requested id, throwing with both ids; RED-first via copied-sidecar fixture)
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:129-139

`loadProvenance(dir, surfaceId)` resolves the file by name and zod-validates its shape, but never asserts `parsed.surfaceId === surfaceId`. A sidecar copied or renamed to another surface's filename (an easy mistake when seeding a second surface from a first) loads cleanly and flows into `checkDerivedAcceptance`, whose finding message then reports the *argument's* surface id (line 158) while gating against the *other* surface's snapshot and hash — a confusing mixed-identity verdict instead of a loud failure.

Blast radius: requires a file-management mistake to trigger, and the resulting behavior is confusing rather than silently wrong in a damaging direction (the hash check still fires against whatever snapshot the record names). Hence low. Fix: one equality check after parse, throwing with both ids in the message.

### AUDIT-20260611-07 — `recordDerivation` can leave an orphaned snapshot if sidecar write fails

Finding-ID: AUDIT-20260611-07
Status:     fixed-a26a1645 (2026-06-10; both artifacts staged as .tmp-<pid> then promoted via renameSync — snapshot first, sidecar last as the commit point; staged temps cleaned on failure; 2 RED-first tests incl. planted-directory write failure)
Severity:   medium
Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`

`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.

The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.

## 2026-06-11 — audit-barrage lift (20260611T062812148Z-design-control-after_clarify)

### AUDIT-20260611-08 — Run 20260611T062218157Z is uncommitted, and the governance diff renders its files as malformed absolute-path entries (`a/Users/orion/...`)

Finding-ID: AUDIT-20260611-08
Status:     fixed-in-bookkeeping-commit (2026-06-10; run dirs 20260611T062218157Z + 20260611T062812148Z committed matching 9c0d556c's pattern; the diff-builder absolute-path rendering half is a stackctl defect filed upstream as https://github.com/audiocontrol-org/deskwork/issues/458)
Severity:   medium
Surface:    plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/ (untracked); the `diff --git a/Users/orion/work/...` entries at the tail of the audited diff

Commit 90bc5507's message cites run 20260611T062218157Z ("floor shortfall") as the justification for the config change, but `git show 90bc5507 --stat` shows the commit contains only `audit-barrage-config.yaml` — the run record itself (INDEX.md, PROMPT.md, codex.md with two findings, gemini stderr, tip.sha) is untracked working-tree state. This breaks the protocol's own pattern: the sibling run 055621128Z was committed in 9c0d556c. The evidentiary record for a committed config change exists only on one machine and vanishes with the worktree. Separately, the diff-builder rendered those untracked files into this audit's payload as `diff --git a/Users/orion/work/deskwork-work/design-control/plugins/...` — absolute paths posing as repo-relative ones. Any consumer that applies or path-keys on this diff would create a literal `Users/` tree at the repo root, and an auditor reading the diff is misled into believing such a tree was committed (I initially was; only a live `ls` disproved it).

Blast radius: medium. The governance discipline's value rests on run records being durable and discoverable; an uncommitted record cited by a commit message is a provenance gap in the provenance tooling itself, and the absolute-path diff rendering will mislead every future cross-model auditor fed this payload. Fix: commit the run directory (matching 9c0d556c's pattern), and make the diff-builder either exclude untracked files or render them with correct repo-relative prefixes.

### AUDIT-20260611-09 — Two codex findings from run 062218157Z are committed-adjacent but undispositioned — and both name real defects in the current code

Finding-ID: AUDIT-20260611-09
Status:     resolved-via-AUDIT-20260611-10/-11 (2026-06-10; the refused round's codex-01/-02 were re-surfaced by this run's claude lanes as cross-model findings -10/-11 and are fixed — 43390a07 + 9ceba4fb; no undispositioned residue remains)
Severity:   medium
Surface:    audit-runs/20260611T062218157Z-design-control-after_clarify/codex.md (AUDIT-BARRAGE-codex-01, -02); plugins/design-control/specs/001-design-control/audit-log.md (no matching entries)

The run produced AUDIT-BARRAGE-codex-01 (`wireframeFile` can escape the provenance directory) and AUDIT-BARRAGE-codex-02 (`recordDerivation` can clobber an existing snapshot before the sidecar commit fails). A grep of `audit-log.md` finds no disposition for either. The run failed the ≥2-emitting-models floor, which legitimately refuses the *round* — but the findings exist, were captured to disk, and I have independently verified both defects are present in `src/provenance/derived.ts` as written (see claude-03 and claude-04 below, which are my independent confirmations). Per the project's scope-don't-defer rule, a captured finding with no disposition is precisely the parked-defect failure mode the audit-log exists to prevent; the floor refusal is being silently treated as if it also voided the findings.

Blast radius: medium. Nothing breaks today, but two verified-real defects in a tamper-evidence module are sitting in an untracked file with no tracking entry — the discipline degrades silently. Fix: lift both into the audit-log with IDs and dispositions (the fixes are small; see the two findings below).

### AUDIT-20260611-10 — `wireframeFile` is interpolated into paths with no validation — the surfaceId fix (AUDIT-20260611-02) left its sibling input open

Finding-ID: AUDIT-20260611-10 (claude-03 + codex-01; cross-model)
Status:     fixed-43390a07 (2026-06-10; PORTABLE_FILENAME_PATTERN + assertPortableWireframeFile record-time AND portableFilenameSchema on BOTH stored filenames zod-side, mirroring the surfaceId defense; 7 RED-first tests incl. a hash-matching planted ../outside.html)
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:75 (drivingSchema), :172 (recordDrivingWireframe join), :344 (verifyDrivingWireframe join)

Commit 896be642 added `assertPortableSurfaceId` at every surfaceId path-building entry, with a zod-side defense on load. But `recordDrivingWireframe` then does `join(input.dir, input.wireframeFile)` (line 172) with `wireframeFile` constrained only to `z.string().min(1)` (line 75), and `verifyDrivingWireframe` re-joins the stored value at line 344. A `wireframeFile` of `../outside.html`, a nested `sub/file.html`, or a planted sidecar carrying a traversal path binds driving provenance to — and later "verifies" — an artifact outside the operator-chosen wireframes directory. SKILL.md (step 6) promises the filename is "relative to `<wireframes-dir>`" but nothing enforces it. This is the exact shape AUDIT-20260611-02 fixed for surfaceId, applied asymmetrically.

Blast radius: medium — operator/agent-supplied input, so the realistic failure is provenance bound to the wrong artifact (a certification surface certifying outside its directory) rather than exploitation, but driving records are the module's strongest claim and the asymmetry compounds with adoption. Fix: validate `wireframeFile` as a portable filename (reuse `SURFACE_ID_PATTERN`-style validation plus an extension allowance) at record time AND in `drivingSchema`, mirroring the surfaceId defense's both-sides shape.

### AUDIT-20260611-11 — `recordDerivation`'s promote can destroy a pre-existing snapshot — append-once guards only the sidecar target

Finding-ID: AUDIT-20260611-11 (claude-04 + codex-02; cross-model)
Status:     fixed-9ceba4fb (2026-06-10; append-once refuses on a lingering snapshot target; snapshot promote is linkSync no-clobber so a race throws EEXIST instead of destroying the baseline; recovery messages updated to name both artifacts; 3 RED-first tests)
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:228-263 (assertAppendOnce checks only sidecarPath; renameSync clobbers snapshotTarget)

`assertAppendOnce` checks only `<surfaceId>.provenance.json`. The promote then `renameSync(stagedSnapshot, snapshotTarget)` — which silently overwrites an existing file on POSIX — *before* the sidecar commit point. The module's own error messages create the triggering scenario: `checkDerivedAcceptance` and `verifyDrivingWireframe` both instruct "Remove the existing record, then re-derive." An operator who removes the sidecar (leaving the historical snapshot) and re-derives gets the old baseline overwritten at line ~251; if the sidecar rename then fails, the catch block removes only `.tmp-` staging paths — the original snapshot bytes are gone, replaced by an uncommitted attempt's bytes, with no sidecar referencing either. This contradicts the commit a26a1645 claim of "no half-state on failure": the failure path now mutates pre-existing state.

Blast radius: medium. Requires the remove-and-re-derive recovery path plus a write failure, but the destroyed artifact is exactly the kind of historical baseline the provenance discipline exists to preserve, and the documented recovery procedure is what walks the operator into it. Fix: include `snapshotTarget` in the append-once refusal (refuse if either final target exists), or promote with no-clobber semantics (`linkSync` + `unlink` instead of `renameSync`).

### AUDIT-20260611-12 — The append-once guarantee is check-then-act — concurrent recorders for the same surface can both succeed

Finding-ID: AUDIT-20260611-12
Status:     fixed-8916f7d7 (2026-06-10; driving sidecar written with flag wx — O_CREAT|O_EXCL atomic check-and-write; derived sidecar promote linkSync no-clobber; EEXIST on every path maps to the shared append-once refusal; 2 RED-first tests via dangling-symlink TOCTOU stand-in)
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:128-141 (assertAppendOnce existsSync), :143-146 (writeProvenance with default 'w' flag), :251-252 (clobbering renameSync)

`assertAppendOnce` uses `existsSync`, then `writeProvenance` writes with the default `'w'` flag and `recordDerivation` promotes via clobbering `renameSync`. Two concurrent recorders for the same surface (the stack-control thesis explicitly targets parallel unattended execution) can both pass the existence check and both "succeed," last-writer-wins — including the derived→driving laundering direction that 0e4027c3 was written to kill. The window is small, but the guarantee is the module's headline promise and the atomic primitive is one flag away.

Blast radius: low — requires two processes recording the same surface near-simultaneously, which already implies an orchestration error, and the result is one record silently lost rather than a default-path failure. Fix: `writeFileSync(path, data, { flag: 'wx' })` for the driving sidecar (making check-and-write atomic, with EEXIST mapped to the append-once refusal), and a link-based no-clobber promote on the derived path (which also resolves claude-04).

### AUDIT-20260611-13 — The govern loop's audited diff embeds its own prior run artifacts — payload compounds each round, and the 900s timeout treats the symptom

Finding-ID: AUDIT-20260611-13
Status:     filed-upstream https://github.com/audiocontrol-org/deskwork/issues/459 (2026-06-10; stackctl-govern defect — the governed diff must exclude .stack-control/audit-runs/ meta-artifacts; the 900s timeout stays as mitigation until the generator is removed upstream)
Severity:   medium
Surface:    plugins/design-control/.stack-control/audit-barrage-config.yaml:30-37 (claude 300→900 rationale); the audited diff's inclusion of audit-runs/\*\*/PROMPT.md

This run's payload contains run 062218157Z's PROMPT.md (~3757 lines), which itself embeds run 055621128Z's full PROMPT.md (~859 lines), which embeds the original feature diff — three levels of recursive self-quotation. Because the governed diff is taken against a fixed base (4a7f30d0) and run artifacts are committed inside the audited tree, every governance round appends its own bookkeeping to the next round's prompt. The config comment documents the consequence — a 181KB prompt and a claude timeout at 301s — and responds by raising the timeout to 900s. That is a symptom patch; the generator is the inclusion of `.stack-control/audit-runs/` (meta-artifacts about the audit) in the diff the audit reads. Per the project's own spec-audit-diminishing-returns rule: remove the generator, don't feed it.

Blast radius: medium and monotonically worsening — each round adds its predecessor's full payload, so timeouts and zero-byte model failures (the exact fleet-degradation mode issue 447 documented) recur at the next size doubling regardless of timeout value, and auditor attention is diluted across thousands of lines of self-quotation. Fix: exclude `.stack-control/audit-runs/` (and governance bookkeeping generally) from the governed diff via pathspec, keeping the diff scoped to work product.

### AUDIT-20260611-14 — Seeded config's header narrates a different feature's history ("project override for graphical-entries")

Finding-ID: AUDIT-20260611-14
Status:     fixed-in-bookkeeping-commit (2026-06-10; header rewritten to name this installation + the seeding event; inherited graphical-entries rationale explicitly attributed; stale dw-lifecycle template path corrected to the stack-control template)
Severity:   low
Surface:    plugins/design-control/.stack-control/audit-barrage-config.yaml:1-27

The file seeded into the design-control nested installation opens with "project override for graphical-entries" and carries that feature's gemini-failure statistics (16 of 17 runs across "the graphical-entries Phase 0 audit cycle") and Phase 12 Task 8 history verbatim. Only the final comment block (claude 300→900, specs/014) belongs to this installation. A future reader tuning this config inherits another feature's rationale as if it were locally measured evidence.

Blast radius: low — no behavioral consequence (the `models:` block is correct), purely misleading provenance in comments, but this plugin's whole subject matter is records that accurately bind to what they describe. Fix: reword the header to name this installation, keep the gemini-disable rationale but attribute it ("per the root override, originally measured on graphical-entries"), and drop the Phase-12 block or cite it as inherited.

---

**Summary for triage:** 7 findings, 0 high/blocking. The strongest cross-cutting signals: (1) the governance tooling itself dropped a run record cited by a commit and rendered untracked files with absolute paths into this very audit's payload (claude-01); (2) two real, verified code defects from the floor-refused run are sitting untriaged (claude-02, independently confirmed as claude-03/-04); (3) the recursive prompt-growth generator behind the timeout bump will defeat the 900s ceiling too (claude-06). Claude-03 and -04 corroborate codex's findings from run 062218157Z — that's cross-model agreement, the protocol's HIGH-confidence signal, despite my medium per-finding blast-radius ratings.

## 2026-06-11 — audit-barrage lift (20260611T123117674Z-design-control-after_clarify)

### AUDIT-20260611-15 — A heading-level typo silently drops an entire rule and the spec still reports green — contradicting the module's "never silently kept or dropped" headline

Finding-ID: AUDIT-20260611-15
Status:     fixed-9f5d9a46bc60440da6284b160a0154504360f436
Severity:   high
Surface:    plugins/design-control/src/design-language/schema.ts:127-137 (RULE_HEADING_RE match-or-ignore), schema.ts:32 (`RULE_HEADING_RE = /^rule:\s*(.*)$/`)

A rule heading that near-misses the convention is treated as an ordinary section heading, which **resets `current` and silently discards the entire rule plus all of its fields** — with zero findings, and `ok: true` if any other valid rule exists. Empirically verified by executing `parseDesignSpec` against `### Rule: masthead` (capitalized) and `### rule fine-but-no-colon` (missing colon) alongside one valid rule: result was `findings: []`, `rules: ["real"]`, `ok: true`. Two whole rules the author believes exist vanish from the parsed spec, and the gate prints "spec green — 0 findings". Contrast with the field level, where the diff explicitly builds an `unknown-field` typo guard and tasks.md (line "invalid rules become findings, never silently kept or dropped") claims silent drops can't happen — the guard exists one structural level down but not at the level that loses the most content per miss.

Blast radius: this is the gate every draft must pass before presentation, and its consumers act on the green verdict unattended — the SKILL.md procedure (step 4→5) presents a green spec to the operator as complete, and downstream referee/implementation steps treat the parsed rule set as the design language. A capitalized `Rule:` is among the most natural hand-authoring variations (sentence-case headings are the markdown default idiom), so the wrong outcome is reached by default and nothing in the artifact corrects it: the missing rule produces no finding, no skipped-note, no count discrepancy unless the operator hand-counts rules against the output's `N rule(s)`. Fix: add a near-miss detector — a heading whose text matches `rule` case-insensitively or `rule\b` without a colon (e.g. `/^rule\b/i`) but fails the strict form gets a `malformed-rule-heading` (or new `suspicious-rule-heading`) finding, mirroring the `unknown-field` allowlist philosophy stated in the module's own doc comment (schema.ts header: "silently dropping a misspelled `example:` would otherwise fabricate a missing-example rejection with no visible cause" — the identical argument applies to headings, with bigger loss).

### AUDIT-20260611-16 — A curly-apostrophe `don’t:` field is silently inert — guidance vanishes with no finding when a `do:` is also present

Finding-ID: AUDIT-20260611-16
Status:     fixed-7a3c37be6d8bd9b781bf01086e8c97c0a23b4e54
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:34 (`FIELD_BULLET_RE = /^[-*]\s+([a-z][a-z']*)\s*:\s*(.*)$/`)

`FIELD_BULLET_RE`'s key character class admits only the ASCII apostrophe (`[a-z']`). The Unicode right single quotation mark `’` — what macOS smart-quotes, most prose editors, and copy-paste from any rendered document produce — fails the regex entirely, so `- don’t: never raw hex` is classified as inert prose: it doesn't reach the `unknown-field` typo guard (that guard only fires when the bullet *matches* the field shape with an unknown key). Empirically verified: a rule with `- do: keep ink` and `- don’t: never raw hex` (curly) parses with `findings: []` and `donts: []` — the prohibition silently disappears from the spec. Only when the curly `don’t` is the rule's *sole* guidance does a finding appear (`missing-guidance`), and even then the cause is invisible.

Blast radius: the spec is explicitly a hand-authorable prose artifact, so smart-quote substitution is a when-not-if input, and the lost content is specifically the *don't* side — the prohibitions that exist to stop an unattended implementation agent from doing the wrong thing. The check stays green, so nothing prompts a re-read. The same root behavior (non-matching line → inert) is by design for capitalized prose bullets, but `don’t`/`don't` homoglyph confusion is not an authoring choice — it's an editor artifact. Fix: widen the key class to accept `’` and normalize to `don't` before the `isKnownKey` check (one-line: `key.replace(/’/g, "'")`), or add `don’t` to the recognized-then-normalized set; a test pinning the curly form belongs in the corpus.

### AUDIT-20260611-17 — Quoted attribute selectors are unlinkable — string-stripping rewrites the source prelude so the liveness check fabricates a dead-link on a live selector

Finding-ID: AUDIT-20260611-17
Status:     fixed-76e1cefda423e25d4907869300bc9f9e2879abb5
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:46-73 (stripCommentsAndStrings strips string CONTENTS), :117-137 (cssDefinesSelector matches against the stripped prelude)

`stripCommentsAndStrings` deliberately empties string literals while keeping delimiters, and `collectSelectorPreludes` runs on that stripped text — so a source rule `input[type="text"] { … }` yields the prelude `input[type=""]`. No spec link can match it: verified empirically that `cssDefinesSelector` returns `false` for both the quoted query `input[type="text"]` and the unquoted `input[type=text]` against that source. Any rule anchored to a quoted attribute selector (`[type="checkbox"]`, `[data-state="open"]`, `[aria-expanded="true"]` — common anchors for exactly the component-kind rules this schema defines) is reported `dead-link-selector` even though the selector is live in the file. The module's own header promises skipped scope is "never fabricated into a dead-link verdict" — this path fabricates one inside the validated scope.

Blast radius: a hard exit-1 wall, but a *visible* one — the operator sees the finding, just gets told a true link is dead. Per SKILL.md step 4 the operator must "fix the link" or "update the rule" and is forbidden to delete the rule; neither remedy exists for this class, so the realistic outcome is re-anchoring to a class selector or a confused push-back, not silent corruption — hence medium rather than high. Fix options: strip strings only when scanning *declaration* text (the prelude/declaration boundary is already tracked via `{`/`}`/`;`), or strip string contents from the *query* with the same function before comparing so both sides normalize identically (`stripCommentsAndStrings(selector)`), which preserves the `content: ".ghost"` protections the tests pin.

### AUDIT-20260611-18 — "Defined in source" is satisfied by a selector that only appears inside `:not(...)` or as a non-subject compound — liveness over-approximates definition

Finding-ID: AUDIT-20260611-18
Status:     fixed-76a065599b6b020c4eb8c8bdf478d696dc073057
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:117-137 (cssDefinesSelector substring-in-prelude match)

The implemented predicate is "appears ident-boundary exact inside some selector prelude," which is weaker than the documented promise ("the selector must be **defined in that author-written CSS source**", SKILL.md line 47; tasks.md "selector/class must be *defined in author-written source*"). Verified empirically: `cssDefinesSelector('.real:not(.ghost) { … }', '.ghost')` returns `true` — a class that exists *only as an exclusion* in someone else's rule counts as a live anchor. The same holds for any appearance in `:is()`/`:where()`/combinator position. A design rule anchored to such a selector passes the gate while no styling for it exists, which is precisely the rot ("the spec cannot quietly drift into fiction") the liveness axis exists to catch.

Blast radius: low — it requires the spec author to link a selector that happens to appear only in a negation/functional-pseudo context, which is an unusual coincidence rather than a default path, and the failure direction is a missed rot signal (false green on one link), not a false refusal or data loss. The module's internal doc comment honestly describes the mechanism, so a maintainer reading the code isn't misled — only the outward-facing promise is slightly stronger than the check. Fix when worth it: exclude the contents of functional pseudo-class parentheses from the matchable prelude text the same way at-rule preludes are excluded (the paren-tracking is a small extension of the existing state machine), or soften the SKILL.md/tasks.md wording to "appears in a selector of."

### AUDIT-20260611-19 — A duplicate rule heading's entire body is silently ignored — including suppression of the unknown-field typo guard inside it

Finding-ID: AUDIT-20260611-19
Status:     fixed-d4c26551dd91609c011458bf2972642b0747428c
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:155-163 (duplicate-rule-id branch leaves `current` undefined), :176-178 (fields skipped when `current === undefined`)

On a `duplicate-rule-id` hit the parser emits the finding but leaves `current` unset, so every field bullet under the duplicate heading is dropped without inspection — verified empirically that a duplicate section containing both a misspelled `- exmaple:` and a second `- css:` link produces only `["duplicate-rule-id"]`: the typo guard and the extra link are invisible. The likely authoring intent behind a duplicate id is a copy-paste meant to *extend or replace* the first rule; the author sees one finding, renames the id, and only then discovers the next wave of findings the section was carrying. Same wave-revelation shape exists at the compose layer (check-spec-file.ts:36-39): liveness runs only over `parsed.spec.rules`, which excludes structurally invalid rules, so a rule with a missing example *and* a dead css link reports the dead link only after the example is fixed.

Blast radius: low — every path still ends at a non-green verdict (the duplicate finding itself gates exit 1), so nothing wrong ships; the cost is extra fix-rerun round-trips and a momentarily misleading "1 finding" count, not a wrong outcome. Fix: parse the duplicate section into a throwaway `RawRuleSection` (so its field-level findings still surface, attributed to the duplicate heading's line) while continuing to exclude it from `spec.rules`; optionally run liveness over structurally invalid sections' parsed `cssLinks` too, since the two axes are independent.

---

**Summary for triage:** 5 findings, 0 blocking, 1 high. The high finding (claude-01) and the first medium (claude-02) share a root shape — the parser's "non-matching line is inert prose" stance has no near-miss detection above the field-key level, so the artifact's own headline guarantee ("never silently kept or dropped", tasks.md) holds only for one of the three structural levels; both were confirmed by executing the shipped module, not by reading alone. Claude-03 is a verified false-positive class in the liveness gate (quoted attribute selectors are unlinkable). All five reproduce with one-line probes against `parseDesignSpec`/`cssDefinesSelector`, so RED-first regression tests are cheap for each.

### AUDIT-20260611-20 — Schema-invalid rules never reach the link-liveness pass

Finding-ID: AUDIT-20260611-20
Status:     fixed-d4c26551dd91609c011458bf2972642b0747428c
Severity:   medium
Surface:    plugins/design-control/src/design-language/check-spec-file.ts:33-35; plugins/design-control/src/design-language/schema.ts:226-228

`checkDesignSpecFile` parses the markdown, then runs liveness only against `parsed.spec` (`check-spec-file.ts:33-35`). But `parseDesignSpec` filters `spec.rules` down to structurally valid rules only (`schema.ts:226-228`). That means a single rule with both a schema defect and a dead CSS selector reports only the schema defect; its `css:` link is silently excluded from the liveness axis until the operator fixes the schema and reruns.

Blast radius is medium: the checker still fails the spec, so it does not ship a green verdict for that broken rule, but it violates the stated combined gate and creates incremental, rerun-dependent discovery. A reasonable fix is to preserve raw rule sections or parsed CSS links for all rule headings, then run liveness for any syntactically usable `css:` field even when the rule also has schema findings.

### AUDIT-20260611-21 — The audited diff introduces explicit deferral language into the skill and checker contract

Finding-ID: AUDIT-20260611-21
Status:     fixed-03ae92912178077dbf4fccf8783bfca79fe09432
Disposition-note: scope recorded after AUDIT-20260611-26 re-flagged one cited surface —
run-time surfaces (SKILL.md, CLI output), source doc comments, and the agent-authored Done
annotations in tasks.md now use stable capability statements; the PRE-EXISTING ported task
text in tasks.md and spec.md deliberately RETAINS the operator-approved "named-deferred"
capture vocabulary (planning artifacts whose scope language the operator owns; rewording them
is not the agent's call). The narrowing is deliberate and auditable, not an oversight.
Severity:   low
Surface:    plugins/design-control/skills/translate-design-language/SKILL.md:44-48,97-98; plugins/design-control/src/design-language/check-spec-file.ts:68-71; plugins/design-control/specs/001-design-control/tasks.md:176-191

The diff repeatedly encodes “not validated in v1” / “named-deferred” / “out of v1 scope” language in the operator-facing skill, CLI output, and workplan. The audit prompt’s hard constraint rejects deferral phrases because they become bug-factory commitments in unattended workflows; here they are not just comments, they appear in the user-facing validation output (`check-spec-file.ts:68-71`) and in the skill’s instructions about what the operator may present (`SKILL.md:80-82`).

Blast radius is low because the scope boundary is visible and intentional, and the code does not hide skipped links. The operational risk is documentation discipline: agents may normalize presenting partially unchecked specs as “green” because the deferral is built into the happy path. A reasonable fix is to replace temporal deferral phrasing with a stable capability statement, such as “non-CSS targets are reported as unchecked notes and do not establish link-liveness.”

## 2026-06-11 — audit-barrage lift (20260611T131139811Z-design-control-after_clarify)

### AUDIT-20260611-22 — A setext `rule:` heading parses silently green — the rule vanishes and its fields merge into the preceding rule

Finding-ID: AUDIT-20260611-22
Status:     fixed-b4284b334e8b464697d912b11afe13db1206c25a
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:36 (`HEADING_RE = /^#{1,6}\s+(.*)$/` — ATX only), :228-241 (near-miss guard fires only inside the ATX-heading branch)

The AUDIT-15 fix added a heading-level typo guard, but the guard lives entirely inside the ATX-heading branch — a markdown **setext** heading (`rule: beta` underlined with `---` or `===`) renders as a real heading to the author yet never matches `HEADING_RE`. Verified empirically: a spec with valid `### rule: alpha` followed by setext `rule: beta\n----------` and beta's field bullets returns `ok: true, findings: []` with ONE rule — alpha — now carrying **beta's css link and example merged into it** (`css: [.alpha, .beta]`, `examples: 2`). This is worse than a plain silent drop: the intended rule disappears with zero findings AND the surviving rule's parsed content is corrupted, so a dead `.beta` selector would later be misattributed to alpha, and a live one yields a fully green verdict (`spec green — 0 findings (1 rule(s))`) for a spec the author believes declares two rules. This is exactly the silent-green direction the module's headline guarantee ("never silently kept or dropped") and the just-landed near-miss guard exist to kill — one heading syntax over.

Blast radius: medium. The convention doc says ATX, which caps plausibility below the capitalized-`Rule:` case (rated high last round), but setext is legal CommonMark that renders identically to the author, the failure is invisible (green verdict, no count discrepancy beyond a rule-count the author must hand-check), and the corruption direction (field accrual into a neighboring rule) can survive into downstream consumers of `spec.rules`. Fix: detect setext underlines (a line of only `-`/`=` following a non-blank line) as headings in the line loop, or at minimum run the `RULE_NEAR_MISS_RE` guard against any *non-bullet* paragraph line matching `/^rule\b/i` so the attempted declaration surfaces as `malformed-rule-heading` instead of inert prose.

### AUDIT-20260611-23 — The heading near-miss guard over-triggers: any prose heading whose first word is "Rule" can no longer appear in a green spec

Finding-ID: AUDIT-20260611-23
Status:     fixed-b4284b334e8b464697d912b11afe13db1206c25a
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:43 (`RULE_NEAR_MISS_RE = /^rule\b/i`), :228-241 (offence classification)

The AUDIT-15 guard classifies every heading whose first word is `rule` (any case) as an *attempted* rule heading. Verified empirically: `## Rule of thumb` alongside one valid rule yields `malformed-rule-heading@1`, `ok: false` — exit 1. Ordinary documentation headings (`## Rule kinds`, `## Rule-based exceptions`, `## Rule of thirds` in a design doc about composition) are now structurally forbidden, and the finding's message compounds the confusion by asserting the heading is "missing the ':' after 'rule'" when no colon was ever intended. The classifier also misdescribes `### rule :x` (colon present, preceded by a space) as colon-missing. Neither the SKILL.md convention section nor the schema doc tells authors that headings beginning with the word "rule" are reserved.

Blast radius: low — the failure direction is a loud false refusal, not a silent wrong outcome; the operator sees the finding and can reword, though the misleading message costs a confused round-trip. The trade-off is inherent to near-miss detection, but the current net is wider than the test corpus admits (only `Ruler settings` is pinned inert). Fix options: narrow the trigger (e.g. require a colon somewhere in the heading, or `rule` followed by a single id-shaped token), make the message name the actual mismatch, and document the reserved prefix in SKILL.md's convention section.

### AUDIT-20260611-24 — A near-miss heading's section body is dropped uninspected — the single-pass surfacing built in the same fix round doesn't cover it

Finding-ID: AUDIT-20260611-24
Status:     fixed-b4284b334e8b464697d912b11afe13db1206c25a
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:227-243 (near-miss branch leaves `current` undefined; no throwaway section)

AUDIT-19/-20's fix (d4c26551) established the pattern: sections excluded from `spec.rules` are still parsed into throwaway sections so field-level defects and auxiliary css links surface in the same run. The near-miss branch added by AUDIT-15's fix (9f5d9a46) doesn't follow it — `current` stays `undefined`, so every bullet under a `### Rule: masthead` heading is skipped entirely. Verified empirically: a near-miss section containing both a misspelled `- exmaple:` and a `- css: studio.css .ghost` link produces only `["malformed-rule-heading"]` with `auxiliaryCssLinks: []` — the typo guard never fires and the link never reaches liveness. The author fixes the heading casing, reruns, and only then receives the next wave of findings — precisely the fix-and-rerun shape the same commit series eliminated for duplicate and structurally-invalid sections.

Blast radius: low — the near-miss finding itself gates exit 1, so nothing wrong ships; the cost is rerun-dependent discovery and an internally inconsistent parser contract (`schema.ts`'s own doc comment now promises single-pass surfacing that one of three excluded-section kinds doesn't deliver). Fix: mirror the duplicate-id branch — parse the near-miss section into a throwaway `RawRuleSection` (id from the attempted heading text) so field findings and `auxiliaryCssLinks` surface alongside `malformed-rule-heading`.

### AUDIT-20260611-25 — Attribute-selector quote-style mismatch still fabricates a dead-link on a live selector — the AUDIT-17 fix only matches identical delimiters

Finding-ID: AUDIT-20260611-25
Status:     fixed-ee05786df57241f2089f1ab06ed9b3ab4c659d96
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:50-76 (stripCommentsAndStrings preserves delimiters), :169-177 (cssDefinesSelector strips both sides)

The AUDIT-17 fix (76e1cefd) normalizes string *contents* on both sides, so a quoted query matches a quoted source — but delimiters are preserved, so any quote-style divergence between spec and CSS still fails. Verified empirically, all three ways: query `input[type=text]` vs source `input[type="text"]` → `false`; query `input[type="text"]` vs source `input[type=text]` → `false`; query `input[type="text"]` vs source `input[type='text']` → `false` (exact-style sanity check → `true`). All four spellings select identical elements in CSS; unquoted and single-quoted attribute values are completely ordinary authoring. The module's documented "accepted over-approximation" covers only the false-green direction (`[data-state="open"]` matching `[data-state="closed"]`) — this false-dead direction is undocumented and contradicts the header's "never fabricated into a dead-link verdict" promise within validated scope.

Blast radius: low — a visible exit-1 false refusal, and the realistic authoring path (copying the selector verbatim from the CSS file) sidesteps it; it bites when the author types the selector from memory or the CSS is later reformatted by a tool that changes quote style (Prettier normalizes to double quotes — a formatting commit would flip previously-green links to dead). Fix: normalize attribute-value delimiters on both sides (e.g. rewrite `['"]?` content-stripped values to a canonical empty `""`, treating `[attr=]`, `[attr=""]`, `[attr='']` identically), pinned by a RED test per quote-style pair.

### AUDIT-20260611-26 — AUDIT-21 is dispositioned "fixed" but one of its cited surfaces — tasks.md — still carries the temporal deferral phrasing

Finding-ID: AUDIT-20260611-26
Status:     fixed-258d6476fe2bb0eb109af69e139f4d3ac1e53d12
Severity:   low
Surface:    plugins/design-control/specs/001-design-control/tasks.md:176-191 ("is **not validated in v1** (named-deferred)", "Runtime dead-CSS + spec-truthfulness are named-deferred", "visible v1 scope"); audit-log disposition for AUDIT-20260611-21

Commit 03ae9291 replaced temporal deferral phrasing with capability statements in SKILL.md and the CLI output (verified in the final-state diff: "reported as unchecked notes and do not establish link-liveness", "outside its validated scope" — clean), and the audit log records AUDIT-21 as `fixed-03ae9291`. But the original codex finding explicitly anchored three surfaces, including `tasks.md:176-191`, and the workplan's task text retains "not validated in v1 (named-deferred)" and "named-deferred" verbatim in the final state. The workplan is the artifact the next implementing agent reads to understand the gate's contract, so the bug-factory mechanism the finding named — agents normalizing "deferred" as the contract — survives on one of the three cited surfaces while the disposition claims all seven findings fixed.

Blast radius: low — the two surfaces an operator actually touches at run time (skill body, CLI output) are fixed, and a workplan is partially version-bound history where naming v1 is defensible; the defect is disposition accuracy (a `fixed` status whose cited surface is unchanged), which matters in this project precisely because the audit log is the instrument future rounds use to decide what not to re-report. Fix: either reword the tasks.md scope sentences to the same capability framing, or amend the AUDIT-21 disposition to record the deliberate exclusion of tasks.md so the narrowed scope is auditable.

---

**Summary for triage:** 5 findings, 0 blocking/high, 1 medium. The medium (claude-01) and the two heading-guard lows (claude-02, claude-03) share a root shape: the AUDIT-15 near-miss guard fixed the capitalized-`Rule:` instance but neither generalized to the other markdown heading syntax (setext — where the failure is silent-green plus cross-rule field corruption, the worst direction in the module) nor adopted the same commit series' own single-pass surfacing pattern for the sections it rejects. Claude-04 is the symmetric residual of AUDIT-17 (delimiter-sensitive matching). All four code findings reproduce with one-line probes against `parseDesignSpec`/`cssDefinesSelector` and were confirmed by execution; the suite at tip is green (439/439, typecheck clean), so each fix can land RED-first. Claude-05 is bookkeeping accuracy, not code.

### AUDIT-20260611-27 — Selector argument normalization makes distinct state selectors interchangeable

Finding-ID: AUDIT-20260611-27
Status:     fixed-ee05786df57241f2089f1ab06ed9b3ab4c659d96
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:157-180

`cssDefinesSelector` strips string contents and functional pseudo-class arguments from both the query and source prelude before matching. The comment explicitly states the consequence: a query for one quoted attribute value matches a source rule with a different value, and a full functional-pseudo selector can match a source rule with different arguments. That means `.chip[data-state="open"]` can be accepted when the CSS only defines `.chip[data-state="closed"]`, and `.real:not(.ghost)` can be accepted when only `.real:not(.other)` exists.

Blast radius is medium: this creates a false green for common component-state selectors, so the checker can say a design-language rule is linked to live CSS when the exact state anchor is absent. The user-facing skill still says the selector must be defined in the source, so a downstream agent will not know that state values are ignored. A reasonable correction is to keep string and functional arguments comparable in selector preludes while still excluding declaration strings such as `content: ".ghost"`.

### AUDIT-20260611-28 — Absolute CSS paths can pass even though the spec contract says paths are relative

Finding-ID: AUDIT-20260611-28
Status:     fixed-165e69b7bd53cd92945f9dfe8821ff648475de2b
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:96-110; plugins/design-control/src/design-language/link-liveness.ts:211-217; plugins/design-control/skills/translate-design-language/SKILL.md:42-46

The skill contract says `css:` paths are relative to the spec file, but the parser accepts the first whitespace-free token without validating it, and liveness passes it directly to `resolve(baseDir, link.path)`. In Node, an absolute path ignores `baseDir`, so `css: /Users/.../studio.css .btn` can go green on the author’s machine while producing a nonportable design-language spec.

Blast radius is medium because deskwork artifacts are collection content, not machine-local state. A green spec with absolute local paths will mislead downstream consumers or fail outside the original checkout. The checker should reject absolute paths as malformed, and probably reject or consciously constrain parent traversal if the intended artifact boundary is the spec directory or collection root.

### AUDIT-20260611-29 — Temporal scope wording still remains in the audited diff

Finding-ID: AUDIT-20260611-29
Status:     fixed-258d6476fe2bb0eb109af69e139f4d3ac1e53d12
Severity:   low
Surface:    plugins/design-control/specs/001-design-control/tasks.md:176-191; plugins/design-control/src/design-language/schema.ts:15-18; plugins/design-control/src/design-language/link-liveness.ts:9-15; plugins/design-control/src/design-language/types.ts:42-45

The operator-facing skill and CLI text were rewritten to capability statements, but the workplan and design-language source comments still retain the temporal scope phrasing called out by the audit prompt’s hard constraint. The visible task record at `tasks.md:176-191` still carries that language several times, and source comments repeat the same framing in the schema, liveness, and shared type docs.

Blast radius is low because the runtime behavior is visible and the CLI now uses stable capability language. The issue is documentation discipline: future agents reading the workplan or comments can reintroduce the same phrasing into operator-facing surfaces. A reasonable correction is to use capability wording consistently, matching the skill and CLI text.

## 2026-06-11 — audit-barrage lift (20260611T134728627Z-design-control-after_clarify)

### AUDIT-20260611-30 — The documented gate command crashes: the bin shim resolves tsx but not the `@/` path alias when invoked from anywhere but the plugin directory

Finding-ID: AUDIT-20260611-30
Status:     fixed-725389bc611f04402288f82dcc0b9193a63432f4
Severity:   high
Surface:    plugins/design-control/bin/check-design-spec:9-26 (tsx walk-up + bare `exec "$TSX" …` with no `--tsconfig`); plugins/design-control/skills/translate-design-language/SKILL.md:77-78 (the documented invocation)

SKILL.md step 4 — "the non-negotiable step" — tells the operator to run `plugins/design-control/bin/check-design-spec <path/to/design-language.md>`, i.e. from the repository root. Verified empirically: that exact invocation crashes with `ERR_MODULE_NOT_FOUND: Cannot find package '@/design-language' imported from .../check-design-spec-cli.ts` and exits 1. The shim walks parent directories to find a `tsx` binary (it finds the workspace root's) but `tsx` resolves `tsconfig.json` — and therefore the `@/*` path mappings every module in this plugin uses — from the **current working directory**, and the repo root has no `tsconfig.json` (verified: `ls` fails). The same command run with cwd inside `plugins/design-control/` works. The tasks.md claim "shim smoke-verified both directions" was evidently verified with a plugin-local cwd, which is not the invocation the skill documents.

Blast radius: high — this is the enforcement seam every draft MUST pass through, the skill hands an unattended agent a verbatim command whose natural execution context (repo root, where the path `plugins/design-control/bin/...` makes sense) crashes, and the failure exits 1 — the same code the contract assigns to "findings present" — so a workflow that branches on exit code reads a loader crash as spec findings. The failure is loud (stack trace on stderr), which keeps it below blocking, but nothing in the artifact corrects the wrong cwd; an agent's likeliest recovery is confusion or a re-run from a different directory by accident. Fix: pass the plugin's own tsconfig explicitly — `exec "$TSX" --tsconfig "$PLUGIN_ROOT/tsconfig.json" "$PLUGIN_ROOT/src/design-language/check-design-spec-cli.ts" "$@"` — and add a smoke that runs the shim from the repository root (the documented direction), not only from the plugin directory.

### AUDIT-20260611-31 — The parser is markdown-context-blind: a fenced example rule parses as a REAL rule and the spec reports green with an inflated rule count

Finding-ID: AUDIT-20260611-31
Status:     fixed-cb9542f49e4343d64b9282503af34e51898e41e7
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:45 (HEADING_RE applied line-by-line with no code-fence/indented-block state), :197-265 (parse loop), :289-296 (line-attempt guard, same blindness)

`parseDesignSpec` walks raw lines with no awareness of fenced (``` ```` ```) or indented code blocks, so markdown that *renders as an inert code example* is parsed as live spec structure. Verified empirically through the CLI: a spec with one real rule plus a fenced ```markdown example containing `### rule: phantom` (the SKILL.md-style authoring example, css link pointing at a live selector) reports **`spec green — 0 findings (2 rule(s))`** — the documentation example becomes a real parsed rule, silently. The same blindness drives the loud direction: an *indented* code line `rule: sample` inside an authoring example produces a false `malformed-rule-heading` (verified, exit 1). Note the trap is self-modeling: SKILL.md's own convention section teaches the format via exactly such a fenced example; an author who pastes that preamble into their spec for future maintainers gets either a phantom rule (if the example's selector happens to be live, as SKILL.md's `.btn-primary` would be in this very project) or spurious dead-link findings on documentation text.

Blast radius: medium — the phantom-rule direction is a silent wrong outcome on a green verdict (downstream consumers of `spec.rules` receive a documentation artifact as design language, and the operator-shown rule count is inflated), but it requires the author to embed example blocks in the spec, which is plausible-not-default; the false-finding direction is loud. Fix: track fence state in the line loop (toggle on ```` ``` ````/`~~~` lines, skip lines while inside; optionally skip 4-space-indented lines following a blank line), which collapses both directions at once.

### AUDIT-20260611-32 — The line-level declaration guard fires on ordinary lowercase prose — any sentence starting "rule: …" is now structurally forbidden

Finding-ID: AUDIT-20260611-32
Status:     fixed-cb9542f49e4343d64b9282503af34e51898e41e7
Severity:   low
Surface:    plugins/design-control/src/design-language/rule-attempt.ts:40 (`LINE_ATTEMPT_RE = /^rule\s*:\s*\S/` — no id-shape constraint), :78-88; plugins/design-control/src/design-language/schema.ts:289-296

The heading-level near-miss trigger was carefully calibrated (colon required, or exact-lowercase `rule` + exactly one id-shaped token, per the `rule-attempt.ts` header), but the line-level trigger accepts *any* text after the colon. Verified empirically: a spec whose prose includes the line `rule: never introduce raw hex blues outside the tokens.` exits 1 with `malformed-rule-heading: Line "rule: never introduce raw hex blues outside the tokens." looks like a rule declaration but is not a heading — declare it as an ATX heading: "### rule: never introduce raw hex blues outside the tokens."` — advising the author to convert a prose sentence into a rule heading with a nine-word id. In a document whose whole subject is design *rules*, line-initial lowercase "rule: …" prose is a realistic authoring shape, and the existing test corpus only pins the mid-line case as inert.

Blast radius: low — a loud false refusal with a clear (if absurd) message, costing a reword round-trip, never a silent wrong outcome. Fix: apply the same id-shape constraint the heading guard uses (`/^rule\s*:\s*[\w-]+\s*$/` — a single id-shaped token and nothing after), so multi-word prose after the colon stays inert while `rule: beta` setext/paragraph declarations still flag; pin both directions in the corpus.

### AUDIT-20260611-33 — Combinator spacing still fabricates dead-links — `.a > .b` cannot match a source written `.a>.b` (and vice versa)

Finding-ID: AUDIT-20260611-33 (claude-04 + codex-01; cross-model)
Status:     fixed-fd1f6bfa5040b4fb0fcb2b55bfdaaee0deeacbc2
Severity:   low
Surface:    plugins/design-control/src/design-language/selector-canon.ts:185-192 (normalizeSelectorWhitespace handles parens + commas only); plugins/design-control/src/design-language/link-liveness.ts:172-194 (cssDefinesSelector)

`normalizeSelectorWhitespace` collapses runs, paren-adjacent spaces, and comma spacing — but not spacing around the child/adjacent/sibling combinators `>`, `+`, `~`. Verified empirically through the CLI in both directions: query `.a > .b` against source `.a>.b` → `dead-link-selector`, and query `.c+.d` against source `.c + .d` → `dead-link-selector`, both on selectors that are live in the file. This is the same shape as the AUDIT-17/AUDIT-round2 quote-style fixes (delimiter-insensitive equality the author reasonably expects), one token class over: Prettier and most formatters write spaced combinators, so a formatting commit on the CSS flips previously-green spaced-vs-tight links to dead, and the test corpus's "regardless of whitespace" coverage pins descendant selectors only.

Blast radius: low — a loud exit-1 false refusal with an actionable message, and the common authoring path (copying the selector verbatim from the CSS) avoids it until a reformat lands; no silent wrong outcome. Fix: extend `normalizeSelectorWhitespace` with `.replace(/\s*([>+~])\s*/g, '$1')` — safe against the `~=` attribute operator (post-canonicalization it carries no surrounding spaces) and it additionally unifies `:nth-child(2n + 1)`/`(2n+1)`, shrinking a documented approximation — pinned by a RED test per combinator.

---

**Summary for triage:** 4 findings, 0 blocking, 1 high. The high (claude-01) is an environment-coupling defect in the gate's own entry point — the exact command SKILL.md documents crashes from the repo root because the shim locates the workspace tsx but never pins the plugin's tsconfig; the "smoke-verified" claim in tasks.md was true only for a plugin-local cwd. Claude-02 and claude-03 share a root: the parser and the just-landed declaration guards operate on raw lines with no markdown-context (fence/indent) or prose-shape awareness, producing one silent-green direction (phantom rule from a fenced example, the worst direction in the module) and two loud false-refusal directions. Claude-04 is the combinator residual of the AUDIT-17/round-2 delimiter-normalization series. All four were confirmed by executing the shipped `bin/check-design-spec` against temp fixtures (since removed), not by reading alone, so RED-first regression tests are cheap for each.

### AUDIT-20260611-34 — Drive-relative Windows CSS paths slip past the portability guard

Finding-ID: AUDIT-20260611-34
Status:     fixed-fd1f6bfa5040b4fb0fcb2b55bfdaaee0deeacbc2
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:69-73; plugins/design-control/src/design-language/schema.ts:122-150; plugins/design-control/src/design-language/types.ts:25-32

The type contract says machine-rooted drive-letter paths never enter `CssLink`, but `NON_PORTABLE_CSS_PATH_RE` only rejects drive-letter paths when the colon is followed by `/` or `\`. A path like `C:styles.css` is not caught, so `recordField` accepts it into `cssLinks`. On Windows that spelling is drive-relative and machine-contextual; on POSIX it can even resolve as a literal filename under the spec directory, producing a green result for a spec link that does not travel cleanly across platforms.

Blast radius is low because this is an uncommon spelling and the main absolute-path cases are covered. It is still a portability leak in the same boundary the schema claims to enforce. A reasonable correction is to reject any leading single-letter drive prefix (`^[A-Za-z]:`) and add a regression case for `css: C:styles.css .btn`.

## 2026-06-11 — audit-barrage lift (20260611T141406686Z-design-control-after_clarify)

### AUDIT-20260611-35 — Liveness ignores the leading simple-selector discriminator — a dot-omission typo (`btn-primary` for `.btn-primary`) is guaranteed green, and type-selector queries match class/id/attribute-name occurrences

Finding-ID: AUDIT-20260611-35
Status:     fixed-a5a8345f039d438941d84c971d078016fe4d38b7
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:139-159 (`cssDefinesSelector` boundary check at :154); plugins/design-control/src/design-language/selector-canon.ts:27-29 (`isIdentChar`)

The match acceptance at `link-liveness.ts:154` checks only that the characters flanking the substring hit are not ident characters — it never checks that the *kind* of simple selector matches. `.`, `#`, and `[` are all non-ident, so a query that begins with a bare ident (a type selector — or, far more likely, a class selector whose author dropped the leading dot) is satisfied by a class, an id, or a bare attribute *name* in source. Verified empirically against the shipped module: query `btn-primary` vs source `.btn-primary { }` → `true`; query `header` vs `.header { }` → `true`; query `header` vs `#header { }` → `true`; query `ghost` vs `[ghost] { }` → `true` (the AUDIT-round2 value-blanking in `blankAttributeValues` covers attribute *values* only — the attribute *name* position is unguarded, since `[ghost]` carries no value to blank). The schema side compounds this: `recordField` (schema.ts:168-198) applies no shape validation to the selector remainder of `css: <path> <selector>`, so `css: studio.css btn-primary` parses cleanly and sails through liveness green.

Blast radius: medium — this is the silent-green direction, the worst direction in this module by its own stated philosophy, and the dot-omission trigger is *self-pairing*: dropping the `.` from any real class name guarantees the bare ident exists in a prelude, so every such typo is green by construction, with no finding, no note, and no count discrepancy. The shipped artifact then tells an unattended downstream consumer that `btn-primary` is a live selector when it selects nothing in any browser. It stops short of high because the defective selector text remains human-visible in the spec and the surrounding link (path, neighboring rules) is still mostly right. Fix: when the canonical query begins with an ident character, reject a match whose preceding haystack character is `.` or `#`; and in the no-`[`-in-query mode, blank attribute *names* as well as values (`[ghost]` → `[]`), mirroring the existing `blankAttributeValues` pass. RED tests: the four probes above, plus the sanity directions (`.btn` vs `.btn` stays green; `ghost` vs `.real[data-ghost]` stays dead — both verified correct today).

### AUDIT-20260611-36 — CSS-nesting sources fail composed-selector queries — preludes are matched flat, and the nesting approximation is undocumented

Finding-ID: AUDIT-20260611-36
Status:     fixed-2ba353ac7958ce89ee71873a9edc34c6ac684666
Disposition-note: documentation disposition per the finding's own minimal-fix option — the
flat-prelude approximation is now stated in the liveness contract, the selector-canon
approximations list, and the skill's css: bullet, and pinned by corpus tests (composed dead /
leaf live). The fuller composed-prelude matcher is backlog TASK-20 (operator selects).
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:69-109 (`collectSelectorPreludes`); module doc :18-33; plugins/design-control/skills/translate-design-language/SKILL.md:44-48

`collectSelectorPreludes` collects each prelude as flat text at its own nesting depth and never composes it with its ancestors, so native CSS nesting — now ordinary authoring (browser-native, Sass default, Prettier-formatted) — only matches leaf-shaped queries. Verified empirically: query `.btn .icon` vs source `.btn { .icon { } }` → dead, and query `.btn:hover` vs source `.btn { &:hover { } }` → dead, while both selectors are live in the file; devtools and stylelint render exactly the composed forms an author would copy into the spec. The module's doc comment carefully states the at-rule descent rule and the accepted approximations list in `selector-canon.ts:14-23`, but neither mentions nesting — the contract reads as if any selector "defined in the file" matches.

Blast radius: low — the failure direction is a loud exit-1 false refusal with an actionable message, and the author can converge by anchoring the rule to the leaf selector (`.icon`), which does match (verified: leaf queries pass even against `&`-joined preludes). The cost is a confusing reword round-trip plus a contract that quietly under-delivers on nested codebases. Minimal fix: add nesting to the stated approximations in both the module doc and SKILL.md ("link the leaf selector for nested rules"); fuller fix: maintain a prelude ancestor stack in `collectSelectorPreludes` and emit composed preludes with `&` substitution, pinned by the two probes above as RED tests.

### AUDIT-20260611-37 — `+`-marker field bullets are silently inert — the resulting missing-* findings misattribute the cause, the exact no-invisible-cause failure the module's own doc names

Finding-ID: AUDIT-20260611-37
Status:     fixed-2ba353ac7958ce89ee71873a9edc34c6ac684666
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:61 (`FIELD_BULLET_RE = /^[-*]\s+…/`), :91 (`BULLET_SHAPE_RE = /^[-*]\s/`)

CommonMark defines three bullet list markers — `-`, `*`, and `+` — but both bullet regexes admit only `-` and `*`. A rule authored with `+` bullets parses with every field dropped as inert prose: verified empirically, a complete rule (`+ kind:`, `+ css:`, `+ example:`, `+ do:`) returns `findings: [missing-kind, missing-css-link, missing-example, missing-guidance]` and zero rules. The verdict is loud, but every finding names a *false cause* — the author is told the rule "has no kind: field" while staring at one. This is precisely the failure shape the module's own header rules out for field keys (schema.ts:29-31: silently dropping a misspelled `example:` "would otherwise fabricate a missing-example rejection with no visible cause") and that the AUDIT-15/-31/-32 series killed for headings and declarations — one syntax level over, at the list-marker. The `+`-bullet lines also bypass the `unknown-field` typo guard and, on ≥4-space-indented lines, the `BULLET_SHAPE_RE` carve-out (schema.ts:302), so an indented `+ css:` bullet is treated as indented code.

Blast radius: low — always loud, never a silent wrong outcome; the cost is a baffling diagnostic and a guaranteed round-trip for authors (or formatters) that prefer `+` markers. Fix is one character in each class (`[-*+]`), plus corpus pins for a `+`-bulleted rule parsing identically to a `-`-bulleted one.

### AUDIT-20260611-38 — Keyframe step selectors (`from` / `to` / `0%`) are collected as matchable preludes

Finding-ID: AUDIT-20260611-38
Status:     fixed-a5a8345f039d438941d84c971d078016fe4d38b7
Severity:   informational
Surface:    plugins/design-control/src/design-language/link-liveness.ts:69-109 (`collectSelectorPreludes` descends into all at-rule blocks uniformly)

The at-rule descent that correctly makes `@media`-housed rules count also descends into `@keyframes`, whose inner blocks are step selectors, not element rules — so `from`/`to`/percentage preludes enter the matchable set. Verified empirically: query `from` vs `@keyframes spin { from { } to { } }` → `true`. Note this instance would survive the AUDIT-BARRAGE-claude-01 discriminator fix (the `from` prelude genuinely begins with a bare ident), so it's worth one exclusion line (`@keyframes` blocks contribute no preludes) whenever that fix lands.

Blast radius: effectively nil as-written — no plausible design-language rule anchors to `from`, `to`, or `0%` as a selector, so this is context for the prelude-collection contract rather than a defect a consumer would hit. Recorded so the scope of "selector prelude" is stated rather than discovered.

---

**Summary for triage:** 4 findings, 0 blocking, 0 high, 1 medium. The medium (claude-01) is the round's one silent-green: the boundary check validates *that* an ident sits at a selector boundary but never *which discriminator* introduces it, so every dropped-dot typo self-certifies green — the same unanchored-text root the AUDIT-17/-18/round-2 canonicalization series has been chipping at, one axis (selector-kind) over. Claude-02 and claude-03 are loud false-refusal hygiene with misleading or missing contract statements; claude-04 is scope context that should ride along with the claude-01 fix. All four were confirmed by executing the shipped module against fixtures, not by reading alone, so RED-first regression tests are cheap for each. Everything else I checked came back clean: the round-3 fixes hold as committed (fence inertness, line-attempt id-shape calibration, combinator normalization including `||` and the `~=` guard, drive-relative path rejection, tsconfig-pinned shims across all three bins), the tasks.md check-offs match the shipped behavior, and the committed audit-run artifacts follow the prior `da2ed12c` disposition.

### AUDIT-20260611-39 — Closing ATX hashes become part of the rule id

Finding-ID: AUDIT-20260611-39
Status:     fixed-2ba353ac7958ce89ee71873a9edc34c6ac684666
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:53-54, plugins/design-control/src/design-language/schema.ts:310-325

`HEADING_RE` captures the raw text after the opening hashes, and `parseDesignSpec` immediately feeds `heading[1].trim()` into `RULE_HEADING_RE`. That means a valid Markdown ATX heading with a closing sequence, such as `### rule: ink-primary ###`, parses as rule id `ink-primary ###` instead of `ink-primary`. The tests only cover headings without closing hashes, so this common Markdown spelling is not pinned.

Blast radius is medium: the spec can go green while downstream consumers of `spec.rules` receive the wrong stable rule id, and the duplicate-id guard can be bypassed by mixing `### rule: ink` with `### rule: ink ###`. A reasonable correction is to normalize ATX heading text before rule parsing by stripping a valid closing hash sequence per Markdown rules, then add regression coverage for both id extraction and duplicate detection.

## 2026-06-12 — audit-barrage lift (20260612T053833253Z-design-control-after_clarify)

### AUDIT-20260612-01 — AUDIT-BARRAGE-claude-01 — Escape-extended idents are treated as ident boundaries, so a query goes false-green against an escaped selector that merely starts with it

Finding-ID: AUDIT-20260612-01
Status:     migrated-to-backlog TASK-21
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:196-221, plugins/design-control/src/design-language/selector-canon.ts:32-34

The boundary check in `cssDefinesSelector` accepts a hit when the characters adjacent to the match are not in `[A-Za-z0-9_-]` (`isIdentChar`, selector-canon.ts:32-34). But in CSS a backslash escape *extends* the ident: `.foo\:bar {}` defines the single class `foo:bar` (the Tailwind-variant spelling), not `.foo`. Verified by executing the shipped module: `cssDefinesSelector('.foo\\:bar { color: red }', '.foo')` → `true`, and `cssDefinesSelector('.btn\\@2x { }', '.btn')` → `true`, while the unescaped control `.foox` correctly rejects. So a rule anchored to `.foo` goes green against a file in which `.foo` has no styling at all — a silent false green, the exact failure direction this gate exists to prevent, and one that would survive every fix in the AUDIT-17/-18/round-4 canonicalization series (the `\` genuinely is a non-ident character to the current test). The approximations list in selector-canon.ts:14-28 states the quoted-value escape case ("kept verbatim, not decoded") but says nothing about escapes in selector idents, so the gap is unstated as well as real.

Blast radius: medium. Escaped idents are rare in hand-written CSS but routine in compiled utility-framework output — which, per my -04 below, *is* inside the validated scope whenever its path ends `.css`. An author linking `.btn` against a file that only defines escaped variants gets a green verdict and the spec quietly rots into fiction. Reasonable fix: treat `\` as ident-extending on both sides of the boundary test (reject when `before === '\\'` is mid-escape or when the character after the match is `\\`), or decode/normalize ident escapes during canonicalization; either way pin with RED tests for `.foo` vs `.foo\:bar` and `.btn` vs `.btn\@2x`.

### AUDIT-20260612-02 — AUDIT-BARRAGE-claude-02 — Namespaced attribute selectors bypass the entire canonicalize/blank pipeline, reopening the name-leak and value-leak classes for `[ns|attr]` spellings

Finding-ID: AUDIT-20260612-02
Status:     migrated-to-backlog TASK-22
Severity:   low
Surface:    plugins/design-control/src/design-language/selector-canon.ts:88-89 (`ATTRIBUTE_SELECTOR` name class lacks `|`), :126-140 (`blankAttributeValues` / `blankAttributeNames` key on the non-namespaced shape)

`ATTRIBUTE_SELECTOR` admits only `[A-Za-z0-9_-]+` as the attribute name, so `[xlink|href]` and `[svg|href="x"]` never canonicalize — and the two blanking helpers, which also key on that name shape, leave them live in the haystack. Verified by execution: `cssDefinesSelector('[xlink|href] { }', 'href')` → `true` (attribute *name* satisfies a type-selector query — the exact class AUDIT-round4-claude-01 just closed for `[ghost]`, whose control correctly returns `false`), and `cssDefinesSelector('[svg|href="x"] { }', 'x')` → `true` (attribute *value* satisfies a bare query — the AUDIT-20260611-18-adjacent class closed for non-namespaced values, control `[data-icon=".ghost"]` correctly `false`). The approximations note (selector-canon.ts:22-23) says namespaced attribute selectors are "left un-canonicalized (compared verbatim)", which reads as quote-style-only laxity; it does not state that they remain *matchable text* for queries that never named an attribute.

Blast radius: low. Namespaced attribute selectors essentially only appear in SVG-adjacent CSS, and the colliding query must be a bare ident echoing the attribute name or value — a narrow intersection. But the failure direction is a silent false green, and the fix is mechanical: admit `(?:[A-Za-z0-9_-]+|\*)?\|` as an optional name prefix in `ATTRIBUTE_SELECTOR` and in both blanking regexes, with RED pins for the two probes above. At minimum, the approximations list should state that namespaced forms currently evade the exclusion-is-not-styling guarantees.

### AUDIT-20260612-03 — AUDIT-BARRAGE-claude-03 — A bare `###` (valid CommonMark empty ATX heading) does not terminate a rule section — following bullets silently merge into the preceding rule with zero findings

Finding-ID: AUDIT-20260612-03
Status:     migrated-to-backlog TASK-23
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:56 (`HEADING_RE = /^#{1,6}\s+(.*)$/`), :333-379 (heading branch is the only place `current` resets)

`HEADING_RE` requires whitespace plus text after the hashes, but CommonMark explicitly permits an empty ATX heading (`###` with nothing after it). A bare `###` therefore matches no branch — not a heading, not a bullet, not an attempt — and falls through as inert prose *without resetting `current`*. Verified by execution: in a spec reading `### rule: alpha` … `###` … `- css: stray.css .stray`, the stray link lands in **alpha's** `cssLinks` (`[{a.css .alpha}, {stray.css .stray}]`) with `findings: []` — the "merge its bullets into the preceding rule's section" outcome the module's own header (schema.ts:36-42) names as the failure this parser must never produce, here completely silent. The behavior is also internally inconsistent: `### ###` (hashes-only *text*, stripped to empty by `stripAtxClosingSequence`) DOES reset the section (verified: alpha keeps only its own link), so two spellings CommonMark renders identically diverge in section semantics.

Blast radius: low. A bare `###` as a visual separator is an uncommon authoring shape, and the wrong outcome needs content after it inside the same gap. But the direction is the bad one — wrong attribution with zero findings, and liveness then validates the stray link under the wrong rule, potentially flipping a should-fail rule green. Fix: let an empty ATX heading (`/^#{1,6}$/` after trimming, plus the `### ###` form already handled) reset `current` like any heading; pin both spellings with a regression test asserting the stray bullet does not attach to the preceding rule.

### AUDIT-20260612-04 — AUDIT-BARRAGE-claude-04 — Doc drift: "utility-framework / CSS-Modules links are recorded as skipped" vs the extension-only skip predicate actually shipped

Finding-ID: AUDIT-20260612-04
Status:     migrated-to-backlog TASK-24
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:9-13 vs :259; plugins/design-control/skills/translate-design-language/SKILL.md:46-50; plugins/design-control/src/design-language/check-spec-file.ts:84

The module doc states "Utility-framework, CSS-in-JS, and hashed CSS-Modules links do not establish link-liveness — they are recorded as `skipped`", and SKILL.md repeats it ("Non-CSS targets (CSS-in-JS, utility frameworks, CSS-Modules) are reported as unchecked notes"). The only skip predicate in the code is `!link.path.toLowerCase().endsWith('.css')` (link-liveness.ts:259, reason `'non-css-target'`). But utility-framework output and compiled CSS-Modules are routinely `.css` files — a link to `dist/tailwind.css .p-4` is fully *validated*, not skipped, contradicting both docs. The conflation matters because the docs frame skipped links as "visible scope, not silent coverage" (SKILL.md:94): an operator told their utility-framework link was skipped-but-visible instead receives a real verdict from a matcher whose ident-boundary approximations are weakest exactly there (see my -01: escaped variant classes false-green).

Blast radius: low. The behavior itself is defensible — checking a real `.css` file is at worst over-eager — and a careful reader of the CLI note ("non-CSS target") can reconstruct the actual mechanism. The cost is a contract statement that doesn't match the predicate, on the surface (scope statements) this feature has repeatedly treated as load-bearing (AUDIT-20260611-38's rationale: "the scope … is stated rather than discovered"). Fix is wording: both docs should say the validated scope is "any link whose path ends `.css`" and that utility-framework/CSS-Modules *compiled* `.css` outputs are therefore checked as ordinary CSS (with the escape caveat), while only non-`.css` paths are skipped.

### AUDIT-20260612-05 — AUDIT-BARRAGE-claude-05 — `dead-link-file` / `dead-link-selector` findings carry no source line although the bullet's line is known at parse time

Finding-ID: AUDIT-20260612-05
Status:     migrated-to-backlog TASK-25
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:216-219, plugins/design-control/src/design-language/types.ts:34-37, plugins/design-control/src/design-language/link-liveness.ts:268-281

`recordField` receives the 1-based line of every `css:` bullet and uses it for `empty-field` and `malformed-css-link` findings, but the `CssLink` it pushes (schema.ts:216-219) drops the line, so by the time liveness emits `dead-link-file` / `dead-link-selector` (link-liveness.ts:268-281) the optional `line` field of `DesignSpecFinding` — documented "1-based markdown source line, when known" — is silently absent for the entire axis-B taxonomy. The information is knowable; it's discarded at the seam. For a rule with several `css:` links to the same dead-ish file, the finding names only `ruleId` + path + selector and the author has to grep the spec to find which bullet to edit.

Blast radius: low — purely a diagnostic-quality gap; the finding is loud and attributable, just less precise than the schema axis right next to it. Fix: add an optional `line` to `CssLink` (or carry it on `RuleScopedCssLink`), populate it in `recordField`, and thread it into both dead-link finding constructors; one assertion in the liveness suite pins it.

### AUDIT-20260612-06 — AUDIT-BARRAGE-claude-06 — schema.test.ts is 805 lines, past the project's stated 300–500 line cap

Finding-ID: AUDIT-20260612-06
Status:     migrated-to-backlog TASK-26
Severity:   low
Surface:    plugins/design-control/src/__tests__/design-language/schema.test.ts (805 lines)

The project's own conventions (root and plugin CLAUDE.md: "files < 300–500 lines") cap code files at 500 lines; `schema.test.ts` ships at 805, having absorbed four rounds of barrage regression pins (heading guards, fences, bullets, closing hashes) on top of the base suite. None of the other new files breach the cap (schema.ts 433, link-liveness.test.ts 486 is at the line). Verified by `wc -l`.

Blast radius: low — no behavioral consequence; the cost is the compounding-over-time kind the cap exists for, and this file is precisely the one every future barrage round appends to, so it only grows. A natural split mirrors the parse phases the file already groups: heading/declaration-attempt pins in one file, field/bullet/fence inertness pins in another, keeping `describe` blocks intact.

---

**Summary for triage:** 6 findings, 0 blocking, 0 high, 1 medium. The medium (claude-01) is this round's silent-green: the ident-boundary test doesn't know CSS escapes extend idents, so `.foo` self-certifies against `.foo\:bar {}` — confirmed by executing the shipped module, and orthogonal to every fix in the round-4 series. Claude-02 (namespaced attribute selectors evade both blanking passes) reopens the just-closed name/value-leak classes in a rarer spelling; claude-03 is a confirmed silent merge through a valid CommonMark empty heading, inconsistent with the handled `### ###` form; claude-04/-05/-06 are contract-wording, diagnostic-precision, and file-cap hygiene. Checked and clean: the round-4 fixes all hold as committed (closing-hash stripping including the glued-hash and hashes-only cases, `+`-bullet parity, keyframes prelude exclusion, leading-discriminator rejection of `.header`/`#header` for type queries), the throwaway-section single-pass design has no finding-wave regressions I could construct, fence open/close handles CRLF and indented closers, the bin shim's tsconfig pin matches its two siblings, and the machine-rooted-path rejection is consistent across schema, liveness throw, SKILL.md, and types. All three behavioral findings were confirmed by running the shipped modules against probe fixtures (probe file removed afterward), so RED-first regression tests are cheap for each.

### AUDIT-20260612-07 — Trailing whitespace after a css path can create an empty selector link

Finding-ID: AUDIT-20260612-07
Status:     migrated-to-backlog TASK-27
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:192-219; plugins/design-control/src/design-language/link-liveness.ts:259-261

`recordField` only treats a `css:` value as missing its selector when `value.search(/\s/)` returns `-1`. If the author writes `- css: styles.ts   ` or `- css: studio.css   `, the first whitespace exists, so the parser records `{ path: "styles.ts", selector: "" }` at lines 216-219 instead of emitting `malformed-css-link`. That also makes `validateSection` consider the rule to have a css link because `section.cssLinks.length > 0`.

The blast radius is medium because this can become a silent green in the non-CSS path: `checkCssLinkLiveness` skips non-`.css` targets before validating selector content at lines 259-261, and skipped links do not fail the file check. A rule with `kind`, `example`, `do`, and only `css: styles.ts   ` can therefore pass schema and liveness with an empty selector, despite the documented `css: <path> <selector>` contract. The reasonable fix is to compute `const selector = value.slice(spaceAt).trim()` and reject it as `malformed-css-link` when empty, with tests for both `.css` and skipped non-CSS targets carrying trailing whitespace but no selector.

## 2026-06-14 — audit-barrage lift (20260614T020201830Z-design-control-phase-2C)

### AUDIT-20260614-01 — `translate-design-language` means two different things in the skill and the engine-adapter contract

Finding-ID: AUDIT-20260614-01
Status:     fixed-3ba37e77
Disposition: fixed — engine-adapter/types.ts now documents `translate-design-language` as "drafts the design-language spec artifact from approved wireframe intent + operator-named live CSS," single-sourcing the contract with SKILL.md.
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    plugins/design-control/skills/translate-design-language/SKILL.md:75-83; missing companion update to plugins/design-control/src/engine-adapter/types.ts:18-23

The new skill defines the optional engine path as “request a draft from the engine” using “the approved wireframe intent + the live CSS files the operator names” so the engine drafts the **design-language spec itself** ([SKILL.md:75-83]). But the public engine-adapter contract still documents `translate-design-language` as the method where “engine translates a design-language spec into concrete styling/markup decisions” ([types.ts:18-23]). Those are different phases with different inputs and outputs: one creates the spec artifact, the other consumes an existing spec to drive implementation.

This is not just prose drift inside one file. The feature spec and the new skill align on “optional accelerator that drafts the spec from wireframe intent,” so the diff effectively changes the meaning of the method without updating the adapter surface that other code and agents are supposed to rely on. A downstream consumer following the adapter docs can build the wrong request shape or invoke the method at the wrong point in the workflow, and nothing in the audited diff resolves that contradiction. Blast radius is high because both readings are plausible and load-bearing; an unattended agent could reasonably pick either contract and perform the wrong stage of work. The fix is to make the contract single-sourced again: either update `engine-adapter/types.ts` (and any related conformance docs/tests) so `translate-design-language` explicitly means “draft the spec from approved wireframe intent,” or rename/split the method so spec-authoring and implementation-translation are no longer competing interpretations of the same API.

### AUDIT-20260614-02 — Green specs can still contain rules with no live CSS anchor

Finding-ID: AUDIT-20260614-02
Status:     fixed-3ba37e77
Disposition: fixed — SKILL.md presentation now distinguishes "fully link-live" (exit 0, no unchecked notes) from "structurally green with unchecked scope," and forbids calling the latter fully link-live.
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/skills/translate-design-language/SKILL.md:42-48, plugins/design-control/skills/translate-design-language/SKILL.md:92-100

The skill says every rule binds to a live CSS file and selector, and describes `css:` as “≥1 per rule” with non-CSS targets reported as unchecked notes that “do not establish link-liveness” at lines 42-48. But the validation step then treats exit `0` as “spec green, zero findings” and allows presentation while merely reading those skipped-link notes aloud at lines 92-94; line 100 also tells the agent to present the green spec as `0 findings`. In the current checker contract, skipped non-CSS links stay green, so a rule whose only `css:` entry points at CSS-in-JS, Tailwind, or a CSS Module can pass the skill’s gate while having no mechanically validated live CSS anchor.

The blast radius is high because an unattended consumer will naturally equate “spec green — 0 findings” with the invariant promised earlier: every rule is bound to live CSS. That can produce accepted design-language specs whose rules are structurally present but not link-live, undermining the feature’s stated goal of preventing visual-spec drift. A reasonable fix would make the skill’s presentation rule distinguish “green with skipped links” from fully link-live, or require at least one validated `.css` link per rule before the draft may be presented as a green design-language spec.

## 2026-06-14 — audit-barrage lift (20260614T021015085Z-design-control-phase-2C)

### AUDIT-20260614-03 — `design-control status` still treats unchecked non-CSS links as fully green completion

Finding-ID: AUDIT-20260614-03
Status:     fixed-29dbf462
Disposition: fixed — getSurfaceStatus now emits `unchecked-link-spec` for every skipped non-CSS link, blocking completion (status.test.ts "flags an unchecked-link spec as incomplete").
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    Missing companion update to `plugins/design-control/src/status/status.ts:160-170` and `plugins/design-control/src/__tests__/status/status.test.ts:53-90`

This diff explicitly changes the checker/skill contract to distinguish two green states: `plugins/design-control/src/design-language/check-spec-file.ts:64-93` now says skipped non-CSS links are only "unchecked scope" and the new skill text at `plugins/design-control/skills/translate-design-language/SKILL.md:94-108` forbids describing that result as "fully link-live." But `design-control status` was not updated alongside that contract change: it still looks only for `dead-link-file` / `dead-link-selector` findings at `plugins/design-control/src/status/status.ts:160-170`, ignores `specResult.skipped` entirely, and therefore will still report the surface complete for a spec whose only anchors are unchecked CSS-in-JS / utility / CSS-Modules links.

The blast radius is high because `status` is the surface that answers whether a surface is complete. After this diff, an unattended consumer can be told both "status complete" and, elsewhere, "not fully link-live" for the same artifact. That is not just wording drift; it reintroduces the exact bad state this patch is trying to name: a spec accepted as complete without any mechanically validated live CSS anchor. A reasonable fix is to decide one contract and encode it everywhere: either `status` must fail completion when `checkDesignSpecFile(...).skipped.length > 0`, or the spec/workplan must explicitly state that unchecked scope is still completion-green and then stop calling the fully validated state "complete" in operator-facing surfaces.

## 2026-06-14 — audit-barrage lift (20260614T021332137Z-design-control-phase-2C)

### AUDIT-20260614-04 — `design-control status` has no implementable descope path for infeasible stale-surface mapping

Finding-ID: AUDIT-20260614-04
Status:     fixed-08672d73
Disposition: fixed — staleSurfaceSchema now accepts `{mode:'operator-approved-descope', rationale}`, a manifest-readable descope path; spec.md/tasks.md updated in 8fb7b609 (status.test.ts "accepts an explicit operator-approved stale-surface descope").
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/status/status.ts:43-47, plugins/design-control/src/status/status.ts:225-231, plugins/design-control/src/__tests__/status/status.test.ts:280-307

The new status surface hard-fails whenever `staleSurface` is absent: the schema makes it merely optional at lines 43-47, but `getSurfaceStatus()` unconditionally emits `stale-surface-unmapped` at lines 225-231, and the new test at lines 280-307 locks that behavior in. The problem is that the feature spec for this phase explicitly allows two valid outcomes for stale-surface detection: either ship graph-derived mapping, or record an operator-approved descope when that mapping is infeasible. This implementation mentions that descope in `nextAction` text, but there is no manifest field, no workplan hook, and no other input that can actually represent the approved descope.

Blast radius is high because this is a hard false-negative on the exact branch the spec says must remain valid: any adopter who takes the approved-descope path can never reach `complete`, even with every other artifact green. A reasonable fix is to encode the descope as data that `design-control status` can read and validate, or to stop advertising descope as a supported completion path until that representation exists.

### AUDIT-20260614-05 — The status manifest schema does not enforce the required viewport contract

Finding-ID: AUDIT-20260614-05
Status:     fixed-08672d73
Disposition: fixed — surfaceStatusManifestSchema.superRefine now requires a desktop (>=1280) and a phone (<=390) viewport (status.test.ts "returns 1 for a manifest missing the required phone viewport").
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    plugins/design-control/src/status/status.ts:15-18, plugins/design-control/src/status/status.ts:25-48, plugins/design-control/src/__tests__/status/status.test.ts:75-85

The manifest schema only requires `viewports` to be a non-empty array of positive widths. It does not enforce the scaffold contract the spec names for this manifest shape: desktop `>= 1280` and phone `<= 390`. The tests reinforce the under-validation by treating a manifest with a single desktop viewport as the happy-path complete case at lines 75-85. As written, a manifest with one arbitrary viewport, or with no phone coverage at all, still parses cleanly and can be reported complete.

Blast radius is high because downstream consumers are told this manifest is structurally valid when it omits one of the load-bearing axes the rest of the discipline depends on. An unattended agent can legitimately conclude the surface is complete without ever carrying the phone viewport the spec requires. The fix is to tighten `surfaceStatusManifestSchema` to require the named viewport set and threshold bounds, then add negative tests for single-viewport and wrong-width manifests.

### AUDIT-20260614-06 — Status ignores non-link spec findings

Finding-ID: AUDIT-20260614-06
Status:     fixed-08672d73
Disposition: fixed — every non-dead-link spec finding now surfaces as `invalid-design-spec` and blocks completion (status.test.ts "flags non-link design-spec findings as incomplete").
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/status/status.ts:163-181

`getSurfaceStatus` calls `checkDesignSpecFile`, but only converts `dead-link-file`, `dead-link-selector`, and skipped non-CSS links into status findings. Any schema-level failure from the same checker, such as `missing-example`, `duplicate-rule-id`, malformed rule headings, malformed paths, or invalid `kind`, is silently ignored by the completion gate.

Blast radius is high because `design-control-status` can report `complete: true` for a design-language spec that `check-design-spec` itself rejects. The reasonable fix is to treat every `specResult.findings` entry as status-blocking, with special wording for dead links only if needed.

### AUDIT-20260614-07 — Driving provenance is loaded but not verified

Finding-ID: AUDIT-20260614-07
Status:     fixed-08672d73
Disposition: fixed — the driving branch now calls verifyDrivingWireframe and converts its failure into a blocking finding (status.test.ts "flags driving provenance that no longer matches the wireframe artifact").
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/status/status.ts:204-215

The provenance gate uses `loadProvenance(...)` and only performs an acceptance check when `provenance.mode === 'derived'`. For driving wireframes, it never calls the existing `verifyDrivingWireframe` helper, so it does not verify that the driving sidecar still binds the current wireframe file and recorded hash.

Blast radius is high because an operator or agent can update the manifest wireframe hash after replacing the wireframe, while leaving stale driving provenance in place, and status will still call the surface complete. A reasonable fix is to call `verifyDrivingWireframe` for driving provenance and convert its failure into a blocking status finding.

### AUDIT-20260614-08 — Archive acceptance is not bound to the manifest surface

Finding-ID: AUDIT-20260614-08
Status:     fixed-08672d73
Disposition: fixed — archive acceptance is now bound to the manifest surfaceId, accepted wireframe path, and implementation commit (status.test.ts "flags an archive entry whose accepted wireframe does not match the manifest").
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    plugins/design-control/src/status/status.ts:184-194

The archive gate only checks that `loadArchiveEntry(archivePath)` succeeds and that `archive.accepted` exists. It never verifies that `archive.surfaceId` matches `manifest.surfaceId`, or that `archive.accepted.wireframePath` matches the manifest’s accepted wireframe path.

Blast radius is high because a copied or stale manifest can point at an accepted archive entry for a different surface or a different wireframe and still pass this completion gate. The fix should bind the archive record to the manifest identity and accepted artifact before treating archive acceptance as green.

## 2026-06-14 — audit-barrage lift (20260614T024327606Z-design-control-phase-2C)

### AUDIT-20260614-09 — `design-control status` can report complete even when the archive never records the implementation commit

Finding-ID: AUDIT-20260614-09 (codex-03 + codex-01; cross-model)
Status:     fixed-670c48a9
Disposition: fixed — status now requires archive.accepted.implementationCommit and that it match the manifest implementationCommit (670c48a9; archive binding hardened in 8fb7b609).
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    [plugins/design-control/src/status/status.ts](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:40) and [plugins/design-control/src/__tests__/status/status.test.ts](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/__tests__/status/status.test.ts:59)

The new manifest schema requires `implementationCommit` at [status.ts:59](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:59), but `getSurfaceStatus()` never uses that field after parsing. In the archive check at [status.ts:225-256](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:225), it verifies only acceptance presence, `surfaceId`, and wireframe paths. The green-path test at [status.test.ts:68-98](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/__tests__/status/status.test.ts:68) locks this in by expecting `complete: true` even though the accepted archive entry is created without any `implementationCommit`.

That breaks the archive contract stated in the spec: each archive entry is supposed to carry “proposal, accepted wireframe, impl commit” at [spec.md:280-285](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/spec.md:280). Downstream blast radius is high because a surface can now be declared complete while the archive lacks the commit link that is supposed to bind the accepted design decision to the implementation. A reasonable fix is to require `archive.accepted.implementationCommit`, and either make it match `manifest.implementationCommit` or collapse to one single source of truth instead of storing the commit independently in two places.

### AUDIT-20260614-10 — The status gate rejects valid archive entries where the proposal wireframe differs from the accepted wireframe

Finding-ID: AUDIT-20260614-10 (codex-01 + codex-02; cross-model)
Status:     fixed-8fb7b609
Disposition: fixed — the gate now binds only to archive.accepted.wireframePath (+ surfaceId), not the proposal path, so a proposal!=accepted entry is valid (status.test.ts "flags an archive entry whose accepted wireframe does not match the manifest" + the green-path test uses distinct proposal/accepted).
Severity:   medium
Per-lane:   codex=high, codex-gpt5=medium
Decision:   agreement (gate-counted medium)
Surface:    [plugins/design-control/src/status/status.ts](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:242)

`getSurfaceStatus()` correctly checks that the archive’s accepted wireframe matches the manifest at [status.ts:242-247](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:242), but then it also requires `archive.proposal.wireframePath` to equal that same manifest wireframe at [status.ts:249-254](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:249). That is stricter than the archive model itself: [archive/store.ts:26-35](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/archive/store.ts:26) stores proposal and accepted as distinct links, and the archive round-trip test already uses different values for them at [archive/store.test.ts:25-27](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/__tests__/archive/store.test.ts:25).

The consequence is a false negative completion gate: a perfectly sensible flow where a proposal artifact is superseded by a different accepted artifact will be rejected as `unaccepted-decision` even though the archive is internally consistent. Blast radius is medium because this blocks valid operator workflows rather than silently green-lighting a bad state, but it still turns a documented archive shape into an unusable one. The fix is to bind status only to `archive.accepted.wireframePath` (plus `surfaceId`), not to the proposal path.

### AUDIT-20260614-11 — The new `operator-approved-descope` manifest field changes the authoritative descope contract without updating the spec/workplan

Finding-ID: AUDIT-20260614-11
Status:     fixed-08672d73
Disposition: fixed — spec.md and tasks.md were updated (8fb7b609) to record the manifest `operator-approved-descope` field as the authoritative descope surface, ending the code-vs-docs drift.
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    [plugins/design-control/src/status/status.ts](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:29), [plugins/design-control/src/__tests__/status/status.test.ts](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/__tests__/status/status.test.ts:355), and missing updates in [plugins/design-control/specs/001-design-control/spec.md](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/spec.md:303) / [plugins/design-control/specs/001-design-control/tasks.md](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/tasks.md:258)

The implementation now treats stale-surface descope as manifest data via `staleSurface: { mode: 'operator-approved-descope', rationale }` at [status.ts:29-37](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:29), and the test at [status.test.ts:355-386](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/__tests__/status/status.test.ts:355) marks that manifest-local descope as a green completion path. But the authoritative spec still says the infeasible-path descope is “recorded in the workplan” at [spec.md:305-308](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/spec.md:305), and the task acceptance repeats that at [tasks.md:264-266](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/tasks.md:264).

That is contract drift, not just missing prose. An operator following the spec can record the approved descope in the workplan exactly as directed and still fail `design-control-status`, because the code only looks in the manifest. Blast radius is high because this is the kind of mismatch an unattended agent or a human operator will hit directly during completion gating. The fix is to pick one authoritative recording surface and update both code and docs to match; if the manifest is the new source of truth, the spec/workplan need to be changed in the same diff.

### AUDIT-20260614-12 — Status manifests can green-light machine-local absolute paths

Finding-ID: AUDIT-20260614-12
Status:     fixed-8b842c3a
Disposition: fixed — pathSchema rejects `~`, POSIX-absolute, Windows-drive (`C:`), and leading-backslash roots; assertWithinCollection enforces the collection boundary. Non-vacuous negative test added in 8b842c3a ("returns 1 for a manifest using a Windows drive-rooted artifact path").
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/status/status.ts:17-25, src/status/status.ts:138-140, src/status/status.ts:164-225, src/status/status.ts:297-308

The status manifest path schema is only `z.string().min(1)`, and `resolveAgainstManifest()` uses `resolve(dirname(manifest), target)`. For absolute `target` values, `resolve()` ignores the manifest directory, so `wireframe.path`, `designSpec.path`, `archive.path`, and stale source paths can point anywhere on the author’s machine. That undermines the same portability rule enforced for design-spec CSS links: the status artifact can pass locally while naming files that are not part of the collection.

Blast radius is high because downstream consumers can act on a `complete` status that cannot travel with the markdown collection. The fix should reject machine-rooted paths in the status schema, or enforce a repository/collection root boundary before hashing and loading artifacts.

## 2026-06-14 — audit-barrage lift (20260614T061804583Z-design-control-phase-2C)

### AUDIT-20260614-13 — Status manifest paths are not actually constrained to the declared “collection-relative” contract

Finding-ID: AUDIT-20260614-13 (codex-01 + codex-01 + codex-02; cross-model)
Status:     fixed-8b842c3a
Disposition: fixed — Windows-rooted paths are rejected by pathSchema and assertWithinCollection contains targets to the collection root (manifest dir); both holes named here are closed (fed59290 containment + 8b842c3a Windows-root test + realpath). Note: the manifest directory is the collection root rather than an explicitly-declared root field — narrower than the finding's proposal but a defensible portable contract.
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    plugins/design-control/src/status/status.ts:17-22, 143-145

`pathSchema` says manifest paths must be “collection-relative,” but the implementation only rejects `~` and `path.isAbsolute()` at [status.ts:17-22](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:17). That leaves two holes. First, on non-Windows hosts `isAbsolute()` does not reject Windows-style machine-rooted inputs like `C:foo`, `C:\foo`, or `\foo`, so a manifest can carry author-machine paths and still parse cleanly. Second, `resolveAgainstManifest()` resolves every target relative to the manifest file’s directory at [status.ts:143-145](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:143), not relative to any collection root, so `../` escapes and subdirectory-local manifests both change what file a supposedly “collection-relative” path names.

That is a real contract bug, not just wording drift: an unattended agent or adopter can produce a manifest that looks portable and passes schema validation, while `design-control-status` evaluates the wrong files or follows machine-specific paths. The blast radius is high because this command is a completion gate; a green or red verdict against the wrong artifact undermines the feature’s stated governance goal. A reasonable fix is to make the root explicit in the manifest contract and validate paths against that root, using the same non-portable path rejection discipline already applied in the design-spec checker.

### AUDIT-20260614-14 — Missing or drifted wireframes can produce a second, misleading `missing-wireframe-provenance` finding even when provenance is fine

Finding-ID: AUDIT-20260614-14
Status:     fixed-fed59290
Disposition: fixed — provenance verification is now gated on `wireframeArtifactOk`, so a missing/drifted wireframe no longer also manufactures a spurious `missing-wireframe-provenance` finding (status.test.ts "does not emit a provenance finding when the wireframe artifact is already missing").
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/src/status/status.ts:168-184, 278-299

`getSurfaceStatus()` correctly records `missing-wireframe` when the accepted artifact is absent or its manifest hash no longer matches at [status.ts:168-184](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:168). But it then runs provenance verification unconditionally at [status.ts:278-299](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:278). In the derived branch, a missing wireframe falls through to `verifyDrivingWireframe()` because `existsSync(wireframePath)` is false; that throws a mode-mismatch error, which is then reported as `missing-wireframe-provenance`. In the driving branch, the same missing file causes `verifyDrivingWireframe()` to throw “bound wireframe file ... no longer exists,” and that too is recast as `missing-wireframe-provenance`. The result is a second finding that blames provenance even when the actual problem is only the artifact path or hash.

The blast radius is medium because this surface is supposed to give one actionable next gate, and here it manufactures a false secondary defect from the first one. An operator or unattended agent can waste effort repairing provenance records that were never wrong. A reasonable fix is to skip provenance verification unless the accepted wireframe artifact both exists and matches the manifest hash; provenance is about how to interpret a valid artifact, not about re-diagnosing an already-failed artifact lookup.

## 2026-06-14 — audit-barrage lift (20260614T093832363Z-design-control-phase-2C)

### AUDIT-20260614-15 — `design-control-status` can crash on unreadable or concurrently-changed artifacts instead of returning a structured finding

Finding-ID: AUDIT-20260614-15 (codex-02 + codex-03 + codex-01; cross-model)
Status:     fixed-8b842c3a
Disposition: fixed — wireframe/spec hash reads, checkDesignSpecFile, and the mapped stale-source read are now guarded; an artifact that passes existsSync then fails to read yields a structured `missing-wireframe`/`missing-design-spec`/`invalid-design-spec`/`stale-surface` finding ("could not be read") instead of crashing (status.test.ts two crash-safety tests, RED-first).
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    `src/status/status.ts:121-124`, `src/status/status.ts:154-165`, `src/status/status.ts:175-184`, `src/status/status.ts:316-331`

`getSurfaceStatus` only uses `existsSync(...)` before hashing or re-reading files, then calls `readFileSync(...)` through `fileHashMatches` and `checkDesignSpecFile(...)` without any local error handling. That means a spec, wireframe, or mapped source that becomes unreadable between the existence check and the read, or that has permissions problems despite existing, will throw out of `getSurfaceStatus`. `runDesignControlStatus` also has no catch, so the CLI stops emitting its documented `rule: ...` findings / `next-action:` contract and instead aborts.

The blast radius is high because this command is a completion gate. A downstream script or operator relying on `design-control-status` to always return a machine-usable incomplete verdict on bad artifact state instead gets a process crash on exactly the failure paths the gate is supposed to explain. A reasonable fix is to wrap artifact hashing and `checkDesignSpecFile(specPath)` in the same kind of structured error-to-finding conversion already used for manifest loading and archive loading, so unreadable artifacts become `missing-*` / `invalid-*` findings rather than uncaught exceptions.

### AUDIT-20260614-16 — The “stay within the collection root” check is bypassable through symlinks

Finding-ID: AUDIT-20260614-16 (codex-01 + codex-02; cross-model)
Status:     fixed-8b842c3a
Disposition: fixed — assertWithinCollection now realpaths the deepest existing prefix of both the collection root and the target before the containment test, so a symlinked path segment escaping the root is followed and rejected; a not-yet-authored artifact still validates (status.test.ts "rejects a symlinked artifact that escapes the collection root", RED-first).
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    `src/status/status.ts:109-119`, `src/status/status.ts:125-136`

The new containment check is purely lexical: `assertWithinCollection(...)` resolves the manifest-relative path with `resolve(...)`, compares it to the manifest directory with `relative(...)`, and accepts it if the resulting string does not traverse `..`. That blocks literal `../outside/...` paths, but it does not canonicalize symlinks. A manifest path like `artifacts/spec-link.md` can pass this check even when `artifacts/` is a symlink to a location outside the collection root, and the later `readFileSync(...)` calls will happily follow it.

The blast radius is high because the feature’s stated goal here is to contain status artifacts to portable, collection-local paths. As written, a manifest can still validate against external files while looking collection-relative on paper, which lets a non-portable setup report `complete: true` and defeats the contract the operator is relying on. The fix is to compare canonicalized paths (`realpath`) where the target exists, or otherwise reject symlinked path segments for artifact fields that are meant to be collection-contained.

## 2026-06-14 — audit-barrage lift (20260614T183809103Z-design-control-after_clarify)

### AUDIT-20260614-17 — Referee-request path validation still permits `../` escapes outside the collection

Finding-ID: AUDIT-20260614-17 (codex-01 + codex-01; cross-model)
Status:     fixed-41466a84
Disposition: fixed — `collectionRelativePathSchema` now rejects `../`-normalized escapes at the string level, and the path schema was deduped into `@/manifests/manifest-fields` (shared by both manifests). Tests: two `../`-escape cases (wireframe + referee baseline). Load-time symlink/realpath containment is a Phase-5 capture concern (see AUDIT-20260614-28 boundary).
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    plugins/design-control/src/manifests/referee-request.ts:32-49,114-177

The new schema says these artifact references are "collection-relative" paths, but the actual guard only rejects machine-rooted forms: `~`, POSIX absolute, Windows drive, and leading backslash paths (`pathSchema` at lines 32-43). A manifest like `wireframe.path: "../other-project/secret.html"` or `referee.baseline.path: "../../outside.png"` still passes `parseRefereeRequestManifest` because `../` is relative, even though it escapes the collection and is not actually collection-relative in the repo’s own terminology.

That matters because this module exposes only a context-free parser (`parseRefereeRequestManifest(value)` at lines 176-177). Unlike the existing status surface, which follows schema parse with `assertWithinCollection(...)` checks tied to the manifest file path (`plugins/design-control/src/status/status.ts:166-202`), the referee-request surface has no loader that can enforce containment. Downstream consumers can therefore accept a manifest as valid and later resolve artifact paths outside the collection root. The blast radius is high because an unattended Phase 5 consumer acting on this contract can read or capture against the wrong artifacts by default, and nothing in this surface corrects that reading. A reasonable fix is to add a manifest-path-aware load/parse entrypoint that performs the same containment check as status, and add a regression test that `../` escapes are rejected.

## 2026-06-14 — audit-barrage lift (20260614T184356699Z-design-control-after_clarify)

### AUDIT-20260614-18 — Backslash paths still bypass the new “collection-relative” escape check

Finding-ID: AUDIT-20260614-18 (codex-02 + codex-01; cross-model)
Status:     fixed-c3afe2b1 (supersedes migrated-to-backlog TASK-30 — fixed in-loop before backlog selection; close TASK-30 as already-fixed)
Disposition: fixed — `collectionRelativePathSchema` now rejects ANY backslash, so embedded `\..\` escapes and UNC roots fail regardless of host `path.normalize` semantics. Test: `nested\..\outside.html` rejected; forward-slash subdir paths still pass.
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    `src/manifests/manifest-fields.ts:14-44`

The new shared `collectionRelativePathSchema` promises to reject paths that are not portable or that escape the collection root, but the implementation only normalizes with the host platform’s `path.normalize()` and then checks for `../` or `..\\` prefixes. On a POSIX host, a path like `nested\\..\\outside.html` is not treated as traversing directories, so `escapesOwnRoot()` returns false and the manifest passes validation. That same string is a real parent escape for any Windows consumer, and it also becomes ambiguous if later code ever uses `path.win32` semantics explicitly.

The blast radius is high because this primitive was intentionally centralized and is now shared by both the new referee-request manifest and the existing status manifest (`src/manifests/referee-request.ts`, `src/status/status.ts`). A manifest can therefore satisfy the schema while still carrying a cross-platform root escape, which defeats the stated “portable collection-relative” contract. A reasonable fix is to make the schema platform-independent: either reject any backslash in manifest paths outright, or normalize/check with both POSIX and Windows path semantics before accepting the value.

### AUDIT-20260614-19 — `perViewportIdentity` is not actually enforced per viewport

Finding-ID: AUDIT-20260614-19
Status:     fixed-c3afe2b1 (supersedes migrated-to-backlog TASK-31 — fixed in-loop; close TASK-31 as already-fixed)
Disposition: fixed — `requirePerViewportIdentityCoverage` ties `perViewportIdentity` to the declared `viewports` (coverage + no extras + no duplicates), gated on presence. Tests: missing/duplicate/undeclared-viewport cases rejected.
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/manifests/referee-request.ts:83-91`, `src/manifests/referee-request.ts:109-150`, `src/__tests__/manifests/referee-request.test.ts:27-42`

The Phase 4 task text says the schema defines “per-viewport identity,” but the implementation only requires `perViewportIdentity` to be a non-empty array (`z.array(perViewportIdentitySchema).min(1)`). There is no refinement that every declared viewport in `viewports` has a corresponding identity entry, nor any check for duplicate `viewportId`s. As written, a `referee-preview` manifest with both desktop and phone viewports can validate while supplying identity metadata for only one of them.

This matters because the same file already performs cross-field validation for the desktop/phone viewport contract via `superRefine`, so consumers will reasonably assume other viewport-scoped referee data is also complete when the schema accepts it. The blast radius is medium: downstream Phase 5 code is likely to discover the omission only when it tries to capture or authenticate a missing viewport, at which point behavior becomes consumer-defined rather than governed by the manifest contract. A fix would add a post-parse refinement tying `referee.perViewportIdentity[*].viewportId` to the declared `viewports[*].id`, with uniqueness enforced as well.

### AUDIT-20260614-20 — Secret-bearing auth metadata is accepted instead of rejected

Finding-ID: AUDIT-20260614-20
Status:     fixed-c3afe2b1
Disposition: fixed — `principalSchema` + `captureConfigSchema` made strict (c3afe2b1), extended to whole-manifest strict in 943c6d11; secret-bearing extra keys now fail validation instead of silently dropping. Tests: token-bearing principal/captureConfig rejected.
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/manifests/referee-request.ts:71-81

`principalSchema` is described as “Non-secret principal / auth metadata” and the comment says secret tokens are not part of the manifest contract, but the schema is a plain `z.object({ id, storageStateRef })`. Zod objects strip unknown keys by default, so `{ principal: { id: "editor", token: "secret" } }` validates successfully and silently drops `token` from the parsed value.

That matters because the schema is the validation boundary for a manifest format. A downstream caller or unattended agent can reasonably rely on “schema validation passed” to mean the manifest did not contain forbidden secret-bearing fields, but as written it only means those fields were ignored. The fix is to make the relevant manifest objects strict, at least `principalSchema` and likely the surrounding referee-control/base manifest objects, so unexpected fields fail validation instead of being accepted.

## 2026-06-14 — audit-barrage lift (20260614T185007835Z-design-control-after_clarify)

### AUDIT-20260614-21 — Duplicate viewport ids make the new per-viewport identity check report a false exact match

Finding-ID: AUDIT-20260614-21
Status:     fixed-943c6d11 (supersedes migrated-to-backlog TASK-32 — fixed in-loop; close TASK-32 as already-fixed)
Disposition: fixed — `requireUniqueViewportIds` rejects duplicate viewport ids before identity-coverage is evaluated (later shared into `@/manifests/manifest-fields`, 3d13d5e0). Test: two same-id viewports rejected.
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/src/manifests/referee-request.ts:122-123,160-192

`requirePerViewportIdentityCoverage()` builds `declared` with `new Set(viewports.map((viewport) => viewport.id))` and then compares `perViewportIdentity[*].viewportId` against that deduplicated set. Because `viewports` itself is only `z.array(viewportSchema).min(1)` with no uniqueness check on `id`, a manifest can declare the same viewport id twice and still pass the refinement with only one identity entry. For example, two declared viewports both named `"desktop"` collapse to one set member, so the code reports an “exact” coverage match even though the manifest is internally ambiguous.

The blast radius is the Phase 5 consumer of this contract: per-viewport capture identity is keyed by `viewportId`, so duplicate ids make baseline/candidate selection ambiguous while still passing Phase 4 schema validation. That is a structural correctness bug in the contract itself, not just a missing test. A reasonable fix is to reject duplicate `viewports[*].id` in the same `superRefine()` pass and add a test that proves a duplicate declared viewport id is rejected before identity coverage is evaluated.

### AUDIT-20260614-22 — Scaffold mode silently accepts a misspelled optional `referee` block instead of rejecting it

Finding-ID: AUDIT-20260614-22
Status:     fixed-943c6d11 (supersedes migrated-to-backlog TASK-33 — fixed in-loop; close TASK-33 as already-fixed)
Disposition: fixed — whole-manifest strict; a misspelled top-level `refree` key is now rejected, not silently dropped and treated as "referee omitted." Test: misspelled scaffold `refree` block rejected.
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/src/manifests/referee-request.ts:12-19,74-76,195-213

The module promises that scaffold manifests validate the referee block “when it IS supplied” (`referee` is optional in scaffold mode, but malformed supplied data should still be rejected). The actual schema uses plain `z.object(...)` for both union branches and only makes `captureConfig` and `principal` strict. In Zod, non-strict objects strip unknown keys by default, so a scaffold manifest with a typo like `"refree": { ... }` is accepted as a valid scaffold manifest that simply omits `referee`. That is not “validated-when-present”; it is silent data loss on the one branch where omission is legal.

The blast radius is limited to scaffold manifests, but it is still real: an operator or unattended generator can believe it provided referee metadata, get a passing schema result, and only discover much later that the block was discarded. This diff already treats silent stripping as unacceptable for secret-bearing objects, and the same problem exists here because `referee` is semantically load-bearing when present. A reasonable fix is to make the top-level manifest objects strict, or otherwise explicitly reject unknown top-level keys on the scaffold branch, and add a test for a misspelled `referee` property.

### AUDIT-20260614-23 — Extra secret-bearing keys still validate outside `principal` and `captureConfig`

Finding-ID: AUDIT-20260614-23
Status:     fixed-943c6d11
Disposition: fixed — structural whole-manifest strict (every object `.strict()`); extra secret-bearing keys anywhere in the referee tree (top-level, nested baseline/stableRegions, etc.) now fail. Tests: top-level + nested unknown-key rejection.
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/manifests/referee-request.ts:39-114

The schema is strict only for `captureConfigSchema` and `principalSchema` at lines 78-103, but every surrounding referee object remains a default Zod object: `artifactRefSchema`, `stableRegionSchema`, `dynamicRegionSchema`, `perViewportIdentitySchema`, and the parent `refereeControlSchema` at lines 39-114. Zod strips unknown keys by default, so a manifest containing `referee.token`, `referee.baseline.token`, or `referee.stableRegions[0].token` will parse successfully rather than being rejected.

That conflicts with the documented contract in this same file that the manifest keeps secrets out, and with the new tests’ intent at lines 223-230, which only proves rejection for two narrow locations. The blast radius is high because downstream validation can report “schema passed” for a checked-in manifest that still contains secret-bearing fields in other referee-control locations. A reasonable fix is to make the full referee-control tree strict where it is part of the committed manifest contract, or add a recursive forbidden-key refinement if forward-compatible extra fields are still desired for non-secret metadata.

## 2026-06-14 — audit-barrage lift (20260614T185857096Z-design-control-after_clarify)

### AUDIT-20260614-24 — `surface-status` still silently strips unknown keys, so the shared manifest contract is only half-applied

Finding-ID: AUDIT-20260614-24
Status:     fixed-938a6973 (supersedes migrated-to-backlog TASK-34 — fixed in-loop; close TASK-34 as already-fixed)
Disposition: fixed — `surfaceStatusManifestSchema` made strict at every object layer (sourceFile, both staleSurface branches, nested wireframe/designSpec/archive, top-level), mirroring the referee-request strictness. Tests: 3 unknown-key cases (top-level, nested, staleSurface).
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/design-control/src/status/status.ts:24-61`

This diff centralizes shared field rules in [`manifest-fields.ts`](</Users/orion/work/deskwork-work/design-control/plugins/design-control/src/manifests/manifest-fields.ts:1>) and makes the new referee-request manifest explicitly “whole-manifest strict” ([`referee-request.ts:27-33`](</Users/orion/work/deskwork-work/design-control/plugins/design-control/src/manifests/referee-request.ts:27>)). But the `surfaceStatusManifestSchema` path still leaves most objects non-strict: `sourceFileSchema`, both `staleSurface` branches, the top-level manifest object, and nested `wireframe` / `designSpec` / `archive` objects are all plain `z.object(...)` without `.strict()` ([`status.ts:24-61`](</Users/orion/work/deskwork-work/design-control/plugins/design-control/src/status/status.ts:24>)). As written, a typo like `secretToken`, `refree`, or an accidental nested extra key in a status manifest will be silently dropped instead of rejected.

The blast radius is moderate because `loadSurfaceStatusManifest()` is a consumer-facing validation entrypoint, and downstream operators will reasonably read this refactor as “shared manifest validation is now canonical.” In practice, the status surface still accepts malformed author intent and proceeds with a different manifest than the one written, which is exactly the class of hidden-schema drift the referee-request strictness work was trying to remove. A reasonable fix is to make the status manifest strict at every object layer and add regression tests in `src/__tests__/status/status.test.ts` mirroring the new unknown-key rejection coverage added for referee-request.

## 2026-06-14 — audit-barrage lift (20260614T190515991Z-design-control-after_clarify)

### AUDIT-20260614-25 — Scaffold mode is implemented as all-or-nothing, but the spec says the later referee fields are individually optional

Finding-ID: AUDIT-20260614-25
Status:     fixed-ffb05d70
Disposition: fixed — scaffold referee fields are now individually optional (`refereeControlSchema.partial().strict()`); referee-preview still requires all; the per-viewport-identity coverage check is gated on `referee?.perViewportIdentity` presence. Matches spec.md's field-level "OPTIONAL in scaffold mode." Tests: 5 cases (partial accepted, malformed-when-present rejected, unknown-key rejected, referee-preview still complete).
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/manifests/referee-request.ts:120-130,241-247; plugins/design-control/specs/001-design-control/spec.md:317-323; plugins/design-control/specs/001-design-control/tasks.md:295-305

The spec text says the later referee-control fields are “defined-and-validated-when-present” and “OPTIONAL in scaffold mode” ([spec.md:317-323](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/spec.md:317), [tasks.md:295-305](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/tasks.md:295)). The implementation does something narrower: `refereeControlSchema` requires every nested field (`baseline`, `candidate`, `stableRegions`, `dynamicRegions`, `captureConfig`, `perViewportIdentity`, `principal`) at [referee-request.ts:120-130](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/manifests/referee-request.ts:120), and scaffold mode only makes the whole `referee` block optional at [referee-request.ts:241-247](/Users/orion/work/deskwork-work/design-control/plugins/design-control/src/manifests/referee-request.ts:241). A scaffold manifest that supplies only some future-facing referee metadata therefore fails, even though the more natural reading of the spec is that omitted Phase-5 fields remain allowed until `referee-preview`.

This matters because the Phase 4 contract is supposed to let Phase 5 grow into the same manifest without breaking scaffold authors. As written, a downstream consumer that incrementally records referee data during scaffold mode will get schema rejections that contradict the governing text. The blast radius is high because the spec and implementation support different authoring patterns, and an unattended agent could plausibly choose the spec-shaped one first. A reasonable fix is to decide which contract is intended and make the artifacts agree: either make scaffold-mode nested referee fields individually optional, or tighten the spec/tasks text to say the `referee` block itself is optional but, when present, must be complete.

### AUDIT-20260614-26 — Phase 4 landed new governed files without adding a Phase 4 authoritative file-scope block

Finding-ID: AUDIT-20260614-26
Status:     fixed-ffb05d70 (supersedes migrated-to-backlog TASK-35 — fixed in-loop; close TASK-35 as already-fixed)
Disposition: fixed — added the Phase-4 "Per-phase govern file scope (authoritative)" line naming `src/manifests/{referee-request,manifest-fields,index}.ts` + the manifests test, matching the earlier phases' governance-boundary convention.
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/specs/001-design-control/tasks.md:282-313 (missing govern-scope declaration for `src/manifests/*` and `src/__tests__/manifests/referee-request.test.ts`)

This repo uses `Per-phase govern file scope (authoritative): ...` lines as the explicit audit/governance boundary; earlier phases have them, for example at [tasks.md:214](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/tasks.md:214) and [tasks.md:232](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/tasks.md:232). Phase 4’s updated section at [tasks.md:282-313](/Users/orion/work/deskwork-work/design-control/plugins/design-control/specs/001-design-control/tasks.md:282) records completion of `src/manifests/referee-request.ts`, `src/manifests/manifest-fields.ts`, `src/manifests/index.ts`, and `src/__tests__/manifests/referee-request.test.ts`, but it never adds the corresponding authoritative scope block.

The runtime code still works, so this is not a blocking correctness defect. The blast radius is governance: later scope-limited audits, barrage prompts, or operator reviews can legitimately omit the new manifest surfaces because the workplan never names them as Phase 4’s governed files. In this repository, that is load-bearing process metadata, not cosmetic documentation. A reasonable fix is to add the missing Phase 4 govern-scope line naming the new manifest modules and tests explicitly.

### AUDIT-20260614-27 — Referee-preview validates per-viewport identity but not per-viewport artifacts

Finding-ID: AUDIT-20260614-27
Status:     boundary-phase5-ffb05d70
Disposition: documented Phase-4/Phase-5 boundary (NOT a schema defect). Phase 4 defines `baseline`/`candidate` as single structure-only refs per the spec's field list ("baseline + candidate **paths**"); the per-viewport / per-cell baseline MATRIX coverage is **referee-preview status** scope in Phase 5 (spec.md § Baseline & capture: "referee-preview status refuses completion when candidate screenshots don't cover the required matrix"). The boundary is recorded in tasks.md Phase 4. Promises-before-mechanism: Phase 4 promises the fields exist + are shaped; Phase 5 owns the matrix-coverage mechanism.
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/manifests/referee-request.ts:120-128,262-273; plugins/design-control/src/__tests__/manifests/referee-request.test.ts:30-45,79-83; missing schema surface for baseline/candidate matrix coverage

The `referee-preview` branch requires a `referee` block and now checks `perViewportIdentity` exactly against declared `viewports`, but `baseline` and `candidate` are still single scalar artifact refs: `baseline: artifactRefSchema` and `candidate: artifactRefSchema`. The happy-path fixture declares desktop and phone viewports, supplies identity for both, but only one baseline path and one candidate path, both named `desktop.png`, and the test accepts that as well formed.

This conflicts with the feature contract that referee-preview evidence covers both viewports and that baselines are a matrix keyed by `surface id + route/state + viewport + capture-step` (`spec.md:137`, `spec.md:402-404`, `spec.md:470-471`). The blast radius is high because a downstream Phase 5 consumer can treat this schema as complete and then either lack phone artifacts at execution time or incorrectly reuse a desktop artifact for the phone cell. A reasonable fix is to make baseline/candidate artifacts viewport keyed, or add a matrix/cell schema that enforces coverage for every declared viewport and required capture step.

## 2026-06-14 — audit-barrage lift (20260614T191740993Z-design-control-after_clarify)

### AUDIT-20260614-28 — Referee-request still has no manifest-path-aware containment pass, so symlink escapes remain unverifiable

Finding-ID: AUDIT-20260614-28
Status:     boundary-phase5
Disposition: documented Phase-4/Phase-5 boundary (NOT a schema defect). Phase 4's referee-request surface is schema-validation-only (`parseRefereeRequestManifest` takes a value, not a path); its portable-path contract is the string-level guards (reject `~`/absolute/Windows-drive/backslash/`../`-escape). Symlink/realpath containment requires resolving paths against a manifest FILE location — that is Phase-5 capture's job (where artifacts are actually resolved + read), mirroring status's load-time `assertWithinCollection`. Same boundary class as AUDIT-20260614-27; recorded in tasks.md Phase 4. A manifest-path-aware referee loader belongs to Phase 5, not the Phase-4 schema.
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/manifests/manifest-fields.ts:10-13; plugins/design-control/src/manifests/referee-request.ts:300-307; contrast plugins/design-control/src/status/status.ts:183-219

The new shared path primitive now explicitly documents a two-layer contract: string-level validation first, then a load-time containment check that follows symlinks and enforces subdirectory-manifest boundaries (`manifest-fields.ts:10-13`). That second layer exists for the status surface via `loadSurfaceStatusManifest()` and `assertWithinCollection()` (`status.ts:183-219`), but the new referee surface still exports only `parseRefereeRequestManifest(value)` (`referee-request.ts:300-307`), which has no access to the manifest file path and therefore cannot perform the documented containment pass. The lexical `../` fix closes one class of escape, but a path like `artifacts/spec-link.md` can still be schema-valid while traversing out of the collection through an existing symlink.

The blast radius is high because Phase 5 consumers will treat this schema as the validation boundary for capture/baseline artifacts. If they act on it as written, they can accept a “valid” referee manifest and then read or capture against artifacts outside the collection root by default. A reasonable fix is to add a manifest-path-aware referee loader, mirroring the status surface’s post-parse containment checks, and cover it with a symlink-escape regression test.

### AUDIT-20260614-29 — `status.ts` keeps a now-unused `isAbsolute` import

Finding-ID: AUDIT-20260614-29
Status:     wontfix-false-premise
Disposition: FALSE PREMISE — `isAbsolute` is NOT unused. It is used in `assertWithinCollection` (status.ts:189, `!isAbsolute(rel)`). The package compiles clean under `noUnusedLocals` — `tsc --noEmit` passes and 575 tests are green — which directly disproves the finding's "build will fail" claim. No change made; removing the import would break the symlink-containment check. (Per the govern protocol, a false-premise finding is recorded as an acknowledgment, not invented code.)
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/status/status.ts:3

`status.ts` now delegates path validation to `collectionRelativePathSchema`, but the existing `isAbsolute` import remains on line 3: `import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';`. The audited package has `noUnusedLocals: true` in `plugins/design-control/tsconfig.json`, so this is not just hygiene: a TypeScript build/check will fail before consumers can use the feature.

The reasonable fix is to remove `isAbsolute` from the import list in `src/status/status.ts`. Blast radius is blocking because the shipped diff makes the package fail its strict TypeScript compile gate even though the runtime schema logic is otherwise reachable.

## 2026-06-14 — audit-barrage lift (20260614T200519289Z-design-control-after_clarify)

### AUDIT-20260614-30 — Surface-status viewports can still duplicate ids

Finding-ID: AUDIT-20260614-30
Status:     fixed-3d13d5e0
Disposition: fixed — `requireUniqueViewportIds` (and `requireDesktopAndPhoneViewports`) extracted into `@/manifests/manifest-fields` and applied to BOTH `surfaceStatusManifestSchema` and the referee-request schema; the status manifest now rejects duplicate viewport ids (sibling consistency, single-sourced viewport contract). Test: status duplicate-id manifest rejected.
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/src/status/status.ts:84-100; plugins/design-control/src/__tests__/status/status.test.ts:709-767

`surfaceStatusManifestSchema` validates the desktop/phone contract only by width: one viewport `>=1280` and one `<=390`. Unlike the new referee-request schema, it does not reject duplicate `viewports[*].id` values. A status manifest with `[{ id: "desktop", width: 1280 }, { id: "desktop", width: 390 }]` will satisfy lines 85-100 even though the manifest has no distinct phone viewport identity. The new status tests cover strict extra-key rejection, but not duplicate viewport ids.

Blast radius is high because status is the completion gate surface. A downstream agent or adopter can act on a status manifest as complete while the viewport identity matrix is ambiguous or collapsed, exactly the shape the referee-request schema now rejects at `referee-request.ts:193-208`. A reasonable repair is to share/apply the same unique-viewport-id refinement to `surfaceStatusManifestSchema` and add a status negative test for duplicate ids.

## 2026-06-14 — audit-barrage lift (20260614T201108363Z-design-control-after_clarify)

_No findings surfaced — a clean barrage run over a healthy fleet (0 HIGH+, 0 MEDIUM, 0 total). Recorded so the convergence dampener counts it as a quiet run (claude-20260612-r3); a clean run that left no section was invisible to the consecutive-quiet / single-run-clean rules._

## 2026-06-14 — audit-barrage lift (20260614T203837670Z-design-control-after_clarify)

### AUDIT-20260614-31 — Marketplace shell has no adopter bootstrap, so a fresh install can’t run its own verbs

Finding-ID: AUDIT-20260614-31
Status:     fixed-c99d005b
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/README.md:38-60; plugins/design-control/package.json:1-25; missing first-run/bootstrap surface for marketplace installs

The new shell is documented as a deskwork marketplace plugin and its only adopter-facing install guidance is “follow the marketplace install path” in [plugins/design-control/README.md:50-54](/Users/orion/work/deskwork-work/design-control/plugins/design-control/README.md:50), while the same README says the shipped verbs dispatch through a `tsx`-based TypeScript core in [README.md:38-48](/Users/orion/work/deskwork-work/design-control/plugins/design-control/README.md:38). But the matching package surface added here is only a private workspace package with raw TypeScript dependencies in [package.json:1-25](/Users/orion/work/deskwork-work/design-control/plugins/design-control/package.json:1): there is no bootstrap hook, no first-run installer, no published runtime package dependency, and no precompiled bundle. In other words, the diff marks the plugin shell complete and marketplace-registered, but it does not add any mechanism that would make a fresh marketplace install runnable.

That gap matters because the consumer blast radius is immediate: a new adopter who installs `design-control` through the marketplace is naturally going to invoke one of the documented verbs first, but the shell has no guaranteed way to have `tsx` and the source dependencies present at that point. The existing deskwork shell establishes the repo’s working pattern here: it documents a first-run install path and depends on a released runtime package rather than assuming a dev workspace. As written, this shell is still a maintainer/workspace surface, not a standalone adopter surface, so the advertised marketplace path is likely to fail on first use. A reasonable fix is to ship an actual adopter bootstrap in the plugin shell itself (for example the same kind of first-run dependency install used by sibling plugins, or a precompiled runtime), and update the README to describe that concrete runtime path rather than only pointing at the releases page.

## 2026-06-14 — audit-barrage lift (20260614T204838564Z-design-control-after_clarify)

### AUDIT-20260614-32 — Ancestor `tsx` short-circuits bootstrap for non-monorepo adopters

Finding-ID: AUDIT-20260614-32
Status:     fixed-0bd1abed
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `plugins/design-control/bin/_resolve-tsx.sh:15-23,34-45,78-86`; `plugins/design-control/src/__tests__/authoring/adopter-bootstrap-shim.test.ts:11-19,63-68,129-168`

The new resolver treats any executable `node_modules/.bin/tsx` in any ancestor directory as the "workspace dev path" and returns early without probing or bootstrapping local dependencies. That logic is in `_dc_find_tsx()` plus the early return at lines 78-81: if `TSX` is non-empty and not exactly `$PLUGIN_ROOT/node_modules/.bin/tsx`, the helper assumes "the monorepo owns deps" and skips `_dc_all_deps_installed()`. That assumption is only valid for this repo's hoisted workspace root, not for arbitrary parent directories.

Blast radius is high because the advertised install path is "git-subdir clone of `plugins/design-control/`, no separate setup step required" ([README.md](plugins/design-control/README.md:56)). A real adopter can easily place that clone under some unrelated directory that already has a `node_modules/.bin/tsx`; in that layout the shim will silently skip `npm install`, then dispatch against a parent toolchain that may not contain `parse5`/`zod` at all or may contain incompatible versions. The new smoke test does not cover this mixed environment: it deliberately builds the fixture "OUTSIDE the monorepo" so that "the shim's upward walk finds no hoisted tsx" (test lines 11-19, 63-68), which proves only the no-ancestor case. A reasonable fix is to distinguish the repo-hoist case from arbitrary ancestors before returning early, or to require a full dependency probe even when `tsx` is inherited from a parent directory.

### AUDIT-20260614-33 — The standalone README ships broken relative links

Finding-ID: AUDIT-20260614-33
Status:     fixed-0bd1abed
Severity:   low
Per-lane:   codex-gpt5=low
Decision:   single-model (gate-counted low)
Surface:    `plugins/design-control/README.md:4-12,56-64`

The README says this plugin is installed as a marketplace git-subdir clone of `plugins/design-control/` with no monorepo around it (lines 56-64), but the very top of the same README links to `../stack-control/README.md` and `../../DESIGN-DISCIPLINE-THESIS.md` (lines 4-12). In the packaged subtree those paths do not exist, so the first explanatory links an adopter sees are dead.

Blast radius is low because the runtime still works, but this is still user-facing documentation drift in the exact surface the commit is adding. A standalone plugin README needs links that survive the standalone layout: absolute GitHub URLs, release-tagged docs links, or copied local documentation that is actually included in the shipped subtree.

### AUDIT-20260614-34 — The lockstep version bump is incomplete: `package-lock.json` still records `0.37.0`

Finding-ID: AUDIT-20260614-34
Status:     fixed-0bd1abed
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `plugins/design-control/package.json:1-4`; `plugins/design-control/specs/001-design-control/tasks.md:409-413`; `package-lock.json:8193-8200` (missing from the audited diff)

The package shell was bumped to `0.45.2` in `plugins/design-control/package.json:1-4`, and the workplan note explicitly says the plugin "joined the version lockstep" and that "`version:bump` [is] idempotent across all manifests including the new design-control entries" (`tasks.md:409-413`). But the repository lockfile still records the workspace entry `plugins/design-control` as version `0.37.0` at `package-lock.json:8193-8200`, and that file is absent from the audited range.

Blast radius is medium because this does not immediately break the plugin shell, but it does leave the repository's versioned surfaces internally inconsistent while the docs claim they were verified clean. Downstream consumers relying on the lockfile for reproducible installs, and unattended agents relying on the workplan's verification note, will read conflicting version truths. The fix is to regenerate or update the lockfile entry as part of the same lockstep sweep, or narrow the verification claim so it no longer says all manifests were updated when the lockfile still lags.

### AUDIT-20260614-35 — Local bootstrap can accept an interrupted install as complete

Finding-ID: AUDIT-20260614-35
Status:     override-backlog-TASK-36
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:53-59,84-90; plugins/design-control/src/__tests__/authoring/adopter-bootstrap-shim.test.ts:112-121

`_dc_all_deps_installed` treats the presence of `node_modules/<dep>/package.json` for `parse5`, `tsx`, and `zod` as the authoritative skip signal. That does not prove the local install is runnable: `tsx` has its own runtime deps (`esbuild`, `get-tsconfig`), and an interrupted or damaged first-run `npm install` can leave direct package metadata and `.bin/tsx` behind while missing transitive packages. On the next invocation, lines 84-86 skip reinstall and the shim dispatches into a broken local tree instead of repairing it.

The new test accidentally encodes the same weak proof: its fake npm writes only direct dep `package.json` files and symlinks `.bin/tsx` to the monorepo’s real runner, so it does not exercise whether an adopter-local `tsx` installation is self-contained. Blast radius is medium because normal completed installs work, but the bootstrap path explicitly claims to handle partial installs and this fails on a realistic operator interrupt or disk/cache failure. A reasonable fix is to add a version-keyed install-complete sentinel written only after `npm install` returns and the runnable probe passes, then require both the direct-dep probe and sentinel before skipping install; the test should use a local runner shape that fails when transitive deps are absent.

### AUDIT-20260614-36 — Version lockstep update left the root lockfile stale

Finding-ID: AUDIT-20260614-36
Status:     fixed-0bd1abed
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    package-lock.json:8193-8200 (missing from audited diff), plugins/design-control/package.json:1-6

`plugins/design-control/package.json` was bumped from `0.37.0` to `0.45.2`, and the workplan claims version lockstep was verified, but the root `package-lock.json` still records the workspace package as `0.37.0` at `packages["plugins/design-control"].version`. That means the repo’s committed npm metadata disagrees with the manifest that release and workspace tooling consume.

Blast radius is medium: this is unlikely to break the marketplace git-subdir payload directly, but it makes the release surface non-reproducible and causes the next `npm install`/lockfile refresh to produce unrelated churn or expose the drift during CI/release checks. The fix is to refresh and commit the lockfile entry so `plugins/design-control/package.json`, `.claude-plugin/plugin.json`, marketplace metadata, and `package-lock.json` all report `0.45.2`.

## 2026-06-14 — audit-barrage lift (20260614T205716447Z-design-control-after_clarify)

### AUDIT-20260614-37 — Bootstrap never reinstalls on plugin upgrades, so adopters can keep stale runtime deps indefinitely

Finding-ID: AUDIT-20260614-37
Status:     override-backlog-TASK-36
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:30-31,53-59,79-91; plugins/design-control/package.json:13-16; plugins/design-control/README.md:56-64

The new helper only asks “do `parse5`, `tsx`, and `zod` resolve from `PLUGIN_ROOT`?” (`RUNTIME_DEPS` at lines 30-31, `_dc_all_deps_resolve()` at lines 53-59). If they do, `resolve_tsx()` returns immediately at lines 82-85. There is no version check against `package.json`’s declared ranges (lines 13-16), no plugin-version sentinel, and no reinstall path for an upgrade where the deps are present but stale.

That leaves the upgrade path broken in exactly the way the README now advertises as handled: after a marketplace update, an adopter who already has `node_modules/` will silently keep the old runtime tree as long as those package names still resolve. The blast radius is high because the next release that bumps `parse5`/`tsx`/`zod` or starts depending on behavior from the newer versions will execute new plugin source against old runtime code, with no self-healing install and no diagnostic that points at version drift. A reasonable fix is to make the bootstrap version-aware, as sibling shims already do: compare installed versions against the manifest (or a version-keyed sentinel derived from the plugin/dependency set) and force reinstall when they drift.

### AUDIT-20260614-38 — The “authoritative” dependency probe does not detect broken transitive installs

Finding-ID: AUDIT-20260614-38 (codex-01 + codex-02; cross-model)
Status:     override-backlog-TASK-36 (comment over-claim corrected; deeper load-integrity deferred)
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:24-28,49-59; plugins/design-control/src/__tests__/authoring/adopter-bootstrap-shim.test.ts:114-128

The helper’s core claim is wrong. Its comments say `createRequire(...).resolve()` “proves the dep (and its transitive closure) is actually loadable” (lines 24-28, 49-52), but the implementation at line 55 only resolves the package entry path. `require.resolve('parse5')` succeeding does not prove that `parse5`’s own imports are present; it only proves Node can find the top-level module specifier.

The new test hard-codes that mistaken contract instead of catching it. In `stubNpmDir()`, lines 114-128 fabricate each dependency as nothing more than a `package.json` plus a dummy `index.js`, and the suite treats that as a successful “real dep set.” That means an interrupted install that leaves a direct package stub while omitting a nested dependency will still satisfy `_dc_all_deps_resolve()`, skip reinstall on the next run, and then crash only when the CLI actually imports the module. The blast radius is high because this patch explicitly claims to close the partial-install hole, but the shipped check still lets that exact failure mode through. The fix needs a stronger health check than `resolve()` alone, such as actually loading the modules (or another integrity signal tied to a completed install) before declaring the tree runnable.

### AUDIT-20260614-39 — First-run bootstrap is not serialized, so concurrent verb invocations race on the same `node_modules/`

Finding-ID: AUDIT-20260614-39
Status:     override-backlog-TASK-36
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:66-99; plugins/design-control/README.md:58-64

All four shipped verbs now source the same helper, and the README says the first time you run “any verb” it will bootstrap `node_modules/` automatically. But `_dc_run_install()` at lines 66-69 is called directly from `resolve_tsx()` at line 91 with no lock, no stale-lock recovery, and no recheck inside a critical section. Two first-use invocations in parallel will both decide deps are absent and both run `npm install` into the same plugin root.

That is a real edge case for unattended consumers: a CI job or agent flow can easily fire `check-wireframe` and `check-design-spec` at the same time on a fresh install. The blast radius is medium because this is limited to first run / damaged trees, but when it happens it can leave one command failing nondeterministically or a partially written install that then triggers the weaker probe issue above. A reasonable fix is to add the same directory-lock pattern already used by sibling plugin shims before mutating `PLUGIN_ROOT/node_modules/`.

### AUDIT-20260614-40 — Marketplace registration is claimed but absent from the audited diff

Finding-ID: AUDIT-20260614-40
Status:     wontfix-false-premise
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    missing `.claude-plugin/marketplace.json`; specs/001-design-control/tasks.md:404-411; README.md:49-63

The workplan marks the plugin shell complete and explicitly says it was “registered in `.claude-plugin/marketplace.json`,” but the audited diff only adds `.claude-plugin/plugin.json`; no marketplace registration file appears. The README also directs users to the marketplace release path, so downstream consumers are being told to install through a surface this diff does not actually provide.

The blast radius is high because marketplace discoverability/installability is part of the stated ship gate. If the file exists elsewhere, it needs to be included in the audited change; otherwise add the marketplace registration and keep the workplan note aligned with the actual committed surface.

**Disposition (wontfix-false-premise, 2026-06-14):** the registration DOES exist — `.claude-plugin/marketplace.json` at the REPO ROOT carries the `design-control` git-subdir entry (added in commit `bf6a11d2`, verified). The barrage's diff window is scoped to `plugins/design-control/`, so the repo-root manifest is simply outside the audited range (same scoping artifact as AUDIT-34/-36's "package-lock.json missing from audited diff" note). The workplan claim is accurate; no change needed.

## 2026-06-14 — audit-barrage lift (20260614T225018669Z-design-control-after_clarify)

### AUDIT-20260614-41 — Ancestor `node_modules` can silently satisfy the bootstrap probe, so adopter installs may run against unrelated dependency trees instead of the plugin’s own runtime

Finding-ID: AUDIT-20260614-41 (codex-01 + codex-01; cross-model)
Status:     override-backlog-TASK-36 (ancestor-vs-local distinction — same hardening family)
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:15-24,41-64,83-96; plugins/design-control/README.md:56-66

`_dc_all_deps_resolve()` does not verify that `parse5`, `tsx`, and `zod` come from `plugins/design-control/node_modules`; it calls `createRequire("$PLUGIN_ROOT/package.json").resolve(...)`, which still follows Node’s normal upward `node_modules` walk. `_dc_find_tsx()` then also walks upward and accepts the first ancestor `node_modules/.bin/tsx`. In a sparse-clone or project-local install nested under some other Node project, an unrelated ancestor tree that happens to contain all three packages will make the probe pass and skip the advertised local bootstrap entirely.

That matters because the shipped contract in [plugins/design-control/README.md](/Users/orion/work/deskwork-work/design-control/plugins/design-control/README.md:56) says first use bootstraps “the plugin’s own `node_modules/`” and later uses only skip when that runtime is already present. As written, the plugin can instead bind to arbitrary ancestor versions, including stale ones after a plugin upgrade, with no warning. The downstream blast radius is high because adopters can get silently wrong runtime selection rather than an explicit failure. A reasonable fix is to make the skip condition plugin-local: resolve/package-check under `$PLUGIN_ROOT/node_modules` only, or compare the resolved paths against `$PLUGIN_ROOT/node_modules/` before declaring the install complete.

### AUDIT-20260614-42 — The Node resolver probe breaks on valid install paths containing a single quote

Finding-ID: AUDIT-20260614-42
Status:     fixed-d1c3fd24
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:57-60; plugins/design-control/src/__tests__/authoring/adopter-bootstrap-shim.test.ts:70-72,198-203

The dependency probe interpolates `$PLUGIN_ROOT` directly into a JavaScript single-quoted literal: `node -e "require('node:module').createRequire('$PLUGIN_ROOT/package.json').resolve('$_dc_dep')"`. If the plugin is installed under a path containing `'` (for example a home directory or project folder with an apostrophe), that inline script becomes syntactically invalid and every shim fails before bootstrap logic can do anything useful.

This is a correctness defect, not just hygiene, because affected adopters cannot run any verb at all even though the filesystem path is valid. The current smoke test never exercises that case: both temp roots are created with fixed prefixes under `tmpdir()`, so the suite only covers quote-safe paths. The blast radius is medium because the failure is total for impacted users but path-shaped. The fix is straightforward: stop embedding raw paths into JS source. Pass the path through an environment variable or `process.argv`, then read it inside `node -e` without string-literal interpolation.

### AUDIT-20260614-43 — Resolver comment embeds a parked bootstrap-gap disposition

Finding-ID: AUDIT-20260614-43
Status:     fixed-d1c3fd24
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    plugins/design-control/bin/_resolve-tsx.sh:28-32

The resolver documents known bootstrap gaps, then parks them in a stack-control-wide backlog item: version-gated reinstall, transitive integrity, and concurrency locking. The audit prompt explicitly rejects this shape because it turns a known operational fragility into a future-management note inside the code artifact instead of either implementing the behavior or stating the shipped contract plainly.

The blast radius is low because the current runtime behavior is fail-loud for many damaged installs, and the comment does not itself alter execution. Still, unattended agents reading this file can treat the named gaps as intentionally out of scope and preserve a fragile bootstrap path. A reasonable fix is to remove the backlog disposition from the code comment and keep only the bounded behavior contract, or encode the relevant checks in the resolver.
