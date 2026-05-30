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
| 4 | Branch archive — `/dw-lifecycle:archive-branch` | [#328](https://github.com/audiocontrol-org/deskwork/issues/328) | Shipped on branch (34 tests pass; preserve-then-delete with all-or-nothing pre-flight gates) |
| 5 | Release-time issue closure — `/dw-lifecycle:close-shipped` | [#329](https://github.com/audiocontrol-org/deskwork/issues/329) | Shipped on branch (8b3a8de + extension; 4-source evidence walker (commit-log + audit-log + tooling-feedback + workplan-checkbox) + cross-source merge + release-notes-body flag; 110 tests pass) |
| 6 | Lifecycle integration | [#330](https://github.com/audiocontrol-org/deskwork/issues/330) | Tasks 1–5 shipped on branch. Tasks 1–3: session-end + session-start + complete TBD gate. Task 4 phase-parent closure gate ([#336](https://github.com/audiocontrol-org/deskwork/issues/336)) ships `complete-parent-closure propose|apply` + 3-source walker + auto-drafted closure comments + 56 new vitest tests. Task 5 session-end-hygiene semantic + rendering fixes shipped at [#340](https://github.com/audiocontrol-org/deskwork/issues/340). |
| 7 | Documentation | [#331](https://github.com/audiocontrol-org/deskwork/issues/331) | Shipped on branch (README section + per-skill SKILL.md audit complete) |
| 8 | Tests + smoke | [#332](https://github.com/audiocontrol-org/deskwork/issues/332) | Shipped on branch (1804 tests pass + scripts/smoke-hygiene.sh) |
| 9 | Dogfood round | [#333](https://github.com/audiocontrol-org/deskwork/issues/333) | Shipped (v0.26.0 dogfood; 3 stale issues triaged + closed; promote-deferrals false-positive surfaced as [#339](https://github.com/audiocontrol-org/deskwork/issues/339) and fixed in 9086894) |
| 10 | npm Trusted Publisher CI workflow | [#343](https://github.com/audiocontrol-org/deskwork/issues/343) | Shipped on branch (Tasks 1-4: workflow + publishConfig + /release skill update + RELEASING.md; Task 5 verification awaits first real release using the new workflow) |
| 11 | Stale worktree discovery + dismantle | [#356](https://github.com/audiocontrol-org/deskwork/issues/356) | Tasks 1–6 shipped on branch. Task 6 dogfood ran against `~/work/deskwork-work/` — 4 stale candidates surfaced; operator dispositioned 3 × archive-then-dismantle + 1 × skip. Live bug surfaced (TF-002 promoted to [#364](https://github.com/audiocontrol-org/deskwork/issues/364)) — runGit-contract mismatch in `archive-branch` preflight; fixed + recovered. Task 3 Step 3 (complete-gate suggestion) + Task 4 Step 3 (burndown sheet) remain as polish. |
| 12 | session-end-hygiene "issues filed this session" scoping fix | [#361](https://github.com/audiocontrol-org/deskwork/issues/361) | Task 1 (data source) shipped in v0.27.0. Task 2 (label rename `filed`→`referenced` to match the Medium-fix semantic) shipped on branch this session — 5 emit/filter sites updated, 7 test sites updated, `replace_all` rename pass. 2331/2331 tests pass. Verify-in-installed-release awaits the next ship. |
| 13 | close-shipped commit-log walker fix-keyword filter | [#366](https://github.com/audiocontrol-org/deskwork/issues/366) | Task 1 shipped in v0.28.1. v0.28.1 install verification confirmed Phase 13 is strict-correct per GitHub's grammar but the project's commit convention uses end-of-subject `(#NNN)` which now drops out. Acceptance criterion as-written was wrong — followed up as Phase 14 ([#369](https://github.com/audiocontrol-org/deskwork/issues/369)). |
| 14 | close-shipped walker accuracy follow-ups (Phase 13 dogfood) | [#369](https://github.com/audiocontrol-org/deskwork/issues/369) | Scoped (2026-05-30) from v0.28.1 install verification. Task 1: configurable end-of-subject parens for commit-log walker (project-convention adapter). Task 2: audit-log walker `Tracks-Issue:` field to disambiguate entry-tracked from prose-cited issues (surfaced when v0.28.1 dry-run matched `Closes #50` inside test-fixture prose). Implementation pending. |

## Key Links

- Branch: `feature/hygiene`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Parent Issue: [#323](https://github.com/audiocontrol-org/deskwork/issues/323)
