---
slug: hygiene
targetVersion: "1.0"
date: 2026-05-28
---

# Workplan: Hygiene

**Goal:** Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style per `.claude/CLAUDE.md` § Plugin Conventions) that surface debt on demand, drive operator-triggered batched-proposal cycles, and integrate with natural lifecycle waypoints. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

**Reference design spec:** [`docs/superpowers/specs/2026-05-28-hygiene-design.md`](../../../superpowers/specs/2026-05-28-hygiene-design.md) on main.


<!-- workplan-archive-ledger
archived-phases: 0-15
archived-fix-tasks: 0.1, 1.1, 2.1, 3.1, 4.1, 5.1, 6.1-6.5, 7.1, 8.1, 9.1, 10.1-10.5, 11.1-11.6, 12.1-12.2, 13.1, 14.1-14.2, 15.1
archive-file: workplan-archive.md
next-fix-task-id: 15.2
-->

## Phase 16: close-shipped apply — pre-flight `pending-verification` label  ·  [#411](https://github.com/audiocontrol-org/deskwork/issues/411)

The Phase 15 redesign's `apply` step posts a `pending-verification` comment + adds the label via two separate `gh` calls. When the label doesn't exist in the target repo, the label-add fails AFTER the comment has already posted. Result is the half-applied state #411 documents: 10 comments posted, 0 labels added, 0 dedupe-gate engagement on re-run. Surfaced during the 2026-06-04 dogfood run against v0.35.0..v0.36.0 in `feature/scope-discovery`.


### Task 2 (fix-finding-AUDIT-20260604-01): AUDIT-20260604-01 — All-skip apply still creates the `pending-verification` labe…

Closes AUDIT-20260604-01 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model). Surface: plugins/dw-lifecycle/src/close-shipped/apply-v2.ts:185-203 (the `applyV2` body) + test `close-shipped-apply-v2.test.ts:` "pre-flight: label absent → label create runs". Severity: medium.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260604-01 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/close-shipped-apply-v2.test.ts:179-196` ("pre-flight: skips label list + create when every item is effective-skip (AUDIT-20260604-01)")
- [x] `npx vitest run src/__tests__/close-shipped-apply-v2.test.ts` exits 0 (10/10 pass against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step (auto-flip on next end-of-task chain via `apply-audit-flips --apply`)


### Task 3 (fix-finding-AUDIT-20260604-02): AUDIT-20260604-02 — smoke-hygiene per-run timestamp hardcodes `-000Z` and diverg…

Closes AUDIT-20260604-02. Surface: scripts/smoke-hygiene.sh:415-420 (`CS_RUN_TS="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)"`). Severity: low.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260604-02` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 1: Pre-flight + auto-create the label in `apply-v2.ts`

**Approach:** Option 1 from the issue body (operator-recommended) — pre-flight via `gh label list`; auto-create if absent. Surface a one-line "created pending-verification label" message on first run; silent on subsequent runs.

- [x] Step 1: Add a `preflightLabel(runGh, repo, label, label_color, label_description)` helper in `apply-v2.ts`. Calls `gh label list --repo <repo> --search <label> --json name`. If the result contains the label, return `'exists'`. If empty, call `gh label create <label> --repo <repo> --color <color> --description <description>` and return `'created'`. On either call's failure, throw an `InvalidProposalError` with the actionable error.
- [x] Step 2: Call `preflightLabel` from `applyV2` BEFORE the per-item loop. `created` returns push a one-line note to the new `notes` field on `ApplyV2Result`; the CLI wrapper surfaces it to stdout before the summary line. Defaults: color `fbca04`, description `"Fix shipped in a release; awaiting operator verification before close"`.
- [x] Step 3: Vitest cases — extended close-shipped-apply-v2.test.ts from 5 → 9 cases. New cases: (a) label exists → single list call; (b) absent → list + create + `created` note; (c) `gh label create` throws → `InvalidProposalError` with actionable message; (d) pre-flight failure aborts BEFORE any comment posts.
- [x] Step 4: Updated `SKILL.md` Phase B with a new Step 3 documenting the pre-flight behavior; renumbered subsequent steps.

**Acceptance Criteria:**

- [x] `dw-lifecycle close-shipped apply --proposal <path>` against a repo without the label auto-creates the label, surfaces the one-line note, then proceeds with the normal per-item dispatch loop. (Mechanically verified via test case b; live verification deferred to operator-run post-ship walk.)
- [x] `apply` against a repo with the label is silent about labels (no spurious "exists" message every run). (Test case a: `notes` array empty; CLI wrapper only writes notes when populated.)
- [x] If `gh label create` itself fails (permissions / rate limit / etc.), `apply` aborts with an actionable error BEFORE any comment posts — no half-applied state. (Test cases c + d.)
- [x] Vitest covers all four cases above; full plugin suite green. (9 cases in close-shipped-apply-v2.test.ts; 2700/2700 plugin tests pass.)
- [ ] Live verification against a repo without the label (operator-driven, post-ship walk per the project's verify-in-installed-release rule).

**Provenance:**

- Surfaced 2026-06-04 in [#411](https://github.com/audiocontrol-org/deskwork/issues/411) during dogfood of `/dw-lifecycle:close-shipped` against v0.35.0..v0.36.0 in `feature/scope-discovery`. Manual recovery: created the label + bulk-applied to 10 issues out-of-band.
- Issue body lists two fix options: (1) pre-flight + auto-create (recommended; this Phase scopes that path); (2) refuse with actionable error before any comment posts. Operator can redirect to option (2) at implement time if they prefer the safer-but-noisier path; both options satisfy the "no half-applied state" requirement.

## Phase 17: close-shipped SKILL.md — replace bare `/tmp/<name>` paths  ·  [#412](https://github.com/audiocontrol-org/deskwork/issues/412)

The Phase 15 SKILL.md prescribes `/tmp/close-shipped-bundles.json`, `/tmp/close-shipped-verdicts.json`, and `/tmp/close-shipped-verdicts/<N>.json` as the agent-dispatch hand-off paths. These violate `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths" — race-prone across concurrent worktrees / sessions / sub-agents. The safety classifier flagged a sub-agent during the 2026-06-04 dogfood for following the SKILL.md verbatim.

### Task 1: Switch to project-local `.dw-lifecycle/close-shipped/runs/<timestamp>/`

**Approach:** Option 2 from the issue body (operator-recommended) — project-local cache dir keyed by run timestamp. Consistent with the proposal output's existing `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` scheme; worktree-isolated; auditable post-hoc.

- [x] Step 1: Updated `SKILL.md` Phase A Steps 1, 2, 6, 7 to use `.dw-lifecycle/close-shipped/runs/<timestamp>/{bundles,verdicts}.json`. Step 1 now opens by computing the per-run timestamp once and threading it through every artifact path.
- [x] Step 2: Added a "Why a per-run project-local dir, not `/tmp/`" paragraph in Step 1 citing `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths" + the concurrency hazards.
- [x] Step 3: Re-scoped during implementation — the SKILL.md's Step 4 prompt template returns JSON via tool response (no Write instruction in template prose); the orchestrator parses responses and writes the collected verdicts file. Step 6 now explicitly documents that the sub-agents don't write to disk, the orchestrator does the collection in-session.
- [x] Step 4: `.gitignore` already covers `.dw-lifecycle/close-shipped/` (line 145) which matches `.dw-lifecycle/close-shipped/runs/<timestamp>/` via prefix. No additional entry needed.
- [x] Step 5: Updated `scripts/smoke-hygiene.sh` to mirror the SKILL.md path scheme — added `CS_RUN_TS` + `CS_RUN_DIR` setup with `mkdir -p`, then `CS_BUNDLES`/`CS_VERDICTS` point inside that dir.

**Acceptance Criteria:**

- [x] `SKILL.md` Phase A prose names no bare `/tmp/<name>` paths. All scratch artifacts land under `.dw-lifecycle/close-shipped/runs/<timestamp>/`. (Verified via `grep -n "/tmp/close-shipped" SKILL.md` — no matches post-edit.)
- [x] The sub-agent prompt template's `Write` instruction names the per-run path explicitly (no `/tmp/`). (Resolved by re-scoping: the template returns JSON via tool response; no Write instruction exists. Step 6 documents the orchestrator collection model.)
- [x] `.gitignore` excludes `.dw-lifecycle/close-shipped/runs/` (via the broader `.dw-lifecycle/close-shipped/` rule at line 145).
- [x] Smoke-hygiene still passes (the path scheme works in the fixture's `$FIXTURE/.dw-lifecycle/close-shipped/` shadow root). (15/15 sections OK on the post-edit smoke run.)
- [ ] Live verification: a `/dw-lifecycle:close-shipped` dispatch against an installed release does NOT trigger the safety classifier's "shared-namespace path" warning. (Operator-driven, post-ship walk per the project's verify-in-installed-release rule.)

**Provenance:**

- Surfaced 2026-06-04 in [#412](https://github.com/audiocontrol-org/deskwork/issues/412) during dogfood of `/dw-lifecycle:close-shipped` against v0.35.0..v0.36.0. Safety classifier emitted "SECURITY WARNING: writes to bare /tmp/close-shipped-verdicts/406.json" on the #406 sub-agent dispatch (and possibly others; the classifier may sample).
- Issue body lists two fix options: (1) `mktemp` paths (cheaper fix, doesn't change disk layout); (2) project-local cache dir under `.dw-lifecycle/close-shipped/runs/<timestamp>/` (recommended; consistent with existing proposal dir; auditable). This Phase scopes option (2); the operator can redirect at implement time if they prefer (1).
