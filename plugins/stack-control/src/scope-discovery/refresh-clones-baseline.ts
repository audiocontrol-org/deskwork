/**
 * plugins/stack-control/src/scope-discovery/refresh-clones-baseline.ts
 *
 * Thin wrapper carving the `--refresh-baseline` mode of `check-clones`
 * into its own subcommand for operator ergonomics. The underlying
 * implementation lives in `clone-detector.ts`; this file injects
 * `--refresh-baseline` into the arg list and dispatches.
 *
 * Rationale: operators land on the `stackctl refresh-clones-baseline`
 * verb naturally — the clone-detector's `batch-dispose` hint cites it as
 * the recovery path when an unknown id is encountered, and skill prose
 * references it without the operator needing to remember the
 * `check-clones --refresh-baseline` incantation.
 *
 * Flags accepted (forwarded to checkClones verbatim):
 *   --baseline <path>  Override the per-codebase clones.yaml path.
 *   --quiet            Suppress per-clone output; print summary only.
 *
 * NOT accepted (refresh is mutating by definition; gating semantics
 * don't apply):
 *   --gate-mode
 *
 * Exit codes mirror checkClones for --refresh-baseline mode:
 *   0  baseline written.
 *   2  I/O, parse, or jscpd-crash error.
 */

import { checkClones } from './clone-detector.js';

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl refresh-clones-baseline [options]',
      '',
      'Rewrite the clones.yaml baseline from a fresh jscpd run, carrying',
      'forward operator-authored dispositions for clone groups that survive',
      'across the refresh.',
      '',
      'Options:',
      '  --baseline <path>  Override the per-codebase .stack-control/scope-discovery/clones.yaml',
      '  --quiet            Suppress per-clone output; summary only',
      '  --help, -h         Show this help',
      '',
      'Exit codes: 0 baseline written, 2 I/O / parse / jscpd error.',
      '',
    ].join('\n'),
  );
}

/**
 * Pure helper: compute the forwarded arg list for checkClones. Injects
 * `--refresh-baseline` iff not already present. Pulled out so tests can
 * exercise the arg-translation contract without spawning jscpd.
 */
export function forwardedArgs(args: readonly string[]): string[] {
  return args.includes('--refresh-baseline')
    ? [...args]
    : ['--refresh-baseline', ...args];
}

/**
 * Return `true` if the args contain `--help` or `-h`. Pulled out so the
 * help-surface is testable without invoking the real CLI dispatcher.
 */
export function wantsHelp(args: readonly string[]): boolean {
  return args.some((a) => a === '--help' || a === '-h');
}

/**
 * Programmatic entrypoint. Mirrors the other subcommand library APIs:
 * receive the dispatcher's argv, do any flag-level pre-processing, then
 * hand off to the underlying implementation. The handoff calls
 * `process.exit` from inside `checkClones`, matching the dispatcher's
 * contract (subcommand handlers exit the process).
 */
export async function main(args: readonly string[]): Promise<void> {
  if (wantsHelp(args)) {
    printHelp();
    process.exit(0);
  }
  await checkClones(forwardedArgs(args));
}
