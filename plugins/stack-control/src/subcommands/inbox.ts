// `stackctl inbox <subaction> [flags]` (007) — the capture/triage surface for
// the governed design inbox, per contracts/inbox-cli.md. Mirrors the thin
// `roadmap` verb: a generic flag scan + per-subaction flag grammar + dispatch.
// Dry-run by default; `--apply` writes (mutations). Read-only `list` never
// writes. Exit 0 success; 2 usage/parse/validation (catch DocumentModelError →
// exit 2). Subactions: list (here); capture/promote/drop wired in US1/US2.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';
import { capture, type CaptureInput, type MutationResult } from '../inbox/mutations.js';
import { failUsage, grammarDirs } from './document-verb-shared.js';

const here = dirname(fileURLToPath(import.meta.url));
/** The project's governed design inbox (the single source of truth). */
const DEFAULT_DOC = resolve(here, '..', '..', 'DESIGN-INBOX.md');

interface Flags {
  readonly doc: string;
  readonly apply: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

/** Per-subaction grammar: value-flags it reads, whether `--apply` is meaningful. */
interface SubactionSpec {
  readonly valueFlags: readonly string[];
  readonly apply: boolean;
  /** Max positionals consumed beyond the subaction token (`--doc` is universal). */
  readonly positionals: number;
}

// `--doc` is universal (allowed everywhere) and handled separately from `values`.
// promote/drop specs are added by US2 as those subactions are wired.
const SUBACTION_SPECS: Readonly<Record<string, SubactionSpec>> = {
  capture: { valueFlags: ['idea', 'surfaced', 'context', 'home'], apply: true, positionals: 1 },
  list: { valueFlags: [], apply: false, positionals: 0 },
};

/** Generic flag scan: `--apply`, `--doc <path>`, `--<name> <value>`, positionals. */
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
      if (v === undefined || v.startsWith('--')) failUsage('inbox', '--doc <path> required');
      doc = v;
    } else if (token.startsWith('--')) {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) failUsage('inbox', `${token} <value> required`);
      values.set(token.slice(2), v);
    } else {
      positionals.push(token);
    }
  }
  return { doc, apply, positionals, values };
}

/**
 * Reject unknown flags, unsupported `--apply`, and extra positionals for the
 * chosen subaction with exit 2 — BEFORE any mutation/query runs. A misspelled
 * value-flag would otherwise be silently ignored, producing a valid-but-wrong
 * mutation (mirrors roadmap validateFlags, AUDIT-20260608-13).
 */
function validateFlags(subaction: string, flags: Flags): void {
  const spec = SUBACTION_SPECS[subaction];
  if (spec === undefined) return; // unknown subaction handled by the dispatch switch.
  const allowed = new Set(spec.valueFlags);
  for (const name of flags.values.keys()) {
    if (!allowed.has(name)) failUsage('inbox', `unknown flag --${name} for '${subaction}'`);
  }
  if (flags.apply && !spec.apply) failUsage('inbox', `--apply is not valid for '${subaction}'`);
  if (flags.positionals.length > spec.positionals) {
    failUsage('inbox', `unexpected positional '${flags.positionals[spec.positionals]!}' for '${subaction}'`);
  }
}

/** The first positional, failing usage with a subaction-specific message. */
function requireId(flags: Flags, subaction: string): string {
  const id = flags.positionals[0];
  if (id === undefined) failUsage('inbox', `${subaction} requires a <title> positional`);
  return id;
}

/** Require a named `--<flag> <value>`. */
function requireValue(flags: Flags, name: string): string {
  const v = flags.values.get(name);
  if (v === undefined) failUsage('inbox', `--${name} <value> required`);
  return v;
}

function reportMutation(result: MutationResult, verb: string, id: string): void {
  process.stdout.write(
    result.applied
      ? `inbox ${verb}: ${id}\n`
      : `inbox ${verb}: dry-run — would ${verb} ${id} (use --apply to write)\n`,
  );
}

function emitCapture(flags: Flags): void {
  const title = requireId(flags, 'capture');
  const input: CaptureInput = {
    title,
    idea: requireValue(flags, 'idea'),
    surfaced: flags.values.get('surfaced'),
    context: flags.values.get('context'),
    home: flags.values.get('home'),
  };
  reportMutation(capture(flags.doc, input, grammarDirs(), flags.apply), 'capture', title);
}

/** Read-only: print each entry's identifier + status. Never writes. */
function emitList(flags: Flags): void {
  const { doc } = loadDocument(flags.doc, grammarDirs());
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
  const flags = scanFlags(args.slice(1));
  validateFlags(subaction, flags);
  try {
    switch (subaction) {
      case 'capture':
        emitCapture(flags);
        return;
      case 'list':
        emitList(flags);
        return;
      default:
        failUsage(
          'inbox',
          `unknown subaction '${subaction}' (known: capture, promote, drop, list)`,
        );
    }
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`inbox: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
