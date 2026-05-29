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

Updated 2026-05-29 based on the repo-wide issue-closure audit at
[`docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md`](../../../1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md).
Phases below cite verified closure (with evidence trail) where applicable.

| Phase | Description | Status |
|---|---|---|
| 1 | Verify + close Tranche 1 (marketplace-install walk; ~10 issues) | In progress — 5 of 10 closed in 2026-05-29 audit (#159, #160, #163, #165, #166); #161 stays open as scrapbook UX umbrella; #164 stays open by design (G3 Q3 deferral); #183 / #184 / #188 not yet swept |
| 2 | Implement #191 (entry-id mutation envelope) + tests | Fix-landed (pending v0.16.0 verification) |
| 3 | Implement #192 (collapse dual scrapbook resolvers) + tests | Done — #192 closed 2026-05-29 (`scrapbookDirForEntry` is the only public resolver; `scrapbook/paths.ts:22` documents the removal of `scrapbookDir`) |
| 4 | Verify + close #190 marginalia alignment (rolls up with Phase 1) | Done — operator-confirmed via workplan review |
| 5 | Sweep moot/superseded/stale (Tranche 4 + 5); reframe #40, #53; triage #92 | Done |
| 6 | Tracker audit — verify the open list reflects only currently-actionable work | Done — 2026-05-29 audit produced the per-issue evidence log + burn-down candidates listed in `issue-closure-audit-2026-05-29.md`; 68 of 178 issues closed (110 open remain, each categorized) |
| 7 | Fix marginalia edit + delete UX (#199) | Done — #199 closed 2026-05-29; `sidebar-render.ts` ships edit/delete buttons; server PATCH/DELETE at `api.ts:285-293` cite Phase 35 / #199 |
| 8 | Extend entry-aware addressing to scrapbook viewer + link emitters (#205) | Done — #205 closed 2026-05-29 (`scrapbook-item.ts` ships `entryId?` field + `?entryId=<uuid>` URL plumbing); #207 closed 2026-05-29 (`pages/scrapbook.ts` 17-LOC barrel; split into 7 files, all under cap) |
| 9 | Ingest defaults to Drafting per add/ingest semantic distinction (#206) | Done — #206 closed 2026-05-29 (`ingest-derive.ts:260-265` defaults to Drafting with operator-rationale source comment) |
| 10 | Evaluate + fix dogfood bugs from v0.16.0 walk (#220, #221, #223, #224, #225, #226) | Partial — #225 closed 2026-05-29 (approve SKILL.md scaffold step removed); #221, #223 confirmed still-open with burn-down candidates filed; #220, #224, #226 not swept |
| 11 | Tranche-organized burn-down (T1: #222 first; then T6, T2, T3, T4, T5; T7 in parallel) | T1 + T6 fix-landed; T2 fix-landed (audit verified `/dw-lifecycle:*` setup/issues bug closures for #185, #196, #209, #210, #212, #213, #214); T5 partial: review-surface mobile rebuild fix-landed (12 commits, 2026-05-08); editor mobile rebuild (Mockup 2) + scrapbook mobile (Mockup 1) fix-landed 2026-05-09; T4 partial: #167, #168 closed 2026-05-29; T3 partial: #182 closed 2026-05-29; T7 walk superseded by the 2026-05-29 audit's per-issue evidence approach |

## Key Links

- Branch: `feature/deskwork-open-issue-tranche-cleanup`
- Worktree: `~/work/deskwork-work/deskwork-open-issue-tranche-cleanup/`
- PRD: `prd.md`
- Workplan: `workplan.md`
- Source proposal: [`docs/1.0/001-IN-PROGRESS/deskwork-plugin/2026-05-04-open-issue-tranche-proposal.md`](../../../../1.0/001-IN-PROGRESS/deskwork-plugin/2026-05-04-open-issue-tranche-proposal.md) (deskwork entry `818a5ef7-5ff8-444a-a01c-3fa31906d345`)
- Parent Issue: _to be filed by `/dw-lifecycle:issues`_
