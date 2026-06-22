# Backlog cleanup review — 2026-06-22

A future-session work-list for cleaning up the stack-control backlog (the `.stack-control/backlog/` slush store). Produced after the 030 chunked-end-govern feature shipped (0.53.0, PR #495). **Nothing here is closed yet** — this is a flag-and-propose record; the operator owns each disposition. Run `stackctl backlog done <id> --reason "..." --apply` to close, or `backlog list` to inspect.

Open items at time of review: **214**. Verifications below were run against the source at commit `705d5ab3` (branch `feature/stack-control`).

## How to use this file

Each flagged item has: **verdict** · **evidence** · **recommended action**. Re-verify the evidence (grep the cited symbol/file) before closing — source moves. The `🟢 verified` flags were checked against source during this review; the `🔎 deep-pass` section was produced by sub-agents cross-referencing each item and should be spot-checked.

---

## Tier 1 — Close now (resolved/moot, source-verified 🟢)

| TASK | Verdict | Evidence | Action |
|---|---|---|---|
| 412 | resolved | per-phase/composition modules (compose-convergence, phase-checkpoint-status, phase-enumeration, incremental-audit, audit-unit-types) **absent** from `src/govern/` | close — "030 US2/US8: deletion done; verified absent" |
| 413 | resolved | `src/subcommands/payload-implement.ts` **deleted**; `src/subcommands/govern.ts` now **333 lines** (target was <500) | close — "030 T063/T064: both done" |
| 151 | resolved (dup of 413) | `govern.ts` is **333 lines** (was 958) — already decomposed | close — "resolved; dup of TASK-413" |
| 48 | moot | `payload-implement.ts` **deleted** — flags a file that no longer exists | close — "file deleted by 030 US8" |

## Tier 2 — Close (moot by 030's per-phase deletion 🟢)

The per-phase checkpoint apparatus (`writeResolvedPhaseCheckpoint`, `phase-checkpoints/`, govern `--phase`) was deleted by 030 US2 (verified absent from source). Findings whose **core defect lives in that mechanism** have no code left to reproduce against:

- **TASK-70** — per-phase govern scoping unsound when tasks.md lacks file lists
- **TASK-73** — per-phase backfill governance friction
- **TASK-97** — checkpoint records claim stale governed paths (freshness only checks hash)
- **TASK-186** — "no governable phases" + missing-checkpoint flag fires on legacy specs
- **TASK-245** — per-phase govern excludes the phase's own tests (false "no test")
- **TASK-301** — per-phase no-barrage checkpoint refresh (shared-file O(n²))
- **TASK-353** — per-phase re-stale loop for tightly-coupled consecutive phases
- **TASK-379** — phase checkpoint written without a convergence record (record-first invariant)

Recommended reason: *"Moot — 030 US2 deleted the per-phase checkpoint mechanism this targets (verified absent from source); govern-at-end audits the committed whole-feature diff. No code remains to reproduce against."*

## Tier 3 — Re-scope, don't close (concern survives but re-targets)

- **TASK-77** — *partial*: the `phase-checkpoints/*.json` doctor/schema gap is moot, BUT **`.stack-control/fleet-knowledge.yaml` still exists** and still has no doctor/schema surface → re-scope the item to fleet-knowledge.yaml only.
- **TASK-109** — torn-temp-file guard: the per-phase writer is gone, but `writeWholeFeatureConvergenceRecord` (chunk-artifacts.ts) uses tmp+rename → re-aim there. *(Already folded into the `govern-030-hardening` umbrella.)*
- **TASK-354** — lane timeout on large per-phase payloads → re-aim to chunk payloads (whole-feature chunks can still be large).

## Tier 4 — Duplicate to confirm

- **TASK-416** ("GOVERN_CHECKPOINT rejection fires for all modes incl spec") likely overlaps **TASK-433** (AUDIT-20260622-24, the checkpoint contradiction across contract/FR-029/quickstart, already in the umbrella). Confirm same root → close 416 as dup of 433, or merge bodies.

## Keep — verified still valid (do NOT close)

- **TASK-295** — clone-step is TypeScript-only; the clone step **still runs** under govern-at-end (it fired in the 030 govern), so this still blocks non-TS adopters → live.
- **TASK-6/7/8/9/10/11** — scope-discovery enhancement wishlist; legit long-tail, not cleanup.

## Needs a per-item read (uncertain)

- **TASK-74** — "per-phase govern mechanical teeth so agents can't skip" — the *teeth* concept may re-target to the whole-feature graduation gate (which exists). Re-scope or close — read first.
- **TASK-184** — "type predicate masks new checkpoint state" — depends whether "checkpoint state" = the deleted per-phase state or the live `WholeFeatureConvergenceRecord` outcome. Read first.

---

## 🔎 Deep-pass results (sub-agent cross-check of the remaining ~190)

> Five parallel sub-agents cross-referenced every remaining open item against current source + (for imported-issues) GitHub state. Per-group detail tables are appended at the end of this doc; this is the reconciled master list. **Spot-check evidence before closing.**

### Corrections to the manual tiers above (the deep pass overruled my context-only reads)
- **TASK-295** — I had it as "Keep / still-valid"; it is actually **RESOLVED + CLOSED-UPSTREAM**: gh-487 is closed and `runJscpd` (jscpd-runner.ts) now returns `null` on a zero-files scan (the non-TS-block fix landed, citing "TASK-295/#487"). The language-awareness remnant is the separate still-open TASK-296.
- **TASK-416** — I had it as "dup of 433"; agent found it **independently fixed** in source → close as resolved, not a dup.
- **TASK-184** — I had it "uncertain"; confirmed **MOOT-BY-030** (checkpoint-state/per-phase-gate finding in the rewritten reconcile module).
- **TASK-109** — confirmed the *finding-as-written* cites the deleted `checkpoint-state.ts` (moot), but the torn-temp risk re-targets to `writeWholeFeatureConvergenceRecord` → **RE-SCOPE** (kept in the umbrella).
- Sub-agent over-eager "resolved" calls I caught + corrected to STILL-VALID: **402/404** (test lives in `tests/`, not `src/`), **389** (live `tsc` shows 3 TS2339 errors persist), **99/106/108** (`phase-boundary-sizing.ts` SURVIVED 030, rekeyed generic — defects intact).

### CLOSE candidates (~41) — resolved / moot / closed-upstream / done
- **Source-verified resolved/moot:** 412, 151, 48 (per-phase modules + payload-implement.ts deleted; govern.ts → 333 lines)
- **Moot by 030 per-phase deletion:** 70, 73, 97, 109*, 184, 186, 189, 245, 264, 301, 353, 366, 367, 369, 379, 408, 411 (*109 → re-scope, see below)
- **Closed upstream (GH issue closed):** 58, 59, 70, 73, 295
- **Likely-resolved (spec shipped + fix SHAs / fixed in source):** 12, 15, 24, 26ʷ, 28, 30, 41, 45, 54, 69, 130, 133, 137, 144, 147ᵍ, 148ᵍ, 174, 416, 423
  - ʷ = the watchdog variant of the TASK-26 id-collision (see hygiene). ᵍ = code fixed but the upstream GH issue is still open → post evidence, the issue author closes (per the closure-requires-installed-release rule).

### RE-SCOPE candidates (~9) — partly resolved; re-aim the live remnant, don't close
- **77** → fleet-knowledge.yaml doctor/schema only · **109** → torn-temp on `writeWholeFeatureConvergenceRecord` · **110** → non-regular-FS-entry defect migrated intact to `scope-fingerprint.ts:77` · **113**, **119** (group B remnants) · **243** → only the `git rm --cached` of the already-tracked stale marker remains · **354** → liveness window (not payload-scaled; near-dup of TASK-324) · **413** → pipeline-output wiring remnant · **47** → cross-installation-boundary rename / payload-size FATAL residual

### UNCERTAIN (~7) — need a human read before disposition
- **74** (per-phase "teeth" → may re-target to the whole-feature gate) · **183** (clean-fully-governed case asserted in rewritten `capability-reconcile.test.ts`?) · **297** (`backlog done --reason` persisted? AUDIT-...75 says validated-then-dropped) · **386** (`gitRefResolves` gone, no task body) · **395** (invalid-target test coverage) · **141**, **143**

### Hygiene flags (not item closures)
- **TASK-26 ID collision** — two distinct task files share id `task-26`; fix the duplicate id.
- **TASK-72** ("retire roadmap/inbox in favor of backlog") — directly conflicts with the settled `.claude/rules/governed-markdown-foundation.md` → close as **wontfix per rule** (or surface to operator), don't action.

### Keep — STILL-VALID (the bulk, ~150)
Live feature clusters untouched by 030, with cited code present: **026** capability-mediation (identity/capability/intercept/marker), **027** roadmap discoverability + parser/command-adapter, **028** front-door-completeness, **029** govern-operability barrage findings, the **016-anchor-unification** promoted items (feature 0/38, not started — promotion ≠ resolution), the **scope-discovery** enhancement wishlist (6/7/8/9/10/11), and the **426–441** items (the `govern-030-hardening` umbrella, open by design). One STILL-VALID doc-accuracy nit worth a cheap fix: `audit-barrage-lift-render.ts:103-104` JSDoc says "Degraded clean runs are NOT recorded" while the body records them (group D).

---

## Per-group deep-pass detail (raw sub-agent tables)


### Group A (deep-pass detail)

# Backlog cleanup review — Group A (2026-06-22)

Audited against current `src/` after 030 chunked-end-govern shipped (v0.53.0).
Feature ship-status read from `ROADMAP.md`. "Promoted-to a spec" is only treated as
resolution evidence when that spec's roadmap node is `status: shipped` AND the item's
notes carry RED/fix commit SHAs; promotion to a NOT-started spec (016-anchor-unification,
0/38) is NOT resolution.

## Cleanup candidates

| TASK | verdict | evidence (1 line) | recommended action |
|---|---|---|---|
| TASK-48 | MOOT-BY-030 | Cites `payload-implement.ts` over 500-line cap; `ls src/subcommands/ \| grep payload` → GONE (deleted by 030) | Close — file no longer exists |
| TASK-45 | LIKELY-RESOLVED | `impl:feature/installation-isolation` is `status: shipped`; `--repo-root` retired (clean-break-absence.test.ts asserts unknown-flag); govern now anchors `installation.root`; notes carry US1–US6 commits | Close (operator verify post-release) |
| TASK-12 | LIKELY-RESOLVED | Promoted to 014-audit-protocol-reliability (shipped); notes: US3 lift union-key = heading agreement only, commits e15e77a5/6b241c9b | Close |
| TASK-24 | LIKELY-RESOLVED | Promoted to 014-audit-protocol-reliability (shipped); US7 routes six sites through `resolveFeatureRoot` (confirmed import in scope-inventory.ts:40), commits 4897d7e4/a6323b59/518070dd | Close |
| TASK-28 | LIKELY-RESOLVED | Promoted to 014 (shipped); US6 scope-widen auto-seeds missing scope-discovery state, commits 04f457d4/65f51790 | Close |
| TASK-30 | LIKELY-RESOLVED | Promoted to 014 (shipped); legacy dw-lifecycle notice present in config-loader.ts:79/165/190 (probes `.dw-lifecycle/...`, emits IGNORED/read/migrate), commits 7c5c745c/e5240167 | Close |
| TASK-26 (watchdog) | LIKELY-RESOLVED | Promoted to spec:014-audit-barrage-reliability which is `status: shipped` ("timed-out/zero-byte runs observable/recoverable") | Close (verify watchdog landed) |
| TASK-54 | LIKELY-RESOLVED | Promoted to 021-friction-burndown (shipped); the "empty diff … plan context only" message no longer exists in non-test `src/` (only in test/comment strings) | Close |
| TASK-41 | LIKELY-RESOLVED | Promoted to 021 (shipped); end-govern-runtime.ts:189-196 now machine-distinguishes `fleet-floor-shortfall` vs `barrage-outage` in the FATAL | Close (verify the stderr contradiction is gone) |
| TASK-15 | LIKELY-RESOLVED | Promoted to spec:012-backlog-promotion-seam which is `status: shipped` | Close |
| TASK-47 | RE-SCOPE | Notes: 021 T026 forced `--find-renames` for committed/cross-tree arms (partial); residual = rename-pair ACROSS the installation boundary OR payload-size FATAL — explicitly "stays open" | Re-scope to the cross-boundary rename / payload-FATAL residual only |

## Still-valid / uncertain

| TASK | verdict | evidence (1 line) | recommended action |
|---|---|---|---|
| TASK-1 | STILL-VALID | `github-import.ts` `backend.exists(ref)` (line 54) still called per-issue; no batch-existence cache; quadratic re-read path intact | Keep |
| TASK-3 | STILL-VALID | `github-import.ts:114` still hardcodes `--limit 1000` (silent cap) | Keep |
| TASK-6 | STILL-VALID | scope-discovery v2 enhancement-class agents — "Captured for future expansion"; never built | Keep (enhancement) |
| TASK-7 | STILL-VALID | cross-language scanner packs — captured future expansion; not built | Keep (enhancement) |
| TASK-8 | STILL-VALID | studio control-plane for clones backlog — captured future expansion; not built | Keep (enhancement) |
| TASK-9 | STILL-VALID | cross-repo rollup view — captured future expansion; not built | Keep (enhancement) |
| TASK-10 | STILL-VALID | plugin-extension intercept to auto-wrap Agent dispatch — pending upstream Claude Code support | Keep (blocked-upstream) |
| TASK-11 | STILL-VALID | shared check-* CLI scaffold extraction; check-*.ts clones still un-refactored | Keep |
| TASK-16 | STILL-VALID | tooling-friction routing policy doc; adopter-facing docs change, not code; no evidence shipped | Keep (overlaps ROADMAP TASK-294) |
| TASK-17 | STILL-VALID | document-primitives AUDIT-54/55/56 residual hardening (chrome.ts fence length, unarchive-engine.ts parseLifted, package.json engines) — deferred edges, no fix evidence | Keep |
| TASK-20 | UNCERTAIN | 006 T052 keep-vs-replace `roadmap-legacy.peg` — explicit operator decision still open (option 1 is current state but "superseded, not done") | Operator decides keep vs replace |
| TASK-21 | STILL-VALID | roadmap edge-aware archival (curate --apply would dangle depends-on edges, FR-005); promoted to design:gap not a shipped spec | Keep |
| TASK-22 | STILL-VALID | promote target-path advisory cwd-relative; promoted to 016-anchor-unification (`status: planned`, 0/38) — NOT built | Keep |
| TASK-23 | STILL-VALID | no inverse un-promote/re-home verb on `backlog promote`; no such subaction in src | Keep |
| TASK-26 (help) | STILL-VALID | inconsistent `--help`; no `--help` handling found in roadmap.ts/backlog.ts/spec-check.ts | Keep |
| TASK-38 | STILL-VALID | `backlog capture` no ref-dedupe; only import-github checks `exists(ref)` | Keep |
| TASK-39 | STILL-VALID | session-end boundary derivation missed a 10-commit window; no fix evidence | Keep |
| TASK-42 | STILL-VALID | config-loader.ts:193 still branches on `activeOverridePath === undefined`, NOT file existence — an inactive/commented override file is still clobbered by the printed `mv` | Keep |
| TASK-43 | STILL-VALID | scope-inventory.ts:321-327 still FATALs on unresolvable feature root regardless of explicit `--prd-path`/`--out`; in 014 audit-log but no fix/promotion | Keep |
| TASK-44 | STILL-VALID | R7 probe segment-array gap; `001-IN-PROGRESS` direct constructions still present (scope-inventory.ts:329, scope-widen.ts:299, scope-export.ts:181, slush-findings.ts:142); no widened-probe evidence | Keep |
| TASK-46 | STILL-VALID | Spec Kit `has_git()` misses enclosing worktree from relocated `.specify` root; common.sh behavior unchanged | Keep |
| TASK-49 | STILL-VALID | isolation fixtures unbounded walk-up; promoted to 016-anchor-unification (NOT started) | Keep |
| TASK-50 | STILL-VALID | `resolveSpecPath` unanchored regex; promoted to 016 (NOT started); `resolveSpecPath` still in govern-vars.ts | Keep |
| TASK-51 | STILL-VALID | `backlog capture`/`import-github` expose no `--at`; promoted to 016 (NOT started) | Keep |
| TASK-52 | STILL-VALID | `FATAL —` wording inconsistency across verbs; promoted to 016 (NOT started) | Keep |
| TASK-53 | STILL-VALID | `backlog import-slush` resolves audit-log from raw cwd; promoted to 016 (NOT started) | Keep |
| TASK-55 | STILL-VALID | nested installs don't inherit repo-root barrage config; promoted to 016 (NOT started) | Keep |
| TASK-56 | STILL-VALID | govern feature-resolution vs slush-step anchor disagreement; promoted to 016 (NOT started) | Keep |

## Notes

- TASK-26 has an ID COLLISION: two distinct files share `TASK-26` (audit-barrage spawn watchdog
  → LIKELY-RESOLVED; inconsistent `--help` → STILL-VALID). The collision itself is a backlog-hygiene
  defect worth flagging to the operator.
- Items promoted to **016-anchor-unification** (TASK-22/49/50/51/52/53/55/56) are queued but NOT built
  (ROADMAP: "Not started: 0/38") — conservatively kept STILL-VALID, not closed.


### Group B (deep-pass detail)

# Backlog cleanup review 2026-06-22 — group B

Audit context: 030 chunked-end-govern shipped (v0.53.0). Per-phase checkpoints (`checkpoint-state.ts`, `phase-checkpoints/`, govern `--phase`), whole-feature composition (`resolveComposingFeatureUnit`), and `payload-implement.ts` are DELETED. Govern is now whole-feature govern-at-end (chunked) over the committed `governedSha..HEAD` diff. Verified: `src/govern/checkpoint-state.ts`, `incremental-audit.ts`, `resolvePhaseUnit`, `PATH_TOKEN_RE`, `writePhaseCheckpoint` all absent from `src/`.

## Cleanup candidates (top)

| TASK | verdict | evidence (1 line) | recommended action |
|------|---------|-------------------|--------------------|
| 58 | CLOSED-UPSTREAM | gh-458 CLOSED ("untracked files folded with absolute a/Users paths") | Close — verify in installed release per closure rule. |
| 59 | CLOSED-UPSTREAM | gh-455 CLOSED ("session-end auto-derives Commits:0 on long-lived branches") | Close — verify in installed release. |
| 73 | CLOSED-UPSTREAM | gh-469 CLOSED ("per-phase backfill governance friction"); per-phase mechanism also 030-deleted | Close. |
| 70 | CLOSED-UPSTREAM + MOOT-BY-030 | gh-468 CLOSED; cited `src/govern/incremental-audit.ts`, `resolvePhaseUnit`, `PATH_TOKEN_RE`, `payload-implement.ts` all DELETED | Close — per-phase scoping mechanism gone. |
| 97 | MOOT-BY-030 | AUDIT-55 cites `src/govern/checkpoint-state.ts:78-84,205-224` — file DELETED (checkpoint freshness path removed) | Close. |
| 109 | MOOT-BY-030 | AUDIT-81 cites `checkpoint-state.ts:58-63` `writePhaseCheckpoint()` — file/symbol DELETED | Close. |
| 130 | LIKELY-RESOLVED | `src/session/chain-position.ts:79-104` `isFullyImplemented()` + "TASK-130 bug" comment returns null for finished spec | Close — verify session-start no longer nominates a complete spec. |
| 137 | LIKELY-RESOLVED | roadmap node `impl:gap/roadmap-edge-mutation-and-cluster` is `status: shipped` (specs/027); `move-edge` verb present (`roadmap.ts:126`); node text says it ABSORBS TASK-137 | Close — reparent = `move-edge` shipped. |
| 144 | LIKELY-RESOLVED | roadmap node `impl:feature/terminal-closure` (specs/023) now `status: shipped` in ROADMAP.md — the task's goal ("graduate to shipped") achieved | Close — confirm convergence record exists. |
| 148 | LIKELY-RESOLVED (gh-472 open) | `roadmap advance <id> --to` exists (`roadmap.ts:80,229-231,388`); part of shipped 027 work. gh-472 still OPEN (agent doesn't close upstream) | Close backlog item; post evidence on gh-472, operator closes. |
| 133 | LIKELY-RESOLVED | `reconcile --unorphan <spec>` flag now present (`roadmap.ts:71-73`, apply:true) — the report-only-needs-hand-edit gap addressed | Close — verify the unorphan apply path. |
| 69 | LIKELY-RESOLVED | README.md `### Codex` section (lines 55-79) gives clean-session `codex plugin marketplace add ...@<release-tag>` install/update path | Close — the requested adopter Codex section exists. |
| 147 | LIKELY-RESOLVED (gh-480 open) | `skills/session-start/SKILL.md:28` now quotes bare `stackctl session-start`, not `plugins/stack-control/bin/stackctl`. gh-480 still OPEN | Close backlog item; post evidence on gh-480. |
| 110 | RE-SCOPE | AUDIT-82 cited deleted `checkpoint-state.ts:144-158`; SAME defect (non-regular FS entries → `readFileSync`) reappears in NEW `src/govern/scope-fingerprint.ts:77` (only symlink+dir guarded) | Re-scope onto `scope-fingerprint.ts` `digestScopedPath` — reject FIFO/socket/device, fail loud. |
| 77 | RE-SCOPE | phase-checkpoints artifact 030-DELETED (moot); `fleet-knowledge.yaml` part now has setup surface (`src/setup/scaffold.ts:124`, `verify.ts:44 verifyFleetKnowledge`) but only light verify | Re-scope to fleet-knowledge doctor/schema depth only; drop the checkpoint half. |
| 113 | RE-SCOPE | AUDIT-85 cites checkpoints (DELETED, moot) + `fleet-knowledge.yaml`; latter now scaffolded/verified in setup but no full schema/doctor rule | Same as 77 — re-scope to fleet-knowledge schema/doctor; drop checkpoint half. Possible DUPLICATE-OF TASK-77. |
| 119 | RE-SCOPE | AUDIT-92 asks for structured signal vs prose; code now uses anchored `/^audit-barrage: FLOOR SHORTFALL\b/m` (`protocol.ts:370`) — incidental-substring risk fixed, but still parses prose not exit-code/marker | Re-scope to "emit structured machine-readable terminal kind from barrage layer" (root ask); the substring-anchoring is done. |

## Still-valid / uncertain (below)

| TASK | verdict | evidence (1 line) | recommended action |
|------|---------|-------------------|--------------------|
| 63 | STILL-VALID | AUDIT-20260612-06 (portability) "Quickstart records test references as scenario results" — empty body; not a govern-mechanism finding, untouched by 030 | Read AUDIT body in specs/017-portability/audit-log.md; keep. |
| 66 | STILL-VALID | AUDIT-20260612-10 (portability) "Release helper has no first-release version path"; `src/subcommands/release-helper.ts` present | Verify first-release path in release-helper.ts; keep. |
| 72 | STILL-VALID | `src/subcommands/{roadmap,inbox}.ts` both present — not retired. NOTE: `.claude/rules/governed-markdown-foundation.md` SETTLED "keep governed markdown"; conflicts with retiring roadmap | Strategic — operator owns; flag tension with the settled foundation rule. |
| 74 | STILL-VALID | "per-phase govern must have mechanical teeth" — per-phase deleted, BUT the underlying ask (govern cannot be silently skipped) maps to 030's whole-feature graduate gate; needs re-read | Operator: confirm 030 graduate gate satisfies the intent, else re-scope. |
| 75 | STILL-VALID | boundary right-sizing helpers — `phase-boundary-sizing.ts` survives (rekeyed to generic `id`); chunk bin-packer is the 030 successor but the planning-time sizing UX ask is unbuilt | Re-read against 030 chunk manifest; keep or re-scope to chunk-sizing UX. |
| 76 | STILL-VALID | autonomous fleet negotiation — `src/govern/fleet-negotiation.ts`, `lane-capabilities.ts` present; preflight/model-discovery ask unbuilt | Keep. |
| 82 | STILL-VALID | govern CLI parser still lacks `--models` flag while `protocol.ts:488` error text + audit-barrage advertise `GOVERN_MODELS/--models`; only env var works (`govern.ts:239`) | Keep — add `--models` to govern parser or fix error text. |
| 99 | STILL-VALID | AUDIT-57: `phase-boundary-sizing.ts:72` still uses `Number.isInteger` (not `isSafeInteger`); `estimateBoundary` multiplies without safe-int check — surviving 030 code | Keep — exact defect present. |
| 106 | STILL-VALID | AUDIT-75: `measureBoundaryFit` still rejects `measuredPromptBytes===0` via `assertPositiveInteger` (`phase-boundary-sizing.ts:60-72`) — zero-byte boundary still an error | Keep — surviving code; verify chunk path hits this. |
| 108 | STILL-VALID | AUDIT-79: `estimateBoundary` (`phase-boundary-sizing.ts:34-43`) still does not validate empty `paths` → `fits=true` for zero paths | Keep — surviving code. |
| 116 | STILL-VALID | `govern-orchestration.test.ts:149`, `govern-unresolvable-root.test.ts`, +others do inline `git init` with NO `gpgsign=false`; shared harness exists but cited fixtures not routed through it | Keep — route all inline-git fixtures through hermetic helper. |
| 126 | STILL-VALID | recovery sentence "Check that the configured model-family CLIs are installed and reachable" still ships UNCONDITIONALLY for both kinds (`protocol.ts:373`, `end-govern-runtime.ts:193`); only the kind LABEL is conditional | Keep — make recovery advice conditional on `isFloorShortfall`. |
| 127 | STILL-VALID | `govern-terminal-outcomes.test.ts` has no floor-shortfall-vs-outage case (only timeout config); split untested | Keep — add stub-barrage nonzero ± FLOOR SHORTFALL line contract test. |
| 128 | STILL-VALID | `specs/015-.../contracts/incremental-audit.md:12,17,21` still documents `resolveComposingFeatureUnit` (deleted) + `## Phase N:` colon-only grammar; doubly-stale post-030 | Keep — doc cleanup; whole contract now describes a deleted mechanism. |
| 134 | STILL-VALID | promoted to roadmap `multi:feature/release-resolution-cycle` (`status: planned`) — tracked, not built | Keep — record-only backlog item; work lives in roadmap node. |
| 135 | STILL-VALID | promoted to roadmap `multi:feature/backlog-promotion-mechanization` (`status: planned`) — tracked, not built | Keep — record-only; work in roadmap node. |
| 138 | STILL-VALID | tracking item to re-enable spec-govern as default-required; spec-audit still parked opt-in per `.claude/rules/spec-audit-diminishing-returns.md` STATUS line | Keep — open by design until protocol reliable. |
| 140 | STILL-VALID | `src/workflow/redesign.ts` present; hardcodes the `*→designing` re-entry effect rather than executing WORKFLOW.md transition:redesign; 030 only changed the stale-on-re-entry behavior | Keep — verify against 022 redesign intent. |
| 142 | STILL-VALID | AUDIT-20260616-11: `compass.ts:15 ordinal()=findIndex`; verdict converts `.next` back to array index — array-position dependency unfixed exactly as the finding describes | Keep — derive ordinals from validated linear projection. |
| 141 | UNCERTAIN | `convergence-record.ts:211 convergenceFingerprint` filters `!rel.startsWith('..')` (leading-only), BUT passes survivors to `computeScopeFingerprint` which now rejects embedded dot-segments + escapes (`scope-fingerprint.ts:88,93`) — downstream guard may mitigate | Human read: does the relative-map ever yield an embedded-`..` that bypasses both? |
| 143 | UNCERTAIN | `writeGovernConvergenceRecord` (`convergence-record.ts:55-65`) does atomic temp+rename and would throw on write failure; the 024 "exits 0 on unwritable record" path needs verifying against node-less standalone govern flow | Human read: trace node-less govern exit code on unwritable convergence dir. |

## Counts

- CLOSED-UPSTREAM: 4 (58, 59, 70, 73)
- MOOT-BY-030: 2 (97, 109)
- LIKELY-RESOLVED: 7 (130, 137, 144, 148, 133, 69, 147)
- RE-SCOPE: 4 (110, 77, 113, 119)
- STILL-VALID: 19 (63, 66, 72, 74, 75, 76, 82, 99, 106, 108, 116, 126, 127, 128, 134, 135, 138, 140, 142)
- UNCERTAIN: 2 (141, 143)

Cleanup candidates (CLOSED-UPSTREAM + MOOT-BY-030 + LIKELY-RESOLVED + RE-SCOPE): 58, 59, 70, 73, 97, 109, 130, 137, 144, 148, 133, 69, 147, 110, 77, 113, 119


### Group C (deep-pass detail)

# Backlog cleanup review — Group C (2026-06-22)

Context: 030 chunked-end-govern shipped (v0.53.0). Verified deletions in current source: `govern.ts` = 333 lines (was 958); `payload-implement.ts` GONE; `writeResolvedPhaseCheckpoint` / `resolveComposingFeatureUnit` / `compositionExcludePaths` / `carriedFilesForComposition` GONE from non-test src; `govern --phase` + `GOVERN_CHECKPOINT` rejected loud in implement mode (clean break, govern.ts:129-145). `capability-reconcile.ts` was rewritten by 030 (FR-018/025) to read the single whole-feature `isImplFeatureConverged` instead of per-phase checkpoint states.

## Cleanup candidates (top)

| TASK | verdict | evidence (1 line) | recommended action |
|---|---|---|---|
| 151 | LIKELY-RESOLVED | `govern.ts` decompose was the ask; now 333 lines (under 300-500 cap), split across 26 modules in `src/govern/`. | Close — decompose done (by 030). |
| 184 | MOOT-BY-030 | Finding (135) was a checkpoint-state type predicate at capability-reconcile.ts:64-66; 030 retired the per-phase checkpoint apparatus (reconcile now uses `isImplFeatureConverged`); cited predicate gone. | Close MOOT. |
| 186 | MOOT-BY-030 | Finding (137) "no governable phases + missing-checkpoint flag on legacy specs" targets per-phase checkpoint logic at reconcile.ts:48-66; current code is whole-feature `isImplFeatureConverged`, no per-phase governable-phases path. | Close MOOT. |
| 189 | MOOT-BY-030 | Finding (140) "gate-symmetry for all three branches, tested only for phased-missing" — the three-branch per-phase checkpoint gate is gone; graduate-impl collapsed to a single criterion; reconcile test now covers un-converged/orphan/report-only. | Close MOOT. |
| 245 | MOOT-BY-030 | "per-phase govern excludes the phase's own tests" — `govern --phase` and per-phase payload scoping are deleted; govern audits the whole committed feature diff; `src/govern/payload-diff-scope.ts` has no `phase` scoping. | Close MOOT. |
| 264 | MOOT-BY-030 | "claude lane times out on the 24KB full-feature payload" — 030 chunking bounds each chunk to `renderBudgetBytes` (FR-027, `src/govern/payload-chunk.ts`); the unbounded whole-feature payload that caused the 311s timeout no longer exists. (Config `timeout_secs_per_kb` mechanism still present but the trigger is gone.) | Close MOOT (re-open as config tuning only if a chunk still over-runs). |
| 243 | RE-SCOPE | gitignore half DONE (`**/.stack-control/state/` at root .gitignore:168); but `git ls-files` shows `state/front-door/57b16bd2-...json` STILL TRACKED — the `git rm --cached` cleanup is the live remnant. | Re-scope to: `git rm --cached` the one tracked stale marker; then close. |

## Still valid / uncertain (below)

| TASK | verdict | evidence (1 line) | recommended action |
|---|---|---|---|
| 150 | STILL-VALID | imported-issue gh-470 is OPEN upstream (`gh issue view 470` → state OPEN); large anti-halting protocol-design issue, partly related to 025/030 but not closed. | Keep; track against unskippable-workflow-protocol. |
| 158 | STILL-VALID | `src/__tests__/fixtures/capability-fixtures.ts:60-62` git helper still throws `failed: ${r.stderr ?? ''}` with no `r.error`. | Keep (low). |
| 162 | STILL-VALID | `src/capability/identity.ts` (487 lines) parseCommands present; function-body-names-backend under-match not closed (no brace-tracking). | Keep (parser-hardening). |
| 163 | STILL-VALID | `identity.ts` parseCommands still a single char-state machine; tokenizer not extracted; residual under-match edges open. | Keep (refactor). |
| 164 | STILL-VALID | session-id equality spike never run; marker is session-keyed (`src/capability/marker.ts`); live acceptance unverified. | Keep (spike). |
| 165 | STILL-VALID | speckit-guard (deprecated) reads legacy env var vs interceptor reading file marker; inconsistency stands. | Keep (low; deprecated verb). |
| 166 | STILL-VALID | `src/subcommands/capability.ts:46` `const arg = args[i]!;` non-null assertion present. | Keep (low). |
| 167 | STILL-VALID | `capability.ts:10` `USAGE = 'usage: stackctl capability <list> ...'` — `<list>` brackets a literal. | Keep (low). |
| 168 | STILL-VALID | `capability.ts:6` forward-ref comment "Phase 5 adds the reconcile subaction" still present (now stale — reconcile shipped). | Keep (low; trivial comment fix). |
| 172 | STILL-VALID | `capability.ts` USAGE/`sub !== 'list'` error omits `reconcile` though cli.ts:148 dispatches it. | Keep (medium). |
| 174 | LIKELY-RESOLVED→verify | Finding (125) opaque-throw on non-dir/dangling specs: reconcile.ts now has `isDirectorySafe` (line 31, "claude-04") + per-entry try/catch (line 67). Cited defect fixed during 030 rewrite. | Likely close; operator confirm the specific edge is covered. |
| 182 | STILL-VALID | `capability-reconcile.ts:138-142` `runReconcileCli` still writes stdout then `process.exit()` (truncation pattern unchanged). | Keep (medium). |
| 183 | UNCERTAIN | Finding (134) "no clean-fully-governed-feature test"; reconcile.test.ts rewritten (132 lines, uses `isImplFeatureConverged`); whether a converged-clean case is now asserted needs a read. | Human read of reconcile.test.ts. |
| 187 | STILL-VALID | `capability-reconcile.ts:62,71` `capability: 'spec-execution'` hardcoded. | Keep (low). |
| 188 | STILL-VALID | `capability-reconcile.ts:108-118` `--at` consumes `args[i+1]` without rejecting a following flag. | Keep (low). |
| 218 | STILL-VALID | `src/subcommands/intercept.ts:9-17` + `capability/intercept.ts` still key marker on resolved cwd; nested-install mismatch → opaque refusal; diagnostic not added (FR-023 comment is a forward-ref, not a fix). | Keep (medium). |
| 220 | STILL-VALID | `src/capability/marker.ts:46` `STALE_AGE_MS = 12h`, `isFresh` prune, no mid-drive renewal. | Keep (low). |
| 226 | STILL-VALID | `src/__tests__/capability/purity.test.ts:21` `stripComments` present; string-literal false-negative unaddressed. | Keep (low). |
| 227 | STILL-VALID | `purity.test.ts:17` hardcoded `CORE = ['mediate.ts','identity.ts','registry.ts','intercept.ts']` allowlist. | Keep (low). |
| 228 | STILL-VALID | `purity.test.ts:51-65` codex parity test calls `mediateCheck` directly, bypassing the Codex adapter. | Keep (medium). |
| 230 | STILL-VALID | `src/__tests__/capability/no-backend-writes.test.ts:16` `listFiles` weaker snapshot present; blind to deletions/same-size. | Keep (medium). |
| 234 | STILL-VALID | `no-backend-writes.test.ts:11-53` FR-018 tests miss destructive/same-size mutations. | Keep (medium). |
| 235 | STILL-VALID | `installation-isolation-probe.test.ts:359-372` mediate-check "writes nothing" asserts `diffSnapshots(...).toEqual([])` — vacuous (no write path). | Keep (medium). |
| 236 | STILL-VALID | `no-backend-writes.test.ts:29` `changed()` = "created or content-changed" — ignores deletions. | Keep (medium). |
| 237 | STILL-VALID | `installation-isolation-probe.test.ts:359-372` duplicate `--at`-threading test present. | Keep (low). |
| 238 | STILL-VALID | `no-backend-writes.test.ts:16-29` reimplements snapshot/diff instead of reusing harness. | Keep (low). |
| 239 | STILL-VALID | `installation-isolation-probe.test.ts:~353` hardcodes `state/front-door/sess.json` path. | Keep (low). |
| 240 | STILL-VALID | `installation-isolation-probe.test.ts:349-372` front-door anchoring tests call `enterFrontDoor`/`mediateCheck` directly, not the CLI command. | Keep (medium). |
| 244 | STILL-VALID | `spec` is a path field, NOT a unit-reference edge; `add-edge` (`requireUnitRefField`, `edge-mutations.ts:42`) rejects `--field spec`; no verb stamps `spec:` on an existing node. Workaround `govern --feature` stands. | Keep (gap; 027 did not cover spec-pointer stamping). |
| 261 | STILL-VALID | `src/cli-help/command-adapter.ts:10` header attributes `undefined→false` to "commander's boolean convention". | Keep (low). |
| 262 | STILL-VALID | `command-adapter.ts:43` retains `codex-02` citation while sibling citations were purged (cosmetic inconsistency). | Keep (informational). |
| 268 | STILL-VALID | `tests/cli/parser-adapter.test.ts:130` now pins whole `KNOWN_SUBACTIONS` list; finding's independent-literal-anchor concern is a test-quality judgment, not 030-related. | Keep (low). |
| 269 | STILL-VALID | `tests/cli/parser-adapter.test.ts:~144` hardcodes `"unknown flag --bogus for 'advance'"` instead of single-sourcing. | Keep (low). |


### Group D (deep-pass detail)

# Backlog cleanup review 2026-06-22 — Group D

Context: 030 chunked-end-govern shipped (v0.53.0). Per-phase checkpoints, the
whole-feature composition path, and `payload-implement.ts` were DELETED; govern
is now whole-feature govern-at-end auditing the committed `governedSha..HEAD` diff.

## Cleanup candidates (resolved / moot / closed / re-scope)

| TASK | verdict | evidence (1 line) | recommended action |
|------|---------|-------------------|--------------------|
| TASK-295 | CLOSED-UPSTREAM + LIKELY-RESOLVED | `gh issue view 487` → CLOSED; `runJscpd` now returns `null` on zero-files (empty-scan, not throw) — jscpd-runner.ts:55-62 cites "TASK-295 / #487"; govern no longer aborts on non-TS trees | Close — primary customer-blocking defect fixed; language-awareness remnant lives on as TASK-296 |
| TASK-301 | MOOT-BY-030 | Core defect = per-phase checkpoint staleness gate ("earlier required checkpoints" at govern.ts:446 + `--phase`); grep for `earlier required checkpoints`/`phaseCheckpoint`/`refresh-checkpoint` in src → 0 hits; gate-eval.ts:147 comment: "the either-of arm and `all-phase-checkpoints-current` criterion are DELETED" | Close — the entire staleness/checkpoint mechanism it asks to fix is gone |
| TASK-353 | MOOT-BY-030 | Per-phase re-stale loop + US7 hunk-fingerprints + co-govern/batch-graduate for coupled phases; no `hunkFingerprint`/`phaseCheckpoint`/`reStale` in src; whole-feature govern-at-end IS the batch-graduate path it requested | Close — per-phase entanglement loop replaced by whole-feature govern |
| TASK-354 | RE-SCOPE | "per-phase payload" framing obsolete (no per-phase); underlying gap = liveness window not payload-scaled; whole-feature payloads are LARGER so more relevant; near-duplicate of TASK-324 root (timeout-derivation.ts scales floor, not liveness window) | Re-scope to "adaptive per-lane liveness window for whole-feature payloads" or fold into TASK-324 |

## Still valid (cited code present, defect reproducible) + uncertain

| TASK | verdict | evidence (1 line) | recommended action |
|------|---------|-------------------|--------------------|
| TASK-271 | STILL-VALID | parser-adapter.test.ts:134-142 present; test no longer asserts the `roadmap:` prefix (asserts `unknown flag --bogus for 'advance'` only) — the finding's exact gap | Keep — test-quality hardening |
| TASK-274 | STILL-VALID | help-surface.test.ts:31-32 still `toMatch(/list the ready/)` + `/dry-run unless --apply/` (brittle prose fragments) | Keep |
| TASK-275 | STILL-VALID | help-nondrift.test.ts:31-32 `tmpChain()` uses `mkdtempSync` with no `afterEach` cleanup | Keep |
| TASK-276 | STILL-VALID | `shownFlags` regex present (help-nondrift.test.ts:58); structural line-start anchor unchanged | Keep |
| TASK-280 | STILL-VALID | help-nondrift `add` spot-check asserts only `--status`/`--scope`/`--part-of` (3 of N flags); title says "all accepted" | Keep |
| TASK-281 | STILL-VALID | `VALID_INVOCATION` fixtures present; boolean flags (`--apply`, defer `--clear`) still not exercised | Keep |
| TASK-282 | STILL-VALID | `isUnknownFlagOrSubaction` substring discriminator present in help-nondrift.test.ts | Keep |
| TASK-283 | STILL-VALID | `shownFlags` short-alias regex `-x, --long` present; comma-separator dependency unchanged | Keep |
| TASK-284 | STILL-VALID | help-surface.test.ts:51,61 still calls `roadmapStatusVocabulary()` and asserts all in `advance --help` | Keep |
| TASK-285 | STILL-VALID | `VALID_INVOCATION` present; no symmetric guard against phantom entries for removed subactions | Keep |
| TASK-286 | STILL-VALID | `add` spot-check comment present; overstates coverage vs check (3) | Keep |
| TASK-287 | STILL-VALID | help-surface.test.ts top-level test uses substring checks, no per-subaction summary assertion | Keep |
| TASK-296 | STILL-VALID | `FORMATS = 'typescript,tsx'` still hardcoded at jscpd-runner.ts:35 — clone DETECTION TS-only; follow-on gap to resolved TASK-295 | Keep |
| TASK-297 | UNCERTAIN | backlog gained a `done` verb (backlog.ts `emitDone`, AUDIT-20260619-75) — but that finding says `--reason` is dropped (not persisted); whether a sanctioned closure path now fully exists needs human read | Keep — verify whether `backlog done`/archive now satisfies the closure-verb gap |
| TASK-298 | STILL-VALID | No `analyze-clean`/`design-approved` marker verb; no node-marker effect in workflow/effects.ts (independent of 030) | Keep |
| TASK-299 | STILL-VALID | backlog capture ENAMETOOLONG from untruncated title (independent of 030); not verified fixed | Keep |
| TASK-300 | STILL-VALID | `CommandDescriptor` flat shape in src/cli-help/command-surface.ts (028 design consideration; operator owns deviate-vs-keep) | Keep |
| TASK-302 | STILL-VALID | `assertSurfaceComplete` does not validate flag descriptions; blocked-until-T013 noted in body | Keep |
| TASK-308 | STILL-VALID | `SELF_HELP_VERBS = new Set(['roadmap'])` hardcoded at cli.ts:161; no `selfHandlesHelp` descriptor field | Keep |
| TASK-309 | STILL-VALID | chain-position.ts:105 `isFullyImplemented(join(featureAbs, 'tasks.md'))` hardcodes path independent of `['tasks','tasks.md']` table | Keep |
| TASK-311 | STILL-VALID | verb-reference.ts:34 `ArtifactFlag` carries only `arg/required/description`; `flagsObject` drops `shortFlag` | Keep |
| TASK-312 | STILL-VALID | intercept.ts:32 `resolveInstalled?` still optional with `?? true` default (line 94); proposed make-required fix not done | Keep |
| TASK-313 | STILL-VALID | quickstart.md:149 future-date validation record (doc-quality, 028); not corrected | Keep |
| TASK-314 | STILL-VALID | quickstart.md:153 SC-002/SC-003 consolidated entry (doc-quality, informational); not split | Keep |
| TASK-319 | STILL-VALID | 029 config-shape-only test gap; barrage config-loader/timeout code present, no runtime reliability proof | Keep |
| TASK-320 | STILL-VALID | synchronous `expect(child.kills)` after fake-timer fragility; spawn-cli/timeout test code present | Keep |
| TASK-321 | STILL-VALID | config-default.test.ts deny-list loop omits `WebFetch`/`WebSearch` (shipped in template but not asserted) | Keep |
| TASK-324 | STILL-VALID | templates/audit-barrage-config.yaml `liveness_window_seconds: 300` fixed; timeout-derivation.ts scales floor not window | Keep (root of TASK-354) |
| TASK-325 | STILL-VALID | 029 research.md Alternatives deferral phrase without tracking issue (doc-quality); not addressed | Keep |
| TASK-328 | STILL-VALID | `FakeChild.stdin = null` vs `{{prompt-stdin}}` test-fixture mismatch; spawn test code present | Keep |
| TASK-329 | STILL-VALID | `livenessWindowSeconds` assertion floor 240s present in barrage config tests | Keep |
| TASK-330 | STILL-VALID | `timeoutFloorSeconds > 300` permissive assertion present in barrage config tests | Keep |
| TASK-336 | STILL-VALID | check-barrage-dampener.ts diagnostic block returns on first match (HIGH+ before degraded); ordering unchanged | Keep |
| TASK-339 | STILL-VALID | only test calling `renderQuietSection` (dampener-raw-counting.test.ts:84) uses the healthy path, no degraded fleet arg; render→parse degraded contract still untested | Keep |
| TASK-340 | STILL-VALID | renderQuietSection JSDoc (audit-barrage-lift-render.ts:103-104) still says "Degraded clean runs are NOT recorded" while the body DOES record them | Keep |
| TASK-341 | STILL-VALID | `DEGRADED_MARKER_RE = /Fleet:\s*DEGRADED\b/i` (check-barrage-dampener.ts:31) — has trailing `\b`, no LEADING word boundary | Keep |
| TASK-342 | STILL-VALID | renderQuietSection JSDoc (line 95-105) contradicts the implemented degraded-recording branch (line 122+) | Keep |
| TASK-344 | STILL-VALID | renderQuietSection degraded path has no unit test (only healthy-path call exists) | Keep |
| TASK-345 | STILL-VALID | `completedNonConvergedAnnotation` + `reportBytes` present in run-artifacts.ts; nonzero-exit drop when reportBytes===0 unchanged | Keep |
| TASK-350 | STILL-VALID | `renderQuietSection` still named so despite dual healthy/degraded responsibility (audit-barrage-lift-render.ts:106) | Keep |
| TASK-351 | STILL-VALID | renderQuietSection JSDoc/comments still describe degraded clean runs as unrecorded | Keep |
| TASK-355 | STILL-VALID | `singleRunCleanEngages` gates on `rawHighPlusCount` (check-barrage-dampener.ts:383,279) while reason-text says "NEW-or-persistent HIGH+" | Keep |
| TASK-356 | STILL-VALID | no round-trip test between renderQuietSection degraded path and `checkBarrageDampener` (the one test uses hand-crafted input) | Keep |


### Group E (deep-pass detail)

# Backlog cleanup review — Group E (2026-06-22)

Audited 50 open backlog tasks against current source (post-030 chunked-end-govern, v0.53.0).
Verdicts verified by grep/read of `src/`, `tests/`, a `tsc --noEmit` run, and task-body reads.
Do NOT close anything from this report — evidence only; operator owns the transition.

## Cleanup candidates (resolved / moot)

| TASK | verdict | evidence (1 line) | recommended action |
|------|---------|-------------------|--------------------|
| 366 | MOOT-BY-030 | `writeResolvedPhaseCheckpoint` + per-phase checkpoint mechanism deleted in 030; grep finds 0 hits in `src/` (only test-fixture/clean-break-absence references). The "normal graduation record-write FATAL" path it cited lived in the deleted per-phase code. | Close as moot-by-030. Note: whole-feature record-first FATAL now lives in `govern-arms.ts` (record-first ordering, lines 156-291) and is independently covered. |
| 367 | MOOT-BY-030 | Per-phase override exit-code inconsistency cited the old `payload-implement.ts`/per-phase govern path; `govern.ts` collapsed 958→333 lines, per-phase block gone. | Close as moot-by-030. If exit-code consistency is still wanted on the new whole-feature path, file fresh. |
| 369 | MOOT-BY-030 | Cited a `// deferred work` marker in the per-phase govern comment block; grep `deferred/TODO/for now` in current `govern.ts` returns nothing — that block was deleted. | Close as moot-by-030. |
| 379 | MOOT-BY-030 | Specific defect = "phase checkpoint written without a convergence record." Phase-checkpoint writing is deleted. The record-first invariant survives in new form (`govern-arms.ts:146` explicitly guards `convergenceItem === undefined`), so the *phase-checkpoint* failure mode is gone. | Close as moot-by-030; the live record-first guard is already in `govern-arms.ts`. |
| 408 | MOOT-BY-030 | Operator decision in task body (2026-06-21): single-file-over-envelope fails loud (never FATAL-bypass), no hunk-split / split-file entity; `envelope-binpack` enforces. spec corrected. | Close as wontfix-per-operator-decision. |
| 411 | MOOT-BY-030 | Operator decision in task body (2026-06-21): split-file wording removed; only `SplitClusterMarker` (multi-file cluster sub-split) exists in the entity model. | Close as wontfix-per-operator-decision. |
| 412 | MOOT-BY-030 | The "delete per-phase modules" residual: compose-convergence / phase-checkpoint-status / checkpoint-state / incremental-audit modules NOT found in `src/` (0 hits); per-phase path deleted; `execute-check.ts` confirms helpers retired. This *is* the work 030 did. | Close as resolved (this was the 030 deletion task itself). |
| 416 | LIKELY-RESOLVED | GOVERN_CHECKPOINT rejection is now MODE-SCOPED: `govern.ts:134 if (flags.mode === 'implement')` rejects checkpoint; comment "Spec mode KEEPS its checkpoint label." Task title was "fires for all modes including spec" — no longer true. | Close as likely-resolved (verified in `govern.ts:129-142`). |
| 423 | LIKELY-RESOLVED | non-audit-trim now retains trimmed files as `coverageOnlyFiles`; all-non-audit cluster emits a single coverage-only chunk with `marker: null` (`envelope-binpack.ts:45-115`); markers require `subChunkIds.length >= 2`, so no dangling `SplitClusterMarker` (FR-028). | Close as likely-resolved; recommend a confirming RED test if not present. |
| 413 | RE-SCOPE | `payload-implement.ts` DELETED (gone) and `govern.ts` = 333 lines (under cap) — core FR-022 intent met. Remnant: deeper "CLI dispatches to `runEndGovern` object output" wiring not done (not required for the cap). | Re-scope to the remaining pipeline-output wiring only (overlaps TASK-417); close the cap/decompose portion. |

## Still-valid / uncertain (keep open)

| TASK | verdict | evidence (1 line) | recommended action |
|------|---------|-------------------|--------------------|
| 377 | STILL-VALID | `convergence-record.ts:143` validates `override` as boolean (accepts `false`) but `:181` spreads `override: true` only when `=== true` — a `false` is silently dropped. | Narrow type to `override?: true` or persist `false` explicitly. |
| 378 | STILL-VALID | `tests/backlog/done.test.ts` calls `tmpBacklog()` with no `rmSync`/`afterEach`/`finally` cleanup — tmp dirs leak. | Add cleanup hooks. |
| 380 | STILL-VALID | `override-graduate.ts:~101` hardcodes `spec-governance gate` attribution label regardless of `args.mode`. | Make label mode-aware. |
| 386 | UNCERTAIN | Cited symbol `gitRefResolves` does NOT exist in `src/` (0 hits); task body is frontmatter-only (no Repro/file:line). `payload-diff-scope.ts:110,132` now DO check `r.error?.message`, suggesting the pattern may already be handled under a different name. | Human read: confirm whether the helper was renamed/folded; if `r.error` is handled everywhere, re-scope or close. |
| 389 | STILL-VALID | `tsc --noEmit` (run 2026-06-22) still fails: `src/release/portable.ts(100,14)/(100,43)/(107,31)` TS2339 "Property 'source'/'path' does not exist on type 'object'." Typecheck gate not green. | Fix the object typing in `portable.ts`. |
| 395 | UNCERTAIN | `graduate-impl` target validation exists (`gate-eval.ts:149`); `graduate-gate.test.ts` covers happy path but no invalid-target case found. | Add invalid-target test if missing. |
| 396 | STILL-VALID | Either-of arm deleted in `gate-eval.ts:145-148`; pre-030 instantiated workflow files keep the old recorded gate; no migration for retroactive gate-structure update found. | Add migration or document upgrade path. |
| 397 | STILL-VALID | `governedShaBase` stored as plain string in `chunk-artifacts.ts`; no SHA-format validation (grep yields only the field decl). | Add git-ref plausibility validation. |
| 402 | STILL-VALID | File DOES exist at `tests/roadmap/cluster-no-nonnull.test.ts` (batch agent searched only `src/`). Lines 29-33: comment-strip only handles `//` and `*` lines + string/template literals — `/* */` block comments NOT stripped. | Extend strip to block comments. |
| 404 | STILL-VALID | Same file `tests/roadmap/cluster-no-nonnull.test.ts:31-33` strips strings/templates but NOT regex literals; a `!` inside a regex literal is a false-positive. | Strip regex literals or scope the matcher. |
| 406 | STILL-VALID | `fenceDelimiter` uses `trimStart()` (unlimited indent) vs CommonMark 0–3-space limit; acknowledged simplification, latent divergence. | Add boundary test / document deviation. |
| 407 | STILL-VALID | define-skill does not set the spec pointer on an existing roadmap node (no auto `link-spec` on node-exists branch); 030 required manual `stackctl workflow link-spec`. | Wire `link-spec` into the node-exists branch. |
| 409 | STILL-VALID | `headSha`/audit-time HEAD ambiguous as FR-009 fix-commits advance HEAD mid-run; chunk membership freeze point unspecified in code. | Freeze membership at run-start or record state. |
| 410 | STILL-VALID | size-1 / empty below-envelope partition no-op (spec edge case) has no explicit RED test in govern tests. | Add RED test. |
| 414 | STILL-VALID | end-govern reconcile re-audits only touched chunks (`end-govern-pipeline.ts:171-210`); findings from chunks not re-audited in a later round drop from the composed result. | Investigate reconcile scope for skipped chunks. |
| 415 | STILL-VALID | FR-007 re-scope on `touched.newFiles.length > 0` (`end-govern-pipeline.ts:182-189`); no test/guard that new files reach `nextAuditIds` — silent drop risk. | Verify + test new-file re-audit coverage. |
| 417 | STILL-VALID | Pipeline writes `WholeFeatureConvergenceRecord` (`end-govern-pipeline.ts:225`); graduate gate reads `GovernConvergenceRecord` shape. Read path will break when TASK-413 wires pipeline object output. | Reconcile record shape gate reads (couples with 413). |
| 418 | STILL-VALID | `gitDiffNoIndex()` (`payload-diff-scope.ts:124-136`) renders via `git diff --no-index`; agent saw a comment claiming standard format but task asserts synthetic `+`-line in barrage input — needs verify against actual audit payload. | Verify the format reaching the barrage. |
| 419 | STILL-VALID | `extractParamList()` (`seam-pass.ts:32-60`) balanced-delimiter logic is plausibly correct but UNTESTED for higher-order/function-typed params; arity miscount risk. | Add regression test. |
| 420 | STILL-VALID | `fenceDelimiter` gained additive `closeable` field; non-updated call sites are invisible to TS (optional/additive). | Audit all call sites for `closeable`. |
| 421 | STILL-VALID | Dampener/lift accounting: current flow drives `runEndGovern()` once + lifts once (`govern-arms.ts`, `lift-once.ts`), but task asserts per-chunk `runProtocol` → N lift sections; confirm no per-chunk loop remains. | Confirm single-invocation lift path. |
| 422 | STILL-VALID | `partitionDiff`/`binpackClusters` measure raw `fileDiffs` bytes, not rendered payload (`envelope-binpack.ts`); preamble/folded-deps (~14KB) unmeasured → over-envelope chunks possible. | Measure rendered size (overlaps 413 replatform). |
| 424 | STILL-VALID | FR-009 autonomous fix-fanout backend UNBUILT: real `FixRunner`/`MergeAttempt` impls absent; `applyFixes` intentionally absent in `end-govern-runtime.ts`. Operator-deferred. | Build backend OR adopt agent-in-loop as canonical (operator call). |
| 425 | STILL-VALID | `.stack-control/audit-runs/` accumulates unboundedly; no prune/retention verb exists in source. | Add `audit-runs prune` verb. |
| 426 | STILL-VALID | `parseExports()` (`seam-pass.ts:114-132`) per-line; `FN_HEAD` regex `^`-anchored single-line — multi-line signatures unparsed. (030 follow-up, open by design.) | Multi-line signature parse / TS-aware parser. |
| 427 | STILL-VALID | `consumedInOtherChunk()` (`seam-pass.ts:139-145`) builds chunkText from `input.fileDiffs` only — removed export breaking an UNCHANGED consumer undetected. (030 follow-up.) | Import-graph / current-source check for unchanged consumers. |
| 428 | STILL-VALID | `resolveImplementExclusion()` (`payload-diff-scope.ts:68-72`) excludes only per-root `audit-log.md`, not whole other-feature root; the deleted test required whole-root exclusion. (030 follow-up.) | Operator decision: whole-root vs audit-log-only. |
| 429 | STILL-VALID | `govern-rename-scope.test.ts` deleted, no replacement guarding doubled body on `git mv` with `diff.renames=false`. (030 follow-up.) | Re-add rename-aware committed-diff test. |
| 430 | STILL-VALID | Chunker can split a RED-first test from its implementing source across chunks → false failing-test barrage findings. (030 follow-up, meta-finding.) | Couple test+source into same chunk. |
| 431 | STILL-VALID | `SeamFinding` schema declares `changed-required-shape` (`chunk-artifacts.ts:79`) but `seam-pass.ts:113-131` never detects interface/type required-field changes (parses to null). (030 follow-up.) | Implement required-shape detection. |
| 432 | STILL-VALID | `cli-drives-pipeline.test.ts:36-46` is regex grep over concatenated source, not behavioral. (030 follow-up.) | Make behavioral (run govern on fixture, assert record). |
| 433 | STILL-VALID | `--checkpoint` contradiction: `contracts/govern-cli.md` (removed globally) vs FR-029/spec.md (spec mode retains) vs quickstart (zero hits). (030 follow-up, doc contradiction.) | Reconcile the three docs. |
| 434 | STILL-VALID | spec.md + DEVELOPMENT-NOTES still promise autonomous fix-fanout though FR-009/`applyFixes` deferred (TASK-424). (030 follow-up.) | Reconcile prose with deferral. |
| 435 | STILL-VALID | `resolveImplementDiffBase()` (`payload-diff-scope.ts:165-175`) falls back to HEAD~1 when default branch undefined even if origin/main exists. (030 follow-up.) | Distinguish no-span from wrong-scope. |
| 436 | STILL-VALID | Untracked-fold (`payload-diff-scope.ts:210-213`) calls `gitDiffNoIndex()` with no binary/byte-budget guard. (030 follow-up.) | Add binary + byte-budget guards. |
| 437 | STILL-VALID | Doctor `chunked-govern-artifacts.ts:69-70` accepts empty/missing `chunks`/`splitClusterMarkers` as valid. (030 follow-up.) | Reject empty chunk-set as malformed. |
| 438 | STILL-VALID | `countRequired()` (`seam-pass.ts:105-110`) marks params optional only via `?`/`=`; function-typed params handling ambiguous → arity miscount. (030 follow-up, seam cluster — distinct from 426/427/431/440.) | Clarify arity rule. |
| 439 | STILL-VALID | `end-govern-pipeline.ts:190-192`: fix success with `changedFiles:[]` sets `openFindings=[]` → converges with unfixed findings. UNREACHABLE today (applyFixes deferred) but unguarded. (030 follow-up.) | Guard no-op fix path. |
| 440 | STILL-VALID | `seamResult.findings` checked for convergence (`end-govern-pipeline.ts:215-223`) but never lifted (`govern-arms.ts:316` lifts only `liftedFindings`). (030 follow-up — distinct seam aspect.) | Lift seam findings. |
| 441 | STILL-VALID | Outer-tree payload-leak invariant test deleted (`govern-anchor-unification-021.test.ts`), not re-pinned in `payload-diff-scope.test.ts`. (030 follow-up.) | Re-add invariant test. |

## Counts

- MOOT-BY-030: 7 (366, 367, 369, 379, 408, 411, 412)
- LIKELY-RESOLVED: 2 (416, 423)
- RE-SCOPE: 1 (413)
- STILL-VALID: 38
- UNCERTAIN: 2 (386, 395)
- CLOSED-UPSTREAM / DUPLICATE: 0

Cleanup candidates (10): 366, 367, 369, 379, 408, 411, 412, 413, 416, 423

## Corrections applied over sub-agent first-pass

- 402, 404: sub-agent called LIKELY-RESOLVED claiming the test file was absent — it searched only `src/`. The file exists at `tests/roadmap/cluster-no-nonnull.test.ts` and both cited defects (block-comment, regex-literal stripping) are present at lines 29-33. Corrected to STILL-VALID.
- 386: cited symbol `gitRefResolves` is gone and the task body has no Repro/file:line; `r.error` IS now handled in `payload-diff-scope.ts:110,132`. Downgraded from default STILL-VALID to UNCERTAIN (possible rename/fold; needs human read).
- 389: confirmed STILL-VALID via a live `tsc --noEmit` (3 TS2339 errors persist at portable.ts:100/107).
- 416: confirmed LIKELY-RESOLVED via `govern.ts:129-142` mode-scoping.
