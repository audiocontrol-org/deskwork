---
slug: hygiene
targetVersion: "1.0"
date: 2026-05-28
---

# Workplan: Hygiene

**Goal:** Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style per `.claude/CLAUDE.md` § Plugin Conventions) that surface debt on demand, drive operator-triggered batched-proposal cycles, and integrate with natural lifecycle waypoints. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

**Reference design spec:** [`docs/superpowers/specs/2026-05-28-hygiene-design.md`](../../../superpowers/specs/2026-05-28-hygiene-design.md) on main.

## Phase 0: Infrastructure teardown  ·  [#324](https://github.com/audiocontrol-org/deskwork/issues/324)

**Deliverable:** Stalled placeholder branch removed; clean slate for the hygiene infrastructure.

### Task 1: Tear down `feature/deskwork-open-issue-tranche-cleanup`

- [x] Step 1: Verify the branch's single commit is already represented on main (content-identical alt-SHA confirmed).
- [x] Step 2: Remove the worktree (`git worktree remove`).
- [x] Step 3: Delete the local branch (`git branch -D`).
- [x] Step 4: Delete the remote branch (`git push origin --delete`).

**Acceptance Criteria:**
- [x] Stalled `feature/deskwork-open-issue-tranche-cleanup` branch + worktree are torn down. (DONE during this feature's setup, 2026-05-28.)

## Phase 1: Read-only baseline — `/dw-lifecycle:debt-report`  ·  [#325](https://github.com/audiocontrol-org/deskwork/issues/325)

**Deliverable:** Cross-source debt snapshot available as a skill. Read-only — no mutations.

### Task 1: Implement debt-report

- [x] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/debt-report.ts` — queries `gh issue list` with bucketing by label/age/stale-since-last-comment.
- [x] Step 2: Workplan-TBD scan across `docs/<v>/001-IN-PROGRESS/*/workplan.md` — counts per-feature `TBD:` / `defer` / `follow-up:` / `out of scope` markers.
- [x] Step 3: Parked-branch scan via `git for-each-ref` — list local + remote branches with ahead/behind status relative to `origin/main`.
- [x] Step 4: Output formatters — markdown table (operator-readable) + JSON (downstream-consumable). Default = markdown; `--json` flag emits JSON.
- [x] Step 5: `plugins/dw-lifecycle/skills/debt-report/SKILL.md` — adopter-facing prose.
- [x] Step 6: Vitest unit + integration tests against fixture project trees + mocked `gh` stub.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:debt-report` ships; emits markdown + JSON across the three categories. (Landed in 734008d + spec/quality-review fix commits d0c2a37 + 965501c; 42 new vitest tests passing; SKILL.md ships at `plugins/dw-lifecycle/skills/debt-report/SKILL.md`.)

**Implementation notes (operator decisions captured during dispatch):**

- Sample size `N=5` for issue/branch samples; configurable via `--sample-size <N>`.
- Added `--parked-days <N>` flag (default 30) — parametric instead of hardcoded so the parked-vs-other threshold matches the staleness siblings.
- JSON bucket shape uses `stale` + `threshold_days: <N>` (not the spec's literal `stale_30d` / `stale_since_last_comment_7d` keys). The thresholds are configurable via `--stale-days` / `--comment-stale-days`; hardcoding `_30d` into the JSON key when the threshold is overridable would mislead downstream consumers. Spec text intent is preserved; only the literal key shape is parametric.
- Workplan scanner emits per-marker line-number samples (capped at 20 per feature, 200-char text excerpt). Samples surface only in JSON output, not markdown. Phase 3 (`:promote-deferrals`) consumes these to drive workplan edits without a second scan.
- `--no-gh` / `--no-workplan` / `--no-branches` are opt-out toggles (sections included by default). Section headers stay in the markdown with a `(skipped via --no-X)` marker so the operator sees what was suppressed; JSON uses `null` for skipped sections so consumers see a stable schema.
- Relative imports used throughout (the `@/` mapping is not wired for this plugin; introducing it was scoped out per the dispatch brief).

## Phase 2: GitHub-issue triage — `/dw-lifecycle:triage-issues`  ·  [#326](https://github.com/audiocontrol-org/deskwork/issues/326)

**Deliverable:** Operator-triggered batched-proposal cycle for stale GitHub issues. Implements the batched-proposal infrastructure subsequent skills reuse.

### Task 1: Implement triage-issues

- [x] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/triage-issues.ts`. Args: `--bucket <name>` (`stale-30d` / `unlabeled` / `bug-no-comment-7d`), `--limit N` (default ~10).
- [x] Step 2: Bucket-query-builder — translates each bucket name to a `gh issue list --search` query string.
- [x] Step 3: Batched-proposal protocol — uniform markdown-table output of N issues, one row per proposed disposition (close-wontfix + reason / label / mark duplicate / leave + comment). Designed for the calling-conversation agent to populate the proposal rationale.
- [x] Step 4: Operator-approval parser — accept `y` (all) / `n` (none) / `1,3,5` (subset).
- [x] Step 5: Apply-step — one `gh` mutation per approved disposition; partial-success surfaces with per-item reasons; no rollback.
- [x] Step 6: `plugins/dw-lifecycle/skills/triage-issues/SKILL.md` — adopter-facing prose.
- [x] Step 7: Vitest unit + integration tests; mocked `gh` stub.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:triage-issues` ships; supports `stale-30d`, `unlabeled`, `bug-no-comment-7d` buckets. (Landed in b2e5178 + 025a1dc + ed1ac26; 74 new vitest tests passing; SKILL.md at `plugins/dw-lifecycle/skills/triage-issues/SKILL.md`.)
- [x] Partial-approval works (operator picks subset of proposals). (Approval token grammar `y` / `n` / `1,3,5`; tests at `triage-issues-apply.test.ts`.)
- [x] Partial-success surfaces failures with reasons; no rollback. (Per-item `apply_error` field; final tally to stdout; exit 1 only if every approved item failed.)

**Implementation notes (operator decisions captured during dispatch):**

- Two CLI verbs (`propose` + `apply`). The intermediate JSON file at `.dw-lifecycle/triage-issues/proposals-<timestamp>.json` is the contract between the operator's orchestrator agent (which fills in disposition + rationale) and the apply step. Hand-editable, replayable.
- Pre-validation gate: `apply` validates ALL approved items before issuing any `gh` mutation. If ANY item is malformed, abort the whole batch with zero mutations + exit code 2. Discriminator class `InvalidProposalFileError` separates structural failures from per-item gh failures.
- Exit codes: 0 (>=1 succeeded OR no items attempted), 1 (every approved item failed), 2 (structurally invalid file).
- Four disposition shapes: `close-wontfix` (reason field), `label` (labels list), `duplicate` (dup_of + reason), `leave-with-comment` (comment field). `close-wontfix` requires non-empty reason; ≥40-char substantive-reason validator is Phase 3 infrastructure.
- Bucket-query loader: built-in defaults at `triage-issues/buckets.ts`; override at `.dw-lifecycle/triage-buckets.yaml`. `$DATE_NNd_AGO` placeholder substitutes ISO date NN days before invocation time (documented in SKILL.md).
- `propose --force` flag (added during review cycle): prevents silent overwrite of existing proposal files.
- Parallel utility shapes (RunGh type, isRawIssue type-guard, daysBetween, parsePositiveInt, defaultRunGh, detectRepoFromGit) duplicated between `debt-report/` and `triage-issues/` per the original brief's domain-isolation intent. 7 clone-group entries dispositioned `keep-with-reason` in pre-commit gate. Extraction-to-shared-`gh-runtime/` proposal filed as [#335](https://github.com/audiocontrol-org/deskwork/issues/335) for operator triage before Phase 5.

## Phase 3: Workplan-deferral promotion — `/dw-lifecycle:promote-deferrals`  ·  [#327](https://github.com/audiocontrol-org/deskwork/issues/327)

**Deliverable:** Workplan-TBD scanner with promote-to-issue and inline-wontfix dispositions. Mechanically enforces the project's `Just for now is bullshit` rule.

### Task 1: Implement promote-deferrals

- [x] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/promote-deferrals.ts`. Takes a target workplan path.
- [x] Step 2: TBD-pattern parser — finds `TBD:` / `defer` / `follow-up:` / `out of scope` markers + their surrounding context (containing task name, parent phase heading).
- [x] Step 3: Reuse Phase 2's batched-proposal protocol. Per item, propose (a) promote-to-issue with surrounding context as the issue body OR (b) inline-wontfix with substantive-reason.
- [x] Step 4: Substantive-reason validator — ≥40 chars, no gaming phrases. Widened to match `.claude/rules/agent-discipline.md` § "Just for now is bullshit" grep list (adds `HACK`, `XXX`, `temporary`, `stub`, `placeholder`, `pending`, `until F<digit>`, `until v<digit>` beyond the spec-listed phrases).
- [x] Step 5: Apply-step — `gh issue create` for (a)-items; workplan-edit replaces bare TBD with `[debt: #NNN]` back-link. For (b)-items, workplan-edit replaces bare TBD with the substantive-reason text inline.
- [x] Step 6: `plugins/dw-lifecycle/skills/promote-deferrals/SKILL.md`.
- [x] Step 7: Vitest unit + integration tests.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:promote-deferrals` ships; finds `TBD:` / `defer` / `follow-up:` / `out of scope` patterns in a target workplan. (Landed in 62d3965 + 53eec56; 83 new vitest tests passing; SKILL.md at `plugins/dw-lifecycle/skills/promote-deferrals/SKILL.md`.)
- [x] Supports promote-to-issue and inline-wontfix dispositions.
- [x] Substantive-reason validator enforced for wontfix; rejects gaming phrases.

**Implementation notes (operator decisions captured during dispatch):**

- Two CLI verbs (`propose` + `apply`) mirroring Phase 2's pattern. Intermediate JSON file under `.dw-lifecycle/promote-deferrals/`. `--force` flag on propose; pre-validation gate on apply; exit codes 0/1/2.
- `scanSingleWorkplanFile` exported directly from `src/debt-report/workplan-tbd.ts` (keeps parser logic DRY between debt-report's full-tree walk and promote-deferrals' single-file scan).
- Two disposition shapes: `promote-to-issue` (title ≤100 chars, body ≥40 chars containing surrounding context) and `inline-wontfix` (reason ≥40 chars, no gaming phrases).
- Workplan-edit drift check: strict trimmed equality against the recorded sample text. Error wording matches the spec: `"workplan file changed since proposal; re-propose"`.
- Atomic writes: proposal file written FIRST (idempotency record), workplan SECOND. Both via tmp+rename pattern. If proposal write fails, NO workplan mutation. If the workplan rename fails, the tmp file is cleaned up.
- Banned-phrase set widened beyond the dispatch spec to match the full `.claude/rules/agent-discipline.md` grep list — `HACK`, `XXX`, `temporary`, `stub`, `placeholder`, `pending`, `until F<digit>`, `until v<digit>` added to the original set (`for now`, `just for now`, `next pass`, `TBD`, `will fix later`, `will fix`, `will address`, `address in`, `fix later`, `later` standalone with hyphen-tolerant boundary, `follow up` / `follow-up` verb-phrase, `eventually`, `tomorrow`, `next sprint`, `next cycle`, `next milestone`, `deferred`, `todo`, `fixme`).
- RunGh imported from `src/triage-issues/types.ts` — no third copy. The broader shared-`gh-runtime/` extraction is tracked at [#335](https://github.com/audiocontrol-org/deskwork/issues/335) for operator triage before Phase 5.
- 16 new clone groups dispositioned `keep-with-reason` in clones.yaml per the precedent set in Phase 2.

## Phase 4: Branch archive — `/dw-lifecycle:archive-branch`  ·  [#328](https://github.com/audiocontrol-org/deskwork/issues/328)

**Deliverable:** Preserve-work-then-delete pattern for parked branches.

### Task 1: Implement archive-branch

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/archive-branch.ts`. Takes a branch name.
- [ ] Step 2: Pre-flight checks — refuse if a worktree is checked out for the branch; refuse if `archived/<branch>-<YYYY-MM-DD>` tag already exists.
- [ ] Step 3: Create annotated tag — message references the branch + the operator-supplied or default rationale.
- [ ] Step 4: Push the tag to origin.
- [ ] Step 5: Delete local branch (`git branch -D`); delete remote branch (`git push origin --delete`).
- [ ] Step 6: `plugins/dw-lifecycle/skills/archive-branch/SKILL.md`.
- [ ] Step 7: Vitest unit + integration tests against a fixture remote.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:archive-branch` ships.
- [ ] Creates `archived/<branch>-<date>` annotated tag; pushes; deletes the branch (local + remote).
- [ ] Refuses on dirty/checked-out worktree or pre-existing tag.

## Phase 5: Release-time issue closure — `/dw-lifecycle:close-shipped`  ·  [#329](https://github.com/audiocontrol-org/deskwork/issues/329)

**Deliverable:** Release-time pending-verification labeling for shipped-in-this-version issues. Closure waits for verification per project rule.

### Task 1: Implement close-shipped

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/close-shipped.ts`. Args: `--from-tag <vA>` `--to-tag <vB>` (defaults: previous release tag → current `HEAD`).
- [ ] Step 2: **Multi-source evidence walker** — extracts referenced issue numbers from FOUR sources, deduplicates by issue number, surfaces per-issue provenance (which source(s) flagged it). Sources:
  - (a) **Commit-log scanner**: `git log <vA>..<vB>` for `#NNN` / `Closes #NNN` / `Fixes #NNN` / `Resolves #NNN`.
  - (b) **Audit-log walker**: scan `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md` for `Status: fixed-<sha>` entries where `<sha>` is reachable in `<vA>..<vB>` (via `git tag --contains <sha>` or `git merge-base --is-ancestor <sha> <vB>`).
  - (c) **Tooling-feedback walker**: scan `docs/<v>/001-IN-PROGRESS/<slug>/tooling-feedback.md` for entries marked `Status: Closed | <closing-commit>` where the closing-commit lands in the release range. Optional — features that don't use TF docs contribute zero entries.
  - (d) **Workplan-checkbox walker**: scan `docs/<v>/001-IN-PROGRESS/<slug>/workplan.md` for `[x]` items with embedded `· [#NNN](url)` (the v0.24.1 `dw-lifecycle issues` back-fill format). Issue is closeable when its workplan item is checked.
  Cross-references (b) + (c) link to scope-discovery's audit-log + tooling-feedback infrastructure already canonized as primitives. Sources (a) + (d) are GitHub-native; sources (b) + (c) tap the existing scope-discovery workflows. Discrepancies (e.g. one source says fixed by SHA-X, another says SHA-Y) surface as orphan-source findings; the agent does NOT auto-resolve.
- [ ] Step 3: Apply — for each issue, post a "fixed in v<B>, please verify against the install" comment + add a `pending-verification` label. Does NOT close — closure waits for operator verification per `.claude/rules/agent-discipline.md` § "Issue closure requires verification in a formally-installed release." Comment cites every source that flagged the issue (provenance trail).
- [ ] Step 4: `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`.
- [ ] Step 5: Vitest unit + integration tests; covers each evidence source independently + the cross-source merge.
- [ ] Step 6: Optional `/release` integration — invoke `:close-shipped` post-publish. Operator opts in. Two integration surfaces:
  - **Post-push prompt** (the natural shipment-gate moment): at `/release` Pause 5 after `atomic-push` succeeds, prompt to invoke `:close-shipped --from-tag v<prior> --to-tag v<current>`.
  - **Auto-generated release-notes body**: pipe `:close-shipped --json` output through a renderer that produces a markdown list of pending-verification issues; inject into `gh release edit v<version> --notes "<body>"` so adopters reading `gh release view v<version>` see the closure trail. The release workflow currently creates an empty release; this task wires the body.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:close-shipped` ships.
- [ ] Walks four evidence sources (commit-log + audit-log + TF + workplan); deduplicates by issue number; surfaces per-issue provenance trail.
- [ ] Transitions matching issues to a `pending-verification` label (does NOT close).
- [ ] `/release` invokes `:close-shipped` post-publish (optional integration; landed if operator wants the auto-invoke).
- [ ] `/release` injects an auto-generated release-notes body from the closeable list (adopters see the closure trail on `gh release view`).

## Phase 6: Lifecycle integration  ·  [#330](https://github.com/audiocontrol-org/deskwork/issues/330)

**Deliverable:** Hygiene auto-fires at natural waypoints — session-end captures the just-completed work's debts, session-start displays the prior session's recommendation, complete enforces the no-bare-TBDs gate before merge.

### Task 1: Modify session-end

- [ ] Step 1: Edit `plugins/dw-lifecycle/skills/session-end/SKILL.md` + the helper to capture hygiene observations from the session (commit messages mentioning TBD/defer, files touched matching workplan-TBD patterns, etc.).
- [ ] Step 2: Generate a next-session recommendation block. Operator-editable before commit.
- [ ] Step 3: Land the recommendation block in `DEVELOPMENT-NOTES.md` as part of the journal entry.

### Task 2: Modify session-start

- [ ] Step 1: Edit `plugins/dw-lifecycle/skills/session-start/SKILL.md` + helper to read the prior session's recommendation from `DEVELOPMENT-NOTES.md` and display it.
- [ ] Step 2: NO fresh scan — display-only. Re-entry stays cheap.

### Task 3: Modify complete

- [ ] Step 1: Edit `plugins/dw-lifecycle/skills/complete/SKILL.md` + helper to scan the closing feature's workplan for uncalled-out TBDs.
- [ ] Step 2: Refuse on any bare TBD (no `[debt: #NNN]` back-link, no inline "wontfix because ...").
- [ ] Step 3: Support `--skip-tbd-gate --reason "<substantive>"` override with substantive-reason validator; reason logged in the session journal.

### Task 4: Phase-parent closure gate in `/dw-lifecycle:complete`

Closes a separate concern from the no-bare-TBDs gate: the 17 stale phase parent issues across the repo (e.g. #273 scope-discovery parent, #301 graphical-entries parent, the per-Phase issues #274–#283) have no closure gate. They stay open across releases because no skill walks them.

- [ ] Step 1: Edit the complete helper to walk the closing feature's GitHub issue tree: `gh issue list --search "<slug>"` (or via the feature's stored `parentIssue` frontmatter + `gh api repos/<owner>/<repo>/issues/<parent>/timeline`).
- [ ] Step 2: For each parent issue: test (a) all child phase issues are closed OR (b) the feature reaches feature-complete via this skill's invocation. If either holds, propose closure with a closure comment citing the feature-complete commit + the closed children.
- [ ] Step 3: Operator gate (mirror the batched-proposal pattern from Phase 2). Apply via `gh issue close --comment` on confirmed candidates.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:session-end` carries the hygiene-observations + next-session-recommendation block; lands in `DEVELOPMENT-NOTES.md`.
- [ ] `/dw-lifecycle:session-start` displays the prior session's recommendation without re-scanning.
- [ ] `/dw-lifecycle:complete` carries the pre-merge TBD gate; supports `--skip-tbd-gate --reason "<substantive>"` override with logged reason.
- [ ] `/dw-lifecycle:complete` walks the closing feature's phase-parent issue tree; closes parents whose children are all closed (operator-gated batched proposal).

## Phase 7: Documentation  ·  [#331](https://github.com/audiocontrol-org/deskwork/issues/331)

**Deliverable:** Adopter-facing prose explaining the skill family + the operational pattern.

### Task 1: Author docs

- [ ] Step 1: README section under `plugins/dw-lifecycle/README.md` introducing the hygiene skills + the operational-pattern narrative (operator-triggered + lifecycle-triggered).
- [ ] Step 2: Per-skill `SKILL.md` prose for each new skill (already covered in Phase 1–6 task lists; this phase verifies completeness + cross-references).
- [ ] Step 3: Cross-reference the design spec on main + the related `Just for now is bullshit` rule.
- [ ] Step 4: Add a section to `.claude/rules/agent-discipline.md` titled "Closure is a structural step, not aspirational." Names the hygiene skill family + the post-release + session-end + complete gates that make closure unavoidable. Cites the existing verification rule's "agent posts evidence; operator decides" clause as load-bearing. Documents the structural asymmetry the hygiene feature closes (shipping > closing; previously the closure half of the lifecycle structurally lost across cycles).

**Acceptance Criteria:**
- [ ] Adopter-facing docs (README + per-skill SKILL.md) explain the skills + the operational pattern.
- [ ] Agent-discipline rule documents the closure-as-structural-step pattern.

## Phase 8: Tests + smoke  ·  [#332](https://github.com/audiocontrol-org/deskwork/issues/332)

**Deliverable:** Vitest unit + integration coverage for every v1 skill + a local smoke script.

### Task 1: Test coverage audit

- [ ] Step 1: Verify each Phase 1–5 task has vitest unit + integration tests landed; backfill any gaps.
- [ ] Step 2: Local smoke script `scripts/smoke-hygiene.sh` exercises end-to-end wiring (each skill invoked against a throwaway `gh` fixture repo + fixture workplan tree). NOT added to CI.

**Acceptance Criteria:**
- [ ] All v1 skills carry vitest unit + integration tests against fixture projects.
- [ ] Local smoke script exercises end-to-end wiring.

## Phase 9: Dogfood round  ·  [#333](https://github.com/audiocontrol-org/deskwork/issues/333)

**Deliverable:** First batched-proposal cycle run against the existing backlog. Validates the workflow against real items.

### Task 1: Dogfood the new skills

- [ ] Step 1: Run `/dw-lifecycle:debt-report` to baseline the current state.
- [ ] Step 2: Run `/dw-lifecycle:triage-issues --bucket stale-30d --limit 10` end-to-end (propose → approve → apply). At least one full cycle.
- [ ] Step 3: Run `/dw-lifecycle:promote-deferrals` against one in-progress feature's workplan end-to-end. At least one full cycle.
- [ ] Step 4: Capture friction in `DEVELOPMENT-NOTES.md` as a session-end entry; file follow-up issues for any sharp edges.

**Acceptance Criteria:**
- [ ] Dogfood round against the existing backlog runs at least one full batched-proposal cycle for each of `:triage-issues` and `:promote-deferrals`.
- [ ] Friction captured in `DEVELOPMENT-NOTES.md`; follow-up issues filed for sharp edges.
