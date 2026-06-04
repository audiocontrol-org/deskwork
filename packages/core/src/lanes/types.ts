/**
 * LaneConfig — a per-lane configuration that binds a content tree to a
 * pipeline template.
 *
 * Lanes are the graphical-entries unit of parallel-pipeline tracking
 * (PRD § Lanes). A project hosts one or more lanes; each lane has a
 * pipeline template and a stage vocabulary derived from that template.
 * A lane is a LOGICAL grouping identified by `id` — it carries NO
 * location of its own. Per the sites→lanes retirement (Phase 39),
 * location is a property of the ENTRY (`entry.artifactPath`), never the
 * lane. A lane "spans" whatever directories/filesystems its entries
 * happen to live in — emergent from the entries, not declared on the
 * lane. Entries carry `lane: <laneId>` to identify membership.
 *
 * Plugin defaults: there are none. Lanes are project-owned; every lane
 * config lives under `<projectRoot>/.deskwork/lanes/<id>.json`. The
 * loader bootstrap helper auto-creates a `default` lane bound to
 * `editorial` for pre-feature projects that have only a legacy
 * `sites.<defaultSite>.contentDir` block — see `./bootstrap.ts`.
 *
 * Invariants enforced by the Zod schema below:
 *
 *   - `id` is a non-empty string; conventionally lowercase kebab-case
 *     matching the JSON filename basename (the loader validates that
 *     match at load time, not the schema, mirroring the
 *     PipelineTemplate convention).
 *   - `name` is a non-empty human-readable label.
 *   - `pipelineTemplate` is a non-empty string referencing a
 *     PipelineTemplate id; the loader cross-validates that the
 *     referenced template resolves via `loadPipelineTemplate`.
 *   - `host` (optional) — present only when this lane publishes its
 *     content tree as a website. A lane without a host is fully valid
 *     (the collection model is renderer-independent). Where the host
 *     reads land (studio URL formatting) is a downstream concern; the
 *     schema only records the optional string.
 *   - `scaffoldDefaults` (optional) — a PARTIAL map from `ArtifactKind`
 *     to the directory where `/deskwork:add` drops a NEW file of that
 *     kind. Partial by construction: a lane defines defaults only for
 *     the kinds its pipeline actually scaffolds (e.g. a single-kind
 *     map `{ markdown: 'src/content/blog' }` validates). It is a
 *     convenience default used solely at add-time — NEVER identity,
 *     NEVER resolution. Unknown keys are rejected because the key
 *     schema is the `ArtifactKind` enum.
 *
 * The on-disk JSON additionally permits a top-level `"$rationale"`
 * string field as the JSON-with-comments workaround (matching the
 * PipelineTemplate convention). The schema declares `$rationale`
 * explicitly and uses `.strict()` so unknown top-level keys fail parse
 * with an actionable error naming the offending key — mirrors the
 * PipelineTemplate AUDIT-20260530-02 fix. Operator-authored lane
 * configs can carry inline documentation under `$rationale`; anything
 * else at the top level is rejected.
 */

import { z } from 'zod';

/**
 * Soft-archive marker (Phase 6 Task 6.1). When present, the lane is
 * considered "archived" — listings hide it by default, dashboard /
 * studio renderers skip it, but the JSON file stays on disk along with
 * every entry that referenced the lane. Restoring strips the field.
 *
 * The value is an ISO datetime carrying the moment the archive verb
 * ran. The truthiness of the field is the boolean signal; the
 * datetime is the audit trail. Per the project's "content-management
 * databases preserve, they don't delete" rule, archive is the
 * preferred disposition over destructive deletion — `purge` is gated
 * and refuses when any entry still references the lane.
 */
/**
 * Canonical lane id charset: kebab-case starting with [a-z0-9], allowing
 * `[a-z0-9-]` thereafter. The convention was documented above in the
 * docblock; encoding it in the schema makes invalid ids fail at parse
 * time AND closes the path-traversal exposure (an id like `../../etc/foo`
 * resolves outside `.deskwork/lanes/` if the schema only enforces
 * non-empty).
 *
 * Operations that resolve `<id>` to a filesystem path (loader, create)
 * additionally enforce the lanes-dir containment invariant via a
 * defensive path check — belt-and-suspenders; the regex prevents the
 * case and the path check enforces the invariant at the filesystem
 * boundary.
 */
export const LANE_ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The four artifact kinds the lane-aware entry model recognizes:
 *   - `markdown`           — a single `.md` file (the legacy editorial
 *                            artifact shape).
 *   - `html-mockup`        — a directory containing `index.html` plus
 *                            optional sibling assets (mockups / design
 *                            specs / standalone HTML deliverables).
 *   - `single-file-html`   — a loose `.html` file (not inside an
 *                            html-mockup directory).
 *   - `image`              — a raster or vector image file (.png /
 *                            .jpg / .jpeg / .gif / .webp / .svg).
 *
 * Detection: see `./detection.ts` (`detectArtifactKind`).
 *
 * Declared ABOVE `LaneConfigSchema` so the schema's `scaffoldDefaults`
 * record can key off this enum (a `z.record` over the enum is partial
 * by construction — see the `scaffoldDefaults` field docblock).
 */
export const ArtifactKindSchema = z.enum([
  'markdown',
  'html-mockup',
  'single-file-html',
  'image',
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const LaneConfigSchema = z.object({
  id: z.string().regex(
    LANE_ID_REGEX,
    'lane id must be kebab-case [a-z0-9-], starting with [a-z0-9]',
  ),
  name: z.string().min(1, 'name must be a non-empty string'),
  pipelineTemplate: z.string().min(1, 'pipelineTemplate must be a non-empty string'),
  // NOTE: a lane carries NO location. `contentDir` was removed in
  // Phase 39c (sites→lanes retirement) — location is an ENTRY property
  // (`entry.artifactPath`). A lane's only location-adjacent field is the
  // optional add-time `scaffoldDefaults` below, which is never identity
  // and never used for resolution. Because the schema is `.strict()`, a
  // legacy on-disk lane carrying `contentDir` now FAILS parse with an
  // unknown-key error; the doctor migration cleans it.
  // Optional — present only when this lane publishes to a website.
  host: z.string().min(1, 'host must be a non-empty string when present').optional(),
  // Optional — website-publishing metadata, a sibling of `host`. Path
  // (relative to the project root, or absolute) to a Netlify-style
  // `_redirects` file; `rename-slug` appends a 301 block here when the
  // lane is configured to publish to a website. Only meaningful when the
  // lane publishes a website — a lane without it is fully valid and the
  // redirect-append step is simply skipped. Re-homed from the retired
  // `SiteConfig.redirectsPath` in Phase 39c (sites→lanes retirement,
  // spec Decision #23 — mirrors how `host` re-homed under Decision #2).
  redirectsPath: z.string().min(1, 'redirectsPath must be a non-empty string when present').optional(),
  // Optional, PARTIAL-by-construction map from ArtifactKind → scaffold
  // directory. A single-kind map validates; unknown keys are rejected
  // because the key schema is the ArtifactKind enum. Used solely at
  // add-time to choose where a NEW file lands — never identity, never
  // resolution.
  scaffoldDefaults: z.record(ArtifactKindSchema, z.string().min(1)).optional(),
  archivedAt: z.string().datetime().optional(),
  // Sole explicitly-declared "extra" key — the comments-in-JSON
  // workaround that mirrors PipelineTemplateSchema (AUDIT-20260530-02).
  // Declared so `.strict()` admits it; anything else at the top level
  // is rejected.
  $rationale: z.string().optional(),
}).strict();

/**
 * The type inferred from the Zod schema. Equivalent to the PRD's
 * `LaneConfig` interface — the schema is the source of truth and the
 * inferred type tracks it without manual duplication.
 *
 * The schema is `.strict()`, so the inferred type lists exactly the
 * declared keys: `id`, `name`, `pipelineTemplate`, `host` (optional),
 * `scaffoldDefaults` (optional), `archivedAt` (optional), `$rationale`
 * (optional). Unknown top-level keys — including the retired
 * `contentDir` — fail parse at the schema layer (AUDIT-20260530-08 fix).
 */
export type LaneConfig = z.infer<typeof LaneConfigSchema>;
