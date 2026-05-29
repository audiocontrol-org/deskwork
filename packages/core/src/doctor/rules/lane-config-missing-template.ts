/**
 * Rule: lane-config-missing-template.
 *
 * Phase 6 Task 6.5 (graphical-entries). Catches lane configs that
 * reference a `pipelineTemplate` id that does not resolve via
 * `loadPipelineTemplate`. The condition is exactly the failure mode
 * `loadLaneConfig` throws for in its cross-validation step; this rule
 * surfaces those as audit findings rather than relying on each call
 * site to handle the throw.
 *
 * Repair: operator picks a valid template (rebinds the lane) OR
 * deletes the lane file. Delete is gated by an entry-binding check —
 * any entry whose sidecar references the lane id blocks the delete
 * until the operator moves it elsewhere via `deskwork lane move`.
 *
 * Audit / multi-site semantics:
 *
 *   The runner invokes `audit()` once per configured site. Lane configs
 *   are project-scoped — they live under `<projectRoot>/.deskwork/lanes/`
 *   regardless of how many sites the project's config declares — so a
 *   naive per-site scan would emit duplicate findings on multi-site
 *   projects. The guard: only run when `ctx.site` is the first site in
 *   `ctx.config.sites` (Object.keys insertion order). Single-site
 *   projects (the overwhelming majority) trip the guard on their only
 *   site; multi-site projects trip it on the first site listed in the
 *   config and skip the rest. This mirrors how project-wide rules
 *   behave when invoked from the per-site loop without a dedicated
 *   project-scope abstraction in the runner.
 *
 * Sibling-relative imports per the project convention.
 */

import { readFileSync, unlinkSync, writeFileSync, renameSync } from 'node:fs';
import { relative } from 'node:path';
import { appendJournalEvent } from '../../journal/append.ts';
import {
  laneConfigPath,
  listLaneConfigs,
  loadLaneConfig,
} from '../../lanes/loader.ts';
import {
  listAvailablePipelineTemplates,
  loadPipelineTemplate,
} from '../../pipelines/loader.ts';
import { LaneConfigSchema, type LaneConfig } from '../../lanes/types.ts';
import { readAllSidecars } from '../../sidecar/read-all.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'lane-config-missing-template';

/**
 * Cap on the number of dependent slugs included verbatim in the
 * delete-refusal error before falling back to `+N more`. Mirrors the
 * `PURGE_DEPENDENTS_SAMPLE_LIMIT` constant in
 * `lanes/operations/purge.ts` (not exported there); five keeps the
 * error message scannable while still giving the operator concrete
 * names to grep for.
 */
const DELETE_DEPENDENTS_SAMPLE_LIMIT = 5;

/**
 * Read the raw lane JSON (skipping `loadLaneConfig` to bypass the
 * pipeline-template cross-validation that we're explicitly testing
 * for). Returns the parsed JSON as a `LaneConfig` candidate via
 * `LaneConfigSchema` — if even the schema rejects, we return `null`
 * (that case is `schema-rejected`'s rule to handle, not ours).
 */
function readLaneJson(projectRoot: string, id: string): LaneConfig | null {
  const path = laneConfigPath(projectRoot, id);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = LaneConfigSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

/**
 * Try resolving the lane's `pipelineTemplate`. Returns `true` when the
 * template resolves cleanly, `false` when the loader throws (the
 * "missing template" case this rule catches).
 */
function templateResolves(templateId: string, projectRoot: string): boolean {
  try {
    loadPipelineTemplate(templateId, projectRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic write helper for lane config JSON. Mirrors the
 * `commitLaneConfig` shape in `lanes/operations/commit.ts` — tmp file
 * + rename, with the tmp file cleaned up on rename failure. Inlined
 * here rather than imported because `commitLaneConfig` carries the
 * `verb` parameter and the operation-specific error wording; the
 * doctor-rule repair path is its own caller with its own error
 * surface.
 */
function atomicWriteLaneJson(
  projectRoot: string,
  id: string,
  payload: LaneConfig,
): string {
  const path = laneConfigPath(projectRoot, id);
  const tmpPath = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify(payload, null, 2) + '\n';
  try {
    writeFileSync(tmpPath, body, 'utf8');
    renameSync(tmpPath, path);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* tmp absent — ignore */ }
    throw err;
  }
  return path;
}

/**
 * Check whether the current site is the "first" site per the config's
 * insertion order. Used to gate the project-wide scan so multi-site
 * projects don't emit duplicate findings (see header).
 */
function isFirstSite(ctx: DoctorContext): boolean {
  const siteIds = Object.keys(ctx.config.sites);
  if (siteIds.length === 0) return true;
  return siteIds[0] === ctx.site;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Lane configs whose pipelineTemplate id does not resolve',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    if (!isFirstSite(ctx)) return [];

    const laneIds = listLaneConfigs(ctx.projectRoot, { includeArchived: true });
    if (laneIds.length === 0) return [];

    const availableTemplates = listAvailablePipelineTemplates(ctx.projectRoot);
    const findings: Finding[] = [];

    for (const laneId of laneIds) {
      // Use the loader for the happy path so we catch the
      // pipeline-resolution failure mode exactly the way every other
      // lane-aware call site sees it. We swallow the throw and inspect
      // the lane's raw JSON to confirm the failure is specifically the
      // missing-template case (vs. schema rejection or a missing file,
      // both of which are other rules' responsibility).
      try {
        loadLaneConfig(laneId, ctx.projectRoot);
        continue;
      } catch {
        // fall through to the targeted check
      }

      const lane = readLaneJson(ctx.projectRoot, laneId);
      if (lane === null) {
        // schema rejection or read error — out of scope for THIS rule.
        // `schema-rejected` covers the schema case; the read case
        // shouldn't happen (`listLaneConfigs` just enumerated the file).
        continue;
      }
      if (templateResolves(lane.pipelineTemplate, ctx.projectRoot)) {
        // The loader threw for some reason other than a missing
        // template (e.g. id/filename mismatch). Not this rule's
        // concern.
        continue;
      }

      const laneFilePath = laneConfigPath(ctx.projectRoot, laneId);
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'error',
        message:
          `Lane "${laneId}" references pipelineTemplate "${lane.pipelineTemplate}" ` +
          `which does not resolve (file: ${relative(ctx.projectRoot, laneFilePath)})`,
        details: {
          laneId,
          laneFilePath,
          unresolvedTemplateId: lane.pipelineTemplate,
          availableTemplates,
        },
      });
    }
    return findings;
  },

  async plan(ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const laneId = String(finding.details.laneId ?? '');
    if (!laneId) {
      return {
        kind: 'report-only',
        finding,
        reason: 'finding missing laneId — re-run audit',
      };
    }
    // Re-enumerate templates at plan time so newly-customized templates
    // since the audit pass show up in the picker.
    const availableTemplates = listAvailablePipelineTemplates(ctx.projectRoot);
    const setTemplateChoices = availableTemplates.map((templateId) => ({
      id: `set-template-${templateId}`,
      label: `Bind lane to "${templateId}" pipeline template`,
      payload: { action: 'set-template', laneId, templateId },
    }));
    return {
      kind: 'prompt',
      finding,
      question:
        `Lane "${laneId}" references an unresolved pipelineTemplate. Pick a repair:`,
      choices: [
        ...setTemplateChoices,
        {
          id: 'delete-lane',
          label: 'Delete the lane file',
          payload: { action: 'delete', laneId },
        },
      ],
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message:
          'plan is not directly appliable; runner should resolve prompt first',
        skipReason: 'apply-failed',
      };
    }
    const action = String(plan.payload.action ?? '');
    const laneId = String(plan.payload.laneId ?? '');
    if (!laneId) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing laneId',
        skipReason: 'apply-failed',
      };
    }

    if (action === 'set-template') {
      const templateId = String(plan.payload.templateId ?? '');
      if (!templateId) {
        return {
          finding: plan.finding,
          applied: false,
          message: 'set-template payload missing templateId',
          skipReason: 'apply-failed',
        };
      }
      const lane = readLaneJson(ctx.projectRoot, laneId);
      if (lane === null) {
        return {
          finding: plan.finding,
          applied: false,
          message: `lane "${laneId}" JSON unreadable or schema-invalid; cannot rebind`,
          skipReason: 'apply-failed',
        };
      }
      // Re-confirm the picked template resolves before writing — the
      // operator might have picked an id that was customized away
      // between audit and apply.
      try {
        loadPipelineTemplate(templateId, ctx.projectRoot);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          finding: plan.finding,
          applied: false,
          message: `picked template "${templateId}" does not resolve: ${detail}`,
          skipReason: 'apply-failed',
        };
      }
      const before = lane.pipelineTemplate;
      const updated: LaneConfig = { ...lane, pipelineTemplate: templateId };
      try {
        atomicWriteLaneJson(ctx.projectRoot, laneId, updated);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          finding: plan.finding,
          applied: false,
          message: `failed to write lane JSON: ${detail}`,
          skipReason: 'apply-failed',
        };
      }
      await appendJournalEvent(ctx.projectRoot, {
        kind: 'lane-config-repair',
        at: new Date().toISOString(),
        laneId,
        ruleId: RULE_ID,
        details: { action: 'set-template', before, after: templateId },
      });
      return {
        finding: plan.finding,
        applied: true,
        message: `rebound lane "${laneId}" to pipelineTemplate "${templateId}"`,
        details: { laneId, before, after: templateId },
      };
    }

    if (action === 'delete') {
      // Refuse if any entry references this lane — mirror the guard
      // in `lanes/operations/purge.ts`. The operator must `lane move`
      // every dependent first.
      let sidecars;
      try {
        sidecars = await readAllSidecars(ctx.projectRoot);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          finding: plan.finding,
          applied: false,
          message: `failed to read sidecars for dependency check: ${detail}`,
          skipReason: 'apply-failed',
        };
      }
      const dependents = sidecars
        .filter((entry) => entry.lane === laneId)
        .map((entry) => entry.uuid);
      if (dependents.length > 0) {
        const sample = dependents.slice(0, DELETE_DEPENDENTS_SAMPLE_LIMIT);
        const remainder = dependents.length - sample.length;
        const suffix = remainder > 0 ? `, +${remainder} more` : '';
        return {
          finding: plan.finding,
          applied: false,
          message:
            `Cannot delete lane "${laneId}": ${dependents.length} ` +
            `${dependents.length === 1 ? 'entry references' : 'entries reference'} ` +
            `it (${sample.join(', ')}${suffix}). Move each entry to another lane ` +
            `with "deskwork lane move <slug> --to <other>" before deleting.`,
          skipReason: 'editorial-decision',
        };
      }

      const laneFilePath = laneConfigPath(ctx.projectRoot, laneId);
      try {
        unlinkSync(laneFilePath);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          finding: plan.finding,
          applied: false,
          message: `failed to delete lane file ${laneFilePath}: ${detail}`,
          skipReason: 'apply-failed',
        };
      }
      await appendJournalEvent(ctx.projectRoot, {
        kind: 'lane-config-repair',
        at: new Date().toISOString(),
        laneId,
        ruleId: RULE_ID,
        details: { action: 'delete', deleted: true, laneFilePath },
      });
      return {
        finding: plan.finding,
        applied: true,
        message: `deleted lane file ${relative(ctx.projectRoot, laneFilePath)}`,
        details: { laneId, laneFilePath },
      };
    }

    return {
      finding: plan.finding,
      applied: false,
      message: `unknown apply action: ${action}`,
      skipReason: 'apply-failed',
    };
  },
};

export default rule;
