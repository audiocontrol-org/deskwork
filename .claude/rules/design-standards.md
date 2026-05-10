# Design Standards — Read & Update

The studio's design decisions are captured in **`DESIGN-STANDARDS.md`** (top-level — peer to `THESIS.md` and `DESKWORK-STATE-MACHINE.md`). That document is canonical. The proposal archive at **`docs/studio-design/`** records the durable history of accepted and rejected design decisions. This rule is the operational constraint that makes both stay canonical.

## The rule

1. **Read `DESIGN-STANDARDS.md` before any studio UI design or implementation work.** Including: drafting mockups, picking between mockup variants, writing CSS, modifying server-rendered HTML in `packages/studio/src/pages/`, modifying client TS in `plugins/deskwork-studio/public/src/`. Read every session — settled decisions in there override fresh ideas in conversation.

2. **Update `DESIGN-STANDARDS.md` whenever a design decision has global impact** — same commit, not a follow-up. "Global impact" = any of:
   - Changes the press-check vocabulary (colors, fonts, paper texture)
   - Alters how a class of element looks/behaves (stamps, chips, tiles, FABs, sheets)
   - Applies across multiple pages (filter strip removal, masthead structure, etc.)
   - Differs between desktop and mobile (mobile-only patterns, viewport gates)
   - Retires or replaces an existing pattern
   - Reframes a user-facing concept (e.g. "review state is retired")

3. **Mockups must comply with the standards document.** When drafting a mockup, the standards document is the spec for what may appear visually. If a mockup needs to violate the spec — to propose a CHANGE to the spec — say so explicitly: "this mockup proposes changing [section] of the standards." Otherwise, the mockup conforms.

4. **Settled decisions don't get re-proposed.** Decisions documented in the standards file are settled. Don't re-introduce a retired pattern in a new mockup. Don't include a removed surface as a "for reference" option. If a decision needs to be revisited, explicitly amend the standards document with reasoning.

## The proposal archive contract

Every accepted or rejected design proposal MUST be recorded under `docs/studio-design/`:

- **`docs/studio-design/ACCEPTED/<YYYY-MM-DD>-<slug>/`** — design decisions that landed
- **`docs/studio-design/REJECTED/<YYYY-MM-DD>-<slug>/`** — design directions explored and declined

Each entry directory contains:

1. **`brief.md`** — what the proposal was, why it was accepted or rejected, when (date + commit SHA), and a reference back to the motivating feature documentation (e.g. `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/`).
2. **A visual representation** — either:
   - An HTML/CSS file directly inside the entry directory (when the visual is unique to this proposal), OR
   - A relative-path reference in the brief pointing at an existing mockup file elsewhere in the tree (when the visual lives in `plugins/deskwork-studio/public/mockups/` or similar). **Never copy the file** — the single source of truth lives at one path; the brief points at it.

The archive is the durable record. The standards document captures the *outcome* of decisions; the archive captures the *exploration* — what was considered, what was rejected, why. Future sessions read both: the standards for "what is settled," the archive for "what was already considered and ruled out."

### When to file an archive entry

- **ACCEPTED:** every operator-approved design pick (mockup direction, affordance pattern, layout choice). File at the time of acceptance — same commit as the implementation or the mockup-pick commit.
- **REJECTED:** every alternative that the operator declined OR that was retired during exploration. File at the time of rejection. Even single-pass rejections (mockup variants the operator passed over) get an entry — they're the historical record that prevents re-proposal.

A design decision without an archive entry is undocumented, which means future sessions will re-litigate it.

## Why this rule exists

This rule was written after the 2026-05-09 dashboard-rebuild session in which the agent **repeatedly resurrected retired design patterns** because no durable record existed. Specifically:

- The "rubber-stamp conceit" was retired on mobile multiple times (rotated stamps → letterpress tags → filing-tabs all surface state-on-a-rectangle). Each retirement was implicit in conversation; nothing was written down. Each subsequent design pass (1c → row mockups → row revision) reintroduced a stamp variant in mobile mockups because the agent worked from session memory.
- The operator's framing, verbatim: *"If we have to relitigate basic design decisions, we'll NEVER make any headway."*
- The fix is not better memory; it's a written document the agent reads every session and updates whenever decisions are made — paired with a proposal archive that records the *exploration* alongside the *outcome*.

## How to apply

- The `session-start` skill reads `DESIGN-STANDARDS.md` as part of bootstrapping every session. If a session goal involves studio UI work, the standards must be top-of-mind.
- Before proposing mockups: check the standards doc AND scan `docs/studio-design/REJECTED/` for prior rejections of the direction. Don't draft mockups for retired patterns.
- When the operator approves a design decision: update the standards doc IN THE SAME COMMIT as the implementation (or in the design-mockup commit if implementation comes later) AND file an `ACCEPTED/<date>-<slug>/brief.md` entry. Add a one-line entry to the standards change log.
- When the operator rejects a design direction (or it gets retired during exploration): file a `REJECTED/<date>-<slug>/brief.md` entry capturing the rationale. Reference the visual (do not copy it).
- When in doubt about whether a decision has global impact: it does. Document it.

## Pre-implementation gate

Before writing markup or CSS for any new studio UI affordance:

1. **Read `DESIGN-STANDARDS.md`** — confirm what the mobile/desktop deltas are for the surface in question.
2. **Scan `docs/studio-design/REJECTED/`** — confirm the direction you're considering hasn't already been rejected.
3. **Cite the relevant section** in the implementation thread, the workplan, or the commit message: *"per Design Standards § Rubber-stamp conceit, mobile rows do not render state-stamp chrome; this implementation surfaces state via [alternative pattern instead]."*
4. **If the implementation requires deviating from the standards**, propose the standards update first. Get operator agreement. Land both changes (standards update + implementation) in the same commit.

## Anti-patterns to refuse

- Drafting a mockup that includes a pattern documented as retired (without the explicit "this mockup proposes changing the spec" framing).
- Implementing a feature without reading the standards document because "I remember what we decided."
- Updating implementation but not the standards document, even when the change affects the spec.
- Re-proposing a parked or rejected design as a fresh option in a later session.
- **Filing an ACCEPTED entry as a copy of the source mockup file instead of a reference.** The mockup file lives at one path; copying it duplicates the file and silently introduces drift when one copy is edited.
- **Skipping a REJECTED entry on the grounds that "it was just an alternative."** Single-pass rejections are the most important entries — they prevent the next session from re-proposing the same direction.

When in doubt: read the doc, then write code. Update the doc when decisions land. File the archive entry the same commit.
