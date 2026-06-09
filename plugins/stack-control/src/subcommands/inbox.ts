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
import { capture, drop, promote, type CaptureInput, type MutationResult } from '../inbox/mutations.js';
import {
  failUsage,
  grammarDirs,
  requireMapValue,
  requirePositional,
  scanVerbFlags,
} from './document-verb-shared.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Default when `--doc` is omitted: this monorepo's plugin-bundled inbox (the
 * in-repo dogfood), NOT an adopter's cwd-relative inbox. Adopters must pass
 * `--doc` until `design:gap/project-relative-doc-discovery` lands (AUDIT-20260609-06).
 * `STACKCTL_INBOX_DEFAULT_DOC` overrides it — primarily a TEST SEAM so a
 * wrong-doc regression can never touch the committed bundled file
 * (AUDIT-20260609-12); also a usable operator override toward the discovery gap. */
const DEFAULT_DOC =
  process.env.STACKCTL_INBOX_DEFAULT_DOC ?? resolve(here, '..', '..', 'DESIGN-INBOX.md');

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
const SUBACTION_SPECS: Readonly<Record<string, SubactionSpec>> = {
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
  const s = scanVerbFlags('inbox', args, DEFAULT_DOC, ['apply'], ALL_VALUE_FLAGS);
  return { doc: s.doc, apply: s.booleans.has('apply'), positionals: s.positionals, values: s.values };
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

function emitPromote(flags: Flags): void {
  const id = requireId(flags, 'promote');
  const target = requireValue(flags, 'to');
  reportMutation(promote(flags.doc, id, target, grammarDirs(), flags.apply), 'promote', id);
}

function emitDrop(flags: Flags): void {
  const id = requireId(flags, 'drop');
  const reason = requireValue(flags, 'reason');
  reportMutation(drop(flags.doc, id, reason, grammarDirs(), flags.apply), 'drop', id);
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
      case 'promote':
        emitPromote(flags);
        return;
      case 'drop':
        emitDrop(flags);
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
