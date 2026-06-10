# Sketch-kit visual-language decision

**Date:** 2026-06-05
**Feature:** design-control (Phase 1, task 2)
**Driver:** `/frontend-design` produced three lo-fi directions; operator decided.

## Decision

**Ship all three lo-fi visual languages as adopter-selectable THEMES**, not a single
picked aesthetic. Operator rationale: *"they are both appropriate for different
projects … offer a choice between the three to the operator [adopter]."*

The three directions (mockups in this directory):

| Theme class | Direction | Lo-fi language |
|---|---|---|
| `sk-theme-marker` | A — Marker Sketch | hand-drawn font, wobbly borders, paper texture, one marker-red accent |
| `sk-theme-blueprint` | B — Blueprint Grid | engineering schematic: blue grid, mono labels, drafting-yellow accent, corner ticks |
| `sk-theme-grayscale` | C — Grayscale Block | flat grayscale, dashed outlines, solid gray placeholder blocks (most neutral) |

## Mechanism (preserves the converged spec's hard invariant)

The converged design (`docs/superpowers/specs/2026-06-04-design-control-design.md`
§ Wireframe authoring, round-8) pins **exactly one** sketch-kit `<link rel=stylesheet>`
by canonical path + content hash. Multi-theme is implemented WITHOUT breaking that:

- **One** `sketch-kit.css` carries the structural `.sk-*` base + three theme blocks,
  each scoped under a root class (`.sk-theme-marker` / `.sk-theme-blueprint` /
  `.sk-theme-grayscale`).
- The adopter selects a theme via `<body class="sk sk-theme-blueprint">`. A default
  theme applies when no `sk-theme-*` class is present.
- Still **one** identity-pinned stylesheet; the theme is just a class in the closed
  `.sk-*` vocabulary.

## Consequences captured (not deferred)

1. **Phase 1 task 3 (allowlist lint):** the closed `.sk-*` set must include
   `.sk-theme-{marker,blueprint,grayscale}`. The single-pinned-stylesheet
   identity-pin invariant is unchanged (still one CSS file).
2. **Font bundling:** grows from one OFL font to the set the themes need — a
   hand-drawn face (marker) + a mono face (blueprint); grayscale uses a plain
   system stack (no bundled font). All bundled locally, referenced only from the
   pinned stylesheet (no external resources, no `data:` URIs).

## Status of the elaboration vs. the converged spec

This is an **elaboration**, not a contradiction: the single-`<link>` identity-pin
invariant survives intact. No amendment to the converged design doc is required;
this DECISION.md is the durable record of the multi-theme choice.
