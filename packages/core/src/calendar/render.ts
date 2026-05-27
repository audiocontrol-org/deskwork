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
 */

import type { Entry } from '../schema/entry.ts';
import { loadPipelineTemplate } from '../pipelines/loader.ts';
import { listLaneConfigs, loadLaneConfig } from '../lanes/loader.ts';
import type {
  PipelineTemplate,
  StrictPipelineTemplate,
} from '../pipelines/types.ts';

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
 * Produce the full ordered stage list for a template:
 * `linearStages` then `offPipelineStages` (in declaration order). The
 * concatenation is the calendar's section order; the existing
 * editorial render shape was `Ideas / Planned / Outlining / Drafting /
 * Final / Published / Blocked / Cancelled`, which matches this
 * concatenation exactly for the editorial preset.
 */
function templateStageOrder(template: StrictPipelineTemplate): readonly string[] {
  return [...template.linearStages, ...template.offPipelineStages];
}

/**
 * Bucket entries by their `currentStage`, ignoring lane membership.
 * Used by the single-lane render path. Lane-aware rendering uses a
 * pre-filtered entry list per lane.
 */
function bucketize(entries: readonly Entry[], stages: readonly string[]): Map<string, Entry[]> {
  const byStage = new Map<string, Entry[]>();
  for (const stage of stages) byStage.set(stage, []);
  for (const e of entries) {
    const bucket = byStage.get(e.currentStage);
    if (bucket) bucket.push(e);
  }
  return byStage;
}

/**
 * Render a single set of stage sections (no lane header). Used by the
 * legacy single-lane / migration-window path.
 */
function renderStageSections(
  entries: readonly Entry[],
  template: StrictPipelineTemplate,
): string {
  const stages = templateStageOrder(template);
  const byStage = bucketize(entries, stages);
  let out = '';
  for (const stage of stages) {
    const bucket = byStage.get(stage) ?? [];
    out += renderStageSection(stage, bucket);
  }
  return out;
}

interface LaneContext {
  readonly id: string;
  readonly name: string;
  readonly template: StrictPipelineTemplate;
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
 * Editorial fallback used when no lane configs are present (legacy /
 * migration-window). Synthesized in-memory so the renderer doesn't
 * require the editorial preset to be discoverable via `loadPipelineTemplate`
 * — necessary for the test fixtures that exercise `renderCalendar`
 * without a project root.
 *
 * IMPORTANT: this constant duplicates `packages/core/src/pipelines/
 * editorial.json` and the two MUST stay in sync. If the editorial
 * preset's stage list ever changes, update this fallback in lockstep.
 * Phase 8 enforces lane presence at the doctor layer; once doctor
 * refuses to load entries without a `lane` field, the renderer's
 * no-project-root path is no longer reachable and this constant can
 * be deleted in favor of always loading via `loadPipelineTemplate`.
 */
const EDITORIAL_FALLBACK: StrictPipelineTemplate = {
  id: 'editorial',
  name: 'Editorial',
  description: 'Long-form writing pipeline (editorial fallback).',
  linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
  lockedStages: ['Final'],
  offPipelineStages: ['Blocked', 'Cancelled'],
};

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
 *     every lane config and emits one `## Lane: <name>` block per
 *     lane, with per-lane stage sections drawn from that lane's
 *     template. Multi-lane projects use this mode.
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
    md += renderStageSections(entries, EDITORIAL_FALLBACK);
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
    md += renderStageSections(orphanLane, EDITORIAL_FALLBACK);
  }

  md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
  return md;
}
