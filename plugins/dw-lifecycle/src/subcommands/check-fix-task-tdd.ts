/**
 * plugins/dw-lifecycle/src/subcommands/check-fix-task-tdd.ts
 *
 * Phase 13 Task 3 — commit-msg gate that verifies the TDD discipline
 * for `Closes AUDIT-<id>` commits. Invoked manually or via a commit-msg
 * hook with `--commit-msg-file <path>`.
 *
 *   dw-lifecycle check-fix-task-tdd
 *     --commit-msg-file <path>     git's commit-msg argument
 *     [--feature <slug>]           optional: restrict to one feature's workplan
 *     [--repo-root <path>]
 *     [--skip-vitest]              optional: only run the file-presence half
 *     [--help]
 *
 * For each `Closes AUDIT-<id>` reference in the commit message:
 *   1. Find the matching workplan task block.
 *   2. Verify the task block's cited test file exists.
 *   3. Run `npx vitest run <path>` against the cited test (unless
 *      `--skip-vitest`); the test must exit 0.
 *
 * Exit 0 on all checks passing; exit 1 on any verification failure;
 * exit 2 on argv errors.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import { parseClosesAuditTrailers } from '../scope-discovery/promote-findings/auto-flip-from-commit.js';
import {
  extractTestFilePath,
  findCompletedFixFindingTasks,
  verifyFixTaskTDD,
  type VitestRunner,
} from '../scope-discovery/promote-findings/tdd-enforcement.js';

export interface CheckFixTaskTddCliOptions {
  readonly commitMsgFile?: string;
  readonly featureSlug?: string;
  readonly repoRoot?: string;
  readonly skipVitest?: boolean;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CheckFixTaskTddCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle check-fix-task-tdd',
  '    --commit-msg-file <path>',
  '    [--feature <slug>]',
  '    [--repo-root <path>]',
  '    [--skip-vitest]',
  '    [--help]',
  '',
  '--commit-msg-file <path>  Required. Path to the commit message file',
  '                          (git passes this as the first arg to commit-msg).',
  '--feature <slug>          Optional: restrict to one features workplan.',
  '                          Default: walk every docs/<v>/001-IN-PROGRESS/.',
  '--skip-vitest             Only verify test-file presence; skip vitest run.',
  '',
  'Exit codes:',
  '  0  all checks pass',
  '  1  at least one Closes-AUDIT references a missing/failing test',
  '  2  argv error',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let commitMsgFile: string | undefined;
  let featureSlug: string | undefined;
  let repoRootOverride: string | undefined;
  let skipVitest = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--skip-vitest') {
      skipVitest = true;
      continue;
    }
    if (
      flag === '--commit-msg-file' ||
      flag === '--feature' ||
      flag === '--repo-root'
    ) {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      if (flag === '--commit-msg-file') commitMsgFile = value;
      else if (flag === '--feature') featureSlug = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) return { ok: true, opts: { help: true } };
  if (commitMsgFile === undefined) {
    return { ok: false, error: '--commit-msg-file <path> is required' };
  }
  const opts: CheckFixTaskTddCliOptions = {
    commitMsgFile,
    skipVitest,
    ...(featureSlug !== undefined ? { featureSlug } : {}),
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

const DEFAULT_VITEST_RUNNER: VitestRunner = async (testPath, root) => {
  try {
    const out = execFileSync('npx', ['vitest', 'run', testPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output: out };
  } catch (err) {
    const output =
      err instanceof Error && 'stdout' in err
        ? String((err as { stdout?: unknown }).stdout ?? '') +
          String((err as { stderr?: unknown }).stderr ?? '')
        : err instanceof Error
          ? err.message
          : String(err);
    const exitCode =
      err instanceof Error && 'status' in err
        ? Number((err as { status?: unknown }).status ?? 1)
        : 1;
    return { exitCode, output };
  }
};

async function loadFeatureWorkplans(
  repoRootResolved: string,
  featureSlug: string | undefined,
): Promise<ReadonlyArray<{ slug: string; workplan: string }>> {
  const docsRoot = join(repoRootResolved, 'docs');
  if (!existsSync(docsRoot)) return [];
  const out: { slug: string; workplan: string }[] = [];
  const versionDirs = await readdir(docsRoot);
  for (const v of versionDirs) {
    const inProgress = join(docsRoot, v, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    const slugs = await readdir(inProgress);
    for (const slug of slugs) {
      if (featureSlug !== undefined && slug !== featureSlug) continue;
      const workplanPath = join(inProgress, slug, 'workplan.md');
      if (!existsSync(workplanPath)) continue;
      try {
        const workplan = await readFile(workplanPath, 'utf8');
        out.push({ slug, workplan });
      } catch {
        // skip
      }
    }
  }
  return out;
}

export interface RunArgs {
  readonly opts: CheckFixTaskTddCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly runVitest?: VitestRunner;
  readonly readCommitMsg?: (path: string) => Promise<string>;
}

export async function runCheckFixTaskTdd(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const commitMsgFile = args.opts.commitMsgFile;
  if (commitMsgFile === undefined) {
    args.stderr.write(
      `check-fix-task-tdd: --commit-msg-file required.\n`,
    );
    return 2;
  }
  const msgReader = args.readCommitMsg ?? ((p: string) => readFile(p, 'utf8'));
  let commitMsg: string;
  try {
    commitMsg = await msgReader(commitMsgFile);
  } catch (err) {
    args.stderr.write(
      `check-fix-task-tdd: cannot read commit-msg file: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  const closesIds = parseClosesAuditTrailers(commitMsg);
  if (closesIds.length === 0) {
    // No Closes-AUDIT in commit; gate is a no-op. Exit 0.
    return 0;
  }

  const workplans = await loadFeatureWorkplans(
    repoRootResolved,
    args.opts.featureSlug,
  );

  const runVitest = args.opts.skipVitest === true ? undefined : (args.runVitest ?? DEFAULT_VITEST_RUNNER);

  let allOk = true;
  for (const auditId of closesIds) {
    let matched = false;
    for (const { slug, workplan } of workplans) {
      const tasks = findCompletedFixFindingTasks(workplan);
      const task = tasks.find((t) => t.findingId === auditId);
      if (task === undefined) continue;
      matched = true;
      const verifyArgs: Parameters<typeof verifyFixTaskTDD>[0] = {
        workplanTaskBlock: task.taskBlock,
        repoRoot: repoRootResolved,
      };
      if (runVitest !== undefined) {
        Object.assign(verifyArgs, { runVitest });
      }
      const result = await verifyFixTaskTDD(verifyArgs);
      if (result.valid) {
        args.stdout.write(
          `check-fix-task-tdd: ${auditId} (feature ${slug}) -> OK (${result.testFilePath ?? '<no path>'})\n`,
        );
      } else {
        allOk = false;
        args.stdout.write(
          `check-fix-task-tdd: ${auditId} (feature ${slug}) -> FAIL (${result.reason}; testFile=${result.testFilePath ?? '<none>'})\n`,
        );
        if (result.vitestOutput !== undefined) {
          args.stdout.write(`  vitest output:\n${result.vitestOutput}\n`);
        }
      }
    }
    if (!matched) {
      // The commit cites an AUDIT-id but no fix-finding task is marked
      // done for it. That's a workflow gap (the fix is being committed
      // without the corresponding [x] in the workplan). Surface and fail.
      args.stdout.write(
        `check-fix-task-tdd: ${auditId} -> NOT FOUND in any workplan (commit cites Closes AUDIT but no [x] fix-finding task exists; mark the task done in workplan first)\n`,
      );
      allOk = false;
    }
  }

  if (!allOk) {
    args.stderr.write(
      `check-fix-task-tdd: one or more Closes-AUDIT references failed TDD verification; commit blocked.\n`,
    );
    return 1;
  }
  args.stderr.write(
    `check-fix-task-tdd: ${closesIds.length} Closes-AUDIT reference(s) verified.\n`,
  );
  return 0;
}

export async function checkFixTaskTddCli(rawArgs: string[]): Promise<void> {
  const parsed = parseFlags(rawArgs);
  if (parsed.ok && parsed.opts.help === true) {
    process.stdout.write(USAGE);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    process.exit(2);
  }
  let projectRoot: string;
  if (parsed.opts.repoRoot !== undefined) {
    projectRoot = isAbsolute(parsed.opts.repoRoot)
      ? parsed.opts.repoRoot
      : resolve(process.cwd(), parsed.opts.repoRoot);
  } else {
    projectRoot = repoRoot();
  }
  const exit = await runCheckFixTaskTdd({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
