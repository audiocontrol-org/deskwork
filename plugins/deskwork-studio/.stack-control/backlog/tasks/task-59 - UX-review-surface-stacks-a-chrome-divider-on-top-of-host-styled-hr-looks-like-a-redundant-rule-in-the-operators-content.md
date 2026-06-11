---
id: TASK-59
title: >-
  UX: review surface stacks a chrome divider on top of host-styled <hr>; looks
  like a redundant rule in the operator's content
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-229
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## UX: studio review surface stacks a chrome divider on top of host-styled `<hr>`, looks like a redundant rule in the operator's content

### Symptom

The studio's review surface (`/dev/editorial-review/entry/<uuid>`) renders the operator's markdown body in the reading column. When the markdown contains a single `---` (a single thematic break), the rendered output shows **two** visible rules stacked vertically:

1. Whatever rule the host site's CSS applies to `<hr>` (in our case, audiocontrol.org's `.rule-accent` — a short, centered, primary-color stroke with a phosphor glow)
2. A long full-width thin hairline below it, added by the studio chrome as a content-block separator

Result: the operator sees what looks like a redundant double-rule in their content and asks the agent whether the markdown has a typo. The markdown is clean — one `<hr>` per section transition — and production renders cleanly with just rule #1. But in the studio review surface, the chrome's section divider visually collides with the host's styled `<hr>`.

### Reproduction

1. Project with a host site that styles `<hr>` to a non-default visual (audiocontrol uses `.rule-accent`: short, centered, colored, glowed).
2. Operator's markdown body has section transitions written as a single `---`.
3. Open the entry-review page (`/dev/editorial-review/entry/<uuid>`).
4. Observe the reading column at any section transition: the host's styled rule appears, AND a long full-width thin hairline appears just below it.

In our case (`midi-to-mcu-macro-bridge`, Drafting v3), each of the 5 section breaks shows the doubled rule. Operator screenshot showed the short centered amber rule above a long full-width hairline; markdown has only one `---` at that point.

### Why it's a bug, not a feature

- **It misleads the operator.** A reasonable read of the rendered output is "I have two rules in my markdown — one looks intentional, one is a typo." The operator may try to remove a `---` from their markdown to "fix" the redundancy, which would actually break their content.
- **It diverges from production.** The studio is supposed to be a faithful preview of what the host site will publish. A divider that exists only in the studio chrome (and disappears in production) is a divergence from that contract.
- **The chrome divider isn't doing useful work here.** Section transitions in the markdown are already visually marked by the host's styled `<hr>`. The chrome divider stacks on top of an existing visual signal; it doesn't add information.

### Likely cause

The studio's reading-column layout probably wraps each rendered content block (or each "page section") in a container with its own bottom-border or margin-rule for visual separation. That works in isolation but collides with `<hr>` content from the markdown. The fix shape is one of:

1. **Drop the chrome divider entirely.** The host's `<hr>` is already there; trust it. (Best if the studio can rely on the host's stylesheet to separate sections.)
2. **Suppress the chrome divider when the prior content block ends in an `<hr>`.** A CSS adjacent-sibling rule (`hr + .chrome-divider { display: none }`) or equivalent server-side check.
3. **Make the chrome divider visually distinct enough that it's clearly chrome** (e.g., dashed, off to the side, much lighter weight). This still adds noise but at least signals "I'm the studio, not your content."

### Acceptance

- Operator's markdown body with `---` section transitions renders in the studio review surface with only the host-styled rule visible at each transition. No stacked redundant chrome divider.
- The studio's content-block separation (between document sections, between metadata + body, etc.) remains visually clear without colliding with operator-authored `<hr>` content.

### Related

- audiocontrol-org/deskwork#154 — "Studio review surface needs more work" (umbrella).
- audiocontrol-org/deskwork#228 — Save button stays inactive (separate review-surface bug, same component).

### Origin

Surfaced 2026-05-06 mid-session producing a worked-example dispatch (`midi-to-mcu-macro-bridge` at Drafting v3). Operator looked at the rendered review surface and asked: *"Are these redundant section separators baked into the markdown, or is it just the studio review surface being fancy?"* Markdown was clean; the doubled-rule appearance was the studio's chrome divider stacking on top of the audiocontrol-styled `<hr>`.
<!-- SECTION:DESCRIPTION:END -->
