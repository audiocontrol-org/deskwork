# Contract: Intent Vocabulary (fixed enumeration → phase)

FR-004: the intent vocabulary is a **fixed enumeration** of lifecycle skill/verb names, each
mapped to the phase it belongs to. An unknown intent **fails loud** (refusal), never silently
`on-course`, never heuristically NL-mapped. Single-sourced from the governed `WORKFLOW.md`
(FR-007). Lives in `src/workflow/intent-vocabulary.ts`.

## Construction (single-source from WORKFLOW.md)

The vocabulary is built at load time by inverting each governed phase's `work:` skill:

```
for each phase in doc.phases:
    vocab[normalize(phase.work)] = phase.id
# plus a fixed set of transition-intent aliases (below)
```

A phase whose `work` skill is missing or un-normalizable is a **load-time error** (the
vocabulary must be total over the governed phases). This guarantees the intent names track the
phases — when a phase or its `work` skill changes, the vocabulary follows (no second table to
drift, FR-007).

## The enumeration (canonical bundled lifecycle)

Derived from `templates/WORKFLOW.md` (the `DEFAULT_PHASES`: `captured`, `planned`, `designing`,
`specifying`, `implementing`, `governing`, `shipped`). The work-skill → phase inversion plus
transition aliases yields (illustrative — the authoritative mapping is computed from the doc):

| Intent name (`--intent`) | Phase | Source |
|---|---|---|
| `design` | `designing` | `designing.work` |
| `define` / `specify` / `speckit-specify` | `specifying` | `specifying.work` + alias |
| `execute` / `speckit-implement` | `implementing` | `implementing.work` + alias |
| `govern` | `governing` | `governing.work` |
| `ship` / `release` | `governing`→`shipped` region | transition alias (back-half) |
| `session-end` | (current phase; finishing skill) | see "finishing skills" below |

> The exact alias set is fixed in `intent-vocabulary.ts` and tested; the table above is
> illustrative of the construction, not a second source of truth.

## Finishing skills (`ship` / `release` / `session-end`)

These do not author a phase's work; they gate on the *evidence chain being complete*. Their
intent maps to the back-half region (`governing → shipped`): invoking them on an item that has
not reached `governing` yields `ahead` (a step is skipped); on a `governing` item with the
exit gate met they are `on-course`/`behind`. This is the backstop for the
"agent wrote code directly, not via a skill" edge case (spec Edge Cases): the finishing skills
refuse without the full recorded evidence chain.

## Fail-loud on unknown intent (FR-004)

```
workflow compass <item> --intent frobnicate
  → workflow: unknown intent 'frobnicate'
    (known: design, define, specify, speckit-specify, execute, speckit-implement,
     govern, ship, release, session-end)
  exit 2
```

An unknown intent is a usage error (exit `2`) — it is NOT classified as a verdict and NEVER
defaults to `on-course`. This is the mechanical guarantee that an agent cannot smuggle an
unrecognized action past the compass (the agent-judgment hole FR-004 closes).

## Validation tests (intent-vocabulary.test.ts)

- Every `DEFAULT_PHASES` phase with a `work:` skill has a vocabulary entry (totality).
- A doc whose phase `work` skill is absent from the inversion is a load-time error.
- An unknown `--intent` exits `2` and names the known set.
- A known intent maps to exactly the phase its `work:` skill declares (no drift).
