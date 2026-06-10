// `stackctl inbox <subaction> [flags]` (007) — the capture/triage surface for
// the governed design inbox, per contracts/inbox-cli.md. Mirrors the thin
// `roadmap` verb: a generic flag scan + per-subaction flag grammar + dispatch.
// Dry-run by default; `--apply` writes (mutations). Read-only `list` never
// writes. Exit 0 success; 2 usage/parse/validation (catch DocumentModelError →
// exit 2); 1 when run outside any installation with no --doc/seam (009 read-side
// wiring — InstallationError 'not-found' fails loud directing to `stackctl setup`).

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';
import { InstallationError } from '../config/errors.js';
import { capture, drop, promote, type CaptureInput, type MutationResult } from '../inbox/mutations.js';
import {
  failUsage,
  requireMapValue,
  requirePositional,
  scanVerbFlags,
  validateSubactionFlags,
  type SubactionGrammar,
} from './document-verb-shared.js';
import { resolveVerbDoc } from './working-file.js';

// When `--doc` is omitted, the inbox resolves through the enclosing installation
// (009 read-side wiring, FR-003). `STACKCTL_INBOX_DEFAULT_DOC` still overrides as
// a TEST SEAM / operator escape hatch; outside any installation with neither set,
// resolution fails loud directing to `stackctl setup` (no bundled fallback, D8).
// A sentinel default lets the flag scanner report whether --doc was passed.
const NO_DOC = '\0__inbox_no_doc__';

interface Flags {
  readonly doc: string;
  readonly apply: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

// `--doc` is universal (allowed everywhere) and handled separately from `values`.
// Per-subaction grammar is the shared `SubactionGrammar` (document-verb-shared).
const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  capture: { valueFlags: ['idea', 'surfaced', 'context', 'home'], apply: true, positionals: 1 },
  promote: { valueFlags: ['to'], apply: true, positionals: 1 },
  drop: { valueFlags: ['reason'], apply: true, positionals: 1 },
  list: { valueFlags: [], apply: false, positionals: 0 },
};

/** The union of every subaction's value-flag names, so the scanner can reject a
 * forgotten value that swallows another recognized flag (AUDIT-BARRAGE-claude-01). */
const ALL_VALUE_FLAGS: readonly string[] = [
  ...new Set(Object.values(SUBACTION_SPECS).flatMap((s) => s.valueFlags)),
];

/** Scan flags via the shared subaction-verb scanner; `--apply` is the only boolean. */
function scanFlags(args: readonly string[]): Flags {
  const s = scanVerbFlags('inbox', args, NO_DOC, ['apply'], ALL_VALUE_FLAGS);
  return { doc: s.doc, apply: s.booleans.has('apply'), positionals: s.positionals, values: s.values };
}

/** The first positional, failing usage with a subaction-specific message. */
function requireId(flags: Flags, subaction: string): string {
  return requirePositional('inbox', flags.positionals, `${subaction} requires a <title> positional`);
}

/** Require a named `--<flag> <value>`. */
function requireValue(flags: Flags, name: string): string {
  return requireMapValue('inbox', flags.values, name);
}

function reportMutation(result: MutationResult, verb: string, id: string): void {
  process.stdout.write(
    result.applied
      ? `inbox ${verb}: ${id}\n`
      : `inbox ${verb}: dry-run — would ${verb} ${id} (use --apply to write)\n`,
  );
}

function emitCapture(doc: string, opts: LoadOptions, flags: Flags): void {
  const title = requireId(flags, 'capture');
  const input: CaptureInput = {
    title,
    idea: requireValue(flags, 'idea'),
    surfaced: flags.values.get('surfaced'),
    context: flags.values.get('context'),
    home: flags.values.get('home'),
  };
  reportMutation(capture(doc, input, opts, flags.apply), 'capture', title);
}

function emitPromote(doc: string, opts: LoadOptions, flags: Flags): void {
  const id = requireId(flags, 'promote');
  const target = requireValue(flags, 'to');
  reportMutation(promote(doc, id, target, opts, flags.apply), 'promote', id);
}

function emitDrop(doc: string, opts: LoadOptions, flags: Flags): void {
  const id = requireId(flags, 'drop');
  const reason = requireValue(flags, 'reason');
  reportMutation(drop(doc, id, reason, opts, flags.apply), 'drop', id);
}

/** Read-only: print each entry's identifier + status. Never writes. */
function emitList(docPath: string, opts: LoadOptions): void {
  const { doc } = loadDocument(docPath, opts);
  process.stdout.write(`inbox list: ${doc.units.length} entr${doc.units.length === 1 ? 'y' : 'ies'}\n`);
  for (const unit of doc.units) {
    process.stdout.write(`  - ${unit.identifier} [${unit.status}]\n`);
  }
}

export async function runInboxCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('inbox', 'a subaction is required (usage: inbox <capture|promote|drop|list> [flags])');
  }
  // Reject an unknown subaction before resolving the doc, so an unknown verb is a
  // usage error (exit 2) rather than triggering installation resolution.
  if (SUBACTION_SPECS[subaction] === undefined) {
    failUsage('inbox', `unknown subaction '${subaction}' (known: capture, promote, drop, list)`);
  }
  const flags = scanFlags(args.slice(1));
  validateSubactionFlags('inbox', subaction, SUBACTION_SPECS[subaction], flags);
  try {
    const { doc, opts } = resolveVerbDoc({
      key: 'inbox',
      explicitDoc: flags.doc === NO_DOC ? null : flags.doc,
      envSeam: process.env.STACKCTL_INBOX_DEFAULT_DOC,
      cwd: process.cwd(),
      announce: (message) => process.stdout.write(`${message}\n`),
    });
    switch (subaction) {
      case 'capture':
        emitCapture(doc, opts, flags);
        return;
      case 'promote':
        emitPromote(doc, opts, flags);
        return;
      case 'drop':
        emitDrop(doc, opts, flags);
        return;
      case 'list':
        emitList(doc, opts);
        return;
    }
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`inbox: ${err.message}\n`);
      process.exit(err.code === 'escape' || err.code === 'collision' ? 2 : 1);
    }
    if (err instanceof DocumentModelError) {
      process.stderr.write(`inbox: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
