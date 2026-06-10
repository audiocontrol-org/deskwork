/**
 * plugins/stack-control/src/scope-discovery/validate-scope-discovery.ts
 *
 * Operator-facing CLI to run the full scope-discovery adversarial
 * harness suite in a single invocation. Acts as the "did the protocol
 * still hold together?" entry point.
 *
 * Implementation: spawn vitest against the `scope-discovery` test
 * pattern under the stack-control plugin workspace and forward the exit
 * code. Vitest's own filter does the work (every test file under
 * `src/__tests__/scope-discovery/*.test.ts` matches), so we don't
 * re-implement test discovery here.
 *
 * Why not call vitest programmatically: spawning a fresh child gives
 * the operator a clean stdout/stderr stream (vitest's reporter wired up
 * end-to-end) and a stable exit-code contract identical to what they'd
 * get running `npm test -- scope-discovery` by hand. The wrapper exists
 * for discoverability + skill-prose ergonomics, not for capturing or
 * re-shaping vitest's output.
 *
 * CLI:
 *   --quiet            Pass `--reporter=dot` to vitest for a compact
 *                      single-line-per-file summary.
 *   --help, -h         Print help + exit 0.
 *
 * Exit codes mirror vitest's:
 *   0   all scope-discovery scenarios passed.
 *   1   one or more scenarios failed (or vitest crashed).
 *   2   invalid CLI args.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from './util/typeguards.js';

interface CliOptions {
  readonly quiet: boolean;
}

function parseCli(argv: readonly string[]): CliOptions {
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quiet') {
      quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
      throw new Error('unreachable');
    } else {
      throw new Error(`unknown argument: ${arg ?? '<empty>'}`);
    }
  }
  return { quiet };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl validate-scope-discovery [options]',
      '',
      'Run the full scope-discovery adversarial harness suite via vitest.',
      '',
      'Options:',
      '  --quiet            Compact dot reporter',
      '  --help, -h         Show this help',
      '',
      'Exit codes: 0 all passed, 1 failure(s), 2 invalid args.',
      '',
    ].join('\n'),
  );
}

/**
 * Compute the stack-control plugin workspace root. This source file
 * lives at
 * `plugins/stack-control/src/scope-discovery/validate-scope-discovery.ts`,
 * so the plugin root is three levels up.
 */
function pluginRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..');
}

/**
 * Resolve the LOCAL vitest binary by walking up from the plugin root
 * looking for `node_modules/.bin/vitest` — mirroring how
 * `_run-helpers.resolveTsx` (and `bin/stackctl`) resolve tsx. This works
 * whether npm hoisted vitest to the monorepo root OR nested it
 * plugin-local; a bare `vitest` / `npx vitest` would either miss the
 * workspace install or trigger a network fetch.
 */
function resolveVitest(): string {
  let cur = pluginRoot();
  for (;;) {
    const candidate = join(cur, 'node_modules', '.bin', 'vitest');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(
    `validate-scope-discovery: could not locate node_modules/.bin/vitest by walking up from ${pluginRoot()}`,
  );
}

/**
 * Programmatic entrypoint. Exported so tests can drive arg parsing
 * without spawning vitest. The vitest spawn itself is exercised via a
 * subprocess smoke that targets the stack-control CLI; tests of THIS
 * function cover the flag-parse paths only — we don't recursively run
 * vitest from inside vitest.
 */
export async function main(argv: readonly string[]): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`validate-scope-discovery: ${errorMessage(err)}\n`);
    return 2;
  }
  return runVitest(opts);
}

function runVitest(opts: CliOptions): Promise<number> {
  const cwd = pluginRoot();
  const vitestBin = resolveVitest();
  const args: string[] = ['run', 'scope-discovery'];
  if (opts.quiet) args.push('--reporter=dot');
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(vitestBin, args, {
      cwd,
      stdio: 'inherit',
    });
    proc.on('error', rejectP);
    proc.on('close', (code) => {
      // Null exit (signal-killed) is treated as failure; vitest crashes
      // shouldn't masquerade as a clean exit.
      resolveP(code ?? 1);
    });
  });
}
