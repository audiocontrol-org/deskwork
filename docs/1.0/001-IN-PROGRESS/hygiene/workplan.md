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

### Task 1: Pre-flight + auto-create the label in `apply-v2.ts`

**Approach:** Option 1 from the issue body (operator-recommended) — pre-flight via `gh label list`; auto-create if absent. Surface a one-line "created pending-verification label" message on first run; silent on subsequent runs.

- [ ] Step 1: Add a `preflightLabel(runGh, repo, label, label_color, label_description)` helper in `apply-v2.ts`. Calls `gh label list --repo <repo> --search <label> --json name`. If the result contains the label, return `'exists'`. If empty, call `gh label create <label> --repo <repo> --color <color> --description <description>` and return `'created'`. On either call's failure, throw an `InvalidProposalError` with the actionable error ("label X does not exist and could not be created: <err>; create it manually with `gh label create ...` or pass `--label <existing>`").
- [ ] Step 2: Call `preflightLabel` from `applyV2` BEFORE the per-item loop. If `preflightLabel` returns `'created'`, push a one-line "created pending-verification label on <repo>" to a new `notes` field on the `ApplyV2Result` shape; the CLI wrapper surfaces it to stdout. Default color: `fbca04` (matches GH-default yellow used in the existing `pending-verification` label). Default description: `"Fix shipped in a release; awaiting operator verification before close"`.
- [ ] Step 3: Vitest cases: (a) label exists → `preflightLabel` returns `exists`, single `gh label list` call; (b) label absent → returns `created`, both `gh label list` + `gh label create` called; (c) `gh label create` throws → `InvalidProposalError` bubbles up with actionable message; (d) `applyV2` surfaces the `created` note in the result.
- [ ] Step 4: Update `SKILL.md` Phase B Step 1 prose to document the pre-flight behavior so adopters know auto-create is the default.

**Acceptance Criteria:**

- [ ] `dw-lifecycle close-shipped apply --proposal <path>` against a repo without the label auto-creates the label, surfaces the one-line note, then proceeds with the normal per-item dispatch loop.
- [ ] `apply` against a repo with the label is silent about labels (no spurious "exists" message every run).
- [ ] If `gh label create` itself fails (permissions / rate limit / etc.), `apply` aborts with an actionable error BEFORE any comment posts — no half-applied state.
- [ ] Vitest covers all four cases above; full plugin suite green.
- [ ] Live verification against a repo without the label (operator-driven, post-ship walk per the project's verify-in-installed-release rule).

**Provenance:**

- Surfaced 2026-06-04 in [#411](https://github.com/audiocontrol-org/deskwork/issues/411) during dogfood of `/dw-lifecycle:close-shipped` against v0.35.0..v0.36.0 in `feature/scope-discovery`. Manual recovery: created the label + bulk-applied to 10 issues out-of-band.
- Issue body lists two fix options: (1) pre-flight + auto-create (recommended; this Phase scopes that path); (2) refuse with actionable error before any comment posts. Operator can redirect to option (2) at implement time if they prefer the safer-but-noisier path; both options satisfy the "no half-applied state" requirement.

## Phase 17: close-shipped SKILL.md — replace bare `/tmp/<name>` paths  ·  [#412](https://github.com/audiocontrol-org/deskwork/issues/412)

The Phase 15 SKILL.md prescribes `/tmp/close-shipped-bundles.json`, `/tmp/close-shipped-verdicts.json`, and `/tmp/close-shipped-verdicts/<N>.json` as the agent-dispatch hand-off paths. These violate `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths" — race-prone across concurrent worktrees / sessions / sub-agents. The safety classifier flagged a sub-agent during the 2026-06-04 dogfood for following the SKILL.md verbatim.

### Task 1: Switch to project-local `.dw-lifecycle/close-shipped/runs/<timestamp>/`

**Approach:** Option 2 from the issue body (operator-recommended) — project-local cache dir keyed by run timestamp. Consistent with the proposal output's existing `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` scheme; worktree-isolated; auditable post-hoc.

- [ ] Step 1: Update `SKILL.md` Phase A Steps 2, 5, 6 to use `.dw-lifecycle/close-shipped/runs/<timestamp>/{bundles.json,verdicts.json,verdicts/<N>.json}`. The agent computes the timestamp ONCE per run (ISO-8601 with `:` and `.` replaced for filesystem safety, mirror of `proposals-<timestamp>.json`'s format) and threads it through all three writes.
- [ ] Step 2: Update the prose to explain WHY the path scheme matters (`.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths"; concurrency hazards across worktrees / sessions / sub-agents; auditability).
- [ ] Step 3: Update the sub-agent prompt template's `Write` instruction (currently embedded inline in SKILL.md Phase A Step 4) so dispatched agents write to the per-run dir instead of bare `/tmp/`. The orchestrator passes the resolved per-N path as a templated variable; the agent doesn't compute it.
- [ ] Step 4: Add `.dw-lifecycle/close-shipped/runs/` to `.gitignore` (the proposal output dir is already gitignored; the runs dir is the same per-worktree artifact shape).
- [ ] Step 5: Extend `scripts/smoke-hygiene.sh` to use the new path scheme (the current smoke uses `$FIXTURE/close-shipped-bundles.json` — fixture-local, not bare /tmp — so the smoke itself is fine, but it should mirror the SKILL.md's path convention so the smoke documents the canonical adopter path).

**Acceptance Criteria:**

- [ ] `SKILL.md` Phase A prose names no bare `/tmp/<name>` paths. All scratch artifacts land under `.dw-lifecycle/close-shipped/runs/<timestamp>/`.
- [ ] The sub-agent prompt template's `Write` instruction names the per-run path explicitly (no `/tmp/`).
- [ ] `.gitignore` excludes `.dw-lifecycle/close-shipped/runs/`.
- [ ] Smoke-hygiene still passes (the path scheme works in the fixture's `$FIXTURE/.dw-lifecycle/close-shipped/` shadow root).
- [ ] Live verification: a `/dw-lifecycle:close-shipped` dispatch against an installed release does NOT trigger the safety classifier's "shared-namespace path" warning.

**Provenance:**

- Surfaced 2026-06-04 in [#412](https://github.com/audiocontrol-org/deskwork/issues/412) during dogfood of `/dw-lifecycle:close-shipped` against v0.35.0..v0.36.0. Safety classifier emitted "SECURITY WARNING: writes to bare /tmp/close-shipped-verdicts/406.json" on the #406 sub-agent dispatch (and possibly others; the classifier may sample).
- Issue body lists two fix options: (1) `mktemp` paths (cheaper fix, doesn't change disk layout); (2) project-local cache dir under `.dw-lifecycle/close-shipped/runs/<timestamp>/` (recommended; consistent with existing proposal dir; auditable). This Phase scopes option (2); the operator can redirect at implement time if they prefer (1).
