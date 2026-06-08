// `stackctl roadmap <subaction> [flags]` (006 US1) — the roadmap semantic-layer
// surface, per contracts/roadmap-cli.md. MVP subactions: `next` (ready-list) and
// `blocked` (each non-ready item + what blocks it). Both are READ-ONLY. The verb
// stays thin: it composes the roadmap-model + graph queries and formats. Later
// phases add blocks/order/graph (US4) and the mutations (US2/US3) here.
//
// Exit codes (contracts/roadmap-cli.md): 0 success; 2 usage/parse/validation
// (ungovernable doc, parse failure, referential-integrity/acyclicity violation).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentModelError } from '../document-model/types.js';
import { blockedBy, isReady, ready } from '../roadmap/graph.js';
import { loadRoadmap, type RoadmapModel } from '../roadmap/roadmap-model.js';
import { failUsage, grammarDirs, requireFlagValue } from './document-verb-shared.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Default canonical roadmap (heading-keyed after US6 migration). */
const DEFAULT_DOC = resolve(here, '..', '..', 'ROADMAP.md');

interface ParsedArgs {
  readonly subaction: string;
  readonly doc: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('roadmap', 'a subaction is required (usage: roadmap <next|blocked> [--doc <path>])');
  }
  let doc = DEFAULT_DOC;
  for (let i = 1; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--doc') {
      doc = requireFlagValue('roadmap', '--doc', args[++i]);
    } else {
      failUsage('roadmap', `unexpected argument '${token}'`);
    }
  }
  return { subaction, doc };
}

function emitNext(model: RoadmapModel): void {
  const items = ready(model);
  process.stdout.write(`roadmap next: ${items.length} ready\n`);
  for (const item of items) {
    process.stdout.write(`  - ${item.identifier}\n`);
  }
}

function emitBlocked(model: RoadmapModel): void {
  const blocked = model.items.filter((item) => !isReady(model, item) && !model.doc.grammar.terminalStatuses.includes(item.status));
  process.stdout.write(`roadmap blocked: ${blocked.length} item${blocked.length === 1 ? '' : 's'}\n`);
  for (const item of blocked) {
    const report = blockedBy(model, item.identifier);
    const parts: string[] = [];
    for (const dep of report.unmetDependencies) {
      parts.push(`${dep.identifier} (${dep.status})`);
    }
    if (report.deferredUntil !== null) {
      parts.push(`deferred: ${report.deferredUntil}`);
    }
    process.stdout.write(`  - ${item.identifier} — blocked by ${parts.join(', ')}\n`);
  }
}

export async function runRoadmapCli(args: string[]): Promise<void> {
  const { subaction, doc } = parseArgs(args);
  try {
    const model = loadRoadmap(doc, grammarDirs());
    switch (subaction) {
      case 'next':
        emitNext(model);
        return;
      case 'blocked':
        emitBlocked(model);
        return;
      default:
        failUsage('roadmap', `unknown subaction '${subaction}' (known: next, blocked)`);
    }
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
