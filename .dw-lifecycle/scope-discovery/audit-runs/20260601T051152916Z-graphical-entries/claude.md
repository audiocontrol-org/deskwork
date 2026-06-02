I walked the diff for the AUDIT-20260601-07 fix (spatialAnchor → discriminated union) plus the gemini-disable config override. The schema refactor itself is correct and the negative tests are a genuine improvement. Below are the findings worth surfacing.

### Schema tightening on append-only journal data ships with no read-back-compat path or doctor migration

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/schema/draft-annotation.ts:56-90` (new `SpatialAnchor*Schema` + `z.discriminatedUnion`); cross-cut with `packages/core/src/entry/annotations.ts` read-bridge

This change converts the spatial-anchor schema from "every field optional" to a `.strict()` discriminated union, and the same schema sits on the **read** path (journal events parse through it → `StoredComment` → `cloneSpatialAnchor`). Under the prior loose schema, a persisted anchor like `{kind:'pixel'}` or `{kind:'pixel', selector:'#x'}` parsed successfully and is now permanently in the append-only `entry-annotation` journal. After this commit those same shapes fail `safeParse` on read — so the fix that prevents *new* bad data also makes any *existing* loose anchor unreadable, with no migration to repair or quarantine it.

The original finding AUDIT-20260601-07 stressed exactly this property ("annotations land in the append-only journal where bad data is permanent"). The project already has the right pattern for this situation — Step 1.5.3 in this same workplan describes "doctor-managed migration with audit-preserving cutover window" for the W3C anchor migration — yet this diff adds no doctor rule, no read-side compatibility shim, and no note that the tightening is safe only because no writer exists yet. Practical risk today is low (per AUDIT-20260601-07 the anchor fields are referenced in only four files and there is no writer/renderer), which is precisely why **now** is the moment to pair the tightening with a doctor rule: once a writer lands and loose anchors accumulate, this becomes a breaking migration instead of a one-line guard. A reasonable fix: add an `entry-anchor-shape` doctor rule that reports legacy loose anchors, or a read-side normalizer, and state in the schema header that the strict cutover assumes zero pre-existing loose anchors on disk.

### `cloneSpatialAnchor` switch has no exhaustiveness guard; the lockstep contract is only implicitly enforced

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   low
Surface:    `packages/core/src/entry/annotations.ts:67-79` (`cloneSpatialAnchor`)

The rewritten switch returns from each of the three `case` arms with no `default` and no trailing `return` / `assertNever(input)`:

```ts
switch (input.kind) {
  case 'pixel':        return { kind: 'pixel', x: input.x, y: input.y };
  case 'dom-selector': return { kind: 'dom-selector', selector: input.selector };
  case 'svg-element':  return { kind: 'svg-element', selector: input.selector };
}
```

This compiles today only because the inferred `StoredSpatialAnchor` union is exhaustive. The header comment and the schema docstring both say adding a `kind` "requires updating both this schema and the TS union in lockstep" — but this function is a *third* site that must change, and nothing forces it. Whether a future 4th `kind` is caught here depends entirely on `noImplicitReturns` being enabled; if it is off (or the union is widened by hand), the switch falls through and returns `undefined` typed as `SpatialAnchor`, a silent corruption on the read bridge. A `default: assertNever(input)` makes the lockstep contract a hard compile error at this site instead of a flag-dependent accident, matching the "names/structure reveal intent" posture the rest of the change adopts.

### Negative tests assert `success === false` without pinning the failure to the anchor, so they can pass for the wrong reason

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    `packages/core/test/schema/draft-annotation-thread-anchor.test.ts:138-194` (six new `rejects spatialAnchor …` cases)

Each new negative case spreads `COMMENT_BASE`, overrides `spatialAnchor`, and asserts only `expect(parsed.success).toBe(false)`. None inspect *why* the parse failed (e.g. `parsed.error.issues[0].path` containing `spatialAnchor`, or the discriminator/strict issue code). Because the assertion is "the whole annotation failed to validate," any unrelated future change that makes `COMMENT_BASE` itself invalid — a newly-required sibling field, a renamed key — would keep all six green while silently no longer exercising the anchor enforcement they claim to cover. The probe would then assert the *mechanism it imagines* rather than the contract (the exact failure mode the project's `ui-verification.md` spec-compliance section names).

The fix is one line per case: assert the error path includes `spatialAnchor` (and ideally the issue code — `invalid_union_discriminator` for bad `kind`, `unrecognized_keys` for the strict forbidden-field cases). That ties each test to the per-kind contract it is named for, so a regression in the anchor schema specifically — not just "the comment is invalid" — is what turns the test red.
