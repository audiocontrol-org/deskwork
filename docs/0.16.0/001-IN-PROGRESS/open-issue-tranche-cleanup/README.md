---
slug: open-issue-tranche-cleanup
targetVersion: "0.16.0"
date: 2026-05-05
branch: feature/deskwork-open-issue-tranche-cleanup
parentIssue:
---

# Feature: open-issue-tranche-cleanup

Triage the open-issue tracker for the `deskwork`, `deskwork-studio`, and supporting `packages/{cli,core,studio}` plugins. The proposal at `2026-05-04-open-issue-tranche-proposal.md` (deskwork entry `818a5ef7-…`) groups the open set into five tranches: implemented-but-needs-marketplace-walk closure, one architecture-critical bug + cleanup arc (#191 → #192), real-but-non-blocking product features (kept open), moot/superseded items to close, and stale-framing items to reframe before acting. This feature executes that triage so the tracker reflects current product shape with remaining items grouped by implementation strategy rather than historical residue.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Verify + close Tranche 1 (marketplace-install walk; ~10 issues) | Not started |
| 2 | Implement #191 (entry-id mutation envelope) + tests | Fix-landed (pending v0.16.0 verification) |
| 3 | Implement #192 (collapse dual scrapbook resolvers) + tests | Fix-landed (pending v0.16.0 verification); folded in #202 split |
| 4 | Verify + close #190 marginalia alignment (rolls up with Phase 1) | Not started |
| 5 | Sweep moot/superseded/stale (Tranche 4 + 5); reframe #40, #53; triage #92 | Done |
| 6 | Tracker audit — verify the open list reflects only currently-actionable work | Not started |
| 7 | Fix marginalia edit + delete UX (#199) | Text-edit + delete fix-landed; category-edit pending; range-edit wontfix (#203 closing) |
| 8 | Extend entry-aware addressing to scrapbook viewer + link emitters (#205) | Not started (audit Finding 1) |
| 9 | Ingest defaults to Drafting per add/ingest semantic distinction (#206) | Not started |

## Key Links

- Branch: `feature/deskwork-open-issue-tranche-cleanup`
- Worktree: `~/work/deskwork-work/deskwork-open-issue-tranche-cleanup/`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Source proposal: [`docs/1.0/001-IN-PROGRESS/deskwork-plugin/2026-05-04-open-issue-tranche-proposal.md`](../../../../1.0/001-IN-PROGRESS/deskwork-plugin/2026-05-04-open-issue-tranche-proposal.md) (deskwork entry `818a5ef7-5ff8-444a-a01c-3fa31906d345`)
- Parent Issue: _to be filed by `/dw-lifecycle:issues`_
