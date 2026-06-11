---
id: TASK-17
title: >-
  document-primitives: round-9 residual hardening (AUDIT-54/55/56 —
  fence-length, prose-as-header, engine floor)
status: To Do
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-11 00:55'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-430
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #430 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-430 is in frontmatter.

**Feature:** `design/document-primitives` (`specs/005-document-primitives/`)
**Source:** implement-phase `deskwork-governance` barrage, round 9 (run `20260608T064427595Z`). Graduated at the diminishing-returns plateau (operator decision 2026-06-08); these MEDIUM residual edges were deferred here rather than chased in a 10th round.

All three are marginal hardening edges on the document-primitives engine (the feature is implementation-complete, 248 tests green, governance gate converged with ~28 findings fixed across 9 rounds). None affects the shipped proof documents.

## AUDIT-20260608-54 — fence-aware grammar detection mis-parses longer code fences
`chrome.ts` fence tracking (added for AUDIT-51) keys on a 3+-backtick/tilde run but does not fully account for longer opening fences / mismatched closing-fence lengths, so a `<!-- doc-grammar: -->` example inside a 4+-backtick fence can still be mis-detected. Strictly better than pre-AUDIT-51 (which mis-detected all in-fence comments); the residual is the long-fence case. Fix: track the opening fence length and require the closing run to be >= it (CommonMark fence rule).

## AUDIT-20260608-55 — row-keyed unarchive can pick prose as the live table header
`unarchive-engine.ts parseLifted` finds the live table header via the first `isTableRowLine` line; a prose line containing an unescaped `|` that appears before the actual table would be picked as the header. Edge (needs a pipe-bearing prose line above the table). Fix: anchor on the table the Units actually parsed from (the THEAD block-stream entry / the table containing the live Units) rather than the first pipe-bearing line.

## AUDIT-20260608-56 — advertised Node engine floor vs the new runtime dependency floor
`plugins/stack-control/package.json` `engines.node` is `>=20`; confirm it matches the floor required by the added runtime deps (`markdown-it`, `peggy`) and bump if a dep requires a higher minimum. Trivial manifest-accuracy fix.

Disposition in the feature audit-log: `acknowledged-2026-06-08 (deferred-hardening)`, full context inline.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Roadmap node design:fix/document-primitives-round9 (ref gh-430) was retired 2026-06-11 and migrated here; duplicate capture TASK-36 archived in favor of this item.
<!-- SECTION:NOTES:END -->
