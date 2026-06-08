// `stackctl curate --doc <path> [--apply]` (T030) — per contracts/curate.md.
// Ensure the document is well-formed, well-ordered, and properly archived;
// recognize (never run) the up-to-date seam; report the ledger↔archive
// coherence NOTICE. Dry-run by default (FR-009).

import { runCurate } from '../document-model/curate-engine.js';
import { type CurateFinding, DocumentModelError } from '../document-model/types.js';
import { failUsage, grammarDirs, requireFlagValue } from './document-verb-shared.js';

// AUDIT-20260608-31: a finding is ACTIONABLE only when applying curate would
// change the live document. `disorder` and `unarchived-terminal` are the two
// kinds curate's --apply branch actually acts on; `up-to-date-seam` and
// `coherence-notice` are informational (the seam is "declared, not executed";
// the coherence notice is a NOTICE, never a mutation). Classifying here keeps
// the engine's findings model intact (no engine change) while letting the verb
// distinguish "would change" from "clean, with notices".
const ACTIONABLE_KINDS: ReadonlySet<CurateFinding['kind']> = new Set([
  'disorder',
  'unarchived-terminal',
]);

function isActionable(f: CurateFinding): boolean {
  return ACTIONABLE_KINDS.has(f.kind);
}

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

    if (report.applied) {
      process.stdout.write(
        `curate: applied — ${report.reordered ? 'reordered' : 'order unchanged'}, archived ${report.archived.length} Unit(s).\n`,
      );
      for (const f of report.findings) {
        process.stdout.write(`  - [${f.kind}] ${f.message}\n`);
      }
      return;
    }

    // Dry-run: only `disorder` / `unarchived-terminal` mean applying would
    // change the document. With none of those, the document is clean — report
    // it as such, but still surface any informational notices (seam / coherence)
    // so they aren't silently hidden (AUDIT-20260608-31).
    const actionable = report.findings.filter(isActionable);
    const informational = report.findings.filter((f) => !isActionable(f));
    if (actionable.length === 0) {
      process.stdout.write('curate: clean — well-formed, well-ordered, properly archived.\n');
      for (const f of informational) {
        process.stdout.write(`  - [${f.kind}] ${f.message}\n`);
      }
      return;
    }

    process.stdout.write('curate: would change (dry-run):\n');
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
