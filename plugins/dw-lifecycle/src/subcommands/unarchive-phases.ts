import { unarchivePhases, UnarchivePhasesError } from '../scope-discovery/workplan-archive/unarchive-phases.js';

const USAGE = [
  'Usage: dw-lifecycle unarchive-phases',
  '    --feature <slug>',
  '    --phases <range>',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  'Symmetric reversal of archive-phases. Moves phase sections from',
  'workplan-archive.md back to workplan.md at the correct numeric position;',
  'updates ledger (removes phase from archived-phases; preserves',
  'next-fix-task-id and archived-fix-tasks).',
  '',
  'Exit codes:',
  '  0  scan / restore complete',
  '  1  not-found-in-archive (when --apply and no sections found)',
  '  2  usage / config error',
  '',
].join('\n');

function parsePhaseRange(spec: string): number[] {
  const phases = new Set<number>();
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = Number(startStr);
      const end = Number(endStr);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
        throw new Error(`bad phase range: "${trimmed}"`);
      }
      for (let n = start; n <= end; n += 1) phases.add(n);
    } else {
      const n = Number(trimmed);
      if (Number.isNaN(n)) throw new Error(`bad phase id: "${trimmed}"`);
      phases.add(n);
    }
  }
  return Array.from(phases).sort((a, b) => a - b);
}

export async function unarchivePhasesCli(args: string[]): Promise<void> {
  let featureSlug: string | undefined;
  let phasesRaw: string | undefined;
  let repoRootOverride: string | undefined;
  let apply = false;
  let help = false;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    if (flag === '--feature' || flag === '--phases' || flag === '--repo-root') {
      const value = args[i + 1];
      if (value === undefined) {
        process.stderr.write(`${flag} requires a value\n${USAGE}`);
        process.exit(2);
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--phases') phasesRaw = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    process.stderr.write(`unknown flag: ${flag}\n${USAGE}`);
    process.exit(2);
  }
  if (help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (featureSlug === undefined) {
    process.stderr.write(`--feature required\n${USAGE}`);
    process.exit(2);
  }
  if (phasesRaw === undefined) {
    process.stderr.write(`--phases required\n${USAGE}`);
    process.exit(2);
  }
  let phases: number[];
  try {
    phases = parsePhaseRange(phasesRaw);
  } catch (err) {
    process.stderr.write(`bad --phases value: ${(err as Error).message}\n`);
    process.exit(2);
  }
  const repoRoot = repoRootOverride ?? process.cwd();
  try {
    const report = await unarchivePhases({
      repoRoot,
      featureSlug,
      phases,
      apply,
    });
    const mode = report.apply ? 'APPLIED' : 'DRY-RUN';
    process.stderr.write(`unarchive-phases: ${mode}\n`);
    for (const action of report.actions) {
      process.stderr.write(`  Phase ${action.phase}: ${action.action}\n`);
    }
    if (!report.apply) {
      process.stderr.write(`\nRe-run with --apply to perform the restore.\n`);
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof UnarchivePhasesError) {
      process.stderr.write(`unarchive-phases: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}
