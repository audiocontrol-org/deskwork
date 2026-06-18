// `roadmap` mounted as a `commander` Command (027 T004; research Decision 1).
//
// This is the live dispatch path for `stackctl roadmap …`. It is the FIRST verb
// migrated onto the parser library; every other top-level verb stays on the flat
// `SUBCOMMANDS` dispatcher unchanged (FR-006 non-regression). The mount reuses
// the existing execution core in roadmap.ts (`executeRoadmapSubaction` + the
// emit*/query functions) — no mutation/query behavior is reimplemented here.
//
// Exit-code fidelity (the hard part): the existing dispatcher returns exit 2 for
// every usage/parse/validation/unknown-subaction/unknown-flag/missing-positional
// error, and maps InstallationError/DocumentModelError/BacklogError through
// `executeRoadmapSubaction`. commander defaults parse errors to exit 1 and owns
// `--help`; both are overridden here:
//   - `exitOverride()` turns commander's parse failures into a `CommanderError`
//     we map to exit 2 (or exit 0 for an explicit help display) — never letting
//     commander call `process.exit` with its own code.
//   - the built-in `--help`/`-h` option is DISABLED (`helpOption(false)`) on the
//     parent and every sub-command, so `--help` is an unknown option → exit 2,
//     matching today's behavior. The rich self-documenting help surface is
//     Phase 3 (T006–T009), explicitly NOT built here.
//   - the AUDIT-hardened forgot-value guard (a `--<value-flag>` immediately
//     followed by a recognized flag → exit 2, AUDIT-20260608-04) that commander's
//     parser does NOT replicate is preserved by running `preflightRoadmapFlags`
//     (the shared scanner + grammar validation) on the raw subaction args before
//     dispatch.
//
// The typed parser-adapter (command-adapter.ts) is the only place commander's
// `any`-typed options cross into handler code: each action reads the parsed
// options through `rawOpts` + the scalar readers into the existing typed `Flags`
// shape — zero `as`/`any`/`@ts-ignore` (Constitution Principle VI; CHK024).

import { Command, CommanderError } from 'commander';
import { booleanOption, optionalStringOption, rawOpts, stringOption } from '../cli-help/command-adapter.js';
import {
  executeRoadmapSubaction,
  preflightRoadmapFlags,
  SUBACTION_SPECS,
  NO_DOC,
  type Flags,
} from './roadmap.js';

/** Build the `Flags` shape the execution core consumes from a sub-command's
 * parsed options, read through the typed adapter (no `any`). `--doc` absent maps
 * to the `NO_DOC` sentinel so installation resolution behaves identically to the
 * flat path. */
function flagsFromCommand(command: Command, positionals: readonly string[]): Flags {
  const raw = rawOpts(command);
  const values = new Map<string, string>();
  for (const name of Object.keys(raw)) {
    if (name === 'doc' || name === 'apply' || name === 'clear') continue;
    const value = optionalStringOption(raw[name], name);
    if (value !== undefined) values.set(name, value);
  }
  const doc = optionalStringOption(raw.doc, 'doc');
  return {
    doc: doc === undefined ? NO_DOC : doc,
    apply: booleanOption(raw.apply, 'apply'),
    clear: booleanOption(raw.clear, 'clear'),
    positionals,
    values,
  };
}

/** commander uses camelCase option keys (`--depends-on` → `dependsOn`); the
 * execution core's value-flag names are the dashed forms. This maps a parsed
 * camelCase key back to the dashed flag name the emit* functions read. */
const CAMEL_TO_DASHED: Readonly<Record<string, string>> = {
  dependsOn: 'depends-on',
  partOf: 'part-of',
  deferredUntil: 'deferred-until',
};

/** Re-key the parsed value map from commander's camelCase to the dashed names. */
function dashedFlags(flags: Flags): Flags {
  const values = new Map<string, string>();
  for (const [name, value] of flags.values) {
    values.set(CAMEL_TO_DASHED[name] ?? name, value);
  }
  return { ...flags, values };
}

/** Register one subaction sub-command, declaring its value-flags + boolean flags
 * + positional arity from the single-sourced grammar, and wiring the action to
 * the shared execution core via the typed adapter. */
function registerSubaction(parent: Command, name: string): void {
  const grammar = SUBACTION_SPECS[name];
  if (grammar === undefined) {
    throw new Error(`roadmap-command: no grammar for subaction '${name}' (registry drift)`);
  }
  const sub = parent.command(name).helpOption(false).allowExcessArguments(false);
  // Positional arity: each subaction that takes a positional consumes exactly one
  // `<identifier>`; declare it optional so a missing positional flows to the
  // existing `requireId`/`addInputFrom` exit-2 message rather than commander's.
  if (grammar.positionals >= 1) sub.argument('[identifier]');
  for (const flag of grammar.valueFlags) sub.option(`--${flag} <value>`);
  if (grammar.apply) sub.option('--apply', 'write the change (default: dry-run)');
  if (grammar.clear === true) sub.option('--clear', 'clear the condition');
  sub.action(async function (this: Command) {
    // Preserve the AUDIT-hardened forgot-value + grammar guards on the raw args
    // (the slice after the subaction token). `this.args` holds the operands;
    // for the full hardened scan we re-derive from the parent's parsed argv.
    const subActionArgs = rawSubactionArgs;
    preflightRoadmapFlags(name, subActionArgs);
    const flags = dashedFlags(flagsFromCommand(this, this.args));
    await executeRoadmapSubaction(name, flags);
  });
}

// commander's action callback does not receive the raw argv slice for the
// subaction; `runRoadmapCommand` records it here for the preflight guard. Set
// immediately before `parse`, read synchronously at action entry.
let rawSubactionArgs: readonly string[] = [];

/** Build the `roadmap` commander Command (exported for T003's mount assertions). */
export function buildRoadmapCommand(): Command {
  const program = new Command('roadmap');
  program.exitOverride();
  program.helpOption(false);
  // `--doc` is universal: declared on the parent so it is accepted on every
  // subaction and read via `optsWithGlobals()` (the adapter's `rawOpts`).
  program.option('--doc <path>', 'roadmap document path (default: resolve through the installation)');
  for (const name of Object.keys(SUBACTION_SPECS)) registerSubaction(program, name);
  return program;
}

/** Map a commander parse failure to the project's exit-code contract. */
function exitForCommanderError(err: CommanderError): never {
  // An explicit help display (should not occur — help is disabled — but a
  // sub-command help-on-no-args could surface it) is exit 0.
  if (err.code === 'commander.helpDisplayed') process.exit(0);
  // Every other parse/usage failure (unknown command/option, missing/excess
  // argument, option-argument missing, no-subaction help) is a usage error → 2.
  process.exit(2);
}

/** Live entry point for `stackctl roadmap …` (dispatched from cli.ts). */
export async function runRoadmapCommand(args: string[]): Promise<void> {
  const subaction = args[0];
  // No subaction (or a leading flag, e.g. `roadmap --doc x`) is a usage error —
  // exit 2 with the full subaction list, matching the flat path exactly. The rich
  // help surface (a clean COMPLETE-list render) is Phase 3.
  if (subaction === undefined || subaction.startsWith('--')) {
    process.stderr.write(
      'roadmap: a subaction is required (usage: roadmap <next|blocked|add> [flags])\n',
    );
    process.exit(2);
  }
  rawSubactionArgs = args.slice(1);
  const program = buildRoadmapCommand();
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (err) {
    if (err instanceof CommanderError) exitForCommanderError(err);
    throw err; // unexpected → top-level dispatcher exits 1
  }
}
