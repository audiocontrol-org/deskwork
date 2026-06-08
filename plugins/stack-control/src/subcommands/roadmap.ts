// `stackctl roadmap <subaction> [flags]` (006 US1/US2) — the roadmap
// semantic-layer surface, per contracts/roadmap-cli.md. Read-only queries
// (`next`/`blocked`) + the `add` mutation (dry-run unless `--apply`). The verb
// stays thin: it composes roadmap-model + graph + mutations and formats. Later
// phases add blocks/order/graph (US4) and the remaining mutations (US3) here.
//
// Exit codes: 0 success; 2 usage/parse/validation (ungovernable doc, parse
// failure, referential-integrity/acyclicity violation, missing arg).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentModelError } from '../document-model/types.js';
import { blocks, order } from '../roadmap/graph.js';
import {
  add,
  advance,
  decompose,
  defer,
  reclassify,
  type AddInput,
  type MutationResult,
} from '../roadmap/mutations.js';
import { loadRoadmap, type RoadmapModel } from '../roadmap/roadmap-model.js';
import { blockedReport, mermaid, readyList } from '../roadmap/views.js';
import { failUsage, grammarDirs } from './document-verb-shared.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Default canonical roadmap (heading-keyed after US6 migration). */
const DEFAULT_DOC = resolve(here, '..', '..', 'ROADMAP.md');

interface Flags {
  readonly doc: string;
  readonly apply: boolean;
  readonly clear: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

/** Boolean flags that take no value (everything else `--name <value>`). */
const BOOLEAN_FLAGS = new Set(['--apply', '--clear']);

/** Generic flag scan: boolean flags, `--doc`/`--<name> <value>`, positionals. */
function scanFlags(args: readonly string[]): Flags {
  let doc = DEFAULT_DOC;
  let apply = false;
  let clear = false;
  const positionals: string[] = [];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--apply') {
      apply = true;
    } else if (token === '--clear') {
      clear = true;
    } else if (token === '--doc') {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) failUsage('roadmap', '--doc <path> required');
      doc = v;
    } else if (token.startsWith('--')) {
      const v = args[++i];
      if (v === undefined || BOOLEAN_FLAGS.has(token)) failUsage('roadmap', `${token} <value> required`);
      values.set(token.slice(2), v);
    } else {
      positionals.push(token);
    }
  }
  return { doc, apply, clear, positionals, values };
}

/** The first positional, failing usage with a subaction-specific message. */
function requireId(flags: Flags, subaction: string): string {
  const id = flags.positionals[0];
  if (id === undefined) failUsage('roadmap', `${subaction} requires an <identifier> positional`);
  return id;
}

/** Require a named `--<flag> <value>`. */
function requireValue(flags: Flags, name: string): string {
  const v = flags.values.get(name);
  if (v === undefined) failUsage('roadmap', `--${name} <value> required`);
  return v;
}

function reportMutation(result: MutationResult, verb: string, id: string): void {
  process.stdout.write(
    result.applied
      ? `roadmap ${verb}: applied to ${id}\n`
      : `roadmap ${verb}: dry-run — would change ${id} (use --apply to write)\n`,
  );
}

function emitBlocks(model: RoadmapModel, flags: Flags): void {
  const id = flags.positionals[0];
  if (id === undefined) failUsage('roadmap', 'blocks requires an <identifier> positional');
  const items = blocks(model, id);
  process.stdout.write(`roadmap blocks ${id}: ${items.length} dependent${items.length === 1 ? '' : 's'}\n`);
  for (const item of items) process.stdout.write(`  - ${item.identifier}\n`);
}

function emitOrder(model: RoadmapModel): void {
  process.stdout.write('roadmap order:\n');
  for (const item of order(model)) process.stdout.write(`  - ${item.identifier}\n`);
}

function addInputFrom(flags: Flags): AddInput {
  const identifier = flags.positionals[0];
  if (identifier === undefined) failUsage('roadmap', 'add requires an <identifier> positional');
  const v = flags.values;
  const dependsOn = v.get('depends-on');
  return {
    identifier,
    status: v.get('status'),
    scope: v.get('scope'),
    dependsOn: dependsOn === undefined ? undefined : dependsOn.split(',').map((s) => s.trim()),
    partOf: v.get('part-of'),
    deferredUntil: v.get('deferred-until'),
    spec: v.get('spec'),
    ref: v.get('ref'),
  };
}

function emitAdd(flags: Flags): void {
  const input = addInputFrom(flags);
  const result = add(flags.doc, input, grammarDirs(), flags.apply);
  process.stdout.write(
    result.applied
      ? `roadmap add: added ${input.identifier}\n`
      : `roadmap add: dry-run — would add ${input.identifier} (use --apply to write)\n`,
  );
}

function emitAdvance(flags: Flags): void {
  const id = requireId(flags, 'advance');
  const result = advance(flags.doc, id, requireValue(flags, 'to'), grammarDirs(), flags.apply);
  reportMutation(result, 'advance', id);
}

function emitDecompose(flags: Flags): void {
  const id = requireId(flags, 'decompose');
  const into = requireValue(flags, 'into')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  reportMutation(decompose(flags.doc, id, into, grammarDirs(), flags.apply), 'decompose', id);
}

function emitReclassify(flags: Flags): void {
  const id = requireId(flags, 'reclassify');
  const result = reclassify(flags.doc, id, requireValue(flags, 'to'), grammarDirs(), flags.apply);
  reportMutation(result, 'reclassify', id);
}

function emitDefer(flags: Flags): void {
  const id = requireId(flags, 'defer');
  const change = flags.clear ? { clear: true } : { until: requireValue(flags, 'until') };
  reportMutation(defer(flags.doc, id, change, grammarDirs(), flags.apply), 'defer', id);
}

export async function runRoadmapCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('roadmap', 'a subaction is required (usage: roadmap <next|blocked|add> [flags])');
  }
  const flags = scanFlags(args.slice(1));
  try {
    switch (subaction) {
      case 'next':
        process.stdout.write(readyList(loadRoadmap(flags.doc, grammarDirs())));
        return;
      case 'blocked':
        process.stdout.write(blockedReport(loadRoadmap(flags.doc, grammarDirs())));
        return;
      case 'blocks':
        emitBlocks(loadRoadmap(flags.doc, grammarDirs()), flags);
        return;
      case 'order':
        emitOrder(loadRoadmap(flags.doc, grammarDirs()));
        return;
      case 'graph':
        process.stdout.write(mermaid(loadRoadmap(flags.doc, grammarDirs())));
        return;
      case 'add':
        emitAdd(flags);
        return;
      case 'advance':
        emitAdvance(flags);
        return;
      case 'decompose':
        emitDecompose(flags);
        return;
      case 'reclassify':
        emitReclassify(flags);
        return;
      case 'defer':
        emitDefer(flags);
        return;
      default:
        failUsage(
          'roadmap',
          `unknown subaction '${subaction}' (known: next, blocked, blocks, order, graph, add, advance, decompose, reclassify, defer)`,
        );
    }
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
