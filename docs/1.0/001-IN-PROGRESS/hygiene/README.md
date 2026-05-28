---
slug: hygiene
targetVersion: "1.0"
date: 2026-05-28
branch: feature/hygiene
parentIssue: "#323"
---

# Feature: Hygiene

Ships a family of UNIX-style `/dw-lifecycle:*` skills that surface and burn down three classes of permanent debt: stale GitHub issues, workplan TBD/defer markers, and parked branches. Each skill is one action; the family integrates with natural lifecycle waypoints (session-end captures observations, complete enforces a no-bare-TBDs gate, release closes shipped issues). The deliverable is the tooling + operational pattern — the first dogfood round (Phase 9) validates against the existing backlog but is not "the work."

## Status

| Phase | Description | Issue | Status |
|---|---|---|---|
| 0 | Infrastructure teardown | [#324](https://github.com/audiocontrol-org/deskwork/issues/324) | Done in setup (2026-05-28) |
| 1 | Read-only baseline — `/dw-lifecycle:debt-report` | [#325](https://github.com/audiocontrol-org/deskwork/issues/325) | Shipped on branch (734008d + d0c2a37 + 965501c; spec + quality review complete) |
| 2 | GitHub-issue triage — `/dw-lifecycle:triage-issues` | [#326](https://github.com/audiocontrol-org/deskwork/issues/326) | Shipped on branch (b2e5178 + 025a1dc + ed1ac26; spec + quality review complete) |
| 3 | Workplan-deferral promotion — `/dw-lifecycle:promote-deferrals` | [#327](https://github.com/audiocontrol-org/deskwork/issues/327) | Shipped on branch (62d3965 + 53eec56; combined review complete) |
| 4 | Branch archive — `/dw-lifecycle:archive-branch` | [#328](https://github.com/audiocontrol-org/deskwork/issues/328) | Not started |
| 5 | Release-time issue closure — `/dw-lifecycle:close-shipped` | [#329](https://github.com/audiocontrol-org/deskwork/issues/329) | Not started |
| 6 | Lifecycle integration | [#330](https://github.com/audiocontrol-org/deskwork/issues/330) | Not started |
| 7 | Documentation | [#331](https://github.com/audiocontrol-org/deskwork/issues/331) | Not started |
| 8 | Tests + smoke | [#332](https://github.com/audiocontrol-org/deskwork/issues/332) | Not started |
| 9 | Dogfood round | [#333](https://github.com/audiocontrol-org/deskwork/issues/333) | Not started |

## Key Links

- Branch: `feature/hygiene`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Parent Issue: [#323](https://github.com/audiocontrol-org/deskwork/issues/323)
