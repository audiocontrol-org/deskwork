---
id: TASK-17
title: 'Retire /dw-lifecycle:review + /dw-lifecycle:audit in favor of audit-barrage'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-387
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Retire the `/dw-lifecycle:review` and `/dw-lifecycle:audit` skills in favor of the audit-barrage surface as the project's review/audit mechanism.

This was surfaced as a margin note during the `decompose-agent-discipline` PRD review (operator, verbatim):

> "the review skill is no longer hooked into the iterate cycle — superseded by the audit barrage hook. Review is no longer operationally enforced, so we shouldn't put anything in there. In fact, we should consider retiring review and audit in favor of audit barrage."

The `decompose-agent-discipline` feature **deletes the dead `agent-discipline.md` rule entry** ("Use /dw-lifecycle:review after every implementation step") because that rule is dead regardless. The **skill retirement itself** is split out here as its own feature because it is a multi-skill architectural change, not a rule-decomposition.

## Surface inventory (to confirm before any deletion)

- `/dw-lifecycle:review` skill (`plugins/dw-lifecycle/skills/review/SKILL.md`) and its CLI surface.
- `/dw-lifecycle:audit` skill — currently an alias of `/dw-lifecycle:review` (same three-track protocol + durable audit-log workflow).
- The durable audit-log workflow both drive (`docs/.../audit-log.md` per feature). audit-barrage feeds the audit-log today but does not own the lifecycle around it — retiring review/audit means audit-barrage (or a successor) has to own audit-log creation plus the promote-findings / closure-triad entry points that currently reference the review cycle.
- Cross-references in `.claude/rules/agent-discipline.md` (the audit-barrage rule's "three independent audit surfaces" framing names review as surface 2 of 3) and `.claude/CLAUDE.md` (sub-agent-delegation table lists `code-reviewer`).
- `/dw-lifecycle:review` invocations baked into other skills' "after every commit" steps.

## Acceptance

- Decide whether audit-barrage fully subsumes the three-track protocol or whether a successor owns the audit-log lifecycle.
- Remove the two skills and rehome every caller / cross-reference above with no dangling references.
- Update `agent-discipline.md` "three audit surfaces" framing and any closure-triad entry points.

## Provenance

- Source PRD: `docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/prd.md`, section "Operator-raised: retire review/audit".
- Decision: operator approved the split ("follow your recommendation") at PRD revision 2 approval.
<!-- SECTION:DESCRIPTION:END -->
