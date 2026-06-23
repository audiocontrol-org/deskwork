# Contract: governed `WORKFLOW.md` grammar + bundled-default changes

The bundled default `templates/WORKFLOW.md` is the source of truth the engine reads (022 FR-005). An installation override at `<install-root>/.stack-control/WORKFLOW.md` still wins. These changes are additive to the vocabulary + a re-pointing of `shipped`'s derive.

## Phase blocks (added / changed)

```text
## phase:merging                 # NEW
- status: active
- kind: phase
- derive: record-converged impl  # (engine also requires status != shipped via ordering)
- work: stack-control:ship
- entrance: record-converged impl
- exit: (skill-driven merge; graduate fires the transition)
- next: shipped

## phase:shipped                 # CHANGED derive: was `record-converged impl`
- status: active
- kind: phase
- derive: status-is shipped      # NEW derive predicate over recorded status
- work: (none)
- entrance: graduate-impl impl
- exit: (none)
- next: validating               # CHANGED: was `closed`

## phase:validating              # NEW
- status: active
- kind: phase
- derive: status-is shipped      # + `validated` marker ABSENT (ordering puts validating after shipped)
- work: (none)                   # adopter-overridable; default operator-confirm
- entrance: status-is shipped
- exit: approval-marker validated
- next: closed

## phase:closed                  # unchanged (by-name terminal)
- derive: never
- next: (none)
```

## Transition blocks (added / changed)

```text
## transition:graduate           # REWIRED from governing→shipped to merging→shipped
- from: merging
- to: shipped
- exit-gate: graduate-impl impl
- effects: roadmap-advance to=shipped; roadmap-reconcile; journal-append message={message}; commit message={message}

## transition:close              # REWIRED from shipped→closed to validating→closed
- from: validating
- to: closed
- exit-gate: approval-marker validated     # NEW gate (was (none))
- effects: roadmap-advance to=closed; journal-append message={message}; commit message={message}
```

> `start-merging` (governing→merging) and `validate` (shipped→validating) may be modeled as explicit transitions or as derivation-only boundaries; the load-bearing contract is the gate + effect sets above. `commit` is ALWAYS the last effect (atomic boundary — FR-016/FR-018 of 022).

## Type/grammar surface (`workflow-types.ts`, `workflow-grammar.ts`)

- **DERIVE_KINDS** += `status-is` (param: a status value, e.g. `shipped`). `phase-derivation.ts` evaluates it against the recorded node `status:`. `validating` additionally requires the `validated` marker absent (encoding finalized RED-first).
- **CRITERION_KINDS**: no new kind — the `validating → closed` gate reuses the generic `approval-marker validated`.
- A malformed/unknown kind MUST fail loud (existing 022 FR-007 behavior — preserved).

## Backward-compatibility

Per the project's zero-back-compat rule, `shipped`'s old `record-converged impl` derive is **replaced** (clean break), not kept as an alternate arm. 031 tests/fixtures that assert the old `shipped` derive are updated in the same delivery.
