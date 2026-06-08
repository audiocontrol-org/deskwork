// The curate primitive (FR-008, SC-002): ensure a live governed document is
// well-formed, well-ordered, and properly archived; recognize (never run) the
// up-to-date reconciliation seam; and own the FR-006 ledger↔archive coherence
// NOTICE. Dry-run by default. On `--apply` it reorders first, then composes
// `archive --apply` (scoped durability promise — FR-010).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runArchive } from './archive-engine.js';
import { archiveMarkerIds } from './archive-file.js';
import { loadDocument, type LoadOptions } from './document.js';
import { assertInDomain, compareUnits } from './ordering.js';
import {
  type CurateFinding,
  type CurateReport,
  type GovernableDocument,
  type LedgerEntry,
} from './types.js';

export interface CurateOptions extends LoadOptions {
  readonly apply: boolean;
  readonly now?: string;
}

/** Reorder the Unit sequence to the declared order, preserving preamble +
 * postamble + every body verbatim. Returns null when already well-ordered. */
function reorderedSource(doc: GovernableDocument): string | null {
  const units = doc.units;
  for (const u of units) assertInDomain(doc.grammar, u);
  if (units.length < 2) return null;

  const sorted = [...units].sort((a, b) => compareUnits(doc.grammar, a, b));
  if (sorted.every((u, i) => u.identifier === units[i]!.identifier)) return null;

  const firstStart = units[0]!.span.startLine;
  const lastEnd = units[units.length - 1]!.span.endLine;
  const pre = doc.sourceLines.slice(0, firstStart - 1).join('\n');
  const post = doc.sourceLines.slice(lastEnd).join('\n');
  const sep = doc.grammar.unit.kind === 'row' ? '\n' : '\n\n';
  const region = sorted
    .map((u) => doc.sourceLines.slice(u.span.startLine - 1, u.span.endLine).join('\n'))
    .join(sep);

  const parts: string[] = [];
  if (pre.length > 0) parts.push(pre);
  parts.push(region);
  if (post.length > 0) parts.push(post);
  return parts.join('\n');
}

function coherenceFindings(doc: GovernableDocument, ledger: readonly LedgerEntry[]): CurateFinding[] {
  if (!existsSync(doc.archivePath)) return [];
  const markers = new Set(archiveMarkerIds(readFileSync(doc.archivePath, 'utf8'), doc.grammar));
  const ledgerIds = new Set(ledger.map((e) => e.identifier));
  const findings: CurateFinding[] = [];
  for (const id of ledgerIds) {
    if (!markers.has(id)) {
      findings.push({
        kind: 'coherence-notice',
        message: `NOTICE: ledger references '${id}' but no matching marker is present in the archive`,
      });
    }
  }
  for (const id of markers) {
    if (!ledgerIds.has(id)) {
      findings.push({
        kind: 'coherence-notice',
        message: `NOTICE: archive contains a Unit marker '${id}' with no ledger entry`,
      });
    }
  }
  return findings;
}

export function runCurate(docPath: string, opts: CurateOptions): CurateReport {
  // Well-formed (FR-003): load resolves + parses + validates identifiers; a
  // violation fails loud here, before any write. curate makes no partial fix.
  const { doc, ledger } = loadDocument(docPath, opts);
  const findings: CurateFinding[] = [];

  // Well-ordered (FR-004).
  const reordered = reorderedSource(doc);
  if (reordered !== null) {
    findings.push({ kind: 'disorder', message: 'Units are not in the declared order' });
  }

  // Properly-archived (FR-006): terminal-status Units still live.
  const terminalLive = doc.units.filter((u) => doc.grammar.terminalStatuses.includes(u.status));
  for (const u of terminalLive) {
    findings.push({
      kind: 'unarchived-terminal',
      message: `Unit '${u.identifier}' has terminal status '${u.status}' but is still in the live document`,
    });
  }

  // Up-to-date seam (FR-008): recognized, never executed.
  if (doc.grammar.reconciliationHook !== null) {
    const { kind, source } = doc.grammar.reconciliationHook;
    findings.push({
      kind: 'up-to-date-seam',
      message: `reconciliation hook declared (${kind}: ${source}) — declared, not yet executed`,
    });
  }

  // Coherence (FR-006): ledger ↔ archive markers — a NOTICE, never fail-loud.
  findings.push(...coherenceFindings(doc, ledger));

  if (!opts.apply) {
    return { applied: false, findings, reordered: false, archived: [] };
  }

  // Apply: reorder first (write the live document), then compose archive.
  let didReorder = false;
  if (reordered !== null) {
    writeFileSync(doc.path, reordered, 'utf8');
    didReorder = true;
  }
  const archiveResult = runArchive(docPath, { ...opts, apply: true });
  return { applied: true, findings, reordered: didReorder, archived: archiveResult.moves };
}
