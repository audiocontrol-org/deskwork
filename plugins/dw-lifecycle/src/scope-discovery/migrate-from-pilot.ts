/**
 * plugins/dw-lifecycle/src/scope-discovery/migrate-from-pilot.ts
 *
 * CLI shell + orchestrator entry point for the `migrate-from-pilot`
 * subcommand (Phase 6 Task 4 + Phase 8 Task 4; closes [#291]). Owns:
 *
 *   - CLI parsing (`parseCli`, `USAGE`)
 *   - The apply-side disk I/O that materializes the plan
 *     (`applyConfigCopies`)
 *   - The orchestrator entry (`migrateFromPilotMain`) that wires plan
 *     → apply → report → exit-code
 *
 * Pure planning + diff + render logic lives in
 * `./migrate-from-pilot-plan.ts` to keep this file under the 300–500
 * line guideline.
 *
 * Behavior summary (see SKILL.md + the plan module for the full prose):
 *
 *   1. Validate the pilot root — refuse when `<pilot-root>/tools/scope-discovery/`
 *      is absent.
 *   2. CONFIG copy (verbatim). Copy YAMLs from `<pilot-root>/docs/scope-discovery/`
 *      to `<target>/.dw-lifecycle/scope-discovery/`. Refuse on target
 *      conflict unless `--force`.
 *   3. CODE diff (per-file report). Compare each pilot
 *      `tools/scope-discovery/<name>.ts` against the plugin default at
 *      `plugins/dw-lifecycle/src/scope-discovery/<name>.ts`.
 *   4. Emit a markdown report (stdout or `--report-out <path>`).
 *
 * Default behavior is DRY-RUN. Pass `--apply` to materialize CONFIG
 * copies. The CODE diff is report-only — the operator decides whether
 * to `/dw-lifecycle:customize` based on the report.
 *
 * Exit codes:
 *   0 — success (plan computed; CONFIG written if --apply)
 *   2 — infra error (CLI parse, missing pilot dir, target conflict
 *       without --force, write failure)
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  type ConfigEntry,
  type MigrationPlan,
  planMigration as planMigrationImpl,
  renderReport,
  summarizeCodeEntries,
} from './migrate-from-pilot-plan.js';
import { errorMessage } from './util/typeguards.js';

// Re-export the plan-side public surface so callers (tests, future
// orchestrators) can import everything from the canonical
// `migrate-from-pilot.ts` entry without learning the internal file split.
export type {
  CodeEntry,
  CodeStatus,
  CodeSummary,
  ConfigAction,
  ConfigEntry,
  MigrationPlan,
} from './migrate-from-pilot-plan.js';
export {
  renderReport,
  summarizeCodeEntries,
} from './migrate-from-pilot-plan.js';

export interface CliOptions {
  readonly pilotRoot: string;
  readonly target: string;
  readonly apply: boolean;
  readonly force: boolean;
  readonly reportOut: string | null;
  readonly quiet: boolean;
}

export const USAGE =
  'Usage: dw-lifecycle migrate-from-pilot \\\n' +
  '    --pilot-root <path> \\\n' +
  '    [--target <path>] \\\n' +
  '    [--apply] \\\n' +
  '    [--force] \\\n' +
  '    [--report-out <path>] \\\n' +
  '    [--quiet]\n';

export function parseCli(argv: ReadonlyArray<string>): CliOptions {
  let pilotRoot: string | null = null;
  let target: string = process.cwd();
  let apply = false;
  let force = false;
  let reportOut: string | null = null;
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') throw new Error('HELP');
    if (a === '--apply') {
      apply = true;
      continue;
    }
    if (a === '--force') {
      force = true;
      continue;
    }
    if (a === '--quiet') {
      quiet = true;
      continue;
    }
    if (a === '--pilot-root') {
      const v = argv[i + 1];
      if (v === undefined) throw new Error('--pilot-root requires a path');
      pilotRoot = v;
      i += 1;
      continue;
    }
    if (a === '--target') {
      const v = argv[i + 1];
      if (v === undefined) throw new Error('--target requires a path');
      target = v;
      i += 1;
      continue;
    }
    if (a === '--report-out') {
      const v = argv[i + 1];
      if (v === undefined) throw new Error('--report-out requires a path');
      reportOut = v;
      i += 1;
      continue;
    }
    throw new Error(`unknown arg: ${a ?? '<empty>'}`);
  }
  if (pilotRoot === null) {
    throw new Error('--pilot-root is required');
  }
  return {
    pilotRoot: resolve(pilotRoot),
    target: resolve(target),
    apply,
    force,
    reportOut:
      reportOut === null
        ? null
        : isAbsolute(reportOut)
          ? reportOut
          : resolve(target, reportOut),
    quiet,
  };
}

/**
 * Re-exported planning entry. Accepts `CliOptions` so callers can pass
 * the parsed-CLI shape directly; the plan module accepts only the
 * `PlanInput` subset, so we project here.
 */
export function planMigration(opts: CliOptions): MigrationPlan {
  return planMigrationImpl({
    pilotRoot: opts.pilotRoot,
    target: opts.target,
    apply: opts.apply,
    force: opts.force,
  });
}

/**
 * Materialize the planned CONFIG copies. Returns the updated entries
 * with `planned-copy` → `copied` (or `overwritten` when --force flipped
 * a divergent target). Other action types pass through unchanged.
 *
 * Refuses (throws) if any entry is `conflict-refused` — the planner
 * should have surfaced the conflict before --apply was honored. The
 * orchestrator gates --apply on the absence of conflict-refused entries,
 * so this defensive check catches programming errors in the gate.
 */
export async function applyConfigCopies(
  plan: MigrationPlan,
): Promise<ReadonlyArray<ConfigEntry>> {
  if (!plan.apply) {
    throw new Error(
      'applyConfigCopies called on a plan with apply=false; this is a programming error.',
    );
  }
  const out: ConfigEntry[] = [];
  for (const entry of plan.configEntries) {
    if (entry.action === 'conflict-refused') {
      throw new Error(
        `cannot apply: ${entry.name} is conflict-refused. ` +
          'The orchestrator should have refused before reaching applyConfigCopies.',
      );
    }
    if (entry.action !== 'planned-copy') {
      out.push(entry);
      continue;
    }
    await mkdir(dirname(entry.targetPath), { recursive: true });
    const pilotText = await readFile(entry.pilotPath, 'utf8');
    const targetExisted = existsSync(entry.targetPath);
    await writeFile(entry.targetPath, pilotText, 'utf8');
    out.push({
      ...entry,
      action: targetExisted ? 'overwritten' : 'copied',
    });
  }
  return out;
}

/**
 * Public entry point. Returns the numeric exit code; the subcommand
 * shim translates to `process.exit`.
 */
export async function migrateFromPilotMain(
  argv: ReadonlyArray<string>,
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    const msg = errorMessage(err);
    if (msg === 'HELP') {
      process.stdout.write(USAGE);
      return 0;
    }
    process.stderr.write(`migrate-from-pilot: ${msg}\n${USAGE}`);
    return 2;
  }

  let plan: MigrationPlan;
  try {
    plan = planMigration(opts);
  } catch (err) {
    process.stderr.write(`migrate-from-pilot: ${errorMessage(err)}\n`);
    return 2;
  }

  // Gate --apply on the absence of conflict-refused entries. Without
  // --force, divergent target files refuse; --force resolves the
  // refusal by switching the planned action to `planned-copy` with an
  // overwrite reason. The gate here catches the case where --apply is
  // requested but at least one entry is still refused.
  const conflicts = plan.configEntries.filter(
    (e) => e.action === 'conflict-refused',
  );
  if (opts.apply && conflicts.length > 0) {
    const names = conflicts.map((c) => c.name).join(', ');
    process.stderr.write(
      `migrate-from-pilot: refusing --apply because ${conflicts.length} ` +
        `target file(s) already exist and differ from pilot: ${names}. ` +
        'Re-run with `--force` to overwrite.\n',
    );
    return 2;
  }

  let appliedEntries: ReadonlyArray<ConfigEntry> = plan.configEntries;
  if (opts.apply) {
    try {
      appliedEntries = await applyConfigCopies(plan);
    } catch (err) {
      process.stderr.write(`migrate-from-pilot: ${errorMessage(err)}\n`);
      return 2;
    }
  }

  const report = renderReport({ plan, configEntries: appliedEntries });

  if (opts.reportOut !== null) {
    try {
      await mkdir(dirname(opts.reportOut), { recursive: true });
      await writeFile(opts.reportOut, report, 'utf8');
    } catch (err) {
      process.stderr.write(
        `migrate-from-pilot: report write failed: ${errorMessage(err)}\n`,
      );
      return 2;
    }
    if (!opts.quiet) {
      process.stderr.write(
        `migrate-from-pilot: wrote report to ${relative(opts.target, opts.reportOut)}\n`,
      );
      // Brief summary on stderr so the operator sees the bottom-line
      // categorization without having to open the report file.
      const s = summarizeCodeEntries(plan.codeEntries);
      process.stderr.write(
        `migrate-from-pilot: ${s.identical} identical, ` +
          `${s.pilotAhead} pilot-ahead, ${s.pilotBehind} pilot-behind, ` +
          `${s.diverges} diverges, ${s.pilotOnly} pilot-only, ` +
          `${s.pluginOnly} plugin-only\n`,
      );
    }
  } else {
    process.stdout.write(report);
  }

  return 0;
}
