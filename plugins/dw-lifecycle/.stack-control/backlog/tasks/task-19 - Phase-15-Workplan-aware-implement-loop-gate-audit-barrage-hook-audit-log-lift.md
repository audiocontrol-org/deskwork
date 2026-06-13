---
id: TASK-19
title: >-
  Phase 15: Workplan-aware implement-loop gate + audit-barrage hook + audit-log
  lift
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-373
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Trigger

v0.28.0 closure-triad dogfood (live verification post-release) surfaced three gaps in Phase 13's implement-loop gate + audit-barrage integration:

1. **Gate too strict.** Phase 13 Task 2's `check-open-findings` refuses on ANY `Status: open` audit-log finding. This creates a structural chicken-and-egg: the fixes for those findings can't be worked through `/dw-lifecycle:implement` because the loop refuses to start with them open.

2. **Audit-barrage findings never reach the canonical audit-log.** Today they land only in per-model run-dir markdown. `promote-findings` (and therefore the gate) can't pick them up.

3. **No implement-loop hook fires the barrage.** Operator-discipline-displacement requires automatic firing at task boundaries, not operator-remembered invocation.

## Operator framing (verbatim)

> *"There's a problem with the audit log /dwi gate. it currently won't proceed until the audit log is clean — but, we can't fix any of the problems using the /dwi loop unless we can run the /dwi loop. What should probably happen instead is that the /dwi gate won't open until all of the unfixed items in the audit log are scoped into the workplan as the next tasks to work on. That way, the /dwi gate won't allow deferring audit fixes, but it will allow the gate to open if the next items in the workplan are those fixes."*

> *"we need to add an audit barrage hook at the end of the /dwi loop with a mandate to scope the fixes as the next workplan items. And, we must ensure that the findings from the audit barrage are actually written to the audit log."*

## Tasks (6 captured in workplan)

1. **Workplan-aware implement-loop gate.** Replace strict "refuse on any open" semantic of `check-open-findings` with: allow when (zero open findings) OR (the next N unchecked workplan tasks ARE the fix-finding tasks for the open finding IDs). Three distinct refusal modes — `non-fix-task-before-fix-tasks`, `coverage-mismatch (missing)`, `coverage-mismatch (extra)` — each carrying an actionable cure path. The Phase 13 rigidity stance (no `--ignore-open-findings`) carries forward; the workplan-aware semantic IS the cure, not an escape hatch.

2. **Audit-barrage finding extraction library.** NEW pure-fn `extractBarrageFindings({runDir})` parses per-model markdown; detects cross-model agreement; normalizes severity.

3. **`dw-lifecycle audit-barrage-lift` CLI verb.** Reads run-dir, extracts findings via Task 2, writes as `Status: open` audit-log entries with sequential `AUDIT-<date>-<NN>` IDs. Default dry-run; `--apply` writes. Audit-log preservation rule honored.

4. **Implement-loop end-of-task hook.** `/dw-lifecycle:implement` SKILL.md gains an end-of-task step composing four CLI calls: `audit-barrage --output-run-dir` → `audit-barrage-lift --apply` → `promote-findings --apply` → `check-open-findings`. NEW `--skip-audit-barrage-hook` flag for fast iteration. NEW `audit-barrage --output-run-dir` flag (prints path on stdout; summary to stderr for bash capture).

5. **Live verification + dogfood.** Positive scenario (full self-healing loop) + three negative scenarios (each refusal mode + its cure path).

6. **Cross-references.** `.claude/rules/agent-discipline.md` § "Audit findings: scope-don't-defer + TDD enforcement"; `plugins/dw-lifecycle/README.md` § "Audit-finding lifecycle"; `ROADMAP.md` § "Design A.5".

## Self-healing loop semantic

```
Task A completes + commits
  → end-of-task hook fires audit-barrage (real CLIs; operator-supervised)
  → audit-barrage-lift --apply writes findings to audit-log
  → promote-findings --apply scopes findings as workplan's next tasks
  → next-task pickup checks workplan-aware gate
  → gate ALLOWS (findings are scoped as next)
  → loop continues to the fix-finding tasks
```

## Out of scope (captured)

- Audit-barrage parallelization / batching across tasks (v1 fires per-task; throttle as follow-up).
- Cross-feature audit-barrage (single feature v1; multi-feature downstream).
- Operator-side gate override flag (no `--ignore-open-findings`; the workplan-aware semantic IS the cure).
- TDD-order enforcement at gate-time (Phase 13 Task 3's commit-msg gate handles this at commit).
- Re-audit-fixed-findings integration into the per-task hook (different cadence — post-release vs in-flight).

## Open scoping questions (operator iterate)

1. Strict next ([0..N-1]) vs lax next (anywhere in first M unchecked, M > N). Operator framing reads strict.
2. Audit-barrage hook cadence (per-task vs batched).
3. Cross-model agreement threshold (Phase 12 used ≥2 for HIGH-confidence; v1 carries that forward).
4. Audit-barrage CLI availability handling (soft-skip vs hard-fail). v1 soft-skip per Phase 12's spawn-error precedent.

## Existing primitives this composes over

- `check-open-findings` library (Phase 13 Task 2) — Task 1 replaces its semantic; pure-fn shape + CLI verb structure preserved.
- `walkOpenFindings` + audit-log-parser — unchanged; Tasks 1 and 3 reuse.
- `findCompletedFixFindingTasks` (`tdd-enforcement.ts`) — Task 1 adds a sibling `findUncheckedFixFindingTasks`.
- `cross-reference-audit-run.ts` heuristics — Task 2 reuses for cross-model agreement detection.
- `flipAuditLogStatus` + `applyStatusFlips` — Task 3 reuses for atomic audit-log writes.
- `audit-barrage` skill + CLI verb (Phase 12) — Task 4 composes with the new `--output-run-dir` flag.
- `promote-findings` library + CLI verb (Phase 13 Task 1) — Task 4 composes as the hook's final step.
- `apply-audit-flips` (Phase 13 Task 4 Step 2) — unchanged; remains the `Closes AUDIT-<id> → fixed-<sha>` bridge.

## Cross-references

- Workplan: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` § "Phase 15"
- PRD acceptance: `docs/1.0/001-IN-PROGRESS/scope-discovery/prd.md` "Phase 15 acceptance criteria"
- Parent scope-discovery feature: #273
- Phase 13 (anti-deferral discipline parent): #355 (closed; closure-triad shipped in v0.28.0)
- Sibling rule the gate-semantic correction strengthens: `.claude/rules/agent-discipline.md` § "Audit findings: scope-don't-defer + TDD enforcement"
<!-- SECTION:DESCRIPTION:END -->
