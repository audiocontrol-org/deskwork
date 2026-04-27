/**
 * Rule: schema-rejected.
 *
 * The host's content collection schema may reject the `id` frontmatter
 * field that deskwork relies on for the calendar/file binding. We
 * detect this at *write time* in other code paths (scaffolder, the
 * other rules' apply()), not by an active probe — running an actual
 * Astro build inside doctor would be slow and project-specific.
 *
 * This rule's audit always returns empty for that reason. The
 * `printSchemaPatchInstructions` helper is the user-facing surface;
 * other rules (and the CLI command) call it when they observe an
 * actual schema rejection. Phase 19b-followup may add an active
 * probe (write a tmpfile to contentDir, attempt astro check, etc.)
 * once the integration cost is justified.
 */

import { printSchemaPatchInstructions } from '../schema-patch.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'schema-rejected';

const rule: DoctorRule = {
  id: RULE_ID,
  label: "Host's content schema rejects the `id` frontmatter field",

  async audit(_ctx: DoctorContext): Promise<Finding[]> {
    // Passive — see file header. Other code paths surface schema-patch
    // instructions when they observe an actual rejection.
    return [];
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    return {
      kind: 'report-only',
      finding,
      reason: printSchemaPatchInstructions(),
    };
  },

  async apply(_ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    return {
      finding: plan.finding,
      applied: false,
      message:
        'schema-rejected has no automatic repair — operator must patch the host content schema',
    };
  },
};

export default rule;
