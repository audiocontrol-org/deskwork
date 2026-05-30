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

## Phase 1 — Develop the disposition plan via deskwork review

Phase 1 is **not** a TDD-shaped implementation task — it's a design/capture phase that runs through the deskwork review tooling. The deliverable is a PRD whose disposition table is stable enough that Phase 2 tasks can be enumerated against it via `/dw-lifecycle:extend`.

### Task 1: Author the initial PRD disposition table

**Files:**
- Modify: `docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md` (the seeded PRD from `/dw-lifecycle:setup`)

The PRD seeded from the feature-definition already contains the Problem, Scope, Approach. This task adds the 21-row disposition table and the open-questions list to the PRD body.

- [ ] **Step 1: Read the seeded PRD** to confirm what `/dw-lifecycle:setup` produced.

Run: `cat docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md` (or use Read tool).

- [ ] **Step 2: Enumerate all 21 entries from `agent-discipline.md`** by file position.

Run: `grep -n '^## ' .claude/rules/agent-discipline.md`

Expected: 20 top-level headings (entry 18 "Project workflow conventions" is a cluster of 5 sub-rules under one `## `).

- [ ] **Step 3: Add the disposition table to the PRD body.**

Use Edit tool to insert a `## Disposition table` section into `prd.md` after the Approach section. The table columns are: `# | Line | Rule | Type | Action | Destination | Residue`. Source the initial 21 rows from the brainstorming transcript (the triage table the operator already saw); leave the action for rule 2 as `DELETE`, rule 12 as `DEFER`, and the upstream-scope entries (9, 10, 11, 13, 17) flagged for PRD review.

- [ ] **Step 4: Add the "Open questions for PRD review" section.**

The four open questions from the feature-definition:
1. Upstream-scope split for entries 9, 10, 11, 13, 17 — this feature or sibling feature?
2. Should the `STAYS` cluster move to a sibling `project-conventions.md` so the agent-discipline.md rump is purely irreducible defaults?
3. Entry 18 cluster — triage as cluster or per-sub-rule?
4. Marketplace-clone-script-contract sub-rule (lives inside entry 19's section) — disposition target?

- [ ] **Step 5: Commit** the PRD body with the disposition table.

```bash
git add docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md
git commit -m "docs(decompose-agent-discipline): author PRD disposition table + open questions"
```

### Task 2: Ingest the PRD into deskwork and start review

**Files:** PRD frontmatter is mutated by `/deskwork:ingest` (adds `deskwork.id` UUID).

- [ ] **Step 1: Verify the PRD has no `deskwork:` frontmatter yet.**

Run: `head -20 docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md`

If `/dw-lifecycle:setup` already wired ingest (some setup variants do), skip to Step 3.

- [ ] **Step 2: Invoke `/deskwork:ingest` on the PRD path.**

Per `.claude/CLAUDE.md`'s feature-lifecycle workflow, setup is supposed to register the PRD with deskwork; if it didn't, run `/deskwork:ingest docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md` manually.

- [ ] **Step 3: Invoke `/deskwork:review-start` on the PRD.**

Per workflow: this creates a review entry and returns the studio review URL.

- [ ] **Step 4: Report the studio review URL to the operator.**

The operator opens it, leaves margin notes on the disposition table + open-questions.

- [ ] **Step 5: Commit** any frontmatter changes deskwork made.

```bash
git add docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md
git commit -m "docs(decompose-agent-discipline): ingest PRD + start deskwork review"
```

### Task 3: Iterate margin notes until the disposition table is stable

This task loops; no fixed step count.

- [ ] **Step 1: Wait for operator to leave margin notes** in the studio review surface. Operator says "iterate" when ready.

- [ ] **Step 2: Invoke `/deskwork:iterate`** to read margin notes and address them.

Per the "Empty revisions beat missed changes" rule in `agent-discipline.md` (lines 256–274): run iterate when asked even if no disk delta is expected. Don't precondition on "but nothing's pending."

- [ ] **Step 3: For each margin note**, edit the disposition table or open-questions list to reflect the operator's input. Mark addressed comments via the iterate skill's mechanism (sidecar updates).

- [ ] **Step 4: Snapshot the new revision** (the iterate skill handles this).

- [ ] **Step 5: Commit** the revision.

```bash
git add docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/
git commit -m "docs(decompose-agent-discipline): iterate PRD revision N — <summary of changes>"
```

- [ ] **Step 6: Report new revision to operator;** wait for next margin notes OR for Approve. Loop to Step 1 until operator clicks Approve and the deskwork workflow state is `applied`.

### Task 4: Extend the workplan with Phase 2 task breakdown

Once the PRD's disposition table is `applied`, the per-rule task breakdown can be enumerated.

- [ ] **Step 1: Verify deskwork workflow state is `applied`.**

Run: `deskwork status docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md` (or the equivalent CLI verb the operator's deskwork install exposes).

Expected: state == `applied`.

- [ ] **Step 2: Invoke `/dw-lifecycle:extend decompose-agent-discipline`** to add Phase 2 sub-phases (2a through 2e per the feature-definition) with the per-rule tasks derived from the stabilized disposition table.

The extend skill re-iterates the PRD via deskwork (operator clicks Iterate → agent runs `/deskwork:iterate`) when scope additions affect the PRD; for workplan-only additions deriving from an already-applied disposition table, the re-iteration is informational.

- [ ] **Step 3: Commit** the extended workplan.

```bash
git add docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/workplan.md
git commit -m "docs(decompose-agent-discipline): extend workplan with Phase 2 disposition tasks"
```

### Task 5: File GitHub issues for Phase 2

- [ ] **Step 1: Invoke `/dw-lifecycle:issues`** to file the parent feature issue + per-Phase-2-sub-phase issues from the extended workplan.

- [ ] **Step 2: Verify** the workplan was back-filled with issue links.

Run: `grep -n 'issues/' docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/workplan.md`

Expected: every Phase 2 task has a `[#NNN]` link.

---

## Phase 2 — Per-disposition implementation cycles

> **Phase 2 task breakdown is populated by Task 4 (above) after the PRD's disposition table is `applied`.** The structure below names the sub-phases and their scope shape; the actual per-rule TDD-shaped tasks are added via `/dw-lifecycle:extend` once Phase 1 completes.
>
> This is not a placeholder for laziness — it is an artifact of the workflow's design. The operator explicitly wanted the disposition plan developed via deskwork review tooling, which means the per-rule tasks are derived from operator-confirmed dispositions, not from agent-speculated ones. Per the "Capture mode vs scope mode" rule in `agent-discipline.md`, capturing speculative tasks pre-Phase-1 would be the same anti-pattern in implementation-task form.

### Phase 2a — Pure deletes and DONE pointer-shrinks

**Disposition class:** entries whose body either (a) is superseded by mechanization that already exists and gets deleted outright, or (b) documents an existing skill/CLI that should hold the canonical text — agent-discipline.md shrinks to a 1-line pointer.

**First-draft entries from PRD:** 2 (delete), 3, 4, 20 (DONE-pointer-shrink). Subject to PRD review.

**Acceptance criteria for each task in this sub-phase:**
- The canonical home of the content is established (skill body owns it for DONE entries; nothing owns it for deletes).
- agent-discipline.md is edited in the same commit: entry deleted, or shrunk to a single pointer line linking to the canonical home.
- Commit message names which entry was processed and points at the canonical home.

### Phase 2b — Tooling fixes

**Disposition class:** entries whose pathological behavior is best closed by removing the bait at the tool level (deleting a CLI flag, adding a gate, making a write-helper refuse the bad shape).

**First-draft entries from PRD:** 15 (`--no-tailscale` flag removal/no-op-alias), 17 (namespace-write gate + doctor rule). Subject to PRD review.

**Acceptance criteria for each task in this sub-phase:**
- The tool-side change ships AND the flag/shape that triggered the rule is gone or guarded.
- A test exists exercising the new failure path (per the TDD-enforcement discipline in agent-discipline.md entry 3).
- The corresponding entry in agent-discipline.md is deleted (when the rule is wholly addressed) or shrunk to a 1-line pointer (when the rule retains residual judgment scope).

### Phase 2c — Composes into in-repo dw-lifecycle skills

**Disposition class:** entries whose content composes into a skill body already inside `plugins/dw-lifecycle/skills/<name>/SKILL.md`. Pure in-repo edits.

**First-draft entries from PRD:** 1, 5, 6, 11, 18a. Subject to PRD review.

**Acceptance criteria for each task in this sub-phase:**
- The target SKILL.md is edited to incorporate the rule's discipline at the right step.
- agent-discipline.md is shrunk to a pointer.
- Commit message names target skill + entry.

### Phase 2d — Composes into deskwork plugin skills

**Disposition class:** entries whose content composes into a skill in the `deskwork` plugin source (`plugins/deskwork/skills/<name>/SKILL.md` or the cross-plugin equivalent). Reaches into a different plugin.

**First-draft entries from PRD:** 9, 10, 13, 19. Subject to PRD review — operator may re-scope these to a sibling feature.

**Acceptance criteria for each task in this sub-phase:**
- Either: (a) the deskwork-plugin skill is edited in this feature's branch, OR (b) the entry is removed from this feature's scope and a sibling feature is filed (with a workplan-side `[debt: #NNN]` link per the closure-is-structural rule).
- agent-discipline.md is shrunk to a pointer (route (a)) or carries a forward-pointer to the sibling feature (route (b)).

### Phase 2e — Shrunk-stays

**Disposition class:** entries that remain in agent-discipline.md because the discipline is irreducibly always-on and resists mechanization. Each entry gets shrunk to its minimum useful form.

**First-draft entries from PRD:** 7, 14, 16, 18b–e. Subject to PRD review (the cluster could also move wholesale to a `project-conventions.md` sibling rule file).

**Acceptance criteria for each task in this sub-phase:**
- Entry is rewritten in 3–10 lines (down from its current size).
- The "Why" and "How to apply" structure is preserved per the CLAUDE.md memory-write convention; the elision is in the example/rationale prose.
- If the cluster gets moved to `project-conventions.md`, the move is a separate commit per rule, and agent-discipline.md gets a 1-line pointer to the new file.

---

## Final verification

After Phase 2 completes, before `/dw-lifecycle:complete`:

- [ ] **Step 1: Measure agent-discipline.md size.**

Run: `wc -l .claude/rules/agent-discipline.md`

Expected: 150–200 lines.

- [ ] **Step 2: Verify every disposition action landed.**

Run: comparison of pre-feature triage table (recorded in the applied PRD) against post-feature file. For each entry the action column claimed, confirm the residue matches.

- [ ] **Step 3: Run the no-bare-TBDs gate against the workplan.**

Run: `dw-lifecycle check-open-findings --feature decompose-agent-discipline` (or the equivalent verb name on the installed binary).

Expected: zero open findings.

- [ ] **Step 4: Add audit-log entry referencing the feature** under `docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/audit-log.md`, summarizing per-disposition outcomes.

- [ ] **Step 5: Commit final-verification artifacts.**

```bash
git add docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/audit-log.md
git commit -m "docs(decompose-agent-discipline): final verification + audit-log entry"
```

After this commit lands, the feature is ready for `/dw-lifecycle:review` → `/dw-lifecycle:ship` → `/dw-lifecycle:complete`.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Disposition table iteration in Phase 1 takes more cycles than expected (operator surfaces structural concerns not yet captured) | The Phase 1 → Phase 2 gate is `applied`, not a time-bounded target. Capturing fully before scoping is exactly the discipline agent-discipline.md entry 9 names. |
| Phase 2d (deskwork-plugin composes) requires authoring in a different plugin's source; risks scope creep | PRD review's Open Question #1 explicitly asks whether these entries stay in scope or move to a sibling feature. Defer in-feature commitment until applied. |
| Tooling fix for `--no-tailscale` (entry 15) breaks an adopter who scripted against the flag | Disposition target is no-op-alias with stderr warning, not hard removal. Per the "marketplace-clone script names + flags are an adopter contract" sub-rule, the flag stays parseable. |
| Entry 12 ("Just for now") is deferred but its discipline still applies to this feature's own commits | Pre-commit audit-barrage hook continues to fire; deferring rule 12 doesn't deactivate it. |
| The disposition table is the workplan's source of truth — if it drifts from agent-discipline.md after Phase 1 applied, Phase 2 tasks become wrong | Task 4 (extend the workplan) snapshots the applied disposition table into workplan task descriptions. Any post-applied disposition changes require a new PRD revision per the "extend re-iterates via deskwork" rule. |
