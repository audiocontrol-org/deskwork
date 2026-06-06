---
slug: design-control
title: design-control — portable UX/UI surface-change discipline
targetVersion: "1.0"
date: 2026-06-05
parentIssue: 424
deskwork:
  id: 60692084-08dc-4395-b861-7c66ec523743
---

# PRD: design-control — portable UX/UI surface-change discipline

> **Design-of-record.** This PRD is the self-standing design for the feature. It absorbs the
> converged design [`docs/superpowers/specs/2026-06-04-design-control-design.md`](../../../superpowers/specs/2026-06-04-design-control-design.md)
> (v12 — converged via 11 adversarial audit-barrage rounds, claude + codex in parallel, run until
> **two consecutive rounds returned zero HIGH findings**, rounds 10 + 11, the operator's stop
> criterion) and its companion [`DESIGN-DISCIPLINE-THESIS.md`](../../../../DESIGN-DISCIPLINE-THESIS.md).
> The spec remains the convergence record (per-round provenance lives in
> `.dw-lifecycle/scope-discovery/audit-runs/*design-control*`); this PRD is what the review gate
> and the implementer read. Round-N citations below (e.g. *round-5 H2*) point at the barrage round
> that drove each decision, preserved so the rationale survives.

## Problem Statement

Changing a UI surface "blind" degenerates into a screenshot-by-screenshot correction loop
(audiocontrol S-550: ~32 surfaces entered scope, **zero found proactively by the agent**). Root
cause: mockups did **double duty** (UX *and* visual design at once), so stale detail shipped as if
intended (a drifted color, a leftover control), and visual identity had **no durable home** — it
lived inside disposable mockups instead of a settled reference. The missing leg the operator named:
*"a stage separate from mockups that formally defines the design language … backfill the visual
design part that we are cleaving"* out of the wireframe.

A hard-won discipline fixes it: **model the change as a deliberately lo-fi wireframe** (UX intent,
structurally un-styled so it can't be mistaken for implementation guidance), **keep visual identity
in a settled design language** (its own durable reference, not inside a wireframe), and **verify by
*looking*** at the realized thing against specific criteria. That discipline is currently trapped in
one sibling repo. **design-control productizes it as a portable deskwork plugin.**

## What it is

A **deskwork marketplace plugin** that productizes the discipline as **workflow tooling that
orchestrates an existing engine — with NO roll-your-own visual-verification engine.** It ships CLI
verbs, a lint, a `status` command, manifests, and skills — that is tooling; **it builds no custom
pixel / visual / determinism engine.** A roll-your-own visual-regression engine was the original
v1 design and was **killed across the first two adversarial barrage rounds**; everything since is
orchestration of existing engines — `/frontend-design` for the authoring concerns, a
**cross-model audit-barrage** for the referee (see the DESIGN AMENDMENT below).

`/frontend-design` is threaded through **three concerns**, anchored by **two durable reference
artifacts** (lo-fi wireframe = UX *spirit*; design-language spec = visual *letter*) plus a
**promoted baseline**. The loop:

> author a lo-fi wireframe (works out the UX) → operator picks → `/frontend-design` translates
> intent into the project's local design language → implement against it → a **cross-model
> audit-barrage referees** the surface (screenshot / live web interface) against the *spirit* of
> the wireframe and the *letter* of the spec — `/frontend-design` in the Claude judge, each other
> family's equivalent in its agent; cross-model agreement = signal (advisory evidence, **never** a gate).

### Identity & portability (claim matched to evidence)

A deskwork marketplace plugin **with a pluggable referee-engine requirement.**
**Render-framework-independent** (the referee looks at a screenshot, so the rendering stack —
Astro/Next/Hugo/etc. — doesn't matter) — but **NOT agent-independent** (a referee engine *is*
required). No "any-adopter / framework-independent" overclaim. *(The "v1 ships **one** conformant
referee adapter (Claude)" plan is superseded — see the DESIGN AMENDMENT directly below.)*

## DESIGN AMENDMENT (2026-06-06) — the referee is a cross-model audit-barrage

This supersedes the "single Claude `/frontend-design` referee adapter; the audit-barrage is
text-only; cross-model vision is phase-2-unproven" framing that still appears in the
engine-adapter-seam and identity passages (kept for convergence provenance). Operator decision:

- **The referee is the dw-lifecycle audit-barrage + audit protocol, parameterized for design
  review** — design-control *productizing* the same discipline it is developed with (Level 2),
  not a bespoke verifier. Multiple model agents *look at* the realized surface (a screenshot
  **or the live web interface** — the agents are agentic + multimodal; the prompt instructs them
  what to review) and judge it against wireframe-*spirit* + design-language-*letter*.
  **Cross-model agreement is the genuine-defect signal**; findings flow through the audit-log →
  disposition protocol. (The prior "barrage fires CLIs at a *text* diff" premise was wrong.)
- **The barrage prompt explicitly names the per-family design engine:** `/frontend-design` in
  the Claude agent, the equivalent design-review tool in each other family's agent (e.g. codex).
  "`/frontend-design` is the engine" holds *inside the Claude judge*; the barrage adds the other
  families for the stochastic-correctness diversity that makes the verdict trustworthy.
- **Reuse, not re-implement:** the referee invokes the existing dw-lifecycle audit-barrage +
  audit-protocol (declared cross-plugin dependency, like `/frontend-design`), parameterized with
  a design-review prompt. Embodying a parallel copy would itself be "rolling your own."
- **Architected as a barrage from v1:** v1 fires whatever model families can both review the
  image/web-interface AND run a design engine (Claude + codex certain; gemini if its CLI
  qualifies). Cross-model agreement + the Phase-5 adversarial falsification set are the trust
  gate. This replaces "single Claude shim now, cross-model later."

Still consistent with the hardest-won commitment: this rolls **no pixel engine** — it uses
existing model CLIs as *judges* + the existing audit protocol; verification stays *judgment*,
now multi-judge. Rationale: a single-model referee is the unreliable-narrator failure mode
stochastic correctness exists to defeat. See `DESIGN-DISCIPLINE-THESIS.md` § "The referee is a
cross-model audit-barrage."

## Definitions

These terms are load-bearing — the lint, the `status` gate, the baseline matrix, and the referee
all key on them.

- **Surface.** A named, addressable UI region identified by a stable `surface id` — typically a page
  or route-rendered view, or a significant named region within one (e.g. the studio content-browser,
  the scrapbook drawer). **Granularity is the operator's declaration at authoring time, not
  auto-derived.** A surface is verified across the orthogonal axes `route/state + viewport +
  capture-step`, so one `surface id` spans many baseline-matrix cells. ("~32 surfaces" in the
  problem statement counts surface ids — the coarse unit; the manifest key adds the finer axes.) The
  dogfood "≥ 2 diverse surfaces" bar means two distinct `surface id`s of materially different shape.
- **GROSS regression.** A regression perceptible **without pixel measurement** — visible at thumbnail
  scale or on an unaided side-by-side glance. Operationally: a difference that **changes layout
  topology** (an element occluded; a control visibly occluded or overlapped at the declared viewport;
  primary content pushed below the fold at the declared viewport; reading-order / hierarchy
  inverted) **or removes / duplicates a signature component.** Explicitly **NOT gross**: sub-component
  pixel drift — a token color off by a shade, a few-px spacing change, a font-weight tweak. Gross
  regressions are the two-image referee's scope; non-gross drift routes to the stable-region
  pixel-diff arm. The Phase 5 falsification set must span **both clearly-gross and clearly-subtle**
  planted cases so the boundary is exercised. The **closed v1 gross-class list** — each must be
  planted in the Phase 5 falsification set, and "every gross class" in the acceptance means exactly
  these seven: (1) element occluded; (2) a control **visibly occluded or overlapped at the declared
  viewport** (its interactive glyph no longer cleanly visible) — stated in **screenshot-perceivable**
  terms because the referee grades a screenshot, not a DOM; a DOM `elementsFromPoint` hit-test is
  reserved for a separate DOM-side check if one is ever added, never as the grossness criterion the
  vision referee is scored on; (3) primary content below the fold at the declared viewport;
  (4) reading-order / hierarchy inverted; (5) signature component removed; (6) signature component
  duplicated; (7) signature component wrong / replaced (incl. palette swapped to an obviously
  different family).
- **capture-step.** A named point in a surface's capture sequence at which a screenshot is taken —
  e.g. `default` (initial render), a post-interaction state (`menu-open`), or a scroll position
  (`scrolled-to-footer`). The operator **enumerates the required capture-steps per surface**; the
  baseline matrix requires one cell per `surface × route/state × viewport × capture-step`. A surface
  with no interactions has a single `default` capture-step — so the "required matrix" is always
  enumerable, which is what makes the matrix-coverage check mechanical.

## The discipline — engine threaded through 3 concerns

| # | Concern | Owns | Reference artifact | engine role |
|---|---|---|---|---|
| 1 | **UX (spirit)** | organization & flow | lo-fi wireframe (deliberately un-polished; captured UX invariants) | collaborates on the UX |
| 2 | **Design language (letter)** | what it looks like | design-language spec (markdown; each rule linked to a live CSS file/class + ≥1 current example; **link-liveness checked**) | translates wireframe intent → local design language |
| 3 | **Review (referee)** | gross spirit/letter regressions + declared stable-region pixel drift | candidate + **promoted baseline** + structured change-scope | emits **advisory evidence** (never a gate) |

Spirit and letter are **two separate questions that never cross** — the wireframe is deliberately
ugly, so it can never be read as a visual-design source; the design language is the only home for
visual identity.

### Engine-adapter seam (conformance-tested; Claude-only in v1)

A declared interface — **`author-wireframe`, `translate-design-language`, `referee-screenshot`** —
with **`/frontend-design` as the default Claude adapter**. A **declared cross-plugin dependency**
plus a **preflight presence check that fails loud**, scoped to adapter **execution** paths and
**NOT** to manual authoring (so the scaffold's operator-driven, lint-enforced authoring works with
no engine present; the adapter methods are **optional accelerators, not scaffold preconditions**).

Conformance is specified — JSON request/response schemas; the adapter echoes manifest ids, image
hashes, model identity, and rubric-item ids; confidence and failure modes are defined. Two
conformance clauses are load-bearing:

- **(a)** `author-wireframe` **must emit sketch-kit-only, lint-passing lo-fi markup.** A claiming
  engine is **constrained by the lint, never trusted**; the default Claude adapter fails conformance
  **loudly** if it leaks polish *(round-6 H1)*.
- **(b)** `referee-screenshot` is fulfilled by the **cross-model audit-barrage** (see the DESIGN
  AMENDMENT above): each family's agent reviews the screenshot / live web interface with its own
  design engine (`/frontend-design` in the Claude agent; the equivalent in others). Its
  **adversarial falsification set + cross-model agreement are its acceptance gate.**

**The referee is architected as a barrage from v1** (superseding the prior "one Claude adapter;
cross-model vision is phase-2-unproven" plan — that plan wrongly assumed the barrage is
text-only). v1 fires whatever model families can both review the image/web-interface AND run a
design engine. The referee **reuses** the existing dw-lifecycle audit-barrage + audit-protocol
(declared cross-plugin dependency), parameterized with a design-review prompt — it builds no
vision engine of its own. Per-family vision conformance (image ingestion at fidelity +
structured output) is a Phase-5 deliverable, gated on the falsification set; a family that
doesn't yet qualify simply isn't in the barrage's roster.

## v1 split — two releasable modes; the boundary is sharp

- **`v1-scaffold`** — ship-ready **alone**; depends on **NO referee, NO capture/baseline**:
  wireframe kit + leakage lint; design-language spec schema + link-liveness; ACCEPTED/REJECTED
  archive (decision states/links); referee-request manifest **schema** validation (structure only,
  no execution); `design-control status` over **authoring artifacts only**.
- **`v1-referee-preview`** — **gated, optional evidence**: the referee + **all** capture / baseline /
  matrix machinery. A surface acquires a baseline-matrix requirement **only when the operator opts
  it into visual review** (i.e. referee-preview is present). Capture, baselines, stable-regions, and
  the matrix are **referee-preview deliverables — never scaffold-completion requirements**
  *(round-5 H3: the scaffold must not gate "complete" on artifacts only the referee consumes).*

**Build order is inverted:** ship the scaffold first (zero referee risk), build the referee as a
constrained evidence-spike **last**, gated on its falsification set.

## Component design (v1-scaffold)

### Wireframe authoring (greenfield + retroactive) + the `check-mockup-lofi` lint

The kit: `sketch-kit.css` + the `.sk-*` vocabulary + a self-labeling **WIREFRAME banner** + a fixed
`.sk-img` placeholder element + a bundled local OFL hand-drawn webfont (**aesthetic only, not a
determinism claim**). An authoring skill `/design-control:wireframe <change>`. Authoring is
**operator-driven + lint-enforced**; the engine `author-wireframe` method is an **optional
accelerator routed through the same lint** — engine output is constrained, never trusted.

**The lint is an element/attribute ALLOWLIST, not a forbid-list** *(round-7)*: a denylist is
whack-a-mole — each round closes one channel while passive-polish channels stay open; an allowlist
closes the whole class and makes the lo-fi guarantee — **"lint green ⇒ genuinely lo-fi"** —
actually trustworthy. It **permits only**: the single sketch-kit `<link rel=stylesheet>`, the
`.sk-*` structural tags, the `.sk-img` placeholder, a closed set of plain structural tags + text,
and the WIREFRAME banner. It **rejects everything else**, notably every polish channel:

- external resources of any kind — `<img src>` (remote/relative, incl. external `.svg`),
  `<picture>` / `srcset`, `<iframe>` / `<object>` / `<embed>`;
- `<script>` / `<style>` / inline `style=`; `data:` URIs;
- presentational attributes — `background`, `bgcolor`, `<font>`, layout `width` / `height` /
  `align`.

*(Round-6's `data:` / inline-SVG rules survive as defense-in-depth under the allowlist.)*

Two **value/content-level** rules close the channels an element/attribute allowlist structurally
cannot reach *(round-8)*:

- **(i) Stylesheet identity pin.** The single permitted `<link>` is **pinned by identity** —
  canonical resolved path + content hash/SRI — **not** merely "at most one stylesheet." Arbitrary
  `class` *values* are permitted-but-**inert** *only because* that pinned stylesheet is the sole CSS
  source; **state this invariant explicitly.**
- **(ii) Codepoint ALLOWLIST for text content** — symmetric with the element/attribute allowlist (a
  denylist of ranges is the same whack-a-mole round 7 abolished: Mathematical-Alphanumeric letters
  𝐃𝐚𝐬𝐡𝐛𝐨𝐚𝐫𝐝/script/fraktur/double-struck, enclosed ①②③, and fullwidth Ｄａｓｈ carry Unicode
  category *Letter* — not emoji/symbol — so a range-denylist passes them and "designed typography"
  leaks with zero CSS, *round-9*). It **permits only**: Basic-Latin letters/digits, a closed
  enumerated punctuation set, an **enumerated whitespace set** (space + newline + tab only — **not**
  the Unicode whitespace *category*, which would leak em/en/hair/ideographic spacers as an alignment
  channel, *round-10*), and an enumerated set of accented-Latin extras. It **rejects everything
  else** in one rule: math-alphanumeric, enclosed, fullwidth, fraktur/double-struck,
  pictographic/emoji, box-drawing, tag chars, variation selectors, zero-width formatting.

The **`author-wireframe` conformance falsification set** includes planted **"emoji-as-icon"** and
**"𝐌𝐚𝐭𝐡-bold heading"** cases. Grandfather allowlist entries require an **issue link + expiry**.

**Retroactive path.** Artifacts derived from an existing surface (existing surface → `derived`
wireframe/spec) are **marked `derived`** and **do NOT satisfy a "wireframe drove the implementation"
claim.** Acceptance of a `derived` artifact requires a **recorded operator edit** — a non-empty diff
between the auto-derived draft and the accepted version — **not merely a state transition**;
`status` **refuses to accept an unedited derived artifact.** The auto-derived draft is
**snapshotted at derivation time** (stored alongside provenance); `status` diffs the accepted
artifact against that stored snapshot and requires a **non-empty, non-whitespace content diff.**
What this **mechanically guarantees** is narrow and stated honestly: *a recorded substantive edit
exists* — enough to defeat a bare state transition. It does **NOT** by itself guarantee the edit
*captures intended UX* (a token-level edit satisfies it); semantic intent remains the operator's
responsibility, **surfaced** (the diff is shown) rather than asserted by the gate. This is a
discipline backstop, not a proof of meaningfulness.
Provenance — `drove-implementation` vs `derived-retroactively` — is carried so `status` cannot
launder a non-driving artifact into "complete."

### Design-language spec convention + static link-liveness

A **markdown spec schema**: palette / type / spacing tokens + signature-component vocabulary +
do/don't, **each rule linked to a live CSS file/class + ≥1 current example**. The spec is a
**markdown artifact the operator authors and edits by hand — it does NOT require the engine.**
`translate-design-language` (via `/frontend-design`) is an **optional accelerator** that drafts the
spec from approved wireframe intent; its engine conformance is tested **only when `/frontend-design`
is present.** **Scaffold completion requires the spec artifact + passing static link-liveness —
neither needs the engine.** (This is precisely what "the scaffold works with no engine present"
means: **both** scaffold reference artifacts — wireframe *and* spec — are hand-authorable; the engine
only accelerates. "No referee" ≠ "no engine," but the scaffold genuinely needs neither.)

A **static link-liveness check**: each referenced selector/class must be **defined in source** —
**scaffold performs NO app boot** (preserves "authoring artifacts only / no capture dependency",
*round-6 M1*). "Defined in source" is scoped to **author-written CSS selectors/classes** (the
deskwork studio, where portability is validated); utility-framework (Tailwind), CSS-in-JS, and hashed
CSS-Modules class resolution are **not validated in v1** — see Out of Scope.

Named-deferred (see Out of Scope): **runtime dead-CSS detection** and **spec-truthfulness**
(link-liveness ≠ truthfulness — a resolving selector doesn't prove the live CSS still matches the
rule's described intent).

### ACCEPTED/REJECTED exploration archive primitive

A standalone archive (the plugin owns its own; it does not depend on deskwork's `docs/studio-design/`).
Each entry: briefs + the lo-fi wireframe visual + decision states/links — **proposal, accepted
wireframe, impl commit, rejected rationale, `supersedes`.** Archive writes are **generated by the
skill flow, not "remember to archive."**

### `design-control status` — adoptability backstop (keys on manifest structure, not verdict)

Per surface: the **next required action** + a **refusal of "complete"** while required **artifacts**
are missing. It keys on **manifest structure / artifact presence**, **never on referee verdict
*content*** (so it is **not a gate-by-proxy**).

- **Scaffold-mode** gates on: missing wireframe, unaccepted decision, **dead-link spec**, **stale
  surface**, and malformed manifest. *Dead-link and stale-surface are **two distinct mechanisms**,
  named separately so one can ship while the other is descoped:*
  - **dead-link spec** — a referenced selector is **not defined in source** (the static
    link-liveness check); **always ships.**
  - **stale surface** — the surface's **mapped source/routes have drifted** (the graph-derived map);
    **feasibility-gated**, see below.
- **Referee-preview-mode** adds: incomplete baseline matrix, oversized / invariant-covering dynamic
  region, missing referee evidence.

**Stale-surface detection** needs a `surface-id → source-files/routes` map — a real scaffold
deliverable, **derived from the import/route graph** (not hand-authored, which rots). It is
**feasibility-gated**: if the graph derivation is feasible it ships **with its own acceptance**
(`status` flags a surface whose mapped source drifted); if it is **not** feasible, it is an
**explicit operator-approved descope recorded in the workplan** — never an implementer's silent
mid-build cut. The **dead-link half always ships regardless.**

### Referee-request manifest schema (scaffold = schema validation only)

The manifest schema's **scaffold-required** fields: surface id; route/state; **viewport(s)**
(desktop ≥ 1280 + phone ≤ 390); wireframe path + hash; spec path + version + hash; impl commit;
change-intent brief. **Scaffold validates the schema only — no execution, no capture.**

The schema **also defines the fields later referee controls need** (baseline + candidate paths,
stable-region locators, dynamic regions, capture-config identity, viewport identity, auth/principal
metadata) — but these are **mode-aware: defined-and-validated-when-present (structure-only) and
OPTIONAL in scaffold mode.** A scaffold manifest that **omits** them is **valid**; only a
**referee-preview manifest** (visual-review opt-in) **requires** them. The schema rejects a manifest
that **supplies** a referee field in malformed shape — **never** one that merely omits referee fields
in scaffold mode. This lets Phase 4 ship a schema Phase 5 won't have to break **without** making
referee data a scaffold-completion requirement (preserving the `v1-scaffold` "NO capture/baseline"
boundary).

## Component design (v1-referee-preview — GATED; advisory only)

### The referee (advisory; narrowed; no custom engine)

- **Strictly advisory.** Emits structured findings; **never auto-passes/fails** (project rule:
  *agent posts evidence, operator decides*).
- **Scope narrowed to GROSS spirit/letter/layout regressions — and even that is not assumed
  reliable.** `ui-verification.md` records an LLM-judge missing a *gross* defect (an occluded chip,
  reported "matches spec"). So the referee is advisory **and must earn trust empirically**: it ships
  as optional evidence until it passes an adversarial falsification set. It does **NOT** claim to
  satisfy `ui-verification.md`'s numeric-measurement mandate.
- **Two-image judgment = GROSS comparison only** (panel below the fold; hierarchy inverted) — never
  the numeric spine. See Definitions for the operational GROSS boundary.
- **Design-language violations split by grossness.** The two-image referee owns **gross**
  design-language violations (a missing / wrong signature component; a palette swapped to an
  obviously different family). **Subtle** token-level drift (color off by a shade, wrong type scale,
  few-px spacing) is **not** the referee's job — it routes to the **stable-region pixel-diff arm**.
  Neither the referee nor v1 claims to catch subtle design-language drift **outside** declared stable
  regions (that is `spec-truthfulness`, named-deferred).
- **Structured change-scope contract** in the manifest: allowed changes, protected invariants,
  out-of-scope regions, expected per-viewport impact, baseline-replacement requested. The referee
  classifies each difference **`intended` / `unintended` / `ambiguous` / `outside-scope`**;
  **ambiguous → operator.**
- **"Escalation" defined (so the Phase 5 gate is scorable).** An *escalation* is a referee finding
  classified **`unintended` or `ambiguous`** and localized to a region, **surfaced to the operator**
  — distinct from a descriptive mention or an `intended` / `outside-scope` classification. The Phase
  5 "escalates / a single miss fails" gate is scored against this concrete output: a planted gross
  regression is **"caught" iff** the referee emits an `unintended`-or-`ambiguous` finding localized
  to it. This keeps the referee strictly advisory (it never auto-fails a build) while making the
  *trust gate's* pass/fail mechanically evaluable.
- **v1 reliability = Claude stability sampling, labeled as such** (repeat runs detect flake; this is
  **NOT diversity/quorum** and may not back a "high-confidence" verdict). Genuine cross-family quorum
  is phase 2 (gated on the vision-adapter conformance of clause H1).

### Numeric drift — an EXISTING pixel-diff tool on DOM-locator stable regions

Numeric drift uses an **existing** pixel-diff tool (Playwright `toHaveScreenshot` / Argos / Percy) —
**never a rolled engine** — on operator-declared **STABLE regions expressed as DOM LOCATORS, not
coordinate boxes.** `stableRegions` is a machine-executable contract keyed by
`surface id + route/state + viewport + capture-step`; each region compiles to an existing-tool
primitive (locator-clip / region config). **Locators re-anchor across reflow; coordinate boxes
don't.** **Fail loud** when a region is missing, unresolvable at a viewport, overlaps a dynamic
mask, or covers an intentionally-changed area *(round-5 codex-1 / claude-M1)*.

### Baseline & capture (PNG is the artifact of record)

- **Baseline promotion is an operator state transition.** A screenshot becomes `ACCEPTED` only when
  its manifest is complete, route/state/viewport/capture-config hashes match the surface contract,
  the required viewport matrix is present, dynamic regions are declared, **and the operator
  explicitly promotes it.** Lineage + a `supersedes` reason on replace.
- **The accepted baseline PNG is the artifact of record.** On capture-config change, **invalidate
  the baseline and require operator re-promotion under the new recipe** — do **NOT** synthesize a
  re-capture from the historical git commit (old commits frequently won't build/boot under the
  current toolchain; that swaps a bounded recipe delta for an unbounded app-reproducibility delta)
  *(round-5 H2)*.
- **Capture-config hash covers the DETERMINISTIC recipe** (route, viewport, wait condition, masks)
  **plus a non-secret auth/profile identity** — role, tenant/profile fixture id, feature-flag-set id,
  seeded-data version, setup-script version — and **excludes only secret token material** (rotating
  `storageState` tokens) so the hash doesn't churn every run. This prevents an `admin/flags-A`
  baseline from false-matching an `editor/flags-B` candidate while the hash appears valid
  *(round-6 codex-1 / claude-M3)*. Role is encoded in the `state` axis. **Fail loud** if
  `storageState` is supplied without a named reproducible fixture/profile, or when two candidates
  share `surface+route+state+viewport+capture-step` but resolve different auth principals. Recorded
  for baseline + candidate; masks applied to both. *(Classification is default-deny: an explicit
  allowlist of hashable identity fields, everything else excluded.)*
- **Capture-config contract** (adopter glue, existing executor): the adopter supplies route/URL,
  setup-or-fixture, auth/storageState, viewport matrix, wait condition, and **specific, bounded,
  named, justified** dynamic regions + stable-region locators. design-control orchestrates Playwright
  as the executor; **capturing the right surface is adopter glue, stated plainly.**
- **"Oversized dynamic region" defined (so `status` can warn/block mechanically):** a dynamic region
  is **oversized** if it (a) covers **more than a per-viewport coverage threshold** of the captured
  surface area (v1 default **25%**, operator-tunable), **or** (b) **overlaps any declared
  `stableRegion` or change-scope `protected invariant`.** Either condition trips `status`
  (warn-then-block); a region that masks an invariant-bearing panel is the failure this catches. This
  is what makes the Phase 5 "oversized dynamic region is caught or escalated" acceptance falsifiable.
- **Baselines are a matrix** keyed by `surface id + route/state + viewport + capture-step`;
  referee-preview `status` refuses completion when candidate screenshots don't cover the required
  matrix (unless the change-scope explicitly retires/replaces a cell with operator approval).

## Acceptance Criteria

**`v1-scaffold` (acceptance is independent — runnable with zero referee):**

- [ ] `check-mockup-lofi` is an **allowlist on *both* axes** (element/attribute **and** codepoint),
      with the **stylesheet identity pin** invariant asserted. Its **adversarial validator rejects
      every polish-leakage case**: inline-style / `<style>` / `<script>` / `data:` / external-resource
      / presentational-attr leakage, **emoji-as-icon**, and **𝐌𝐚𝐭𝐡-bold-heading** text leakage. A
      hand-authored lo-fi wireframe **passes** — verified against a **small positive corpus of
      diverse legitimate wireframes**, not a single fixture. The engine-authored wireframe is
      constrained by the **same** lint.
- [ ] Design-language spec **link-liveness is static against source** (no app boot); a **dead
      selector is flagged.** The schema validates that **each rule carries ≥ 1 example reference**
      (structural-presence check — a rule with zero examples is rejected; verifying the example still
      *matches* live UI is `spec-truthfulness`, named-deferred). The spec is **hand-authorable** —
      scaffold completion does not require the engine; the `translate-design-language` accelerator
      (when `/frontend-design` is present) produces a spec linked to live source and passes adapter
      conformance.
- [ ] ACCEPTED/REJECTED archive **round-trips** (a decision + its links). `design-control status`
      **refuses "complete"** on a missing wireframe and **never reads referee verdict content**.
      Status distinguishes a **driving** wireframe from a retroactive **`derived`** one via
      provenance.
- [ ] Referee-request manifest **schema validation rejects a malformed manifest**; referee-control
      fields are validated **when supplied** but are **optional in scaffold mode** (a scaffold
      manifest omitting them is **valid**; only a referee-preview manifest requires them). The
      **engine-adapter preflight fails loud when `/frontend-design` is absent**, while **manual
      authoring still works** — and the preflight precedes the first engine-consuming skill.

**`v1-referee-preview` (acceptance is adversarial — the referee earns trust empirically):**

- [ ] The referee **escalates** (not merely "emits findings") on **every** planted **GROSS
      regression** (see Definitions) across **≥ 2 instances per gross class on ≥ 2 distinct
      surfaces**, with the **viewport-relative classes (below-fold + occlusion/overlap) planted at
      BOTH declared viewports** (desktop ≥ 1280 + phone ≤ 390 — per `ui-verification.md` §
      Dual-viewport; a below-fold or phone-only overlap appears at one viewport and not the other) —
      a **single miss fails the gate** (gross = must-catch-all; the gate exists because LLM judges
      have missed gross defects).
- [ ] **Negative / specificity arm:** across a planted set of **≥ 5** **unchanged** +
      **legitimately-changed-but-intended** pairs, the referee over-escalates on **≤ 20% of the set**
      (the **ratio governs** at any set size; the v1 set is sized at 5, so ≤ 1) — a referee that
      cries "regression" on everything **fails**. *(Thresholds are the v1 gate's starting values,
      operator-tunable; the point is that concrete numbers exist so the gate is mechanically
      checkable.)*
- [ ] Existing-tool **stable-region pixel-diff catches a planted numeric drift** in a declared-stable
      DOM locator.
- [ ] **Stale screenshot / wrong viewport / oversized dynamic region** are caught or escalated; a
      planted **gross design-language violation** (missing / wrong signature component; palette
      swapped to an obviously different family) is caught or escalated. *(Subtle token drift is out
      of the referee's scope — see The referee.)*

Until the referee-preview set passes, **its output is optional evidence and no "catches these cases"
claim ships.**

**Dogfood (two arms; the scaffold arm is the `v1-scaffold` ship gate):**

- [ ] **Scaffold arm (must pass to ship `v1-scaffold`):** the **sites→lanes studio content-browser +
      scrapbook redesign** runs the loop **wireframe → pick → spec → implement → archive — NO
      referee** — across **≥ 2 diverse surfaces**; the plugin **loads via the marketplace**. The
      "spec" step is **hand-authored OR via the `translate-design-language` accelerator**, and **≥ 1
      of the ≥ 2 surfaces MUST run engine-absent** — a hand-authored spec with the **preflight
      confirming `/frontend-design` absent** — as the integrated end-to-end witness that the scaffold
      needs no engine. *(Do not bake `translate-design-language` into the canonical loop — that would
      make the scaffold ship gate engine-dependent, contradicting "the scaffold genuinely needs
      neither.")*
- [ ] **Referee arm (required only to ship `v1-referee-preview`; conditional on the Phase 5 gate):**
      the referee produces spirit + letter + gross-regression evidence at **both** viewports.

**If the referee never earns trust (Phase 5 gate unmet), v1 ships scaffold-only** — the referee
remains optional evidence and no "catches these cases" claim ships. Portability is validated **only
on the deskwork studio**.

## Out of Scope (v1 — captured, named-deferred; not hidden)

- **Any roll-your-own visual / pixel / determinism engine** — this is **the commitment, not a
  deferral.** Pixel regression, if ever needed, uses an **existing** tool (Playwright
  `toHaveScreenshot` / Percy / Argos / Chromatic). *(Boundary to draw in implementation: static
  text/DOM allowlisting and capture-recipe hashing are **configuration validation**, not a
  determinism **engine**; the prohibited thing is runtime visual/pixel comparison logic.)*
- **Cross-family referee quorum / design-barrage engine battery** — phase 2, **gated on demonstrating
  per-family *vision*-adapter conformance** (the text-diff audit-barrage harness does **not**
  generalize to image ingestion).
- **Cross-agent portability** — render-framework-independent, **NOT** agent-independent; a referee
  engine is required (v1 ships one conformant Claude adapter).
- **Runtime dead-CSS detection** and **spec-truthfulness** (link-liveness ≠ truthfulness) — named-
  deferred.
- **Link-liveness on non-author-written CSS** — utility frameworks (Tailwind: classes are *composed*,
  not defined), CSS-in-JS (selectors generated at build/runtime), hashed CSS-Modules names — have no
  clear "defined in source" meaning; v1's static check is scoped to author-written CSS selectors
  (validated on the deskwork studio). Resolving link-liveness for those stacks is deferred.
- **Semantic stability verification of `stableRegions`** (detecting a mis-declared region whose
  content legitimately varies) — v1's stable-region checks are **structural** (resolve / overlap /
  covers-changed); semantic stability is the operator's declared assertion. **v1 ships structural-
  only; a semantic-stability sampling check is named-deferred — NOT a Phase 5 obligation** (no
  dangling "resolve later" commitment).
- Living styleguide gallery (design-language rendered from real components, shot device-free);
  WebKit/iOS coverage (real iOS = manual/real-device; Linux-WebKit ≠ iOS Safari); waypoint auto-fire;
  per-exploration-type lint profiles; a11y/keyboard review; broader pixel regression beyond declared
  stable regions; deskwork `docs/studio-design/` migration onto the design-control archive.

## Technical Approach

A **discipline/orchestration plugin** — standalone (its own archive primitive); enforcement in
**skills / CLI verbs, never git hooks** (per `.claude/rules/enforcement-lives-in-skills.md`).
**Build order inverted:** ship the scaffold first (no referee risk); build the referee as a
constrained evidence-spike last, gated on its falsification set. **TDD-shaped:** each task writes
failing tests first, then minimal implementation. Render-framework-independent (the referee looks at
a screenshot) — NOT agent-independent (a referee engine is required; declared cross-plugin dependency
+ fail-loud preflight). **`/frontend-design` is the engine, not a tool we build** — any UI/CSS
authored here (the sketch-kit) is a **static lo-fi convention**; visual verification is
`/frontend-design`. Implementation runs in a **separate session** against the `design-control`
worktree via `/dw-lifecycle:implement`.

## Phase 2-of-product (captured; out of v1)

Living styleguide gallery (design-language rendered from real components, shot device-free);
**design-barrage** (cross-family referee quorum + configurable engine battery, gated on per-family
vision-adapter conformance — the text-diff audit-barrage harness does NOT generalize to image
ingestion); WebKit/iOS; waypoint auto-fire; per-exploration-type lint profiles; a11y/keyboard review;
broader existing-tool pixel regression; deskwork `docs/studio-design/` migration onto the
design-control archive.
