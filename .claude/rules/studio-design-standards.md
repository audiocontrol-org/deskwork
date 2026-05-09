# Studio Design Standards — Read & Update

The studio's design decisions are captured in **`docs/studio-design-standards.md`**. That document is canonical. This rule is the operational constraint that makes it stay canonical.

## The rule

1. **Read `docs/studio-design-standards.md` before any studio UI design or implementation work.** Including: drafting mockups, picking between mockup variants, writing CSS, modifying server-rendered HTML in `packages/studio/src/pages/`, modifying client TS in `plugins/deskwork-studio/public/src/`. Read every session — settled decisions in there override fresh ideas in conversation.

2. **Update `docs/studio-design-standards.md` whenever a design decision has global impact** — same commit, not a follow-up. "Global impact" = any of:
   - Changes the press-check vocabulary (colors, fonts, paper texture)
   - Alters how a class of element looks/behaves (stamps, chips, tiles, FABs, sheets)
   - Applies across multiple pages (filter strip removal, masthead structure, etc.)
   - Differs between desktop and mobile (mobile-only patterns, viewport gates)
   - Retires or replaces an existing pattern
   - Reframes a user-facing concept (e.g. "review state is internal data")

3. **Mockups must comply with the standards document.** When drafting a mockup, the standards document is the spec for what may appear visually. If a mockup needs to violate the spec — to propose a CHANGE to the spec — say so explicitly: "this mockup proposes changing [section] of the standards." Otherwise, the mockup conforms.

4. **Settled decisions don't get re-proposed.** Decisions documented in the standards file are settled. Don't re-introduce a retired pattern in a new mockup. Don't include a removed surface as a "for reference" option. If a decision needs to be revisited, explicitly amend the standards document with reasoning.

## Why this rule exists

This rule was written after the 2026-05-09 dashboard-rebuild session in which the agent **repeatedly resurrected retired design patterns** because no durable record existed. Specifically:

- The "rubber-stamp conceit" was retired on mobile multiple times (rotated stamps → letterpress tags → filing-tabs all surface state-on-a-rectangle). Each retirement was implicit in conversation; nothing was written down. Each subsequent design pass (1c → row mockups → row revision) reintroduced a stamp variant in mobile mockups because the agent worked from session memory.
- The operator's framing, verbatim: *"If we have to relitigate basic design decisions, we'll NEVER make any headway."*
- The fix is not better memory; it's a written document the agent reads every session and updates whenever decisions are made.

## How to apply

- The `session-start` skill reads `docs/studio-design-standards.md` as part of bootstrapping every session. If a session goal involves studio UI work, the standards must be top-of-mind.
- Before proposing mockups: check the standards doc. Don't draft mockups for retired patterns.
- When the operator approves a design decision: update the standards doc IN THE SAME COMMIT as the implementation (or in the design-mockup commit if implementation comes later). Add a one-line entry to the change log.
- When in doubt about whether a decision has global impact: it does. Document it.

## Pre-implementation gate

Before writing markup or CSS for any new studio UI affordance:

1. **Read `docs/studio-design-standards.md`** — confirm what the mobile/desktop deltas are for the surface in question.
2. **Cite the relevant section** in the implementation thread, the workplan, or the commit message: *"per Studio Design Standards § Rubber-stamp conceit, mobile rows do not render state-stamp chrome; this implementation surfaces state via [alternative pattern instead]."*
3. **If the implementation requires deviating from the standards**, propose the standards update first. Get operator agreement. Land both changes (standards update + implementation) in the same commit.

## Anti-patterns to refuse

- Drafting a mockup that includes a pattern documented as retired (without the explicit "this mockup proposes changing the spec" framing).
- Implementing a feature without reading the standards document because "I remember what we decided."
- Updating implementation but not the standards document, even when the change affects the spec.
- Re-proposing a parked or rejected design as a fresh option in a later session.

When in doubt: read the doc, then write code. Update the doc when decisions land.
