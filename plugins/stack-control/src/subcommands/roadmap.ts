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
import { blockedBy, isReady, ready } from '../roadmap/graph.js';
import { add, type AddInput } from '../roadmap/mutations.js';
import { loadRoadmap, type RoadmapModel } from '../roadmap/roadmap-model.js';
import { failUsage, grammarDirs } from './document-verb-shared.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Default canonical roadmap (heading-keyed after US6 migration). */
const DEFAULT_DOC = resolve(here, '..', '..', 'ROADMAP.md');

interface Flags {
  readonly doc: string;
  readonly apply: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

/** Generic flag scan: `--apply` boolean, `--doc`/`--<name> <value>`, positionals. */
function scanFlags(args: readonly string[]): Flags {
  let doc = DEFAULT_DOC;
  let apply = false;
  const positionals: string[] = [];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--apply') {
      apply = true;
    } else if (token === '--doc') {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) failUsage('roadmap', '--doc <path> required');
      doc = v;
    } else if (token.startsWith('--')) {
      const v = args[++i];
      if (v === undefined) failUsage('roadmap', `${token} <value> required`);
      values.set(token.slice(2), v);
    } else {
      positionals.push(token);
    }
  }
  return { doc, apply, positionals, values };
}

function emitNext(model: RoadmapModel): void {
  const items = ready(model);
  process.stdout.write(`roadmap next: ${items.length} ready\n`);
  for (const item of items) process.stdout.write(`  - ${item.identifier}\n`);
}

function isLive(model: RoadmapModel, status: string): boolean {
  return !model.doc.grammar.terminalStatuses.includes(status);
}

function emitBlocked(model: RoadmapModel): void {
  const blocked = model.items.filter((i) => isLive(model, i.status) && !isReady(model, i));
  process.stdout.write(`roadmap blocked: ${blocked.length} item${blocked.length === 1 ? '' : 's'}\n`);
  for (const item of blocked) {
    const report = blockedBy(model, item.identifier);
    const parts = report.unmetDependencies.map((d) => `${d.identifier} (${d.status})`);
    if (report.deferredUntil !== null) parts.push(`deferred: ${report.deferredUntil}`);
    process.stdout.write(`  - ${item.identifier} — blocked by ${parts.join(', ')}\n`);
  }
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

export async function runRoadmapCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('roadmap', 'a subaction is required (usage: roadmap <next|blocked|add> [flags])');
  }
  const flags = scanFlags(args.slice(1));
  try {
    switch (subaction) {
      case 'next':
        emitNext(loadRoadmap(flags.doc, grammarDirs()));
        return;
      case 'blocked':
        emitBlocked(loadRoadmap(flags.doc, grammarDirs()));
        return;
      case 'add':
        emitAdd(flags);
        return;
      default:
        failUsage('roadmap', `unknown subaction '${subaction}' (known: next, blocked, add)`);
    }
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
