---
slug: open-issue-tranche-cleanup
title: open-issue-tranche-cleanup
targetVersion: "0.16.0"
date: 2026-05-05
parentIssue:
deskwork:
  id: b3f20364-969a-4004-87bd-278cd5992e3c
---

# PRD: open-issue-tranche-cleanup

## Problem Statement

The open-issue tracker for the `deskwork`, `deskwork-studio`, and supporting `packages/{cli,core,studio}` plugins has accumulated a heterogeneous set of issues with mixed currency: some are fix-landed-pending-verification, some are real architecture work, some are stale framings of work that has already been absorbed by the current architecture, and some are upstream-owned. This makes the tracker operationally noisy — filtering for "what should we work on next" surfaces a lot of items that aren't actually open work, and "what's been done" surfaces items that just need a verification step before closure. The issue set splits cleanly into four behavioral tranches: items that are implemented and need a marketplace-install walk before closure; one architecture-critical bug + its follow-up cleanup (`#191` → `#192`, the dual-resolver / orphan-write seam already documented during the v0.15.0 work); real but non-blocking product features; and a tail of moot / superseded / reframe-before-acting items. Cleaning these out in that order leaves the tracker reflecting the current product shape, with the remaining open items grouped by implementation strategy rather than historical residue.

## Solution

Execute a six-phase triage that closes implemented-but-unverified issues, ships the #191/#192 architecture cleanup as a contained two-phase code change, sweeps moot/superseded items with explanatory comments, reframes stale-framing items before they get re-attempted, and ends with a tracker audit that documents the post-cleanup state. The deliverable for the developer (operator) is a much smaller, more accurate open-issue list grouped by implementation strategy. The deliverable for downstream adopters is a bug fix (#191) that prevents scrapbook writes from landing in orphan directories on non-kebab-case content layouts.

## Acceptance Criteria

- [ ] All Tranche-1 verify-ready issues (#159, #160, #161, #163, #164, #165, #166, #183, #184, #188) closed with marketplace-install verification comments referencing the verifying build.
- [ ] [#191](https://github.com/audiocontrol-org/deskwork/issues/191) (studio scrapbook mutations write to slug-template path) fix-landed in `feature/deskwork-open-issue-tranche-cleanup`; mutation routes resolve via the entry-aware resolver.
- [ ] [#192](https://github.com/audiocontrol-org/deskwork/issues/192) (collapse dual scrapbook resolvers) fix-landed; `scrapbookDir(slug)` and `scrapbookFilePath(slug)` removed from the public `@deskwork/core/scrapbook` exports.
- [ ] [#190](https://github.com/audiocontrol-org/deskwork/issues/190) (marginalia vertical alignment) verified + closed in the same marketplace-walk session as Tranche 1.
- [ ] Moot/superseded issues (#75, #94, #89, #83) closed with explanatory comments.
- [ ] Stale-framing issues #40 and #53 either closed or rewritten around current command surface — never silently left in the original framing.
- [ ] [#92](https://github.com/audiocontrol-org/deskwork/issues/92) (Claude Code platform bug) disposition recorded (closed-with-reference or relabeled upstream-tracking).
- [ ] Feature `README.md` status table updated with a post-cleanup snapshot of remaining open issues grouped by implementation strategy.

## Out of Scope

- Implementation of the Tranche 3 product-feature backlog (#54 agent-reply margin notes, #84 iterate skill comment-path doc, #85 version diff/compare, #82 editable voice catalog, #87 skinnable studio, #86 Google Docs plugin). These remain open roadmap items; this feature does NOT implement them.
- The lower-priority background-architecture tranche (#18 hierarchical content trees, #30 content-tree caching, #33 content-identity-vs-slug). Defer until after #191/#192 ship.
- New design conversations on closing-as-moot issues — the proposal already enumerates the rationale per issue; no fresh design pass.
- Anything in `dw-lifecycle` outside the shared scrapbook architecture.

## Technical Approach

Five-pass execution, mirroring the proposal's "Practical Closure Proposal": 1. **Verify + close (Tranche 1).** Run `/plugin marketplace update deskwork` against a test environment, walk each #-listed issue's surface, post the verifying-build commit hash, close. No code changes. 2. **Architecture cleanup #191 → #192 (Tranche 2).** Most of the design is already in the issue bodies (filed during v0.15.0). Implementation: switch `packages/studio/src/routes/scrapbook-mutations.ts` envelope to `entryId`-based addressing, route through `scrapbookFilePathForEntry` / `scrapbookDirForEntry`. Then collapse the slug-only resolver to a private fallback inside the entry-aware resolver. Tests: regression coverage for an entry whose path doesn't match the slug template. 3. **Verify #190 marginalia alignment in marketplace walk (Tranche 3).** Re-walk the surface from a fresh marketplace install of v0.15.0 (or whichever version this feature ships in). Close once verified. 4. **Sweep moot/superseded/stale issues (Tranche 4 + 5).** For each issue: post a closing comment with the rationale (architecture-supersession reason for #75/#94/#83; mitigation reference for #89; reframe-before-acting note for #40/#53). Reframe the wording for #40 / #53 before closing — they may yield smaller still-real follow-ups. 5. **External-tracking decision for #92.** One-comment triage; close with upstream reference unless the team wants it kept as upstream-tracking. The work is strictly cleanup; no new architectural decisions. Tranche 2's #191/#192 implementation is the only code-change step. Everything else is verification + comment + close.
