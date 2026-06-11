---
doc-grammar: roadmap
---

# Roadmap

The governed dependency graph of this project's features. Each item is a
heading-keyed unit identified by its `<phase>:<kind>/<slug>` id; manage the
graph with `stackctl roadmap` — do not hand-edit.

## impl:feature/phase-1-seam-wireframe-kit-lint
- status: in-flight
- spec: specs/001-design-control

## impl:feature/phase-2-design-language-spec
- status: in-flight
- spec: specs/001-design-control

## impl:feature/phase-3-archive-status
- status: planned
- depends-on: impl:feature/phase-1-seam-wireframe-kit-lint
- spec: specs/001-design-control

## impl:feature/phase-4-referee-manifest-schema
- status: planned
- depends-on: impl:feature/phase-1-seam-wireframe-kit-lint
- spec: specs/001-design-control

## impl:feature/phase-5-referee-preview
- status: planned
- depends-on: impl:feature/phase-4-referee-manifest-schema
- deferred-until: GATED evidence-spike: built last, after the v1-scaffold ships (Phases 1-4); advisory until its adversarial falsification set passes
- spec: specs/001-design-control

## multi:feature/phase-6-dogfood-packaging
- status: planned
- depends-on: impl:feature/phase-1-seam-wireframe-kit-lint, impl:feature/phase-2-design-language-spec, impl:feature/phase-3-archive-status, impl:feature/phase-4-referee-manifest-schema
- spec: specs/001-design-control

## multi:feature/product-phase-2
- status: planned
- deferred-until: post-v1 operator decision (captured out-of-v1 scope: styleguide gallery, design-barrage, WebKit/iOS, waypoint auto-fire, lint profiles, a11y review, broader pixel regression, studio-design migration)
- spec: specs/001-design-control