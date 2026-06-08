// `stackctl unarchive --doc <path> --id <identifier> [--apply]` (T022) — per
// contracts/unarchive.md. Return a named archived Unit to the live document at
// its declared-order position. Dry-run by default (FR-009).

import { runUnarchive } from '../document-model/unarchive-engine.js';
import { DocumentModelError } from '../document-model/types.js';
import { failUsage, grammarDirs, requireFlagValue } from './document-verb-shared.js';

function parseArgs(args: string[]): { doc: string; id: string; apply: boolean } {
  let doc: string | undefined;
  let id: string | undefined;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--doc') {
      doc = requireFlagValue('unarchive', '--doc', args[++i]);
    } else if (token === '--id') {
      id = requireFlagValue('unarchive', '--id', args[++i]);
    } else if (token === '--apply') {
      apply = true;
    } else {
      failUsage('unarchive', `unexpected argument '${token}' (usage: unarchive --doc <path> --id <identifier> [--apply])`);
    }
  }
  if (doc === undefined) failUsage('unarchive', '--doc <path> required');
  if (id === undefined) failUsage('unarchive', '--id <identifier> required');
  return { doc, id, apply };
}

export async function runUnarchiveCli(args: string[]): Promise<void> {
  const { doc, id, apply } = parseArgs(args);
  try {
    const result = runUnarchive(doc, { id, apply, ...grammarDirs() });
    const verb = result.applied ? 'restored' : 'would restore (dry-run)';
    const move = result.moves[0];
    process.stdout.write(`unarchive: ${verb} '${id}'${move ? ` [${move.status}]` : ''} from ${result.archivePath}\n`);
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`unarchive: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // write/coherence failure → dispatcher exits 1
  }
}
