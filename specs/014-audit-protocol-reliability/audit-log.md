---
slug: audit-protocol-reliability
targetVersion: ""
---

# Audit log — audit-protocol-reliability

## 2026-06-11 — audit-barrage lift (20260611T023720982Z-audit-protocol-reliability-after_clarify)

### AUDIT-20260611-01 — US5 untracked-fold scoping silently drops newly-added untracked source files from the audited payload

Finding-ID: AUDIT-20260611-01
Status:     fixed-378ac17c
Severity:   high
Surface:    plugins/stack-control/src/govern/payload-implement.ts:162-170 (filter), src/subcommands/govern.ts:338-342, src/__tests__/govern-payload-self-reference.test.ts:84-107

The untracked fold exists per AUDIT-20260605-01 "so newly-added work is audited too" (payload-implement.ts:152). The new FR-008 filter scopes the fold to files under the **feature root** — which is the spec/docs directory (`specs/<NNN>-<slug>/`), not the feature's code. With `featureRel` set (now the normal govern path), any untracked source file — a brand-new `src/foo.ts` not yet committed — is silently dropped from the payload. The drop is invisible: binary skips and budget skips each emit a `warn(...)` line and land in `skippedBinary`/`skippedOverBudget` (lines 172-192), but the scope filter at 166-170 emits nothing and appears in no ledger. The recorded defect was sweeping *unrelated features' scaffolds*; the fix also excludes the *audited feature's own uncommitted code*, which is exactly the case the fold was added for.

Blast radius: a govern implement run over work with uncommitted new modules reports "governed" on a payload that never contained the new code — models can't find findings in code they never saw, and the gate verdict is recorded as clean. The test suite doesn't cover this: `govern-payload-self-reference.test.ts` folds in `evidence.md` *under the feature root* and asserts the unrelated scaffold is excluded, but never plants an untracked `src/` file. A reasonable fix: scope the fold's *exclusions* (other features' roots + the audit-log) rather than its *inclusions*, or at minimum emit one warn line per scope-dropped file and add it to a `skippedOutOfScope` ledger so the operator can commit-first.

### AUDIT-20260611-02 — US4 residual: ref-idempotency skip still leaves a decided flip silently open behind an exit-0 apply

Finding-ID: AUDIT-20260611-02
Status:     fixed-52c51c6c
Severity:   high
Surface:    plugins/stack-control/src/backlog/slush-migrate.ts:132-137, src/subcommands/slush-findings.ts:202-211

US4's contract (quoted in the test header) is "no decided flip remains open after an exit-0 apply" and "dry-run N ⇒ apply N." The new location guard closes the *line-index* divergence, but the **ref-idempotency** skip in `migrateFindings` re-opens the same pathology through a different key: the backlink ref is `audit:<slug>:<canonicalId>` (slush-migrate.ts:42-44), keyed by canonical AUDIT-id, not by entry. Take the diff's own divergence fixture — the same canonical ID open in two sections. First apply migrates the latest entry and creates the ref. When a later run decides the *other* entry (via `--scope all`, or when a new barrage section re-raises the same canonical ID), `backend.exists(ref)` is true → the flip is pushed to `skipped` (line 135-136), its Status line is never rewritten, and the verb prints `migrated 0 finding(s)` and exits 0. `mig.skipped` is never surfaced in the stdout line (slush-findings.ts:202-206), so the dry-run count (`ids.length`, line 209) and the applied count diverge with zero signal.

Blast radius: the finding stays `open` forever — the dampener will keep deciding it on every run, every apply will skip it, every exit will be 0. This is precisely the "silently open after an exit-0 apply" class AUDIT-20260609-19 documented, surviving via the second of the two independent keyings (the line-index one was fixed; the canonical-ref one was not). Fix: when a flip is skipped by ref-existence, either rewrite its Status line to reference the existing task (it IS migrated — just to an item that already exists) or fail loud the way the location guard does; and report `skipped` in the APPLIED stdout line either way.

### AUDIT-20260611-03 — Fleet-floor clamp uses the selected model subset, not the configured fleet — `--models <one>`/`GOVERN_MODELS` quietly defeats govern's floor 2

Finding-ID: AUDIT-20260611-03
Status:     fixed-c5bdfb0d
Severity:   medium
Surface:    plugins/stack-control/src/subcommands/audit-barrage.ts:330-348 (evaluateFleetFloor), :394-399 (clamp NOTE)

`evaluateFleetFloor` clamps against `run.results.length` — the models *actually run*, after any `--models` subset (or govern's `GOVERN_MODELS` env passthrough, govern.ts) is applied. The contract text in both the test header and the help text says the effective floor is `min(n, configured fleet size)`. With a 2-model config and `--models claude`, the "fleet size" becomes 1, the govern-default floor 2 clamps to 1, and a single-model run passes with exit 0 plus only a stderr NOTE — whose wording ("exceeds the configured fleet size 1") mislabels the subset size as the configured fleet. The clamp exists so a genuinely one-model *config* isn't unsatisfiable; routing the subset through the same clamp makes the cross-model agreement floor — the thing US1 exists for — opt-out-able via an env var with no exit-code consequence.

Blast radius: an unattended govern run with `GOVERN_MODELS=claude` (e.g., set once during a codex outage and forgotten) permanently runs single-model "governed" passes that the floor was added to refuse. Fix: clamp against the *configured* fleet size (thread `config.models.length` into the evaluation), or at least fail the floor when the subset selection — not model health — is what reduced the emitting count below the requested floor.

### AUDIT-20260611-04 — Govern implement mode silently reverts to the self-referential repo-wide payload when the feature root doesn't resolve

Finding-ID: AUDIT-20260611-04 (claude-04 + claude-05 + codex-01 + codex-02; cross-model)
Status:     fixed-99ff9f3e
Severity:   high
Surface:    plugins/stack-control/src/subcommands/govern.ts:338-342; src/govern/payload-implement.ts:69-79

`runGovern` resolves the feature root and threads it into `buildImplementVars`, but when `resolveFeatureRoot` returns `root: undefined` (slug derived from a branch name that doesn't match a feature dir, a typo'd `--feature`, a nonstandard layout), `featureRoot` is `undefined` and the assembler documents the consequence itself: "When absent, behavior is byte-identical to the pre-014 assembler" — i.e., the audit-log rides in the committed diff AND the untracked fold goes repo-wide. The exact AUDIT-28/42/48 generator US5 closes quietly re-opens, with no stderr notice at the decision site. Contrast with US2's design (the legacy-config notice fires "at the decision site — the moment the wrong config would silently win") and with scope-widen/scope-inventory in this same diff, which FATAL-exit on the identical unresolvable-root condition.

Blast radius: a misnamed slug doesn't fail — it produces a *worse* payload that feeds the self-reference loop, and the run is still recorded as governed. Per the project's no-silent-fallback rule, this degradation should be loud: emit a stderr warning naming the unresolved slug and both probed layouts when implement-mode proceeds without a feature root (or refuse, matching the sibling verbs in this diff).

### AUDIT-20260611-05 — US4 location guard validates status-line shape, not finding identity

Finding-ID: AUDIT-20260611-05
Status:     fixed-30f1aa55
Severity:   low
Surface:    plugins/stack-control/src/backlog/slush-migrate.ts:117-129

The guard asserts only that `lines[f.statusLineIndex]` matches `/^Status:\s*open\b/i`. Audit-log entries are uniform field blocks, so an edit that shifts lines by exactly one entry height (e.g., inserting a full entry above) lands the recorded index on a *different* finding's open-status line — the guard passes and line 144 rewrites the wrong entry's status with this finding's task-id. The staleness test covers only the shift-onto-a-non-matching-line case. Blast radius is low because the sole production caller (slush-findings.ts:190-196) computes flips and applies against the same in-memory `text`, so the guard can only fire — or mis-pass — through the library seam; within the verb the index is always self-consistent. Still, since `FoundFinding` already carries `fullFindingId`, pinning identity (verify the entry block containing `statusLineIndex` contains `Finding-ID: <fullFindingId>`) closes the gap at trivial cost and makes the guard's error message truthful for all stale-text shapes.

### AUDIT-20260611-06 — `exists()` fails loud even when the ref is provably present among healthy task files

Finding-ID: AUDIT-20260611-06
Status:     fixed-9d0fbb79
Severity:   low
Surface:    plugins/stack-control/src/backlog/backend.ts:232-247

The US8 integrity rationale is "a malformed file could be the very one holding `ref` — skipping it would report 'absent' and let an import create a duplicate." That reasoning only applies to the *negative* answer. When the ref **is** found among the healthy items, `exists` can return `true` safely — the idempotency check succeeds, nothing is created, no duplicate is possible — yet the implementation throws before checking, blocking an entire import batch on one corrupt file even for the findings whose idempotency is decidable. Blast radius: availability-only (exit 2 with a clear remediation message; no data corruption), and the conservative behavior matches the letter of the clarification's skip-reads/fail-imports split, so this is hygiene: check `items.some(...)` first, return `true` on a hit, and throw only when the answer would otherwise be "absent" with malformed files present.

### AUDIT-20260611-07 — R7 probe's violation grammar misses plain string-concatenation path constructions

Finding-ID: AUDIT-20260611-07
Status:     fixed-9465eec9
Severity:   low
Surface:    plugins/stack-control/src/__tests__/legacy-path-construction-probe.test.ts:73-99

The four violation shapes (V1 join/resolve args, V2 bare-literal line, V3 bare-bucket assignment, V4 interpolating template) don't match ordinary concatenation: `const p = root + '/docs/1.0/001-IN-PROGRESS/' + slug` hits none of them — V3 requires the literal to be *exactly* `'001-IN-PROGRESS'`, V1 requires a `join(`/`resolve(` on the same line, V4 requires a backtick template. The same applies to the literal passed as an argument to any non-join function (`mkdirSync(root + '/docs/1.0/001-IN-PROGRESS/' + slug)`). Blast radius: low — the probe is defense-in-depth behind the US7 conversion (which this diff completed), and a future regression would most plausibly reuse join/template idioms the probe does catch; but since SC-007's claim is "never a path construction," extending V3/V4 to flag any quoted literal *containing* the bucket adjacent to a `+` would close the cheapest evasion for one more regex.

---

**Summary for triage:** two HIGHs — the US5 untracked-fold scoping silently excludes the feature's own uncommitted source code from governed payloads (claude-01), and US4's ref-idempotency skip path still produces the "decided flip left open behind exit-0" pathology the story exists to close, reachable from the diff's own divergence fixture (claude-02). Three MEDIUMs cover quiet floor-weakening via model subsets, govern's silent fallback to the self-referential payload on an unresolvable slug, and the new hard feature-root precondition on explicit-path widen/inventory invocations. Three LOWs are robustness/hygiene notes on the location guard, `exists()` conservatism, and probe grammar gaps. I verified the close-out ledger's test arithmetic (the per-file counts in tasks.md sum to the claimed +49) and found no discrepancy there.

## 2026-06-11 — audit-barrage lift (20260611T031843516Z-audit-protocol-reliability-after_clarify)

### AUDIT-20260611-08 — Residual self-reference channel: repo-level governance bookkeeping (the backlog task store) rides in the committed-diff arm — FR-007's exclusion narrows to exactly one file

Finding-ID: AUDIT-20260611-08
Status:     fixed-cbb7c09f
Severity:   medium
Surface:    plugins/stack-control/src/govern/payload-implement.ts:165-176

US5's committed-arm exclusion is precisely one pathspec: `:(exclude)${featureRel}/audit-log.md` (payload-implement.ts:169-172). But FR-007 promises exclusion of "the feature's own audit-log **and governance-bookkeeping surface**", and the audited range demonstrates the gap on itself: this very payload carries eight `plugins/stack-control/.stack-control/backlog/tasks/*.md` files whose committed NOTES sections quote finding IDs, AUDIT-prose, and disposition text ("specs/014 US4 implemented: …", "Promoted-to: tasks:specs/014-…"). Those notes landed via T022's bookkeeping commit inside the diff range — exactly the lift-commit-in-range mechanism US5 closed for the audit-log — and they re-feed prior-round finding prose to the model fleet through a channel the exclusion doesn't cover, because the backlog store lives at the plugin root, not under the feature root. A model can emit findings whose only evidence is task-note prose, the AUDIT-28/42/48 generator shape at lower intensity. The same narrowness applies to a sibling feature's `audit-log.md` when two features' lift commits share a diff range (only the audited feature's log is excluded).

Blast radius: every implement-mode governance loop on a feature that does per-round backlog bookkeeping (the workflow this repo's own T022 convention mandates) ships prior findings back into the payload; multi-round convergence degrades the way gh-431 recorded, just via the backlog instead of the audit-log. A reasonable fix: extend the committed-arm pathspec (and the untracked-fold filter) to exclude the backlog store path (`.stack-control/backlog/`, resolvable via the existing `backlogRoot()` seam) alongside the feature's audit-log, and decide explicitly whether sibling features' audit-logs belong in the committed arm.

### AUDIT-20260611-09 — Legacy-config migration advice is destructive in the both-present case: pasting the suggested `mv` clobbers the active stack-control override

Finding-ID: AUDIT-20260611-09 (claude-02 + codex-02; cross-model)
Status:     fixed-1ec2d993
Severity:   medium
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts:147-162

`emitLegacyConfigNotice` emits the same third line in every legacy-present combination: `migrate with: mv ${legacyPath} ${resolve(repoRoot, CONFIG_OVERRIDE_PATH)} (then review)`. In the both-present case — which the US2 test suite explicitly pins as a supported state (`barrage-config-legacy-detect.test.ts:88-106`, "notice fires AND the stack-control override wins") — the destination of that `mv` is the operator's **active, tuned** override, and `mv` overwrites without prompting. An operator following the printed remediation verbatim replaces their current battery with the legacy dw-lifecycle one; worse, the swap is self-concealing: once the legacy file has been moved, the notice never fires again, and the now-active config silently changes which models/timeouts every subsequent barrage runs with. In the both-present state the operator has already migrated — the correct remediation is to archive or delete the legacy file, not move it over the live one.

Blast radius: requires operator action (pasting the printed command), so not automatic — but the artifact actively recommends the wrong, destructive action in one of its three contracted states, and the project's recent timeout tuning (the 300→900s claude change in this same diff lives in exactly that override file) is the kind of value that would be silently lost. Fix: branch the third line on `activeOverridePath` — when an active override exists, advise removing/archiving the legacy file instead of `mv`-ing it.

### AUDIT-20260611-10 — T020/T021 validation ledger in tasks.md is stale within the audited range — the recorded counts predate the seven AUDIT-fix commits that follow it

Finding-ID: AUDIT-20260611-10
Status:     fixed-4f7df2a4
Severity:   low
Surface:    specs/014-audit-protocol-reliability/tasks.md:96-104 (Validation outcomes section)

The ledger records "173 → 183 test files, 1150 → 1200 tests, +50" with per-file counts (barrage-fleet-degradation 14, slush-apply-single-source 4, govern-payload-self-reference 3, legacy-path-construction-probe 1, backlog-malformed-task-file 4). Those numbers were true at close-out commit e915b43f but the audited range continues through the AUDIT-20260611-01…07 fix commits, which changed them: I re-counted the final tree — barrage-fleet-degradation is now 20 `it()` blocks (+6 from the AUDIT-03 describe), slush-apply-single-source 7 (+3 from AUDIT-02/-05), backlog-malformed-task-file 5 (+1 from AUDIT-06), govern-payload-self-reference 4 (+1 from AUDIT-01), legacy-path-construction-probe 3 (+2 from V5), and `govern-unresolvable-root.test.ts` (2 tests, AUDIT-04) is a tenth-plus-one new file absent from the ledger entirely. The branch endpoint is ~184 files / ~+65 tests, not 183 / +50.

Blast radius: documentation only — but the project's own AUDIT-04 journal convention (CLAUDE.md §Quantitative reporting) is explicit that unreconciled arithmetic is worse than absence, and a future SC-009 reconciliation against this branch will find the recorded anchor wrong with nothing in the file explaining why. Fix is cheap: append one line to the ledger noting the post-close-out audit-fix deltas (or restate the final totals from a fresh `npx vitest run`).

### AUDIT-20260611-11 — `migrateFindings` validate-first guarantee doesn't cover the create loop — a mid-loop throw leaves partially-created backlog items with the audit-log unwritten, contradicting the doc comment's "never a partial misapply"

Finding-ID: AUDIT-20260611-11
Status:     fixed-af9dbe3f
Severity:   low
Surface:    plugins/stack-control/src/backlog/slush-migrate.ts:148-208

The new validate-first block (lines 148-178) checks location shape and entry identity for every flip before anything mutates — good. But the doc comment's claim ("Validate-first means a stale apply creates zero items and rewrites zero lines: never a partial misapply") holds only for staleness failures. Inside the create loop, `severityToPriority` throws on HIGH/blocking severities (FR-018, per its own doc) and `backend.create` can fail (spawn error, malformed-store BacklogError from the `exists()` call at line 194) — and severity is *not* validated up front. A throw on flip k leaves flips 1…k−1 created in the backlog while the exception propagates out of `migrateFindings` before `slush-findings.ts` ever reaches `atomicWriteFile`, so those entries' audit-log statuses stay `open` behind an exit-1 run: backlog items exist with no corresponding `migrated-to-backlog` disposition.

Blast radius: low and self-healing — the dampener excludes HIGHs from flips in the normal path, and on re-run the AUDIT-20260611-02 ref-exists branch rewrites the orphaned-open entries to the already-created task ids, so the state converges. But the first failing run is exactly the "partial misapply" the comment promises away, and the hand-edited-severity / import-slush backfill paths (which don't pass `expectedStatusRe` and can carry arbitrary severities) reach it more easily. Cheap hardening: hoist the `severityToPriority` call into the validate-first pass so the only remaining mid-loop failures are genuine I/O faults.

**Summary for triage:** two MEDIUMs — the committed-diff arm's self-reference exclusion covers only `<featureRoot>/audit-log.md` while the audited range itself ships finding prose through the repo-level backlog task store (claude-01), and the US2 legacy notice prints a destructive `mv`-over-the-active-override remediation in the both-present state its own tests pin as supported (claude-02). Two LOWs: the T020 ledger's counts are stale relative to the branch endpoint after the AUDIT-fix commits (verified by re-count: +15 tests, +1 file unrecorded), and `migrateFindings`' atomicity claim overstates what validate-first covers. I also checked and cleared: the scope-widen auto-seed handles partial scope-discovery state correctly (`install` with `force: false` skips present files and creates only missing ones), the `git -C repoRoot` pathspec handling makes the `:(exclude)` arm cwd-safe, the AUDIT-03 floor clamp correctly distinguishes configured-fleet from subset at both the exit-code and message layers, and the US3 clustering change cleanly removes the surface-union key without touching genuine heading merges.

### AUDIT-20260611-12 — Ambiguous feature roots still escape govern as an uncaught error

Finding-ID: AUDIT-20260611-12
Status:     fixed-dce28977
Severity:   low
Surface:    plugins/stack-control/src/subcommands/govern.ts:348-349; plugins/stack-control/src/subcommands/govern.ts:414-420; plugins/stack-control/src/scope-discovery/util/feature-root.ts:211-220

`resolveFeatureRoot` correctly throws on ambiguous Spec Kit matches, but `runGovern` only converts `GovernProtocolError` / `GovernPayloadError` into controlled CLI exits. A repo with both `specs/001-foo` and `specs/002-foo` makes the resolver throw a plain `Error`, which falls through the catch at `govern.ts:414-420` and produces an uncaught stack trace / exit 1 instead of a clean governance refusal.

Blast radius is low because no audit payload ships and no state is rewritten, but it violates the feature’s fail-loud/no-stack-trace discipline on the same feature-root decision surface this diff hardens. Wrap the resolver calls in `runGovern` and translate ambiguity into the same exit-2 operator-facing channel used for unresolvable roots.

## 2026-06-11 — audit-barrage lift (20260611T034604761Z-audit-protocol-reliability-after_clarify)

### AUDIT-20260611-13 — govern's backlog-store payload exclusion resolves from cwd, not `--repo-root` — a cross-repo govern silently reopens the AUDIT-08 self-reference channel

Finding-ID: AUDIT-20260611-13
Status: migrated-to-backlog TASK-40
Severity:   medium
Surface:    plugins/stack-control/src/subcommands/govern.ts:271-294 (resolveGovernExcludePaths); plugins/stack-control/src/backlog/root.ts:29-38; plugins/stack-control/src/govern/payload-implement.ts:188-202 (relify/inRepo)

`resolveGovernExcludePaths()` derives the store to exclude via `backlogRoot()`, and `backlogRoot()` resolves the enclosing installation from `process.cwd()` (`resolveInstallation(process.cwd())`, root.ts:29) — but the payload assembler rel-ifies that path against the `--repo-root` flag and its `inRepo` filter makes any path that escapes the repo **inert** (payload-implement.ts: "paths outside the repo are inert"). So when the operator runs `stackctl govern --mode implement --repo-root <target>` from a cwd whose enclosing installation is a *different* repo (or with `STACKCTL_BACKLOG_DIR` pointed elsewhere while the target repo carries a committed store), the exclusion resolves successfully — the announced-skip branch fires only when `backlogRoot()` *throws* — rel-ifies to `../…`, gets filtered, and the target repo's committed `backlog/tasks/` prose rides back into the diff arm with **zero stderr signal**. That is exactly the AUDIT-20260611-08 channel this diff closes, reopened silently in the flag-driven case, on a feature whose stated discipline is fail-loud at every decision site. Note also that the integration seam is structurally untested: every govern test sets `STACKCTL_BACKLOG_DIR` to a tmp dir outside the fixture repo, so `runGovern → resolveGovernExcludePaths → assembler` threading never executes against an in-repo store — the committed-arm test (govern-payload-self-reference.test.ts, "committed arm + fold exclude the governance backlog store") threads `excludePaths` into the assembler directly. Blast radius: the natural cwd-inside-repo dogfood path works correctly, so this fires only for `--repo-root`-driven cross-repo governs and seam-redirected runs — but the failure is silent and defeats the feature's P1 goal when it fires. Fix: resolve the installation from `repoRoot` rather than cwd inside `resolveGovernExcludePaths` (or, after rel-ification, detect that the resolved store fell outside the repo while `<repoRoot>/.stack-control/backlog` exists and announce/exclude it).

### AUDIT-20260611-14 — Floor-shortfall runs print "barrage successful" on stderr, and govern embeds that contradiction inside its FATAL message

Finding-ID: AUDIT-20260611-14
Status: migrated-to-backlog TASK-41
Severity:   low
Surface:    plugins/stack-control/src/subcommands/audit-barrage.ts:387-397 (renderSummaryLine call) and :316-326 (renderSummaryLine); plugins/stack-control/src/govern/protocol.ts:224-235

`auditBarrage` writes `renderSummaryLine(run)` whenever `--quiet` is absent, regardless of the derived exit code. `renderSummaryLine` unconditionally opens with "barrage successful — N of M models emitted findings…". On a floor-shortfall run the stderr stream therefore reads `FLOOR SHORTFALL — required 2 emitting model(s), got 1 …` followed by `audit-barrage: barrage successful — 1 of 2 models emitted findings; zero-output: codex; …`, and the process exits 1. Worse, `protocol.ts` does not pass `--quiet` when spawning the barrage and now appends `barrage.stderr.trim()` to the `GovernProtocolError` on non-zero exit (protocol.ts:229-235) — so govern's operator-facing `govern: FATAL — audit-barrage OUTAGE or fleet-floor shortfall…` message contains the literal text "barrage successful" inside it. Blast radius: exit codes and gating behavior are correct, so nothing downstream acts wrongly — but US1's whole purpose is unambiguous loudness at the moment of degradation, and a failure message that self-describes as successful is the cry-wolf inverse: an operator (or an unattended agent grepping stderr) pattern-matching on "successful" reads a refused round as a passed one. Fix: make `renderSummaryLine` (or the call site) aware of the derived exit code and render "barrage REFUSED — floor shortfall" wording when `deriveBarrageExitCode` returns 1, or suppress the success line on non-zero exits.

### AUDIT-20260611-15 — The legacy-config mv advice branches on an ACTIVE override, not an EXISTING one — an inactive override file (seeded scaffold or temporarily-commented battery) is clobbered by the printed command

Finding-ID: AUDIT-20260611-15
Status: migrated-to-backlog TASK-42
Severity:   low
Surface:    plugins/stack-control/src/scope-discovery/audit-barrage/config-loader.ts:110-125, 160-184 (emitLegacyConfigNotice)

The AUDIT-20260611-09 fix branches the third notice line on `activeOverridePath`, which is populated only when `hasActiveModelsSection` returns true. But the override file can **exist while inactive**: the loader's own doc comments say the seeded scaffold ships with `models:` commented out, and an operator who temporarily comments out their tuned battery is in the same state. In that combination `emitLegacyConfigNotice` receives `undefined` and prints the unguarded `migrate with: mv ${legacyPath} ${overridePath} (then review)` — whose destination is an existing file that `mv` overwrites without prompting. For the fresh scaffold the loss is just scaffold comments (including the `{{prompt}}`-migration guidance the scaffold carries), but for a commented-out tuned battery this is the same self-concealing clobber AUDIT-09 fixed for the active case: the legacy file moves, the notice never fires again, and the operator's parked config is gone. Blast radius: requires the operator to paste the printed command while holding an inactive-but-meaningful override, so not automatic — same class and one notch below the original AUDIT-09 MEDIUM. Fix: branch the remediation on file *existence* (`existsSync(overridePath)`) rather than activeness — when the destination exists at all, advise review-and-merge or the archive form, never a bare `mv` over it.

### AUDIT-20260611-16 — scope-inventory now refuses on an unresolvable feature root even when --prd-path and --out are explicit and the evidence trail is off — a new hard requirement pre-014 callers didn't have

Finding-ID: AUDIT-20260611-16 (claude-04 + claude-05 + codex-01; cross-model)
Status: migrated-to-backlog TASK-43
Severity:   medium
Surface:    plugins/stack-control/src/scope-discovery/scope-inventory.ts:297-319

`scopeInventoryMain` resolves the feature root unconditionally and exits 2 with the both-layouts FATAL when the slug resolves under neither layout — before checking whether the resolution is actually needed. The root anchors three things: the default `--prd-path`, the default `--out`, and the evidence run-dir. When the caller supplies both `--prd-path` and `--out` explicitly **and** passes `--evidence-trail off`, none of the three is consumed, yet the invocation now hard-fails on a repo whose feature lives in neither `specs/<NNN>-<slug>` nor `docs/*/001-IN-PROGRESS/<slug>`. Pre-014 that invocation worked (the defaults were constructed strings, never required to exist when overridden). scope-widen's equivalent unconditional resolution is justified — `stageRun` always needs a run dir for the augmented PRD — but inventory's run dir is gated on `opts.evidenceTrail` (line ~398), so the refusal is broader than the need. Blast radius: low — affects only adopters using neither directory convention with fully-explicit paths, and the failure is loud with a clear message naming both layouts plus the implicit workaround of creating a matching dir; nothing is silently built wrong. Fix: defer the FATAL to the first actual consumer of `featureRoot` (resolve lazily; refuse only when a default path or an evidence dir genuinely needs it), mirroring how scope-export only resolves when `--manifest` is absent.

### AUDIT-20260611-17 — The R7 probe grammar misses segment-array path construction — a compliant-looking bypass of the SC-007 regression gate

Finding-ID: AUDIT-20260611-17
Status: migrated-to-backlog TASK-44
Severity:   low
Surface:    plugins/stack-control/src/__tests__/legacy-path-construction-probe.test.ts:79-117 (isConstruction V1–V5)

The probe's five violation shapes all require the `001-IN-PROGRESS` literal to be syntactically adjacent to `join`/`resolve` (V1), alone on a line (V2), directly assigned (V3), inside an interpolating template (V4), or `+`-adjacent (V5). A two-step construction slips every shape: `const SEGS = ['docs', '1.0', '001-IN-PROGRESS'];` (literal inside an array — no `=` immediately before the quote, no join on the line, no backtick, no `+`) followed by `join(root, ...SEGS, slug)` (no literal on the line). The probe is named as the FR-010/SC-007 regression gate ("never a path construction"), so a passing run implicitly claims the gh-442 class cannot re-enter — per the project's own ui-verification rule, a probe whose assertions don't cover the contract underwrites a false claim. Blast radius: low — this requires a future author to write the bypass shape, the probe still catches the natural one-liner forms (including the V5 concatenation it was just extended for), and cross-model audit remains a second net. Fix is cheap: add a V6 that flags the bare literal appearing inside any array-literal context (`[`…`'001-IN-PROGRESS'`…`]` or a trailing-comma element line), or simplify the whole grammar to "any non-comment, non-both-layouts-exempt occurrence is a violation" and exempt the known help-text lines explicitly.

**Summary for triage:** one MEDIUM — govern's AUDIT-08 backlog-store exclusion derives from `process.cwd()`'s installation while the payload rel-ifies against `--repo-root`, so a cross-repo or seam-redirected govern silently reopens the self-reference channel, and no test exercises the real `runGovern → resolveGovernExcludePaths` threading because every govern test routes the store out of the repo via `STACKCTL_BACKLOG_DIR` (claude-01). Five LOWs: the "barrage successful" summary prints on floor-shortfall exit-1 runs and gets embedded verbatim into govern's FATAL (claude-02); the legacy-config `mv` advice keys on override *activeness* rather than *existence*, so an inactive-but-present override file is clobber-advised (claude-03); scope-inventory's unconditional feature-root FATAL refuses fully-explicit-path, evidence-off invocations that worked pre-014 (claude-04); `discoverFeatureRoots` over-enumerates specs/ children relative to `resolveFeatureRoot`'s matcher, mis-classifying non-feature dirs in fold-drop warnings (claude-05); and the R7 probe grammar has a segment-array bypass (claude-06). I also checked and cleared: the validate-first pass in `migrateFindings` now genuinely covers location, identity, and severity before any create (the malformed-store `exists()` throw can no longer fire after a create, since `exists` never returns false with malformed files present); the floor's selection-vs-health cause attribution is exhaustive (at least one cause always applies when unmet); the US3 clustering change removes only the surface-union key; and the both-present legacy-notice fix correctly never prints an mv targeting the active override.
