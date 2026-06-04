---
title: Deskwork design-discipline thesis
description: Why UI-surface changes go wrong, the hard-won discipline that fixes them (lo-fi wireframes that model the change · a settled design language · device-free visual verification), and the north star of productizing that discipline as a portable deskwork plugin. Read before any UI-surface work and before defining the design-control plugin.
deskwork:
  doc: thesis
  status: load-bearing
  id: cd56596d-a33c-408a-857c-e4a1c58a8c94
---

# Deskwork design-discipline thesis

Read this before any studio UI work, and before defining the plugin that productizes
this discipline: **`design-control`** (named for the `*control` family —
audiocontrol, editorialcontrol, stackcontrol; scope finalized at `/dw-lifecycle:define`).

This document exists because a discipline for changing UI surfaces *sanely* was earned
the hard way in a sibling project (audiocontrol), at real cost — a multi-day,
screenshot-by-screenshot correction loop and an angry session — and that discipline is
currently trapped there: scattered across one repo's docs, tools, and a half-shipped
feature branch. The thesis below tells the story uncovered by a session-transcript audit
(`docs/superpowers/specs/audiocontrol-uxui-discipline-session-audit.md`), states the
discipline as architectural commitments, and names the north star: **reduce the
discipline to practice as a portable, reusable deskwork plugin** so any adopter gets it
from `claude plugin install`, not from re-living the pain.

## The canonical source — the story

The discipline came in two acts. The full evidence (verbatim operator quotes, timestamps,
the rejected alternatives) is in the audit; this is the load-bearing summary.

### Act I — the pain: UI work done blind degenerates into a screenshot loop

The Roland S-550 editor redesign (2026-05-15 → 05-20) became a brute-force correction
loop. The repo's own transcript analysis names the failure mode exactly:

> *"The agent never performed an upfront surface-inventory pass at any session start, and
> it never widened a single complaint into a same-class audit. Every commit was triggered
> by a screenshot the operator had just taken in the running app."*

~32 distinct UI surfaces/inconsistencies entered scope across the redesign tail. **Zero**
were discovered proactively by the agent — every one was operator-caught by pasting a
screenshot. An O(1) read-window applied to an O(N) problem. The operator's coaching is the
through-line:

> *"You will IMMEDIATELY see that what you shipped is garbage… Don't make me take
> snapshots for you when you are perfectly capable of doing it yourself."*
>
> *"You are trying to deduce the problem instead of looking."*
>
> *"How can we prevent this bullshit from happening again?"*
>
> *"BEFORE you declare victory, you MUST PROVE that it finds the problem."*

Act I produced the first countermeasures — a CSS-duplication gate plus its adversarial
validator, and the "self-screenshot / look-don't-deduce / prove-don't-assert" rule
(deskwork already carries the last as `.claude/rules/ui-verification.md`).

### Act II — the reframe: mockups were doing double duty

A ~25-minute operator-driven brainstorm (2026-06-01) diagnosed the *root cause*. Hi-fi
mockups specified **UX** (layout/flow/hierarchy) **and visual design**
(palette/type/components) in a single hand-authored artifact. Two failure modes follow:

1. **Staleness mistaken for intent.** A mockup that *looks* like the product carries
   stale or accidental detail (a drifted color, a leftover control) that gets implemented
   literally, as if deliberate.
2. **No durable home for visual design.** Identity lives *inside* mockups, so it's
   scattered across memories, CSS comments, and one-off pages that rot.

The decision trail is instructive — the operator overrode the agent's instinct twice:

- Agent's first instinct: a lightweight mockup "brief convention."
- Operator overrides **up**: *"Let's put teeth in everything. Heavy drift gate."*
- Operator overrides **sideways** (the pivot): *"deliberately lo-fi mockups so the markups
  aren't supposed to be pixel-accurate and can't be mistaken for actual style and
  components, but are instead a way to test UX."* — which **dissolves** the drift gate.
- *"Hand-drawn, like a talented illustrator with a Sharpie."*
- Operator adds the missing leg: *"a stage separate from mockups that formally defines the
  design language for each editor… backfill the visual design part that we are cleaving
  from the mockup."*

The **rejected alternative is as important as the accepted one**: a high-fidelity mockup
policed by a heavy drift gate was rejected as *"machinery that exists only to police a
resemblance that shouldn't exist."*

## The discipline — three stages, each owns one concern

Visual truth is **always anchored in real components, never in a static artifact that can
rot.** Markdown captures intent; generated artifacts capture pixels.

| Stage | Owns | Artifact | Anti-staleness mechanism |
|---|---|---|---|
| **1. Design language** | *what it looks like* | markdown spec + **living gallery rendered from real components** | gallery is generated from real components → cannot drift from as-built |
| **2. UX sketch** | *how it's organized & flows* | **lo-fi hand-drawn wireframe** | deliberately un-styled → cannot be mistaken for visual direction |
| **3. Implementation + review** | *the realized thing* | real components, shot **device-free** | the screenshot is of the actual product |

**Inverted teeth.** Instead of a gate that checks a mockup *matches* the product (the
rejected heavy machinery), a gate checks a mockup is *deliberately unlike* it: exploration
HTML may link **only** the shared sketch kit — no design-system CSS, no `@import`, no
remote resources — so it is *structurally incapable of impersonating the product*.
Cheap to enforce (ban the import paths, not substring-grep tokens), and it removes the
failure mode rather than policing it.

**Device-free capture** is the load-bearing tool: launch a real surface with no
hardware/live data, feed it captured/fixture data, shoot a deterministic PNG (explicit
ready hook + `document.fonts.ready`, no sleeps, pinned viewport + device-scale-factor).
One engine serves in-loop review, the living gallery, and regression baselines
(exact-hash compare; re-bless on intentional change).

## The thesis (the architectural commitments)

1. **Model the change; don't dictate the implementation.** A design exploration's job is
   to settle *structure, flow, and hierarchy* — not pixels. Make the artifact physically
   incapable of being read as "build it exactly like this."
2. **Anchor visual truth in real components.** Never in a static page that rots. The
   living gallery and device-free screenshots are the canonical pixels; markdown holds
   intent and rationale.
3. **Inverted teeth over drift policing.** Prefer the design shape that *removes* a
   failure mode to the gate that *catches* it. A gate that forbids resemblance beats a
   gate that polices it.
4. **Inventory before iterating.** A same-class surface audit at the start of UI work
   beats N screenshot-driven point fixes. Widen every complaint into "find every instance
   of this class."
5. **Look, don't deduce; prove, don't assert.** Self-screenshot the exact surface, measure
   before/after, show the delta. A passing test suite is a prerequisite, not a substitute,
   for a visual claim.

These specialize deskwork's existing thesis (`THESIS.md`: the agent is the primary tool;
skills do the work) to the UI domain, and they generalize deskwork's existing
`.claude/rules/ui-verification.md` and `.claude/rules/design-standards.md` from "rules a
maintainer follows" into "tooling + skills an adopter installs."

## North star — productize the discipline as a portable plugin

Today the discipline is non-portable: an adopter who installs deskwork does **not** get
it. Per deskwork's own principle (*the discipline does not exist for an adopter who
installs the plugin and follows the README*), a discipline that lives in one repo's
`tools/` + docs + a feature branch effectively doesn't exist for anyone else.

The north star is a **`design-control` plugin** that travels with `claude plugin install` and
gives any markdown/UI project the full loop:

- **Stage 1 — design language:** a skill to scaffold + maintain a per-surface
  design-language spec, and to generate a **living styleguide gallery** from the project's
  real components.
- **Stage 2 — lo-fi wireframe kit + inverted-teeth gate:** a portable `sketch-kit.css` +
  `.sk-*` vocabulary, a skill to author a wireframe for a proposed change, and a
  `check-mockup-lofi`-style gate (CLI verb + skill-body enforcement, never a git hook —
  per `.claude/rules/enforcement-lives-in-skills.md`) that keeps explorations structurally
  lo-fi.
- **Stage 3 — device-free capture + visual baselines:** a portable capture engine
  (fixture-rendered surfaces → deterministic PNGs) plus the `visual-compare` /
  `visual-update-baseline` pair (exact-hash regression + re-bless), framework-agnostic
  enough for deskwork's server-rendered Hono studio *and* an adopter's Astro/Next/React
  site.
- **Governance:** the ACCEPTED/REJECTED exploration archive (deskwork already has the
  shape in `DESIGN-STANDARDS.md` + `docs/studio-design/`) extended so the *visual* in each
  entry is a lo-fi wireframe, never a hi-fi mockup.

The immediate forcing function is real: the sites→lanes clean break requires redesigning
the studio's content-browser and scrapbook surfaces. That redesign is the **first
dogfood** of the loop — and the reason to build the loop now rather than hand-roll the
redesign and repeat Act I.

## Provenance

- Session audit (verbatim quotes, decision trail, rejected alternatives):
  `docs/superpowers/specs/audiocontrol-uxui-discipline-session-audit.md`.
- Infrastructure inventories:
  `docs/superpowers/specs/audiocontrol-editor-ui-tooling-inventory.md` and
  `audiocontrol-redesign-infra-inventory.md`.
- Source repo (in-flight): `audiocontrol-org/audiocontrol`, `feature/editor-ux-refinement`
  — `design-mockup-pipeline.md`, `docs/wireframe-kit/`, `tools/check-mockup-lofi.sh`,
  `scripts/visual-compare.mjs`, `scripts/visual-update-baseline.mjs`.
- Related deskwork docs: `THESIS.md`, `DESIGN-STANDARDS.md`,
  `.claude/rules/ui-verification.md`, `.claude/rules/design-standards.md`,
  `.claude/rules/enforcement-lives-in-skills.md`.
