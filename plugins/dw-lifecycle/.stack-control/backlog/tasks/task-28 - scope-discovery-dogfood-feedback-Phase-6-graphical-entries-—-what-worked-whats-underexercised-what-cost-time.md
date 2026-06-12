---
id: TASK-28
title: >-
  scope-discovery dogfood feedback: Phase 6 graphical-entries — what worked,
  what's underexercised, what cost time
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-349
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Dogfood feedback from driving Phase 6 of the `graphical-entries` feature (4 tasks: 2 CLI skill families + 2 studio pages) through the scope-discovery tooling end-to-end, with full SDD review cycles on each task. **18 commits, +96 tests, 28 audit-log entries, 14 clone dispositions, 1 stale-branch incident caught mid-stream.**

Net: the tooling is net positive and the high-value pieces are pulling their weight. This issue captures what worked, what's underexercised, what cost time, and what the tooling doesn't measure — for roadmap planning.

## Context

Single continuous session, multi-day. Session arc:
- Phase 6 Task 6.1 (`/deskwork:lane` CRUD skill family)
- Phase 6 Task 6.2 (`/deskwork:pipeline` CRUD skill family)
- Phase 6 Task 6.3 (studio lane-management page)
- Phase 6 Task 6.4 (studio pipeline-editor page)

Each task ran through: code-explorer → architect-decision → implementer dispatch → spec-review → quality-review → operator-triaged followups → docs commit. All routed through `wrap-prompt` / `validate-return`; `orchestrator-turn` ran between tasks; `scope-widen` ran between tasks; clones gate enforced at pre-commit.

Session commits: `77a6da9` (Phase 5 closeout) → `e9f7cb6` (session-end). Branch: `feature/graphical-entries`.

## 1. What's earning its keep

### 1a. Quality-review caught real BLOCKING bugs

Task 6.2's quality review came back **REJECTED** with 3 BLOCKING findings (commit `ae0549d`):

- **Finding 1:** `pipeline list` permanently breaks after any `--rename-stage` operation. The rename sidecar was written to `.deskwork/pipelines/<id>-renames.json` — same dir as templates. `listJsonBasenames` enumerated it; `loadPipelineTemplate('editorial-renames')` Zod-failed. Every `pipeline list` invocation after a rename would have thrown. Fix in `0a9ca59` moved sidecars to `.deskwork/pipelines/migrations/`.
- **Finding 2:** `deletePipeline` lacked `assertSafePipelineId` — path-traversal regression of Task 6.1's hardening. `lane delete '../../etc/foo'` would have `unlinkSync`'d the traversed file.
- **Finding 3:** Orphan rename sidecar on delete compounded Finding 1 into unrecoverable state.

Task 6.4's quality review caught a CRITICAL: `--set-locked ""` emitting CLI-rejected empty-list paste when the operator unchecked every box, AND the test was codifying the broken output as expected. Fixed at `af1e91a`.

**Spec-review alone would have shipped all 4 of these.** The two-reviewer cycle (spec + quality) is doing real falsification work, not ceremony.

### 1b. Dispatch grammar forces explicit dispositions

`wrap-prompt` / `validate-return` made implementer agents declare scope via Searched/Included/Excluded. The forbidden-deferral phrase list caught real `we'll fix later` patterns in returns and forced rephrasing as either `applied` or `declined-with-reason`. Several mid-stream commit-body rewrites observed because the grammar would have rejected the deferral framing.

### 1c. Clones gate at pre-commit + `batch-dispose` workflow

14 net-new clones this session. All were legitimate parallel-domain symmetry (lane↔pipeline CRUD operations), each captured with a written rationale. The gate refused multiple commits until I disposed; the friction is low; the audit trail is real. Example: `9e3f04426ee7` → `7f05f288e9c0` (Task 6.4 followup replaced a prior disposition entry as the line numbers shifted).

### 1d. Audit-log as durable cross-pass channel

Phase 6 Task 6.4 had two distinct passes write into `audit-log.md`:
- My SDD review cycle: `AUDIT-49..67`
- A side-pass codebase-auditor: `AUDIT-20260529-01..07`

Both formats interoperate; the `fixed-<sha>` closure marker is uniform; future readers can reconstruct the entire review history of any decision. **This is the highest-value durable artifact the tooling produces.**

## 2. What's working but underexercised (the #318 clarification)

**Earlier in this session I assessed `scope-widen` as "running on ceremony" because it returned 0 additions on all 3 invocations.** That assessment was wrong.

Verification:
- #318 closed `2026-05-28T16:59:48Z` (predates Phase 6 work)
- `synthesis-discovered-candidates.ts` v0.24.0: 95 lines (STUB) → v0.25.0: 367 lines (real MinHash + Jaccard clustering)
- The header documents the algorithm: MinHash signatures with 128 hash functions, n-grams 3..5, Jaccard ≥ 0.7 clustering, frequency floor `memberCount >= 3`
- The `return []` I assumed was a stub is the legitimate `uncoveredShapes.length < MIN_CLUSTER_SIZE` early-return

The reason scope-widen returns `0 additions` on graphical-entries is that **the codebase is too well-covered by registered patterns to surface unmatched-shape clusters.** Synthesizer output: `"clean — no findings across registered-pattern, discovered-candidate, or novel-shape-candidate buckets."` Zero unmatched files reach the clustering stage — every file matches at least one registered pattern (no `any`, no `as Type`, no `@ts-ignore`, etc.).

**Roadmap implication:** the discovery pass needs to run against a feature that introduces genuinely novel shapes to exercise the clustering path. Phase 7 (groups: members[] schema + new CRUD surfaces + new review-composition) is a candidate — it brings several new file shapes that aren't yet pattern-registered. If `scope-widen` surfaces a `discovered_candidate` cluster on Phase 7, that's the real validation #318 is fixed.

**Suggested validation milestone:** run `scope-widen` against Phase 7 Task 7.1 (schema delta — members[] on entry) AND Phase 7 Task 7.3 (group review surface). If those produce discovered-candidate clusters, the algorithm is doing what its spec promises. If they still emit 0, there's still a gap.

## 3. What actively cost time

### 3a. Refactor-precondition cue check false-positives

The cue check in `validate-return` fires on word-substring matches without context. Two false positives observed:

- An implementer's validate-return was rejected because the Included path contained `.dw-lifecycle/scope-discovery/clones.yaml` — the literal filename triggered the refactor-cue substring match.
- Another implementer return was rejected because the response said "extracted helper" referring to declined work (not a refactor closing a clones.yaml entry).

Both cost ~5 minutes of prompt-rewriting each. The cue check is solving a real problem (refactor commits silently dropping preconditions), but the substring matcher needs context:
- Maybe: distinguish "refactor" in `clones.yaml` paths vs. response prose
- Maybe: require BOTH the refactor word AND a "Closes clones.yaml" marker before enforcing
- Maybe: scope the check to refactor-eligible agent types specifically (`implementer`, `code-architect`, `typescript-pro`) AND require the response to claim a refactor in a specific structured field, not free-text

### 3b. `session-end-hygiene` not installed at session-start

The subcommand wasn't available when I ran `/dw-lifecycle:session-end` mid-session. The operator ran `/reload-plugins` and the subcommand became available — root cause was plugin cache, not actual missing surface. But the friction is real: a session-end skill that fails on its own helper command is bad UX.

Same shape at session-start: `session-start-recommendation` subcommand wasn't installed either. Both gaps required the plugin reload to surface.

**Possible mitigation:** version-check at skill entry — if the skill's expected helper subcommands aren't available, surface a clear "your `dw-lifecycle` CLI is out of sync; run `/reload-plugins`" rather than the generic "Unknown subcommand" error.

### 3c. Pre-commit hook overhead on doc-only commits

~5s/commit × 18 commits ≈ 90 seconds total. Not painful, but the gate runs against changes it doesn't need to inspect. **Possible mitigation:** skip the clones + anti-patterns + adopter-manifests gates when the commit touches only `*.md` files in `docs/` (or another docs-marker glob).

## 4. The unmeasured failure mode (#347 cross-reference)

**The stale-branch re-derivation incident ([#347](https://github.com/audiocontrol-org/deskwork/issues/347)) was completely invisible to every scope-discovery gate.**

An agent in this session unknowingly re-implemented v0.24.0's `detect-clones → check-clones` rename + the `deprecation-scan` feature byte-identical to commit `4da4660` already on main. The branch base is `e053e85` from 2026-05-25 — pre-v0.24.0. Main has shipped v0.24.0 → v0.25.0 since.

**Every gate signed off on the work:**
- Tests passed (the new files had no upstream consumers in this stale-base view)
- Builds passed
- Clones gate said no new duplicates (because the duplicates were against MAIN, not against this branch's view)
- `validate-return` accepted the agent's response
- The 5-line shim `subcommands/check-clones.ts` was structurally correct

The defect was that the work duplicated already-shipped code on a branch the agent had no signal was stale. None of the scope-discovery primitives measure "does this already exist on main?"

#347 lists 3 candidate mitigations:
- Session-start drift check warning when branch is N+ commits behind main
- Pre-write file-existence check against main when agent is about to write a new file
- Branch-staleness gate in `/dw-lifecycle:implement` refusing to start with `>N` commits behind without an explicit `--allow-stale` flag

`dw-lifecycle:debt-report` already catches the **parked-branches** category — this case is the same shape but for in-progress (not parked) branches.

**For roadmap planning:** until one of these mitigations ships, this class of failure stays a meta-cost the tooling can't catch. The session-start drift check feels lowest-effort + highest-leverage.

## 5. Cost / value ratios as observed

Rough breakdown of the cycle cost on this session:

- **~65% earned its keep:** the SDD review cycle's 4 BLOCKING/CRITICAL caught (3 in Task 6.2 + 1 in Task 6.4) would have shipped without it. Plus the side-pass audit's 6 verified-real findings.
- **~30% durable audit-trail value:** the audit-log + clone dispositions carry forward and are findable. This is what makes future debugging traceable.
- **~5% friction:** refactor-cue false-positives, plugin-cache UX on subcommands, doc-only pre-commit overhead. Net friction without commensurate signal value for the cases observed.

I'd previously estimated 10% ceremony for #318 + 5% friction. The #318 verification corrects that — the clustering pass works; my codebase just happens to be clean against registered patterns. The remaining friction collapses to 5%.

## Suggested priorities for the roadmap

1. **Fix the refactor-cue false-positive rate** in `validate-return`. Context-aware substring matching OR require a structured marker in the response, not free-text. This is the highest-friction-per-cost line item observed.
2. **Add a session-start branch-staleness warning** per [#347](https://github.com/audiocontrol-org/deskwork/issues/347). Branch is N+ commits behind main → surface the gap with the option to rebase before starting. The same shape that `debt-report` already does for parked branches.
3. **Validate #318's clustering pass against Phase 7 work** when graphical-entries gets there. If it surfaces `discovered_candidate` clusters on a feature with genuinely novel shapes, the algorithm is doing what its spec promises. If not, there's still a gap to close.
4. **Lower-priority polish:** plugin-cache version check at skill entry; skip clones/anti-patterns gates on docs-only commits.

## Evidence

Session commits + audit-log entries are all on `feature/graphical-entries`:

- Phase 6 audit cycle entries: `audit-log.md` lines covering AUDIT-40..68 (SDD) + AUDIT-20260529-01..07 (side-pass) + 6 closure markers
- Task 6.2 BLOCKING fixes: `0a9ca59`
- Task 6.4 CRITICAL fix: `af1e91a`
- Task 6.4 side-pass followups: `b2bcdc0`
- Stale-branch cleanup: per #347 recipe, executed inline (no separate commit)
- Session journal entry: `DEVELOPMENT-NOTES.md` final entry (commit `e9f7cb6`)

Filed for the scope-discovery team's roadmap discussion. Not blocking anything; pure feedback artifact.
<!-- SECTION:DESCRIPTION:END -->
