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
 * Exit codes:
 *   0  Audit clean OR all repairs applied.
 *   1  Findings present (audit) OR some repairs skipped/failed (fix).
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
    try {
      ruleIds = parseFixArgument(flags.fix);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
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

  // Exit 0 only when every finding had a successful repair OR when
  // there were zero findings to begin with. Skipped/failed repairs
  // mean the operator still has work to do.
  const failedRepairs = report.repairs.filter((r) => !r.applied).length;
  process.exit(failedRepairs === 0 ? 0 : 1);
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
    process.stdout.write('Repairs:\n');
    if (report.repairs.length === 0) {
      process.stdout.write('  (none)\n');
      return;
    }
    for (const r of report.repairs) {
      const verdict = r.applied ? 'applied' : 'skipped';
      process.stdout.write(`  - [${r.finding.ruleId}] [${verdict}] ${r.message}\n`);
    }
    const applied = report.repairs.filter((r) => r.applied).length;
    const skipped = report.repairs.length - applied;
    process.stdout.write(
      `\nSummary: ${applied} applied, ${skipped} skipped/failed\n`,
    );
    return;
  }

  process.stdout.write(
    `Run \`deskwork doctor --fix=<rule>\` (or \`--fix=all\`) to repair. ` +
      `Add \`--yes\` for non-interactive mode.\n`,
  );
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

