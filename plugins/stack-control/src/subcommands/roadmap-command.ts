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
//   - the built-in `--help`/`-h` option stays DISABLED on commander
//     (`helpOption(false)`) — but `--help`/`-h` is now INTERCEPTED before parse
//     (027 US1, T009) and rendered from the single grammar-derived help source
//     (cli-help/roadmap-help.ts) at exit 0. This intentionally CHANGES the
//     Phase-2 behavior (`roadmap --help` → exit 2 unknown-flag): US1's contract
//     is a self-documenting surface (FR-001/002/003/004). The subaction
//     behavior (parse/usage exit-2 shapes) stays byte-identical (FR-006).
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
  renderRoadmapHelp,
  renderRoadmapUsage,
  renderSubactionHelp,
  summaryFor,
} from '../cli-help/roadmap-help.js';
import {
  executeRoadmapSubaction,
  preflightRoadmapFlags,
  SUBACTION_SPECS,
  KNOWN_SUBACTIONS,
  NO_DOC,
  type Flags,
} from './roadmap.js';

/** Whether an argv token is a help request (`--help`/`-h`). */
function isHelpFlag(token: string): boolean {
  return token === '--help' || token === '-h';
}

/** Build the `Flags` shape the execution core consumes from a sub-command's
 * parsed options, read through the typed adapter (no `any`). `--doc` absent maps
 * to the `NO_DOC` sentinel so installation resolution behaves identically to the
 * flat path. */
function flagsFromCommand(command: Command, positionals: readonly string[]): Flags {
  const raw = rawOpts(command);
  const values = new Map<string, string>();
  for (const name of Object.keys(raw)) {
    if (
      name === 'doc' ||
      name === 'apply' ||
      name === 'clear' ||
      name === 'chain' ||
      name === 'analyzeClean' ||
      name === 'cascade'
    ) {
      continue;
    }
    const value = optionalStringOption(raw[name], name);
    if (value !== undefined) values.set(name, value);
  }
  const doc = optionalStringOption(raw.doc, 'doc');
  return {
    doc: doc === undefined ? NO_DOC : doc,
    apply: booleanOption(raw.apply, 'apply'),
    clear: booleanOption(raw.clear, 'clear'),
    chain: booleanOption(raw.chain, 'chain'),
    analyzeClean: booleanOption(raw.analyzeClean, 'analyzeClean'),
    cascade: booleanOption(raw.cascade, 'cascade'),
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
  const sub = parent
    .command(name)
    .description(summaryFor(name))
    .helpOption(false)
    .allowExcessArguments(false);
  // Positional arity: each subaction that takes a positional consumes exactly one
  // `<identifier>`; declare it optional so a missing positional flows to the
  // existing `requireId`/`addInputFrom` exit-2 message rather than commander's.
  if (grammar.positionals >= 1) sub.argument('[identifier]');
  for (const flag of grammar.valueFlags) sub.option(`--${flag} <value>`);
  if (grammar.apply) sub.option('--apply', 'write the change (default: dry-run)');
  if (grammar.clear === true) sub.option('--clear', 'clear the condition');
  if (grammar.chain === true) sub.option('--chain', 'wire a depends-on chain over the children');
  if (grammar.analyzeClean === true) {
    sub.option('--analyze-clean', 'record the symmetric analyze-clean marker');
  }
  if (grammar.cascade === true) {
    sub.option('--cascade', 'close the whole part-of subtree (transitive close)');
  }
  sub.action(async function (this: Command) {
    // Flags were already validated by `preflightRoadmapFlags` in
    // `runRoadmapCommand` (BEFORE commander parse, so usage errors keep the
    // `roadmap: …` message shape). This action only reads the typed options for
    // dispatch.
    const flags = dashedFlags(flagsFromCommand(this, this.args));
    await executeRoadmapSubaction(name, flags);
  });
}

/** Build the `roadmap` commander Command (exported for T003's mount assertions). */
export function buildRoadmapCommand(): Command {
  const program = new Command('roadmap');
  program.description(
    'Governed-roadmap mutation and query verbs (next/blocked/order/graph + add/advance/decompose/defer/cluster).',
  );
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
  // `roadmap --help` / `roadmap -h` (or any leading help flag) → the
  // self-documenting subaction listing at exit 0 (027 US1, FR-002 — the
  // intentional change from Phase 2's exit-2 unknown-flag behavior).
  if (subaction !== undefined && isHelpFlag(subaction)) {
    process.stdout.write(renderRoadmapHelp());
    process.exit(0);
  }
  // No subaction (or some other leading flag, e.g. `roadmap --doc x`) is a usage
  // error — exit 2 with the COMPLETE subaction set on stderr (027 US1, FR-003 —
  // the truncated `<next|blocked|add>` of Phase 2 is replaced).
  if (subaction === undefined || subaction.startsWith('--')) {
    process.stderr.write(`${renderRoadmapUsage()}\n`);
    process.exit(2);
  }
  // Unknown-subaction + flag/arity validation run BEFORE commander parse so usage
  // errors keep the flat path's `roadmap: …` message shape — including the
  // known-subaction discovery list — rather than leaking commander's own
  // `error: unknown command …` / `unknown option …` diagnostics (FR-006
  // non-regression; AUDIT-BARRAGE-codex-01, Phase 2). These mirror the flat
  // runRoadmapCli guards exactly (the unknown-subaction message is single-sourced
  // with that path's literal).
  if (SUBACTION_SPECS[subaction] === undefined) {
    process.stderr.write(
      `roadmap: unknown subaction '${subaction}' (known: ${KNOWN_SUBACTIONS})\n`,
    );
    process.exit(2);
  }
  // `roadmap <subaction> --help` / `-h` → that subaction's flags + value
  // vocabularies at exit 0 (027 US1, FR-004). Rendered before preflight so a help
  // request never trips the flag/arity validation (a help-with-flags request is
  // still help, not a parse of those flags).
  if (args.slice(1).some(isHelpFlag)) {
    process.stdout.write(renderSubactionHelp(subaction));
    process.exit(0);
  }
  preflightRoadmapFlags(subaction, args.slice(1));
  const program = buildRoadmapCommand();
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (err) {
    if (err instanceof CommanderError) exitForCommanderError(err);
    throw err; // unexpected → top-level dispatcher exits 1
  }
}
