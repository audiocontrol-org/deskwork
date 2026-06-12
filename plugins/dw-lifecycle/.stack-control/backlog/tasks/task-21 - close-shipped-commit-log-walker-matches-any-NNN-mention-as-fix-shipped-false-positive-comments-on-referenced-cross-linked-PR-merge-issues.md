---
id: TASK-21
title: >-
  close-shipped commit-log walker matches any #NNN mention as fix-shipped;
  false-positive comments on referenced / cross-linked / PR-merge issues
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-366
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`dw-lifecycle close-shipped`'s commit-log walker matches **any** `#NNN` mention in a commit subject or body as evidence the fix shipped. The result: false-positive `pending-verification` comments land on issues that were merely *referenced* in commit bodies (cross-links, back-fills, adjacent-friction acknowledgements) — including the PR-merge commit itself ("Merge pull request #PR from ..."). The actual semantic of "this commit shipped a fix for #N" needs a stricter match shape.

Found during the v0.27.0 dogfood (2026-05-29) — promoted from `hygiene` feature's `tooling-feedback.md` TF-003.

## Repro

```bash
dw-lifecycle close-shipped --from-tag v0.26.5 --to-tag v0.27.0
```

The dry-run + apply both surfaced 9 candidates from the v0.27.0 release. Only 3 were real:

| Issue | Real? | Why |
|---|---|---|
| #356 (Phase 11 parent) | ✅ | Phase 11 shipped in this PR. |
| #361 (Phase 12 fix) | ✅ | Fix shipped in this PR. |
| #364 (runGit-contract bug) | ✅ | Fix shipped in this PR. |
| #351 helper-subcommand availability | ❌ | Scope-discovery dogfood follow-up; matched on `54cfdb1` docs-body cite. |
| #352 pre-commit docs-only skip | ❌ | Same shape as #351. |
| #353 audit-barrage Phase 12 | ❌ | Tracker for scope-discovery branch work; matched on `back-fill issue link` commit. |
| #355 audit-finding lifecycle Phase 13 | ❌ | Same shape as #353. |
| #362 dispatch round-trip TF-003/4 | ❌ | Workplan-scoping commit body cited #362 as adjacent friction — no fix. |
| #365 the PR itself | ❌ | Merge commit subject "Merge pull request #365 from ..." matched. |

The 6 false-positive comments were cleaned up by the operator post-apply via a `gh api repos/.../issues/comments/<id> -X PATCH -F body=@<file>.md` pass — each comment now opens with a `**Correction (2026-05-29) …**` header that disclaims the shipped-claim and preserves the original evidence-trail text below for audit.

## Root cause

The commit-log walker extracts every `#NNN` reference from commit subjects + bodies (likely via a regex shaped like `/(?:^|[^&\w/])#(\d{1,7})\b/` — the same shape Phase 12's `extractIssueRefsFromRange` uses for "issues this session TOUCHED"). For close-shipped's "fix shipped" contract, that shape is too permissive: it conflates *references* with *fixes*.

## Suggested fix

### Light

Narrow the walker to match GitHub's own fix-keyword forms — the same verbs GitHub's issue-auto-close parser recognizes:

- `Closes #N` / `Closes: #N`
- `Fixes #N` / `Fixed #N` / `Fix #N`
- `Resolves #N` / `Resolved #N` / `Resolve #N`

Case-insensitive. References without one of these verbs (incl. `Merge pull request #PR`, docs-body back-fill links, adjacent-friction acknowledgements) are dropped.

This is the smallest fix that aligns close-shipped's semantic with GitHub's own auto-close grammar — same precision, no operator-side curation needed.

### Medium

The Light fix plus a separate **operator-curation step** inside `close-shipped propose` (mirroring `triage-issues propose`'s shape) — emit a JSON proposal with one row per candidate including the matching commit-message excerpt + a `confidence: high|medium|low` derived from match shape:

- `Closes/Fixes/Resolves <verb> #N` → confidence: high
- Bare `#N` in subject → confidence: medium
- Bare `#N` in body / cross-link → confidence: low

Operator approves a subset; only approved rows apply (post comment + add label).

### Heavy

The Medium fix plus per-source confidence scoring across all four evidence sources:

- **audit-log**: `Status: fixed-<sha>` entries are structurally high-confidence (the operator authored them as "fix landed").
- **tooling-feedback**: `Status: Closed | <sha> | refs #N` entries — same shape; high-confidence.
- **workplan-checkbox**: `[x]` items with `· [#NNN]` — medium-confidence (the box could have been checked optimistically).
- **commit-log**: per-keyword tuning per Light.

The PR merge-commit shape (`Merge pull request #PR from ...`) deserves special-case handling regardless of fix size: it's structurally meaningless evidence and should NEVER produce a comment. PR numbers and issue numbers share namespace on GitHub, but PRs aren't tracking-fix issues.

## Cross-references

- Tooling-feedback log: `docs/1.0/001-IN-PROGRESS/hygiene/tooling-feedback.md` TF-003.
- Hygiene workplan Phase 13 — scopes this fix on `feature/hygiene`.
- Sibling shape: `extractIssueRefsFromRange` in `plugins/dw-lifecycle/src/lifecycle-integration/session-range.ts` (Phase 12) accepts the same any-mention-is-a-signal shape but for the "session TOUCHED" contract — that's intentionally permissive. Close-shipped's contract is the stricter "fix shipped" semantic.
- Six corrected comments on the false-positive issues: #351, #352, #353, #355, #362, #365 (each starts with a `**Correction (2026-05-29)…**` header pointing back here once this issue is filed).
<!-- SECTION:DESCRIPTION:END -->
