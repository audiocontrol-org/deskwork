---
id: TASK-20
title: >-
  006 T052: keep roadmap-legacy.peg as the row-keyed example grammar (don't
  remove — it's the only row-keyed engine coverage)
status: To Do
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-11 00:55'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-435
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #435 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-435 is in frontmatter.

**Context:** 006 roadmap-protocol T052 says "Remove the legacy `roadmap-legacy.peg` once migration is green (no remaining row-keyed roadmap)." The live `ROADMAP.md` was migrated to the heading-keyed `roadmap` grammar in US6, so there is no remaining row-keyed *roadmap document*.

**Why it was NOT removed:** the document-model engine supports BOTH `heading` and `row` UnitMarkers, and `roadmap-legacy` is now the only row-keyed grammar in the repo. ~13 engine tests (archive-engine, curate-*, unarchive-*, etc.) and the `generality` "one engine, two document shapes" proof exercise the **row-keyed code path** through it (now via the committed fixture `tests/document-primitives/fixtures/row-roadmap.md`). Deleting `roadmap-legacy.peg` would silently drop all row-keyed engine coverage.

**Decision needed (operator owns):**
1. **Keep `roadmap-legacy.peg`** repurposed as the canonical row-keyed example grammar (current state — comment updated to say so). T052 is then superseded, not done.
2. **Replace it** with a purpose-named row-keyed test grammar (e.g. `grammars/row-example.peg`) and then delete `roadmap-legacy.peg`, repointing the row-keyed engine tests + the fixture.

Option 1 is the lower-churn, coverage-preserving call and is the current implemented state. Filing so the choice is explicit rather than a silently-skipped task. Surfaced during 006 US6.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Roadmap node design:gap/row-keyed-test-grammar (ref gh-435) was retired 2026-06-11 and migrated here; duplicate capture TASK-34 archived in favor of this item.
<!-- SECTION:NOTES:END -->
