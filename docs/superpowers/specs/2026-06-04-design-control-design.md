# design-control plugin — converged design (v12)

> **Status: converged.** Reached via 11 adversarial audit-barrage rounds (claude + codex in
> parallel) run until **two consecutive rounds returned zero HIGH findings** (rounds 10 + 11 —
> the operator's stop criterion). Per-round records: `.dw-lifecycle/scope-discovery/audit-runs/*design-control*`.
> The barrage drove the design from a roll-your-own visual-regression engine (killed rounds 1–2)
> to this orchestration design, then hardened the referee, the scaffold/referee split, the
> capture-config identity hash, and the lint (to allowlists on both the element/attribute and
> codepoint axes). Companion: `DESIGN-DISCIPLINE-THESIS.md`; kickoff issue #424.

## What it is
A deskwork marketplace plugin that productizes a UX/UI surface-change discipline as **workflow
tooling that orchestrates an existing engine — NO roll-your-own visual-verification engine.**
(It ships CLI verbs, a lint, status, manifests, skills — that's tooling; it builds no custom
pixel/visual engine.)

## Identity & portability (claim matched to evidence)
A **deskwork marketplace plugin with a pluggable referee-engine requirement.**
**Render-framework-independent** (the referee looks at a screenshot) — **NOT agent-independent**
(a referee engine is required). No "any-adopter / framework-independent" overclaim.

## Engine-adapter seam (conformance-tested; Claude-only in v1)
Interface: `author-wireframe`, `translate-design-language`, `referee-screenshot`, with
**`/frontend-design` as the default Claude adapter**. Declared cross-plugin dependency + a
**preflight presence check that fails loud** — scoped to adapter **execution** paths, NOT to
manual authoring (so scaffold's operator-driven, lint-enforced authoring works without the
engine present; the adapter methods are *optional accelerators*, not scaffold preconditions).
Conformance is specified (JSON request/response schemas; adapter echoes manifest ids, image
hashes, model identity, rubric-item ids; defined confidence + failure modes). Two conformance
clauses matter: (a) **`author-wireframe` must emit sketch-kit-only, lint-passing lo-fi markup**
— a claiming engine is *constrained* by the lint, not *trusted*; the default Claude adapter
fails conformance loudly if it leaks polish (round-6 H1). (b) **`referee-screenshot` is a
Claude-vision shim wrapping the engine** (distinct from `/frontend-design`'s code-gen role); the
adversarial falsification set is its acceptance gate. **v1 ships ONE conformant adapter
(Claude).** Multi-family is NOT assumed from the existing audit-barrage harness — that harness
fires CLIs at a *text* diff; a *vision* `referee-screenshot` adapter (image ingestion at
fidelity + conformant output) for codex/gemini is unproven and is **phase 2, gated on
demonstrating per-family vision-adapter conformance.**

## The discipline — engine threaded through 3 concerns; 2 reference artifacts + a baseline
| Concern | Owns | Reference artifact | engine role |
|---|---|---|---|
| 1. UX (spirit) | organization & flow | lo-fi wireframe (deliberately un-polished; captured UX invariants) | collaborates on the UX |
| 2. Design language (letter) | what it looks like | design-language spec (markdown; each rule linked to live CSS/class + ≥1 example; **link-liveness checked**) | translates wireframe intent → local design language |
| 3. Review (referee) | gross spirit/letter regressions + declared stable-region pixel drift | candidate + **promoted baseline** + structured change-scope | emits **advisory evidence** (never a gate) |

## v1 SPLIT — two releasable modes; the boundary is sharp
- **`v1-scaffold` (ship-ready alone; depends on NO referee, NO capture/baseline):** wireframe
  kit + leakage lint; design-language spec schema + link-liveness; ACCEPTED/REJECTED archive
  (decision states/links); referee-request manifest **schema** validation (structure only, no
  execution); `design-control status` over **authoring artifacts only**.
- **`v1-referee-preview` (gated, optional evidence):** the referee + ALL capture/baseline/matrix
  machinery. A surface acquires a baseline-matrix requirement **only when the operator opts it
  into visual review** (i.e., referee-preview present). Capture, baselines, stable-regions, and
  the matrix are referee-preview deliverables — never scaffold-completion requirements. (Round-5
  H3: scaffold must not gate "complete" on artifacts only the referee consumes.)

## `design-control status` — adoptability backstop (keys on manifest structure, not verdict)
Per surface, the next required action + a refusal of "complete" while required **artifacts** are
missing. It keys on **manifest structure / artifact presence**, never on referee verdict
*content* (so it's not a gate-by-proxy). **Scaffold-mode** gates on: missing wireframe,
unaccepted decision, stale-or-dead-link spec, malformed manifest. **Referee-preview-mode** adds:
incomplete baseline matrix, oversized/invariant-covering dynamic region, missing referee
evidence. "Stale surface" needs a `surface-id → source-files/routes` map — a real scaffold
deliverable, **derived from the import/route graph** (not hand-authored, which rots); if the
graph derivation isn't feasible, staleness is descoped, not pushed onto the adopter.

## The referee (gated; advisory; narrowed; no custom engine)
- **Strictly advisory.** Emits structured findings; never auto-passes/fails (project rule:
  *agent posts evidence, operator decides*).
- **Scope narrowed to GROSS spirit/letter/layout regressions — and even that is not assumed
  reliable.** `ui-verification.md` records an LLM-judge missing a *gross* defect (an occluded
  chip, reported "matches spec"). So the referee is advisory **and must earn trust empirically**:
  it ships as optional evidence until it passes an adversarial falsification set (below). It does
  NOT claim to satisfy `ui-verification.md`'s numeric-measurement mandate.
- **Numeric drift → an EXISTING pixel-diff tool on operator-declared STABLE regions, expressed
  as DOM LOCATORS (not coordinate boxes).** `stableRegions` is a machine-executable contract
  keyed by `surface id + route/state + viewport + capture-step`; each region compiles to an
  existing-tool primitive (Playwright `toHaveScreenshot` locator-clip; Argos/Percy region
  config). Locators re-anchor across reflow (coordinate boxes don't). **Fail loud** when a region
  is missing, unresolvable at a viewport, overlaps a dynamic mask, or covers an
  intentionally-changed area. (Round-5 codex-1 / claude-M1.)
- **Two-image judgment = GROSS comparison only** (panel below fold, hierarchy inverted) — never
  the numeric spine.
- **Spirit and letter are two separate questions** that never cross (the wireframe is
  deliberately ugly).
- **Structured change-scope contract** in the manifest: allowed changes, protected invariants,
  out-of-scope regions, expected per-viewport impact, baseline-replacement requested. The referee
  classifies each difference `intended` / `unintended` / `ambiguous` / `outside-scope`; ambiguous
  → operator.
- **v1 reliability = Claude stability sampling, labeled as such** (repeat runs detect flake; this
  is NOT diversity and may not back a "high-confidence" verdict). Genuine cross-family quorum is
  phase 2 (gated on H1's vision-adapter conformance).

## Baseline & capture (referee-preview scope; PNG is the artifact of record)
- **Baseline promotion is an operator state transition:** a screenshot becomes `ACCEPTED` only
  when its manifest is complete, route/state/viewport/capture-config hashes match the surface
  contract, the required viewport matrix is present, dynamic regions are declared, and the
  operator explicitly promotes it. Lineage + a `supersedes` reason on replace.
- **The accepted baseline PNG is the artifact of record.** On capture-config change, **invalidate
  the baseline and require operator re-promotion under the new recipe** — do NOT synthesize a
  re-capture from the historical git commit (old commits frequently won't build/boot under the
  current toolchain; that swaps a bounded recipe delta for an unbounded app-reproducibility
  delta). (Round-5 H2.)
- **Capture-config hash covers the DETERMINISTIC recipe** (route, viewport, wait condition,
  masks) **plus a non-secret auth/profile identity** — role, tenant/profile fixture id,
  feature-flag-set id, seeded-data version, setup-script version — and **excludes only secret
  token material** (rotating `storageState` tokens) so the hash doesn't churn every run. This
  prevents an `admin/flags-A` baseline from false-matching an `editor/flags-B` candidate while
  the hash appears valid (round-6 codex-1 / claude-M3). Role is encoded in the `state` axis;
  **fail loud** if `storageState` is supplied without a named reproducible fixture/profile, or
  when two candidates share `surface+route+state+viewport+capture-step` but resolve different
  auth principals. Recorded for baseline + candidate; masks applied to both.
- **Capture-config contract** (adopter glue, existing executor): adopter supplies route/URL,
  setup-or-fixture, auth/storageState, viewport matrix, wait condition, and **specific, bounded,
  named, justified** dynamic regions + stable-region locators. design-control orchestrates
  Playwright as executor; capturing the right surface is adopter glue, stated plainly.
- **Baselines are a matrix** keyed by `surface id + route/state + viewport + capture-step`;
  referee-preview `status` refuses completion when candidate screenshots don't cover the required
  matrix (unless the change-scope explicitly retires/replaces a cell with operator approval).

## Wireframe authoring (greenfield + retroactive)
Lo-fi wireframe kit (`sketch-kit.css` + `.sk-*` + banner + a fixed `.sk-img` placeholder
element); authoring skill; `check-mockup-lofi` lint. **The lint is an element/attribute
ALLOWLIST, not a forbid-list** (round-7: a denylist is whack-a-mole — each round closes one
channel while passive-polish channels stay open; an allowlist closes the whole class and makes
the lo-fi guarantee — "lint green ⇒ genuinely lo-fi" — actually trustworthy). It **permits only**:
the single sketch-kit `<link rel=stylesheet>`, the `.sk-*` structural tags, the `.sk-img`
placeholder, a closed set of plain structural tags + text, and the WIREFRAME banner. It
**rejects everything else**, notably every polish channel — external resources of any kind
(`<img src>` remote/relative incl. external `.svg`, `<picture>`/`srcset`, `<iframe>`/`<object>`/
`<embed>`), `<script>`/`<style>`/inline `style=`, `data:` URIs, and presentational attributes
(`background`, `bgcolor`, `<font>`, layout `width`/`height`/`align`). (Round-6's data:/inline-SVG
rules survive as defense-in-depth under the allowlist.) Two value/content-level rules close the
channels an element/attribute allowlist structurally cannot reach (round-8): **(i)** the single
permitted `<link>` is **pinned by identity** — canonical resolved path + content hash/SRI, not
merely "at most one stylesheet"; arbitrary `class` *values* are permitted-but-inert *only
because* that pinned stylesheet is the sole CSS source (state this invariant explicitly).
**(ii)** a **text-content rule that is itself a codepoint ALLOWLIST** (symmetric with the
element/attribute allowlist — a denylist of ranges is the same whack-a-mole round 7 abolished:
Mathematical-Alphanumeric letters 𝐃𝐚𝐬𝐡𝐛𝐨𝐚𝐫𝐝/script/fraktur/double-struck, enclosed
①②③, and fullwidth Ｄａｓｈ carry Unicode category *Letter*, not emoji/symbol, so a range-denylist
passes them and "designed typography" leaks with zero CSS — round-9). It **permits only** Basic
Latin letters/digits, a closed enumerated punctuation set, an ENUMERATED whitespace set (space + newline + tab only — not the Unicode
whitespace category, which would leak em/en/hair/ideographic spacers as an alignment channel,
round-10), and an enumerated set of accented-Latin extras; it **rejects everything else** (math-alphanumeric, enclosed, fullwidth,
fraktur/double-struck, pictographic/emoji, box-drawing, tag chars, variation selectors,
zero-width formatting) in one rule. "emoji-as-icon" and "𝐌𝐚𝐭𝐡-bold heading" planted cases are
added to the `author-wireframe` conformance falsification set. Grandfather allowlist w/ issue-link + expiry. Authoring is **operator-driven + lint-enforced**; the engine `author-wireframe` method
is an optional accelerator routed through the **same** allowlist lint — engine output is
constrained, never trusted.
**Retroactive** artifacts (existing surface → derived wireframe/spec) are marked `derived`,
require operator editing to assert *intended* UX before acceptance, and do NOT satisfy a
"wireframe drove the implementation" claim.

## Known-deferred (named, not hidden)
- **Link-liveness is STATIC, against CSS/source** (the selector/class must be *defined* in
  source) — scaffold performs **no app boot** (preserves "authoring artifacts only / no capture
  dependency", round-6 M1). Runtime dead-CSS detection + **link-liveness ≠ spec truthfulness**
  (a resolving selector doesn't prove the live CSS still matches the rule's described intent) are
  named and deferred.
- Living gallery; broader pixel regression beyond declared stable regions; WebKit/iOS (real iOS =
  manual/real-device); waypoint auto-fire; per-exploration-type lint profiles; a11y review;
  deskwork `docs/studio-design/` migration; **cross-family referee quorum / design-barrage engine
  battery** (gated on vision-adapter conformance).

## Dogfood / acceptance (falsification; claim matched to evidence)
`v1-scaffold` acceptance is independent: lint rejects inline-style/`<style>`/`<script>`; a
dead spec-link is flagged; archive states + manifest-schema validation work; `status` gates
correctly over authoring artifacts. The sites→lanes studio redesign drives the loop.
`v1-referee-preview` acceptance is **adversarial**: the referee must **escalate** on planted
GROSS regressions (an occluded element; a panel forced below the fold) across **multiple**
instances — not merely "emit findings"; stable-region pixel-diff catches a planted numeric drift
in a declared-stable locator; intentionally stale screenshot / wrong viewport / oversized dynamic
region / design-language violation are caught or escalated. Until referee-preview passes this set,
its output is optional evidence and no "catches these cases" claim ships. Portability is
validated **only on the deskwork studio**; cross-framework + cross-agent via the adapter seam is
phase 2.
