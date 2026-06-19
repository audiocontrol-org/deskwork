// Generic grammar -> help-only commander Command builder (028 US1, T015+; FR-003).
//
// Many verbs (backlog, inbox, …) describe their sub-actions with the SAME
// `SubactionGrammar` shape roadmap uses (src/subcommands/document-verb-shared.ts):
// per-sub-action value-flags + apply/clear/chain + positional arity. This builder
// turns one such grammar into a HELP-ONLY commander Command (sub-commands with
// descriptions, options, positionals — no action wired) that `buildCommandSurface`
// walks like any other. Execution stays on the flat `SUBCOMMANDS` dispatcher; this
// Command exists only so the command SURFACE (help / verb reference / registry)
// derives from the same grammar the parser enforces — non-drift.

import { Command } from 'commander';
import type { SubactionGrammar } from '../subcommands/document-verb-shared.js';

/** Inputs to describe one grammar-based verb's help surface. */
export interface GrammarSurfaceSpec {
  readonly verb: string;
  readonly description: string;
  /** The verb's per-sub-action grammar (the same const its parser validates against). */
  readonly specs: Readonly<Record<string, SubactionGrammar>>;
  /** One-line summary per sub-action (required — the completeness guard enforces it). */
  readonly summaries: Readonly<Record<string, string>>;
  /** Optional description per value-flag / `--apply`; absent → empty (filled later). */
  readonly flagDescriptions?: Readonly<Record<string, string>>;
  /** Whether the verb accepts a universal `--doc <path>` (document-model verbs). */
  readonly hasDoc?: boolean;
  /** The positional placeholder name a sub-action with arity ≥ 1 takes (default 'identifier'). */
  readonly positionalName?: string;
}

/** Build a help-only commander Command from a verb's sub-action grammar. */
export function buildGrammarSurfaceCommand(spec: GrammarSurfaceSpec): Command {
  const program = new Command(spec.verb).description(spec.description).helpOption(false);
  if (spec.hasDoc === true) {
    program.option('--doc <path>', spec.flagDescriptions?.doc ?? 'document path (default: resolve through the installation)');
  }
  const positionalName = spec.positionalName ?? 'identifier';
  for (const [name, grammar] of Object.entries(spec.specs)) {
    const summary = spec.summaries[name];
    if (summary === undefined) {
      throw new Error(`surface-builder: ${spec.verb} sub-action '${name}' has no summary (declare it in summaries)`);
    }
    const sub = program.command(name).description(summary).helpOption(false);
    // These grammar verbs require their positional when one is declared (the
    // handler validates it); a help-only command can declare it required directly.
    if (grammar.positionals >= 1) {
      sub.argument(grammar.unboundedPositionals === true ? `<${positionalName}...>` : `<${positionalName}>`);
    }
    for (const flag of grammar.valueFlags) {
      sub.option(`--${flag} <value>`, spec.flagDescriptions?.[flag] ?? '');
    }
    if (grammar.apply) sub.option('--apply', spec.flagDescriptions?.apply ?? 'write the change (default: dry-run)');
    if (grammar.clear === true) sub.option('--clear', 'clear the condition');
    if (grammar.chain === true) sub.option('--chain', 'wire a depends-on chain over the children');
  }
  return program;
}
