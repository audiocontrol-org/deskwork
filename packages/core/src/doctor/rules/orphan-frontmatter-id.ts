/**
 * Rule: orphan-frontmatter-id.
 *
 * Audit: every entry in the content index whose id has no matching
 * calendar entry. The file is bound to "something", but the calendar
 * doesn't know about it.
 *
 * Repair: there are three plausible operator intents — (a) add a
 * calendar row for the file, (b) clear the orphan id from the file
 * (un-bind), or (c) leave it alone. Without a way to gather the
 * intent, the rule reports findings and presents a prompt; with
 * `--yes`, the safest action is "do nothing" — auto-creating
 * calendar rows or auto-deleting frontmatter is destructive.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from '../../frontmatter.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'orphan-frontmatter-id';

function clearFrontmatterId(absPath: string): boolean {
  const raw = readFileSync(absPath, 'utf-8');
  const { data, body } = parseFrontmatter(raw);
  if (!('id' in data)) return false;
  const next: Record<string, unknown> = { ...data };
  delete next.id;
  const rendered = stringifyFrontmatter(next, body);
  writeFileSync(absPath, rendered, 'utf-8');
  return true;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Files with frontmatter ids that are not in the calendar',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const calendarIds = new Set<string>();
    for (const e of ctx.calendar.entries) {
      if (e.id) calendarIds.add(e.id);
    }
    for (const [id, absPath] of ctx.index.byId) {
      if (calendarIds.has(id)) continue;
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message: `File ${relative(ctx.projectRoot, absPath)} carries id ${id}, which is not in the calendar`,
        details: { absolutePath: absPath, entryId: id },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const absPath = String(finding.details.absolutePath ?? '');
    const entryId = String(finding.details.entryId ?? '');
    return {
      kind: 'prompt',
      finding,
      question: `File ${absPath} has id ${entryId} but no calendar entry matches. Pick an action:`,
      choices: [
        {
          id: 'none',
          label: 'leave as-is (default; review manually)',
          payload: { action: 'none' },
        },
        {
          id: 'clear-id',
          label: `clear the id from ${absPath} (un-bind the file)`,
          payload: { action: 'clear-id', absolutePath: absPath },
        },
      ],
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
    const action = String(plan.payload.action ?? '');
    if (action === 'none') {
      return {
        finding: plan.finding,
        applied: false,
        message: 'left file unchanged per operator choice',
      };
    }
    if (action === 'clear-id') {
      const absPath = String(plan.payload.absolutePath ?? '');
      if (!absPath) {
        return {
          finding: plan.finding,
          applied: false,
          message: 'clear-id apply payload missing absolutePath',
        };
      }
      try {
        const changed = clearFrontmatterId(absPath);
        if (!changed) {
          return {
            finding: plan.finding,
            applied: false,
            message: `no id field in ${relative(ctx.projectRoot, absPath)} to clear`,
          };
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          finding: plan.finding,
          applied: false,
          message: `failed to clear frontmatter id: ${reason}`,
        };
      }
      return {
        finding: plan.finding,
        applied: true,
        message: `cleared id from ${relative(ctx.projectRoot, absPath)}`,
        details: { absolutePath: absPath },
      };
    }
    return {
      finding: plan.finding,
      applied: false,
      message: `unknown apply action: ${action}`,
    };
  },
};

export default rule;
