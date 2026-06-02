---
slug: decompose-agent-discipline
targetVersion: "1.0"
date: 2026-05-30
branch: feature/decompose-agent-discipline
parentIssue: "#388"
---

# Feature: decompose-agent-discipline

Reduce `.claude/rules/agent-discipline.md` from 566 lines to ~150–200 by triaging each of its 21 rule entries to its most effective home — composed into a skill body, enforced by a gate/hook/doctor rule, fixed at the tool level, or (for irreducible always-on defaults) shrunk to a pointer that stays in the file. Policy enforced in process beats policy embedded in always-loaded rule prose, and the always-on context cost of the silted file has crossed the point where it costs more than it earns.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Develop the disposition plan via deskwork review | **Complete** — PRD at Final; disposition table approved (rev 2) |
| 2 | Per-disposition implementation cycles (2a–2e) | Planned — tasks enumerated; awaiting implementation session |

Phase 2 implementation runs in a **separate session** opened against this worktree (per the orchestrator-vs-implementation-session boundary). Issues filed via `/dw-lifecycle:issues`.

## Key Links

- Branch: `feature/decompose-agent-discipline`
- PRD: `prd.md` (deskwork entry `38410ae2-0e2a-4d09-84b4-f441b38c1e59`, stage Final)
- Workplan: `workplan.md`
- Spun-off feature: [#387](https://github.com/audiocontrol-org/deskwork/issues/387) — retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` in favor of audit-barrage
- Parent Issue: [#388](https://github.com/audiocontrol-org/deskwork/issues/388)
