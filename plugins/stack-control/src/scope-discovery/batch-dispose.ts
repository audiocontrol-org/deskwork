/**
 * plugins/stack-control/src/scope-discovery/batch-dispose.ts
 *
 * Operator CLI: apply a single (disposition, reason) to N clone-group
 * ids at once.
 *
 * CLI flags:
 *   --ids <id1,id2,...>      required, comma-separated content-hashed ids
 *   --disposition <kind>     required; one of pending,
 *                             keep-with-reason, ignore-with-justification.
 *                             `refactor` is REJECTED — refactor entries
 *                             carry five precondition fields (canonical_side,
 *                             canonical_reason, [new_shape_summary], tests,
 *                             tests_proof) that don't fit a single --reason
 *                             text; the CLI prints an actionable redirect
 *                             to manual editing + the validate target.
 *   --reason "<text>"        required; applied to every id in --ids.
 *   --show-existing          opt-in; for ids that are ALREADY non-pending,
 *                             print the existing disposition + reason
 *                             (we never overwrite a non-pending entry).
 *   --clones <path>          override the per-codebase clones.yaml path.
 *   --dry-run                load, plan, summarize; skip write + verify.
 *
 * Baseline resolution (010 generalization): the default clones.yaml is
 * PER-CODEBASE — the nearest-enclosing stack-control installation's
 * `.stack-control/scope-discovery/clones.yaml`, resolved via
 * `resolveBaselinePath`. `--clones` overrides (resolved relative to the
 * installation root). No cwd-relative `.dw-lifecycle` default.
 *
 * Exit codes:
 *   0  applied + verified (or no APPLY work to do).
 *   1  wrote but verify-after-write detected a mismatch (the failure mode
 *      this task exists to prevent — never silent).
 *   2  invalid args, missing/malformed clones.yaml, or any unknown id.
 *
 * Unknown ids fail HARD (exit 2) — silent-skipping a typoed id would let
 * the typo slip through. The unknown-id error message cites the
 * `stackctl check-clones --refresh-baseline` prereq so the operator's
 * recovery path is obvious.
 *
 * DRY: reuses `parseClonesYaml`, `serializeClonesYaml`, and the
 * `Disposition` / `CloneGroup` types from `clones-yaml.ts`. No
 * hand-rolled YAML.
 */

import { type Disposition } from './clones-yaml.js';
import { resolveBaselinePath } from './baseline-path.js';
import { errorMessage } from './util/typeguards.js';
import {
  type BatchDisposeIO,
  type BatchDisposeResult,
  type IdPlan,
  applyDispositions,
  classify,
  emptyResult,
  loadClones,
  printDryRun,
  printSkipMessages,
  serializeClonesYaml,
  summarize,
  verifyAfterWrite,
} from './batch-dispose-apply.js';
import { readFile, writeFile } from 'node:fs/promises';

export type { BatchDisposeIO, BatchDisposeResult } from './batch-dispose-apply.js';

/**
 * Dispositions a controller can apply via this CLI. `refactor` is
 * intentionally excluded — refactor entries require the five
 * precondition fields that don't fit a single --reason. The constant
 * doubles as the source-of-truth for the error-message enumeration.
 */
export const APPLYABLE_DISPOSITIONS: ReadonlyArray<
  Exclude<Disposition, 'refactor'>
> = ['pending', 'keep-with-reason', 'ignore-with-justification'];

function isApplyableDisposition(
  v: string,
): v is Exclude<Disposition, 'refactor'> {
  return (APPLYABLE_DISPOSITIONS as readonly string[]).includes(v);
}

interface ParsedArgs {
  readonly ids: readonly string[];
  readonly disposition: Exclude<Disposition, 'refactor'>;
  readonly reason: string;
  readonly showExisting: boolean;
  /** `--clones` override; null = use the per-codebase default. */
  readonly clonesPath: string | null;
  readonly dryRun: boolean;
}

/**
 * CLI argument parser. Throws on missing required arg, unknown flag,
 * empty --ids, invalid --disposition, or --disposition refactor. The
 * caller catches and exits 2.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let idsRaw: string | null = null;
  let dispositionRaw: string | null = null;
  let reason: string | null = null;
  let showExisting = false;
  let clonesPath: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ids') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--ids requires a value`);
      idsRaw = next;
      i += 1;
    } else if (arg === '--disposition') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--disposition requires a value`);
      dispositionRaw = next;
      i += 1;
    } else if (arg === '--reason') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--reason requires a value`);
      reason = next;
      i += 1;
    } else if (arg === '--clones') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--clones requires a path value`);
      clonesPath = next;
      i += 1;
    } else if (arg === '--show-existing') {
      showExisting = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  if (idsRaw === null) {
    throw new Error(`--ids <id1,id2,...> is required`);
  }
  const ids = idsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) {
    throw new Error(`--ids must contain at least one id (got empty list)`);
  }
  if (dispositionRaw === null) {
    throw new Error(
      `--disposition <kind> is required; one of: ${APPLYABLE_DISPOSITIONS.join(', ')}`,
    );
  }
  if (dispositionRaw === 'refactor') {
    throw new Error(
      `refactor dispositions require manual editing (canonical_side, ` +
        `tests, tests_proof). Use a text editor + ` +
        `\`stackctl check-refactor-preconditions\` to verify.`,
    );
  }
  if (!isApplyableDisposition(dispositionRaw)) {
    throw new Error(
      `--disposition must be one of: ${APPLYABLE_DISPOSITIONS.join(', ')} ` +
        `(got "${dispositionRaw}")`,
    );
  }
  if (reason === null) {
    throw new Error(`--reason "<text>" is required`);
  }
  if (reason.length === 0) {
    throw new Error(`--reason must be non-empty`);
  }
  return {
    ids,
    disposition: dispositionRaw,
    reason,
    showExisting,
    clonesPath,
    dryRun,
  };
}

const DEFAULT_IO: BatchDisposeIO = {
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, contents) => writeFile(path, contents, 'utf8'),
  stdout: (line) => process.stdout.write(line),
  stderr: (line) => process.stderr.write(line),
};

/**
 * Programmatic entrypoint. Exported so the adversarial validator can
 * drive it without spawning a subprocess. `cwd` is injectable for tests;
 * defaults to `process.cwd()` and is used only to resolve the
 * per-codebase clones.yaml when `--clones` is absent.
 */
export async function runBatchDispose(
  argv: readonly string[],
  io: BatchDisposeIO = DEFAULT_IO,
  cwd: string = process.cwd(),
): Promise<BatchDisposeResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    io.stderr(`error: ${errorMessage(err)}\n`);
    return emptyResult(2);
  }
  let absPath: string;
  try {
    absPath = resolveBaselinePath({ startDir: cwd, override: args.clonesPath });
  } catch (err) {
    io.stderr(`error: ${errorMessage(err)}\n`);
    return emptyResult(2);
  }
  const displayPath = args.clonesPath ?? absPath;
  let doc;
  try {
    doc = await loadClones(absPath, io);
  } catch (err) {
    io.stderr(`error: ${errorMessage(err)}\n`);
    return emptyResult(2);
  }
  const plan = classify(doc.clones, args.ids);
  const unknownIds = plan.filter((p) => p.kind === 'unknown').map((p) => p.id);
  if (unknownIds.length > 0) {
    // The unknown-id error cites the refresh-baseline prereq so the
    // operator's recovery path is obvious. `stackctl check-clones
    // --refresh-baseline` is the supported way to add detected groups as
    // `pending` to the baseline before batch-dispose can act on them.
    const subject = unknownIds.length === 1 ? 'id' : 'ids';
    io.stderr(
      `error: batch-dispose: ${subject} ${unknownIds.join(', ')} not in ${displayPath}; ` +
        `run \`stackctl check-clones --refresh-baseline\` first to add ${unknownIds.length === 1 ? 'it' : 'them'} as pending, ` +
        `then re-run this command.\n`,
    );
    return {
      code: 2,
      applied: [],
      skipped: [],
      unknown: unknownIds,
      verified: false,
    };
  }
  printSkipMessages(plan, args, io);
  const applyPlans = plan.filter(
    (p): p is Extract<IdPlan, { kind: 'apply' }> => p.kind === 'apply',
  );
  const appliedIds = applyPlans.map((p) => p.id);
  const skippedIds = plan
    .filter((p): p is Extract<IdPlan, { kind: 'skip' }> => p.kind === 'skip')
    .map((p) => p.id);
  if (args.dryRun) {
    printDryRun(applyPlans, args, io);
    return summarize(
      { code: 0, applied: appliedIds, skipped: skippedIds, unknown: [], verified: false },
      io,
      args,
    );
  }
  if (applyPlans.length === 0) {
    return summarize(
      { code: 0, applied: [], skipped: skippedIds, unknown: [], verified: true },
      io,
      args,
    );
  }
  const updated = applyDispositions(doc, applyPlans, args);
  try {
    await io.writeFile(absPath, serializeClonesYaml(updated));
  } catch (err) {
    io.stderr(`error: write failed: ${errorMessage(err)}\n`);
    return {
      code: 1,
      applied: appliedIds,
      skipped: skippedIds,
      unknown: [],
      verified: false,
    };
  }
  const verified = await verifyAfterWrite(absPath, applyPlans, args, io);
  return summarize(
    {
      code: verified ? 0 : 1,
      applied: appliedIds,
      skipped: skippedIds,
      unknown: [],
      verified,
    },
    io,
    args,
  );
}

/**
 * Subcommand handler shape matching the rest of stack-control's CLI
 * dispatcher: takes args[], awaits the work, then process.exits with
 * the numeric result code.
 */
export async function main(args: string[]): Promise<void> {
  const result = await runBatchDispose(args);
  process.exit(result.code);
}
