---
title: Deskwork design-discipline thesis
description: Why UI-surface changes go wrong, the hard-won discipline that fixes them (lo-fi wireframes for UX intent · a settled design language · /frontend-design as the referee that judges a screenshot against the spirit of the wireframe and the letter of the design language), and the north star of productizing that discipline as a portable deskwork plugin. Core commitment — never roll your own visual verification; orchestrate /frontend-design. Read before any UI-surface work and before defining the design-control plugin.
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

`/frontend-design` (the Claude skill) is the single proven engine threaded through all three
concerns; the discipline is the two durable reference artifacts it works against — the
wireframe (UX *spirit*) and the design-language spec (visual *letter*).

| Concern | Owns | Reference artifact | `/frontend-design`'s role |
|---|---|---|---|
| **1. UX (spirit)** | *how it's organized & flows* | **lo-fi wireframe** — deliberately un-styled, can't be mistaken for implementation guidance | collaborates on working out the UX |
| **2. Design language (letter)** | *what it looks like* | **design-language spec** (markdown; later a living gallery from real components) | translates wireframe intent into the project's local design language, reduced to practice |
| **3. Review (referee)** | *did the realized thing honor both?* | a **screenshot** of the real surface (existing tool, e.g. Playwright) | referees: does it adhere to the *spirit* of the wireframe AND the *letter* of the design-language spec? |

**Inverted teeth.** The lo-fi wireframe is kept *deliberately unlike* the product so it can't
be read as "build exactly this": a structural lint requires the WIREFRAME banner, allows only
the shared sketch kit, and forbids the cheap leakage vectors (inline `style=`, `<style>`,
`<script>`, `data:` URIs). It's a leakage-blocker, not proof of "perceptually unlike" — the
banner + human/`/frontend-design` judgment is the real gate.

**Verification is judgment, not a pixel engine.** Two adversarial audit rounds established that
a roll-your-own visual-regression engine (exact-hash / perceptual-diff / pinned-container
determinism) is a research project, not a feature. The discipline instead *looks* at a
screenshot with specific criteria via `/frontend-design`. If pixel-level regression is ever
genuinely needed, reach for an **existing** tool (Playwright `toHaveScreenshot`, Percy, Argos,
Chromatic) — **never hand-rolled.**

## The thesis (the architectural commitments)

1. **Model the change; don't dictate the implementation.** A design exploration's job is
   to settle *structure, flow, and hierarchy* — not pixels. Make the artifact physically
   incapable of being read as "build it exactly like this."
2. **Never roll your own visual verification — `/frontend-design` is the engine.** It is
   the single proven tool for UX, for translating intent into the local design language,
   and for the review referee. Orchestrate it; don't reinvent it. Pixel regression, if ever
   needed, uses an *existing* tool — never hand-rolled. (This is the hardest-won commitment;
   two audit rounds and the operator's experience both point here.)
3. **Two reference artifacts: spirit and letter.** The wireframe carries the UX *spirit*;
   the design-language spec carries the visual *letter*. The referee judges the realized
   screenshot against *both*. Visual identity lives in the design language (and later a
   living gallery from real components), never inside a wireframe.
4. **Inverted teeth over drift policing.** Keep the exploration *deliberately unlike* the
   product (a leakage lint), rather than building machinery to police a resemblance that
   shouldn't exist.
5. **Inventory before iterating.** A same-class surface audit at the start of UI work
   beats N screenshot-driven point fixes. Widen every complaint into "find every instance
   of this class."
6. **Look, don't deduce; prove, don't assert.** Verification means *looking* at the exact
   surface (a real screenshot) against specific criteria — not deducing from code. A passing
   test suite is a prerequisite, not a substitute, for a visual claim.

These specialize deskwork's existing thesis (`THESIS.md`: the agent is the primary tool;
skills do the work) to the UI domain, and they generalize deskwork's existing
`.claude/rules/ui-verification.md` and `.claude/rules/design-standards.md` from "rules a
maintainer follows" into "tooling + skills an adopter installs."

## North star — productize the discipline as a portable plugin

Today the discipline is non-portable: an adopter who installs deskwork does **not** get
it. Per deskwork's own principle (*the discipline does not exist for an adopter who
installs the plugin and follows the README*), a discipline that lives in one repo's
`tools/` + docs + a feature branch effectively doesn't exist for anyone else.

The north star is a **`design-control` plugin** — a *discipline/orchestration* plugin, not a
tooling plugin — that travels with `claude plugin install` and gives any UI project the loop
by **orchestrating `/frontend-design`** (rolling no visual engine of its own):

- **Lo-fi wireframe kit + inverted-teeth lint:** a portable `sketch-kit.css` + `.sk-*`
  vocabulary, a skill to author a wireframe (with `/frontend-design` working out the UX), and
  a `check-mockup-lofi` leakage lint (CLI verb + skill-body enforcement, never a git hook —
  per `.claude/rules/enforcement-lives-in-skills.md`).
- **Design-language spec convention:** a markdown schema + a skill that uses `/frontend-design`
  to translate approved wireframe intent into the project's local design language. (The
  *living gallery* rendered from real components is phase 2.)
- **Review-referee skill:** capture a screenshot with an *existing* tool (Playwright; deskwork
  already uses it) at the required viewports, then invoke `/frontend-design` as referee —
  spirit of the wireframe + letter of the design-language spec.
- **Governance:** design-control ships its own ACCEPTED/REJECTED exploration archive (briefs +
  lo-fi wireframe visual). deskwork's existing `DESIGN-STANDARDS.md` + `docs/studio-design/`
  adopting it is a named, separate migration.

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
  — `design-mockup-pipeline.md`, `docs/wireframe-kit/`, `tools/check-mockup-lofi.sh`.
- Adversarial design audits that killed the roll-your-own visual-regression engine (two rounds,
  cross-model): `.dw-lifecycle/scope-discovery/audit-runs/*design-control*`. Round 1 found the
  exact-hash foundation unsound; round 2 found the determinism subsystem is a research project,
  not a feature — leading to the "never roll your own; orchestrate `/frontend-design`" commitment.
- Feature definition (kickoff): issue #424; `/tmp/feature-definition-design-control.md`.
- Related deskwork docs: `THESIS.md`, `DESIGN-STANDARDS.md`,
  `.claude/rules/ui-verification.md`, `.claude/rules/design-standards.md`,
  `.claude/rules/enforcement-lives-in-skills.md`.
