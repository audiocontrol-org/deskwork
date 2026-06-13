# Engine-Rigor Requirements Checklist: design/document-primitives

**Purpose**: Unit-tests-for-the-spec across the four riskiest dimensions going into implementation — grammar/block-stream round-trip, identifier invariants, anti-coupling, and the fail-loud surface. Each item tests whether the *requirement* is complete/clear/consistent/measurable, not whether code works.
**Created**: 2026-06-07
**Feature**: [spec.md](../spec.md)

## Grammar & Block-Stream Round-Trip

- [x] CHK001 Is the set of markdown block kinds the engine must handle **enumerated exhaustively** (the spec names "headings, lists, tables, code, paragraphs" — are blockquotes, thematic breaks, HTML blocks, frontmatter, setext headings in or out)? [Completeness, Spec §FR-002]
- [x] CHK002 Is the **normalized one-token-per-line representation** specified at the requirement level — what structural facts each block contributes — or left entirely to implementation? [Clarity, Plan/research integration pattern]
- [x] CHK003 Is the **span granularity** unambiguous (whole-block line ranges; what a unit's span includes when its body spans multiple blocks)? [Clarity, Spec §FR-002]
- [x] CHK004 Is the required behavior specified when a block the grammar must span carries **no source line range** (`token.map` null — research risk #2)? [Gap, research.md]
- [x] CHK005 Is the requirement specified for a block kind the grammar does **not** account for — does it parse-fail, or is it ignored as opaque body? [Coverage, Spec §FR-003]
- [x] CHK006 Is **round-trip fidelity** stated as a verifiable requirement (archive→unarchive restores byte-for-byte / content-equivalent), and is "restores prior content" defined precisely enough to test? [Measurability, Spec §SC-007]
- [x] CHK007 Is the boundary between **structural fields the grammar matches** and **opaque prose body** defined clearly enough that two grammar authors would draw it the same way? [Clarity, Spec §FR-002]

## Identifier Invariants

- [x] CHK008 Is the **non-ordinal denylist** for v1 enumerated as a closed, testable set, or does "refinable" leave the v1 contract unspecified? [Ambiguity, Spec §FR-005]
- [x] CHK009 Is "**human-readable**" defined by objectively-checkable criteria, or only by exclusion (non-ordinal, no opaque token)? Is any length/charset bound specified? [Measurability, Spec §FR-005]
- [x] CHK010 Is identifier **uniqueness case-sensitivity** specified (is `Design/X` vs `design/x` a collision across document ∪ archive)? [Gap, Spec §FR-005]
- [x] CHK011 Is the required behavior specified when an operator **manually edits an identifier** (do cross-references / ledger entries become stale, and is that detected)? [Gap, Spec §FR-005/§FR-006]
- [x] CHK012 Is it specified **how the engine extracts the identifier** from a Unit (which grammar-captured field), independent of the identifier's shape? [Completeness, Spec §FR-005]
- [x] CHK013 Is "**identity decoupled from position**" stated as a checkable invariant for *both* reorder and archive/unarchive, with no exception? [Consistency, Spec §FR-005/§SC-004]
- [x] CHK014 Does the order-key requirement **demonstrably never reference the identifier**, and is that prohibition stated as an enforceable rule (not just guidance)? [Consistency, Spec §FR-004]

## Anti-Coupling Invariant (FR-011)

- [x] CHK015 Is "**the new surface**" the scan covers defined as a precise file/path set (which globs), so the machine check is reproducible? [Clarity, Spec §FR-011]
- [x] CHK016 Is the **match pattern** specified — exactly which strings count as a predecessor reference (the plugin name? the CLI binary name? the skill namespace? case variants)? [Ambiguity, Spec §FR-011]
- [x] CHK017 Is it explicitly specified that **specs/, this design doc, and provenance notes are EXCLUDED** from the scan (they legitimately name the predecessor)? [Consistency, Spec §FR-011/Assumptions]
- [x] CHK018 Is the gate's **failure behavior** specified (non-zero exit, release-blocking) at the requirement level, not just the plan? [Completeness, Spec §FR-011]

## Fail-Loud Surface (FR-010)

- [x] CHK019 Are **all** failure modes enumerated with the zero-writes guarantee, and is the list consistent between FR-010, the edge cases, and SC-003? [Consistency, Spec §FR-010/§SC-003]
- [x] CHK020 Is "**zero writes**" defined precisely — does it preclude creating an empty/partial archive file or a partial document mutation? [Clarity, Spec §FR-010]
- [x] CHK021 Is **`--apply` atomicity** specified — if a write fails partway (e.g., 3 units selected, failure on the 2nd), is the operation all-or-nothing or incremental? [Gap, Recovery, Spec §FR-006/§FR-009]
- [x] CHK022 Is the **error-message content requirement** measurable ("actionable" / "names the offending span") rather than subjective? [Measurability, Spec §FR-003/§FR-010]
- [x] CHK023 Is the distinction between the **deferred-but-OK** up-to-date skip and a genuine failure stated unambiguously (the one allowed non-failing skip)? [Clarity, Spec §FR-008/§FR-010]

## Proof Documents, Dependencies & Assumptions

- [x] CHK024 Are the **full status vocabularies** (not just the terminal subset via "include …") specified for each proof grammar — roadmap and design-inbox? [Completeness, Spec §FR-013, contracts/grammar-declaration]
- [x] CHK025 Is the **content-migration** requirement for lifting the existing design-inbox + creating the roadmap stated with a no-content-loss acceptance criterion? [Gap, Spec §FR-013]
- [x] CHK026 Is behavior under **concurrent invocation** of two primitives on the same document addressed, or explicitly declared out of scope? [Coverage, Gap]
- [x] CHK027 Is the **markdown-parser dependency assumption** (a standard block parser yields blocks with line positions) recorded and validated, not assumed? [Assumption, research.md]

## Notes

- Check items off as resolved: `[x]`. An unchecked item is a spec gap to close (or consciously defer) before `/speckit-tasks`.
- Items marked `[Gap]` flag requirements that appear **absent**; `[Ambiguity]`/`[Conflict]` flag requirements that exist but are imprecise or inconsistent.
- This checklist tests the requirements, not the implementation — it is complete when every item is either satisfied by spec text or consciously dispositioned.
