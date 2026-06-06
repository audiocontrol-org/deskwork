---
slug: design-control
targetVersion: "1.0"
date: 2026-06-05
---

# Workplan — design-control

Derived from [`prd.md`](prd.md) (the design-of-record) and the converged design
`docs/superpowers/specs/2026-06-04-design-control-design.md` (11 audit-barrage rounds, two
consecutive zero-HIGH). Build order is **inverted**: ship `v1-scaffold` first (zero referee
dependency); build the referee as a gated evidence-spike last. TDD-shaped: each task writes failing
tests first, then minimal impl. **Per-phase acceptance must match the PRD's acceptance criteria
verbatim in substance** — when they drift, the PRD wins.

> **Design-shaped feature — `/frontend-design` is the engine, not a tool we build.** Per the
> thesis: never roll your own visual verification. Any UI/CSS authored here (the sketch-kit) is a
> static lo-fi convention; visual verification is `/frontend-design`. Implementation runs in a
> **separate session** against the `design-control` worktree (`/dw-lifecycle:implement`).

> **Definitions** (see PRD § Definitions): a **surface** is an operator-declared named UI region
> (`surface id`), verified across `route/state + viewport + capture-step` (a `capture-step` is a
> named point in a surface's capture sequence — `default` / a post-interaction state / a scroll
> position). A **GROSS regression** is one perceptible without pixel measurement (one of the closed
> v1 seven-class list in PRD § Definitions); sub-component pixel drift is NOT gross and routes to the
> stable-region pixel-diff arm.

> **Phase sequencing & the inversion.** Phase numbers are reference labels, **not a strict build
> sequence.** The `v1-scaffold` ship gate — plugin packaging + the scaffold dogfood arm (Phase 6
> scaffold arm) — depends **only on Phases 1–4 and NOT on Phase 5 (the referee).** It is intended to
> ship **before** Phase 5 begins; that is what "ship the scaffold first" means. Phase 5 (referee) and
> the Phase 6 referee arm are the gated, last-built track.

## Phase 1 — Engine-adapter seam + lo-fi wireframe kit + allowlist lint (v1-scaffold)

- [x] **Engine-adapter interface declaration + fail-loud preflight — FIRST, before any engine-
      consuming skill.** Declare the interface (`author-wireframe`, `translate-design-language`,
      `referee-screenshot`) with conformance JSON request/response schemas (adapter echoes manifest
      ids, image hashes, model identity, rubric-item ids; defined confidence + failure modes), and a
      **preflight presence check that fails loud**, scoped to adapter **execution** paths and NOT to
      manual authoring. `/frontend-design` is the default Claude adapter; the dependency is declared
      cross-plugin. *(Pulled into Phase 1 so the preflight precedes the first engine-consuming skill —
      `author-wireframe` is consumed below.)*
- [x] `sketch-kit.css` + `.sk-*` vocabulary + self-labeling WIREFRAME banner + a fixed `.sk-img`
      placeholder; bundled local OFL hand-drawn webfont (aesthetic only, not a determinism claim).
      **Multi-theme** (operator decision 2026-06-05, see
      `mockups/sketch-kit/DECISION.md`): ships THREE adopter-selectable lo-fi visual languages
      (`sk-theme-marker` / `sk-theme-blueprint` / `sk-theme-grayscale`) inside the SINGLE
      identity-pinnable `sketch-kit.css` — the converged spec's one-`<link>` invariant is
      preserved (theme = a `.sk-theme-*` root class within the closed `.sk-*` set). Bundles
      Patrick Hand (marker) + Space Mono (blueprint) OFL woff2; grayscale uses a plain system
      stack. SSOT module `@/wireframe-kit/sketch-kit` exports the asset paths, closed vocabulary,
      and theme/font manifests. 21 tests (self-contained: no http/https/data:/`@import`, all
      `url()`s + fonts resolve on disk, one `<link>`, example uses only vocabulary tokens).
- [x] `check-mockup-lofi` lint as an **element/attribute allowlist** (permit only the pinned
      sketch-kit `<link>`, `.sk-*` tags **including `.sk-theme-{marker,blueprint,grayscale}`**,
      `.sk-img`, a closed set of plain structural tags; reject
      all external resources — `<img src>`/`<picture>`/`srcset`/`<iframe>`/`<object>`/`<embed>` —
      `<script>`/`<style>`/inline `style=`, `data:` URIs, presentational attributes). The closed
      `.sk-*` set is sourced from `SK_VOCABULARY` in `@/wireframe-kit/sketch-kit` (single source
      of truth; multi-theme adds only the three `.sk-theme-*` classes, one pinned stylesheet
      unchanged). **Implemented** `@/lint/check-mockup-lofi` on parse5 (WHATWG tree → no
      parser-differential leakage) as a `lintWireframe(html)` rule pipeline. Rules: disallowed-
      element, disallowed-attribute (catch-all), inline-style, event-handler, presentational-
      attribute, data-uri (delimiter-anchored, no "metadata" false-positive), external-resource
      (resource-loading attrs only), disallowed-uri-scheme (javascript:/vbscript: in href),
      disallowed-link-rel (only rel=stylesheet permitted). Class VALUES are intentionally
      unconstrained (inert under the pinned stylesheet, round-8). **Scope: axis 1 only** — the
      stylesheet identity-pin (path+hash) is the next task; the codepoint allowlist is task 5; the
      adversarial corpus is tasks 6–7. The pipeline is the seam those extend. 27 tests incl. the
      shipped example-wireframe passing with zero findings.
- [x] Stylesheet **identity pin**: the single permitted `<link>` matched by canonical resolved
      path + content hash/SRI; assert the "arbitrary class values are inert because the pinned
      stylesheet is the sole CSS source" invariant. **Implemented** `@/lint/stylesheet-pin`
      (`checkStylesheetIdentity(html, pin)` + `buildSketchKitPin(baseDir)` + `hashStylesheet`
      sha256 SRI-format). Rules: stylesheet-missing, stylesheet-not-singleton (exactly one — "not
      merely at most one"), stylesheet-path-mismatch (canonical resolved path), stylesheet-
      unresolvable, stylesheet-hash-mismatch (content identity), stylesheet-sri-mismatch (when an
      `integrity` attr is present). Wired into `lintWireframe(html, { stylesheetPin })` as an
      OPT-IN axis (the pure axis-1 lint stays filesystem-free); shared rule taxonomy extracted to
      `@/lint/types` to avoid a cycle. The inert-class invariant is asserted by a test: arbitrary
      class values pass ONLY alongside a verified pin. 12 tests (real-fs temp fixtures, no mocks).
- [ ] **Codepoint allowlist** for text content (permit only Basic-Latin letters/digits +
      enumerated punctuation + enumerated whitespace [space/newline/tab] + enumerated accented
      Latin; reject math-alphanumeric/enclosed/fullwidth/fraktur/emoji/box-drawing/tag-chars/
      variation-selectors/zero-width).
- [ ] Adversarial validator: the lint MUST reject inline-style / `<style>` / `<script>` / `data:`
      / external-resource / presentational-attr leakage AND emoji-as-icon AND `𝐌𝐚𝐭𝐡`-bold-heading
      text leakage. Grandfather allowlist entries require an issue link + expiry.
- [ ] **Positive corpus** — a *small corpus of diverse legitimate wireframes* (accented Latin,
      tabs/newlines, `.sk-img`, common structural tags, inert arbitrary `class` values under the
      pinned stylesheet) that the lint must pass — **NOT a single fixture** (an over-strict allowlist
      that passes one hand-picked wireframe but rejects diverse legitimate ones is the characteristic
      allowlist failure).
- [ ] `/design-control:wireframe <change>` authoring skill (operator-driven + lint-enforced; the
      engine `author-wireframe` method is an optional accelerator routed through the same lint).
- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **snapshot the auto-derived
      draft at derivation time** (stored alongside provenance) so the edit-diff has a baseline;
      **acceptance of a `derived` artifact requires a recorded operator edit** (non-empty diff
      between the stored auto-derived snapshot and the accepted version), not just a state
      transition; does NOT satisfy a "wireframe drove implementation" claim.

**Acceptance:** the engine-adapter **preflight fails loud when `/frontend-design` is absent while
manual authoring still works**, and the preflight **precedes the first engine-consuming skill**; the
lint is allowlist-shaped on both axes with the stylesheet identity-pin invariant asserted; the
adversarial validator's leakage cases (incl. emoji-as-icon + `𝐌𝐚𝐭𝐡`-bold) all reject; a **diverse
positive corpus** passes (not a single fixture); the engine-authored wireframe is constrained by the
same lint; a `derived` artifact cannot be accepted without a recorded operator edit.

## Phase 2 — Design-language spec convention (v1-scaffold)

- [ ] Markdown spec schema (palette/type/spacing tokens + signature-component vocabulary +
      do/don't), each rule linked to a live CSS file/class + ≥1 current example. The spec is a
      **hand-authorable markdown artifact** — **scaffold completion does NOT require the engine.**
- [ ] **Static** link-liveness check (selector/class must be *defined in author-written source*;
      **no app boot**). Scoped to author-written CSS selectors/classes; utility-framework / CSS-in-JS
      / hashed CSS-Modules resolution is **not validated in v1** (named-deferred). Runtime dead-CSS +
      spec-truthfulness are named-deferred.
- [ ] **Example-presence validation:** the schema rejects a rule with **zero example references**
      (each rule carries ≥1 example). Structural-presence only — verifying the example still matches
      live UI is `spec-truthfulness` (named-deferred).
- [ ] `translate-design-language` skill (uses `/frontend-design`) — an **optional accelerator** that
      drafts/maintains the spec from approved wireframe intent; its engine conformance is exercised
      **only when `/frontend-design` is present.**

**Acceptance (two paths):** **(scaffold, required)** an operator can hand-author a spec; static
link-liveness flags a **dead selector** with **no app boot** — engine absent; **and the schema
rejects a rule with zero example references** (≥1 example per rule, structural-presence only);
**(accelerator, when present)** the `translate-design-language` skill produces a spec linked to live
source and passes adapter conformance. Scaffold completion never depends on engine presence.

## Phase 3 — Archive primitive + `design-control status` (v1-scaffold)

- [ ] ACCEPTED/REJECTED exploration archive primitive (briefs + lo-fi wireframe visual; decision
      states/links: proposal, accepted wireframe, impl commit, rejected rationale, supersedes).
      Archive writes generated by the skill flow, not "remember to archive."
- [ ] `design-control status` — per surface, the next required action; refuses "complete" while
      authoring artifacts are missing. Keys on **manifest structure / artifact presence**, never on
      referee verdict content. Scaffold-mode gates on: missing wireframe, unaccepted decision,
      **dead-link spec** (always ships), **stale surface** (feasibility-gated, below), malformed
      manifest — *dead-link and stale-surface are two distinct mechanisms, gated separately.*
- [ ] **Derived-artifact gate:** `status` refuses to accept an unedited `derived` artifact (the
      recorded-operator-edit check from Phase 1); distinguishes a **driving** wireframe from a
      retroactive **`derived`** one via provenance.
- [ ] **Stale-surface** map: `surface-id → source-files/routes` derived from the import/route graph.
      **Feasibility-gated** — if feasible it ships **with its own acceptance** (`status` flags a
      surface whose mapped source drifted); if infeasible it is an **explicit operator-approved
      descope recorded here**, never a silent implementer cut. The **dead-link half ships
      regardless.**

**Acceptance:** `status` refuses "complete" on a missing wireframe; refuses to accept an unedited
`derived` artifact; an archive decision round-trips with its links; `status` never reads referee
verdicts. **Staleness:** EITHER `status` flags a surface with drifted mapped source (feasible path)
OR the workplan records an explicit operator-approved descope of stale-surface detection (the
dead-link gate ships either way). The two conditions (dead-link vs stale-surface) are separately
testable.

## Phase 4 — Referee-request manifest schema validation (v1-scaffold)

- [ ] Referee-request manifest **schema**. **Scaffold-required** fields: surface id, route/state,
      viewport(s) desktop≥1280 + phone≤390, wireframe path+hash, spec path+version+hash, impl
      commit, change-intent brief. **Schema validation only** (no execution, no capture). *(The
      engine-adapter interface itself is declared in Phase 1; Phase 4 is the request **manifest**
      schema.)*
- [ ] **Schema also DEFINES the later referee-control fields** — baseline+candidate paths,
      `stableRegions` DOM-locators, governed dynamic regions, capture-config identity, per-viewport
      identity, auth/principal metadata — **mode-aware: validated-when-present (structure-only) but
      OPTIONAL in scaffold mode.** A scaffold manifest that **omits** them is **valid**; only a
      **referee-preview manifest** (visual-review opt-in) **requires** them. This is how Phase 4 ships
      a schema Phase 5 won't break **without** making referee data a scaffold-completion requirement.

**Acceptance:** a malformed manifest is rejected by schema; a manifest that **supplies** a
referee-control field in malformed shape is rejected; a **scaffold-mode manifest that omits** the
referee-control fields is **accepted as valid** (the `v1-scaffold` "NO capture/baseline" boundary is
preserved); a **referee-preview manifest** that omits a required referee field is rejected.

## Phase 5 — `v1-referee-preview` evidence-spike (GATED; advisory only)

- [ ] `referee-screenshot` Claude-vision shim adapter (one conformant adapter in v1).
- [ ] Two-image **GROSS**-regression judgment (candidate + promoted baseline; GROSS per PRD §
      Definitions); spirit and letter as **two separate questions**; structured change-scope
      classification (intended/unintended/ambiguous/outside-scope; ambiguous → operator). The referee
      owns **gross** design-language violations (missing/wrong signature component; palette swapped to
      an obviously different family); **subtle** token drift routes to the pixel-diff arm. Advisory
      evidence, never an auto-gate.
- [ ] Numeric drift via an **existing** pixel-diff tool (Playwright `toHaveScreenshot` / Argos /
      Percy) on operator-declared **DOM-locator** `stableRegions` (keyed **`surface id + route/state +
      viewport + capture-step`** — `state` included, matching the PRD key exactly: a locator valid in
      one state can be invalid/semantically different in another; fail-loud on
      missing/unresolvable/overlap/covers-changed).
- [ ] Capture-config contract + identity hash (deterministic recipe + non-secret auth/profile
      identity in; secret tokens out; default-deny field classification; fail-loud on unnamed
      storageState / principal mismatch).
- [ ] Baseline promotion as an operator state transition; PNG is the artifact of record;
      invalidate-and-re-promote on recipe change (never git re-synth); per-viewport baseline
      matrix; governed dynamic regions (specific/bounded/named/justified). **"Oversized" is the
      concrete rule** (PRD § Baseline & capture): a region covering > **25%** of the captured surface
      (v1 default, operator-tunable) **or** overlapping any `stableRegion` / protected invariant trips
      `status` (warn-then-block).
- [ ] Claude **stability sampling** labeled as such (NOT diversity/quorum).
- [ ] **"Escalation" definition** wired into the gate: an escalation = a referee finding classified
      **`unintended` or `ambiguous`** and localized to a region (distinct from a mention or an
      `intended`/`outside-scope` classification). A planted gross regression is "caught" iff the
      referee emits such a localized finding. (Keeps the referee strictly advisory while making the
      trust gate scorable — PRD § The referee.)
- [ ] **Falsification set** — planted cases covering **all seven v1 gross classes** (PRD §
      Definitions) at ≥2 instances per class on ≥2 distinct surfaces; the **viewport-relative classes
      (≥ class 3 below-fold, plus the occlusion/overlap classes 1–2) are planted at BOTH declared
      viewports** (desktop ≥1280 + phone ≤390) — a below-fold or phone-only overlap appears at one
      viewport and not the other (per `ui-verification.md` § Dual-viewport); **plus clearly-subtle**
      cases (must NOT be escalated as gross), plus **≥5 unchanged/intended-change pairs** for the
      specificity arm.

**Acceptance (the referee earns trust empirically; thresholds are v1 starting values, operator-
tunable):** the referee **escalates** (emits an `unintended`/`ambiguous` localized finding) on
**EVERY** planted gross regression across **all seven v1 gross classes**, ≥2 instances per class on
≥2 distinct surfaces, with the **viewport-relative classes planted at both declared viewports** — a
**single miss fails**; **negative/specificity arm** — across a set of **≥5**
unchanged + intended-change pairs the referee over-escalates on **≤20% of the set** (ratio governs at
any size; v1 set of 5 ⇒ ≤1), so an escalate-everything referee **fails**; stable-region pixel-diff
catches a planted numeric drift in a declared-stable locator; stale-screenshot / wrong-viewport /
oversized-dynamic-region are caught or escalated, and a **gross** design-language violation is caught
or escalated. Until this set passes, referee output is optional evidence and no "catches these" claim
ships.

## Phase 6 — Dogfood + packaging

> **Realizes the inversion:** the scaffold ship gate (plugin shell + scaffold arm) depends only on
> Phases 1–4 and is intended to ship **before** Phase 5; the referee arm is the gated, last track.

- [ ] **Plugin shell (scaffold ship gate; depends only on Phases 1–4, NOT Phase 5):**
      `plugins/design-control/` — `.claude-plugin/plugin.json`, bin shim, README,
      marketplace.json registration; standalone (own archive primitive).
- [ ] **Scaffold arm (the `v1-scaffold` ship gate; no Phase-5 dependency):** run the sites→lanes
      studio content-browser + scrapbook redesign through **wireframe → pick → spec → implement →
      archive — NO referee** — across **≥2 diverse surfaces**; the plugin loads via the marketplace.
      **At least one of the ≥2 surfaces runs engine-absent** — a **hand-authored** design-language
      spec with the preflight confirming `/frontend-design` absent — so the "scaffold needs no engine"
      claim has an **integrated end-to-end witness**, not only the Phase-2 unit test. (The other
      surface may use the `translate-design-language` accelerator.)
- [ ] **Referee arm (only to ship `v1-referee-preview`; conditional on the Phase 5 gate):** referee
      evidence (spirit + letter + gross-regression) at **both** viewports for the same surfaces.
- [ ] Portability claim validated **only on the deskwork studio**; cross-framework + cross-agent
      via the adapter seam is phase 2.

**Acceptance:** **(scaffold arm, required for v1-scaffold ship)** the redesign was driven by a
wireframe and archived — no referee — across ≥2 surfaces, with **≥1 surface run engine-absent**
(hand-authored spec, preflight confirming `/frontend-design` absent) and the other optionally via the
`translate-design-language` accelerator, and the plugin loads via the marketplace; **(referee arm,
only for v1-referee-preview)** the referee produced spirit+letter+gross-regression evidence at both
viewports, conditional on Phase 5 passing. **If the referee never earns trust, v1 ships
scaffold-only** (referee remains optional evidence).

## Phase 2-of-product (captured; out of v1)

- [ ] Living styleguide gallery (design-language rendered from real components, shot device-free).
- [ ] **design-barrage** — cross-family referee quorum + configurable engine battery (gated on
      demonstrating per-family *vision*-adapter conformance; the text-diff audit-barrage harness
      does NOT generalize to image ingestion).
- [ ] WebKit/iOS (real iOS = manual/real-device; Linux-WebKit ≠ iOS Safari); waypoint auto-fire;
      per-exploration-type lint profiles; a11y/keyboard review; broader existing-tool pixel
      regression; **link-liveness on non-author-written CSS** (Tailwind/CSS-in-JS/CSS-Modules);
      deskwork `docs/studio-design/` migration onto the design-control archive.
