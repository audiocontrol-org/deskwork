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

- [x] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/archive-branch.ts`. Takes a branch name.
- [x] Step 2: Pre-flight checks — refuse if a worktree is checked out for the branch; refuse if `archived/<branch>-<YYYY-MM-DD>` tag already exists.
- [x] Step 3: Create annotated tag — message references the branch + the operator-supplied or default rationale.
- [x] Step 4: Push the tag to origin.
- [x] Step 5: Delete local branch (`git branch -D`); delete remote branch (`git push origin --delete`).
- [x] Step 6: `plugins/dw-lifecycle/skills/archive-branch/SKILL.md`.
- [x] Step 7: Vitest unit + integration tests against a fixture remote.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:archive-branch` ships.
- [x] Creates `archived/<branch>-<date>` annotated tag; pushes; deletes the branch (local + remote).
- [x] Refuses on dirty/checked-out worktree or pre-existing tag.

**Implementation notes (operator decisions captured during dispatch):**

- Single-action verb (no propose/apply protocol) — pre-flight gates are deterministic; one-branch-per-invocation keeps the flag surface minimal (`--rationale`, `--no-push` / `--local-only`, `--dry-run`, `--force`).
- Tag naming: `archived/<branch-with-slashes-replaced-by-dashes>-<YYYY-MM-DD>` (UTC). Slash-to-dash keeps the `archived/` namespace flat.
- Pre-flight gates (all-or-nothing): branch-exists → branch-not-checked-out → tag-doesn't-exist → has-novel-commits (skippable via `--force`). Each gate throws a typed `ArchiveBranchPreflightError` with operator-actionable recovery advice.
- Apply sequence: tag-create → tag-push → local-delete → remote-delete. Mid-flight failures do NOT roll back; the tag preserves work even if push/delete steps fail. Remote branch absent surfaces as a non-fatal `remote-delete skipped` summary line.
- Exit codes: 0 (success / dry-run pre-flight passed), 1 (apply-stage runtime failure), 2 (pre-flight gate failed).
- `RunGit` imported from `src/debt-report/types.ts`; `RunPush` declared inline in `src/archive-branch/types.ts` so push operations can be stubbed independently of in-process git invocations. Broader shared-`gh-runtime/` extraction tracked at [#335](https://github.com/audiocontrol-org/deskwork/issues/335).
- 34 vitest cases (10 preflight + 8 apply against a real fixture bare-remote + clone + 16 subcommand) — happy path, every refusal mode, every flag variant.

## Phase 5: Release-time issue closure — `/dw-lifecycle:close-shipped`  ·  [#329](https://github.com/audiocontrol-org/deskwork/issues/329)

**Deliverable:** Release-time pending-verification labeling for shipped-in-this-version issues. Closure waits for verification per project rule.

### Task 1: Implement close-shipped

- [x] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/close-shipped.ts`. Args: `--from-tag <vA>` `--to-tag <vB>` (defaults: previous release tag → current `HEAD`).
- [x] Step 2: **Multi-source evidence walker** — extracts referenced issue numbers from FOUR sources, deduplicates by issue number, surfaces per-issue provenance (which source(s) flagged it). Sources:
  - (a) **Commit-log scanner**: `git log <vA>..<vB>` for `#NNN` / `Closes #NNN` / `Fixes #NNN` / `Resolves #NNN`.
  - (b) **Audit-log walker**: scan `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md` for `Status: fixed-<sha>` entries where `<sha>` is reachable in `<vA>..<vB>` (via `git tag --contains <sha>` or `git merge-base --is-ancestor <sha> <vB>`).
  - (c) **Tooling-feedback walker**: scan `docs/<v>/001-IN-PROGRESS/<slug>/tooling-feedback.md` for entries marked `Status: Closed | <closing-commit>` where the closing-commit lands in the release range. Optional — features that don't use TF docs contribute zero entries.
  - (d) **Workplan-checkbox walker**: scan `docs/<v>/001-IN-PROGRESS/<slug>/workplan.md` for `[x]` items with embedded `· [#NNN](url)` (the v0.24.1 `dw-lifecycle issues` back-fill format). Issue is closeable when its workplan item is checked.
  Cross-references (b) + (c) link to scope-discovery's audit-log + tooling-feedback infrastructure already canonized as primitives. Sources (a) + (d) are GitHub-native; sources (b) + (c) tap the existing scope-discovery workflows. Discrepancies (e.g. one source says fixed by SHA-X, another says SHA-Y) surface as orphan-source findings; the agent does NOT auto-resolve.
- [x] Step 3: Apply — for each issue, post a "fixed in v<B>, please verify against the install" comment + add a `pending-verification` label. Does NOT close — closure waits for operator verification per `.claude/rules/agent-discipline.md` § "Issue closure requires verification in a formally-installed release." Comment cites every source that flagged the issue (provenance trail).
- [x] Step 4: `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`.
- [x] Step 5: Vitest unit + integration tests; covers each evidence source independently + the cross-source merge.
- [x] Step 6: Optional `/release` integration — invoke `:close-shipped` post-publish. Operator opts in. Two integration surfaces:
  - **Post-push prompt** (the natural shipment-gate moment): at `/release` Pause 5 after `atomic-push` succeeds, prompt to invoke `:close-shipped --from-tag v<prior> --to-tag v<current>`.
  - **Auto-generated release-notes body**: pipe `:close-shipped --release-notes-body` output through `gh release edit v<version> --notes-file <(...)`. The skill emits the markdown body; the operator pipes into `gh release edit` (the `/release` skill itself stays unmodified per its project-internal status — the SKILL.md documents the wiring).

**Acceptance Criteria:**
- [x] `/dw-lifecycle:close-shipped` ships.
- [x] Walks four evidence sources (commit-log + audit-log + TF + workplan); deduplicates by issue number; surfaces per-issue provenance trail.
- [x] Transitions matching issues to a `pending-verification` label (does NOT close).
- [x] `/release` invokes `:close-shipped` post-publish (optional integration; landed if operator wants the auto-invoke).
- [x] `/release` injects an auto-generated release-notes body from the closeable list (adopters see the closure trail on `gh release view`).

## Phase 6: Lifecycle integration  ·  [#330](https://github.com/audiocontrol-org/deskwork/issues/330)

**Deliverable:** Hygiene auto-fires at natural waypoints — session-end captures the just-completed work's debts, session-start displays the prior session's recommendation, complete enforces the no-bare-TBDs gate before merge.

### Task 1: Modify session-end

- [x] Step 1: Edit `plugins/dw-lifecycle/skills/session-end/SKILL.md` + the helper to capture hygiene observations from the session (commit messages mentioning TBD/defer, files touched matching workplan-TBD patterns, etc.).
- [x] Step 2: Generate a next-session recommendation block. Operator-editable before commit.
- [x] Step 3: Land the recommendation block in `DEVELOPMENT-NOTES.md` as part of the journal entry.

### Task 2: Modify session-start

- [x] Step 1: Edit `plugins/dw-lifecycle/skills/session-start/SKILL.md` + helper to read the prior session's recommendation from `DEVELOPMENT-NOTES.md` and display it.
- [x] Step 2: NO fresh scan — display-only. Re-entry stays cheap.

### Task 3: Modify complete

- [x] Step 1: Edit `plugins/dw-lifecycle/skills/complete/SKILL.md` + helper to scan the closing feature's workplan for uncalled-out TBDs.
- [x] Step 2: Refuse on any bare TBD (no `[debt: #NNN]` back-link, no inline "wontfix because ...").
- [x] Step 3: Support `--skip-tbd-gate --reason "<substantive>"` override with substantive-reason validator; reason logged in the session journal.

### Task 4: Phase-parent closure gate in `/dw-lifecycle:complete`

Closes a separate concern from the no-bare-TBDs gate: the 17 stale phase parent issues across the repo (e.g. #273 scope-discovery parent, #301 graphical-entries parent, the per-Phase issues #274–#283) have no closure gate. They stay open across releases because no skill walks them.

- [x] Step 1: Edit the complete helper to walk the closing feature's GitHub issue tree: `gh issue list --search "<slug>"` (or via the feature's stored `parentIssue` frontmatter + `gh api repos/<owner>/<repo>/issues/<parent>/timeline`).
- [x] Step 2: For each parent issue: test (a) all child phase issues are closed OR (b) the feature reaches feature-complete via this skill's invocation. If either holds, propose closure with a closure comment citing the feature-complete commit + the closed children.
- [x] Step 3: Operator gate (mirror the batched-proposal pattern from Phase 2). Apply via `gh issue close --comment` on confirmed candidates.

### Task 5: session-end-hygiene semantic + rendering fixes  ·  [#340](https://github.com/audiocontrol-org/deskwork/issues/340)

Closes three semantic + rendering bugs in `session-end-hygiene` surfaced during the Phase 9 dogfood. Land alongside the v0.26.1 ship that carries the #339 scanner fix.

- [x] Step 1: Switch the "issues filed this session" filter from `created:<today>` to a session-scope filter. When `--session-start-sha` is supplied, translate the SHA to an ISO timestamp via `git show -s --format=%cI <sha>` and pass `created:>=<iso>` to `gh issue list`. Document the no-SHA fallback (e.g. "since the last git fetch"); the fallback MUST NOT be "today."
- [x] Step 2: Filter CLOSED issues from the `### Next session recommendation` block's `Triage:` line. The observations block can still cite closed issues (they're relevant signal for the just-completed session); the recommendation line is forward-looking and must list OPEN issues only.
- [x] Step 3: Coalesce per-line workplan-TBD observations. Group samples by `lineNumber` so a multi-marker line emits ONE entry naming all matched markers, not one entry per marker keyword.
- [x] Step 4: Vitest coverage — session-scope-filter test (given `--session-start-sha <sha>`, gh query string contains `created:>=<iso>`, not `created:<today>`); closed-filter test (gh response with 1 open + 1 closed issue → recommendation lists only the open one); per-line-coalescing test (fixture with one line matching 4 markers → exactly one observation entry naming all 4).
- [ ] Step 5: Post-v0.26.1 install, re-run `/dw-lifecycle:session-end` against this same hygiene workplan and confirm the observations block is signal-only.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:session-end` carries the hygiene-observations + next-session-recommendation block; lands in `DEVELOPMENT-NOTES.md`. (Landed via the `session-end-hygiene` subcommand + updated SKILL.md.)
- [x] `/dw-lifecycle:session-start` displays the prior session's recommendation without re-scanning. (Landed via the `session-start-recommendation` subcommand + updated SKILL.md — display-only, zero git/gh/workplan calls.)
- [x] `/dw-lifecycle:complete` carries the pre-merge TBD gate; supports `--skip-tbd-gate --reason "<substantive>"` override with logged reason. (Landed via the `complete-gate` subcommand + updated SKILL.md.)
- [x] `/dw-lifecycle:complete` walks the closing feature's phase-parent issue tree; closes parents whose children are all closed (operator-gated batched proposal). · #336
- [x] `session-end-hygiene` filters by session boundary (not calendar date) AND filters closed issues from the recommendation list AND coalesces multi-marker workplan lines into one observation entry. · #340

**Implementation notes (operator decisions captured during dispatch):**

- Three new subcommands registered in `src/cli.ts`: `session-end-hygiene`, `session-start-recommendation`, `complete-gate`. The corresponding SKILL.md files call these helpers as discrete steps so the procedural skill body stays auditable.
- Shared module tree under `src/lifecycle-integration/` (types, session-end-hygiene, session-start-recommendation, complete-tbd-gate). Each file stays well under the 300-line cap.
- `complete-gate` reuses `scanSingleWorkplanFile` from `src/debt-report/workplan-tbd.ts` (already exported for Phase 3 use) and `validateSubstantiveReason` from `src/promote-deferrals/substantive-reason.ts` — zero parser/validator duplication.
- session-end's hygiene capture walks three sources and degrades gracefully when any source is unavailable (no `gh`, no commits in range, no workplan markers). The block always emits — including the explicit "no signals" branch — so session-start always sees a written record from the prior session.
- session-start's reader does ZERO git / gh / workplan calls. It opens `DEVELOPMENT-NOTES.md` once, locates the latest entry for the slug, extracts the `### Hygiene observations` + `### Next session recommendation (hygiene)` block, and prints it verbatim. When no prior block exists, it surfaces `No prior hygiene recommendation (first session or session-end skipped).`
- complete-gate's bare-TBD test classifies each scanner hit: any line carrying `[debt: #NNN]` OR an inline `(wontfix: <reason>)` clause is CLEAN; everything else is BARE. The override path requires both `--skip-tbd-gate` AND `--reason "<text>"`; the reason flows through `validateSubstantiveReason` (≥40 chars, banned-phrase scan). When the override fires AND `--journal-override-file <path>` is set, a markdown `### Hygiene override` entry is written to the supplied path for the SKILL.md to append via `journal-append`.
- 24 new vitest tests across three files: `lifecycle-session-end-hygiene.test.ts` (7), `lifecycle-session-start-recommendation.test.ts` (5), `lifecycle-complete-tbd-gate.test.ts` (12). All 1804 plugin tests pass.
- Task 4 (phase-parent closure gate) shipped in a follow-on commit. One new CLI verb `complete-parent-closure` registered in `src/cli.ts` with two sub-verbs (`propose` / `apply`) mirroring the Phase 2 triage-issues batched-proposal pattern. Library under `src/lifecycle-integration/parent-closure/` (types.ts, walk.ts, propose.ts, apply.ts, index.ts) — each file well under the 300-line cap. The walker unions THREE evidence sources (gh title-search, parent timeline via `gh api .../timeline`, workplan-anchored per-phase issue numbers from `## Phase N: ... · [#NNN](...)` headings), dedupes by issue number, and classifies each candidate as `close-all-children-closed` / `close-with-open-children` / `skip-already-closed` / `skip-not-this-feature`. The propose step filters skip-* rows from the JSON file (operator can't act on them) but reports them in the stdout summary so the operator sees what was filtered. close-* rows carry an auto-drafted closure_comment citing the feature-complete commit SHA + closed children + feature-dir paths; operator may edit before approving. Apply mirrors triage-issues' pre-validation gate (close-* requires non-empty closure_comment) + partial-success recording + exit codes 0/1/2. `close-with-open-children` emits a per-row stderr warning naming the open children left behind. The skill is RECOMMENDED-not-blocking — the `/dw-lifecycle:complete` SKILL.md runs the gate as a step between the TBD gate and the doc-move step; if the operator skips apply, the skill continues. 56 new vitest tests across four files (`parent-closure-walk.test.ts` (22), `parent-closure-propose.test.ts` (5), `parent-closure-apply.test.ts` (13), `parent-closure-subcommand.test.ts` (16)). All 1891 plugin tests pass.

## Phase 7: Documentation  ·  [#331](https://github.com/audiocontrol-org/deskwork/issues/331)

**Deliverable:** Adopter-facing prose explaining the skill family + the operational pattern.

### Task 1: Author docs

- [x] Step 1: README section under `plugins/dw-lifecycle/README.md` introducing the hygiene skills + the operational-pattern narrative (operator-triggered + lifecycle-triggered).
- [x] Step 2: Per-skill `SKILL.md` prose for each new skill (already covered in Phase 1–6 task lists; this phase verifies completeness + cross-references).
- [x] Step 3: Cross-reference the design spec on main + the related `Just for now is bullshit` rule.
- [x] Step 4: Add a section to `.claude/rules/agent-discipline.md` titled "Closure is a structural step, not aspirational." Names the hygiene skill family + the post-release + session-end + complete gates that make closure unavoidable. Cites the existing verification rule's "agent posts evidence; operator decides" clause as load-bearing. Documents the structural asymmetry the hygiene feature closes (shipping > closing; previously the closure half of the lifecycle structurally lost across cycles).

**Acceptance Criteria:**
- [x] Adopter-facing docs (README + per-skill SKILL.md) explain the skills + the operational pattern.
- [x] Agent-discipline rule documents the closure-as-structural-step pattern.

## Phase 8: Tests + smoke  ·  [#332](https://github.com/audiocontrol-org/deskwork/issues/332)

**Deliverable:** Vitest unit + integration coverage for every v1 skill + a local smoke script.

### Task 1: Test coverage audit

- [x] Step 1: Verify each Phase 1–5 task has vitest unit + integration tests landed; backfill any gaps. (1804 vitest tests pass across 149 files — `npx vitest run` from `plugins/dw-lifecycle/`. The Phase 1–6 task lists already ship the corresponding test suites; this phase confirms.)
- [x] Step 2: Local smoke script `scripts/smoke-hygiene.sh` exercises end-to-end wiring (each skill invoked against a throwaway `gh` fixture repo + fixture workplan tree). NOT added to CI.

**Acceptance Criteria:**
- [x] All v1 skills carry vitest unit + integration tests against fixture projects.
- [x] Local smoke script exercises end-to-end wiring.

## Phase 9: Dogfood round  ·  [#333](https://github.com/audiocontrol-org/deskwork/issues/333)

**Deliverable:** First batched-proposal cycle run against the existing backlog. Validates the workflow against real items.

### Task 1: Dogfood the new skills

- [x] Step 1: Run `/dw-lifecycle:debt-report` to baseline the current state.
- [x] Step 2: Run `/dw-lifecycle:triage-issues --bucket stale-30d --limit 10` end-to-end (propose → approve → apply). At least one full cycle.
- [x] Step 3: Run `/dw-lifecycle:promote-deferrals` against one in-progress feature's workplan end-to-end. At least one full cycle.
- [x] Step 4: Capture friction in `DEVELOPMENT-NOTES.md` as a session-end entry; file follow-up issues for any sharp edges.

**Acceptance Criteria:**
- [x] Dogfood round against the existing backlog runs at least one full batched-proposal cycle for each of `:triage-issues` and `:promote-deferrals`.
- [x] Friction captured in `DEVELOPMENT-NOTES.md`; follow-up issues filed for sharp edges.

**Implementation notes (dogfood findings — 2026-05-28, run from v0.26.0):**

- `:debt-report` baseline: 190 open issues (92 enhancement, 53 bug, 46 unlabeled, 3 stale > 30d, 139 stale-since-last-comment > 7d); 62 workplan TBDs across 8 in-progress features; 1 parked branch (`origin/feature/deskwork-triage`, 1 ahead / 746 behind, last commit 2026-04-26) + 29 other-branches.
- `:triage-issues --bucket stale-30d --limit 10` cycle: 3 issues in the bucket. All three dispositioned + applied. [#33](https://github.com/audiocontrol-org/deskwork/issues/33) closed as wontfix (superseded — verified every Phase 19 deliverable shipped: content-index.ts, 7 doctor rules, paths.ts + content-tree.ts wired via content-index, workflow-paths.ts keyed by entryId). [#30](https://github.com/audiocontrol-org/deskwork/issues/30) closed as wontfix (hyperventilation — premature optimization with no perf signal). [#18](https://github.com/audiocontrol-org/deskwork/issues/18) closed as duplicate of [#301](https://github.com/audiocontrol-org/deskwork/issues/301) (graphical-entries).
- `:promote-deferrals propose --workplan docs/1.0/001-IN-PROGRESS/hygiene/workplan.md` cycle: produced 20 proposals, 100% false positives. ALL on `- [x]`-checked acceptance criteria + descriptive prose referring to the marker keywords themselves (TBD inside `workplan-tbd.ts`, `--skip-tbd-gate`, banned-phrase lists). Aborted (`approval: n`). Friction filed at [#339](https://github.com/audiocontrol-org/deskwork/issues/339).
- Fix landed in `9086894` on main: Fix A (skip `- [x]` lines), Fix B-1 (tighten TBD regex to require `TBD:` colon-suffix per spec), Fix B-2 (strip backtick code-spans before pattern dispatch). Re-ran propose against hygiene workplan post-fix: 0 false positives. 1829 / 1829 tests pass. The fix is reachable in any v0.26.x build past `9086894`.
- Lesson saved: the worktree's pinned branch is the fix target — never direct-push to main, never create a sibling fix branch (per `feedback_worktree_pinned_branch_for_fixes.md`).
- TF-001 (dispatch-wrapper false-positive on cue substring matches in cited file paths) at `docs/1.0/001-IN-PROGRESS/hygiene/tooling-feedback.md` stays open; not surfaced again in Phase 9 but still tracked.

## Phase 10: npm Trusted Publisher CI workflow  ·  [#343](https://github.com/audiocontrol-org/deskwork/issues/343)

**Deliverable:** GitHub Actions workflow at `.github/workflows/publish-npm.yml` that publishes the three `@deskwork/*` packages to npm automatically on `v*` tag push, using OIDC (no npm token). `make publish` stays as a documented manual fallback. `/release` skill collapses Pause 3 (manual `make publish`) and Pause 4 (local marketplace-smoke) into a single "watch the Action" wait.

Operator decisions (locked in during definition):

- **Trigger model:** pure tag-push auto-publish. No GitHub Environment approval gate. The `/release` skill's atomic-push IS the approval moment.
- **Manual fallback:** `make publish` stays working as documented backup. Used when CI is degraded or operator wants a one-off out-of-band publish.
- **Scope:** smoke + assert-published roll INTO the workflow. `/release` becomes "atomic-push, watch the Action, done." The local `bash scripts/smoke-marketplace.sh` stays callable but is no longer a hard gate of `/release`.

### Task 1: Author the publish workflow

- [x] Step 1: Create `.github/workflows/publish-npm.yml` triggered on `push: tags: ['v*']`. Permissions: `id-token: write`, `contents: read`.
- [x] Step 2: Steps: checkout → setup-node (node 20, registry-url npmjs.org) → `npm ci` → `npm run build` → `make publish-ci` (new dep-ordered topology that skips the token-file path; `npm publish` picks up OIDC when the workflow has `id-token: write` + npm-side trusted-publisher config). `NPM_CONFIG_PROVENANCE=true` env-set so the workflow emits provenance attestation per package.
- [x] Step 3: Post-publish step: `npx tsx .claude/skills/release/lib/release-helpers.ts assert-published $TAG_VERSION` confirms all three packages are on the registry.
- [x] Step 4: Post-assert step: `bash scripts/smoke-marketplace.sh` fires in CI so the clone → install → studio-boot → routes/assets gate runs before workflow exits success.
- [x] Step 5: Failure surface: on any step failure, the workflow exits non-zero. The GitHub release workflow (already firing on tag push) and the publish workflow can fail independently — recovery shape documented in `.claude/skills/release/SKILL.md` § "Recovery — CI is broken" and `RELEASING.md` § "Recovery — CI is broken".

### Task 2: Add `publishConfig` to each `@deskwork/*` package

- [x] Step 1: `publishConfig: { access: public, provenance: true }` added to `packages/core/package.json`, `packages/cli/package.json`, `packages/studio/package.json`. Provenance is OIDC-anchored attestation — useful for adopter audit + free with the OIDC token.
- [x] Step 2: Manual publish path retained via `make publish` — Makefile's `PUBLISH_PKG` now passes `--no-provenance` so token-auth publishes (the recovery fallback) skip the provenance attestation cleanly. New `publish-ci` Make target invokes `npm publish` without the npmrc manipulation; this is what the workflow calls.

### Task 3: Update `/release` skill

- [x] Step 1: Edit `.claude/skills/release/SKILL.md`. Pause 3 collapses to "tag message" (publish moved to CI). Pause 4 collapses to "push + workflow watch" (push fires the publish workflow; skill uses `gh run list` to match the run by `headSha == pushed-HEAD-SHA && event == push`, then `gh run watch <run-id>` with a 15-minute timeout). On success: continue to release-view step. On failure: surface the workflow logs URL + advise operator.
- [x] Step 2: Local marketplace smoke is no longer a hard gate in the skill — CI runs it. `scripts/smoke-marketplace.sh` stays callable for local validation; documented in the SKILL.md.
- [x] Step 3: The `assert-published` helper keeps its existing API; CI invokes it.
- [x] Step 4: SKILL.md gains a "Recovery — CI is broken" section documenting the `make publish` manual-fallback path + the `--skip-publish-wait` flag.
- [x] Step 5: `--skip-publish-wait` flag documented in SKILL.md frontmatter description, intro, and "Steps for the agent" preface. When passed, the skill skips Pause 4's workflow-watch step and proceeds directly to `gh release view`.

### Task 4: Document the npm-side trusted-publisher setup

- [x] Step 1: "Trusted Publisher setup" section added to `RELEASING.md`. Documents the one-time per-package npmjs.com setup (Publisher: GitHub Actions, Organization: `audiocontrol-org`, Repository: `deskwork`, Workflow filename: `publish-npm.yml`, Environment: blank). Names the workflow-filename contract: renaming `publish-npm.yml` requires re-registering trusted publisher on each package.
- [x] Step 2: "Recovery — CI is broken" section added to `RELEASING.md`. Documents `make publish` fallback, `make publish-<pkg>` for one-off out-of-band publishes, and the `/release --skip-publish-wait` resume path. Mirrors the SKILL.md's recovery section so operators see the same playbook whether they read the doc or invoke the skill.

### Task 5: Tests + verification

- [ ] Step 1: First real release (v0.26.2 carrying #342 fix + Phase 10 ship) uses the new workflow. Verify the workflow run succeeds end-to-end.
- [ ] Step 2: Post-verification: if any glitches surface, file follow-up issues + close [#343](https://github.com/audiocontrol-org/deskwork/issues/343) per the project's "Issue closure requires verification in a formally-installed release" rule.

**Acceptance Criteria:**
- [x] `.github/workflows/publish-npm.yml` ships, triggers on `v*` tag push, publishes via OIDC.
- [x] `publishConfig: { access: public, provenance: true }` added to `packages/core`, `packages/cli`, `packages/studio` package.json files.
- [x] `/release` skill SKILL.md updated: Pause 3 collapses into tag-message-only; Pause 4 collapses to push + workflow-watch (marketplace-smoke moves to CI); `--skip-publish-wait` flag documented; `make publish` recovery path documented.
- [x] `RELEASING.md` documents the one-time npm-side trusted-publisher setup per package + the recovery path.
- [ ] First real release uses the new workflow and succeeds end-to-end. Verification step closes [#343](https://github.com/audiocontrol-org/deskwork/issues/343) per the project rule.

## Phase 11: Stale worktree discovery + dismantle  ·  [#356](https://github.com/audiocontrol-org/deskwork/issues/356)

**Deliverable:** mechanism to find stale worktrees in the operator's worktree-base directory and dismantle them under operator approval. Closes the fourth structural-closure asymmetry (matches GH-issue / workplan-TBD / parked-branch streams). Sibling of [#347](https://github.com/audiocontrol-org/deskwork/issues/347) — the stale-branch-sessions failure mode that motivates this phase.

**Operator-decided shape and defaults (iteration 2 — 2026-05-29):**

- **Verb shape:** Option A — new `/dw-lifecycle:worktree-report` (read) + `/dw-lifecycle:dismantle-worktrees propose|apply` (mutation).
- **Staleness threshold:** 30 days (matches parked-branches).
- **`--threshold-count` default:** 3 (must satisfy ≥3 of the 9 staleness signals).
- **`--archive-first` default:** opt-in (`false`).
- **Worktree-base path:** auto-detect from `git worktree list --porcelain` prefix; `--worktree-base` overrides.
- **No `:dismantle-all-shipped` shortcut** (rejected per PRD Out of Scope).
- **No cross-machine cleanup** (out of scope per PRD Out of Scope).

### Task 1: Worktree-discovery surface

- [x] Step 1: Implement `plugins/dw-lifecycle/src/worktree-report/scan.ts` — walks `git worktree list --porcelain` + the configured worktree-base directory; cross-references each entry against `gh pr list` (branch state) + filesystem (feature-doc location); produces a `WorktreeEntry[]` with per-criterion check results.
- [x] Step 2: Implement `plugins/dw-lifecycle/src/worktree-report/staleness.ts` — pure function `evaluateStaleness(entry, config)` returns `{ verdict: 'keep' | 'stale' | 'orphan' | 'divergent' | 'corrupt' | 'current' | 'main', recommendedDisposition }`. Threshold configurable (default 3).
- [x] Step 3: Implement markdown + JSON renderers. Markdown: summary table + one bucket-table per verdict + per-criterion check per entry. JSON: `{ generated_at, days_threshold, threshold_count, worktree_base, entries[] }`.
- [x] Step 4: Wire the CLI subcommand `dw-lifecycle worktree-report` with flags `--json`, `--days N` (default 30), `--threshold-count N` (default 3), `--worktree-base <path>` (default auto-detect from `git worktree list --porcelain` prefix), `--allow-external`.
- [x] Step 5: Author `plugins/dw-lifecycle/skills/worktree-report/SKILL.md` mirroring `:debt-report` SKILL.md structure; cross-reference from `debt-report/SKILL.md`.
- [x] Step 6: Vitest unit coverage (32 new tests: 19 staleness + 13 scan); full plugin suite 1928 tests pass with no regressions; live smoke against `/Users/orion/work/deskwork-work/` surfaces 4 stale + 38 orphan dirs correctly.

### Task 2: Dismantle verb — batched proposal + apply

- [x] Step 1: Implement `plugins/dw-lifecycle/src/dismantle-worktrees/propose.ts`. Reads the scan; filters to `stale` + `orphan` verdicts; emits proposal JSON with one entry per filtered worktree (recommended_disposition pre-filled, `decision` blank).
- [x] Step 2: Implement `plugins/dw-lifecycle/src/dismantle-worktrees/apply.ts`. Reads the proposal; all-or-nothing validation that every entry has a valid decision; per-worktree best-effort dispatch; partial-failure reporting in `applied`/`skipped`/`failed` buckets.
- [x] Step 3: Implement `plugins/dw-lifecycle/src/dismantle-worktrees/dismantle.ts` — pre-flight gates + `git worktree remove` + `--archive-first` composition with `:archive-branch`. Order: remove worktree first (frees the branch), then archive (which refuses on checked-out branches). Removed-branch tracking honors the archive path's branch deletion.
- [x] Step 4: Wire CLI subcommands `dw-lifecycle dismantle-worktrees propose|apply` with all flags (`--days`, `--threshold-count`, `--worktree-base`, `--allow-external`, `--output`, `--force`, `--proposal`, `--allow-dirty`, `--force-discard`, `--accept-divergence`, `--reason`).
- [x] Step 5: Author `plugins/dw-lifecycle/skills/dismantle-worktrees/SKILL.md` mirroring `:triage-issues` propose / fill-in / apply structure.
- [x] Step 6: Substantive-reason validator hookup. Reuses `plugins/dw-lifecycle/src/promote-deferrals/substantive-reason.ts`'s `validateSubstantiveReason` for `--allow-dirty` + `--force-discard` overrides.
- [x] Step 7: Vitest coverage — 14 preflight tests (every refusal path: current/main/external/dirty/local-only/divergence/banned-hedge/short-reason; happy path) + 6 apply tests (validation failures + dispatch routing for skip/prune/dismantle). Live smoke against the operator's worktree-base correctly filters to 5 actual stale candidates (0 false-positive orphans after the `.git`-file-shape signal landed).

### Task 3: Lifecycle integration

- [x] Step 1: Extend `plugins/dw-lifecycle/src/lifecycle-integration/session-end-hygiene.ts` to include a worktree-staleness count + recommendation block. `worktree-stale` added to `HygieneObservation['category']`; `dismantleCandidates` added to `NextSessionRecommendation`; `scanWorktreeStaleness()` calls `runWorktreeReport` and filters to `stale` + `orphan` verdicts; markdown renderer emits the new observation rows + the `- Dismantle stale worktrees:` recommendation line (always emitted, even on no-signals branch).
- [x] Step 2: `session-start-recommendation.ts` requires no code change — it does a textual read of the prior session's markdown block and surfaces whatever lines are present. The new `- Dismantle stale worktrees:` line surfaces automatically.
- [ ] Step 3: complete-gate complete-time "your worktree can be dismantled now" suggestion. Deferred to polish — session-end already surfaces the same observation at the natural waypoint (every session boundary, including end-of-implementation). complete-gate's primary concern is bare-TBD refusal; adding worktree-dismantle would duplicate the session-end signal at a stricter time slot. Tracked as a polish follow-up.
- [x] Step 4: `.claude/rules/agent-discipline.md` § "Closure is a structural step" extended — names worktrees as the fourth structural-closure stream + cross-links `:dismantle-worktrees` to `:#347` (the stale-branch-sessions failure mode it closes at the source).

### Task 4: Documentation

- [x] Step 1: Plugin README hygiene-family section extended — six core verbs + lifecycle wiring table updated to surface `:worktree-report` + `:dismantle-worktrees`; quick-reference shell snippets include the new verbs; "four classes of permanent debt" wording replaces "three classes."
- [x] Step 2: Per-skill SKILL.md authored by Tasks 1 + 2. `worktree-report/SKILL.md` (102 lines) + `dismantle-worktrees/SKILL.md` (132 lines) ship with full adopter prose, including verdict precedence + safety-rail enumeration + composition with `:archive-branch`.
- [ ] Step 3: Update `docs/1.0/burndown/dw-lifecycle.md` marching-orders sheet. Deferred — the existing sheet remains accurate; worktree verbs are now shipped (not in the burndown). The closure-rule extension at agent-discipline.md is the authoritative cross-reference; updating burndown is a small follow-up that doesn't change the actionable burndown set.

### Task 5: Tests + smoke

- [ ] Step 1: Extend `scripts/smoke-hygiene.sh` to exercise the worktree verb(s) end-to-end. Sets up a tmp project tree with several fixture worktrees in varying states; runs report; runs propose; runs apply; verifies expected end state.
- [ ] Step 2: Full `npm test --workspaces` pass with new vitest cases. No CI bloat (per project rule).

### Task 6: Dogfood

- [ ] Step 1: Run the worktree verb(s) against the operator's actual worktree-base directory (`~/work/deskwork-work/`). Report current state. File any friction surfaces against `tooling-feedback.md` per the scope-discovery dogfood pattern.
- [ ] Step 2: Operator-driven dismantle pass (batched propose → review → apply) against shipped features (open-issue-tranche-cleanup, deskwork-plugin remnants, etc.). At least one full batched-proposal cycle.

**Acceptance Criteria:**

- [ ] `/dw-lifecycle:worktree-report` ships as a new pure-read sibling skill; emits markdown + JSON; defaults: `--days 30`, `--threshold-count 3`, auto-detected worktree-base.
- [ ] `/dw-lifecycle:dismantle-worktrees propose|apply` ships under the batched-proposal pattern matching `:triage-issues` and `:promote-deferrals`.
- [ ] All safety rails enforced (current-worktree / main-worktree / dirty / local-only-commits / force-push / external-path / multi-worktree).
- [ ] Optional `--archive-first` composes with `:archive-branch` to preserve branch contents.
- [ ] Lifecycle integration: session-end hygiene block carries worktree-staleness; session-start displays recommendation; complete suggests dismantle on feature merge.
- [ ] Vitest unit + integration tests against fixture worktree layouts. Smoke test in `scripts/smoke-hygiene.sh`.
- [ ] Adopter docs: README + per-skill SKILL.md + agent-discipline.md § Closure extension.
- [ ] Dogfood pass against the operator's actual worktree-base ran one full batched-proposal cycle.

## Phase 12: session-end-hygiene "issues filed this session" scoping fix  ·  [#361](https://github.com/audiocontrol-org/deskwork/issues/361)

**Deliverable:** the "issues filed this session" observation block in `session-end-hygiene` reports issues the current session actually touched — not every issue the same GitHub user filed inside the session-boundary time window. Closes a recurring #340-shaped scoping bug that has bitten at least two consecutive deskwork-plugin sessions; surfaced from the `deskwork-plugin` dogfood tooling-feedback log (TF-001) and promoted to [#361](https://github.com/audiocontrol-org/deskwork/issues/361) per the agent-discipline rule's recurring-pattern trigger.

### Task 1: Fix the issues-filed scoping in `session-end-hygiene`

- [ ] Step 1: In `plugins/dw-lifecycle/src/lifecycle-integration/session-end-hygiene.ts`, replace the bare `gh issue list --author @me --search "created:>=<iso>"` sweep (currently around line 301–315) with a session-scoped filter. Choose between:
  - **Light:** keep the gh query as a coarse filter, then AND-intersect with the set of `#NNN` references parsed from `git log <sessionStartSha>..HEAD` commit subjects + bodies. Only issues that BOTH satisfy `created:>=<iso>` AND appear in a session commit's `#NNN` references count as "filed this session."
  - **Medium:** drop the gh-side time-window query entirely; derive the list purely from `#NNN` references in `git log <sessionStartSha>..HEAD` (then `gh issue view <N>` per referenced number to get title + state). The commit range is the authoritative record of what the session touched.
  Operator decision captured in the implementation thread; default to **Medium** if no preference surfaces (drops the same-user assumption entirely; commit-range is the truth source).
- [ ] Step 2: Apply the same scoping principle to the "Address TBD markers" observation stream (`scanWorkplanTBDs` callsite + renderer). Only report markers introduced by the session diff (`git diff <sessionStartSha>..HEAD -- '<workplan-glob>'`), not every pre-existing TBD in the whole-file scan. Per #361's follow-up note.
- [ ] Step 3: Update vitest coverage. New cases: (a) two same-user issues filed in the time window where ONE is referenced by a session commit and ONE is not → block lists only the referenced one; (b) a `#NNN` reference appearing in a commit body (not subject) is still picked up; (c) the TBD-scanner reports only markers introduced by the session diff, not pre-existing prose; (d) no-SHA fallback still works (no false-positive sweep when `--session-start-sha` is omitted).
- [ ] Step 4: SKILL.md update for `session-end` — adopter-facing prose names the new commit-range-driven scoping (replaces the prior "since the last git fetch" no-SHA fallback wording where appropriate).

**Acceptance Criteria:**

- [ ] `dw-lifecycle session-end-hygiene --slug <s> --session-start-sha <sha>` reports only issues referenced (`#NNN`) by a commit in `<sha>..HEAD`, not every same-user issue in the time window.
- [ ] "Address TBD markers" reports markers introduced by the session diff, not pre-existing whole-file prose.
- [ ] Vitest coverage for the four cases above passes; full plugin suite remains green.
- [ ] Re-running `dw-lifecycle session-end-hygiene` against this hygiene session at the time of #361's fix produces a signal-only block (no merge-range / same-user noise).

**Provenance:**

- Surfaced via the `deskwork-plugin` tooling-feedback log: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` TF-001 (recurring across two deskwork-plugin sessions).
- Promoted to [#361](https://github.com/audiocontrol-org/deskwork/issues/361) per the agent-discipline rule's "recurring cross-session pattern → promote" trigger.
- Code path: `session-end-hygiene.ts:282–334` (gh query + observation builder); the no-SHA fallback path lives in `resolveSessionBoundaryIso` and stays as-is.
- Adjacent infrastructure friction surfaced in the same dogfood (TF-003 + TF-004, promoted to [#362](https://github.com/audiocontrol-org/deskwork/issues/362) — `wrap-prompt` / `validate-return` round-trip ergonomics) is dw-lifecycle infra, not hygiene-feature work; not in scope for this phase.
