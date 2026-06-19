// `stackctl curate --doc <path> [--apply]` (T030) — per contracts/curate.md.
// Ensure the document is well-formed, well-ordered, and properly archived;
// recognize (never run) the up-to-date seam; report the ledger↔archive
// coherence NOTICE. Dry-run by default (FR-009).

import { loadDocument } from '../document-model/document.js';
import { runCurate } from '../document-model/curate-engine.js';
import { type CurateFinding, DocumentModelError } from '../document-model/types.js';
import { failUsage, grammarDirs, requireFlagValue } from './document-verb-shared.js';

/**
 * Edge-aware archival precheck (028 FR-017; contract RM4). Curate archives
 * terminal-status Units; archiving a terminal Unit that is still the TARGET of a
 * unit-reference edge (`depends-on` / `part-of` on the roadmap) would dangle that
 * edge. Consult the typed edges BEFORE curate runs and refuse loud (exit 2)
 * naming the dangling edge, rather than letting the archive move proceed.
 */
function assertNoDanglingTerminalEdge(docPath: string): void {
  const opts = grammarDirs();
  const { doc } = loadDocument(docPath, opts);
  const unitRefFields = new Set(
    // `?? []` — a grammar that omits edgeFields (non-roadmap doc, older grammar)
    // has no unit-ref edges to dangle; guard rather than TypeError (claude-03).
    (doc.grammar.edgeFields ?? []).filter((f) => f.references === 'unit').map((f) => f.name),
  );
  if (unitRefFields.size === 0) return; // no unit-ref edges in this grammar — nothing to dangle
  const terminal = new Set(doc.grammar.terminalStatuses);
  for (const unit of doc.units) {
    if (!terminal.has(unit.status)) continue;
    for (const other of doc.units) {
      if (other.identifier === unit.identifier) continue;
      for (const edge of other.edges) {
        if (!unitRefFields.has(edge.field)) continue;
        if (edge.targets.includes(unit.identifier)) {
          throw new DocumentModelError(
            `cannot archive terminal item '${unit.identifier}' — '${other.identifier}' still references it ` +
              `via '${edge.field}' (re-point or remove that edge first; refusing to dangle the reference)`,
          );
        }
      }
    }
  }
}

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
    // Edge-aware archival (FR-017): refuse BEFORE curate would archive a terminal
    // item still referenced by a unit-ref edge — applies to both dry-run and
    // --apply so the operator sees the refusal without writing.
    assertNoDanglingTerminalEdge(doc);
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

    // Dry-run: a THREE-way headline (AUDIT-20260608-43), refining the AUDIT-31
    // two-way split. Only `disorder` / `unarchived-terminal` are ACTIONABLE —
    // applying curate would change the document. `up-to-date-seam` and
    // `coherence-notice` are informational (curate never mutates either).
    //
    // The three cases are distinct because a `coherence-notice` is REAL
    // ledger↔archive drift — calling that "clean" misleads the operator. But
    // curate does not auto-fix coherence drift (FR-006 makes reconciling the
    // ledger↔archive the operator's responsibility), so it is neither "clean"
    // nor "would change":
    //   1. ZERO findings           → "clean" (truly well-formed/ordered/archived).
    //   2. informational-only (≥1)  → "no automatic changes; N notice(s)" — never
    //                                 "clean", never "would change"; surface them.
    //   3. ≥1 actionable           → "would change (dry-run)" + all findings.
    const actionable = report.findings.filter(isActionable);
    const informational = report.findings.filter((f) => !isActionable(f));

    if (actionable.length === 0) {
      if (informational.length === 0) {
        process.stdout.write('curate: clean — well-formed, well-ordered, properly archived.\n');
        return;
      }
      const count = informational.length;
      process.stdout.write(
        `curate: no automatic changes; ${count} notice${count === 1 ? '' : 's'}:\n`,
      );
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
