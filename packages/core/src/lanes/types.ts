/**
 * LaneConfig — a per-lane configuration that binds a content tree to a
 * pipeline template.
 *
 * Lanes are the graphical-entries unit of parallel-pipeline tracking
 * (PRD § Lanes). A project hosts one or more lanes; each lane has its
 * own content directory, its own pipeline template, and its own stage
 * vocabulary derived from that template. Entries live inside a single
 * lane; the entry's sidecar carries `lane: <laneId>` to identify
 * membership.
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
 *   - `contentDir` is a non-empty path; relative paths are resolved
 *     against the project root by callers, absolute paths are taken
 *     verbatim. Doctor may normalize later; the schema enforces
 *     non-empty only.
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

export const LaneConfigSchema = z.object({
  id: z.string().regex(
    LANE_ID_REGEX,
    'lane id must be kebab-case [a-z0-9-], starting with [a-z0-9]',
  ),
  name: z.string().min(1, 'name must be a non-empty string'),
  pipelineTemplate: z.string().min(1, 'pipelineTemplate must be a non-empty string'),
  contentDir: z.string().min(1, 'contentDir must be a non-empty string'),
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
 * declared keys: `id`, `name`, `pipelineTemplate`, `contentDir`,
 * `archivedAt` (optional), `$rationale` (optional). Unknown top-level
 * keys fail parse at the schema layer (AUDIT-20260530-08 fix).
 */
export type LaneConfig = z.infer<typeof LaneConfigSchema>;

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
 */
export const ArtifactKindSchema = z.enum([
  'markdown',
  'html-mockup',
  'single-file-html',
  'image',
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
