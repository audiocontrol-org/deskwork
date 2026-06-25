---
id: TASK-448
title: >-
  stackctl roadmap reconcile --unorphan mints a duplicate node instead of
  reusing the existing correspondence
status: Done
assignee: []
created_date: '2026-06-25 19:02'
updated_date: '2026-06-25 20:30'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-506
ordinal: 447000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stackctl roadmap reconcile --unorphan <spec-dir>` mints a **new** roadmap node even when an
existing node already corresponds to that spec, producing two nodes for one spec dir. The operator
must then `roadmap remove-node` the duplicate by hand. Unorphan should reuse/attach to an existing
node's correspondence rather than create a parallel one.

## Environment

- stack-control plugin (deskwork cache) version 0.55.1; `stackctl` on PATH
- Host: macOS (darwin 24.6.0), run from the installation root
- Roadmap model: one long-lived `main` branch, numbered spec dirs under `specs/`

## Reproduction

Starting state: an existing roadmap node `design:feature/faithful-capture-substrate` (with a
`design:` design record + `design-approved: yes`) and a spec dir
`specs/010-faithful-capture-substrate` that `reconcile` reports as an orphan (no correspondence
recorded yet):

```
$ stackctl roadmap reconcile
  orphan spec dirs: 1
    - specs/010-faithful-capture-substrate

$ stackctl roadmap reconcile --unorphan specs/010-faithful-capture-substrate --apply
roadmap reconcile --unorphan: resolved specs/010-faithful-capture-substrate into a node
```

The ROADMAP.md diff shows a brand-new node was appended:

```
+## impl:feature/010-faithful-capture-substrate
+- status: planned
+- spec: specs/010-faithful-capture-substrate
```

…even though `design:feature/faithful-capture-substrate` is the real node for this feature (the
design record is literally `…faithful-capture-substrate-design.md`). Result: two nodes for one
spec. The workaround was to set the spec pointer on the design node manually
(`workflow link-spec design:feature/faithful-capture-substrate specs/010-... --apply`) and then
`roadmap remove-node impl:feature/010-faithful-capture-substrate --apply`.

## Expected

When a node already plausibly corresponds to the orphan spec (e.g. a `*:feature/<slug>` node whose
slug matches the spec dir's slug, or whose `design:` pointer is in the same feature family),
`--unorphan` should attach the spec pointer to that existing node — or, at minimum, detect the
likely-existing correspondence and refuse/prompt rather than silently minting a parallel
`impl:feature/<NNN-slug>` node that the operator must then reconcile away.

## Impact

Medium friction: it silently doubles the node count for a feature and leaves the roadmap
internally inconsistent (two nodes, two phase states) until the operator notices and removes the
duplicate. An agent following the reconcile flow could easily proceed against the wrong node.

## Surfaced by

Reconciling spec-010 (faithful-capture-substrate) before `/stack-control:execute`, 2026-06-25.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed on feature/stack-control-hygiene (commit 10100480): reconcile --unorphan now matches an existing node by slug family and attaches the spec (setField) instead of minting a duplicate; refuses zero-write on ambiguous/clobbering matches; mint path preserved when no match. RED-first reconcile-unorphan.test.ts; full suite 415/2645 green. gh-506 open pending release verification.
<!-- SECTION:NOTES:END -->
