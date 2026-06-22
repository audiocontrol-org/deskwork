---
slug: chunked-end-govern
targetVersion: ""
---

# Audit log — chunked-end-govern

## 2026-06-22 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260622-01 — No validation that `runDir` is non-empty on zero-exit barrage

Finding-ID: AUDIT-20260622-01
Status:     fixed-d61e282d
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-runtime.ts — barrage result handling in `auditChunk`, lines ~166–185 in the new file

After `spawnText` returns exit 0 for `audit-barrage`, the code immediately assigns:

```typescript
const runDir = barrage.stdout.trim();
cfg.stderr(`govern: chunk ${chunkId} barrage run-dir = ${runDir}\n`);
reportFleetStatus(runDir, cfg.stderr);
const degraded = chunkFleetDegraded(runDir);
const rich = await extractBarrageFindings({ runDir, warn: ... });
```

There is no guard checking that `runDir` is non-empty. If the binary exits 0 without printing a path (e.g. a version mismatch that made `--output-run-dir` a no-op, a shell-level stdout redirect, or a partially-written pipe), `runDir` is `''`. The chain then proceeds: `chunkFleetDegraded('')` calls `existsSync(join('', 'INDEX.md'))` which resolves to the CWD's `INDEX.md` — likely absent, so it returns `false`, silently reporting the fleet as non-degraded. `extractBarrageFindings({ runDir: '' })` will subsequently fail with a confusing low-level filesystem error rather than a clear FATAL with an actionable message.

The blast radius is that a misconfigured or mismatched barrage binary produces a silent "no findings, fleet healthy" outcome for that chunk, allowing a run that never actually audited anything to be counted as clean. The fix is a `if (!runDir) throw new GovernProtocolError(...)` immediately after the exit-0 check, before the chain runs.

---

### AUDIT-20260622-02 — `scopeDiff` in the pipeline runtime drops all payload exclude paths

Finding-ID: AUDIT-20260622-02
Status:     fixed-d61e282d
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-runtime.ts:~178–182 (new file, `deps.scopeDiff`) cross-referenced with src/subcommands/govern.ts:~860–920 (the `makeEndGovernRuntime` call site)

In the old chunked-partition path (now deleted from `govern.ts`), the chunk scopes were built starting from `payloadPathScope` — derived from `resolveGovernExcludePaths(installation)` — ensuring that spec artifacts, contract files, and other non-implementation paths were excluded from the audited diff. `chunkScopes` inherited those exclusions.

In the new path, `buildImplementVars` is still called with `excludeRoots` and `excludePaths`:

```typescript
const { vars } = buildImplementVars(
  repoRoot, slug, flags.diffBase, flags.checkpoint,
  undefined, featureRoot, excludeRoots, excludePaths,
);
const { diff: _discardedWholeDiff, workplan_summary: planContext, ...varsBase } = vars;
```

The scoped `diff` is immediately discarded. The pipeline's `deps.scopeDiff` is then wired to:

```typescript
scopeDiff: (installationRoot, base, head) => scopeCommittedDiff(installationRoot, base, head),
```

`scopeCommittedDiff` takes no exclusion arguments and returns all changed files. Every file in the committed range — including spec documents, contract markdown, quickstart files, and anything else `resolveGovernExcludePaths` was meant to filter — now flows into the partition and is presented to the barrage as auditable implementation surface. The `specs/018-repo-release-surface/` tree that appears in this very diff is a concrete example: it would be included in a govern run's audit payload, producing findings from non-implementation spec prose that the old behavior correctly excluded.

The fix is to thread an exclude-paths argument through `EndGovernRuntimeConfig` and apply it when calling `scopeCommittedDiff` inside `auditChunk`.

---

### AUDIT-20260622-03 — `liftEndGovernFindingsOnce` throw is uncaught — process crashes after graduation record is committed

Finding-ID: AUDIT-20260622-03
Status:     fixed-96bc421f
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/govern.ts — the `liftEndGovernFindingsOnce` call, lines ~945–955 in the modified file

The implement-mode fast-exit block has this sequence:

```typescript
// 1. Write convergence record — wrapped in try/catch → exits 2 on failure.
try {
  writeWholeFeatureConvergenceRecord(repoRoot, record);
} catch (err) { /* FATAL + exit(2) */ }

// 2. Lift ONCE — NO try/catch.
await liftEndGovernFindingsOnce({ installationRoot: repoRoot, slug, ... });

// 3. Outcome check → exit(1) or exit(0).
```

If `liftEndGovernFindingsOnce` throws — which it does when `resolveFeatureRoot` returns `root === undefined`, or when `atomicWriteFile` fails — the error propagates to `runGovern`'s outer handler as an unhandled rejection. The operator sees a raw stack trace. More critically, the graduation state is now inconsistent: step 1 has already written the whole-feature convergence record (which the `governing → shipped` gate reads), but the audit log has received no lift section. If `record.outcome === 'converged'`, the gate will subsequently treat the feature as graduated on the next `govern --mode implement` invocation, even though the findings from this run were never recorded.

The fix mirrors the convergence-record write pattern: wrap `liftEndGovernFindingsOnce` in a try/catch that emits a FATAL to stderr and calls `process.exit(2)`. Whether the convergence record should also be reverted on lift failure is a design question (given it's the gate's source of truth), but at minimum the failure must surface cleanly rather than as an unhandled exception.

---

### AUDIT-20260622-04 — Audit metadata can describe a different diff than the chunks actually audited

Finding-ID: AUDIT-20260622-04
Status:     fixed-96bc421f
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/govern.ts:869-887

`base` is resolved at line 869 from `flags.diffBase`, `GOVERN_DIFF_BASE`, or `HEAD~1`, and that value is passed into `runEndGovern` at lines 903-906. But `buildImplementVars` is called with `flags.diffBase` at line 878, so when the base comes from the env var or default, the prompt metadata in `varsBase` can be built from a different base than the chunked diff actually audited.

Blast radius is high because an unattended reviewer can receive commit subjects / audit framing for one range while the pipeline audits another range. The governed record may converge over the right bytes, but the cross-model audit prompt can carry misleading context. A reasonable fix is to pass the resolved `base` into `buildImplementVars`.

## 2026-06-22 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260622-05 — Quickstart omits the P1 US9 validation surface

Finding-ID: AUDIT-20260622-05
Status:     fixed-4dfc5395
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    specs/030-chunked-end-govern/quickstart.md:1-3

`quickstart.md` still says it covers only SC-001..SC-007 and US1..US8, but the spec added US9 as P1 and SC-008..SC-010 as the dogfood-surfaced core wiring checks. The omitted checks are not secondary: the spec says US9 “IS the feature” and that without it the CLI can ship the pipeline as an unwired object (`specs/030-chunked-end-govern/spec.md:172-178`, `:266-275`).

Blast radius is high because an unattended implementer using the quickstart as the validation contract can pass every listed scenario while missing the exact regression this extension was created to prevent: `govern.ts` not driving `runEndGovern`, raw-vs-rendered sizing, and dropped coverage through trim. Add explicit quickstart scenarios for SC-008, SC-009, and SC-010.

### AUDIT-20260622-06 — Quickstart contradicts the spec on single-file over-envelope behavior

Finding-ID: AUDIT-20260622-06
Status:     fixed-4dfc5395
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    specs/030-chunked-end-govern/quickstart.md:145-149

The quickstart says `Single file > envelope` should use “hunk-level sub-split with a marker; never FATALs” (`quickstart.md:147-148`). The spec says the opposite: a single file larger than the envelope is out of scope as a graceful path, govern fails loud, and “There is no `split-file` concept” (`spec.md:192-193`). Research also says a single file over the envelope fails loud rather than hunk-splitting (`research.md:28-30`).

Blast radius is high because both readings are plausible from the artifacts, and an agent building from the quickstart could implement an explicit split-file/hunk marker path that the spec forbids. Correct the quickstart edge-case probe to match the fail-loud single-file rule, and keep cluster sub-splitting limited to multi-file oversized clusters.

### AUDIT-20260622-07 — Seam pass misses multi-line exported function signatures

Finding-ID: AUDIT-20260622-07
Status:     migrated-to-backlog TASK-426
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/seam-pass.ts:113-130

`parseExports` only parses one diff line at a time, and `FN_HEAD` only matches when `export function name(` is on that same line. Real TypeScript exports commonly span multiple lines, e.g. `export function foo(\n  a: A,\n  required: B\n): C`. In that shape, neither the removed nor added signature line contains a complete parameter list, so required-arity changes can be skipped entirely.

This matters because the seam pass is the final contract-break backstop before writing a converged whole-feature record. A downstream feature can remove or add a required parameter in a multi-line exported function consumed across chunks, and `runSeamPass` can still report no finding. A reasonable fix is to parse export signatures across contiguous diff lines, or use a TypeScript-aware parser over the post/pre signature text rather than line regexes.

### AUDIT-20260622-08 — Seam pass only detects consumers that changed in the diff

Finding-ID: AUDIT-20260622-08
Status:     migrated-to-backlog TASK-427
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/seam-pass.ts:166-178, src/govern/seam-pass.ts:195-197

`chunkText` is built from `input.fileDiffs` only, and `consumedInOtherChunk` searches only that diff text. If chunk A removes an exported symbol and an unchanged file in another chunk still imports or calls it, that consumer is absent from the diff text, so `consumed` is false and the removed export is suppressed.

That is a correctness hole in the seam-pass contract: removed exports most often break unchanged consumers. Because `end-govern-pipeline` treats `openFindings.length === 0 && seamResult.findings.length === 0` as `converged`, this can graduate a feature with a real cross-boundary compile/runtime break. The fix should use the coupling/import graph or current source content for other chunks’ files, not only added/context diff lines.

### AUDIT-20260622-09 — Old-format convergence record written in advance-gate-enforcement test

Finding-ID: AUDIT-20260622-09
Status:     acknowledged-false-premise-20260622 (verified: all cited tests pass; chunker split the test from its implementing source — see TASK-430)
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/workflow/advance-gate-enforcement.test.ts:62-76

The test that verifies "once a converged whole-feature record exists, the item graduates to shipped" writes a `GovernConvergenceRecord` (old schema) to the convergence path using `f.base.writeRecord` with `scopeFingerprint`, `converged: true`, and `recordedAt` fields. None of these fields exist in `WholeFeatureConvergenceRecord`; that schema requires `governedShaBase`, `headSha`, `chunkIds`, `rounds`, `liftedFindings`, `closedInLoopFindings`, `seamResult`, `splitClusterRefs`, `outcome`, and `anchorRoot`.

`isImplFeatureConverged` (chunk-artifacts.ts:292) reads the path and runs `validateWholeFeatureConvergenceRecord`, which requires `governedShaBase` as a string. The old-format record lacks it, so `reqString` throws and the catch block returns `false`. The graduate gate stays closed. `workflow status` therefore cannot report `phase: shipped`; the assertion at the last two lines of the test block fails.

The correct pattern for the new schema is shown in `gate-reads-pipeline-record.test.ts:30-50`, which calls `writeWholeFeatureConvergenceRecord(f.root, wholeRecord(convergenceKeyFor(item), f.root))` with all required fields populated. The `advance-gate-enforcement` test needs the same treatment: construct a full `WholeFeatureConvergenceRecord` via `writeWholeFeatureConvergenceRecord`, not the legacy `f.base.writeRecord` with old fields. Note also that the old test called `runCli(['workflow', 'advance', ITEM, '--apply'])` to perform the state transition before checking `status`; the new test omits that call. If `workflow status` reports only the recorded state (not re-evaluates gates), the test is also missing that transition step.

---

### AUDIT-20260622-10 — Degraded chunk barrages can still produce a converged record

Finding-ID: AUDIT-20260622-10
Status:     fixed-ee8ce7fc
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/end-govern-runtime.ts:217-238; src/govern/end-govern-pipeline.ts:119-123,187-188

`auditChunk` computes `degraded` from the barrage run directory and returns it with the findings, but `runEndGovern` discards that field when flattening audit results. If every degraded chunk returns zero HIGH findings, `openFindings.length === 0`, the loop breaks, and the record outcome becomes `converged`.

That violates the feature’s own fleet-degradation pricing: a quiet round from fewer lanes is not equivalent to full cross-model convergence. Blast radius is high because the durable `WholeFeatureConvergenceRecord` is the gate signal; an adopter can graduate work based on a weakened audit without any terminal state or record field indicating the fleet was degraded. A reasonable fix is to aggregate per-chunk degradation and prevent `converged` unless every audited chunk met the required fleet, or persist/surface a non-converged degraded outcome.

### AUDIT-20260622-11 — Render fitting can return an over-envelope chunk after removing every diff

Finding-ID: AUDIT-20260622-11
Status:     fixed-ee8ce7fc
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/cluster-payload/render-fit.ts:47-55; src/govern/payload-chunk.ts:31-37

`fitChunk` removes audited files into `coverageOnlyFiles` until `bodyBytes(current) <= envelopeBytes`, but if the irreducible body itself is too large, the loop exhausts `auditedBySize` and still returns `{ ...current, renderedBytes: fittedBytes }` without checking the postcondition. The irreducible body includes the chunk header and the full manifest of all other chunks’ file lists, so a large feature with many paths can exceed the envelope even after every diff body is withheld.

That breaks FR-027/SC-009’s core guarantee: no chunk renders over-envelope. Blast radius is high because govern can still run the barrage on an oversized payload, or mark most/all files coverage-only while preserving a false “fitted” record. A reasonable fix is to fail loud or repartition/compact the manifest when the non-diff body cannot fit, and add a final `renderedBytes <= envelopeBytes` invariant check.

### AUDIT-20260622-12 — Committed failing test: T075 standard-diff format for untracked fold

Finding-ID: AUDIT-20260622-12
Status:     acknowledged-false-premise-20260622 (verified: 14/14 tests pass; fix lives in sibling chunk a689a8ac — see TASK-430)
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/__tests__/govern/payload-diff-scope.test.ts (the T075 `it(...)` block)

The test labeled `T075 (FR-030)` in `payload-diff-scope.test.ts` contains this explicit statement in its header comment: *"This asserts the standard-diff shape (a `@@` hunk header and a `+++ ` file header), which FAILS today."* The test then unconditionally asserts `folded` contains `^@@ .* @@` and `^\+\+\+ ` — format markers that the comment describes as absent in the current implementation (which prefixes each content line with `+` and emits no hunk structure). T075 is task-numbered within US9 (T069–T083), which the commit `chore(030-chunked-end-govern): mark US9 tasks T069-T083 complete` declares complete. However, none of the fix commits in the audited range describe changing the untracked-fold format: the US9 dogfood fixes (`-01`/`-02` runtime scope + run-dir guard; `-03`/`-04` lift-failure diagnostic + base single-source) address distinct issues. The source file `src/govern/payload-diff-scope.ts` is in a separate chunk (a689a8ac) not visible here, so the fix may exist — but no commit subject names it. If the fix is absent, this test is currently failing, which means the test suite is broken and the tasks.md "complete" marker is inaccurate. Blast radius: a failing test suite silently undermines the gate that is supposed to protect graduation. A quick check is to assert the tasks.md T075 row is checked AND that the `payload-diff-scope.ts` source produces `diff --git` headers for the untracked fold.

---

### AUDIT-20260622-13 — Committed failing test: T071 rendered-byte sizing second case

Finding-ID: AUDIT-20260622-13
Status:     acknowledged-false-premise-20260622 (verified: tests pass; T078 rendered-byte sizing landed — see TASK-430)
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern/rendered-byte-sizing.test.ts (second `it(...)` block)

`rendered-byte-sizing.test.ts` contains two tests. The second — "every chunk renders within the envelope (rendered bytes ≤ envelope)" — explicitly states: *"FAILS today — partition sizes on RAW diff bytes, ignoring the rendered preamble + per-file framing + manifest, so this chunk renders too large"* and *"the T078 fix — NOT implemented here."* The test uses ENVELOPE=300 bytes and a PLAN_CONTEXT of ~280 bytes (`'p'.repeat(220)` + header), so each chunk's rendered payload is already ≥ 520 bytes before the file diff is appended. For this test to pass, T078 must change partition sizing to account for rendered overhead. T078 is within the T069–T083 range marked complete, but — critically — if `binpackClusters` in `cluster-payload/envelope-binpack.ts` (chunk a689a8ac) was not updated to measure rendered bytes, the test fails. Additionally, once rendered-byte sizing is active, each singleton file cluster would render over-envelope, triggering the fail-loud path in `binpackClusters` ("a single file alone exceeds the envelope") — which would make the test assertion `toBeLessThanOrEqual(ENVELOPE)` unreachable in a different way. This suggests T071 and T078 may require a design resolution not yet visible in the diff. Blast radius: same as AUDIT-BARRAGE-claude-01 — a failing test suite invalidates the gate.

---

### AUDIT-20260622-14 — Other-feature scaffolds are no longer excluded from the implement payload

Finding-ID: AUDIT-20260622-14
Status:     migrated-to-backlog TASK-428
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern-payload-self-reference.test.ts:81-127 (deleted), src/__tests__/govern/payload-diff-scope.test.ts:203-213

The deleted self-reference test explicitly required the untracked fold to exclude files under other feature roots, including `specs/002-unrelated/scaffold.md`, while still keeping the audited feature’s own evidence. The replacement test only asserts that `resolveImplementExclusion` excludes `specs/029-other/audit-log.md`, not the other feature root itself.

That changes the behavioral contract: unrelated parked feature scaffolds can enter the chunked audit payload, recreating the old false-finding generator where models audit prose or scaffold content for a different feature. The blast radius is high because an adopter with multiple in-progress features can get findings against surfaces outside the governed feature and then act on the wrong work. The exclusion test should pin whole other-feature roots for untracked/non-audit payload scope, with audit-log exclusion remaining a subset of that rule rather than the whole rule.

### AUDIT-20260622-15 — Rename-aware committed diff coverage was deleted and not replaced

Finding-ID: AUDIT-20260622-15
Status:     migrated-to-backlog TASK-429
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern/govern-rename-scope.test.ts:1-56 (deleted)

The deleted test guarded a load-bearing payload invariant: a pure tree move must be emitted as a rename, independent of the operator’s `diff.renames` config, so unchanged file bodies are not shipped as a full delete plus full add. The new `payload-diff-scope` tests cover subdirectory installs, non-ASCII paths, and untracked diff shape, but there is no replacement for forced rename detection.

This is high blast radius because the chunker sizes and audits whatever per-file diff it receives. If a large unchanged file is moved and Git rename detection is disabled, the pipeline can measure and audit a doubled body instead of a small rename header, producing oversized chunks or irrelevant findings against unchanged content. A replacement test should exercise `scopeCommittedDiff` on a `git mv` with `diff.renames=false` and require rename headers without added/deleted body hunks.

### AUDIT-20260622-16 — `findGrammarComments` still drops the new fence closeability contract

Finding-ID: AUDIT-20260622-16
Status:     fixed-ee8ce7fc
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    `src/document-model/chrome.ts:45-46`, `src/document-model/chrome.ts:88-100`

`fenceDelimiter` now returns `{ char, length, closeable }`, and its contract says callers tracking fence state must require all three fields for a valid close. But `findGrammarComments` still calls `fenceDelimiterChar` at lines 94-99, which erases both `length` and `closeable`. That means an in-fence line like ```` ```typescript ```` still closes the grammar-comment scanner’s fence state, even though the new parser correctly marks it `closeable: false`.

The blast radius is high because this is another document-model scanner, not a cosmetic helper: a documented `<!-- doc-grammar: ... -->` example after an in-fence info-string line can be misread as a real embedded grammar declaration. A downstream user can hit false ambiguity or false grammar selection while the roadmap rewrite tests pass, because the new fixture only exercises `rewriteEdgeLine`.

A reasonable fix is to make `findGrammarComments` track the same `{ char, length }` open-fence state used by `rewriteEdgeLine` and only close when `fence.char === openFence.char && fence.length >= openFence.length && fence.closeable`. Add a grammar-detection fixture mirroring `tests/roadmap/rewrite-fence-aware.test.ts:68-84` so the shared contract is pinned on both consumers.

## 2026-06-22 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260622-17 — `degraded-fleet-surfaced` terminal outcome appears in quickstart.md but is absent from the data model and CLI contract

Finding-ID: AUDIT-20260622-17 (claude-01 + claude-04 + claude-06 + codex-01; cross-model)
Status:     fixed-50ef7947
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    specs/030-chunked-end-govern/quickstart.md (Edge-case probes section)

The quickstart's "Lane outage mid-run" edge-case probe states: "the run does NOT fabricate a clean result — a clean-but-degraded final round reconciles to `degraded-fleet-surfaced` (a non-converged terminal), never `converged` (AUDIT-20260622-10)."

`degraded-fleet-surfaced` does not appear in any of the following:
- The `WholeFeatureConvergenceRecord.outcome` discriminated union in `data-model.md`: `'converged' | 'override-eligible' | 'round-cap-surfaced' | 'fix-failure-surfaced' | 'unresolvable-merge-surfaced'`
- The terminal outcomes table in `contracts/govern-cli.md`
- The formal `outcome` field in `spec.md`'s Key Entities description or the FR set

The blast-radius is that an implementer building `end-govern-pipeline.ts` will write a `WholeFeatureConvergenceRecord` with the five defined outcome values and will have no valid bucket for the lane-outage case. The quickstart promises a specific terminal (`degraded-fleet-surfaced`) that no schema supports. Two wrong outcomes are then possible: (a) the run is recorded as `override-eligible` (the most natural fallback), but the quickstart says it should NOT converge — and `override-eligible` still allows `--override` graduation, which the quickstart implies should not happen on a degraded fleet; (b) the implementation adds a sixth outcome type not specified in the contract, causing the doctor rule (FR-021) to reject the record.

The spec also says under US5: "a lane outage degrades that round per existing fleet-degradation behavior; the run does not fabricate a clean result" — but what the terminal outcome IS in that case is never stated in the FRs or data model. This is a specification hole, not merely a quickstart typo. A reasonable fix: add `'degraded-fleet-not-converged'` (or similar) to the `WholeFeatureConvergenceRecord.outcome` union and the CLI contract terminal-outcomes table, or explicitly state that lane outage maps to `override-eligible` with a degraded-fleet notation.

---

### AUDIT-20260622-18 — Implement override writes the retired record shape, so a green override does not open the impl gate

Finding-ID: AUDIT-20260622-18
Status:     fixed-3ddb66cc
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/override-graduate.ts:53-65; src/govern/chunk-artifacts.ts:298-305; src/workflow/workflow-context.ts:41-47

`maybeOverrideGraduate` routes both spec and implement overrides through `recordOverrideGraduation`, which writes via `recordGovernConvergence` at `override-graduate.ts:58-65`. That is the retired `GovernConvergenceRecord` shape. But the clean-break impl gate now reads `isImplFeatureConverged` (`workflow-context.ts:41-47`), which validates the file as a `WholeFeatureConvergenceRecord` and returns false for foreign-shaped records (`chunk-artifacts.ts:298-305`).

Blast radius: an operator can run `stackctl govern --mode implement --override ...`, see exit 0 plus `terminal-outcome=graduated`, but `governing -> shipped` remains closed because the durable record is unreadable by the new gate. That reintroduces the exact CLI-success/durable-gate divergence the override path comments say it prevents. A reasonable fix is to make implement-mode override write the new whole-feature record shape with an override/accepted outcome the gate intentionally recognizes, or reject implement overrides until that shape exists.

### AUDIT-20260622-19 — Seam pass declares required-shape detection but never implements it

Finding-ID: AUDIT-20260622-19
Status:     migrated-to-backlog TASK-431
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/seam-pass.ts:113-131; src/govern/seam-pass.ts:187-197; src/govern/chunk-artifacts.ts:77-83

The public seam finding schema includes `changed-required-shape` (`chunk-artifacts.ts:77-83`), and the seam-pass comments/spec say changed required shapes are substantive cross-boundary breaks. The implementation only parses exported function required-arity and declaration names (`seam-pass.ts:113-131`), then only emits `removed-export` or `changed-arity` (`seam-pass.ts:187-197`). For `export interface Options` or `export type Options = ...` changing from `{ a?: string }` to `{ a: string }`, both sides are parsed as `null`; the code treats that as a compatible touched signature and suppresses it.

Blast radius: a chunk can add a new required object field consumed from another chunk, and the final seam backstop can still produce no findings, allowing a `converged` whole-feature record for a cross-boundary contract break. The fix should either implement required-shape comparison for exported interfaces/types or remove that promised finding kind from the contract and schema so downstream consumers do not rely on nonexistent coverage.

### AUDIT-20260622-20 — Wrong variable name in `govern-orchestration.test.ts` ROADMAP.md fixture

Finding-ID: AUDIT-20260622-20
Status:     acknowledged-false-premise-20260622 (verified: makeRepo defines `const repo = mkdtempSync(...)` at line 72 as the temp root and `dir` as the feature subdir; join(repo, ROADMAP.md) is correct — barrage misread the scoping; full suite green)
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern-orchestration.test.ts (the `makeRepo` function, around the newly-added `writeFileSync(join(repo, 'ROADMAP.md'), ...)` block)

Inside `makeRepo(slug: string): string`, the temp directory created by `mkdtempSync` is bound to the local name `dir` — the unchanged existing code uses `join(dir, 'audit-log.md')` consistently. The new 030 US9 ROADMAP.md write, however, references `repo` rather than `dir`. `repo` is not declared anywhere in `makeRepo`; it would resolve either to a module-level or outer-scope variable (if one happens to exist with that name), or produce a ReferenceError. Either outcome is wrong: the roadmap fixture would land in the wrong directory (outside the temp repo) or the write would throw. The symptom at test-run time would be `resolveConvergenceItem` fatalling with exit 2 — making the orchestration tests fail for the wrong reason, or silently passing because `repo` happens to point at a previously-created temp dir from another test. The correct expression is `join(dir, 'ROADMAP.md')`. The same variable mismatch does NOT appear in `govern-terminal-outcomes.test.ts` (where `makeRepo` uses `repo` for its temp dir throughout), so this is an isolated copy-paste error in the orchestration file.

---

### AUDIT-20260622-21 — `render-fit-over-envelope.test.ts` verifies truncation using the untruncated manifest

Finding-ID: AUDIT-20260622-21
Status:     fixed-50ef7947
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/__tests__/govern/render-fit-over-envelope.test.ts:33–43 ("truncates a large manifest (elastic context) to fit rather than failing loud")

The test calls `fitRenderedChunks([chunk], [bigManifest], diffs, envelope)` and then immediately calls `renderedByteLength({ chunk: fitted, manifest: bigManifest, ... })` — passing the **original, untruncated** `bigManifest` (20 other-chunks, each with two long path strings, well over the 120-byte envelope). If `fitRenderedChunks` creates a new truncated manifest object rather than mutating `bigManifest` in place (the expected behavior for a pure function — and the only API-sound behavior given the function returns `Chunk[]` not `Chunk[] + ChunkManifest[]`), then `renderedByteLength` with the original manifest would produce a size far larger than 120, and the assertion `expect(rendered).toBeLessThanOrEqual(envelope)` would FAIL. The only way this assertion can pass is if `fitRenderedChunks` mutates `bigManifest.otherChunks` in-place as a side effect. Such mutation is a surprising contract, is not documented in the comment, and would mean callers cannot safely hold references to manifests across a `fitRenderedChunks` call. The test appears to be verifying its desired invariant through an accidental implementation side-effect rather than through the returned surface. If the implementation is later changed to return truncated manifests (the more composable design), this test would silently start measuring the wrong thing and could pass even on a broken implementation. The fix is to destructure the returned manifests (or re-query via a `getManifest(fitted.id)` helper) and pass the fitted manifest to `renderedByteLength`.

---

### AUDIT-20260622-22 — CLI pipeline wiring test can pass on imports instead of actual wiring

Finding-ID: AUDIT-20260622-22
Status:     migrated-to-backlog TASK-432
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern/cli-drives-pipeline.test.ts:36-46

The new ship-gate test claims to prove that implement-mode “drives the pipeline” and persists the whole-feature convergence record, but it only concatenates source text and searches for `runEndGovern(` / `writeWholeFeatureConvergenceRecord(`. The persistence assertion is especially weak: an import, helper, dead branch, or unrelated mode path can satisfy the regex without proving the implement CLI path writes the record after the pipeline returns.

Blast radius is high because this is the core US9 integration gate. A downstream change could leave the CLI unwired or move the call outside the implement path while this test still passes. A reasonable fix is to make this behavioral: run `govern --mode implement` against a fixture and assert exactly one whole-feature convergence record is written and that the stubbed barrage path is reached through `runEndGovern`.

### AUDIT-20260622-23 — Empty chunk set can graduate without any audit

Finding-ID: AUDIT-20260622-23
Status:     fixed-3ddb66cc
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/end-govern-pipeline.ts:98-129, src/govern/end-govern-pipeline.ts:196-204

`runEndGovern` partitions the scoped diff, but it never rejects an empty `scope.files` / empty `partition.chunks` result. When there are no chunks, `auditIds` is empty, `toAudit` is empty, `openFindings` stays empty, and the loop breaks as clean. The final outcome logic then treats `openFindings.length === 0 && seamResult.findings.length === 0` as `converged`.

That means a bad diff base, an exclusion filter that removes the whole surface, or a feature with no scoped files can write a converged whole-feature record without firing any barrage at all. Blast radius is high because the workflow gate now trusts this record as the single implementation graduation signal. A reasonable fix is to fail loud before the audit loop when the scoped diff or partitioned chunk set is empty, with an error naming the base/head and any exclusions applied.

## 2026-06-22 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260622-24 — `GOVERN_CHECKPOINT` / `--checkpoint` contradiction: contract says removed globally, FR-029 says spec mode retains it, quickstart grep expects zero hits

Finding-ID: AUDIT-20260622-24 (claude-01 + codex-02 + codex-03; cross-model)
Status:     migrated-to-backlog TASK-433
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    specs/030-chunked-end-govern/contracts/govern-cli.md (flags table, `--checkpoint`/`GOVERN_CHECKPOINT` row) + specs/030-chunked-end-govern/spec.md (FR-029) + specs/030-chunked-end-govern/quickstart.md (Scenario 4 grep command)

Three documents in this diff disagree about whether `GOVERN_CHECKPOINT`/`--checkpoint` survive in spec mode.

**`contracts/govern-cli.md` flags table:**
> `--checkpoint` / `GOVERN_CHECKPOINT` | **REMOVED** | unknown flag / ignored-then-error var — no per-phase checkpoint path exists (FR-017, TASK-125).

No mode qualifier. An agent reading this table understands both flags/vars are gone globally.

**`spec.md` FR-029:**
> `GOVERN_CHECKPOINT` / `--checkpoint` rejection MUST be implement-mode-scoped — spec mode retains its checkpoint-label selection; only implement mode rejects them.

Explicitly says spec mode keeps it.

**`quickstart.md` Scenario 4 grep:**
```
grep -rn "GOVERN_CHECKPOINT\|--checkpoint" src/   # expect: zero hits
```
Expects zero hits globally across `src/`, which contradicts FR-029 (if spec mode retains the variable, there would be hits in spec-mode paths).

The contract's `Synopsis` shows `--mode implement` and says spec mode is "separate/parked," so the contract may intend to cover implement mode only — but the flags table does not say so. An agent reading just the contract removes `GOVERN_CHECKPOINT` globally; an agent reading FR-029 keeps it for spec mode; an agent writing the quickstart test verifies zero global hits (validating the contract interpretation, not FR-029). Any one of the three is a plausible authoritative source. The most dangerous reading is the contract's, because it would cause spec-mode checkpoint-label selection to silently break and there is no test that would catch it (Scenario 4's grep passes, but spec-mode behavior is unreachable by that grep). A reasonable fix: either add a "scope: implement mode only" note to the govern-cli.md flags table and update the quickstart grep to exclude spec-mode paths, or update FR-029 to state that `GOVERN_CHECKPOINT` is removed from both modes.

---

### AUDIT-20260622-25 — Spec 018 artifacts committed into the 030 govern scope with all tasks unchecked

Finding-ID: AUDIT-20260622-25
Status:     acknowledged-resolved-20260622 (specs/018-repo-release-surface moved to _holding, out of the govern untracked-fold; provenance triage tracked separately)
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    specs/018-repo-release-surface/ (entire new directory — 9 files added in this diff)

Nine new files for a separate, unrelated feature (`018-repo-release-surface` — "repo-owned maintainer release surface") appear in this diff. The development notes for the session explicitly acknowledge this:

> the untracked `specs/018-repo-release-surface/` is unrelated and still needs provenance triage.

All 28 tasks in `specs/018-repo-release-surface/tasks.md` are unchecked (`[ ]`). No implementation commits for this feature appear in the commit subjects in scope.

The concrete problem: when the 030 whole-feature govern-at-end barrage fires over `governedSha..HEAD`, the committed diff includes these 018 spec files. Auditors receive a partial release-surface spec alongside governance-pipeline code. They may:
1. Flag incomplete implementation (all 018 tasks unchecked, no code changes matching them)
2. Surface "release authority" findings that are irrelevant to the chunked-govern feature
3. Block 030's graduation on HIGH findings that belong to 018

The 030 govern barrage is supposed to be the "ultimate dogfood of 030's own chunked end-govern pipeline" per the dev notes. Polluting its audit scope with an unrelated, unimplemented spec artificially inflates findings, undermines the scope-correctness guarantee FR-004 depends on (deterministic scope), and risks a blocked outcome for the wrong reasons. A reasonable fix: exclude `specs/018-repo-release-surface/` via `--exclude-paths` when running the govern barrage, or move/defer these files out of the committed diff before governing 030.

---

### AUDIT-20260622-26 — Autonomous fix-fanout is still promised after being explicitly scoped out

Finding-ID: AUDIT-20260622-26
Status:     migrated-to-backlog TASK-434
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    specs/030-chunked-end-govern/spec.md:27, specs/030-chunked-end-govern/spec.md:111-119, specs/030-chunked-end-govern/spec.md:218-219, specs/030-chunked-end-govern/contracts/fix-fanout.md:3-25, DEVELOPMENT-NOTES.md:193-196

The spec and contract still define autonomous fix execution as delivered behavior: govern “applies fixes in worktrees, commits to the feature branch, and re-audits unattended” and FR-009 says govern “MUST fix findings” via worktree-isolated subagents. The fix-fanout contract likewise says it applies findings, allocates worktrees, dispatches fix-subagents, and merges the results. But the same audited range’s journal records the opposite: “FR-009’s autonomous fix backend is entirely unbuilt” and the operator-scoped outcome was “agent-in-the-loop fix (`govern` audits → surfaces `override-eligible` → driving agent fixes → re-govern; `applyFixes` undefined), and DEFER FR-009.”

Blast radius is high because a downstream agent or maintainer acting on the current spec/contract will believe `stackctl govern --mode implement` can mutate worktrees and commit fixes unattended. If the implementation is actually audit-only / agent-in-the-loop, that consumer will design tests, recovery flows, and operator expectations around a capability that does not exist. A reasonable fix is to make the docs honest in one direction: either restore/build the autonomous backend to satisfy FR-009, or change the spec/contract/execute prose to state the current agent-in-the-loop contract and remove the autonomous apply+commit requirements from this feature.

### AUDIT-20260622-27 — Default diff base falls back to `HEAD~1` when only `origin/main` exists

Finding-ID: AUDIT-20260622-27
Status:     migrated-to-backlog TASK-435
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/payload-diff-scope.ts:146-174

`resolveDefaultBranch` tries `origin/HEAD`, then local `main`, then local `master`, but never checks `origin/main` or `origin/master` directly. In a common CI/worktree shape where `origin/HEAD` is not configured and the feature branch is checked out without a local `main`, `resolveImplementDiffBase` falls through to `HEAD~1` at lines 173-174. That reopens the exact under-scope failure this feature is meant to close: bare implement govern audits only the last commit instead of the whole feature span.

Blast radius is high because an unattended consumer running the documented default can get a green or blocked result over the wrong diff range. Fix by resolving remote default refs explicitly, or fail loud when no feature fork point can be established instead of silently using `HEAD~1`.

### AUDIT-20260622-28 — Untracked fold lost the binary and byte-budget safeguards

Finding-ID: AUDIT-20260622-28
Status:     migrated-to-backlog TASK-436
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/payload-diff-scope.ts:210-213

The new `scopeCommittedDiff` folds every untracked, non-ignored file with `git diff --no-index` and no binary check, file-size check, or aggregate budget. The deleted assembler had explicit binary/empty skipping and a soft byte budget; this replacement now allows a large generated text file or accidental local artifact to enter the audit payload unbounded.

Blast radius is high because implement govern can ship unexpectedly huge local content into the model fleet, or blow the envelope before chunking decisions are meaningful. Fix by restoring the prior fold constraints in this new scoping primitive: skip binary/empty files, enforce a total folded-byte budget, and surface every skip in the runtime diagnostics.

### AUDIT-20260622-29 — Doctor accepts empty or missing chunk-set fields as valid

Finding-ID: AUDIT-20260622-29
Status:     migrated-to-backlog TASK-437
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/scope-discovery/doctor-rules/chunked-govern-artifacts.ts:65-70

The doctor rule claims to catch malformed or missing-field chunk artifacts, but it defaults absent `chunks` and `splitClusterMarkers` to `[]`. A chunk-set JSON object like `{}` passes with no finding because both arrays become empty and no validator is called. That contradicts the rule’s stated purpose at lines 4-8 and lets a structurally incomplete chunk-set be trusted as clean.

Blast radius is high because the new gate depends on these artifacts being trustworthy; doctor can report clean while the persisted chunk-set has no usable chunk inventory. Fix by validating the top-level chunk-set shape before iterating, and emit an error when required arrays are absent or not arrays.

### AUDIT-20260622-30 — Seam arity check treats required function-typed params as optional

Finding-ID: AUDIT-20260622-30
Status:     migrated-to-backlog TASK-438
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/seam-pass.ts:105-110

`countRequired` classifies a parameter as non-required whenever the raw parameter text contains `=`, but TypeScript function types contain `=>`. A newly added required callback parameter like `cb: () => void` includes `=`, so the seam pass does not count it as required. That means a cross-chunk export can gain a required callback and avoid the `changed-arity` finding even when another chunk consumes it.

Blast radius is high because the seam pass is the backstop for cross-chunk interface breakage after chunked audits split the diff. Fix by detecting default assignment only at top-level parameter syntax, not by searching for `=` anywhere inside the parameter type.

### AUDIT-20260622-31 — Fix-succeeds-but-changes-nothing path silently converges with open findings

Finding-ID: AUDIT-20260622-31
Status:     migrated-to-backlog TASK-439
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unreachable, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-pipeline.ts:190-200

In `runEndGovern`, after `applyFixes` completes, `computeTouchedSet` maps `fix.changedFiles` to chunk IDs. When that touched set is empty — most concretely when the fix backend returns a successful (non-failing) `FixRoundResult` with `changedFiles: []` — `nextAuditIds` is empty and the code sets `openFindings = []` and breaks:

```ts
if (nextAuditIds.length === 0) {
  openFindings = []; // fixes touched nothing re-auditable → loop is complete
  break;
}
```

After the break, reconciliation treats everything in `raisedById` as closed-in-loop (`stillOpenIds` is the empty set), and the outcome computes to `converged` (assuming no seam findings and no degraded fleet). A finding that was never fixed becomes `closedInLoopFindings` and the pipeline writes a converged `WholeFeatureConvergenceRecord` to disk, opening the graduate gate.

The autonomous fix backend (`applyFixes`) is intentionally absent in the current build (TASK-424 deferred), so this code path is unreachable today. But it is not guarded, and the contract of `FixRoundResult` does not prohibit a succeeding outcome with empty `changedFiles`. When a real fix agent says "done" but touches no files — a plausible condition when findings are disputed, already addressed in a prior commit, or when a merge serialization race wins — the pipeline silently graduates with unresolved findings. The graduate gate, the audit-log lift section, and the operator are all misled.

A concrete fix: distinguish `nextAuditIds.length === 0` when `fix.changedFiles` is empty (a no-op fix that should surface as a failure or at least keep `openFindings` at its pre-break state) from the case where a fix created genuinely no re-auditable surface. The latter should be rare and probably also deserves an explicit `fix-failure-surfaced` outcome, not silent convergence.

---

### AUDIT-20260622-32 — Seam findings block the run but are never lifted

Finding-ID: AUDIT-20260622-32
Status:     migrated-to-backlog TASK-440
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-pipeline.ts:193-217, src/govern/govern-arms.ts:312-345

`runEndGovern` computes `seamResult` after the audit loop and correctly uses `seamResult.findings.length` to prevent convergence. But `liftedFindings` is built only from `openFindings`, which are chunk-audit findings, not seam findings. The CLI then lifts only `runtime.liftedRich(record.liftedFindings.map(...))` and reports `record.liftedFindings.length` as the open finding count.

So a seam-only break produces `override-eligible` with zero lifted findings, no audit-log entry to act on, and a misleading “0 open finding(s)” message. Blast radius is high: a real cross-chunk contract break blocks graduation but is not surfaced through the operator’s normal remediation channel. A reasonable fix is to reconcile seam findings into a liftable finding stream, or provide an equivalent persisted/lifted seam finding section that the CLI count and audit-log recording include.

### AUDIT-20260622-33 — Degraded clean chunks can be laundered by a later touched-set re-audit

Finding-ID: AUDIT-20260622-33
Status:     fixed-9b01a661
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=yes; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-pipeline.ts:135-217

`lastAuditDegraded` is overwritten on every round from only the chunks audited in that round. In a multi-round run, round 1 may audit all chunks and get a clean-but-degraded result for chunk B, then a finding in chunk A triggers a fix. Round 2 audits only touched chunk A; if A is clean and non-degraded, `lastAuditDegraded` becomes false and the final `cleanFinalState` can reconcile to `converged`.

That violates the fleet-degradation pricing control for carried clean chunks: chunk B’s only evidence was degraded, but the final record treats it as full convergence because B was not re-audited. Blast radius is high because this can open the graduate gate on a whole-feature record whose clean state depends on weakened audit evidence. Track degradation per chunk across the currently accepted final evidence, or force any degraded clean chunk to be re-audited before convergence.

### AUDIT-20260622-34 — Outer-tree payload leak invariant not explicitly tested in the new suite

Finding-ID: AUDIT-20260622-34
Status:     migrated-to-backlog TASK-441
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern-installation-anchor.test.ts (deleted), src/__tests__/govern/payload-diff-scope.test.ts

The deleted `govern-installation-anchor.test.ts` contained the most direct assertion that outer-tree content cannot leak into the barrage payload. Specifically, it committed `OUTER-LEAK-CANARY.txt` in the outer git root (outside the installation subtree), ran a full `stackctl govern` end-to-end with `STUB_VARS_COPY` capturing the rendered vars, and asserted `expect(vars).not.toContain('OUTER-LEAK-CANARY')`. This is a READ-side invariant: outer-tree diff content must not flow into what gets sent to AI models.

The updated `govern-anchor-unification-021.test.ts` checks the WRITE side — "outer tree byte-identical after the full run" — which proves nothing wrote to the outer tree, but says nothing about whether outer-tree content was read into the payload. The new `payload-diff-scope.test.ts` tests that a subdir installation resolves per-file diffs correctly but never adds an outer-tree changed file and asserts its absence from the `DiffScope.files` / `DiffScope.fileDiffs`. No test in this chunk reproduces the original READ-side leak assertion.

Blast-radius: if `scopeCommittedDiff(installationRoot, base, head)` is not correctly scoped to the installation subtree, committed or untracked files from the outer git repo (potentially containing sensitive unrelated content) would be sent to every AI model in the fleet on every govern run. A reasonable fix: add one test to `payload-diff-scope.test.ts` that commits a file in the outer repo (not under the installation subdir), runs `scopeCommittedDiff(installationRoot, base, head)`, and asserts the outer-tree file does not appear in `scope.files`.

---

### AUDIT-20260622-35 — Other-feature scaffolds are no longer excluded from implement audits

Finding-ID: AUDIT-20260622-35
Status:     migrated-to-backlog TASK-428 (duplicate of AUDIT-20260622-14)
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/govern/payload-diff-scope.test.ts:202-214

The replacement exclusion test only asserts that `specs/029-other/audit-log.md` is excluded. That locks in a narrower invariant than the retired self-reference tests: unrelated feature roots themselves are no longer kept out of the implement payload, only their audit logs are. In the implementation this corresponds to `otherFeatureRels.map((root) => \`${root}/audit-log.md\`)`, so `specs/029-other/spec.md`, contracts, notes, or untracked scaffolding can still enter the chunked audit.

Blast radius is high because an adopter with multiple in-progress features can have the current feature’s govern run audit and report findings against a different feature’s parked docs/code. An unattended agent could then “fix” unrelated surfaces or block the wrong feature. The repair is to restore a tested invariant for other feature roots: either exclude the whole other-feature root from the scoped diff, or explicitly prove why only audit logs are safe with a fixture containing a non-audit file under another feature.
