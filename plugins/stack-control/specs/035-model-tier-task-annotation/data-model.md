# Phase 1 Data Model: Model-tier task annotation

Entities derive from the spec's Key Entities and the locked decisions (D1–D5). All shapes are
immutable (`readonly`), composed (no inheritance), strict-typed (no `any`/`as`/`!`). The consuming
machinery's types (`TieredTask`, `TierMap`, `TierError`, `ResolvedTask`) are **unchanged** and are
referenced, not redefined. This feature adds only *producing-side* types: the tier vocabulary the
verb emits, the bucket bindings the ranking function derives, and the render block's I/O.

---

## Entity: TierBuckets (the derived bucket→label binding)

The three semantic heuristic buckets bound to concrete `tier_map` labels for one installation
(FR-004a). Produced by the pure ranking function; consumed by both `renderTierRequirement` and the
`tier-vocab` verb.

| Field | Type | Rule |
|---|---|---|
| `cheapest` | `string` | The `tier_map` label whose resolved model has **minimum** capability rank. |
| `mid` | `string` | The label at the **median** rank (lower-middle on even counts; = `cheapest` on a two-label map). |
| `mostCapable` | `string` | The label whose resolved model has **maximum** capability rank. |

On a **single-label** map, all three buckets equal that one label (every bucket collapses onto the
only label). `TierBuckets` is only defined when `tier_map` is non-empty; the absent-map case is
`{configured:false}` at the verb boundary (no buckets).

---

## Entity: TierVocab (the `tier-vocab` verb output, D1)

What `stackctl tier-vocab --json` emits when a `tier_map` is configured. The single structured datum
both the seam (via the render block) and any other reader consume.

| Field | Type | Notes |
|---|---|---|
| `configured` | `true` | Present-and-`true` when a `tier_map` exists (the discriminant). |
| `configPath` | `string` | Absolute path to the resolved `.stack-control/config.yaml` (for advisories/traceability). |
| `labels` | `readonly TierVocabEntry[]` | One entry per `tier_map` key. |
| `buckets` | `TierBuckets` | The derived `{cheapest, mid, mostCapable}` binding (above). |

`TierVocabEntry`:

| Field | Type | Notes |
|---|---|---|
| `label` | `string` | The `tier_map` key (operator semantic label; never a model id — Principle III). |
| `model` | `string` | The accepted model the label resolves to (∈ `ACCEPTED_MODELS`). |
| `rank` | `number` | The label's index in `MODEL_CAPABILITY_RANK` for its `model` (exposed for traceability/tests). |

**Absent-map shape** (FR-009): when no `tier_map` is configured, the verb emits
`{ "configured": false, "configPath": "<path>" }` (no `labels`/`buckets`) alongside a loud stderr
advisory, and exits **0**. `configured` is the discriminant a consumer switches on.

---

## Entity: MODEL_CAPABILITY_RANK (declared capability ordering, D3/FR-004a)

Added to `src/execute/accepted-models.ts` (the single model-vocabulary source):

`MODEL_CAPABILITY_RANK: readonly string[] = ['haiku', 'sonnet', 'opus', 'fable']`

| Property | Rule |
|---|---|
| Ordering | Capability-**ascending**: index 0 = least capable, last index = most capable. |
| Membership | Exactly the members of `ACCEPTED_MODELS` — a RED test asserts set-equality so the two never drift. |
| `fable` placement | A **declared deterministic ordering**, explicitly **not** an absolute-capability claim. Documented in the source comment. Most `tier_map`s bind only `haiku`/`sonnet`/`opus`, so `fable`'s exact rank rarely binds a bucket — but it is fully defined for determinism. |

`rankOf(model): number` = the index of `model` in `MODEL_CAPABILITY_RANK`. A model absent from the
rank is a programming error (it would already have failed `ACCEPTED_MODELS` validation upstream);
the ranking function may assert on it (fail loud, Principle V) rather than silently place it.

---

## Tier ranking (the pure bucket-binding algorithm, D3/FR-004a)

`bucketBindings(tierMap: TierMap): TierBuckets` — pure, total, deterministic for any label
count/naming.

**Algorithm**:
1. For each `label → model` in `tierMap`, compute `rank = rankOf(model)`.
2. Sort the labels **ascending by `(rank, label)`** — primary key `rank`, tie-break **`label` string
   ascending** (so a stable, deterministic order even when two labels resolve to the same model).
3. Let `sorted` be that ordered label list, `n = sorted.length`:
   - `cheapest = sorted[0]`
   - `mostCapable = sorted[n - 1]`
   - `mid = sorted[midIndex]`, where `midIndex = floor((n - 1) / 2)` (**lower-middle** on even `n`).
4. **Two-label collapse** (`n === 2`): `midIndex = floor(1/2) = 0` ⇒ `mid = sorted[0] = cheapest`.
   The `mid` bucket collapses onto the **lower** (cheaper) label — documented choice: bias standard
   work toward the cheaper tier (barbell thesis: industrialize execution cheaply; only genuinely
   cross-cutting work escalates).
5. **Single-label** (`n === 1`): all three buckets = `sorted[0]`.
6. **Empty** (`n === 0`): not reachable — an empty `tier_map` is treated as absent by the verb
   (`configured:false`), so `bucketBindings` is only called on `n ≥ 1`.

### Worked examples

Assume `MODEL_CAPABILITY_RANK = ['haiku'(0), 'sonnet'(1), 'opus'(2), 'fable'(3)]`.

**Example A — three-label `fast/balanced/powerful` (the dogfood default):**
```yaml
tier_map: { fast: haiku, balanced: sonnet, powerful: opus }
```
ranks: fast→0, balanced→1, powerful→2. sorted (by rank,label): `[fast, balanced, powerful]`, n=3.
`midIndex = floor(2/2) = 1`. ⇒ `{ cheapest: fast, mid: balanced, mostCapable: powerful }`.

**Example B — two-label collapse:**
```yaml
tier_map: { cheap: haiku, frontier: opus }
```
ranks: cheap→0, frontier→2. sorted `[cheap, frontier]`, n=2. `midIndex = floor(1/2) = 0`.
⇒ `{ cheapest: cheap, mid: cheap, mostCapable: frontier }` (mid collapses onto the lower label).

**Example C — four-label map (fable binds):**
```yaml
tier_map: { a: haiku, b: sonnet, c: opus, d: fable }
```
ranks: a→0, b→1, c→2, d→3. sorted `[a, b, c, d]`, n=4. `midIndex = floor(3/2) = 1`.
⇒ `{ cheapest: a, mid: b, mostCapable: d }` (lower-middle picks `b` over `c`).

**Example D — tie case (two labels resolve to the same model):**
```yaml
tier_map: { quick: haiku, snappy: haiku, deep: opus }
```
ranks: quick→0, snappy→0, deep→2. sort by (rank,label): both rank-0 labels tie-break by label
string ascending → `snappy` (s) vs `quick` (q): `q` < `s`, so `[quick, snappy, deep]`, n=3.
`midIndex = 1` ⇒ `{ cheapest: quick, mid: snappy, mostCapable: deep }`. The tie-break makes this
deterministic regardless of `tier_map` key insertion order.

**Example E — single label:**
```yaml
tier_map: { only: sonnet }
```
n=1 ⇒ `{ cheapest: only, mid: only, mostCapable: only }`.

---

## Entity: renderTierRequirement input/output (D2)

`renderTierRequirement(vocab: TierVocab | AbsentVocab): string` — pure string builder, parallel to
`renderHouseRules(): string`.

**Input**: the verb's parsed output — either a configured `TierVocab` (labels + buckets) or the
absent form (`{configured:false, configPath}`).

**Output**: a markdown instruction block for injection into the `/speckit-tasks` backend
conversation. Required content (the render-tier-requirement.md contract enumerates the exact
clauses; the drift test asserts the canonical constants appear):

| Section | Content | FR |
|---|---|---|
| (a) Syntax | The required `[tier:<label>]` per-task tag, placed alongside `[P]`/`[US n]` siblings, parser-compatible with `tasks-tier-parser.ts`. | FR-008 |
| (b) Heuristic | mechanical/RED/doc-only → cheapest; standard impl → mid; cross-cutting/architectural/ambiguous/high-blast-radius → most-capable. | FR-004 |
| (c) Concrete binding | For THIS installation: cheapest = `<buckets.cheapest>`, mid = `<buckets.mid>`, most-capable = `<buckets.mostCapable>`, and the full label→model list from `vocab.labels`. | FR-004a |
| (d) No-map path | When input is absent: instruct to emit `[tier:UNSET]` on every task + reproduce the loud advisory (missing `tier_map`, config path). No invented label; generation not blocked. | FR-009 |

When the input is the absent form, sections (b)/(c) still state the heuristic in the abstract but
section (c) cannot name concrete labels — the block instead carries section (d)'s `[tier:UNSET]`
instruction. Which branch renders is switched on `vocab.configured`.

---

## Shared canonical-string constants (D5/FR-012)

Exported from `src/workflow/tier-requirement.ts` and consumed by BOTH the render block and the
template drift test (`tasks-template-drift.test.ts`). Exact strings are specified in
render-tier-requirement.md § Shared constants; conceptually:

| Constant | Purpose |
|---|---|
| `TIER_TAG_FORMAT_CLAUSE` | The one-line statement of the `[tier:<label>]` syntax + sibling-tag coexistence. Must appear verbatim in both the injected block and the template's tier docs. |
| `TIER_HEURISTIC_CLAUSE` | The mechanical/standard/cross-cutting → cheapest/mid/most-capable heuristic sentence. Must appear verbatim in both surfaces. |

The drift test asserts the `tasks-template.md` tier section **contains** each constant; a change to
either surface without the other goes RED (the FR-012 single-sourcing guarantee for the static
template).

---

## Relationship to the unchanged consuming machinery

- `renderTierRequirement`'s section (a) syntax is authored to satisfy `tasks-tier-parser.ts`'s
  `TIER_TAG` regex (`\[tier:([^\]]*)\]`) and `STRIP_TAGS` (which strips `[P]`, `[US\d+]`,
  `[tier:…]`) — so a generated line `- [ ] T001 [P] [US1] [tier:fast] …` parses cleanly with the
  tier extracted and the siblings stripped (FR-008).
- The labels the block proposes come from `vocab.labels` (the installation's real `tier_map` keys),
  so every proposed `[tier:<label>]` resolves through `resolveTier` without `unknown-tier` (US2).
- `[tier:UNSET]` (FR-009) is deliberately a label the unchanged floor rejects (`no-map` when the map
  is absent, `unknown-tier` if a non-`UNSET` map is later added) — the no-silent-default guarantee
  is entirely on the existing, untouched resolver (see research.md Decision 5 for the confirmed
  behavior and the pathological literal-`UNSET`-key edge).
