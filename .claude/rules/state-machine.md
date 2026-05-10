# State Machine — Read & Conform

The deskwork state machine is captured in **`DESKWORK-STATE-MACHINE.md`** (top-level — peer to `THESIS.md` and `DESIGN-STANDARDS.md`). That document is canonical. This rule is the operational constraint that makes the spec stay canonical.

## The rule

1. **Read `DESKWORK-STATE-MACHINE.md` before any work that touches stage / verb / state semantics.** Including: editing the entry schema; editing iterate / approve / cancel / publish CLI commands; editing the corresponding skills; rendering stage labels or verbs in the studio; writing journal-event types; writing tests that assert post-transition state. Read every session — settled commandments override fresh ideas in conversation.

2. **Deviations require updating the spec first.** If a code change requires behavior the spec doesn't permit (e.g. surfacing a new state-like signal, gating a verb on a non-stage attribute, adding a new stage), propose the spec amendment in the PR / commit message AND update `DESKWORK-STATE-MACHINE.md` in the same commit as the implementation. Don't ship code that contradicts the spec; either the spec is wrong (update it) or the code is wrong (fix it).

3. **Cite the spec section when changing stage / verb behavior.** Commit messages that touch stage transitions, verb routing, or schema invariants must reference the relevant Commandment (`Commandment II — verbs are universal`, `Commandment III — review state is retired`, etc.) so the reviewer can verify against the spec. *"Per DESKWORK-STATE-MACHINE.md Commandment X, ..."* in the commit body is the canonical pattern.

4. **`reviewState` is RETIRED.** Per Commandment III. New code does NOT write `reviewState` to sidecars. The schema's `ReviewState` type exists only as a back-compat read-side artifact for legacy sidecars on disk; the doctor migration is responsible for cleaning legacy data. Any code that *writes* `reviewState` is a violation.

5. **Verbs are universal and stage-gated only.** Per Commandment II. `/deskwork:iterate`, `/deskwork:approve`, `/deskwork:cancel` operate on every linear-pipeline stage with stage-specific behavior; verb availability is gated on the entry's `currentStage`, never on `reviewState` or any other retired axis.

6. **Mockups and UI surfaces must comply.** Per Commandment VIII. A mockup that surfaces `reviewState` labels ("IN REVIEW", "ITERATING", "APPROVED"), gates a verb on review state, or otherwise contradicts the spec is misleading and is to be retired. The companion design-standards rule (`.claude/rules/design-standards.md`) covers the design-side enforcement; this rule covers the code-side.

## Why this rule exists

This rule was specced as Step 0.1.6 of the studio-mobile-first feature workplan but was never written — the 2026-05-09 implementation audit caught the gap. Without a written rule, the canonical spec drifted from live code: `iterate.ts` was still writing `reviewState: 'in-review'` even though `DESIGN-STANDARDS.md` said "new code does not write it." That contradiction was the failure mode this rule prevents.

The pattern is the same as `.claude/rules/design-standards.md` for design decisions: a holy document at the top level + an operational rule that requires the holy document be read before making semantic-level changes + a written commitment that the holy document is the source of truth, not session memory.

## How to apply

- The `session-start` skill reads `DESKWORK-STATE-MACHINE.md` as part of bootstrapping every session (per Phase 0 of the studio-mobile-first feature work).
- Before editing stage / verb / state semantics: read the relevant section(s) of `DESKWORK-STATE-MACHINE.md`. Don't rely on session memory — the spec is the source of truth.
- When making a change that touches stage transitions, verb routing, or schema invariants: cite the relevant Commandment in the commit message body.
- When the spec is wrong or incomplete: update it (via the deskwork ingest + iterate flow if it's still ingested as an entry, or via a direct edit + commit if not). Do not ship code that contradicts an unupdated spec.
- When in doubt about whether a change is spec-touching: it probably is. Read the spec, cite the section.

## Pre-implementation gate

Before writing code that touches stage / verb / state:

1. **Read `DESKWORK-STATE-MACHINE.md`** — confirm what the spec says about the stage / verb / transition you're changing.
2. **Cite the relevant Commandment** in the implementation thread, the workplan, or the commit message: *"per DESKWORK-STATE-MACHINE.md Commandment II (verbs are universal and stage-gated), this implementation gates the iterate verb on `stagePermitsEdits(stage)` rather than on `reviewState`."*
3. **If the change requires deviating from the spec**, update the spec first. Get operator agreement. Land both changes (spec update + implementation) in the same commit.

## Anti-patterns to refuse

- Writing `reviewState` to a sidecar on any new code path.
- Gating a verb on `reviewState`, `iteration`, or any other retired-or-bookkeeping field.
- Adding a new stage outside the eight (Ideas / Planned / Outlining / Drafting / Final / Published / Blocked / Cancelled) without amending `DESKWORK-STATE-MACHINE.md` first.
- Surfacing `reviewState` labels ("IN REVIEW" / "ITERATING" / "APPROVED") on any user-facing surface.
- Renaming "Final" to "Review" or vice-versa in prose, schema, or fixtures (the legacy `Review` stage was collapsed into `Drafting`; "Final" is the post-`Drafting` stage in the new model).
- Implementing a feature touching state semantics without reading the spec because "I remember what it says."
- Updating implementation but not the spec, even when the change affects what the spec describes.

When in doubt: read the spec, then write code. Update the spec when the model changes. Cite the Commandment in the commit message.
