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
import { loadProjectRules, mergeRules } from './project-rules.ts';
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

/**
 * Resolve a CSV/comma-separated `--fix=` argument to rule ids.
 *
 * Returns the full list of built-in rule ids for `''` and `'all'`.
 * Unknown built-in id strings are rejected (exit 2 in the CLI).
 *
 * Project rules registered via `<projectRoot>/.deskwork/doctor/*.ts`
 * (Phase 23f) are selected by passing `'all'`; the runner picks them
 * up from the merged rule list. Selecting an individual project rule
 * by id via `--fix=<id>` is not yet supported — file an issue if the
 * usage emerges.
 */
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

function selectRules(
  available: ReadonlyArray<DoctorRule>,
  ruleIds: string[] | undefined,
): DoctorRule[] {
  if (ruleIds === undefined) return [...available];
  const byId = new Map(available.map((r) => [r.id, r]));
  const out: DoctorRule[] = [];
  for (const id of ruleIds) {
    const rule = byId.get(id);
    if (!rule) {
      throw new Error(
        `Unknown doctor rule: "${id}". Known: ${available.map((r) => r.id).join(', ')}, all`,
      );
    }
    out.push(rule);
  }
  return out;
}

/**
 * Phase 23f: build the effective rule set for an audit or repair run.
 * Built-in rules merged with project rules from
 * `<projectRoot>/.deskwork/doctor/*.ts`. Project rules with a basename
 * matching a built-in's basename REPLACE that built-in (override
 * semantics); new basenames append.
 *
 * Loaded once per run — not per finding — so disk i/o for
 * `readdirSync` + N dynamic imports happens at the start of an audit.
 */
async function buildEffectiveRules(
  projectRoot: string,
): Promise<DoctorRule[]> {
  const projectRules = await loadProjectRules(projectRoot);
  return mergeRules(RULES, projectRules);
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
  const available = await buildEffectiveRules(opts.projectRoot);
  const rules = selectRules(available, opts.ruleIds);
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
  const available = await buildEffectiveRules(opts.projectRoot);
  const rules = selectRules(available, opts.ruleIds);
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
    // `report-only` is the rule's signal that the finding can't be
    // auto-repaired in this run. The granularity (prerequisite vs
    // editorial-decision vs schema-rejected) is rule-specific; the
    // rule sets `skipReason` via the report-only finding's details
    // — see `reportOnlySkipReason()` below.
    return {
      finding: plan.finding,
      applied: false,
      message: plan.reason,
      skipReason: reportOnlySkipReason(rule, plan.finding),
    };
  }
  if (plan.kind === 'prompt') {
    const choiceId = await interaction.pickChoice(plan);
    if (choiceId === undefined) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'skipped (operator declined or --yes mode encountered ambiguity)',
        skipReason: 'ambiguous',
      };
    }
    const choice = plan.choices.find((c) => c.id === choiceId);
    if (!choice) {
      return {
        finding: plan.finding,
        applied: false,
        message: `unknown choice id: ${choiceId}`,
        skipReason: 'apply-failed',
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
      skipReason: 'operator-declined',
    };
  }
  return rule.apply(ctx, plan);
}

/**
 * Map a rule's `report-only` plan to a `SkipReason`. The mapping is by
 * rule id because the existing rules don't carry an explicit skip-
 * reason field on their `report-only` plans — adding one to every
 * rule would be churn for a 1:1 relationship that's already implicit
 * in the rule's purpose.
 */
function reportOnlySkipReason(
  rule: DoctorRule,
  _finding: import('./types.ts').Finding,
):
  | 'prerequisite-missing'
  | 'editorial-decision'
  | 'schema-rejected'
  | 'no-action-needed' {
  switch (rule.id) {
    case 'missing-frontmatter-id':
      // Always "no candidate file found" — the operator hasn't
      // scaffolded the body file yet (run /deskwork:outline).
      return 'prerequisite-missing';
    case 'slug-collision':
      // Editorial: which slug "owns" the public URL.
      return 'editorial-decision';
    case 'schema-rejected':
      // Patch instructions only; nothing to apply automatically.
      return 'schema-rejected';
    default:
      // Conservative fallback — treat unfamiliar rules as needing
      // operator follow-up.
      return 'editorial-decision';
  }
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
