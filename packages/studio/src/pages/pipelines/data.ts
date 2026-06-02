/**
 * Data layer for the `/dev/pipelines` studio page (Phase 6 Task 6.4).
 *
 * Enumerates every pipeline template visible to the project — the
 * union of plugin-shipped presets and operator-authored project
 * overrides — and joins per-template metadata the page needs to
 * render: source (`plugin-preset` vs `project-override`), the resolved
 * template (linearStages / lockedStages / offPipelineStages), and the
 * number of active+archived lanes that reference each template id.
 *
 * Per the Phase 2 follow-up captured in the workplan (Task 6.4 lead-in
 * note), `listAvailablePipelineTemplates` returns id strings without
 * pre-validating each template. A malformed
 * `<projectRoot>/.deskwork/pipelines/<id>.json` (parse error, Zod
 * violation, id-mismatch) appears in the picker but fails when the
 * page tries to load it. The data layer surfaces such failures as
 * `PipelineLoadError` rows so the renderer can show them inline —
 * "this id exists but won't load — fix it" rather than silently
 * filtering the id out and making the malformation invisible.
 *
 * The same posture as the lanes data layer: read-only, no fallbacks,
 * one pass through disk per page render. No caching — the page is a
 * cold-path operator surface.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  listAvailablePipelineTemplates,
  loadPipelineTemplate,
  isPluginPresetPipeline,
  hasPipelineOverride,
  pipelineOverridePath,
  pipelinePluginDefaultPath,
  type PipelineTemplate,
} from '@deskwork/core/pipelines';
import { listLaneConfigs } from '@deskwork/core/lanes';

/**
 * Where a template's authoritative JSON came from. A template that
 * has BOTH an override and a plugin preset is reported as
 * `project-override` (override-takes-precedence; the loader resolves
 * the override first).
 */
export type PipelineSource = 'plugin-preset' | 'project-override';

/**
 * Why a template failed to load when the loader was invoked. Surfaced
 * by the data layer so the renderer can show the operator a row with
 * an actionable next step (fix the JSON; mismatched id; missing file).
 *
 * `parse` — JSON.parse threw.
 * `zod` — schema validation rejected the parsed value.
 * `id-mismatch` — JSON's `id` field disagrees with the filename basename.
 * `missing` — file did not exist (should not happen for ids returned
 *   by the enumerator; included for completeness).
 * `unknown` — any other Error shape; the underlying message is
 *   preserved verbatim so the operator can see what the loader said.
 */
export type PipelineLoadErrorKind =
  | 'parse'
  | 'zod'
  | 'id-mismatch'
  | 'missing'
  | 'unknown';

/**
 * Per-template load-error record. The renderer maps these to error
 * rows in the table; the `path` names the file on disk the operator
 * should open, and `message` is the loader's verbatim diagnostic.
 */
export interface PipelineLoadError {
  readonly kind: PipelineLoadErrorKind;
  readonly path: string;
  readonly message: string;
}

/**
 * Per-template summary surfaced to the renderer for a healthy
 * (loadable) template.
 */
export interface PipelineRow {
  readonly id: string;
  readonly source: PipelineSource;
  readonly name: string;
  readonly description: string;
  readonly linearStages: readonly string[];
  readonly lockedStages: readonly string[];
  readonly offPipelineStages: readonly string[];
  /**
   * Active + archived lanes whose `pipelineTemplate` equals this id.
   * Used by the renderer to gate Delete and surface dependents in the
   * disabled-state tooltip.
   */
  readonly referencingLanes: readonly string[];
  /**
   * Page-level count of lanes whose JSON cannot be read or parsed (see
   * AUDIT-20260530-67). An unreadable lane MIGHT reference this
   * template — we cannot know — so the renderer must gate the Delete
   * button conservatively (disable when this count > 0) even when
   * `referencingLanes` is empty. The same count appears on every row
   * because the lane corpus is page-global; attaching it per-row keeps
   * the Delete-button renderer's signature simple.
   */
  readonly unreadableLaneCount: number;
}

/**
 * Per-template error record (template id appeared in the enumerator
 * but failed to load).
 */
export interface PipelineErrorRow {
  readonly id: string;
  readonly source: PipelineSource;
  readonly error: PipelineLoadError;
  /**
   * Lanes that reference this id, computed against the id-string only
   * (no template load needed). Surfaced so the operator sees who
   * depends on this broken template.
   */
  readonly referencingLanes: readonly string[];
}

export interface PipelinesPageData {
  readonly rows: readonly PipelineRow[];
  readonly errors: readonly PipelineErrorRow[];
  /** Total lane count surveyed (active + archived). */
  readonly totalLanes: number;
  /**
   * Lanes the inverse-index walker enumerated but could not classify
   * (read/parse/shape failure). See AUDIT-20260530-67: such lanes
   * MIGHT reference any template — the renderer surfaces a
   * page-level banner and gates Delete conservatively when this is
   * non-zero. Empty-disk and missing-file cases do NOT contribute.
   */
  readonly unreadableLaneCount: number;
}

/**
 * Determine the source of a template id. Override-takes-precedence:
 * an id with both an override and a preset is reported as
 * `project-override` (mirrors the loader's resolution order).
 */
function sourceForId(projectRoot: string, id: string): PipelineSource {
  if (hasPipelineOverride(projectRoot, id)) return 'project-override';
  if (isPluginPresetPipeline(id)) return 'plugin-preset';
  // The enumerator only emits ids whose JSON exists on disk; a
  // disappearing-file race between enumeration and source-classification
  // surfaces as `plugin-preset` so the renderer's load attempt will
  // fail with `missing`, naming the path. This is a non-fallback —
  // we're not pretending the template exists; we're routing the
  // failure to the load-error code path.
  return 'plugin-preset';
}

/**
 * Resolve the on-disk JSON path for a template id, picking the
 * override path when one exists and falling back to the plugin
 * default. Used for the error-row `path` so the operator can open
 * the offending file.
 */
function pathForId(projectRoot: string, id: string): string {
  if (hasPipelineOverride(projectRoot, id)) {
    return pipelineOverridePath(projectRoot, id);
  }
  return pipelinePluginDefaultPath(id);
}

/**
 * Classify a thrown loader error into a `PipelineLoadErrorKind` so the
 * renderer can present a tailored hint. The loader's error messages
 * are stable (see `packages/core/src/pipelines/loader.ts`'s
 * `readAndValidate`), so substring matching against those strings is
 * a contract-level signal, not a brittle parse.
 */
function classifyLoadError(message: string): PipelineLoadErrorKind {
  if (message.includes('not found') || message.includes('not valid JSON')) {
    if (message.includes('not valid JSON')) return 'parse';
    return 'missing';
  }
  if (message.includes('failed Zod validation')) return 'zod';
  if (message.includes('declares id') && message.includes('was loaded as')) {
    return 'id-mismatch';
  }
  return 'unknown';
}

/**
 * Tri-state result for `readLanePipelineTemplate`. Replaces the prior
 * `string | null` shape per AUDIT-20260530-67: that shape conflated
 * "no file on disk" (genuinely no reference) with "file present but
 * unreadable / unparseable" (unknown-but-possibly-referencing). The
 * pipelines Delete gate cares about the difference — an unreadable
 * lane MIGHT reference the template the operator is about to delete,
 * so the renderer needs to know.
 *
 * `no-file` — `existsSync` returned false; the lane id was enumerated
 *   but the file vanished between listing and read. Treat as no
 *   reference (no risk to the Delete gate).
 * `unreadable` — file exists but cannot be read, parsed as JSON, or
 *   does not carry a string `pipelineTemplate` field. The caller MUST
 *   count this lane into `unreadableLaneCount`; it cannot be
 *   classified as "no reference here" without losing the audit-cited
 *   information.
 * `reference` — file parsed cleanly, `pipelineTemplate` is a string;
 *   the lane references that template id.
 */
type LanePipelineReadResult =
  | { readonly kind: 'no-file' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'reference'; readonly templateId: string };

/**
 * Read a lane config's raw JSON for ONLY the `pipelineTemplate`
 * field, without the cross-validating `loadLaneConfig` path that
 * insists the referenced template also resolves. The pipelines page
 * needs to count which lanes reference a given template id even when
 * the template itself is broken — using `loadLaneConfig` would skip
 * those lanes (its loader throws when the cross-validation fails),
 * making a broken template's dependents invisible exactly when the
 * operator most needs to see them.
 *
 * Returns a `LanePipelineReadResult` discriminated union so the
 * caller can distinguish ENOENT (`no-file`, safe to ignore for
 * dependency-counting) from genuine read / parse / shape failure
 * (`unreadable`, MUST surface as an unknown dependent). Per
 * AUDIT-20260530-67 this distinction is load-bearing for the Delete
 * gate's correctness.
 */
function readLanePipelineTemplate(
  projectRoot: string,
  laneId: string,
): LanePipelineReadResult {
  const path = join(projectRoot, '.deskwork', 'lanes', `${laneId}.json`);
  if (!existsSync(path)) return { kind: 'no-file' };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { kind: 'unreadable' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'unreadable' };
  }
  if (
    parsed === null
    || typeof parsed !== 'object'
    || !('pipelineTemplate' in parsed)
  ) {
    return { kind: 'unreadable' };
  }
  // After the `in` narrowing, `parsed.pipelineTemplate` is `unknown` —
  // no cast needed; the runtime `typeof` check below is the type
  // guard. A non-string value is a malformation just like a parse
  // failure: we cannot determine which template (if any) the lane
  // references, so the caller must treat it as unknown-dependent.
  const value: unknown = parsed.pipelineTemplate;
  if (typeof value !== 'string') return { kind: 'unreadable' };
  return { kind: 'reference', templateId: value };
}

/**
 * Output of `buildLaneRefIndex`. The `index` maps templateId →
 * confirmed-referencing lane ids; `unreadableLaneCount` is the
 * page-level count of lanes whose file existed but whose
 * `pipelineTemplate` field could not be determined. Per
 * AUDIT-20260530-67 the count is what the Delete gate needs to stay
 * conservative — those lanes MIGHT reference any template, so a
 * template with zero confirmed references is still unsafe to delete
 * when this count is non-zero.
 */
interface LaneRefIndex {
  readonly index: ReadonlyMap<string, string[]>;
  readonly unreadableLaneCount: number;
}

/**
 * Build an inverse map from templateId → referencing lane ids. Walks
 * every lane config (active + archived) ONCE, reading each lane's raw
 * JSON for its `pipelineTemplate` field (via `readLanePipelineTemplate`
 * — see that function's docstring for why this bypasses
 * `loadLaneConfig`).
 *
 * Per AUDIT-20260530-67 lanes whose file exists but cannot be read,
 * parsed, or do not carry a string `pipelineTemplate` field are
 * counted into `unreadableLaneCount` rather than silently dropped.
 * The caller (and the renderer downstream) uses that count to gate
 * the Delete button conservatively — an unreadable lane MIGHT
 * reference the template the operator is about to delete, and we
 * cannot prove otherwise without reading the file.
 *
 * O(M) disk reads (where M is lane count). Replaces the prior O(N*M)
 * pattern that re-walked every lane for each template.
 */
function buildLaneRefIndex(
  projectRoot: string,
  laneIds: readonly string[],
): LaneRefIndex {
  const index = new Map<string, string[]>();
  let unreadableLaneCount = 0;
  for (const laneId of laneIds) {
    const result = readLanePipelineTemplate(projectRoot, laneId);
    if (result.kind === 'no-file') continue;
    if (result.kind === 'unreadable') {
      unreadableLaneCount += 1;
      continue;
    }
    const existing = index.get(result.templateId);
    if (existing === undefined) {
      index.set(result.templateId, [laneId]);
    } else {
      existing.push(laneId);
    }
  }
  return { index, unreadableLaneCount };
}

/**
 * Build a `PipelineRow` from a successfully-loaded template. The
 * `linearStages` / `lockedStages` / `offPipelineStages` arrays are
 * defensively re-copied as frozen arrays so the renderer can iterate
 * without aliasing the loader's internal state.
 *
 * `unreadableLaneCount` is the page-level count attached to every row
 * (the lane corpus is page-global). Per AUDIT-20260530-67 the
 * renderer uses it to gate the Delete button even when
 * `referencingLanes` is empty.
 */
function rowFromTemplate(
  id: string,
  source: PipelineSource,
  template: PipelineTemplate,
  referencingLanes: readonly string[],
  unreadableLaneCount: number,
): PipelineRow {
  return {
    id,
    source,
    name: template.name,
    description: template.description,
    linearStages: [...template.linearStages],
    lockedStages:
      template.lockedStages === undefined ? [] : [...template.lockedStages],
    offPipelineStages: [...template.offPipelineStages],
    referencingLanes,
    unreadableLaneCount,
  };
}

/**
 * Load the full pipelines-page data view. Resolves every enumerated
 * template id through `loadPipelineTemplate`; healthy loads land in
 * `rows`, failures land in `errors` with the offending path + kind +
 * verbatim message. Lane-reference counts are computed once per
 * template id against the active+archived lane set.
 *
 * @param projectRoot - Absolute project root.
 */
export async function loadPipelinesPageData(
  projectRoot: string,
): Promise<PipelinesPageData> {
  const templateIds = listAvailablePipelineTemplates(projectRoot);
  const laneIds = listLaneConfigs(projectRoot, { includeArchived: true });

  // Build the lane-references index ONCE before iterating templates so
  // template-row construction is O(1) lookup per template rather than
  // a fresh O(M) walk per template (which was the prior O(N*M) shape).
  // Per AUDIT-20260530-67 the walker also reports the count of lanes
  // it could not classify (unreadable JSON, missing field, etc.); the
  // count rides on every row + on the page-level data shape so the
  // renderer can gate the Delete button conservatively.
  const { index: laneRefs, unreadableLaneCount } = buildLaneRefIndex(
    projectRoot,
    laneIds,
  );

  const rows: PipelineRow[] = [];
  const errors: PipelineErrorRow[] = [];

  for (const id of templateIds) {
    const source = sourceForId(projectRoot, id);
    const referencingLanes = laneRefs.get(id) ?? [];
    try {
      const template = loadPipelineTemplate(id, projectRoot);
      rows.push(
        rowFromTemplate(id, source, template, referencingLanes, unreadableLaneCount),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: PipelineLoadError = {
        kind: classifyLoadError(message),
        path: pathForId(projectRoot, id),
        message,
      };
      errors.push({ id, source, error, referencingLanes });
    }
  }

  return {
    rows,
    errors,
    totalLanes: laneIds.length,
    unreadableLaneCount,
  };
}
