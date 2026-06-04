---
slug: hygiene
targetVersion: "1.0"
created: 2026-05-29
---

# Audit Log — hygiene feature

This is the durable record of review findings against commits on `feature/hygiene`. The audit log is the **source of truth** for current finding state — not commit messages, not GitHub.

## Operator header

- Findings are actionable work, not bookkeeping.
- The audit log is the source of truth.
- Findings are never deleted; update entries in place by changing `Status:` and appending resolution / verification notes.
- `fixed-<sha>` is not `verified-<date>`. A `fixed-<sha>` claim is the commit that landed the change; `verified-<date>` requires the surface to be re-exercised in a context that catches regressions.

## Canonical queue queries

```
# Everything not yet verified or closed
grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" audit-log.md

# New findings awaiting triage
grep -nE "^Status:[[:space:]]+open" audit-log.md

# Awaiting verification (fix landed but not re-exercised)
grep -nE "^Status:[[:space:]]+fixed-" audit-log.md
```

---

## AUDIT-20260529-01 — Phase 12 Task 1 (commit 8841be9) — Track 2 spec compliance

Finding-ID: AUDIT-20260529-01
Status:     verified-2026-05-29
Severity:   informational
Surface:    plugins/dw-lifecycle/src/lifecycle-integration/session-end-hygiene.ts + session-range.ts
Tracks-Issue: 361

Track 2 reviewer (feature-dev:code-reviewer) verified all six spec compliance items in #361:

1. Medium fix correctness — no `gh issue list --author @me --search` query in the implementation; candidates derive from `git log <sha>..HEAD` commit refs. PASS.
2. `#NNN` regex semantics — excludes HTML entities, id fragments, cross-repo refs; handles start-of-haystack and body refs. PASS.
3. Boundary-SHA fallback chain — `--session-start-sha` → `merge-base origin/main` → `HEAD~10`. PASS.
4. Workplan-TBD session-diff filter — `git diff --unified=0 <sha>..HEAD -- <path>` with whole-file fallback. PASS.
5. No-SHA fallback contract — emits zero observations + does not call gh. PASS.
6. Vitest coverage for the four Step 3 acceptance cases — (a) unreferenced-issue exclusion with adversarial gh-throw, (b) body-ref surfaced, (c) real-git fixture for session-diff filter, (d) no-SHA + no-gh-call assertion. All four present.

Verification: Track 1 verification was the full plugin test suite (1953/1953 pass). No further verification needed for an informational PASS.

---

## AUDIT-20260529-02 — readCommits crashed on dangling sessionStartSha

Finding-ID: AUDIT-20260529-02
Status:     fixed-d8e08f0
Severity:   medium
Surface:    plugins/dw-lifecycle/src/lifecycle-integration/session-end-hygiene.ts:90
Tracks-Issue: 361

Track 3 reviewer surfaced a defensive-posture asymmetry: `scanIssuesThisSession` handled an invalid `sessionStartSha` gracefully via `resolveSessionBoundarySha`'s `rev-parse --verify` probe, but `readCommits` passed the SHA directly into `git log <sha>..HEAD`. On a dangling ref (force-push / rebase / stale SHA from a prior session), `git log` exits non-zero, the exception propagates through `captureSessionEndHygiene`, and the entire hygiene capture aborts before the issue scan runs.

Confidence: 85.

Fix: wrap `readCommits`' `runGit` call in try/catch; on failure, retry with the `range(null)` fallback (`-10`); if THAT also throws (truly broken repo), return zero rows. Matches the defensive posture of the rest of the module.

Regression test added at `lifecycle-session-end-hygiene.test.ts` — "degrades gracefully when the supplied sessionStartSha is dangling (F1 review fix)". Stubs `runGit` so the requested range throws and the HEAD~10 fallback returns clean; asserts no exception bubbles up and both invocations were made.

Resolution: fix commit `d8e08f0`.

---

## AUDIT-20260529-03 — Stale reference to deleted resolveSessionBoundaryIso in walk.ts

Finding-ID: AUDIT-20260529-03
Status:     fixed-d8e08f0
Severity:   low
Surface:    plugins/dw-lifecycle/src/lifecycle-integration/parent-closure/walk.ts:162
Tracks-Issue: 361

Track 3 reviewer flagged a stale code comment: `walk.ts:162` says "the diagnostic pattern mirrors session-end-hygiene.ts's `resolveSessionBoundaryIso` error handling." That function was deleted in commit `8841be9` (replaced by `resolveSessionBoundarySha` in `session-range.ts`). A future contributor following the breadcrumb would find nothing.

Confidence: 90.

Fix: updated the comment to reference `session-range.ts`'s `tryGit` failure-reason-carrying shape — the actual pattern being mirrored is the discriminated `{ ok: true | false }` outcome carrying upstream error messages.

---

## AUDIT-20260529-04 — Stale workplan reference to deleted resolveSessionBoundaryIso

Finding-ID: AUDIT-20260529-04
Status:     fixed-d8e08f0
Severity:   low
Surface:    docs/1.0/001-IN-PROGRESS/hygiene/workplan.md:424
Tracks-Issue: 361

Track 3 reviewer flagged a stale provenance note in the Phase 12 workplan implementation notes: it claimed "the no-SHA fallback path lives in `resolveSessionBoundaryIso` and stays as-is." Both claims are now wrong — the function was deleted/renamed, and the no-SHA fallback was materially changed (now SHA-based, not committer-date-based).

Confidence: 85.

Fix: updated the line to reference `resolveSessionBoundarySha` in `session-range.ts` and describe what the function actually does (priority-ordered SHA fallback; boundary is the SHA itself, not a committer-date detour).

---

## AUDIT-20260529-05 — Pre-existing `as { ... }` type assertion in isRawIssue

Finding-ID: AUDIT-20260529-05
Status:     withdrawn-2026-05-29
Severity:   informational
Surface:    plugins/dw-lifecycle/src/lifecycle-integration/session-end-hygiene.ts:223

Track 3 reviewer flagged the `as { number?: unknown; title?: unknown; state?: unknown }` cast in `isRawIssue` as a violation of the project's no-`as Type` rule. Confidence: 80.

Disposition: **withdrawn — pre-existing, not introduced by commit 8841be9.**

Verification of pre-existing-ness: `git show 8841be9 -- plugins/dw-lifecycle/src/lifecycle-integration/session-end-hygiene.ts | grep "isRawIssue"` shows the function header as context only (`@@ -195,... +228,...` indicates the surrounding range moved but the function itself was not edited). The cast was in the file before this commit.

The reviewer themselves noted: "the same pattern exists in `triage-issues/propose.ts:45,50` (pre-existing), so this is not unique." Fixing only the one instance in `isRawIssue` while leaving siblings in `propose.ts` would create more inconsistency than it remediates.

The correct scope for this is a project-wide pass on `as Type` violations. Out of scope for Phase 12 Task 1. If the operator wants the cleanup, file a separate issue scoping the cross-codebase audit.

---

## Track-1 verification gate (independently re-run)

The load-bearing verification for this change is the plugin's vitest suite. Re-run from the worktree:

```
cd /Users/orion/work/deskwork-work/hygiene/plugins/dw-lifecycle && npx vitest run
```

Result: 158 test files, 1953 tests passing (post-fix). The Phase 12 acceptance cases live in `src/__tests__/lifecycle-session-end-hygiene.test.ts` — Phase 12 (a) through (d) + the F1 regression test all pass.

Clone gate (`check-clones --gate-mode`): 0 NEW, 1 DROPPED (the deleted `resolveSessionBoundaryIso` body). No new clone-introduction risk.

---

## AUDIT-20260529-06 — Phase 11 Task 5 (commit 7b42ed8) — smoke-hygiene worktree-verbs round-trip

Finding-ID: AUDIT-20260529-06
Status:     verified-2026-05-29
Severity:   informational
Surface:    scripts/smoke-hygiene.sh (worktree-section, lines 333–411)
Tracks-Issue: 356

Combined reviewer (feature-dev:code-reviewer, single-pass per the SKILL's small-routine carve-out) verified the smoke extension is technically correct, the assertions are falsifiable, cleanup is leak-free under both default-mktemp and `SMOKE_HYGIENE_TMPDIR` paths, and the new section is stylistically consistent with the pre-existing smoke structure.

The reviewer noted one out-of-scope observation: `feature/smoke-parked` (line 325, in the pre-existing archive-branch section) is left uncleaned. This pre-dates the Phase 11 commit and was correctly excluded from this commit's review scope; if the operator wants the cleanup, file a separate issue against the pre-existing archive-branch section.

Verification: Track 1 was running the smoke script end-to-end (exits `OK`, all ten verb checks pass) + `npm test --workspaces` (1953 / 1953 pass).

---

## AUDIT-20260529-07 — Phase 11 Task 6 dogfood: archive-branch preflight runGit-contract bug

Finding-ID: AUDIT-20260529-07
Status:     verified-2026-05-29
Severity:   high
Surface:    plugins/dw-lifecycle/src/archive-branch/preflight.ts (`assertTagDoesNotExist`)
Tracks-Issue: 364

**Verified 2026-05-29 against installed v0.27.0** — created a tmp worktree (`feature/v0270-verify` with one ahead-commit), ran `dw-lifecycle dismantle-worktrees propose --worktree-base <tmp> --threshold-count 1`, set `decision=archive-then-dismantle` + substantive reason, ran `apply`. Result: `Applied 1, skipped 0, failed 0. applied: <path> [archive-then-dismantle] (tag: archived/feature-v0270-verify-2026-05-29)`. Pre-fix this would have reported `Tag already exists` and aborted the archive step; post-fix the preflight passes through correctly. Test artifacts cleaned up (tag deleted locally + on origin; tmp worktree-base removed).

Phase 11 Task 6 dogfood surfaced a real runGit-contract bug in `archive-branch`'s preflight: `assertTagDoesNotExist` ran `runGit(['rev-parse', '--verify', 'refs/tags/<tag>'])` and assumed THROW-on-failure semantics (exception fires when the tag doesn't exist → tag absent → preflight passes). The standalone `archive-branch` subcommand wires that throwing contract. But `dismantle-worktrees apply` calls `applyArchive` with `runGitStdout` from `subcommands/lib/process-probes.ts` — a SWALLOWING runner that catches `execFileSync` failures and returns `''`. Under that runner, the `try` block always completes silently, `exists = true` is set unconditionally, and every `archive-then-dismantle` decision false-fails before any archive tag is created.

Concrete failure: ran `dismantle-worktrees apply` against 4-item proposal (3 archive-then-dismantle + 1 skip). The skip succeeded. All 3 archive-then-dismantle items failed with "Tag already exists" (tag did NOT actually exist). The worktrees were already removed (step 1 of the dismantle sequence runs before archive), leaving the operator with 3 dangling local branches + 2 still-extant remote branches + no archive tags.

Confidence: 100 (reproduced + root-caused).

Fix (Light): updated `assertTagDoesNotExist` to check the RETURNED value (`output.length > 0`) in addition to the try/catch. Robust against both runGit contracts. Regression test added at `archive-branch-preflight.test.ts` — "passes tag-doesnotexist when runGit returns empty on failure (swallowing variant)".

Recovery: ran `dw-lifecycle archive-branch <branch>` standalone for each of the 3 affected branches (which uses the throwing runGit contract). All three archived successfully + remotes cleaned (visual-verification-gate's remote was already gone, surfaced as a non-fatal "skipped" line).

Promoted to [#364](https://github.com/audiocontrol-org/deskwork/issues/364) for visibility + the Medium fix (unifying the runGit contracts) + the Heavy fix (auditing every `runGitStdout` consumer for the same latent bug shape).

Verification status: `fixed-pending-verification` per the project's "issue closure requires verification in a formally-installed release" rule. The Light fix is committed; the regression test passes. Verification = re-running `dismantle-worktrees apply` with `archive-then-dismantle` decisions against a real worktree-base AFTER the fix ships in an installed release.

---

## AUDIT-20260529-08 — Phase 12 Task 2 (commit 918c029) — label rename review

Finding-ID: AUDIT-20260529-08
Status:     fixed-pending-verification
Severity:   informational
Surface:    plugins/dw-lifecycle/src/lifecycle-integration/ + .claude/rules/agent-discipline.md + docs/1.0/burndown/dw-lifecycle.md
Tracks-Issue: 361

Combined reviewer (feature-dev:code-reviewer, single-pass per the SKILL's small-routine-change carve-out) verified the rename. Found one legitimate stale-reference cluster the workplan Step 5 audit scope missed:

1. `agent-discipline.md:536` — present-tense table row describing the current `session-end-hygiene` output used the pre-rename "filed this session" wording. Fixed in this commit's follow-up edit.
2. `burndown/dw-lifecycle.md:54` — sentence describing Phase 12's change quoted the pre-rename detector name in present tense. Fixed by renaming the present-tense reference to `"issues referenced this session"` AND adding a historical-framing clause (`renamed from "issues filed this session" as part of Task 2`) that documents the rename without re-introducing the old wording as a current claim.

Track 1 (load-bearing verification): 2331/2331 plugin tests pass; smoke-hygiene OK end-to-end.

Other reviewer-confirmed clean: zero stale refs in `.ts` files, JSDoc accuracy on `types.ts:28`, comment accuracy on `session-end-hygiene.ts:337-343` (`CLOSED-but-referenced` semantic), session-end-hygiene.ts file size stayed at 499 (at cap, not over), no `any`/`as Type`/`@ts-ignore`. Test-rigor gap noted (no string-assertion of "referenced this session" connector phrase — pre-existing gap, not introduced by this commit; low risk because OPEN/CLOSED partition test + markdown-headings test cover the rendering path).

Verification status `fixed-pending-verification` per the project's "issue closure requires verification in a formally-installed release" rule. The label-rename ships in the next v0.28.x or v0.29.0 release; full verification is the same dogfood pass that already lives in the Phase 12 Task 2 acceptance criteria.

---

## AUDIT-20260529-09 — Phase 13 Task 1 (commit 5f620b1) — close-shipped fix-keyword filter

Finding-ID: AUDIT-20260529-09
Status:     fixed-pending-verification
Severity:   informational
Surface:    plugins/dw-lifecycle/src/close-shipped/commit-scanner.ts + SKILL.md + 2 test files
Tracks-Issue: 366

Combined reviewer (feature-dev:code-reviewer, single-pass per the SKILL's medium-routine carve-out) verified the Phase 13 / #366 fix and reported two doc-accuracy findings — both applied as a follow-up commit:

1. **Stale test comment** at `close-shipped-commit-scanner.test.ts:185` — comment said "Plain reference in subject + Closes in body -> closes wins" but plain references no longer extract at all post-Phase-13. The test's behavior assertions are still correct; the comment misled readers about the verb-strength selection mechanism. Rewrote to reflect the post-Phase-13 reality: "Bare `#50` in subject is dropped post-Phase-13; the `Closes #50` in the body is the only fix-shipping signal."

2. **SKILL.md URL-stripping claim imprecise** at line 83 — said "URLs in commit messages are stripped before pattern matching." Technically misleading: PR-merge commits are dropped before URL stripping runs (the early-return fires first). Rewrote: "For non-merge commits, URLs are stripped before pattern matching... PR-merge commits are dropped entirely before any URL stripping or pattern matching — the early-return path means the merge-subject AND its body never reach the URL-stripping step."

Reviewer confirmed clean on the substantive change:

- `MERGE_PR_SUBJECT_RE = /^Merge pull request #\d+ from /` correctly matches GitHub's standard merge-commit subject; doesn't mis-match `Merge branch ...` or non-standard variants.
- `ReferenceVerb` dead-code entries (the `plain`/`refs`/`parens` cases in the strength map) are well-contained as a back-compat carve-out for handcrafted test inputs.
- Comma-list grammar (`Closes #10, #11, #12.` surfacing only `#10`) aligns with GitHub's own auto-close grammar — GitHub requires verb-per-issue per official docs.
- Other walkers (audit-log, tooling-feedback) use their own pattern lists via `extractIssueFromBody` and were correctly not touched by this commit.
- File size cap clean (`commit-scanner.ts` stays well under 500 lines).
- No `any`/`as Type`/`@ts-ignore` introduced.

Track 1 (load-bearing verification): 2336/2336 plugin tests pass; smoke-hygiene OK end-to-end.

Verification status `fixed-pending-verification` per the project's "issue closure requires verification in a formally-installed release" rule. Acceptance is re-running `close-shipped --from-tag v0.26.5 --to-tag v0.27.0` post-install and confirming only the 3 real candidates (#356, #361, #364) from the v0.27.0 dogfood land — not the 6 false positives (#351, #352, #353, #355, #362, #365).

---

## AUDIT-20260530-01 — Phase 14 Tasks 1+2 review

Finding-ID: AUDIT-20260530-01
Status:     fixed-pending-verification
Severity:   informational
Surface:    plugins/dw-lifecycle/src/close-shipped/{scanner-config,commit-scanner,audit-log-walker}.ts + 2 test files + SKILL.md
Tracks-Issue: 369

Combined reviewer (feature-dev:code-reviewer, single-pass) verified the two Phase 14 commits. Zero high-confidence findings.

Reviewer-confirmed clean across:

- `END_OF_SUBJECT_PARENS_RE` regex correctness: applied to stripped subject alone (no `m` flag), `$` correctly anchors end-of-subject, `\s*$` absorbs trailing whitespace, mid-subject parens with trailing text don't match.
- `loadScannerConfig` robustness: file-absent → defaults; malformed YAML → typed error; null/non-object parsed value → defaults; non-boolean field → defaults. snake_case YAML field ↔ camelCase TS interface mapping is explicit and correct.
- `TRACKS_ISSUE_PATTERN` regex correctness: `im` flags correct; `Tracks-Issue: invalid` degrades to fallback (no digit match → null → body-scrape).
- `ENTRY_HEADING_RE` backward-compat with scope-discovery audit-log: `## DATE` parents in that file's date-grouped layout become harmless boundaries — their buffers contain no `Status: fixed-<sha>` so `parseAuditLog` skips them at the status check; each `### entry-name` child still gets its own properly-scoped buffer.
- Back-fill correctness: all 9 AUDIT entries' `Tracks-Issue:` fields verified against the parent issue they actually track (#361, #356, #364, #366; AUDIT-05 deliberately skipped — pure withdrawal with no specific issue).
- Discipline-rule checks: no `any`/`as Type`/`@ts-ignore` introduced; the one `as Record<string, unknown>` in `scanner-config.ts:69` is guarded by a typeof narrowing check on the line above and matches the established codebase pattern across 15+ existing files. File sizes within the 300–500 cap.

Track 1 (load-bearing verification): 2344/2344 plugin tests pass. Live `close-shipped` dry-run against v0.26.5..v0.27.0 from THIS project reproduces the expected 5-candidate set with `#356` / `#361` / `#364` surfacing (the 3 genuine fixes) and `#50` from the v0.27.0 dogfood gone.

Verification status `fixed-pending-verification` per the project rule. Closes when the next release ships and the operator runs `close-shipped --from-tag v0.27.0 --to-tag v0.X.Y --dry-run` against an installed version of v0.X.Y and confirms the candidate set matches expectations.

---

## AUDIT-20260530-02 — Phase 15 close-shipped redesign (commits per task)

Finding-ID: AUDIT-20260530-02
Status:     fixed-pending-verification
Severity:   informational
Surface:    plugins/dw-lifecycle/src/close-shipped/{scan,propose,apply-v2,bundle,mention-scanner}.ts + subcommands/close-shipped.ts + skills/close-shipped/SKILL.md
Tracks-Issue: 366

Phase 15 redesign of `close-shipped`: replaced the prose-grammar 4-walker
architecture with mechanical narrowing + Agent-tool dispatch from within
the agent's Claude Code session + operator-curated `propose | apply` flow.
Closes the unbounded patching cycle that motivated #366's Medium fix
proposal.

Mechanical pieces shipped as TDD red-green-commit cycles:

- `mention-scanner.ts` — pure `#NNN` extractor with URL stripping; 9 cases.
- `bundle.ts` — pure per-candidate aggregator over 4 evidence sources; 6 cases.
- `scan.ts` — runtime that wires injected I/O + emits `BundleSet` with per-commit `diff_stat`; 3 cases.
- `propose.ts` — `BundleSet + VerdictSet → Proposal` composer + markdown table renderer; 6 cases.
- `apply-v2.ts` — pre-validates `decision` field + dispatches `gh` per accepted row; 5 cases.

Live verification: `dw-lifecycle close-shipped scan --from-tag v0.27.0 --to-tag v0.28.1`
produces 23 candidate bundles. The genuine ships (#361, #364) appear alongside
back-fill / cite noise (#3, #4, #340, #347, #350–#355, #356, #362, #365–#368)
— exactly the noise the agent dispatch is designed to filter. Canned-verdicts
pass through `propose`; the smoke fixture exercises the full `scan → propose →
apply` round-trip with the all-skip path.

Verification status `fixed-pending-verification` closes when the next release
ships the redesign + an operator runs the full agent-dispatch flow against an
installed release per the project's "Issue closure requires verification in a
formally-installed release" rule.

---

## Clone-detector summary

| Run | Detected | NEW | DROPPED | Notes |
|---|---|---|---|---|
| `8841be9` (pre-review) | 173 | 0 | 1 | DROPPED is intended (deleted `resolveSessionBoundaryIso` + internal `tryGit`). |
| Review fixes (this commit) | (re-run after commit) | 0 expected | 0 expected | Fixes are localized edits to comments + one defensive wrapper; no new code shapes. |

## 2026-06-04 — audit-barrage lift (20260604T153758900Z-hygiene)

### AUDIT-20260604-01 — All-skip apply still creates the `pending-verification` label in the target repo

Finding-ID: AUDIT-20260604-01 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   medium
Surface:    plugins/dw-lifecycle/src/close-shipped/apply-v2.ts:185-203 (the `applyV2` body) + test `close-shipped-apply-v2.test.ts:` "pre-flight: label absent → label create runs"

`applyV2` runs `preflightLabel` unconditionally, right after `validateProposal` and before the per-item loop — with no check for whether any item is effectively shipped. The new test "pre-flight: label absent → label create runs, 'created' note surfaces in result" proves this: it builds a `skipOnly` proposal (every item `decision: 'skip'`), runs apply, and asserts `labelCreateCalls.length === 1`. So an operator who reviews a proposal, decides every candidate is a false positive, and applies the all-skip result will nonetheless create a brand-new `pending-verification` label in the target repo that no issue will ever carry. That's a write side-effect on the adopter's repo for a no-op apply — a small but real pollution, and surprising given the apply did nothing else.

The fix is to gate the pre-flight on there being at least one effectively-shipped item: compute `proposal.items.some(i => effectiveVerdict(i) === 'shipped')` first, and only call `preflightLabel` when that's true (otherwise skip straight to the empty-result return). `effectiveVerdict` already exists in the file, so this is a two-line guard. As written, the label is created before the loop even discovers there's nothing to label.

### AUDIT-20260604-02 — smoke-hygiene per-run timestamp hardcodes `-000Z` and diverges from the SKILL.md format it claims to mirror

Finding-ID: AUDIT-20260604-02
Status:     open
Severity:   low
Surface:    scripts/smoke-hygiene.sh:415-420 (`CS_RUN_TS="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)"`)

The smoke comment states it mirrors "the SKILL.md's per-run project-local path convention so the smoke documents the canonical adopter path." But SKILL.md Step 1 specifies a millisecond-bearing timestamp (`2026-06-04T15-22-31-417Z`), whereas the smoke hardcodes the millisecond field as `000` because `date` can't emit ms portably. Two consequences: (1) the smoke's path shape doesn't actually match the documented convention it claims to demonstrate (the ms segment is always `000`), and (2) two smoke runs (or two close-shipped runs) that start in the same wall-clock second collide on the run dir — the very race-prone collision Phase 17 exists to prevent. For a hand-run smoke this is benign, but it undercuts the "documents the canonical path" rationale in the comment. Appending `$$` (PID) or `$RANDOM` to the smoke's `CS_RUN_TS` would both restore uniqueness and make the divergence-from-SKILL note unnecessary.
