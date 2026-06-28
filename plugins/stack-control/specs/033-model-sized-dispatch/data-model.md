# Phase 1 Data Model: Model-Sized Dispatch

Entities derive from the revised spec's Key Entities. All shapes are immutable (`readonly`),
composed (no inheritance), strict-typed (no `any`/`as`/`!`). Wire config is YAML snake_case;
in-memory is camelCase (existing config-loader convention). There is **no** DAG / graph / wave
entity — ordering is the adopted-stance controller judgment (FR-012), not a modeled structure.

---

## Entity: TieredTask

One task parsed from `tasks.md` for tier resolution. Pure syntactic extraction.

| Field | Type | Source / Rule |
|---|---|---|
| `id` | `string` | The `T\d+` id (e.g. `T001`). Required; a task line without an id is a parse error. |
| `tierLabel` | `string \| undefined` | The `[tier:<label>]` tag value (D2). `undefined` ⇒ a tier error at resolution (FR-004). |
| `body` | `string` | The task description text (becomes the subagent brief). Required, non-empty. |
| `done` | `boolean` | `true` iff the checkbox is `[x]`/`[X]` (already complete — not dispatched; informs the ledger/resume). |
| `lineNumber` | `number` | 1-based source line, for error messages. |

**Parser-level validation**: duplicate `id` ⇒ error; missing `id`/`body` ⇒ error; an empty
`[tier:]` tag (`[tier:]`) ⇒ error. Errors are **collected** (no first-error abort) so the full
set surfaces together (FR-006). Phase headers and the `[P]`/`[USn]` tags are **ignored** by this
parser — they carry no meaning for tier resolution (scheduling is out of scope).

---

## Entity: ModelTier & TierMap

| Concept | Type | Rule |
|---|---|---|
| Tier label | `string` | Operator-chosen semantic label (e.g. `fast`). Declared via `[tier:<label>]`. **Never** a model identifier (Principle III). |
| `TierMap` | `Readonly<Record<string, string>>` | Operator config: tier label → model keyword. |
| Model keyword | `string` ∈ accepted-model set | One of the dispatch surface's accepted models (host capability constant — D4). A value outside the set ⇒ config error (loud). |

**AcceptedModelSet (host capability constant, D4)**: the set of model values the tier map may
target — e.g. `{ haiku, sonnet, opus, fable }` for the Claude Code subagent surface. Defined
once; the tier-map validator consults it. Not a tier-map concept (capability, not vendor).

---

## Entity: TierResolution (the resolve-tiers output)

The per-task resolution the verb emits when **every** task resolves cleanly; otherwise the verb
emits the complete `TierError[]` and exits non-zero (no partial resolution — FR-006).

`ResolvedTask`:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Task id. |
| `tierLabel` | `string` | Validated present. |
| `model` | `string` | Resolved model keyword (∈ accepted-model set) — the explicit model the dispatch uses (FR-002). |

`TierResolution`: `{ readonly specDir: string; readonly tasks: readonly ResolvedTask[] }`. Only
emitted when valid; consumed by the execute skill to set each subagent's explicit model.

---

## Entity: TierError (collected, surfaced before any dispatch)

`resolve(tierLabel?, tierMap, acceptedModels) → ResolvedModel | TierError` — pure function:

| Condition | TierError message | FR |
|---|---|---|
| `tierLabel === undefined` | `task <id> has no model tier declared` | FR-004 |
| `tierLabel` not a key of `tierMap` | `task <id> declares unknown tier <label>` | FR-005 |
| `tierMap` absent for a tiered task | `no tier_map configured; cannot resolve tier '<label>' for task <id>` | FR-008 |
| `tierMap[label]` ∉ accepted-model set | `tier_map[<label>] = '<v>' is not an accepted model` | FR-008 / config validate |

All `TierError`s for a run are collected and printed together; **zero** tasks are resolved/emitted
when any error exists (FR-006, SC-002).

---

## Entity: ExecutionLedger entry (durable progress, FR-010)

One record per completed task, appended to the durable ledger (D7). Enables resume safety
(SC-005) and makes per-task tier/model observable afterward (FR-011, SC-004).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Task id. |
| `tierLabel` | `string` | The declared tier. |
| `model` | `string` | The model the subagent was dispatched with. |
| `commitRange` | `string` | `<base7>..<head7>` of the task's commits (recovery map, per SDD). |
| `reviewClean` | `boolean` | Task-review verdict (the adopted discipline's gate). |

On resume, tasks present in the ledger are **not** re-dispatched (SC-005); the controller resumes
at the first task not recorded complete.

---

## State transitions (a task's lifecycle within a run)

```text
                 tier error (no/unknown tier, no/bad map)
TieredTask ──────────────────────────────────────────────► tier-error  (named; NOT dispatched; FR-004/005/008)
    │
    │ tier resolves to a model
    ▼
  in ledger as complete? ──yes──► skipped-already-done   (resume safety; SC-005)
    │ no
    ▼
 dispatched to a fresh subagent at the explicit resolved model (FR-002/009)
    │
    ▼
 subagent works test-first, self-reviews, commits ──► task review ──► (clean) ──► ledgered complete
                                                              └──(findings)──► fix subagent ──► re-review
```

- Ordering between tasks (serial vs parallel-for-independent) is the controller's judgment under
  the adopted stance — **not** a modeled transition (FR-012).
- Resolution (tier-error vs resolved) happens for **all** tasks before any dispatch (FR-006).
