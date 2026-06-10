---
id: TASK-18
title: >-
  spec-governance gate: graduates at first 0-HIGH run (not FR-010 branch a/b) +
  FR-014 loop bound is advisory not a code interlock (AUDIT-20260608-01)
status: To Do
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-10 21:32'
labels:
  - agent-found
  - 'type:bug'
  - promoted
dependencies: []
references:
  - gh-432
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #432 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-432 is in frontmatter.

**Feature / spec:** `design/spec-governance` (`specs/004-spec-governance/`, FR-010 / FR-014 / FR-015). Tracked in the program audit-log as **AUDIT-20260608-01** (`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/audit-log.md`). Surfaced manually while driving the `design/document-primitives` (005) implement-phase governance loop. **Affects both spec-mode and implement-mode governance** — one gate, two phases (FR-006).

Two compounding defects make the "non-discretionary" convergence rule (FR-010) neither correctly computed nor mechanically enforced.

## Facet A — the gate graduates at the FIRST 0-HIGH run, collapsing FR-010 branch (a) and branch (b)

FR-010 graduates a checkpoint only on **branch (a)** — a *genuinely* clean run (0 HIGH **and** 0 MEDIUM "by its own condition", i.e. the run surfaced no MEDs) — **or branch (b)** — *2 consecutive 0-HIGH runs*, where the FR-015 slush legitimately bins that window's MEDs.

The protocol chain is `render → barrage → lift → slush → gate` (`src/govern/protocol.ts`), so the FR-015 slush flips every run's open MED/LOW to `acknowledged-slush-pile` **before** the dampener counts. The dampener counts only `Status: open` entries (`src/scope-discovery/promote-findings/check-barrage-dampener.ts:123` — `isOpen = status === 'open' || status === undefined`). So `mostRecent.mediumCount` is **always 0 post-slush**, and:

```
singleRunCleanEngages = highPlusCount === 0 && mediumCount === 0
```

degenerates to `highPlusCount === 0` — it engages on the **first run with 0 open HIGH**, regardless of how many MEDs that run actually surfaced. Graduation (`dampener.dampened && openHigh === 0` in `spec-governance-gate.ts`) then fires, mislabeled `rule: "single-run-clean"`.

**Field evidence (005 implement-governance, 2026-06-08; raw found-severity per round):** R1 = 2 HIGH / 1 MED (blocked) → R2 = **0 HIGH / 4 MED** → all 4 slushed before the gate → `converged, rule:"single-run-clean", openMedium:0`. Per FR-010 R2 must NOT graduate (branch a needed a genuine 0-MED run — it had 4; branch b needed 2 consecutive 0-HIGH — R1 had HIGHs). The correct FR-010 terminal was **branch (b) at R5** (R4 + R5 both 0-HIGH). Instead the gate reported graduation-eligible every round from R2 on, auto-slushing 1 / 4 / 2 / 1 / 4 / 3 / 3 / 3 MED findings (R2…R9). Branch (b)'s 2-consecutive stability guard never gated anything; `single-run-clean` is a misnomer for "a run whose MEDs were just slushed."

**Note:** the FR-015 MED auto-slush is itself intended — the defect is the slush-before-branch-(a) **interaction** (it subverts the genuineness branch (a) assumes), not the slush per se.

**Fix (any one restores FR-010's intent + the R5 terminal):**
1. compute `singleRunCleanEngages` on the run's **raw** found-severity (pre-slush) so branch (a) fires only on a genuinely-clean run; OR
2. evaluate branch (a) before the slush and let slush support branch (b) only; OR
3. drop the single-run rule and require branch (b)'s 2-consecutive-0-HIGH.

## Facet B — FR-014's "the gate bounds the loop" is advisory, not a code-enforced interlock

The gate returns `mayGraduate` (a *permission*; exit 0 on `converged`/`overridden`), but nothing **consumes** it as a hard stop. The multi-round loop is not in code — it lives in the govern skill body as prose ("re-run the governance pass … and repeat until the barrage is clean"), so the agent is simultaneously the **fixer** and the **loop controller**. On `blocked` the loop self-enforces continuation; on `converged` nothing prevents another round. A deterministic rule becomes discretionary in practice — with the gate reporting `converged` from R2, the loop still ran to **R9**.

This contradicts the program thesis (*make failure states mechanically impossible; do not rely on the agent following a rule in a document*).

**Fix:** move the convergence loop into a **code driver** that calls `barrage → lift → slush → gate`, and on a stop verdict terminates the loop and returns control — the agent only performs fix-dispatch *inside* a not-yet-converged loop and never holds the "re-run?" decision. With Facet A fixed, that driver stops mechanically at the FR-010 terminal (R5 in the field case) and, because the rule is 2-consecutive-0-HIGH, still absorbs stochastic late HIGHs (e.g. the R3 sentinel-bypass HIGH, AUDIT-20260608-34 in the 005 log) before stopping.

The two compound: a mis-computed stop signal (A) that is also non-binding (B).

## Scope / disposition

Amend `specs/004-spec-governance/spec.md` FR-010 (branch-(a) genuineness / slush ordering) + FR-014 (loop-driver interlock), with RED-first fix-tasks added to `specs/004-spec-governance/tasks.md` when 004 resumes. The gate + loop migrate under `multi/migrate-audit-barrage`, which must carry this forward. Sibling of #431 (audit-barrage payload self-reference). Cross-ref: 005 GRADUATION III in `docs/1.0/001-IN-PROGRESS/document-primitives/audit-log.md`.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** spec:specs/013-audit-protocol-hardening
<!-- SECTION:NOTES:END -->
