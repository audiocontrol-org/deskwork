---
slug: design-control
title: design-control — portable UX/UI surface-change discipline
targetVersion: "1.0"
date: 2026-06-05
parentIssue: 
deskwork:
  id: 60692084-08dc-4395-b861-7c66ec523743
---

# PRD: design-control — portable UX/UI surface-change discipline

## Problem Statement

Changing a UI surface "blind" degenerates into a screenshot-by-screenshot correction loop (audiocontrol S-550: ~32 surfaces entered scope, zero found proactively by the agent). Root cause: mockups did double duty (UX + visual design), so stale detail shipped as if intended and visual identity had no durable home. A hard-won discipline fixes it: model the change as a deliberately lo-fi wireframe (UX intent, can't be mistaken for implementation), keep visual identity in a settled design language, and verify by *looking* at the realized thing against specific criteria. That discipline is trapped in one sibling repo; **design-control productizes it as a portable deskwork plugin.**

## Solution

A deskwork marketplace plugin that productizes the discipline as **workflow tooling orchestrating an existing engine — `/frontend-design` — with NO roll-your-own visual-verification engine** (the load-bearing commitment; a custom pixel/determinism engine was killed across two adversarial audit-barrage rounds). `/frontend-design` is the single proven engine threaded through three concerns, anchored by two durable reference artifacts: a **lo-fi wireframe** (UX *spirit*) and a **design-language spec** (visual *letter*). The loop: author a lo-fi wireframe (works out the UX) → operator picks → `/frontend-design` translates intent into the project's local design language → implement against it → `/frontend-design` **referees** a screenshot against the spirit of the wireframe and the letter of the spec (advisory evidence, never a gate). v1 ships in two modes: **`v1-scaffold`** (wireframe kit + allowlist lint + design-language spec + archive + `status`; zero referee dependency) and a gated **`v1-referee-preview`** (the advisory referee, which must earn trust via an adversarial falsification set). Canonical converged design: [`docs/superpowers/specs/2026-06-04-design-control-design.md`](../../../superpowers/specs/2026-06-04-design-control-design.md) (11 audit-barrage rounds → two consecutive zero-HIGH). Companion thesis: [`DESIGN-DISCIPLINE-THESIS.md`](../../../../DESIGN-DISCIPLINE-THESIS.md).

## Acceptance Criteria

- [ ] **v1-scaffold ships independently:** the `check-mockup-lofi` lint is an allowlist on *both* the element/attribute and codepoint axes, and its adversarial validator rejects every polish-leakage case (inline-style/`<style>`/`<script>`/`data:`/external-resource/presentational-attr, emoji-as-icon, math-alphanumeric text); a hand-authored lo-fi wireframe passes.
- [ ] Design-language spec link-liveness is **static against source** (no app boot); a dead selector is flagged.
- [ ] ACCEPTED/REJECTED archive round-trips; `design-control status` refuses "complete" on missing authoring artifacts and never reads referee verdicts.
- [ ] Referee-request manifest schema validation rejects a malformed manifest; the engine-adapter preflight fails loud when `/frontend-design` is absent, while manual authoring still works.
- [ ] **v1-referee-preview earns trust:** the referee escalates on planted GROSS regressions (occluded element; panel below the fold) across multiple instances; existing-tool pixel-diff on DOM-locator stable regions catches a planted numeric drift; stale-screenshot / wrong-viewport / oversized-dynamic-region / design-language-violation are caught or escalated. Until this passes, referee output is optional evidence.
- [ ] **Dogfood:** the sites→lanes studio content-browser + scrapbook redesign runs the full loop end-to-end across ≥2 surfaces; the plugin loads via the marketplace.

## Out of Scope (v1 — captured, deferred)

- **Any roll-your-own visual / pixel / determinism engine** (the commitment, not a deferral). Pixel regression, if ever needed, uses an *existing* tool (Playwright `toHaveScreenshot` / Percy / Argos / Chromatic).
- **Cross-family referee quorum / design-barrage engine battery** — phase 2, gated on demonstrating per-family *vision*-adapter conformance (the text-diff audit-barrage harness does not generalize to image ingestion).
- Living styleguide gallery; WebKit/iOS coverage (real iOS = manual/real-device); waypoint auto-fire; per-exploration-type lint profiles; a11y/keyboard review; runtime dead-CSS / spec-truthfulness checks; deskwork `docs/studio-design/` migration onto the archive primitive.
- **Cross-agent portability:** render-framework-independent, NOT agent-independent — a referee engine is required (v1 ships one conformant Claude adapter).

## Technical Approach

A discipline/orchestration plugin (standalone; own archive primitive; enforcement in skills/CLI verbs, never git hooks). **Build order inverted:** ship the scaffold first (no referee risk); build the referee as a constrained evidence-spike last, gated on its falsification set. Render-framework-independent (the referee looks at a screenshot) — NOT agent-independent (a referee engine is required; declared cross-plugin dependency + fail-loud preflight).
