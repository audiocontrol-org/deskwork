// `stackctl curate --doc <path> [--apply]` (T030) — per contracts/curate.md.
// Ensure the document is well-formed, well-ordered, and properly archived;
// recognize (never run) the up-to-date seam; report the ledger↔archive
// coherence NOTICE. Dry-run by default (FR-009).

import { runCurate } from '../document-model/curate-engine.js';
import { DocumentModelError } from '../document-model/types.js';
import { failUsage, grammarDirs, requireFlagValue } from './document-verb-shared.js';

function parseArgs(args: string[]): { doc: string; apply: boolean } {
  let doc: string | undefined;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--doc') {
      doc = requireFlagValue('curate', '--doc', args[++i]);
    } else if (token === '--apply') {
      apply = true;
    } else {
      failUsage('curate', `unexpected argument '${token}' (usage: curate --doc <path> [--apply])`);
    }
  }
  if (doc === undefined) failUsage('curate', '--doc <path> required');
  return { doc, apply };
}

export async function runCurateCli(args: string[]): Promise<void> {
  const { doc, apply } = parseArgs(args);
  try {
    const report = runCurate(doc, { apply, ...grammarDirs() });
    if (report.findings.length === 0 && !report.applied) {
      process.stdout.write('curate: clean — well-formed, well-ordered, properly archived.\n');
      return;
    }
    if (report.applied) {
      process.stdout.write(
        `curate: applied — ${report.reordered ? 'reordered' : 'order unchanged'}, archived ${report.archived.length} Unit(s).\n`,
      );
    } else {
      process.stdout.write('curate: would change (dry-run):\n');
    }
    for (const f of report.findings) {
      process.stdout.write(`  - [${f.kind}] ${f.message}\n`);
    }
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`curate: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // write failure → dispatcher exits 1
  }
}
