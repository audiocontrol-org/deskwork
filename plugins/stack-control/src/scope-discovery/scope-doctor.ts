/**
 * plugins/stack-control/src/scope-discovery/scope-doctor.ts
 *
 * Self-contained runner for the scope-discovery doctor rules (010 / US6).
 * Unlike dw-lifecycle's `doctor.ts` (project-coupled to deskwork config +
 * frontmatter + peer-plugin detection), this runner ONLY drives the
 * scope-discovery rule set, scoped to the resolved per-codebase installation
 * root. Named `scope-doctor` to avoid colliding with any future generic
 * `doctor` verb.
 *
 * The installation root is resolved once via `resolveCodebaseBoundary` (009
 * walk-up, or `--at <dir>`) and handed to every rule as `repoRoot` — so every
 * rule agrees on "which codebase am I diagnosing". No cwd fallback: resolution
 * fails loud when no installation encloses the start dir.
 *
 * Exit codes:
 *   0   no error-severity findings (warnings may be present).
 *   1   at least one error-severity finding.
 *   2   invalid args, or no enclosing installation.
 *
 * `--fix` is accepted but the current scope-discovery rule set is read-only
 * (no rule mutates); the flag is reserved + validated so the contract is
 * stable when fix-capable rules land. Per US6 RED test T058: the rules
 * report, and mutate only under `--fix` (today: no rule mutates, so `--fix`
 * is a documented no-op that still exits on the finding severity).
 */

import { resolveCodebaseBoundary } from './codebase-boundary.js';
import { SCOPE_DISCOVERY_DOCTOR_RULES } from './doctor-rules/index.js';
import type { ScopeDoctorFinding } from './doctor-rules/types.js';
import { errorMessage } from './util/typeguards.js';

interface ScopeDoctorOptions {
  readonly at: string | null;
  readonly fix: boolean;
  readonly json: boolean;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl scope-doctor [options]',
      '',
      'Run the scope-discovery doctor rules against the enclosing installation.',
      '',
      'Options:',
      '  --at <dir>   Installation walk-up start dir (default: cwd).',
      '  --fix        Apply fixes (reserved; current rule set is read-only).',
      '  --json       Emit findings as JSON.',
      '  --help, -h   Show this help.',
      '',
      'Exit codes: 0 no errors, 1 error-severity finding(s), 2 args / no install.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): ScopeDoctorOptions {
  let at: string | null = null;
  let fix = false;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--at': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--at requires a path');
        at = next;
        i += 1;
        break;
      }
      case '--fix':
        fix = true;
        break;
      case '--json':
        json = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown argument: ${arg ?? '<empty>'}`);
    }
  }
  return { at, fix, json };
}

export interface RunResult {
  readonly code: 0 | 1 | 2;
  readonly findings?: readonly ScopeDoctorFinding[];
  readonly installationRoot?: string;
}

/**
 * Resolve the installation root, run every scope-discovery rule against it,
 * and aggregate the findings. Exported so tests drive it without a subprocess.
 */
export async function runScopeDoctor(opts: ScopeDoctorOptions): Promise<RunResult> {
  let repoRoot: string;
  try {
    const boundary = resolveCodebaseBoundary({
      startDir: opts.at ?? process.cwd(),
      explicitRoot: opts.at,
    });
    repoRoot = boundary.installationRoot;
  } catch (err) {
    process.stderr.write(`scope-doctor: ${errorMessage(err)}\n`);
    return { code: 2 };
  }

  const findings: ScopeDoctorFinding[] = [];
  for (const rule of SCOPE_DISCOVERY_DOCTOR_RULES) {
    const ruleFindings = await rule({ repoRoot });
    for (const finding of ruleFindings) findings.push(finding);
  }

  const hasError = findings.some((f) => f.severity === 'error');
  return { code: hasError ? 1 : 0, findings, installationRoot: repoRoot };
}

export async function main(argv: readonly string[]): Promise<RunResult> {
  let opts: ScopeDoctorOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`scope-doctor: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  const result = await runScopeDoctor(opts);
  if (result.findings === undefined) return result;
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ findings: result.findings }, null, 2)}\n`);
  } else {
    for (const f of result.findings) {
      process.stdout.write(`${f.severity}: [${f.rule}] ${f.message}\n`);
    }
    process.stdout.write(
      `scope-doctor: ${result.findings.length} finding(s) at ${result.installationRoot}\n`,
    );
  }
  return result;
}
