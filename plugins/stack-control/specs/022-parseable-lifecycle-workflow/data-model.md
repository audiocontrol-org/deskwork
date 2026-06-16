# Data Model: Parseable lifecycle workflow engine

All artifacts are anchored inside the nearest-enclosing installation (the tree rooted at `.stack-control/config.yaml`).

## Phase (WORKFLOW.md unit)

- `id`: string — phase name (`captured` | `planned` | `designing` | `specifying` | `implementing` | `governing` | `shipped`)
- `derive`: predicate expression — the artifact condition that places an item in this phase
- `work`: string — the skill/verb that performs the phase's work
- `entrance`: Criterion[] — must hold to enter
- `exit`: Criterion[] — must hold to be done
- `next`: string — the id of the next phase

## Transition (WORKFLOW.md unit)

- `codename`: string — e.g. `open-design`, `design-to-spec`, `graduate`
- `from`: string — source phase (or `*` for any, re-entry)
- `to`: string — target phase
- `exitGate`: Criterion[] — must hold to fire
- `effects`: Effect[] — ordered manifest

## Criterion

- `kind`: `file-exists` | `section-present` | `count-gte` | `tasks-complete` | `tree-clean` | `pointer-set` | `record-converged` | `approval-marker`
- `target`: string — the artifact / field / count the predicate reads
- `param`: string | number — threshold or section name (when applicable)
- Evaluates to a definite `boolean`; a `approval-marker` criterion reads a node field (D5), never a subjective judgment.

## Effect (fixed v1 vocabulary)

- `verb`: `roadmap-advance` | `roadmap-reconcile` | `journal-append` | `doc-set-status-field` | `workflow-link-design` | `workflow-link-spec` | `commit`
- `args`: record — template params bound at advance time (`{item}`, `{status}`, `{spec-dir}`, `{design-doc}`, `{message}`)
- `commit` is ALWAYS the last effect (the atomic boundary).

## Roadmap node fields (additions to the existing node)

- `design:`: string (pointer) — the design-record path; set on `open-design` (derivation keys on this, D3)
- `spec:`: string (pointer) — existing; the spec dir, set on `design-to-spec`
- `design-approved:`: marker — the recorded operator approval that makes the design judgment gate mechanical (D5)

## GovernConvergenceRecord (mode-keyed; TASK-19, D8)

- `mode`: `spec` | `impl`
- `item`: string — the roadmap node id
- `scopeFingerprint`: string — what was governed (reuses the 021 checkpoint fingerprint shape)
- `converged`: boolean
- `recordedAt`: ISO timestamp
- `anchorRoot`: string — the installation root the record is written under
- Read by derivation: `spec` → `specifying → implementing`; `impl` → `governing → shipped`.

## HouseRulesBlock (design frontend opinion; single source)

- `id`: string — versioned name
- `rules`: Rule[] — each `{ id, statement, backedBy: 'soft' | 'mechanical' | 'operator' }`
- One source, two consumers: injected into the backend conversation AND checked by the `design-to-spec` exit gate.

## DesignRecord (the `designing`-phase artifact)

- Path: `<install-root>/docs/superpowers/specs/<date>-<slug>-design.md`
- Required sections: `problem-domain`, `solution-space` (incl. rejected alternatives, ≥2), `decisions`, `open-questions`, `provenance`
- Revisions: append-only on `* → designing` re-entry (D10), never overwritten.

## WorkflowDoc (WORKFLOW.md)

- Source: plugin-bundled `templates/WORKFLOW.md` default; per-install override resolved through the existing override stack (D4)
- Parsed by `src/document-model/` grammar engine; malformed → fail loud (no default fallback).
