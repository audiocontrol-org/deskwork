import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  archivePhases,
  enumerateAllPhases,
  ArchivePhasesError,
} from '../scope-discovery/workplan-archive/archive-phases.js';

const USAGE = [
  'Usage: dw-lifecycle archive-phases',
  '    --feature <slug>',
  '    (--phases <range> | --all)',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--allow-vestigial <reason>]',
  '    [--help]',
  '',
  '--feature <slug>      Required. Resolves docs/<v>/<status>/<slug>/.',
  '--phases <range>      Phase IDs to archive: "1,2,5" or "1-5,7,9-10".',
  '--all                 Archive every `## Phase N:` heading present in',
  '                      the feature\'s workplan.md. Pre-fills --phases.',
  '                      Mutually exclusive with --phases.',
  '--repo-root <path>    Project root. Default: cwd.',
  '--apply               Perform the move. Default is dry-run.',
  '--allow-vestigial     ≥40-char reason allowing archive of incomplete',
  '                      phases (retired-vestigial case per AUDIT-37).',
  '',
  'Exit codes:',
  '  0  scan / archive complete',
  '  1  refused (incomplete phase without --allow-vestigial; or write failure)',
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

export async function archivePhasesCli(args: string[]): Promise<void> {
  let featureSlug: string | undefined;
  let phasesRaw: string | undefined;
  let repoRootOverride: string | undefined;
  let apply = false;
  let allowVestigialReason: string | undefined;
  let help = false;
  let allFlag = false;
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
    if (flag === '--all') {
      allFlag = true;
      continue;
    }
    if (flag === '--feature' || flag === '--phases' || flag === '--repo-root' || flag === '--allow-vestigial') {
      const value = args[i + 1];
      if (value === undefined) {
        process.stderr.write(`${flag} requires a value\n${USAGE}`);
        process.exit(2);
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--phases') phasesRaw = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      else if (flag === '--allow-vestigial') allowVestigialReason = value;
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
  if (allFlag && phasesRaw !== undefined) {
    process.stderr.write(`--all and --phases are mutually exclusive\n${USAGE}`);
    process.exit(2);
  }
  if (!allFlag && phasesRaw === undefined) {
    process.stderr.write(`--phases or --all required\n${USAGE}`);
    process.exit(2);
  }
  const repoRoot = repoRootOverride ?? process.cwd();
  let phases: number[];
  if (allFlag) {
    const workplanPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      featureSlug,
      'workplan.md',
    );
    let workplanBody: string;
    try {
      workplanBody = await readFile(workplanPath, 'utf8');
    } catch (err) {
      process.stderr.write(
        `archive-phases: --all could not read ${workplanPath}: ${(err as Error).message}\n`,
      );
      process.exit(2);
    }
    phases = enumerateAllPhases(workplanBody);
    if (phases.length === 0) {
      process.stderr.write(
        `archive-phases: --all found 0 \`## Phase N:\` headings in ${workplanPath}. ` +
          `Nothing to archive.\n`,
      );
      process.exit(0);
    }
    process.stderr.write(
      `archive-phases: --all expanded to phases ${phases.join(', ')}\n`,
    );
  } else {
    try {
      phases = parsePhaseRange(phasesRaw!);
    } catch (err) {
      process.stderr.write(`bad --phases value: ${(err as Error).message}\n`);
      process.exit(2);
    }
  }
  try {
    const report = await archivePhases({
      repoRoot,
      featureSlug,
      phases,
      apply,
      allowVestigialReason,
    });
    const mode = report.apply ? 'APPLIED' : 'DRY-RUN';
    process.stderr.write(`archive-phases: ${mode}\n`);
    let refusedCount = 0;
    for (const action of report.actions) {
      const note = action.uncheckedTaskCount !== undefined
        ? ` (${action.uncheckedTaskCount} unchecked task${action.uncheckedTaskCount === 1 ? '' : 's'})`
        : '';
      process.stderr.write(`  Phase ${action.phase}: ${action.action}${note}\n`);
      if (action.action === 'refused-incomplete') refusedCount += 1;
    }
    if (!report.apply) {
      process.stderr.write(`\nRe-run with --apply to perform the archive.\n`);
    }
    process.exit(refusedCount > 0 && !report.apply ? 0 : refusedCount > 0 ? 1 : 0);
  } catch (err) {
    if (err instanceof ArchivePhasesError) {
      process.stderr.write(`archive-phases: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}
