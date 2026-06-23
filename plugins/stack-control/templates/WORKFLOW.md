---
doc-grammar: workflow
---

# stack-control lifecycle (WORKFLOW.md)

The canonical, governed lifecycle (022 parseable-lifecycle-workflow). This is the
plugin-bundled DEFAULT; an installation may override it at
`<install-root>/.stack-control/WORKFLOW.md` (installation copy wins, else this
bundled default — FR-005a). The engine reads the phase vocabulary, derive
predicates, gate criteria, and effect manifests FROM this document; none are
hardcoded (FR-005). A malformed document fails loud naming the violation (FR-007).

Field DSL (parsed by `src/workflow/workflow-grammar.ts`):

- A **criterion** is `<kind> <target> [<param>]`; entrance / exit / exit-gate are
  `;`-separated criterion lists (`(none)` for empty). `target` is a SYMBOLIC key
  the gate evaluator binds to the item's artifacts (`design`, `spec`,
  `analyze-clean`, `design-approved`, `impl`, `advance`, `solution-space-alternatives`),
  never a literal item-specific path.
- A **derive predicate** is `<kind> [<target>]`.
- An **effect** is `<verb> [k=v ...]`; effects are `;`-separated and ordered;
  `commit` is ALWAYS last (the atomic boundary — FR-016/FR-018).

Note on `doc-set-status-field`: it is part of the fixed v1 effect vocabulary
(FR-018) but is NOT wired into a default transition below — it is an
available-but-unused v1 verb an installation override may use (e.g. a feature
README status-table update on `graduate`). Listing it keeps the vocabulary
complete without inventing an item-specific path the bundled default cannot know
(Analyze O1).

## phase:captured

- status: active
- kind: phase
- derive: backlog-only
- work: stack-control:backlog
- entrance: (none)
- exit: (none)
- next: planned

## phase:planned

- status: active
- kind: phase
- derive: node-present
- work: stack-control:roadmap
- entrance: (none)
- exit: (none)
- next: designing

## phase:designing

- status: active
- kind: phase
- derive: pointer-set design
- work: stack-control:design
- entrance: pointer-set design
- exit: section-present design problem-domain; section-present design solution-space; section-present design decisions; section-present design open-questions; section-present design provenance; count-gte solution-space-alternatives 2; approval-marker design-approved
- next: specifying

## phase:specifying

- status: active
- kind: phase
- derive: pointer-set spec
- work: stack-control:define
- entrance: pointer-set spec
- exit: node-marker analyze-clean
- next: implementing

## phase:implementing

- status: active
- kind: phase
- derive: node-marker analyze-clean
- work: stack-control:execute
- entrance: node-marker analyze-clean
- exit: tasks-complete spec
- next: governing

## phase:governing

- status: active
- kind: phase
- derive: tasks-complete
- work: stack-control:execute
- entrance: tasks-complete spec
- exit: graduate-impl impl
- next: shipped

## phase:shipped

- status: active
- kind: phase
- derive: record-converged impl
- work: (none)
- entrance: graduate-impl impl
- exit: (none)
- next: closed

## phase:closed

- status: active
- kind: phase
- derive: release-tagged
- work: (none)
- entrance: (none)
- exit: (none)
- next: (none)

## transition:open-design

- status: active
- kind: transition
- from: planned
- to: designing
- exit-gate: (none)
- effects: roadmap-advance to=in-flight; journal-append message={message}; commit message={message}

## transition:design-to-spec

- status: active
- kind: transition
- from: designing
- to: specifying
- exit-gate: section-present design problem-domain; section-present design solution-space; section-present design decisions; section-present design open-questions; section-present design provenance; count-gte solution-space-alternatives 2; approval-marker design-approved
- effects: journal-append message={message}; commit message={message}

## transition:start-implementing

- status: active
- kind: transition
- from: specifying
- to: implementing
- exit-gate: node-marker analyze-clean
- effects: journal-append message={message}; commit message={message}

## transition:start-governing

- status: active
- kind: transition
- from: implementing
- to: governing
- exit-gate: tasks-complete spec
- effects: journal-append message={message}; commit message={message}

## transition:graduate

- status: active
- kind: transition
- from: governing
- to: shipped
- exit-gate: graduate-impl impl
- effects: roadmap-advance to=shipped; roadmap-reconcile; journal-append message={message}; commit message={message}

## transition:close

- status: active
- kind: transition
- from: shipped
- to: closed
- exit-gate: (none)
- effects: roadmap-advance to=closed; journal-append message={message}; commit message={message}

## transition:redesign

- status: active
- kind: transition
- from: *
- to: designing
- exit-gate: (none)
- effects: workflow-link-design design-doc={design-doc}; journal-append message={message}; commit message={message}
