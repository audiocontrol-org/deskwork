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
 * PipelineTemplate convention). The loader passes the field through
 * the schema via `.passthrough()` and ignores it at runtime; it exists
 * so operator-authored lane configs can carry inline documentation
 * that survives `jq` / `cat` inspection.
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
export const LaneConfigSchema = z.object({
  id: z.string().min(1, 'id must be a non-empty string'),
  name: z.string().min(1, 'name must be a non-empty string'),
  pipelineTemplate: z.string().min(1, 'pipelineTemplate must be a non-empty string'),
  contentDir: z.string().min(1, 'contentDir must be a non-empty string'),
  archivedAt: z.string().datetime().optional(),
}).passthrough();

/**
 * The type inferred from the Zod schema. Equivalent to the PRD's
 * `LaneConfig` interface — the schema is the source of truth and the
 * inferred type tracks it without manual duplication.
 *
 * Note: `passthrough()` widens the inferred type to allow arbitrary
 * extra keys; runtime callers should treat the named fields as the
 * contract and ignore any extras.
 */
export type LaneConfig = z.infer<typeof LaneConfigSchema>;

/**
 * Narrower projection of `LaneConfig` exposing only the named fields
 * the runtime contract documents. Mirrors `StrictPipelineTemplate` —
 * downstream consumers that index named fields should accept this
 * strict type so typos like `lane.pipelineTemlpate` fail at compile
 * time rather than silently resolving to `unknown`.
 */
export type StrictLaneConfig = Pick<
  LaneConfig,
  'id' | 'name' | 'pipelineTemplate' | 'contentDir' | 'archivedAt'
>;

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
