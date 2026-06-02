---
slug: decompose-agent-discipline
targetVersion: "1.0"
date: 2026-05-30
---

# Decompose `agent-discipline.md` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `.claude/rules/agent-discipline.md` from 566 lines to ~150–200 lines by decomposing each rule entry to its most effective home (composed into an existing skill body, a gate/hook, a doctor rule, a tooling fix, or — for irreducible always-on defaults — a shrunk pointer that stays in the file).

**Architecture:** Two phases. Phase 1 develops the per-rule **disposition plan** itself via the deskwork review tooling — operator iterates the PRD's disposition table via margin notes; agent runs `/deskwork:iterate` to address comments; cycle until applied. Phase 2 executes the stabilized disposition plan as per-rule commits, each landing the new home AND shrinking/removing the corresponding entry in `agent-discipline.md` in the same commit.

**Tech Stack:** Markdown rules + skill bodies (markdown), TypeScript for any gate/hook scripts (`tsx`), doctor rules under `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/`, optional bin-shim TypeScript edits for tooling fixes.

---

## Phase 1 — Develop the disposition plan via deskwork review  ·  [#389](https://github.com/audiocontrol-org/deskwork/issues/389)

Phase 1 is **not** a TDD-shaped implementation task — it's a design/capture phase that runs through the deskwork review tooling. The deliverable is a PRD whose disposition table is stable enough that Phase 2 tasks can be enumerated against it via `/dw-lifecycle:extend`.

### Task 1: Author the initial PRD disposition table

**Files:**
- Modify: `docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md` (the seeded PRD from `/dw-lifecycle:setup`)

The PRD seeded from the feature-definition already contains the Problem, Scope, Approach. This task adds the 21-row disposition table and the open-questions list to the PRD body.

- [x] **Step 1: Read the seeded PRD** to confirm what `/dw-lifecycle:setup` produced.

- [x] **Step 2: Enumerate all 21 entries from `agent-discipline.md`** by file position.

Run: `grep -n '^## ' .claude/rules/agent-discipline.md`

Expected: 20 top-level headings (entry 18 "Project workflow conventions" is a cluster of 5 sub-rules under one `## `).

- [x] **Step 3: Add the disposition table to the PRD body.** (Landed in the scaffold commit + iterated to rev 2.)

Use Edit tool to insert a `## Disposition table` section into `prd.md` after the Approach section. The table columns are: `# | Line | Rule | Type | Action | Destination | Residue`. Source the initial 21 rows from the brainstorming transcript (the triage table the operator already saw); leave the action for rule 2 as `DELETE`, rule 12 as `DEFER`, and the upstream-scope entries (9, 10, 11, 13, 17) flagged for PRD review.

- [x] **Step 4: Add the "Open questions for PRD review" section.** (Now resolved → "Resolved questions (revision 2)" in the PRD.)

The four open questions from the feature-definition:
1. Upstream-scope split for entries 9, 10, 11, 13, 17 — this feature or sibling feature?
2. Should the `STAYS` cluster move to a sibling `project-conventions.md` so the agent-discipline.md rump is purely irreducible defaults?
3. Entry 18 cluster — triage as cluster or per-sub-rule?
4. Marketplace-clone-script-contract sub-rule (lives inside entry 19's section) — disposition target?

- [x] **Step 5: Commit** the PRD body with the disposition table. (Scaffold commit `a06c173`.)

### Task 2: Ingest the PRD into deskwork and start review

**Files:** PRD frontmatter is mutated by `/deskwork:ingest` (adds `deskwork.id` UUID).

- [x] **Step 1: Verified** the PRD carried a `deskwork.id` in frontmatter (stamped by setup) but had **no calendar row** — setup left it half-ingested.

- [x] **Step 2: Invoked `/deskwork:ingest`** on the PRD path. Dry-run → `--apply`; the existing UUID `38410ae2…` was honored (no duplicate), entry landed in **Drafting**. Committed `f110ae1`.

- [x] **Step 3: ~~Invoke `/deskwork:review-start`~~ — RETIRED VERB.** The `review-*` family was retired with the entry-centric pipeline redesign (state-machine Commandment III). There is no review-start step: an ingested entry's review surface renders continuously in the studio. Review = leave margin notes → `/deskwork:iterate`. Boot the studio (`deskwork-studio`, Tailscale-aware) and hand the operator `/dev/editorial-review/<uuid>`.

- [x] **Step 4: Reported the studio review URL** (`/dev/editorial-review/38410ae2-…`, magic-DNS).

- [x] **Step 5: Committed** the ingest artifacts (`f110ae1`).

### Task 3: Iterate margin notes until the disposition table is stable

This task loops; no fixed step count.

- [x] **Step 1: Operator left 8 margin notes** in the studio review surface and invoked `/deskwork:iterate`.

- [x] **Step 2: Invoked `/deskwork:iterate`** to read margin notes and address them.

- [x] **Step 3: Addressed all 8 notes** — confirmed deletes (rows 2, 18a), resolved upstream-scope to in-scope (rows 9/10/11/13/17), made the "least dumb thing" calls on the remaining open questions, captured the review/audit-retirement scope item. Dispositions recorded (all `addressed`).

- [x] **Step 4: Snapshotted revision 2** (iterationByStage Drafting: 1).

- [x] **Step 5: Committed** the revision.

- [x] **Step 6: Operator approved** (`/deskwork:approve`) — entry advanced Drafting → Final. The disposition table is stable. (Stable signal is **Final**, not the retired `applied` state.)

### Task 4: Extend the workplan with Phase 2 task breakdown

Once the PRD's disposition table is `applied`, the per-rule task breakdown can be enumerated.

- [x] **Step 1: Verify the PRD's deskwork stage is `Final`.** (Entry-centric model has no `applied` state — the "stable, ready for Phase 2" signal is reaching **Final**, which locks content.) Verified: `currentStage: Final` in `.deskwork/entries/38410ae2-….json`.

- [x] **Step 2: Populate Phase 2 sub-phases (2a–2e)** with per-rule tasks derived from the approved disposition table. Done via the `superpowers:writing-plans` discipline (the core of `/dw-lifecycle:extend` step 2) — workplan-only population, no PRD re-iteration needed since the disposition table is approved/Final and unchanged. Also fixed the `/deskwork:review-start` and sibling-feature drift.

- [x] **Step 3: Commit** the extended workplan.

```bash
git add docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/workplan.md
git commit -m "docs(decompose-agent-discipline): extend workplan with Phase 2 disposition tasks"
```


### Task 6 (fix-finding-AUDIT-20260602-01): AUDIT-20260602-01 — `--no-tailscale` deprecation silently ignores loopback-only …

Closes AUDIT-20260602-01. Surface: packages/studio/src/server.ts:128-152. Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260602-01` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7 (fix-finding-AUDIT-20260602-02): AUDIT-20260602-02 — `DESKWORK_RESERVED_TOPLEVEL_KEYS` is a maintenance trap — gu…

Closes AUDIT-20260602-02. Surface: packages/core/src/frontmatter.ts:74 + packages/core/test/frontmatter.test.ts:343-347. Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260602-02` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 8 (fix-finding-AUDIT-20260602-03): AUDIT-20260602-03 — `stringifyFrontmatter` now throws unconditionally — legacy r…

Closes AUDIT-20260602-03. Surface: packages/core/src/frontmatter.ts:138 (stringifyFrontmatter), packages/core/src/frontmatter.ts:158 (updateFrontmatter). Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260602-03` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 9 (fix-finding-AUDIT-20260602-04): AUDIT-20260602-04 — Env-var truthiness parsing is case/format-narrow with no fee…

Closes AUDIT-20260602-04. Surface: packages/studio/src/server.ts:153-154. Severity: low.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260602-04` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 10 (fix-finding-AUDIT-20260602-05): AUDIT-20260602-05 — Composed-discipline pointers under-name their second home; v…

Closes AUDIT-20260602-05. Surface: .claude/rules/agent-discipline.md (entry 10 pointer) + repo-wide `--no-tailscale` references. Severity: low.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260602-05` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5: File GitHub issues for Phase 2

- [x] **Step 1: Invoked `/dw-lifecycle:issues`.** Filed parent **[#388](https://github.com/audiocontrol-org/deskwork/issues/388)**, Phase 1 **[#389](https://github.com/audiocontrol-org/deskwork/issues/389)**, Phase 2 **[#390](https://github.com/audiocontrol-org/deskwork/issues/390)**. The helper works at `## Phase N` granularity (not per-sub-phase); the 2a–2e sub-phase breakdown lives in this workplan under #390. (Phase 1 is already complete — evidence posted on #389, closure left to the operator.)

- [x] **Step 2: Verified** back-fill — the two `## Phase N` headings carry their `[#NNN]` links; parentIssue `#388` filled into README + prd frontmatter. Per-task links are not added by the helper (phase-level linking is the tool's design); individual Phase 2 tasks reference #390.

---

## Phase 2 — Per-disposition implementation cycles  ·  [#390](https://github.com/audiocontrol-org/deskwork/issues/390)

> **This breakdown was populated from the operator-approved disposition table** (PRD revision 2, Final). Each task is one disposition; commit at every task boundary, landing the new home AND the `agent-discipline.md` edit in the same commit. Doc-composition tasks verify structurally (content-in-home + entry-shrunk/deleted + commit-msg-names-both); the two tool-level tasks (2b) are TDD-shaped (failing test → tool change → green → shrink entry).
>
> **Shared closing convention for every task below:** the same commit that establishes the new home edits `.claude/rules/agent-discipline.md` — deleting the entry, or replacing it with a 1-line pointer of the form `> See [<destination>] for <topic>.` (a markdown blockquote pointer, not a `## ` heading, so it doesn't read as a full rule). The commit subject names the entry number + destination.
>
> **Pre-feature line anchors** (from the 566-line agent-discipline.md at feature start) are recorded per task so the implementer can locate each entry even after earlier tasks shift line numbers — match by `## ` heading text, not by line number.

### Phase 2a — Pure deletes and DONE pointer-shrinks

**Disposition class:** entries superseded by existing mechanization (delete outright), or entries that document a skill/CLI which already owns the canonical text (shrink to a pointer).

#### Task 2a.1 — Entry 2: delete "Use /dw-lifecycle:review after every implementation step"

**Files:** Modify `.claude/rules/agent-discipline.md` (entry `## Use /dw-lifecycle:review after every implementation step`).

- [ ] **Step 1: Confirm the rule is dead.** Per PRD row 2 + [#387](https://github.com/audiocontrol-org/deskwork/issues/387): review is not hooked into the iterate cycle and not operationally enforced (superseded by the audit-barrage hook).
- [ ] **Step 2: Delete the entire `## Use /dw-lifecycle:review after every implementation step` section** (heading + body). No replacement, no pointer — the rule has no surviving home in this feature (skill retirement itself is #387).
- [ ] **Step 3: Grep for dangling references.** Run: `grep -rn "Use /dw-lifecycle:review after every" .claude/`. Expected: zero hits after the delete.
- [ ] **Step 4: Commit.** `git commit -m "refactor(agent-discipline): delete dead entry 2 (review-after-every-step); superseded by audit-barrage hook — see #387"`

#### Task 2a.2 — Entry 18a: delete "Stay on feature/deskwork-plugin"

**Files:** Modify `.claude/rules/agent-discipline.md` (the `### Stay on feature/deskwork-plugin for ongoing work` sub-rule inside `## Project workflow conventions`).

- [ ] **Step 1: Delete the `### Stay on feature/deskwork-plugin for ongoing work` sub-section** (heading + body). Stale: this feature's branch is `feature/decompose-agent-discipline`.
- [ ] **Step 2: Confirm the parent `## Project workflow conventions` heading still has its other sub-rules** (18b–e) — only 18a is removed here.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): delete stale entry 18a (stay-on-feature/deskwork-plugin)"`

#### Task 2a.3 — Entry 3: shrink to pointer (promote-findings + doctor rules already own it)

**Files:** Modify `.claude/rules/agent-discipline.md` (entry `## Audit findings: scope-don't-defer + TDD enforcement`).

- [ ] **Step 1: Verify the canonical home exists.** Run: `ls plugins/dw-lifecycle/skills/promote-findings/SKILL.md plugins/dw-lifecycle/src/scope-discovery/doctor-rules/fix-task-tdd-discipline.ts`. Both must exist.
- [ ] **Step 2: Replace the entry body** with a pointer: `> The scope-into-workplan + TDD-first-fix discipline is mechanized — see /dw-lifecycle:promote-findings, the check-fix-task-tdd commit-msg gate, and the fix-task-tdd-discipline doctor rule.` Keep the operator's verbatim "Filing a bug report isn't good enough…" framing (≤3 lines) as the irreducible anchor; drop the full table + cross-reference list (the skill bodies own them).
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): shrink entry 3 to pointer — promote-findings + tdd-discipline doctor rule own canonical text"`

#### Task 2a.4 — Entry 4: shrink to pointer (audit-barrage SKILL owns it)

**Files:** Modify `.claude/rules/agent-discipline.md` (entry `## Audit-barrage: structured cross-model audit`).

- [ ] **Step 1: Verify** `plugins/dw-lifecycle/skills/audit-barrage/SKILL.md` exists.
- [ ] **Step 2: Replace the entry body** with a pointer to `/dw-lifecycle:audit-barrage` SKILL.md, keeping only the ≤3-line "third independent audit surface — additive, not substitutable" framing that the agent needs always-on; drop the verb-pair invocation contract, override paths, and self-dogfood narrative (the SKILL owns them).
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): shrink entry 4 to pointer — audit-barrage SKILL owns canonical text"`

#### Task 2a.5 — Entry 20: shrink to pointer (hygiene-family SKILLs own it)

**Files:** Modify `.claude/rules/agent-discipline.md` (entry `## Closure is a structural step, not aspirational`).

- [ ] **Step 1: Verify** the hygiene-family skills exist: `ls plugins/dw-lifecycle/skills/close-shipped/SKILL.md plugins/dw-lifecycle/skills/complete/SKILL.md`.
- [ ] **Step 2: Replace the entry body** with a pointer to the hygiene family (`/dw-lifecycle:close-shipped`, `:complete`, `:debt-report`, `:worktree-report`, `:dismantle-worktrees`), keeping only the ≤4-line "agent posts evidence, operator decides" contract that governs always-on behavior; drop the per-verb waypoint table (the SKILLs own it).
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): shrink entry 20 to pointer — hygiene-family SKILLs own canonical text"`

### Phase 2b — Tooling fixes (TDD-shaped)

**Disposition class:** entries whose pathological behavior is closed at the tool level. Each ships a test exercising the new path (per the TDD-enforcement discipline) before the rule entry is touched.

#### Task 2b.1 — Entry 15: make `--no-tailscale` a no-op alias with a stderr warning

Per PRD row 15 + the marketplace-clone-script adopter-contract: the flag stays **parseable** (no hard removal — adopters scripted against it), but its dangerous default-suppressing behavior is neutralized. The studio already auto-detects Tailscale; `--no-tailscale` becomes a no-op that prints a one-line stderr notice so a human sees it was ineffective.

**Files:**
- Modify: `packages/studio/src/server.ts` (the `--no-tailscale` arg handling)
- Test: `packages/studio/test/cli-args.test.ts` (existing test file)
- Modify: `.claude/rules/agent-discipline.md` (entry `## Never pass --no-tailscale to deskwork-studio unprompted`)

- [ ] **Step 1: Write the failing test** in `packages/studio/test/cli-args.test.ts`: assert that parsing `['--no-tailscale']` still succeeds (flag is accepted), that the resulting config does NOT disable Tailscale binding (no-op), and that a deprecation notice is emitted. Match the existing test's arg-parser entry point + assertion style in that file.
- [ ] **Step 2: Run it, verify it fails.** Run: `npm --workspace @deskwork/studio test -- cli-args`. Expected: FAIL (current behavior disables Tailscale).
- [ ] **Step 3: Implement** the no-op-alias + stderr notice in `packages/studio/src/server.ts`. Keep the flag in the parser (no usage error); stop letting it suppress Tailscale auto-detection; emit `console.error('--no-tailscale is deprecated and now a no-op; the studio auto-detects Tailscale. Use --host to control binding.')`.
- [ ] **Step 4: Run the test, verify it passes.** Run: `npm --workspace @deskwork/studio test -- cli-args`. Expected: PASS. Also run the full studio suite to catch regressions: `npm --workspace @deskwork/studio test`.
- [ ] **Step 5: Delete the agent-discipline.md entry** `## Never pass --no-tailscale to deskwork-studio unprompted` — the bait (a flag that strands the operator) is gone at the source, so the rule has nothing left to guard. (If review surfaces residual judgment, leave a ≤2-line pointer instead.)
- [ ] **Step 6: Commit.** `git commit -m "fix(studio): make --no-tailscale a no-op alias + deprecation notice; delete agent-discipline entry 15"`

#### Task 2b.2 — Entry 17: gate top-level deskwork-metadata writes + doctor rule

Per PRD row 17: schema-write helpers refuse top-level (non-namespaced) deskwork-field writes (fail loud, no fallback), and a doctor rule scans existing sidecars/frontmatter for legacy top-level fields.

**Files:**
- Modify: `packages/core/src/sidecar/write.ts` and/or `packages/core/src/frontmatter.ts` (the write path)
- Create: `packages/core/src/doctor/rules/namespaced-deskwork-metadata.ts` (new doctor rule, mirroring an existing rule in `packages/core/src/doctor/rules/`)
- Test: `packages/core/test/` (new test file for both the write-refusal and the doctor rule)
- Modify: `.claude/rules/agent-discipline.md` (entry `## Namespace deskwork-owned metadata in user-supplied documents`)

- [ ] **Step 1: Write the failing test** asserting (a) the frontmatter/sidecar write helper throws a descriptive error when handed a top-level deskwork-owned field (e.g. top-level `id:` instead of `deskwork.id`), and (b) the new doctor rule flags a fixture file carrying a legacy top-level field.
- [ ] **Step 2: Run it, verify it fails.** Run: `npm --workspace @deskwork/core test -- namespaced-deskwork`. Expected: FAIL.
- [ ] **Step 3: Implement** the write-side refusal (throw, per the no-fallback rule) + the doctor rule (read-side scan). Register the doctor rule where the others are registered.
- [ ] **Step 4: Run the test, verify it passes.** Run: `npm --workspace @deskwork/core test -- namespaced-deskwork`, then `npm --workspace @deskwork/core test`.
- [ ] **Step 5: Shrink the agent-discipline.md entry** to a ≤3-line pointer: `> deskwork metadata is namespaced under deskwork.* — the schema-write helpers refuse top-level writes and the namespaced-deskwork-metadata doctor rule scans for legacy ones.` (Shrink, not delete: the read-side "look only at data.deskwork?.<field>" convention is still agent-facing guidance.)
- [ ] **Step 6: Commit.** `git commit -m "feat(core): gate top-level deskwork-metadata writes + doctor rule; shrink agent-discipline entry 17"`

### Phase 2c — Composes into in-repo dw-lifecycle skills

**Disposition class:** entries whose content composes into a skill body already inside `plugins/dw-lifecycle/skills/<name>/SKILL.md`. Pure in-repo edits. Each task: compose the discipline into the named skill at the right step, then shrink the agent-discipline.md entry to a pointer in the same commit.

#### Task 2c.1 — Entry 1: /frontend-design discipline → /dw-lifecycle:implement + :setup

**Files:** Modify `plugins/dw-lifecycle/skills/implement/SKILL.md` (add a design-task precondition step), `plugins/dw-lifecycle/skills/setup/SKILL.md` (design-shaped-work check); modify `.claude/rules/agent-discipline.md` (entry `## Use /frontend-design for all design tasks`).

- [ ] **Step 1: Compose** into `implement/SKILL.md` a precondition step: before picking up a task that involves a design decision (new UI surface, affordance placement, visual language), the implementer runs `/frontend-design` first to produce mockups. Mirror the rule's "skip only when fully determined upstream" carve-out.
- [ ] **Step 2: Add** to `setup/SKILL.md` a note that design-shaped features route through `/frontend-design` before implementation.
- [ ] **Step 3: Shrink** the agent-discipline.md entry to a ≤3-line pointer naming the two skill steps + the "/frontend-design first for design tasks" rule.
- [ ] **Step 4: Commit.** `git commit -m "refactor(agent-discipline): compose entry 1 (frontend-design) into implement+setup skills"`

#### Task 2c.2 — Entry 5: tooling-feedback discipline → scope-inventory + setup

**Files:** Modify `plugins/dw-lifecycle/skills/scope-inventory/SKILL.md` (file-friction-as-you-go discipline), confirm `plugins/dw-lifecycle/skills/setup/SKILL.md` seeds the `tooling-feedback.md` template; modify `.claude/rules/agent-discipline.md` (entry `## scope-discovery v1 — dogfood feedback via tooling-feedback.md`).

- [ ] **Step 1: Compose** the "file a TF entry the moment friction surfaces; one observable friction per entry with Repro/Workaround/Suggested-fix" discipline into `scope-inventory/SKILL.md`.
- [ ] **Step 2: Verify** `setup/SKILL.md` already copies the `tooling-feedback.md` starter template (`grep -n tooling-feedback plugins/dw-lifecycle/skills/setup/SKILL.md`); add the step if missing.
- [ ] **Step 3: Shrink** the agent-discipline.md entry to a pointer.
- [ ] **Step 4: Commit.** `git commit -m "refactor(agent-discipline): compose entry 5 (tooling-feedback) into scope-inventory+setup skills"`

#### Task 2c.3 — Entry 6: inventory-vs-discovery reading discipline → scope-inventory

**Files:** Modify `plugins/dw-lifecycle/skills/scope-inventory/SKILL.md` (output-interpretation section); modify `.claude/rules/agent-discipline.md` (entry `## Inventory vs discovery — how to read scope-discovery reports`).

- [ ] **Step 1: Compose** the three-category report-reading discipline (registered-pattern / discovered-candidate / novel-shape-candidate, and the "green ≠ no novel anti-patterns" hard test) into `scope-inventory/SKILL.md`'s output section.
- [ ] **Step 2: Shrink** the agent-discipline.md entry to a pointer that keeps the single hard test ("read the stderr categories line + synthesis.md before saying 'no findings'") and points to the skill for the full taxonomy.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 6 (inventory-vs-discovery) into scope-inventory skill"`

#### Task 2c.4 — Entry 11: orchestrator≠implementation → :setup/:issues exit-step + :implement gate

**Files:** Modify `plugins/dw-lifecycle/skills/setup/SKILL.md` + `plugins/dw-lifecycle/skills/issues/SKILL.md` (exit-step: "infrastructure ready; implementation happens in a separate session at <worktree>"), `plugins/dw-lifecycle/skills/implement/SKILL.md` (precondition note that implement runs in the feature worktree session, not the orchestrator session); modify `.claude/rules/agent-discipline.md` (entry `## The orchestrator session is separate from the implementation session`).

- [ ] **Step 1: Compose** the session-boundary handoff into the `setup` + `issues` skills' closing report and the `implement` skill's opening precondition.
- [ ] **Step 2: Shrink** the agent-discipline.md entry to a ≤4-line pointer keeping the operator's verbatim "you are the orchestrator, not the implementer" anchor.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 11 (orchestrator-vs-implementation) into setup/issues/implement skills"`

#### Task 2c.5 — Entry 8 (dispatch-report half): sub-agent flags → :implement

**Files:** Modify `plugins/dw-lifecycle/skills/implement/SKILL.md` (sub-agent-report handling: every "flag for triage" adjacent-issue note becomes a fix-now or a filed issue); modify `.claude/rules/agent-discipline.md` (entry `## Operator owns scope decisions` — the sub-agent-dispatch-report portion only).

- [x] **Step 1: Composed** the "sub-agent dispatch reports are action lists, not disclosures" discipline into `implement/SKILL.md`'s review-the-dispatch-report step.
- [x] **Step 2: Shrank** the agent-discipline.md entry's failure-mode-2 (sub-agent notes) prose, leaving failure-mode-1 (operator-hedge-default-to-ASK) intact — that half is handled by Task 2e.2.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 8 dispatch-report half into implement skill"`

#### Task 2c.6 — Entry 13: packaging-is-UX → :complete / close-shipped install-evaluation

**Files:** Modify `plugins/dw-lifecycle/skills/complete/SKILL.md` and/or `plugins/dw-lifecycle/skills/close-shipped/SKILL.md` (install-evaluation handling: treat install state as ground truth, don't paper over packaging defects); modify `.claude/rules/agent-discipline.md` (entry `## Packaging is UX — never paper over install bugs`).

- [ ] **Step 1: Compose** the "packaging IS UX — catalog install-level defects as top-priority blockers; fix the public path, don't reconstruct the intended surface locally" discipline into the close-shipped/complete install-verification step.
- [ ] **Step 2: Shrink** the agent-discipline.md entry to a pointer keeping the operator's "Packaging IS UX" anchor.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 13 (packaging-is-UX) into complete/close-shipped skills"`

#### Task 2c.7 — Entry 19: issue-closure-verification → close-shipped + :complete

**Files:** Modify `plugins/dw-lifecycle/skills/close-shipped/SKILL.md` + `plugins/dw-lifecycle/skills/complete/SKILL.md`; modify `.claude/rules/agent-discipline.md` (entry `## Issue closure requires verification in a formally-installed release`, EXCLUDING sub-rule 19b — that's Task 2e.9).

- [ ] **Step 1: Verify** `close-shipped/SKILL.md` already encodes the "label pending-verification, don't close; operator verifies against the released artifact" contract (`grep -n pending-verification plugins/dw-lifecycle/skills/close-shipped/SKILL.md`); strengthen if partial.
- [ ] **Step 2: Shrink** the agent-discipline.md entry to a ≤4-line pointer keeping the load-bearing rule ("no issue closes until verified in a formally-installed release; agent posts evidence, operator/author decides") and pointing to close-shipped + complete for the mechanism. Leave sub-rule 19b in place for Task 2e.9.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 19 (issue-closure-verification) into close-shipped/complete skills"`

### Phase 2d — Composes into deskwork plugin skills

**Disposition class:** entries composing into `deskwork`-plugin skill bodies. **In-scope per PRD Resolved Question #1** ("all deskwork-family plugins are in scope") — no sibling feature, no `[debt: #NNN]` deferral route.

#### Task 2d.1 — Entry 9: capture-vs-scope → /dw-lifecycle:define + /deskwork:iterate

**Files:** Modify `plugins/dw-lifecycle/skills/define/SKILL.md` (capture-mode discipline during interview) + `plugins/deskwork/skills/iterate/SKILL.md` (capture-mode during spec iteration); modify `.claude/rules/agent-discipline.md` (entry `## Capture mode vs scope mode...`).

- [ ] **Step 1: Compose** the "specs capture everything; scoping is a later explicit pass; no reflexive YAGNI/deferred/out-of-scope during capture" discipline into `define/SKILL.md` and `deskwork/skills/iterate/SKILL.md`.
- [ ] **Step 2: Shrink** the agent-discipline.md entry to a ≤5-line pointer keeping the operator's verbatim "I don't need you to push back on scope… capture everything we know… THEN scope" anchor.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 9 (capture-vs-scope) into define+iterate skills"`

#### Task 2d.2 — Entry 10: empty-revisions → /deskwork:iterate + /deskwork:approve

**Files:** Modify `plugins/deskwork/skills/iterate/SKILL.md` + `plugins/deskwork/skills/approve/SKILL.md` (run the capture even if it looks like a no-op); modify `.claude/rules/agent-discipline.md` (entry `## Empty revisions beat missed changes...`).

- [ ] **Step 1: Compose** the "run the operation as asked; don't pre-decide a no-op skip; empty revisions beat missed changes" discipline into the iterate + approve skill bodies.
- [ ] **Step 2: Shrink** the agent-discipline.md entry to a ≤3-line pointer keeping the operator's verbatim "I'd rather have empty revisions than miss changes" anchor.
- [ ] **Step 3: Commit.** `git commit -m "refactor(agent-discipline): compose entry 10 (empty-revisions) into iterate+approve skills"`

### Phase 2e — Shrunk-stays

**Disposition class:** irreducibly always-on disciplines that resist mechanization. Each is rewritten to 3–10 lines, preserving the "Why" + "How to apply" structure; elision is in the example/rationale prose. **No new `project-conventions.md` file** (PRD Resolved Question #2 — a second always-loaded rule file buys zero context-cost reduction); shrink in place.

Each task below: rewrite the named entry in `.claude/rules/agent-discipline.md` to its minimum useful form, then commit. Group-commit is acceptable within a sub-cluster (e.g. all of 18b–e in one commit) since these are in-place shrinks with no external home.

- [x] **Task 2e.1 — Entry 7** shrunk in place.
- [x] **Task 2e.2 — Entry 8 hedge-half** shrunk; dispatch half composed into implement (2c.5).
- [x] **Task 2e.3 — Entry 14** shrunk in place.
- [x] **Task 2e.4 — Entry 16** shrunk in place.
- [x] **Task 2e.5 — Entry 18b** shrunk in place.
- [x] **Task 2e.6 — Entry 18c** shrunk in place.
- [x] **Task 2e.7 — Entry 18d** shrunk in place.
- [x] **Task 2e.8 — Entry 18e** shrunk in place.
- [x] **Task 2e.9 — Sub-rule 19b** shrunk to ~2 lines in place (committed with 2c.6/2c.7).
- [x] **Group commit** landed (stays-cluster).

> **All of Phase 2 (2a–2e) landed.** Per-disposition outcomes + commit shape are recorded in `audit-log.md`. Phase 2a (deletes/pointer-shrinks), 2b (TDD tool-fixes — `--no-tailscale` no-op + namespace write-guard), 2c (in-repo skill composes), 2d (deskwork-plugin composes), 2e (stays-shrunk) all complete.

---

## Final verification

After Phase 2 completes, before `/dw-lifecycle:complete`:

- [x] **Step 1: Measured agent-discipline.md size** — **157 lines** (was 566; target 150–200). ✓
- [x] **Step 2: Verified every disposition action landed** — all 24 rows; 3 deletes (2, 15, 18a) confirmed absent; entry 12 byte-untouched. Per-entry residue table in `audit-log.md`. ✓
- [x] **Step 3: Open-findings gate** — `check-open-findings` reports zero open findings. ✓ (Also: core 535 / studio 589 / cli 211 tests green.)
- [x] **Step 4: Added `audit-log.md`** with per-disposition outcomes.
- [x] **Step 5: Commit final-verification artifacts.**

After this commit lands, the feature is ready for `/dw-lifecycle:review` → `/dw-lifecycle:ship` → `/dw-lifecycle:complete`.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Disposition table iteration in Phase 1 takes more cycles than expected (operator surfaces structural concerns not yet captured) | The Phase 1 → Phase 2 gate is `applied`, not a time-bounded target. Capturing fully before scoping is exactly the discipline agent-discipline.md entry 9 names. |
| Phase 2d (deskwork-plugin composes) requires authoring in a different plugin's source; risks scope creep | RESOLVED at PRD revision 2: operator confirmed "all deskwork-family plugins are in scope" — entries 9, 10 stay in-feature, no sibling feature. The risk is accepted; commits are per-rule so blast radius stays small. |
| Tooling fix for `--no-tailscale` (entry 15) breaks an adopter who scripted against the flag | Disposition target is no-op-alias with stderr warning, not hard removal. Per the "marketplace-clone script names + flags are an adopter contract" sub-rule, the flag stays parseable. |
| Entry 12 ("Just for now") is deferred but its discipline still applies to this feature's own commits | Pre-commit audit-barrage hook continues to fire; deferring rule 12 doesn't deactivate it. |
| The disposition table is the workplan's source of truth — if it drifts from agent-discipline.md after Phase 1 applied, Phase 2 tasks become wrong | Task 4 (extend the workplan) snapshots the applied disposition table into workplan task descriptions. Any post-applied disposition changes require a new PRD revision per the "extend re-iterates via deskwork" rule. |
