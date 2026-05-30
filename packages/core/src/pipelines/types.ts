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
 * (since RFC 8259 JSON disallows comments). The schema declares
 * `$rationale: z.string().optional()` explicitly and uses `.strict()`
 * so every unknown top-level key fails parse with an actionable error
 * naming the offending key — typos like `lockdStages` (transposed
 * `lockedStages`) used to silently resolve to `undefined` under a
 * blanket `.passthrough()` and ship a pipeline with no lock gate
 * (AUDIT-20260530-02). Custom operator-authored templates are free to
 * include or omit `$rationale`; anything beyond the declared key set
 * is rejected.
 */

import { z } from 'zod';
import { stageNameToFilesystemToken } from './stage-token.ts';

/**
 * Canonical pipeline id charset: kebab-case starting with `[a-z0-9]`,
 * allowing `[a-z0-9-]` thereafter. Re-exported here so the schema can
 * bind it without depending on `./loader.ts` (which already depends on
 * this module). The single source of truth for the regex value lives
 * in `./loader.ts` — see `PIPELINE_ID_REGEX` there.
 *
 * Mirrors `LANE_ID_REGEX` over in `lanes/types.ts`. Pipeline ids end up
 * as JSON filenames under `.deskwork/pipelines/` and `dist/pipelines/`,
 * so the same character restrictions and path-traversal exposure apply.
 *
 * Schema-binding closes AUDIT-20260530-01: an operator who authors a
 * non-canonical id INSIDE a template's JSON (matching the filename
 * basename so the loader's id-mismatch check passes) used to slide
 * through `z.string().min(1)`. The regex catches it at parse time.
 */
const PIPELINE_ID_REGEX_FOR_SCHEMA = /^[a-z0-9][a-z0-9-]*$/;

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
  id: z.string().regex(
    PIPELINE_ID_REGEX_FOR_SCHEMA,
    'pipeline id must be kebab-case [a-z0-9-], starting with [a-z0-9]',
  ),
  name: z.string().min(1, 'name must be a non-empty string'),
  description: z.string().min(1, 'description must be a non-empty string'),
  linearStages: uniqueStringArray('linearStages', 1),
  lockedStages: uniqueStringArray('lockedStages', 0).optional(),
  offPipelineStages: uniqueStringArray('offPipelineStages', 0),
  // Sole explicitly-declared "extra" key — the comments-in-JSON
  // workaround the presets use. Declared so `.strict()` admits it.
  // Anything else at the top level is rejected (AUDIT-20260530-02).
  $rationale: z.string().optional(),
})
  .strict()
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
  )
  // Stage names must produce unique filesystem tokens via
  // `stageNameToFilesystemToken`. Two stages whose tokenized forms
  // collide would race against each other when verbs write snapshot
  // files (`drafting.md` vs `Drafting` both produce `drafting.md`).
  // Catching at template-load time surfaces the failure where the
  // operator can fix it (in the template JSON) rather than later when
  // a verb's snapshot write conflicts at runtime.
  .refine(
    (template) => uniqueTokens(template.linearStages),
    {
      message:
        'linearStages contains entries whose stageNameToFilesystemToken forms collide; '
        + 'rename one stage to ensure every linearStage tokenizes to a distinct filesystem path',
      path: ['linearStages'],
    },
  )
  .refine(
    (template) => uniqueTokens(template.offPipelineStages),
    {
      message:
        'offPipelineStages contains entries whose stageNameToFilesystemToken forms collide; '
        + 'rename one stage to ensure every offPipelineStage tokenizes to a distinct filesystem path',
      path: ['offPipelineStages'],
    },
  );

function uniqueTokens(stages: readonly string[]): boolean {
  const tokens = new Set<string>();
  for (const stage of stages) {
    let token: string;
    try {
      token = stageNameToFilesystemToken(stage);
    } catch {
      // If a stage name is not tokenizable at all, the
      // stageNameToFilesystemToken contract has its own error path the
      // caller will see at first-write time. Schema-level we treat the
      // un-tokenizable stage as "passing the collision check" (it can't
      // collide with itself) — the per-stage tokenization-rejection
      // surfaces separately.
      continue;
    }
    if (tokens.has(token)) return false;
    tokens.add(token);
  }
  return true;
}

/**
 * The type inferred from the Zod schema. Equivalent to the PRD's
 * `PipelineTemplate` interface — the schema is the source of truth and
 * the inferred type tracks it without manual duplication.
 *
 * The schema is `.strict()`, so the inferred type lists exactly the
 * declared keys: `id`, `name`, `description`, `linearStages`,
 * `lockedStages` (optional), `offPipelineStages`, `$rationale`
 * (optional). Unknown top-level keys fail parse at the schema layer.
 */
export type PipelineTemplate = z.infer<typeof PipelineTemplateSchema>;

/**
 * Narrower projection of `PipelineTemplate` exposing only the
 * stage-shape fields the runtime verb-routing contract reads. Drops
 * `$rationale` (documentation-only on disk; never consulted by verbs).
 *
 * The runtime VALUES are the same — `PipelineTemplate` and
 * `StrictPipelineTemplate` describe the same JSON. The only difference
 * is the type-level surface: `StrictPipelineTemplate` excludes the
 * documentation-only fields so verb code doesn't accidentally read
 * them.
 *
 * Convention: loader functions return `PipelineTemplate`. Functions
 * whose parameter is the resolved template and which only need the
 * stage shape declare `StrictPipelineTemplate`; pass a
 * `PipelineTemplate` to such a function with no conversion (the wide
 * type is assignable to the narrow one through structural subtyping
 * at the property set).
 */
export type StrictPipelineTemplate = Pick<
  PipelineTemplate,
  'id' | 'name' | 'description' | 'linearStages' | 'lockedStages' | 'offPipelineStages'
>;
