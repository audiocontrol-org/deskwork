/**
 * Doctor runner — orchestrates rule execution.
 *
 * The runner owns the per-site setup (read calendar, build content
 * index, scope workflows) and walks the registered rules in a stable
 * order. `runAudit` only calls `audit()`; `runRepair` chains audit →
 * plan → (interaction) → apply.
 *
 * Sibling-relative imports per the project convention.
 */

import { readCalendar } from '../calendar.ts';
import { buildContentIndex } from '../content-index.ts';
import { resolveCalendarPath } from '../paths.ts';
import { readWorkflows } from '../review/pipeline.ts';
import type { DeskworkConfig } from '../config.ts';
import missingFrontmatterId from './rules/missing-frontmatter-id.ts';
import orphanFrontmatterId from './rules/orphan-frontmatter-id.ts';
import duplicateId from './rules/duplicate-id.ts';
import slugCollision from './rules/slug-collision.ts';
import schemaRejected from './rules/schema-rejected.ts';
import workflowStale from './rules/workflow-stale.ts';
import calendarUuidMissing from './rules/calendar-uuid-missing.ts';
import legacyTopLevelIdMigration from './rules/legacy-top-level-id-migration.ts';
import type {
  DoctorContext,
  DoctorInteraction,
  DoctorReport,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from './types.ts';

/**
 * Registry of all rules in the order they run. The order matters: we
 * detect calendar-uuid-missing first (to flush UUIDs), then run the
 * frontmatter-id rules (which depend on UUIDs being persisted on
 * disk to be useful in long-lived data).
 *
 * `legacy-top-level-id-migration` (Issue #38) runs BEFORE
 * `missing-frontmatter-id` so that v0.7.0/v0.7.1-shaped files migrate
 * to the namespaced form first; on the same run, the
 * missing-frontmatter-id rule then sees the migrated files as bound
 * (via `deskwork.id`) and doesn't re-report them.
 */
export const RULES: ReadonlyArray<DoctorRule> = [
  calendarUuidMissing,
  legacyTopLevelIdMigration,
  missingFrontmatterId,
  orphanFrontmatterId,
  duplicateId,
  slugCollision,
  workflowStale,
  schemaRejected,
];

const RULE_BY_ID: ReadonlyMap<string, DoctorRule> = new Map(
  RULES.map((r) => [r.id, r]),
);

/** Resolve a CSV/comma-separated `--fix=` argument to rule ids. */
export function parseFixArgument(arg: string): string[] {
  const trimmed = arg.trim();
  if (trimmed === '' || trimmed === 'all') {
    return RULES.map((r) => r.id);
  }
  const ids = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of ids) {
    if (!RULE_BY_ID.has(id)) {
      throw new Error(
        `Unknown doctor rule: "${id}". Known: ${RULES.map((r) => r.id).join(', ')}, all`,
      );
    }
  }
  return ids;
}

export interface DoctorRunOptions {
  projectRoot: string;
  config: DeskworkConfig;
  /** Restrict to one site; undefined = run for every site in config. */
  site?: string;
  /** Restrict the rule set; undefined = all rules. */
  ruleIds?: string[];
}

/** Build the per-site context once for a run. */
function buildContext(
  opts: DoctorRunOptions,
  site: string,
  interaction: DoctorInteraction,
): DoctorContext {
  const calendarPath = resolveCalendarPath(opts.projectRoot, opts.config, site);
  const calendar = readCalendar(calendarPath);
  const index = buildContentIndex(opts.projectRoot, opts.config, site);
  const allWorkflows = readWorkflows(opts.projectRoot, opts.config);
  const workflows = allWorkflows.filter((w) => w.site === site);
  return {
    projectRoot: opts.projectRoot,
    config: opts.config,
    site,
    calendar,
    index,
    workflows,
    interaction,
  };
}

function selectSites(opts: DoctorRunOptions): string[] {
  if (opts.site !== undefined) {
    if (!(opts.site in opts.config.sites)) {
      throw new Error(
        `Unknown site "${opts.site}". Configured sites: ${Object.keys(opts.config.sites).join(', ')}`,
      );
    }
    return [opts.site];
  }
  return Object.keys(opts.config.sites);
}

function selectRules(ruleIds: string[] | undefined): DoctorRule[] {
  if (ruleIds === undefined) return [...RULES];
  const out: DoctorRule[] = [];
  for (const id of ruleIds) {
    const rule = RULE_BY_ID.get(id);
    if (!rule) {
      throw new Error(
        `Unknown doctor rule: "${id}". Known: ${RULES.map((r) => r.id).join(', ')}, all`,
      );
    }
    out.push(rule);
  }
  return out;
}

/**
 * Audit: collect findings without mutating the world. Returns a fully-
 * built report with empty `repairs`. Suitable for pre-commit hooks
 * that just want a non-zero exit code on any finding.
 */
export async function runAudit(
  opts: DoctorRunOptions,
  interaction: DoctorInteraction,
): Promise<DoctorReport> {
  const sites = selectSites(opts);
  const rules = selectRules(opts.ruleIds);
  const findings: Finding[] = [];
  for (const site of sites) {
    const ctx = buildContext(opts, site, interaction);
    for (const rule of rules) {
      const out = await rule.audit(ctx);
      findings.push(...out);
    }
  }
  return { findings, repairs: [], sites };
}

/**
 * Repair: run audit → plan → (consult interaction) → apply. Returns
 * the audit findings AND the repair results so callers can render
 * a single report covering both phases.
 *
 * For `prompt` plans the runner consults `interaction.pickChoice` to
 * resolve to an apply payload; for `apply` plans it consults
 * `interaction.confirmApply`. `report-only` plans never apply.
 */
export async function runRepair(
  opts: DoctorRunOptions,
  interaction: DoctorInteraction,
): Promise<DoctorReport> {
  const sites = selectSites(opts);
  const rules = selectRules(opts.ruleIds);
  const findings: Finding[] = [];
  const repairs: RepairResult[] = [];

  for (const site of sites) {
    const ctx = buildContext(opts, site, interaction);
    for (const rule of rules) {
      const ruleFindings = await rule.audit(ctx);
      findings.push(...ruleFindings);
      for (const finding of ruleFindings) {
        const plan = await rule.plan(ctx, finding);
        const result = await resolveAndApply(rule, ctx, plan, interaction);
        repairs.push(result);
      }
    }
  }
  return { findings, repairs, sites };
}

/**
 * Resolve a `prompt` plan via the interaction adapter and apply it.
 * `apply` plans go through `confirmApply` first; `report-only` plans
 * record a non-applied result.
 */
async function resolveAndApply(
  rule: DoctorRule,
  ctx: DoctorContext,
  plan: RepairPlan,
  interaction: DoctorInteraction,
): Promise<RepairResult> {
  if (plan.kind === 'report-only') {
    return {
      finding: plan.finding,
      applied: false,
      message: plan.reason,
    };
  }
  if (plan.kind === 'prompt') {
    const choiceId = await interaction.pickChoice(plan);
    if (choiceId === undefined) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'skipped (operator declined or --yes mode encountered ambiguity)',
      };
    }
    const choice = plan.choices.find((c) => c.id === choiceId);
    if (!choice) {
      return {
        finding: plan.finding,
        applied: false,
        message: `unknown choice id: ${choiceId}`,
      };
    }
    const applyPlan: RepairPlan = {
      kind: 'apply',
      finding: plan.finding,
      summary: choice.label,
      payload: choice.payload,
    };
    return rule.apply(ctx, applyPlan);
  }
  // apply
  const ok = await interaction.confirmApply(plan);
  if (!ok) {
    return {
      finding: plan.finding,
      applied: false,
      message: 'skipped (operator declined)',
    };
  }
  return rule.apply(ctx, plan);
}

/**
 * Pre-built interaction: always confirm `apply` plans, skip `prompt`
 * plans (no way to choose without a UI). Used by `--yes` mode.
 *
 * Exposed for the CLI command to construct.
 */
export const yesInteraction: DoctorInteraction = {
  async pickChoice(_plan): Promise<string | undefined> {
    // `--yes` skips ambiguous cases by design — the workplan calls
    // out missing-frontmatter-id with multiple candidates as the
    // canonical example.
    return undefined;
  },
  async confirmApply(_plan): Promise<boolean> {
    return true;
  },
};

/**
 * Pre-built interaction: never apply anything. Used to dry-run a
 * repair pipeline (prompt resolution + apply both no-op).
 */
export const declineInteraction: DoctorInteraction = {
  async pickChoice(_plan): Promise<string | undefined> {
    return undefined;
  },
  async confirmApply(_plan): Promise<boolean> {
    return false;
  },
};
