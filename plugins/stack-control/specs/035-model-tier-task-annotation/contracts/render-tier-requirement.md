# Contract: `renderTierRequirement(vocab)` + the single-source render module

The single-source module this feature adds (D2/FR-012) — `src/workflow/tier-requirement.ts`,
parallel to `src/workflow/house-rules.ts`. It renders the injected tier-annotation instruction block
the `/stack-control:define` tasks seam feeds into the `/speckit-tasks` backend conversation (FR-002),
and exports the canonical string constants the template drift test asserts against (FR-011/FR-012).
Pure — no I/O; string in, string out (the vocab is supplied by the `tier-vocab` verb, parsed by the
caller).

---

## `renderTierRequirement(vocab: TierVocab | AbsentVocab): string`

Render the tier-annotation requirement as a markdown block for injection, keyed off the enclosing
installation's actual vocabulary. Mirrors `renderHouseRules(): string`.

**Input**: the parsed output of `stackctl tier-vocab --json` (contracts/tier-vocab-verb.md) — either
the configured `TierVocab` (`configured:true`, `labels`, `buckets`) or the absent form
(`configured:false`, `configPath`). The branch is switched on `vocab.configured`.

**Output** (configured branch) — a block containing, at minimum, these four content sections
(data-model § renderTierRequirement I/O), each an operator-perceivable clause:

1. **(a) Syntax** — the required per-task tag `[tier:<label>]`, stated to sit alongside the
   `[P]`/`[US n]` sibling tags and be compatible with the existing parser
   (`- [ ] T### [P?] [US?] [tier:<label>] <description>`). Contains `TIER_TAG_FORMAT_CLAUSE`
   verbatim. (FR-008)
2. **(b) Heuristic** — mechanical / RED-test / doc-only → **cheapest**; standard implementation →
   **mid**; cross-cutting / architectural / ambiguous / high-blast-radius → **most-capable**. Stated
   as guidance the generator applies, not a hard rule. Contains `TIER_HEURISTIC_CLAUSE` verbatim.
   (FR-004)
3. **(c) Concrete binding for THIS installation** — names the actual labels the buckets bind to:
   `cheapest → <buckets.cheapest>`, `mid → <buckets.mid>`, `most-capable → <buckets.mostCapable>`,
   and lists every `label → model` from `vocab.labels` so the generator proposes **only** labels
   that resolve (FR-003/FR-004a). This is the section that makes the block installation-specific — a
   `cheap/mid/frontier` installation gets *its* labels, never a hardcoded `fast/balanced/powerful`.
4. **(d) Completeness instruction** — emit a `[tier:<label>]` on **every** task; a task genuinely
   spanning tiers still gets one tier (operator override is the escape hatch); do not leave a task
   untagged or multi-tiered.

**Output** (absent branch, FR-009) — when `vocab.configured === false`:
- state the heuristic (b) in the abstract (no concrete labels available),
- instruct: emit `[tier:UNSET]` on **every** task,
- reproduce a loud advisory naming the missing `tier_map` and `vocab.configPath` to fix it,
- state that generation is **not** blocked and that the existing `resolve-tiers` floor will reject
  `UNSET` fail-loud at execute (so the gap surfaces at the tasks phase and again at execute).
- It MUST NOT invent a label or emit a silent default.

The block is versioned/titled like the house-rules block (e.g. a leading
`## stack-control model-tier requirement (<id>)` heading) so its provenance is legible in the
injected conversation.

---

## Exported shared constants (§ Shared constants, D5/FR-012)

Exported from the same module, consumed by BOTH the render block (which embeds them) and the
template drift test (which asserts the template contains them). Their exact wording is authored in
implementation; the contract fixes their **role** and that they are the single source both surfaces
share:

| Constant | Role | Consumers |
|---|---|---|
| `TIER_TAG_FORMAT_CLAUSE` | The canonical one-line statement of the `[tier:<label>]` syntax + that it coexists with `[P]`/`[US n]` and is resolved by the installation's `tier_map` at `resolve-tiers` time. | (1) embedded in `renderTierRequirement` section (a); (2) embedded verbatim in `tasks-template.md`'s tier documentation. |
| `TIER_HEURISTIC_CLAUSE` | The canonical mechanical/standard/cross-cutting → cheapest/mid/most-capable heuristic sentence. | (1) embedded in `renderTierRequirement` section (b); (2) embedded verbatim in `tasks-template.md`'s tier documentation. |

Both constants are plain strings with **no** installation-specific label interpolation (the concrete
labels live in section (c), which is installation-specific and therefore NOT a shared constant — the
template, being static, cannot carry a specific installation's labels). Only the vocabulary-neutral
format + heuristic clauses are single-sourced across the seam and the template; the concrete binding
is seam-only by nature.

---

## Invariants the drift test checks (`tasks-template-drift.test.ts`, FR-012)

The drift guard is the FR-012 single-sourcing mechanism for the *static template* surface (a
markdown template cannot call the TS render function — research.md Decision 4):

1. **Format-clause presence** — the `tasks-template.md` tier section **contains**
   `TIER_TAG_FORMAT_CLAUSE` (exported from `tier-requirement.ts`). A change to the format wording in
   TS without updating the template (or vice-versa) goes RED.
2. **Heuristic-clause presence** — the template's tier section **contains** `TIER_HEURISTIC_CLAUSE`.
3. **Sample-line exemplification** — at least one sample task line in `tasks-template.md` carries a
   `[tier:<label>]` tag (FR-011) matching the parser's `TIER_TAG` shape (so the exemplified tag is
   one `resolve-tiers` would accept).
4. **Format-line update** — the template's `## Format:` line includes `[tier:<label>]` among the
   documented per-task tags (so the tag is modeled as first-class, not buried as "optional").

A RED on any of these means the seam's canonical wording and the template drifted — fix the template
(or the constant) so both carry the same canonical clause.

---

## Relationship to `renderHouseRules` (the mirrored pattern)

| Aspect | `renderHouseRules` (022, existing) | `renderTierRequirement` (this feature) |
|---|---|---|
| Module | `src/workflow/house-rules.ts` | `src/workflow/tier-requirement.ts` (new, parallel) |
| Single source | ONE block, injected into the design backend + derived into the design gate criteria | ONE block, injected into the tasks backend + derived (via shared constants + drift test) into the template |
| Injected by | `skills/design/SKILL.md` step 2 (bracketed by the front-door marker) | `skills/define/SKILL.md` tasks-seam step (bracketed by the same front-door marker) |
| Purity | pure string builder | pure string builder |
| Input | none (static rules) | the installation's `TierVocab` (so the block is installation-specific) |

The one structural difference: `renderHouseRules` is input-free (static house rules), while
`renderTierRequirement` takes the per-installation `TierVocab` so section (c) can name the actual
labels — this is exactly the FR-003 vocabulary-awareness requirement, and why the `tier-vocab` verb
exists to supply the input.
