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
Severity:   low
Surface:    plugins/design-control/skills/translate-design-language/SKILL.md:44-48,97-98; plugins/design-control/src/design-language/check-spec-file.ts:68-71; plugins/design-control/specs/001-design-control/tasks.md:176-191

The diff repeatedly encodes “not validated in v1” / “named-deferred” / “out of v1 scope” language in the operator-facing skill, CLI output, and workplan. The audit prompt’s hard constraint rejects deferral phrases because they become bug-factory commitments in unattended workflows; here they are not just comments, they appear in the user-facing validation output (`check-spec-file.ts:68-71`) and in the skill’s instructions about what the operator may present (`SKILL.md:80-82`).

Blast radius is low because the scope boundary is visible and intentional, and the code does not hide skipped links. The operational risk is documentation discipline: agents may normalize presenting partially unchecked specs as “green” because the deferral is built into the happy path. A reasonable fix is to replace temporal deferral phrasing with a stable capability statement, such as “non-CSS targets are reported as unchecked notes and do not establish link-liveness.”
