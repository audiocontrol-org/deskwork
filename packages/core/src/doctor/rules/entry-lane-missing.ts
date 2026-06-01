/**
 * Rule: entry-lane-missing.
 *
 * Phase 8 Step 8.0.1 (graphical-entries). Surfaces every sidecar that
 * lacks a `lane` field as a finding. The migration window introduced
 * in Phase 3 left `lane` optional on `EntrySchema` so legacy sidecars
 * continue to parse; `resolveEntryTemplate` (packages/core/src/lanes/
 * resolve.ts) falls back to the `editorial` pipeline template when the
 * field is absent. This rule is the GATE that lets the next step
 * (8.0.2) tighten that resolver to throw on missing-lane — until canary
 * projects (graphical-entries + audiocontrol + writingcontrol) report
 * zero `entry-lane-missing` findings, the resolver retains its
 * migration-window default.
 *
 * Severity: `error`. This is not informational drift — it is a
 * pre-condition for a planned schema tightening, and operators must
 * back-fill or assign the field before that tightening can land
 * without breaking real entries.
 *
 * Repair: operator-driven, not auto-applied. Two paths:
 *
 *   - Bulk back-fill: run `migrateLaneMembership` (exported from
 *     `@deskwork/core/doctor`), which writes `lane: "default"` on every
 *     sidecar that lacks the field and emits a `lane-migration` journal
 *     event per write. This is the appropriate repair when the operator
 *     wants every legacy entry assigned to the bootstrap `default` lane.
 *   - Targeted assignment: run `/deskwork:lane move <slug> --to
 *     <lane-id>` (Phase 6 lane CRUD) to assign individual entries to
 *     specific lanes. Appropriate when the operator wants entries
 *     distributed across multiple lanes rather than collapsed onto
 *     `default`.
 *
 * Why no automatic `apply()` branch: the choice between bulk-default
 * and per-entry-explicit is an editorial decision the rule cannot make
 * for the operator. Doctor's role here is to surface the gap; the
 * operator picks the repair shape. The `plan()` returns `report-only`
 * with the two repair commands in its `reason` so the runner's
 * interactive output gives the operator a concrete next step.
 *
 * Audit walks `readAllSidecarsPartitioned` so corrupt sidecars surface
 * on the `malformed` channel rather than throwing the whole audit. We
 * inspect only the parseable entries; malformed sidecars are handled
 * by sibling rules (`schema-rejected` etc.).
 *
 * Sibling-relative imports per the project convention.
 */

import { relative } from 'node:path';
import { sidecarPath } from '../../sidecar/paths.ts';
import { readAllSidecarsPartitioned } from '../../sidecar/read-all.ts';
import { isFirstSite } from '../project-scope-gate.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'entry-lane-missing';

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Sidecars missing the `lane` field (Phase 8 schema-tightening gate)',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    if (!isFirstSite(ctx)) return [];

    // Partitioned reader — corrupt sidecars surface on `malformed` and
    // are someone else's problem (schema-rejected etc.). We only check
    // the parseable entries.
    let partition;
    try {
      partition = await readAllSidecarsPartitioned(ctx.projectRoot);
    } catch {
      // Directory-level read failure (anything other than ENOENT on
      // the sidecars dir, which the reader returns as []). Nothing
      // useful this rule can say — leave the report empty.
      return [];
    }

    const findings: Finding[] = [];
    for (const entry of partition.entries) {
      if (entry.lane !== undefined) continue;
      const sidecarPathRelative = relative(
        ctx.projectRoot,
        sidecarPath(ctx.projectRoot, entry.uuid),
      );
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'error',
        message:
          `Entry "${entry.slug}" (${entry.uuid}) has no \`lane\` field ` +
          `(sidecar: ${sidecarPathRelative}). Repair: bulk back-fill via ` +
          `\`migrateLaneMembership\` to assign every legacy entry to the ` +
          `\`default\` lane, OR targeted assignment via ` +
          `\`/deskwork:lane move ${entry.slug} --to <lane-id>\` to pick a ` +
          `specific lane.`,
        details: {
          slug: entry.slug,
          uuid: entry.uuid,
          sidecarPath: sidecarPathRelative,
        },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    // Report-only: the choice between `migrateLaneMembership` (bulk
    // default-assignment) and `/deskwork:lane move` (per-entry explicit
    // assignment) is an editorial decision. The `reason` repeats both
    // commands so the runner's interactive output names the next step
    // verbatim. No `apply()` branch implements either — both repairs
    // already exist as named operator-facing commands, and reproducing
    // them inside the rule would duplicate their journal-event +
    // compensating-write semantics.
    const slug = String(finding.details.slug ?? '');
    return {
      kind: 'report-only',
      finding,
      reason:
        `Operator-driven repair. Bulk back-fill: \`migrateLaneMembership\` ` +
        `assigns every missing-lane sidecar to "default". Targeted: ` +
        `\`/deskwork:lane move ${slug} --to <lane-id>\` for this entry.`,
    };
  },

  async apply(_ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    // `plan()` always returns `report-only`; the runner never invokes
    // `apply()` on a report-only plan. This branch exists only to
    // satisfy the `DoctorRule` interface contract.
    return {
      finding: plan.finding,
      applied: false,
      message:
        'entry-lane-missing has no auto-repair; use migrateLaneMembership ' +
        'or /deskwork:lane move <slug> --to <lane-id>',
      skipReason: 'editorial-decision',
    };
  },
};

export default rule;
