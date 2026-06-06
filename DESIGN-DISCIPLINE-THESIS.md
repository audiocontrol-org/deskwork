---
title: Deskwork design-discipline thesis
description: Why UI-surface changes go wrong, the hard-won discipline that fixes them (lo-fi wireframes for UX intent · a settled design language · /frontend-design as the referee that judges a screenshot against the spirit of the wireframe and the letter of the design language), and the north star of productizing that discipline as a portable deskwork plugin. Opens with the lifecycle philosophy that motivates it all (the sibling stack-control thesis — "policy enforced by a process, not a rule"; engineer the crib; stochastic correctness via cross-model audit-barrage; scope-discovery). Core commitment — never roll your own visual verification; orchestrate /frontend-design. Read before any UI-surface work and before defining the design-control plugin.
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

## Why a discipline at all — the lifecycle philosophy (the WHY beneath this thesis)

Read this section first; it motivates everything below and everything the
`design-control` plugin does. design-control is one instance of a general stance,
articulated for the sibling **stack-control** plugin and its founding essay — *["The
lifecycle, and why agents need one"](https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/)*.
The stance: coding agents are extraordinarily capable and structurally unreliable **at the
same time** — "insane, hyperintelligent toddlers." You do not get good outcomes by
lecturing the agent into compliance (it has no internal governor and a thirty-second
memory); you get them by **engineering the environment so the bad outcome can't happen** —
"engineering the crib," not raising your voice when the toddler falls. The load-bearing
sentence, which every design decision in this plugin should be checked against:

> **Policy embedded in a rule is far weaker than policy enforced by a process.**

**The failure modes this stance is built against** (all observed in real agent work, none
hypothetical):

- **Memory loss** — context compaction wipes decisions. Cure: durable on-disk
  source-of-truth (this thesis, the PRD, the workplan, the audit-log), never conversation
  memory.
- **Attention drift** — agents abandon tasks mid-completion and declare victory early.
  Cure: automated rituals + gates that fire whether or not the agent remembers them.
- **Test theater** — "green checkmarks that proved nothing a human cared about." Cure:
  verification that *looks* at the real surface (the design-control referee) and
  adversarial validation that actively tries to *break* the claim.
- **Quiet failures** — the most dangerous: unannounced scope-deferral ("an agent so eager
  to keep its diffs small that it would amputate the actual requirement"), code
  duplication, and missed-update (changed *some* of the code that needed changing, skipped
  the rest). Cure: scope-discovery scans + cross-model audit.

**The mechanisms that turn policy into a process** (these are the dw-lifecycle capabilities
this plugin is built on, not bespoke inventions):

- **Stochastic correctness.** A single agent is an unreliable narrator; **pit multiple
  independent models against the same work and they correct each other.** This is the
  **audit-barrage** — `claude` + `codex` + `gemini` fired in parallel at every diff;
  **cross-model agreement is the genuine-defect signal**, single-model noise washes out.
  design-control uses it not only to review its own code but as the **adversarial
  validation engine for the lo-fi lint** — a *process*, not a hand-authored fixture set the
  lint author imagines (the author shares the lint's blind spots; independent models do
  not).
- **Scope-discovery.** Automated clone / anti-pattern / coverage scans surface duplicated
  code and unchanged-elements-that-should-have-changed, replacing the agent's unreliable
  manual hunting. design-control registers each discovered lint-leakage class here so
  coverage is tracked and drift is caught — the catalog, not scattered tests.
- **The lifecycle.** PRD + workplan on disk; path-scoped rules that load only where
  relevant; skills for repeatable procedures; automated rituals at lifecycle waypoints. (*"A
  rule in a big document is a rule the agent doesn't follow"* — the essay's author cut a
  773-line rulebook to 198 by turning policy into process.)
- **The all-caps tell.** *"Every time I caught myself typing in all caps, it meant the same
  thing: I had stopped solving the problem and started yelling at it."* An all-caps moment
  is the signal to **re-architect the process, not escalate the lecture.**

**How this thesis specializes the philosophy.** Everything below is *"engineer the crib"*
applied to UX/UI surface changes. **"Never roll your own visual verification — orchestrate
`/frontend-design`"** is *policy enforced by a process*. The lo-fi wireframe's inverted-teeth
lint is a *crib*: the bad outcome — a polished artifact masquerading as a wireframe — is
made structurally impossible, not policed after the fact. **"Inventory before iterating"**
and **"look, don't deduce"** replace unreliable agent attention with a ritual. And the lint's
own correctness is established by the **audit-barrage + scope-discovery**, because a lint
validated only by its author's imagined failure cases inherits its author's blind spots —
exactly what stochastic correctness exists to defeat.

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

- **Lifecycle philosophy (the motivating frame):** the sibling **stack-control** plugin and
  its founding essay *"The lifecycle, and why agents need one"* —
  <https://stackcontrol.org/blog/the-lifecycle-and-why-agents-need-one/>. Source of "policy
  enforced by a process, not a rule," "engineer the crib," stochastic correctness
  (cross-model audit-barrage), scope-discovery, and the all-caps tell. design-control is the
  UX/UI-surface specialization of that general stance; stack-control is its sibling.
- Session audit (verbatim quotes, decision trail, rejected alternatives):
  `docs/superpowers/specs/audiocontrol-uxui-discipline-session-audit.md`.
- Infrastructure inventories:
  `docs/superpowers/specs/audiocontrol-editor-ui-tooling-inventory.md` and
  `audiocontrol-redesign-infra-inventory.md`.
- Source repo (in-flight): `audiocontrol-org/audiocontrol`, `feature/editor-ux-refinement`
  — `design-mockup-pipeline.md`, `docs/wireframe-kit/`, `tools/check-mockup-lofi.sh`.
- **Converged design:** `docs/superpowers/specs/2026-06-04-design-control-design.md` — reached
  via **11 adversarial audit-barrage rounds** (claude + codex in parallel) run until **two
  consecutive zero-HIGH rounds** (the operator's stop criterion). The barrage killed a
  roll-your-own visual-regression engine (rounds 1–2: exact-hash unsound → determinism is a
  research project, not a feature → the "never roll your own; orchestrate `/frontend-design`"
  commitment), then hardened the result: the **v1-scaffold / v1-referee-preview split** (scaffold
  ships with zero referee dependency), the **referee as advisory evidence that must earn trust via
  an adversarial falsification set** (numeric drift delegated to an existing pixel-diff tool on
  DOM-locator stable regions; the `ui-verification.md` occluded-chip miss cited against itself),
  a **capture-config identity hash** (non-secret auth/profile in, secret tokens out), and the
  **lint reshaped to allowlists on both the element/attribute and codepoint axes** (denylists are
  whack-a-mole; allowlists close the polish-leakage class). Per-round records:
  `.dw-lifecycle/scope-discovery/audit-runs/*design-control*`.
- Feature definition + kickoff: issue #424; `/tmp/feature-definition-design-control.md`.
- Related deskwork docs: `THESIS.md`, `DESIGN-STANDARDS.md`,
  `.claude/rules/ui-verification.md`, `.claude/rules/design-standards.md`,
  `.claude/rules/enforcement-lives-in-skills.md`.
