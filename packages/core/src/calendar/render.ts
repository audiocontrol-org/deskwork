/**
 * Calendar renderer (Phase 4 — lane-template-aware).
 *
 * Per the graphical-entries PRD, a project may host one or more lanes,
 * each bound to a pipeline template that names its own stages. The
 * renderer iterates the lane's `linearStages ∪ offPipelineStages` to
 * produce per-lane sections; entries with no `lane` set (legacy /
 * migration-window) fall back to the editorial template's stage list.
 *
 * Issue #247: the legacy `STAGE_ORDER` constant was hardcoded to the
 * editorial 8-stage list. Lanes whose templates use different stage
 * names (visual: `Sketched / Iterating / Approved / Shipped`) had
 * their entries silently dropped because the bucketize step had no
 * bucket for the unknown stage. The template-driven iteration fixes
 * the drop.
 *
 * Single-lane (legacy editorial) projects keep their existing render
 * shape unchanged — the output is a single set of `## <Stage>`
 * sections in the editorial template's order, identical to pre-Phase-4
 * output.
 *
 * AUDIT-20260530-14: the multi-lane path silently dropped entries
 * whose `currentStage` was not in their lane's template (legacy stage,
 * template-edit that removed a stage, deleted-visual-lane orphan at a
 * non-editorial stage). Mirror of AUDIT-20260529-37 in the entry-review
 * composed view but on the canonical calendar SSOT — bigger blast
 * radius because every reconciliation downstream of the calendar
 * trusts the SSOT. `bucketize` now returns an `unbucketed` tail
 * alongside the stage-keyed buckets; `renderStageSections` emits an
 * `## (unrecognized stage)` section per lane (and
 * `## (unrecognized stage in unassigned)` for the orphan lane) so
 * stage-not-in-template entries remain visible inline.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Entry } from '../schema/entry.ts';
import { loadPipelineTemplate } from '../pipelines/loader.ts';
import { listLaneConfigs, loadLaneConfig } from '../lanes/loader.ts';
import { PipelineTemplateSchema, type PipelineTemplate } from '../pipelines/types.ts';

const HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER = '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';
const EMPTY = '*No entries.*\n\n';

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function renderRow(e: Entry): string {
  return `| ${e.uuid} | ${escapePipe(e.slug)} | ${escapePipe(e.title)} | ${escapePipe(e.description ?? '')} | ${escapePipe(e.keywords.join(', '))} | ${escapePipe(e.source)} | ${e.updatedAt} |`;
}

function renderStageSection(stage: string, bucket: readonly Entry[]): string {
  let section = `## ${stage}\n\n`;
  if (bucket.length === 0) {
    section += EMPTY;
    return section;
  }
  section += TABLE_HEADER;
  for (const e of bucket) section += renderRow(e) + '\n';
  section += '\n';
  return section;
}

/**
 * Render a row that surfaces an entry whose `currentStage` did not
 * route into any template-known bucket. The raw `currentStage` value
 * is shown so the operator can diagnose (legacy stage, template-edit
 * that dropped a stage, operator typo, etc.).
 */
function renderUnbucketedRow(e: Entry): string {
  return `| ${e.uuid} | ${escapePipe(e.slug)} | ${escapePipe(e.title)} | ${escapePipe(e.description ?? '')} | ${escapePipe(e.keywords.join(', '))} | ${escapePipe(e.source)} | ${e.updatedAt} | ${escapePipe(e.currentStage)} |`;
}

const UNBUCKETED_TABLE_HEADER = '| UUID | Slug | Title | Description | Keywords | Source | Updated | currentStage |\n|------|------|------|------|------|------|------|------|\n';

/**
 * Render the unbucketed-tail section for entries whose `currentStage`
 * is not present in the template's stage list. Mirrors AUDIT-20260529-37
 * (the members-section unbucketed-tail precedent at
 * `packages/studio/src/pages/entry-review/members-bucketing.ts`) so
 * stage-not-in-template entries surface inline rather than silently
 * vanishing from the canonical calendar SSOT.
 *
 * Headline names the bucket so AUDIT-20260530-14 cannot regress
 * silently — entries appear with their offending `currentStage` shown.
 */
function renderUnbucketedSection(
  headline: string,
  bucket: readonly Entry[],
): string {
  if (bucket.length === 0) return '';
  let section = `## ${headline}\n\n`;
  section += UNBUCKETED_TABLE_HEADER;
  for (const e of bucket) section += renderUnbucketedRow(e) + '\n';
  section += '\n';
  return section;
}

/**
 * Produce the full ordered stage list for a template:
 * `linearStages` then `offPipelineStages` (in declaration order). The
 * concatenation is the calendar's section order; the existing
 * editorial render shape was `Ideas / Planned / Outlining / Drafting /
 * Final / Published / Blocked / Cancelled`, which matches this
 * concatenation exactly for the editorial preset.
 */
function templateStageOrder(template: PipelineTemplate): readonly string[] {
  return [...template.linearStages, ...template.offPipelineStages];
}

/**
 * Result of bucketing entries by their `currentStage`. Carries the
 * stage-keyed buckets PLUS an `unbucketed` tail for entries whose
 * `currentStage` is not in the template's stage list.
 *
 * Mirrors `BucketingResult` from
 * `packages/studio/src/pages/entry-review/members-bucketing.ts` (the
 * AUDIT-20260529-37 precedent at the entry-review composed view).
 * Per AUDIT-20260530-14 the same shape is required here at the
 * canonical calendar SSOT so stage-not-in-template entries no longer
 * silently disappear.
 */
interface BucketingResult {
  readonly byStage: ReadonlyMap<string, readonly Entry[]>;
  readonly unbucketed: readonly Entry[];
}

/**
 * Bucket entries by their `currentStage`, ignoring lane membership.
 * Used by the single-lane render path. Lane-aware rendering uses a
 * pre-filtered entry list per lane.
 *
 * Per AUDIT-20260530-14: entries whose `currentStage` is not in
 * `stages` are collected into the `unbucketed` tail so they remain
 * visible in the canonical calendar SSOT. Pre-fix they were silently
 * dropped (`byStage.get(e.currentStage)` returned `undefined` → never
 * pushed), reintroducing the exact #247 silent-drop failure mode on
 * the multi-lane path.
 */
function bucketize(entries: readonly Entry[], stages: readonly string[]): BucketingResult {
  const byStage = new Map<string, Entry[]>();
  const known = new Set<string>(stages);
  const unbucketed: Entry[] = [];
  for (const stage of stages) byStage.set(stage, []);
  for (const e of entries) {
    if (!known.has(e.currentStage)) {
      unbucketed.push(e);
      continue;
    }
    const bucket = byStage.get(e.currentStage);
    // Defensive: known.has(...) above guarantees byStage.get(...) returns
    // a defined bucket here (the for-stage initialization above seeds
    // every entry of `known`). The guard keeps the type narrowing
    // explicit and matches strict-mode expectations.
    if (bucket !== undefined) bucket.push(e);
  }
  return { byStage, unbucketed };
}

/**
 * Render a single set of stage sections (no lane header). Used by the
 * legacy single-lane / migration-window path AND by every per-lane
 * block in the multi-lane path.
 *
 * Per AUDIT-20260530-14: the `unbucketed` tail is rendered as an
 * explicit `## (unrecognized stage)` section so stage-not-in-template
 * entries remain visible in the rendered output. `unbucketedHeadline`
 * lets callers distinguish per-lane (`(unrecognized stage)`) from the
 * orphan-lane case (`(unrecognized stage in unassigned)`).
 */
function renderStageSections(
  entries: readonly Entry[],
  template: PipelineTemplate,
  unbucketedHeadline: string = '(unrecognized stage)',
): string {
  const stages = templateStageOrder(template);
  const { byStage, unbucketed } = bucketize(entries, stages);
  let out = '';
  for (const stage of stages) {
    const bucket = byStage.get(stage) ?? [];
    out += renderStageSection(stage, bucket);
  }
  out += renderUnbucketedSection(unbucketedHeadline, unbucketed);
  return out;
}

interface LaneContext {
  readonly id: string;
  readonly name: string;
  readonly template: PipelineTemplate;
}

/**
 * Resolve every project lane plus its bound template. Returns an empty
 * array when no lane configs exist or `projectRoot` is undefined
 * (the legacy single-lane render path).
 */
function loadLaneContexts(projectRoot: string | undefined): LaneContext[] {
  if (projectRoot === undefined) return [];
  const ids = listLaneConfigs(projectRoot);
  const out: LaneContext[] = [];
  for (const id of ids) {
    const lane = loadLaneConfig(id, projectRoot);
    const template: PipelineTemplate = loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
    out.push({ id: lane.id, name: lane.name, template });
  }
  return out;
}

/**
 * Path to the bundled editorial preset JSON resolved relative to THIS
 * module's location (works in both source-mode (tsx) and built-mode
 * (node dist/)). The build script copies `src/pipelines/*.json` into
 * `dist/pipelines/`, and the `dist/calendar/` compiled module sits at
 * the same `../pipelines/` depth as the source module. Mirrors the
 * `PLUGIN_DEFAULTS_DIR` mechanic in `pipelines/loader.ts`.
 */
const EDITORIAL_PRESET_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'pipelines',
  'editorial.json',
);

/**
 * Cached editorial preset template. Lazily loaded on first call to
 * `loadEditorialPreset` to avoid the readFileSync + JSON.parse +
 * Zod validation on cold-import in code paths that never use it.
 */
let cachedEditorialPreset: PipelineTemplate | undefined;

/**
 * Load the editorial preset template from the bundled `editorial.json`
 * resource. Used as the fallback stage vocabulary when no lane configs
 * are present (legacy / migration-window — the test fixtures that
 * exercise `renderCalendar` without a project root rely on this) AND
 * as the orphan-lane stage vocabulary when entries reference deleted
 * or unknown lane ids (AUDIT-20260530-14).
 *
 * Previously this lived as an in-line `EDITORIAL_FALLBACK` constant
 * that hardcoded the editorial preset's stage list with a "MUST stay
 * in sync with editorial.json" comment + a Phase-8 deletion deferral
 * with no issue link (AUDIT-20260530-19, "Just for now is bullshit"
 * violation). Loading the JSON directly removes the duplication and
 * the manual sync burden — `editorial.json` is the single source of
 * truth, and a future stage-list change to the preset propagates here
 * automatically. The Phase-8 deletion-of-this-fallback path is also
 * gone: there is no duplication left to delete.
 *
 * Memoized via `cachedEditorialPreset` so the readFileSync + JSON.parse
 * + Zod validation only happen on the first call per process.
 *
 * Throws if the bundled `editorial.json` is missing or fails Zod
 * validation (the preset ships with the package — both are
 * impossible-by-construction at runtime; the explicit throw documents
 * the boundary).
 */
function loadEditorialPreset(): PipelineTemplate {
  if (cachedEditorialPreset !== undefined) return cachedEditorialPreset;
  const raw = readFileSync(EDITORIAL_PRESET_PATH, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  const result = PipelineTemplateSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Bundled editorial preset at ${EDITORIAL_PRESET_PATH} failed Zod validation:\n${issues}`,
    );
  }
  cachedEditorialPreset = result.data;
  return cachedEditorialPreset;
}

/**
 * Render the editorial calendar as markdown.
 *
 * Modes:
 *
 *   - `renderCalendar(entries)` — legacy single-lane shape. Iterates
 *     the editorial template's stages. Issue #247 is closed for this
 *     mode by using the editorial fallback's full 8-stage list (so
 *     entries in `Final` and `Cancelled` no longer disappear).
 *
 *   - `renderCalendar(entries, projectRoot)` — lane-aware shape. Reads
 *     every lane config and emits one `# Lane: <name>` block per lane
 *     (h1 — sibling of the `# Editorial Calendar` masthead, NOT nested
 *     under it), with per-lane stage sections drawn from that lane's
 *     template. Orphan entries (no `lane` field, or referencing a
 *     deleted lane id) get a `# Lane: (unassigned)` block at the same
 *     h1 level. Multi-lane projects use this mode.
 *
 * Heading-level note (AUDIT-20260530-21): per-lane blocks are at h1,
 * intentionally siblings of the calendar masthead rather than nested
 * h2 children. The calendar file has no single root section under which
 * lanes would naturally nest — each lane stands alone at the same
 * level as the masthead. Stage sections within a lane are h2 (`##
 * <Stage>`). The doctor's UUID scan in
 * `packages/core/src/doctor/orphan-frontmatter-id.ts` is heading-
 * agnostic and unaffected by the level choice.
 */
export function renderCalendar(entries: Entry[], projectRoot?: string): string {
  const laneContexts = loadLaneContexts(projectRoot);

  let md = HEADER;

  if (laneContexts.length === 0) {
    // Legacy single-lane path. The editorial fallback's stage list
    // covers every existing editorial entry. Issue #247 closes here:
    // entries in `Final` and `Cancelled` (previously dropped because
    // the renderer's hardcoded 8-stage list happened to be exactly the
    // editorial 8 stages but mis-aligned with the parser's 7-stage
    // legacy list) now flow through cleanly.
    md += renderStageSections(entries, loadEditorialPreset());
    md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
    return md;
  }

  // Multi-lane: group entries by lane; each lane gets its own header +
  // template-driven stage sections.
  const entriesByLane = new Map<string, Entry[]>();
  for (const ctx of laneContexts) entriesByLane.set(ctx.id, []);
  const orphanLane: Entry[] = [];
  for (const e of entries) {
    if (e.lane !== undefined && entriesByLane.has(e.lane)) {
      const bucket = entriesByLane.get(e.lane);
      if (bucket) bucket.push(e);
    } else {
      orphanLane.push(e);
    }
  }

  for (const ctx of laneContexts) {
    md += `# Lane: ${ctx.name}\n\n`;
    md += renderStageSections(entriesByLane.get(ctx.id) ?? [], ctx.template);
  }

  if (orphanLane.length > 0) {
    md += `# Lane: (unassigned)\n\n`;
    // Per AUDIT-20260530-14: orphan entries route through the editorial
    // fallback's stage list. An orphan entry at a non-editorial stage
    // (e.g. a deleted-visual-lane entry at `Sketched`/`Iterating`) has
    // no matching editorial bucket and would silently vanish from the
    // "(unassigned)" section as well as from its lane section. The
    // distinct unbucketed headline lets the operator distinguish
    // unrecognized-stage-in-lane from unrecognized-stage-in-unassigned
    // when diagnosing.
    md += renderStageSections(orphanLane, loadEditorialPreset(), '(unrecognized stage in unassigned)');
  }

  md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
  return md;
}
