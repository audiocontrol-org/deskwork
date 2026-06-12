---
id: TASK-35
title: >-
  scope-discovery: primitive-extraction dispatch hygiene (TF-016 from
  audiocontrol pilot)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-290
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

Imported from audiocontrol's `feature/akai-harmonization` tooling-feedback log (TF-016, MISC/medium — open in pilot).

Primitive-extraction dispatches recurrently land integration-layer regressions. Three audit cycles in one pilot session (2026-05-24) caught:
- AcRadioTabs: CSS class-name conflict + invalid ARIA (high)
- AcZoneStrip: callback-index drift + invalid ARIA (medium)
- AcFrequencyResponse + AcEnvelope: wire-format regression + silent 0-index clamp (medium)

The common shape: primitive's API surface changes (different value type, ARIA role, state contract); consumer adapter passes through what the legacy primitive accepted; semantic correctness is lost in the contract delta.

## Suggested fixes (pilot's three options)

1. **Light** — dispatch-brief template addition (mandatory "Consumer-side adapter contract delta" section).
2. **Medium** — controller-side pre-dispatch checklist as `.claude/rules/primitive-extraction-checklist.md`.
3. **Heavy** — sub-agent template self-checks before DONE (integration-layer audit subroutine).

## Relevance to dw-lifecycle

The Phase 5 dispatch-wrapper-prelude.md skill-prose template just shipped in commit `85f416d`. The Light + Medium options could be incorporated as additions to the dispatch-wrapper convention:
- Light: add a "Primitive-extraction dispatch hygiene" section to the prelude template.
- Medium: ship `.dw-lifecycle/rules/primitive-extraction-checklist.md` template that operators copy via `/dw-lifecycle:customize`.
- Heavy: extend `wrap()` to optionally inject an integration-layer audit prelude when the agent type is `ui-engineer` (or similar). Aligns with the existing refactor-marker auto-prelude pattern from Phase 5 Task 3.

## Where to fix

- `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md` — extend the convention with the dispatch-hygiene section.
- `plugins/dw-lifecycle/templates/scope-discovery/primitive-extraction-checklist.md` (NEW) — the Medium-option deliverable.
- `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` — Heavy-option auto-prelude on `ui-engineer` dispatches.

Parent: #273
Pilot reference: audiocontrol akai-harmonization tooling-feedback.md TF-016 (open in pilot).
<!-- SECTION:DESCRIPTION:END -->
