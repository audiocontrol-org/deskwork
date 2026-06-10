/**
 * plugins/stack-control/src/scope-discovery/dispose-clone.ts
 *
 * Single-clone convenience wrapper around `batch-dispose`. The
 * operator-facing common case is "I want to mark THIS one clone group
 * as X with reason Y" — typing the full
 * `batch-dispose --ids <id> --disposition <D> --reason "<R>"` form is
 * boilerplate the wrapper hides.
 *
 * CLI shape:
 *   stackctl dispose-clone <id> --as <D> [--reason "<text>"] [...]
 *
 * Dispositions supported via --as:
 *   - keep-with-reason
 *   - ignore-with-justification
 *   - refactor (gated — requires Step 0a + 0b precondition flags; the
 *     wrapper does NOT apply refactor through batch-dispose, since
 *     refactor entries carry five additional fields that the simple
 *     `--reason "<text>"` shape cannot express. The wrapper refuses
 *     with an actionable error directing the operator to manual
 *     editing + `stackctl check-refactor-preconditions` for
 *     validation.)
 *
 * Refactor gate: when `--as refactor`, the wrapper requires:
 *   --canonical-side <existing|new>
 *   --canonical-reason "<text>"
 *   --tests <comma-separated paths>
 *   --tests-proof-sha <sha7+>
 *   --tests-proof-demonstration "<text>"
 *
 * Even with all of those present, the wrapper still refuses to write
 * (since batch-dispose's contract excludes refactor). The flag presence
 * is a forcing function — the operator who tries `--as refactor` sees
 * the full precondition surface in the error message and knows exactly
 * what they're committing to in clones.yaml. This matches the
 * "Operator owns scope decisions" rule and the
 * `agent-discipline.md` "Just for now" rule: the wrapper does not
 * silently degrade to keep-with-reason, and it does not stub a
 * partial-refactor write.
 *
 * Other dispositions (keep-with-reason, ignore-with-justification) pass
 * through to `batch-dispose` via `runBatchDispose` (a single-id list).
 *
 * Exit codes mirror batch-dispose's:
 *   0  applied + verified.
 *   1  wrote but verify-after-write detected a mismatch.
 *   2  invalid args, refactor refusal, missing clones.yaml, unknown id.
 */

import { runBatchDispose, type BatchDisposeResult } from './batch-dispose.js';
import { errorMessage } from './util/typeguards.js';

const SUPPORTED_DISPOSITIONS = [
  'keep-with-reason',
  'ignore-with-justification',
  'refactor',
] as const;

type SupportedDisposition = (typeof SUPPORTED_DISPOSITIONS)[number];

function isSupportedDisposition(v: string): v is SupportedDisposition {
  return (SUPPORTED_DISPOSITIONS as readonly string[]).includes(v);
}

export interface ParsedArgs {
  readonly id: string;
  readonly disposition: SupportedDisposition;
  readonly reason: string | null;
  /** Pass-through to batch-dispose. */
  readonly clonesPath: string | null;
  /** Pass-through to batch-dispose. */
  readonly dryRun: boolean;
  /** Step 0a / 0b precondition flags (only relevant when disposition === 'refactor'). */
  readonly canonicalSide: string | null;
  readonly canonicalReason: string | null;
  readonly newShapeSummary: string | null;
  readonly tests: string | null;
  readonly testsProofSha: string | null;
  readonly testsProofDemonstration: string | null;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let id: string | null = null;
  let disposition: string | null = null;
  let reason: string | null = null;
  let clonesPath: string | null = null;
  let dryRun = false;
  let canonicalSide: string | null = null;
  let canonicalReason: string | null = null;
  let newShapeSummary: string | null = null;
  let tests: string | null = null;
  let testsProofSha: string | null = null;
  let testsProofDemonstration: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (!arg.startsWith('--')) {
      if (id !== null) {
        throw new Error(`positional id already set ("${id}"); got extra "${arg}"`);
      }
      id = arg;
      continue;
    }
    switch (arg) {
      case '--as': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--as requires a value');
        disposition = next;
        i += 1;
        break;
      }
      case '--reason': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--reason requires a value');
        reason = next;
        i += 1;
        break;
      }
      case '--clones': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--clones requires a path');
        clonesPath = next;
        i += 1;
        break;
      }
      case '--dry-run':
        dryRun = true;
        break;
      case '--canonical-side': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--canonical-side requires a value');
        canonicalSide = next;
        i += 1;
        break;
      }
      case '--canonical-reason': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--canonical-reason requires a value');
        canonicalReason = next;
        i += 1;
        break;
      }
      case '--new-shape-summary': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--new-shape-summary requires a value');
        newShapeSummary = next;
        i += 1;
        break;
      }
      case '--tests': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--tests requires a value');
        tests = next;
        i += 1;
        break;
      }
      case '--tests-proof-sha': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--tests-proof-sha requires a value');
        testsProofSha = next;
        i += 1;
        break;
      }
      case '--tests-proof-demonstration': {
        const next = argv[i + 1];
        if (next === undefined) {
          throw new Error('--tests-proof-demonstration requires a value');
        }
        testsProofDemonstration = next;
        i += 1;
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown flag: ${arg}`);
    }
  }
  if (id === null) {
    throw new Error('dispose-clone requires a positional <id> argument');
  }
  if (disposition === null) {
    throw new Error(
      `--as <kind> is required; one of: ${SUPPORTED_DISPOSITIONS.join(', ')}`,
    );
  }
  if (!isSupportedDisposition(disposition)) {
    throw new Error(
      `--as must be one of: ${SUPPORTED_DISPOSITIONS.join(', ')} ` +
        `(got "${disposition}")`,
    );
  }
  return {
    id,
    disposition,
    reason,
    clonesPath,
    dryRun,
    canonicalSide,
    canonicalReason,
    newShapeSummary,
    tests,
    testsProofSha,
    testsProofDemonstration,
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl dispose-clone <id> --as <kind> [options]',
      '',
      'Single-clone wrapper around batch-dispose. Mark one clone group',
      'with a disposition + reason.',
      '',
      'Dispositions:',
      '  --as keep-with-reason       Keep the clones; intentional parity.',
      '  --as ignore-with-justification  Ignore; not worth tracking.',
      '  --as refactor               GATED — requires all Step 0a+0b',
      '                              precondition flags AND manual editing.',
      '                              The wrapper refuses to apply refactor',
      '                              dispositions (they need 5 fields that',
      '                              do not fit a single --reason).',
      '',
      'Options:',
      '  --reason "<text>"           Required for keep-with-reason +',
      '                              ignore-with-justification.',
      '  --clones <path>             Override the per-codebase clones.yaml path.',
      '  --dry-run                   Plan only; do not write.',
      '',
      'Refactor precondition flags (required if --as refactor):',
      '  --canonical-side <existing|new>',
      '  --canonical-reason "<text>"',
      '  --new-shape-summary "<text>"   (only when --canonical-side new)',
      '  --tests <comma-separated paths>',
      '  --tests-proof-sha <sha7+>',
      '  --tests-proof-demonstration "<text>"',
      '',
      'Exit codes: 0 applied + verified, 1 verify-after-write mismatch,',
      '            2 invalid args / refactor refusal / unknown id.',
      '',
    ].join('\n'),
  );
}

/**
 * Enumerate which Step 0a/0b precondition flags are missing for a
 * refactor disposition. Returned as a list of flag names (with the
 * `--` prefix) so the error message can be assembled by the caller.
 */
function missingRefactorFlags(args: ParsedArgs): string[] {
  const missing: string[] = [];
  if (args.canonicalSide === null) missing.push('--canonical-side');
  if (args.canonicalReason === null) missing.push('--canonical-reason');
  if (args.tests === null) missing.push('--tests');
  if (args.testsProofSha === null) missing.push('--tests-proof-sha');
  if (args.testsProofDemonstration === null) {
    missing.push('--tests-proof-demonstration');
  }
  // --new-shape-summary is conditionally required (canonical_side === 'new')
  // per clones-yaml.refactor.ts. The wrapper surfaces that constraint when
  // canonical-side is known to be 'new'; otherwise it is optional.
  if (args.canonicalSide === 'new' && args.newShapeSummary === null) {
    missing.push('--new-shape-summary');
  }
  return missing;
}

const REFACTOR_MANUAL_EDIT_GUIDANCE =
  'dispose-clone: refactor dispositions cannot be applied via this CLI. ' +
  'Refactor entries carry 5 precondition fields (canonical_side, ' +
  'canonical_reason, [new_shape_summary], tests, tests_proof) that do ' +
  'not fit a single --reason. Edit clones.yaml manually then verify with ' +
  '`stackctl check-refactor-preconditions`.';

export interface MainResult {
  readonly code: 0 | 1 | 2;
  /** Set when we delegated to batch-dispose. */
  readonly batchResult?: BatchDisposeResult;
}

/**
 * Programmatic entrypoint. Parses args, applies the refactor gate, then
 * dispatches to runBatchDispose for keep-with-reason /
 * ignore-with-justification. Returns the MainResult; the dispatch shim
 * is responsible for process.exit.
 */
export async function main(argv: readonly string[]): Promise<MainResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`dispose-clone: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  if (args.disposition === 'refactor') {
    const missing = missingRefactorFlags(args);
    if (missing.length > 0) {
      process.stderr.write(
        `dispose-clone: --as refactor requires Step 0a/0b precondition flags. ` +
          `Missing: ${missing.join(', ')}\n` +
          `  See \`stackctl dispose-clone --help\` for the full list.\n` +
          `  See \`stackctl check-refactor-preconditions\` to validate ` +
          `the entry after editing clones.yaml.\n`,
      );
      return { code: 2 };
    }
    // All Step 0a/0b flags present — but refactor still can't be applied
    // via batch-dispose (intentional contract). Redirect to manual editing
    // with an actionable message; the flags-present case still exits 2
    // because the wrapper did not perform the requested operation.
    process.stderr.write(`${REFACTOR_MANUAL_EDIT_GUIDANCE}\n`);
    return { code: 2 };
  }
  if (args.reason === null || args.reason.length === 0) {
    process.stderr.write(
      `dispose-clone: --reason "<text>" is required for ${args.disposition}.\n`,
    );
    return { code: 2 };
  }
  // Pass-through to batch-dispose with a single-id list.
  const forwarded: string[] = [
    '--ids',
    args.id,
    '--disposition',
    args.disposition,
    '--reason',
    args.reason,
  ];
  if (args.clonesPath !== null) forwarded.push('--clones', args.clonesPath);
  if (args.dryRun) forwarded.push('--dry-run');
  const result = await runBatchDispose(forwarded);
  if (result.code === 0 || result.code === 1 || result.code === 2) {
    return { code: result.code, batchResult: result };
  }
  // Defensive: runBatchDispose's documented codes are 0/1/2 only; any
  // other value is a bug, surface it loudly.
  process.stderr.write(
    `dispose-clone: unexpected exit code from batch-dispose: ${result.code}\n`,
  );
  return { code: 2, batchResult: result };
}
