# Audit — the Claude sessions that produced audiocontrol's UX/UI discipline

*Audited 2026-06-04 for the deskwork studio sites→lanes redesign. Sources: Claude Code
session transcripts under `~/.claude/projects/` for `audiocontrol-s550-support` and
`audiocontrol-editor-ux-refinement`, plus the repo's own transcript analysis
`docs/analysis/s550-redesign-scope-discovery.md`. Per-session sub-audits written to
`/tmp/ux-audit.adl6AH/AUDIT-s550.md` and `AUDIT-uxr.md`.*

## TL;DR

The discipline was forged in **two acts**:

1. **The pain (s550 editor redesign, 2026-05-15 → 05-20).** A multi-day UI redesign
   that became a brute-force, screenshot-by-screenshot correction loop. ~32 distinct UI
   surfaces/inconsistencies entered scope; **zero were discovered proactively by the
   agent** — every one was operator-caught by pasting a screenshot. This produced the
   *symptoms* and the operator's "how do we prevent this bullshit from happening again?"
   demand.

2. **The reframe (editor-ux-refinement brainstorm, 2026-06-01, ~23:06–23:29).** A single
   ~25-minute operator-driven design session that diagnosed the *root cause* (mockups
   doing double duty) and produced the **three-stage pipeline + inverted-teeth gate**.

The discipline is not a style preference — it's the scar tissue from a specific,
documented failure.

---

## Act I — the pain (s550-support sessions)

### The failure mode, named precisely (by the repo's own analysis)

> "The agent never performed an upfront surface-inventory pass at any session start, and
> it never widened a single complaint into a same-class audit. **Every commit was
> triggered by a screenshot the operator had just taken in the running app.**" —
> `s550-redesign-scope-discovery.md §1`

An O(1) read-window applied to an O(N) problem. Of 121 + 67 `browser_navigate` calls
across two days, **none landed on a route the operator hadn't just pointed at.**

### Operator framing (verbatim, with timestamps)

- **2026-05-17 20:45** — opens by declaring the process broken: *"I don't think the
  process we've been following so far works, so I'm going to brute force it… I don't want
  to hear any bullshit about things being out of scope."*
- **2026-05-19 21:30** — *"The very first thing you should do [is] take snapshots with
  playwright. You will IMMEDIATELY see that what you shipped is garbage. Start there.
  Don't make me take snapshots for you when you are perfectly capable of doing it
  yourself."*
- **2026-05-18 07:15** — *"I don't think you are actually looking with a browser at how it
  renders, otherwise you'd see the problem. You are trying to deduce the problem instead
  of looking."*
- **2026-05-20 04:38** — *"the height of each list item is STILL slightly different across
  the patches and tones pages… I feel like you are either not looking hard enough or
  deliberately ignoring me."*
- **2026-05-19 22:51** — *"USE DRY PRINCIPLES… STOP FLOODING THIS PROJECT WITH
  SEWAGE!!!!!"* (this message became the seed of the CLAUDE.md DRY prelude.)
- **2026-05-19 21:47** — the pivotal process question: *"You programmed the entire thing
  start to finish. **How can we prevent this bullshit from happening again?**"*
- **2026-05-19 21:49** — the proof-not-assertion demand: *"BEFORE you declare victory, you
  MUST PROVE that it finds the problem and that you didn't just write a bunch more
  bullshit that pretends to fix the first bullshit."*

### Iteration cost (evidence of brutality)

- Control-panel density: ~6 oscillating rounds (overshoot/undershoot).
- Patches/Tones pixel-parity (DRY): ~8+ rounds spanning two sessions; one full revert
  (*"You completely broke the UI. It is absolutely unusable."* 05-19 21:37).
- Every page-specific control survey was **operator-initiated** — the agent never
  generalized "this control is wrong on Tones" into "audit the same controls on Patches."

### What Act I produced (immediate countermeasures)

- `check-css-duplication.ts` pre-commit gate **+** its adversarial validator
  `check-css-duplication.validate.ts` (the "prove it catches the bug" pattern).
- The "self-screenshot with Playwright; look, don't deduce; prove, don't assert" rule.
- The `s550-redesign-scope-discovery.md` post-mortem itself.
- The ACCEPTED/REJECTED design-decision archive (operator had to stop mid-flow and port
  it **from deskwork** — note the lineage runs both directions).

---

## Act II — the reframe (editor-ux-refinement brainstorm, 2026-06-01)

The entire design derivation happened in ~23 minutes, operator-driven at every inflection.

### Decision trail (each turn an operator override)

1. **Agent's first instinct:** a lightweight "brief convention" for mockups.
2. **Operator overrides UP (23:11):** *"ok, let me revise my answers. Let's put teeth in
   everything. Heavy drift gate, checks."* → a gate that compares mockup to as-built and
   dispositions every divergence.
3. **Operator overrides SIDEWAYS (23:15) — the pivot:** *"Another approach we could take
   is to use deliberately lo-fi mockups so the markups aren't supposed to be pixel-accurate
   and can't be mistaken for actual style and components, but are instead a way to test
   UX."* → this **dissolves** the drift gate (you don't police a resemblance that
   shouldn't exist).
4. **Operator fixes the aesthetic (23:22):** *"Hand-drawn, like a talented illustrator
   with a Sharpie."* → physically incapable of being mistaken for shippable UI.
5. **Operator adds the missing leg (23:26):** *"We need to add an extra step… a stage
   separate from mockups that formally defines the design language for each editor. The
   mockups used to perform double duty of specifying UX AND visual design; we need to
   backfill the visual design part that we are cleaving from the mockup."* → creates
   **Stage 1**.

### The root-cause diagnosis

Mockups did **double duty**: UX (layout/flow/hierarchy) *and* visual design
(palette/type/components) in one hi-fi HTML artifact. Two failure modes follow:
**staleness mistaken for intent** (a mockup that *looks* real gets implemented literally,
stale details and all) and **no durable home for visual design** (identity scattered
across memories, CSS comments, rotting one-off pages).

### The rejected alternative (as important as the accepted one)

**Heavy hi-fi-mockup drift gate — REJECTED.** *"That machinery exists only to police a
resemblance that shouldn't exist."* Its surviving descendant is the **inverted-teeth**
gate: instead of checking a mockup *matches* the product, check it is *deliberately
unlike* it.

### The resulting discipline (three stages, each owns one concern)

| Stage | Owns | Artifact | Anti-staleness mechanism |
|---|---|---|---|
| 1. Design language | *what it looks like* | markdown spec + **living gallery from real components** | gallery generated from real components → can't drift |
| 2. UX sketch | *how it's organized & flows* | **lo-fi hand-drawn wireframe** (`sketch-kit.css` only) | deliberately un-styled → can't be read as visual direction |
| 3. Implementation + review | *the realized thing* | real components, **device-free screenshot** | the screenshot is of the actual product |

Enforcement: `check-mockup-lofi.sh` (+ validator) — exploration HTML may link **only**
`sketch-kit.css`; no `@import`, no design-system CSS, no remote resources. Visual-regression
via `visual-compare.mjs` (exact SHA256) + `visual-update-baseline.mjs` (re-bless).

### Process/meta lessons (operator's, generalizable)

- **Prefer the design shape that removes a failure mode over the gate that catches it.**
- **Anchor visual truth in real components**, never in a static artifact that rots.
- **Markdown holds intent; generated artifacts hold pixels.**
- **Look, don't deduce. Prove, don't assert.** (Act I → already in deskwork's
  `ui-verification.md`.)
- **Inventory before iterating** — a same-class audit at session start beats N
  screenshot-driven point fixes.

---

## What deskwork already absorbed vs. the gap

| Discipline element | In deskwork today? | Source |
|---|---|---|
| "Self-screenshot, look-don't-deduce, prove-don't-assert" | ✅ `.claude/rules/ui-verification.md` | Act I |
| ACCEPTED/REJECTED design-decision archive | ✅ `DESIGN-STANDARDS.md` + `docs/studio-design/{ACCEPTED,REJECTED}/` | predates editor adoption |
| Dual-viewport regression smoke | ✅ `scripts/smoke-er-viewport-regressions.mjs` (structural, not pixel baseline) | Act I-adjacent |
| `/frontend-design` mockup-first | ✅ skill present | — |
| **Lo-fi wireframe kit + inverted-teeth gate (Stage 2)** | ❌ **GAP** | Act II |
| **Deterministic visual-regression baselines (Stage 3)** | ⚠️ partial — has structural probes, no SHA256 screenshot baseline | Act II |
| **Device-free / fixture-rendered capture of real surfaces** | ❌ **GAP** — studio renders against live data | Act II |
| **Per-surface design-language spec + living gallery (Stage 1)** | ⚠️ `DESIGN-STANDARDS.md` is close; no living gallery | Act II |

### Implication for the studio redesign
The sites→lanes clean break forces a studio content-browser + scrapbook redesign. Per this
audit, the right way to do that **without repeating Act I** is: author a **Stage-2 lo-fi
wireframe** of the new structure/flow (operator picks the UX), keep visual identity in
`DESIGN-STANDARDS.md` (Stage 1), and lock the implementation with a **Stage-3 device-free
screenshot baseline** on real studio components fed deterministic fixtures. The gap to
close first is the **lo-fi wireframe kit + inverted-teeth gate** and the **fixture-rendered
capture harness** — the two pieces deskwork doesn't yet have.
