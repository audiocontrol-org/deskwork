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
- next: validating

## phase:validating              # NEW — the post-merge phase (status:shipped derives here)
- status: active
- kind: phase
- derive: status-is shipped      # NEW derive predicate over recorded status
- work: (none)                   # adopter-overridable; default operator-confirm
- entrance: status-is shipped
- exit: approval-marker validated
- next: closed

## phase:closed                  # unchanged (by-name terminal)
- derive: never
- next: (none)
```

> **`phase:shipped` is REMOVED** (F1 resolution, analyze 2026-06-23). `shipped` is the recorded STATUS (set by `graduate`'s `roadmap-advance to=shipped` effect), not a derived phase; `status: shipped` derives to `phase:validating`. The old `phase:shipped` block is deleted (clean break — no back-compat). The `validated` marker is the `validating → closed` GATE only, never a derive discriminator (modeling two phases over one status deadlocked closed).

## Transition blocks (added / changed)

```text
## transition:graduate           # REWIRED: governing→shipped  ⇒  merging→validating
- from: merging
- to: validating                 # lands in phase validating; records status:shipped (effect below)
- exit-gate: graduate-impl impl
- effects: roadmap-advance to=shipped; roadmap-reconcile; journal-append message={message}; commit message={message}

## transition:close              # REWIRED from shipped→closed to validating→closed
- from: validating
- to: closed
- exit-gate: approval-marker validated     # NEW gate (was (none))
- effects: roadmap-advance to=closed; journal-append message={message}; commit message={message}
```

> `graduate`'s `to` phase is `validating` while its effect records `status: shipped` — phase and status names legitimately differ. `start-merging` (governing→merging) may be an explicit transition or a derivation-only boundary; the load-bearing contract is the gate + effect sets above. `commit` is ALWAYS the last effect (atomic boundary — FR-016/FR-018 of 022).

## Type/grammar surface (`workflow-types.ts`, `workflow-grammar.ts`)

- **DERIVE_KINDS** += `status-is` (param: a status value, e.g. `shipped`). `phase-derivation.ts` evaluates it against the recorded node `status:`; `phase:validating` derives from `status-is shipped`. No marker-absence in the derive (F1 resolution).
- **CRITERION_KINDS**: no new kind — the `validating → closed` gate reuses the generic `approval-marker validated`.
- A malformed/unknown kind MUST fail loud (existing 022 FR-007 behavior — preserved).

## Backward-compatibility

Per the project's zero-back-compat rule, the old `phase:shipped` (derive `record-converged impl`, `next: closed`) is **deleted** (clean break), not kept as an alternate arm. 031 tests/fixtures that assert the old `shipped` phase/derive or `shipped→closed` are updated in the same delivery.
