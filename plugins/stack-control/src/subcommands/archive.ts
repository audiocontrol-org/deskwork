// `stackctl archive --doc <path> [--apply]` (T021) — per contracts/archive.md.
// Move terminal-status Units into the sibling archive. Dry-run by default
// (FR-009); writing requires `--apply`.

import { runArchive } from '../document-model/archive-engine.js';
import { DocumentModelError } from '../document-model/types.js';
import { failUsage, grammarDirs, requireFlagValue } from './document-verb-shared.js';

function parseArgs(args: string[]): { doc: string; apply: boolean } {
  let doc: string | undefined;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--doc') {
      doc = requireFlagValue('archive', '--doc', args[++i]);
    } else if (token === '--apply') {
      apply = true;
    } else {
      failUsage('archive', `unexpected argument '${token}' (usage: archive --doc <path> [--apply])`);
    }
  }
  if (doc === undefined) failUsage('archive', '--doc <path> required');
  return { doc, apply };
}

export async function runArchiveCli(args: string[]): Promise<void> {
  const { doc, apply } = parseArgs(args);
  try {
    const result = runArchive(doc, { apply, ...grammarDirs() });
    if (result.moves.length === 0) {
      process.stdout.write('archive: no terminal-status Units to archive.\n');
      return;
    }
    const verb = result.applied ? 'archived' : 'would archive (dry-run)';
    process.stdout.write(`archive: ${verb} ${result.moves.length} Unit(s) → ${result.archivePath}\n`);
    for (const m of result.moves) {
      process.stdout.write(`  - ${m.identifier} [${m.status}] (lines ${m.span.startLine}-${m.span.endLine})\n`);
    }
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`archive: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // write/coherence failure → dispatcher exits 1
  }
}
