/**
 * Pipeline template — the per-pipeline definition that names the linear
 * stages, the optional pre-terminal lock stages, and the off-pipeline
 * cul-de-sacs (Blocked / Cancelled / Archived).
 *
 * Plugin-shipped preset templates live alongside this file as JSON.
 * Operator overrides live at `<projectRoot>/.deskwork/pipelines/<id>.json`
 * and take precedence — see `./loader.ts`.
 *
 * Per the graphical-entries PRD, verbs (iterate / approve / cancel /
 * induct) are universal across templates and gated only on the entry's
 * stage position within the template's linear list. The template itself
 * does NOT carry verb-specific configuration; it carries the stage
 * vocabulary the universal verb router consults.
 *
 * Invariants enforced by the Zod schema below:
 *
 *   - `id` is a non-empty string; conventionally lowercase kebab-case
 *     matching the JSON filename basename (the loader validates that
 *     match at load time, not the schema).
 *   - `linearStages` is non-empty. Each entry is a non-empty string.
 *     Stage-name uniqueness inside the array is required.
 *   - The LAST element of `linearStages` is the terminal stage with
 *     published semantics (immutable, version assigned at the publish
 *     verb). The schema does not name a specific terminal stage — the
 *     position carries the meaning.
 *   - `lockedStages`, when present, is a subset of `linearStages` and
 *     has no duplicate entries. The lock gates iterate; pre-terminal
 *     review-freeze ("Final"-style) lives here.
 *   - `offPipelineStages` is a (possibly empty) array of non-empty,
 *     unique stage names. Stage names in `offPipelineStages` MUST NOT
 *     overlap with `linearStages` — a stage is either linear OR
 *     off-pipeline, never both.
 *   - `Cancelled` is the reserved name for cancel-verb destination.
 *     Templates SHOULD include it in `offPipelineStages`; the schema
 *     does NOT require it (so operators can experiment with cancel-free
 *     templates), but the cancel verb refuses with a configuration
 *     error at runtime when the template lacks it. The schema-level
 *     contract is just that IF `Cancelled` appears, it appears in
 *     `offPipelineStages` and nowhere else.
 *
 * The on-disk JSON additionally permits a top-level `"$rationale"`
 * string field as a stand-in for the JSON-with-comments convention
 * (since RFC 8259 JSON disallows comments). The loader passes the field
 * through the schema via `.passthrough()` and ignores it at runtime;
 * it exists so the preset files can carry lifecycle documentation that
 * survives `jq` / `cat` inspection. Custom operator-authored templates
 * are free to include or omit the field.
 */

import { z } from 'zod';

/**
 * Cross-field invariant helper: every entry in `subset` exists in
 * `superset`. Used by lockedStages-subset-of-linearStages.
 */
function isSubsetOf(subset: readonly string[], superset: readonly string[]): boolean {
  const allowed = new Set(superset);
  return subset.every((value) => allowed.has(value));
}

/**
 * Cross-field invariant helper: every entry in `a` is absent from `b`.
 * Used to enforce the no-overlap between linearStages and
 * offPipelineStages.
 */
function isDisjointFrom(a: readonly string[], b: readonly string[]): boolean {
  const other = new Set(b);
  return a.every((value) => !other.has(value));
}

/**
 * Array-of-non-empty-strings with no duplicate entries. The shape comes
 * up three times in the schema (linearStages, lockedStages,
 * offPipelineStages) so it lives here as a factory.
 *
 * `minLength` is configurable so the factory can express both "must
 * have at least one entry" (linearStages) and "may be empty"
 * (lockedStages, offPipelineStages).
 *
 * The returned schema chains `.refine()` for the uniqueness invariant,
 * which produces a `ZodEffects` — we apply it as the LAST operation
 * here so callers don't chain further `ZodArray` methods on top.
 */
function uniqueStringArray(label: string, minLength: number) {
  return z.array(z.string().min(1, `${label} entries must be non-empty strings`))
    .min(minLength, `${label} must contain at least ${minLength} entr${minLength === 1 ? 'y' : 'ies'}`)
    .refine(
      (values) => new Set(values).size === values.length,
      { message: `${label} entries must be unique` },
    );
}

export const PipelineTemplateSchema = z.object({
  id: z.string().min(1, 'id must be a non-empty string'),
  name: z.string().min(1, 'name must be a non-empty string'),
  description: z.string().min(1, 'description must be a non-empty string'),
  linearStages: uniqueStringArray('linearStages', 1),
  lockedStages: uniqueStringArray('lockedStages', 0).optional(),
  offPipelineStages: uniqueStringArray('offPipelineStages', 0),
})
  .passthrough()
  .refine(
    (template) =>
      template.lockedStages === undefined
      || isSubsetOf(template.lockedStages, template.linearStages),
    { message: 'lockedStages must be a subset of linearStages', path: ['lockedStages'] },
  )
  .refine(
    (template) => isDisjointFrom(template.offPipelineStages, template.linearStages),
    {
      message:
        'offPipelineStages must not overlap with linearStages — a stage is either linear OR off-pipeline, not both',
      path: ['offPipelineStages'],
    },
  )
  .refine(
    (template) => !template.linearStages.includes('Cancelled'),
    {
      message:
        '"Cancelled" is a reserved off-pipeline stage name and must not appear in linearStages',
      path: ['linearStages'],
    },
  );

/**
 * The type inferred from the Zod schema. Equivalent to the PRD's
 * `PipelineTemplate` interface — the schema is the source of truth and
 * the inferred type tracks it without manual duplication.
 *
 * Note: `passthrough()` widens the inferred type to allow arbitrary
 * extra keys; runtime callers should treat the named fields as the
 * contract and ignore any extras.
 */
export type PipelineTemplate = z.infer<typeof PipelineTemplateSchema>;

/**
 * Narrower projection of `PipelineTemplate` exposing only the named
 * fields the runtime contract documents. `PipelineTemplate` itself is
 * widened by the schema's `.passthrough()` (which admits unknown extra
 * keys like `$rationale`); downstream consumers that index named fields
 * should accept this strict type instead so typos like
 * `template.lockedSatges` fail at compile time rather than silently
 * resolving to `unknown`.
 *
 * The runtime VALUES are the same — `PipelineTemplate` and
 * `StrictPipelineTemplate` describe the same JSON. The only difference
 * is the type-level surface: `StrictPipelineTemplate` lists exactly the
 * keys the contract names, no more.
 *
 * Convention: loader functions return `PipelineTemplate` (the wide
 * type). Functions whose parameter is the resolved template and which
 * read its named fields should declare `StrictPipelineTemplate`; pass a
 * `PipelineTemplate` to such a function with no conversion (the wide
 * type is assignable to the narrow one through structural subtyping at
 * the property set, since `Pick` drops keys without renaming).
 */
export type StrictPipelineTemplate = Pick<
  PipelineTemplate,
  'id' | 'name' | 'description' | 'linearStages' | 'lockedStages' | 'offPipelineStages'
>;
