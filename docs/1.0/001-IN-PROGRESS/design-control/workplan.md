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
> (`surface id`), verified across `route/state + viewport + capture-step`. A **GROSS regression** is
> one perceptible without pixel measurement (layout-topology change or removed/duplicated signature
> component); sub-component pixel drift is NOT gross and routes to the stable-region pixel-diff arm.

## Phase 1 — Engine-adapter seam + lo-fi wireframe kit + allowlist lint (v1-scaffold)

- [ ] **Engine-adapter interface declaration + fail-loud preflight — FIRST, before any engine-
      consuming skill.** Declare the interface (`author-wireframe`, `translate-design-language`,
      `referee-screenshot`) with conformance JSON request/response schemas (adapter echoes manifest
      ids, image hashes, model identity, rubric-item ids; defined confidence + failure modes), and a
      **preflight presence check that fails loud**, scoped to adapter **execution** paths and NOT to
      manual authoring. `/frontend-design` is the default Claude adapter; the dependency is declared
      cross-plugin. *(Pulled into Phase 1 so the preflight precedes the first engine-consuming skill —
      `author-wireframe` is consumed below.)*
- [ ] `sketch-kit.css` + `.sk-*` vocabulary + self-labeling WIREFRAME banner + a fixed `.sk-img`
      placeholder; bundled local OFL hand-drawn webfont (aesthetic only, not a determinism claim).
- [ ] `check-mockup-lofi` lint as an **element/attribute allowlist** (permit only the pinned
      sketch-kit `<link>`, `.sk-*` tags, `.sk-img`, a closed set of plain structural tags; reject
      all external resources — `<img src>`/`<picture>`/`srcset`/`<iframe>`/`<object>`/`<embed>` —
      `<script>`/`<style>`/inline `style=`, `data:` URIs, presentational attributes).
- [ ] Stylesheet **identity pin**: the single permitted `<link>` matched by canonical resolved
      path + content hash/SRI; assert the "arbitrary class values are inert because the pinned
      stylesheet is the sole CSS source" invariant.
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
- [ ] Retroactive path: existing surface → `derived` wireframe/spec; **acceptance of a `derived`
      artifact requires a recorded operator edit** (non-empty diff between the auto-derived draft and
      the accepted version), not just a state transition; does NOT satisfy a "wireframe drove
      implementation" claim.

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
- [ ] `translate-design-language` skill (uses `/frontend-design`) — an **optional accelerator** that
      drafts/maintains the spec from approved wireframe intent; its engine conformance is exercised
      **only when `/frontend-design` is present.**

**Acceptance (two paths):** **(scaffold, required)** an operator can hand-author a spec and static
link-liveness flags a **dead selector** with **no app boot** — engine absent; **(accelerator, when
present)** the `translate-design-language` skill produces a spec linked to live source and passes
adapter conformance. Scaffold completion never depends on engine presence.

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

- [ ] Referee-request manifest **schema** (surface id, route/state, viewport(s) desktop≥1280 +
      phone≤390, wireframe path+hash, spec path+version+hash, baseline+candidate paths, impl
      commit, change-intent brief) + **schema validation only** (no execution, no capture). *(The
      engine-adapter interface itself is declared in Phase 1; Phase 4 is the request **manifest**
      schema.)*
- [ ] **Schema carries the fields later referee controls need** — `stableRegions` DOM-locators,
      governed dynamic regions, capture-config identity, per-viewport identity, auth/principal
      metadata — so Phase 4 does NOT ship a schema Phase 5 must immediately break (validated
      structurally; never executed in scaffold mode).

**Acceptance:** a malformed manifest is rejected by schema; the schema **already contains** the
Phase-5 fields (stableRegions, dynamic regions, capture-config identity, viewport identity,
auth/principal) under structure-only validation; a manifest missing those fields is rejected.

## Phase 5 — `v1-referee-preview` evidence-spike (GATED; advisory only)

- [ ] `referee-screenshot` Claude-vision shim adapter (one conformant adapter in v1).
- [ ] Two-image **GROSS**-regression judgment (candidate + promoted baseline; GROSS per PRD §
      Definitions); spirit and letter as **two separate questions**; structured change-scope
      classification (intended/unintended/ambiguous/outside-scope; ambiguous → operator). The referee
      owns **gross** design-language violations (missing/wrong signature component; palette swapped to
      an obviously different family); **subtle** token drift routes to the pixel-diff arm. Advisory
      evidence, never an auto-gate.
- [ ] Numeric drift via an **existing** pixel-diff tool (Playwright `toHaveScreenshot` / Argos /
      Percy) on operator-declared **DOM-locator** `stableRegions` (keyed surface+route+viewport+
      step; fail-loud on missing/unresolvable/overlap/covers-changed).
- [ ] Capture-config contract + identity hash (deterministic recipe + non-secret auth/profile
      identity in; secret tokens out; default-deny field classification; fail-loud on unnamed
      storageState / principal mismatch).
- [ ] Baseline promotion as an operator state transition; PNG is the artifact of record;
      invalidate-and-re-promote on recipe change (never git re-synth); per-viewport baseline
      matrix; governed dynamic regions (specific/bounded/named/justified; status warns/blocks).
- [ ] Claude **stability sampling** labeled as such (NOT diversity/quorum).
- [ ] **Falsification set** — planted cases spanning **both clearly-gross and clearly-subtle**
      regressions; ≥2 instances per gross class on ≥2 distinct surfaces; ≥5 unchanged/intended-change
      pairs for the specificity arm.

**Acceptance (the referee earns trust empirically; thresholds are v1 starting values, operator-
tunable):** the referee **escalates on EVERY planted GROSS regression** (occluded element; panel
below the fold) across **≥2 instances per gross class on ≥2 distinct surfaces** — a **single miss
fails**; **negative/specificity arm** — across **≥5** unchanged + intended-change pairs the referee
over-escalates on **≤1** (**≤20% false-positive ceiling**), so an escalate-everything referee
**fails**; stable-region pixel-diff catches a planted numeric drift in a declared-stable locator;
stale-screenshot / wrong-viewport / oversized-dynamic-region are caught or escalated, and a **gross**
design-language violation is caught or escalated. Until this set passes, referee output is optional
evidence and no "catches these" claim ships.

## Phase 6 — Dogfood + packaging

- [ ] **Scaffold arm (the `v1-scaffold` ship gate):** run the sites→lanes studio content-browser +
      scrapbook redesign through **wireframe → pick → `translate-design-language` → implement →
      archive — NO referee** — across **≥2 diverse surfaces**; the plugin loads via the marketplace.
- [ ] **Referee arm (only to ship `v1-referee-preview`; conditional on the Phase 5 gate):** referee
      evidence (spirit + letter + gross-regression) at **both** viewports for the same surfaces.
- [ ] Plugin shell (`plugins/design-control/`): `.claude-plugin/plugin.json`, bin shim, README,
      marketplace.json registration; standalone (own archive primitive).
- [ ] Portability claim validated **only on the deskwork studio**; cross-framework + cross-agent
      via the adapter seam is phase 2.

**Acceptance:** **(scaffold arm, required for v1-scaffold ship)** the redesign was driven by a
wireframe, translated via `/frontend-design`, archived — no referee — across ≥2 surfaces, and the
plugin loads via the marketplace; **(referee arm, only for v1-referee-preview)** the referee produced
spirit+letter+gross-regression evidence at both viewports, conditional on Phase 5 passing. **If the
referee never earns trust, v1 ships scaffold-only** (referee remains optional evidence).

## Phase 2-of-product (captured; out of v1)

- [ ] Living styleguide gallery (design-language rendered from real components, shot device-free).
- [ ] **design-barrage** — cross-family referee quorum + configurable engine battery (gated on
      demonstrating per-family *vision*-adapter conformance; the text-diff audit-barrage harness
      does NOT generalize to image ingestion).
- [ ] WebKit/iOS (real iOS = manual/real-device; Linux-WebKit ≠ iOS Safari); waypoint auto-fire;
      per-exploration-type lint profiles; a11y/keyboard review; broader existing-tool pixel
      regression; **link-liveness on non-author-written CSS** (Tailwind/CSS-in-JS/CSS-Modules);
      deskwork `docs/studio-design/` migration onto the design-control archive.
