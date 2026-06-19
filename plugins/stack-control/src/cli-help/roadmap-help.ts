// Self-documenting `roadmap` help surface (027 US1, T008) — the single source
// that renders `roadmap --help`, the no-subaction usage line, and each
// subaction's `roadmap <sub> --help`. The FLAG facts come from `SUBACTION_SPECS`
// (the same grammar the parser enforces — non-drift, FR-005); only the one-line
// SUMMARIES and the VALUE-VOCABULARY surfacing live here, alongside a
// completeness guard that fails loud if a registered subaction lacks a summary.
//
// The status vocabulary surfaced on `advance`/`add` is NOT hardcoded: it is
// resolved from the governed `roadmap` grammar artifact (`grammars/roadmap.peg`'s
// `statusVocabulary:`), respecting a project override the same way a real doc
// load would (FR-004; data-model § VerbCommandDefinition). Help never needs a
// resolved installation OR a roadmap document — it resolves the grammar by ref.

import { resolveGrammar } from '../document-model/grammar-resolver.js';
import { grammarDirs } from '../subcommands/document-verb-shared.js';
import { SUBACTION_SPECS, type Flags } from '../subcommands/roadmap.js';
import type { SubactionGrammar } from '../subcommands/document-verb-shared.js';

/** A minimal document source whose only job is to carry the `roadmap` grammar
 * ref, so `resolveGrammar` finds `roadmap.peg` (embedded → override → built-in)
 * exactly as a real roadmap document would — single-sourcing the vocabulary. */
const ROADMAP_GRAMMAR_REF_SOURCE = ['---', 'doc-grammar: roadmap', '---', ''].join('\n');

/**
 * The status vocabulary the `advance`/`add` help surfaces — sourced from the
 * resolved `roadmap` grammar (never hardcoded). Resolution respects the same
 * project-override → built-in precedence as a live doc load.
 */
export function roadmapStatusVocabulary(): readonly string[] {
  return resolveGrammar(ROADMAP_GRAMMAR_REF_SOURCE, grammarDirs()).statusVocabulary;
}

/**
 * One-line summaries for every registered subaction. Keyed by the SAME names as
 * `SUBACTION_SPECS`; `subactionSummaries()` guards completeness so a new
 * subaction without a summary fails loud rather than rendering a blank help row.
 */
const SUMMARIES: Readonly<Record<string, string>> = {
  next: 'list the ready (unblocked, non-deferred) items',
  blocked: 'list blocked items and the non-shipped dependency blocking each',
  blocks: 'list the items that depend on <identifier>',
  order: 'emit a dependency-respecting topological order',
  graph: 'emit a mermaid flowchart of the dependency graph',
  add: 'add a new roadmap item (dry-run unless --apply)',
  advance: 'change an item\'s status (dry-run unless --apply)',
  decompose: 'split an item into children, repointing dependents (dry-run unless --apply)',
  reclassify: 'rename an item\'s identifier (dry-run unless --apply)',
  defer: 'set or clear an item\'s deferred-until condition (dry-run unless --apply)',
  reconcile: 'report status drift, orphan spec dirs, and unresolved correspondences (report-only)',
  'close-related': 'close the backlog ids a terminal item resolves (dry-run unless --apply)',
};

/** The summary for a subaction, failing loud if a registered subaction has none
 * (the completeness guard that keeps SUMMARIES in lockstep with the grammar). */
export function summaryFor(subaction: string): string {
  const summary = SUMMARIES[subaction];
  if (summary === undefined) {
    throw new Error(`roadmap-help: no summary for registered subaction '${subaction}' (SUMMARIES drift)`);
  }
  return summary;
}

/** The complete subaction set, in registration order (the discovery order). */
export function subactionNames(): readonly string[] {
  return Object.keys(SUBACTION_SPECS);
}

/**
 * The exact set of flags a subaction's `--help` lists — derived from the grammar,
 * so the help text and the parser cannot drift (FR-005). Each entry is the flag's
 * long form (`--doc`, `--apply`, `--clear`, `--<value-flag>`). `--doc` is
 * universal (accepted on every subaction). This is THE non-drift source: both the
 * rendered help and the non-drift test consume it.
 */
export function flagNamesFor(grammar: SubactionGrammar): readonly string[] {
  const names = ['--doc'];
  for (const flag of grammar.valueFlags) names.push(`--${flag}`);
  if (grammar.apply) names.push('--apply');
  if (grammar.clear === true) names.push('--clear');
  return names;
}

/** The left-column token for a flag's help line (`--apply`, `--doc <path>`,
 * `--<value-flag> <value>`). The description column aligns to the widest such
 * token across the subaction's flag set. */
function flagToken(flag: string): string {
  if (flag === '--apply' || flag === '--clear') return flag;
  if (flag === '--doc') return '--doc <path>';
  return `${flag} <value>`;
}

/** Render one flag's help line; value-flags surface the status vocabulary on the
 * flags that accept a status (`advance --to`, `add --status`). `col` is the
 * description-column offset (the widest flag token + a 2-space gutter). */
function flagLine(
  flag: string,
  grammar: SubactionGrammar,
  statusVocab: readonly string[],
  col: number,
): string {
  const token = flagToken(flag);
  let desc: string;
  if (flag === '--doc') desc = 'roadmap document (default: resolve through the installation)';
  else if (flag === '--apply') desc = 'write the change (default: dry-run)';
  else if (flag === '--clear') desc = 'clear the condition';
  else {
    const isStatusFlag =
      (flag === '--to' && grammar === SUBACTION_SPECS.advance) || flag === '--status';
    desc = flag.slice(2) + (isStatusFlag ? ` (one of: ${statusVocab.join(', ')})` : '');
  }
  return `  ${token.padEnd(col)}  ${desc}`;
}

/** `roadmap --help` / `-h`: every subaction + a one-line summary. */
export function renderRoadmapHelp(): string {
  const names = subactionNames();
  const lines: string[] = [];
  lines.push('Usage: stackctl roadmap <subaction> [flags]');
  lines.push('');
  lines.push('Governed-roadmap mutation and query verbs. Run `roadmap <subaction> --help` for a subaction\'s flags.');
  lines.push('');
  lines.push('Subactions:');
  const width = Math.max(...names.map((n) => n.length));
  for (const name of names) {
    lines.push(`  ${name.padEnd(width)}  ${summaryFor(name)}`);
  }
  lines.push('');
  lines.push('Universal flag (accepted on every subaction):');
  lines.push('  --doc <path>  roadmap document (default: resolve through the installation)');
  lines.push('');
  return lines.join('\n');
}

/** The no-subaction usage line: enumerates the COMPLETE subaction set (FR-003). */
export function renderRoadmapUsage(): string {
  return `roadmap: a subaction is required (usage: roadmap <${subactionNames().join('|')}> [flags])`;
}

/** `roadmap <subaction> --help`: the subaction's flags + value vocabularies. */
export function renderSubactionHelp(subaction: string): string {
  const grammar = SUBACTION_SPECS[subaction];
  if (grammar === undefined) {
    throw new Error(`roadmap-help: no grammar for subaction '${subaction}'`);
  }
  const statusVocab = roadmapStatusVocabulary();
  const lines: string[] = [];
  const positional = grammar.positionals >= 1 ? ' <identifier>' : '';
  lines.push(`Usage: stackctl roadmap ${subaction}${positional} [flags]`);
  lines.push('');
  lines.push(summaryFor(subaction));
  lines.push('');
  lines.push('Flags:');
  const flags = flagNamesFor(grammar);
  const col = Math.max(...flags.map((f) => flagToken(f).length));
  for (const flag of flags) {
    lines.push(flagLine(flag, grammar, statusVocab, col));
  }
  lines.push('');
  return lines.join('\n');
}

// Re-export the `Flags` type so help consumers don't reach back into roadmap.ts.
export type { Flags };
