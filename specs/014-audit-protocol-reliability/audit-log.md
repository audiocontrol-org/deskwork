---
slug: audit-protocol-reliability
targetVersion: ""
---

# Audit log — audit-protocol-reliability

## 2026-06-11 — audit-barrage lift (20260611T023720982Z-audit-protocol-reliability-after_clarify)

### AUDIT-20260611-01 — US5 untracked-fold scoping silently drops newly-added untracked source files from the audited payload

Finding-ID: AUDIT-20260611-01
Status:     open
Severity:   high
Surface:    plugins/stack-control/src/govern/payload-implement.ts:162-170 (filter), src/subcommands/govern.ts:338-342, src/__tests__/govern-payload-self-reference.test.ts:84-107

The untracked fold exists per AUDIT-20260605-01 "so newly-added work is audited too" (payload-implement.ts:152). The new FR-008 filter scopes the fold to files under the **feature root** — which is the spec/docs directory (`specs/<NNN>-<slug>/`), not the feature's code. With `featureRel` set (now the normal govern path), any untracked source file — a brand-new `src/foo.ts` not yet committed — is silently dropped from the payload. The drop is invisible: binary skips and budget skips each emit a `warn(...)` line and land in `skippedBinary`/`skippedOverBudget` (lines 172-192), but the scope filter at 166-170 emits nothing and appears in no ledger. The recorded defect was sweeping *unrelated features' scaffolds*; the fix also excludes the *audited feature's own uncommitted code*, which is exactly the case the fold was added for.

Blast radius: a govern implement run over work with uncommitted new modules reports "governed" on a payload that never contained the new code — models can't find findings in code they never saw, and the gate verdict is recorded as clean. The test suite doesn't cover this: `govern-payload-self-reference.test.ts` folds in `evidence.md` *under the feature root* and asserts the unrelated scaffold is excluded, but never plants an untracked `src/` file. A reasonable fix: scope the fold's *exclusions* (other features' roots + the audit-log) rather than its *inclusions*, or at minimum emit one warn line per scope-dropped file and add it to a `skippedOutOfScope` ledger so the operator can commit-first.

### AUDIT-20260611-02 — US4 residual: ref-idempotency skip still leaves a decided flip silently open behind an exit-0 apply

Finding-ID: AUDIT-20260611-02
Status:     open
Severity:   high
Surface:    plugins/stack-control/src/backlog/slush-migrate.ts:132-137, src/subcommands/slush-findings.ts:202-211

US4's contract (quoted in the test header) is "no decided flip remains open after an exit-0 apply" and "dry-run N ⇒ apply N." The new location guard closes the *line-index* divergence, but the **ref-idempotency** skip in `migrateFindings` re-opens the same pathology through a different key: the backlink ref is `audit:<slug>:<canonicalId>` (slush-migrate.ts:42-44), keyed by canonical AUDIT-id, not by entry. Take the diff's own divergence fixture — the same canonical ID open in two sections. First apply migrates the latest entry and creates the ref. When a later run decides the *other* entry (via `--scope all`, or when a new barrage section re-raises the same canonical ID), `backend.exists(ref)` is true → the flip is pushed to `skipped` (line 135-136), its Status line is never rewritten, and the verb prints `migrated 0 finding(s)` and exits 0. `mig.skipped` is never surfaced in the stdout line (slush-findings.ts:202-206), so the dry-run count (`ids.length`, line 209) and the applied count diverge with zero signal.

Blast radius: the finding stays `open` forever — the dampener will keep deciding it on every run, every apply will skip it, every exit will be 0. This is precisely the "silently open after an exit-0 apply" class AUDIT-20260609-19 documented, surviving via the second of the two independent keyings (the line-index one was fixed; the canonical-ref one was not). Fix: when a flip is skipped by ref-existence, either rewrite its Status line to reference the existing task (it IS migrated — just to an item that already exists) or fail loud the way the location guard does; and report `skipped` in the APPLIED stdout line either way.

### AUDIT-20260611-03 — Fleet-floor clamp uses the selected model subset, not the configured fleet — `--models <one>`/`GOVERN_MODELS` quietly defeats govern's floor 2

Finding-ID: AUDIT-20260611-03
Status:     open
Severity:   medium
Surface:    plugins/stack-control/src/subcommands/audit-barrage.ts:330-348 (evaluateFleetFloor), :394-399 (clamp NOTE)

`evaluateFleetFloor` clamps against `run.results.length` — the models *actually run*, after any `--models` subset (or govern's `GOVERN_MODELS` env passthrough, govern.ts) is applied. The contract text in both the test header and the help text says the effective floor is `min(n, configured fleet size)`. With a 2-model config and `--models claude`, the "fleet size" becomes 1, the govern-default floor 2 clamps to 1, and a single-model run passes with exit 0 plus only a stderr NOTE — whose wording ("exceeds the configured fleet size 1") mislabels the subset size as the configured fleet. The clamp exists so a genuinely one-model *config* isn't unsatisfiable; routing the subset through the same clamp makes the cross-model agreement floor — the thing US1 exists for — opt-out-able via an env var with no exit-code consequence.

Blast radius: an unattended govern run with `GOVERN_MODELS=claude` (e.g., set once during a codex outage and forgotten) permanently runs single-model "governed" passes that the floor was added to refuse. Fix: clamp against the *configured* fleet size (thread `config.models.length` into the evaluation), or at least fail the floor when the subset selection — not model health — is what reduced the emitting count below the requested floor.

### AUDIT-20260611-04 — Govern implement mode silently reverts to the self-referential repo-wide payload when the feature root doesn't resolve

Finding-ID: AUDIT-20260611-04 (claude-04 + claude-05 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Surface:    plugins/stack-control/src/subcommands/govern.ts:338-342; src/govern/payload-implement.ts:69-79

`runGovern` resolves the feature root and threads it into `buildImplementVars`, but when `resolveFeatureRoot` returns `root: undefined` (slug derived from a branch name that doesn't match a feature dir, a typo'd `--feature`, a nonstandard layout), `featureRoot` is `undefined` and the assembler documents the consequence itself: "When absent, behavior is byte-identical to the pre-014 assembler" — i.e., the audit-log rides in the committed diff AND the untracked fold goes repo-wide. The exact AUDIT-28/42/48 generator US5 closes quietly re-opens, with no stderr notice at the decision site. Contrast with US2's design (the legacy-config notice fires "at the decision site — the moment the wrong config would silently win") and with scope-widen/scope-inventory in this same diff, which FATAL-exit on the identical unresolvable-root condition.

Blast radius: a misnamed slug doesn't fail — it produces a *worse* payload that feeds the self-reference loop, and the run is still recorded as governed. Per the project's no-silent-fallback rule, this degradation should be loud: emit a stderr warning naming the unresolved slug and both probed layouts when implement-mode proceeds without a feature root (or refuse, matching the sibling verbs in this diff).

### AUDIT-20260611-05 — US4 location guard validates status-line shape, not finding identity

Finding-ID: AUDIT-20260611-05
Status:     open
Severity:   low
Surface:    plugins/stack-control/src/backlog/slush-migrate.ts:117-129

The guard asserts only that `lines[f.statusLineIndex]` matches `/^Status:\s*open\b/i`. Audit-log entries are uniform field blocks, so an edit that shifts lines by exactly one entry height (e.g., inserting a full entry above) lands the recorded index on a *different* finding's open-status line — the guard passes and line 144 rewrites the wrong entry's status with this finding's task-id. The staleness test covers only the shift-onto-a-non-matching-line case. Blast radius is low because the sole production caller (slush-findings.ts:190-196) computes flips and applies against the same in-memory `text`, so the guard can only fire — or mis-pass — through the library seam; within the verb the index is always self-consistent. Still, since `FoundFinding` already carries `fullFindingId`, pinning identity (verify the entry block containing `statusLineIndex` contains `Finding-ID: <fullFindingId>`) closes the gap at trivial cost and makes the guard's error message truthful for all stale-text shapes.

### AUDIT-20260611-06 — `exists()` fails loud even when the ref is provably present among healthy task files

Finding-ID: AUDIT-20260611-06
Status:     open
Severity:   low
Surface:    plugins/stack-control/src/backlog/backend.ts:232-247

The US8 integrity rationale is "a malformed file could be the very one holding `ref` — skipping it would report 'absent' and let an import create a duplicate." That reasoning only applies to the *negative* answer. When the ref **is** found among the healthy items, `exists` can return `true` safely — the idempotency check succeeds, nothing is created, no duplicate is possible — yet the implementation throws before checking, blocking an entire import batch on one corrupt file even for the findings whose idempotency is decidable. Blast radius: availability-only (exit 2 with a clear remediation message; no data corruption), and the conservative behavior matches the letter of the clarification's skip-reads/fail-imports split, so this is hygiene: check `items.some(...)` first, return `true` on a hit, and throw only when the answer would otherwise be "absent" with malformed files present.

### AUDIT-20260611-07 — R7 probe's violation grammar misses plain string-concatenation path constructions

Finding-ID: AUDIT-20260611-07
Status:     open
Severity:   low
Surface:    plugins/stack-control/src/__tests__/legacy-path-construction-probe.test.ts:73-99

The four violation shapes (V1 join/resolve args, V2 bare-literal line, V3 bare-bucket assignment, V4 interpolating template) don't match ordinary concatenation: `const p = root + '/docs/1.0/001-IN-PROGRESS/' + slug` hits none of them — V3 requires the literal to be *exactly* `'001-IN-PROGRESS'`, V1 requires a `join(`/`resolve(` on the same line, V4 requires a backtick template. The same applies to the literal passed as an argument to any non-join function (`mkdirSync(root + '/docs/1.0/001-IN-PROGRESS/' + slug)`). Blast radius: low — the probe is defense-in-depth behind the US7 conversion (which this diff completed), and a future regression would most plausibly reuse join/template idioms the probe does catch; but since SC-007's claim is "never a path construction," extending V3/V4 to flag any quoted literal *containing* the bucket adjacent to a `+` would close the cheapest evasion for one more regex.

---

**Summary for triage:** two HIGHs — the US5 untracked-fold scoping silently excludes the feature's own uncommitted source code from governed payloads (claude-01), and US4's ref-idempotency skip path still produces the "decided flip left open behind exit-0" pathology the story exists to close, reachable from the diff's own divergence fixture (claude-02). Three MEDIUMs cover quiet floor-weakening via model subsets, govern's silent fallback to the self-referential payload on an unresolvable slug, and the new hard feature-root precondition on explicit-path widen/inventory invocations. Three LOWs are robustness/hygiene notes on the location guard, `exists()` conservatism, and probe grammar gaps. I verified the close-out ledger's test arithmetic (the per-file counts in tasks.md sum to the claimed +49) and found no discrepancy there.
