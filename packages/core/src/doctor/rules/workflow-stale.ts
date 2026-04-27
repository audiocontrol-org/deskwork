/**
 * Rule: workflow-stale.
 *
 * Audit: a `DraftWorkflowItem` whose `(site, slug)` no longer resolves
 * to a calendar entry on the workflow's site. Two failure modes:
 *   - The entry was deleted from the calendar (truly stale).
 *   - The entry's slug was renamed and the workflow predates the rename.
 *
 * Detecting the slug-rename case requires `entryId` on the workflow —
 * not yet present on legacy records. For now the rule reports only
 * "no entry found by site+slug" findings and ignores the rename case.
 *
 * Repair: clear the stale workflow record from the pipeline journal.
 * The history journal is append-only and stays untouched (provenance).
 * `--yes` applies; interactive prompts before deletion.
 */

import { unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipelinePath } from '../../review/pipeline.ts';
import type { DraftWorkflowItem } from '../../review/types.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'workflow-stale';

function isStale(
  workflow: DraftWorkflowItem,
  ctx: DoctorContext,
): boolean {
  if (workflow.site !== ctx.site) return false;
  if (workflow.state === 'applied' || workflow.state === 'cancelled') {
    return false;
  }
  // Prefer entryId match when both sides have it. If the workflow has
  // an entryId and the calendar doesn't carry that id, the workflow is
  // stale regardless of slug. If it doesn't, fall back to slug match.
  if (workflow.entryId) {
    return !ctx.calendar.entries.some((e) => e.id === workflow.entryId);
  }
  return !ctx.calendar.entries.some((e) => e.slug === workflow.slug);
}

/**
 * Find the pipeline-journal file backing a workflow id. Files are
 * named `<normalizedTimestamp>-<id>.json`; we suffix-match on
 * `-<id>.json`.
 */
function findWorkflowFile(
  projectRoot: string,
  config: DoctorContext['config'],
  workflowId: string,
): string | null {
  const dir = pipelinePath(projectRoot, config);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const suffix = `-${workflowId}.json`;
  for (const name of names) {
    if (name.endsWith(suffix)) return join(dir, name);
  }
  return null;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Workflow records that no longer match a calendar entry',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const w of ctx.workflows) {
      if (!isStale(w, ctx)) continue;
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message: `Workflow ${w.id} (slug "${w.slug}", state ${w.state}) has no matching calendar entry`,
        details: {
          workflowId: w.id,
          slug: w.slug,
          state: w.state,
          entryId: w.entryId ?? null,
        },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const workflowId = String(finding.details.workflowId ?? '');
    return {
      kind: 'apply',
      finding,
      summary: `delete pipeline journal entry for workflow ${workflowId} (history journal preserved)`,
      payload: { workflowId },
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message: 'plan is not directly appliable; runner should resolve prompt first',
      };
    }
    const workflowId = String(plan.payload.workflowId ?? '');
    if (!workflowId) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing workflowId',
      };
    }
    const file = findWorkflowFile(ctx.projectRoot, ctx.config, workflowId);
    if (!file) {
      return {
        finding: plan.finding,
        applied: false,
        message: `no pipeline file found for workflow ${workflowId}`,
      };
    }
    try {
      unlinkSync(file);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `failed to delete ${file}: ${reason}`,
      };
    }
    return {
      finding: plan.finding,
      applied: true,
      message: `deleted pipeline entry for workflow ${workflowId}`,
      details: { file, workflowId },
    };
  },
};

export default rule;
