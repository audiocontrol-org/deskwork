/**
 * deskwork doctor — validate and (optionally) repair binding metadata
 * across the calendar + content tree + workflow store.
 *
 * Default mode is audit-only: walk the rules, report findings, exit 0
 * on a clean tree or 1 if anything was reported. `--fix=<rule>` (or
 * `--fix=all`) engages repair mode; `--yes` makes repairs non-
 * interactive (skipping ambiguous cases). `--json` produces machine-
 * readable output that composes with `jq`.
 *
 * Argv shape (after the dispatcher injects projectRoot when needed):
 *
 *   <project-root> [flags]
 *
 * Flags:
 *   --site <slug>         Restrict to one site; default = every site.
 *   --fix <rule|all>      Engage repair mode for the named rule(s).
 *   --yes                 Non-interactive repair (skip ambiguous).
 *   --json                Emit JSON instead of human-readable text.
 *
 * Exit codes (Issue #44, Phase 22):
 *   0  Audit clean. OR --fix succeeded for every applicable finding.
 *      "Applicable" here means: anything that wasn't skipped because
 *      a prerequisite outside doctor's scope hasn't happened yet (e.g.
 *      the body file hasn't been scaffolded, so missing-frontmatter-id
 *      can't bind).
 *   1  Findings present (audit-only mode). OR --fix encountered real
 *      follow-ups: ambiguous cases requiring interactive resolution,
 *      schema rejections needing the operator to patch the host
 *      schema, editorial decisions, operator declines, or hard
 *      apply-failures.
 *   2  Usage / config error.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readConfig } from '@deskwork/core/config';
import { absolutize, fail, parseArgs } from '@deskwork/core/cli-args';
import {
  RULES,
  parseFixArgument,
  runAudit,
  runRepair,
  yesInteraction,
  type DoctorInteraction,
  type DoctorReport,
  type Finding,
  type RepairPlan,
  type RepairResult,
  type SkipReason,
} from '@deskwork/core/doctor';

const KNOWN_FLAGS = ['site', 'fix'] as const;
const BOOLEAN_FLAGS = ['yes', 'json'] as const;

export async function run(argv: string[]): Promise<void> {
  const { positional, flags, booleans } = parseInput(argv);

  if (positional.length < 1) {
    fail(
      'Usage: deskwork doctor <project-root> [--site <slug>] [--fix <rule|all>] [--yes] [--json]',
      2,
    );
  }

  const [rootArg] = positional;
  const projectRoot = absolutize(rootArg);

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  if (flags.site !== undefined && !(flags.site in config.sites)) {
    fail(
      `Unknown --site "${flags.site}". Configured sites: ${Object.keys(config.sites).join(', ')}`,
      2,
    );
  }

  let ruleIds: string[] | undefined;
  if (flags.fix !== undefined) {
    const fixArg = flags.fix.trim();
    // Phase 23f: `--fix all` (and the empty form) leaves `ruleIds`
    // undefined so the runner picks up project rules registered at
    // `<projectRoot>/.deskwork/doctor/*.ts` along with the built-ins.
    // Explicit ids still validate against the built-in set (parseFixArgument
    // throws on unknown).
    if (fixArg !== '' && fixArg !== 'all') {
      try {
        ruleIds = parseFixArgument(flags.fix);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err), 2);
      }
    }
  }

  const json = booleans.has('json');
  const yes = booleans.has('yes');
  const repairMode = flags.fix !== undefined;

  const opts = {
    projectRoot,
    config,
    ...(flags.site !== undefined ? { site: flags.site } : {}),
    ...(ruleIds !== undefined ? { ruleIds } : {}),
  };

  let report: DoctorReport;

  if (!repairMode) {
    // Audit-only — interaction is unused but the type insists on a
    // value, so we pass yesInteraction (its methods are never invoked
    // in this mode).
    report = await runAudit(opts, yesInteraction);
    emitReport(report, { json, repairMode: false });
    process.exit(report.findings.length === 0 ? 0 : 1);
  }

  if (yes) {
    report = await runRepair(opts, yesInteraction);
  } else {
    const adapter = interactiveAdapter();
    try {
      report = await runRepair(opts, adapter.interaction);
    } finally {
      adapter.close();
    }
  }
  emitReport(report, { json, repairMode: true });

  // Exit-code logic (Issue #44):
  //   - applied → success.
  //   - skipped because the prerequisite isn't met (e.g. no body file
  //     yet for missing-frontmatter-id) → success. The operator's
  //     next action is `/deskwork:outline`, not "look at doctor."
  //   - skipped because the operator chose "leave as-is" on an orphan
  //     prompt → success. The operator made a choice; respect it.
  //   - everything else (ambiguous, schema-rejected, editorial-
  //     decision, operator-declined, apply-failed) → exit 1. These
  //     are real follow-ups doctor can't auto-resolve.
  const realFollowUps = report.repairs.filter(
    (r) => !r.applied && !isExpectedSkip(r.skipReason),
  ).length;
  process.exit(realFollowUps === 0 ? 0 : 1);
}

/**
 * True for skip reasons that indicate the operator's next move is
 * outside doctor's scope (run a different command, decline a no-op
 * choice). The exit-code logic treats these as success in `--fix`
 * mode so CI can run `doctor --fix=all --yes` and trust exit 0
 * means "we did everything we could."
 *
 * `undefined` defaults to "this is a real follow-up" — older rule
 * implementations that don't set `skipReason` keep the legacy
 * exit-1-on-skip behavior.
 */
function isExpectedSkip(reason: SkipReason | undefined): boolean {
  return reason === 'prerequisite-missing' || reason === 'no-action-needed';
}

function parseInput(argv: string[]) {
  try {
    return parseArgs(argv, KNOWN_FLAGS, BOOLEAN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }
}

// ---------------------------------------------------------------------------
// Interactive adapter — readline prompts for `--fix` without `--yes`.
// ---------------------------------------------------------------------------

interface InteractiveAdapter {
  /** The interaction object passed to the runner. */
  interaction: DoctorInteraction;
  /** Tear down the underlying readline handle. */
  close(): void;
}

function interactiveAdapter(): InteractiveAdapter {
  const rl = createInterface({ input: stdin, output: stdout });

  const interaction: DoctorInteraction = {
    async pickChoice(plan: Extract<RepairPlan, { kind: 'prompt' }>): Promise<string | undefined> {
      stdout.write(`\n${plan.question}\n`);
      plan.choices.forEach((c, i) => {
        stdout.write(`  ${i + 1}. ${c.label}\n`);
      });
      stdout.write(`  s. skip\n`);
      const answer = (await rl.question('Pick: ')).trim().toLowerCase();
      if (answer === '' || answer === 's' || answer === 'skip') return undefined;
      const idx = Number.parseInt(answer, 10);
      if (Number.isNaN(idx) || idx < 1 || idx > plan.choices.length) {
        stdout.write(`Unknown choice "${answer}", skipping.\n`);
        return undefined;
      }
      return plan.choices[idx - 1].id;
    },

    async confirmApply(plan: Extract<RepairPlan, { kind: 'apply' }>): Promise<boolean> {
      stdout.write(`\nFix: ${plan.summary}\n`);
      const answer = (await rl.question('Apply? [y/N] ')).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
  };

  return {
    interaction,
    close(): void {
      rl.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface EmitOptions {
  json: boolean;
  repairMode: boolean;
}

function emitReport(report: DoctorReport, opts: EmitOptions): void {
  if (opts.json) {
    emitJson(report, opts);
    return;
  }
  emitText(report, opts);
}

function emitJson(report: DoctorReport, opts: EmitOptions): void {
  const out = {
    mode: opts.repairMode ? 'fix' : 'audit',
    sites: report.sites,
    rules: RULES.map((r) => r.id),
    findings: report.findings.map(serializeFinding),
    repairs: report.repairs.map(serializeRepair),
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function serializeFinding(f: Finding): Record<string, unknown> {
  return {
    ruleId: f.ruleId,
    site: f.site,
    severity: f.severity,
    message: f.message,
    details: f.details,
  };
}

function serializeRepair(r: RepairResult): Record<string, unknown> {
  return {
    ruleId: r.finding.ruleId,
    site: r.finding.site,
    applied: r.applied,
    message: r.message,
    ...(r.skipReason !== undefined ? { skipReason: r.skipReason } : {}),
    finding: serializeFinding(r.finding),
    ...(r.details !== undefined ? { details: r.details } : {}),
  };
}

function emitText(report: DoctorReport, opts: EmitOptions): void {
  if (report.findings.length === 0) {
    process.stdout.write(
      `Doctor: clean (no findings across ${report.sites.length} site(s))\n`,
    );
    return;
  }

  const byRule = groupBy(report.findings, (f) => f.ruleId);
  process.stdout.write(
    `Doctor: ${report.findings.length} finding(s) across ${report.sites.length} site(s)\n\n`,
  );
  for (const rule of RULES) {
    const findings = byRule.get(rule.id);
    if (!findings || findings.length === 0) continue;
    process.stdout.write(`[${rule.id}] ${rule.label} (${findings.length})\n`);
    for (const f of findings) {
      process.stdout.write(`  - [${f.site}] ${f.message}\n`);
    }
    process.stdout.write('\n');
  }

  if (opts.repairMode) {
    emitRepairsGrouped(report);
    return;
  }

  process.stdout.write(
    `Run \`deskwork doctor --fix=<rule>\` (or \`--fix=all\`) to repair. ` +
      `Add \`--yes\` for non-interactive mode.\n`,
  );
}

/**
 * Issue #44 — repairs grouped by rule with applied/skipped split and
 * a per-finding indented bullet list. Replaces the older flat per-line
 * format that was hard to scan when 28 findings landed in one rule.
 *
 * Within each rule:
 *   - one summary line: "<rule>: N applied, M skipped (<reason hint>)"
 *   - applied bullets, then skipped bullets grouped by reason
 *
 * The skip-reason groups surface the prerequisite-missing case (the
 * common audiocontrol scenario where 16 entries are waiting on
 * outline) separately from the ambiguous / editorial-decision /
 * apply-failed cases that need real operator follow-up.
 */
function emitRepairsGrouped(report: DoctorReport): void {
  process.stdout.write('Repairs:\n');
  if (report.repairs.length === 0) {
    process.stdout.write('  (none)\n');
    return;
  }
  const byRule = groupBy(report.repairs, (r) => r.finding.ruleId);
  for (const rule of RULES) {
    const repairs = byRule.get(rule.id);
    if (!repairs || repairs.length === 0) continue;
    const applied = repairs.filter((r) => r.applied);
    const skipped = repairs.filter((r) => !r.applied);
    const summaryParts: string[] = [
      `${applied.length} applied`,
      `${skipped.length} skipped`,
    ];
    if (skipped.length > 0) {
      const hint = primarySkipHint(skipped);
      if (hint !== null) summaryParts[1] += ` (${hint})`;
    }
    process.stdout.write(`\n  ${rule.id}: ${summaryParts.join(', ')}\n`);
    if (applied.length > 0) {
      process.stdout.write('    applied:\n');
      for (const r of applied) {
        process.stdout.write(`      - [${r.finding.site}] ${r.message}\n`);
      }
    }
    if (skipped.length > 0) {
      const byReason = groupBy(skipped, (r) => r.skipReason ?? 'unknown');
      for (const [reason, items] of byReason) {
        process.stdout.write(`    skipped (${reason}):\n`);
        for (const r of items) {
          process.stdout.write(`      - [${r.finding.site}] ${r.message}\n`);
        }
      }
    }
  }
  // Aggregated bottom-of-output summary with the new skip-reason
  // granularity from Issue #44.
  const totals = aggregateRepairTotals(report.repairs);
  process.stdout.write('\nSummary:\n');
  process.stdout.write(`  applied: ${totals.applied}\n`);
  for (const [reason, count] of totals.skipped) {
    process.stdout.write(`  skipped (${reason}): ${count}\n`);
  }
}

interface RepairTotals {
  readonly applied: number;
  /** Skipped counts keyed by reason, in iteration order. */
  readonly skipped: ReadonlyArray<readonly [string, number]>;
}

function aggregateRepairTotals(
  repairs: ReadonlyArray<RepairResult>,
): RepairTotals {
  let applied = 0;
  const counts = new Map<string, number>();
  for (const r of repairs) {
    if (r.applied) {
      applied++;
      continue;
    }
    const key = r.skipReason ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { applied, skipped: Array.from(counts.entries()) };
}

/**
 * One-line hint for the parenthetical attached to a rule's per-rule
 * summary line. Returns null when the skip-reason mix is heterogeneous
 * enough that a single phrase would be misleading; the per-reason
 * sub-bullets already show the breakdown.
 */
function primarySkipHint(skipped: ReadonlyArray<RepairResult>): string | null {
  const reasons = new Set<string>();
  for (const r of skipped) {
    reasons.add(r.skipReason ?? 'unknown');
  }
  if (reasons.size !== 1) return null;
  const [only] = reasons;
  switch (only) {
    case 'prerequisite-missing':
      return 'no body file yet — run /deskwork:outline';
    case 'ambiguous':
      return 'ambiguous; re-run interactively to choose';
    case 'editorial-decision':
      return 'operator must decide';
    case 'schema-rejected':
      return 'patch host content schema first';
    case 'operator-declined':
      return 'operator declined';
    case 'apply-failed':
      return 'apply failed';
    case 'no-action-needed':
      return 'no action needed';
    default:
      return null;
  }
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

