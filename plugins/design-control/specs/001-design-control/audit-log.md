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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
Status:     open
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
