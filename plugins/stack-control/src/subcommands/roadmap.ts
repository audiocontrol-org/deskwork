// `stackctl roadmap <subaction> [flags]` (006 US1/US2) — the roadmap
// semantic-layer surface, per contracts/roadmap-cli.md. Read-only queries
// (`next`/`blocked`) + the `add` mutation (dry-run unless `--apply`). The verb
// stays thin: it composes roadmap-model + graph + mutations and formats. Later
// phases add blocks/order/graph (US4) and the remaining mutations (US3) here.
//
// Exit codes: 0 success; 2 usage/parse/validation (ungovernable doc, parse
// failure, referential-integrity/acyclicity violation, missing arg).

import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DocumentModelError } from '../document-model/types.js';
import { InstallationError } from '../config/errors.js';
import { blocks, order } from '../roadmap/graph.js';
import {
  add,
  advance,
  decompose,
  defer,
  reclassify,
  type AddInput,
  type MutationResult,
} from '../roadmap/mutations.js';
import { globParent, reconcile } from '../roadmap/reconcile.js';
import { loadRoadmap, type RoadmapModel } from '../roadmap/roadmap-model.js';
import { blockedReport, mermaid, readyList } from '../roadmap/views.js';
import {
  failUsage,
  grammarDirs,
  requireMapValue,
  requirePositional,
  scanVerbFlags,
  validateSubactionFlags,
  type SubactionGrammar,
} from './document-verb-shared.js';
import { resolveVerbDoc } from './working-file.js';

// When `--doc` is omitted, the roadmap resolves through the enclosing
// installation (009 read-side wiring, FR-003); outside any installation it fails
// loud directing to `stackctl setup` (no bundled fallback, D8). A sentinel
// default lets the flag scanner report whether --doc was passed.
const NO_DOC = '\0__roadmap_no_doc__';

interface Flags {
  readonly doc: string;
  readonly apply: boolean;
  readonly clear: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

// `--doc` is universal (allowed everywhere) and handled separately from `values`.
// Per-subaction grammar is the shared `SubactionGrammar` (document-verb-shared).
const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  next: { valueFlags: [], apply: false, clear: false, positionals: 0 },
  blocked: { valueFlags: [], apply: false, clear: false, positionals: 0 },
  blocks: { valueFlags: [], apply: false, clear: false, positionals: 1 },
  order: { valueFlags: [], apply: false, clear: false, positionals: 0 },
  graph: { valueFlags: [], apply: false, clear: false, positionals: 0 },
  reconcile: { valueFlags: [], apply: false, clear: false, positionals: 0 },
  add: {
    valueFlags: ['status', 'scope', 'depends-on', 'part-of', 'deferred-until', 'spec', 'ref'],
    apply: true,
    clear: false,
    positionals: 1,
  },
  advance: { valueFlags: ['to'], apply: true, clear: false, positionals: 1 },
  decompose: { valueFlags: ['into'], apply: true, clear: false, positionals: 1 },
  reclassify: { valueFlags: ['to'], apply: true, clear: false, positionals: 1 },
  defer: { valueFlags: ['until'], apply: true, clear: true, positionals: 1 },
};

/** The union of every subaction's value-flag names, so the scanner can reject a
 * forgotten value that swallows another recognized flag (AUDIT-BARRAGE-claude-01). */
const ALL_VALUE_FLAGS: readonly string[] = [
  ...new Set(Object.values(SUBACTION_SPECS).flatMap((s) => s.valueFlags)),
];

/** Scan flags via the shared subaction-verb scanner; `--apply`/`--clear` booleans. */
function scanFlags(args: readonly string[]): Flags {
  const s = scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear'], ALL_VALUE_FLAGS);
  return {
    doc: s.doc,
    apply: s.booleans.has('apply'),
    clear: s.booleans.has('clear'),
    positionals: s.positionals,
    values: s.values,
  };
}

/** The first positional, failing usage with a subaction-specific message. */
function requireId(flags: Flags, subaction: string): string {
  return requirePositional('roadmap', flags.positionals, `${subaction} requires an <identifier> positional`);
}

/** Require a named `--<flag> <value>`. */
function requireValue(flags: Flags, name: string): string {
  return requireMapValue('roadmap', flags.values, name);
}

function reportMutation(result: MutationResult, verb: string, id: string): void {
  process.stdout.write(
    result.applied
      ? `roadmap ${verb}: applied to ${id}\n`
      : `roadmap ${verb}: dry-run — would change ${id} (use --apply to write)\n`,
  );
}

function emitBlocks(model: RoadmapModel, flags: Flags): void {
  const id = flags.positionals[0];
  if (id === undefined) failUsage('roadmap', 'blocks requires an <identifier> positional');
  const items = blocks(model, id);
  process.stdout.write(`roadmap blocks ${id}: ${items.length} dependent${items.length === 1 ? '' : 's'}\n`);
  for (const item of items) process.stdout.write(`  - ${item.identifier}\n`);
}

function emitOrder(model: RoadmapModel): void {
  process.stdout.write('roadmap order:\n');
  for (const item of order(model)) process.stdout.write(`  - ${item.identifier}\n`);
}

function addInputFrom(flags: Flags): AddInput {
  const identifier = flags.positionals[0];
  if (identifier === undefined) failUsage('roadmap', 'add requires an <identifier> positional');
  const v = flags.values;
  const dependsOn = v.get('depends-on');
  return {
    identifier,
    status: v.get('status'),
    scope: v.get('scope'),
    dependsOn: dependsOn === undefined ? undefined : dependsOn.split(',').map((s) => s.trim()),
    partOf: v.get('part-of'),
    deferredUntil: v.get('deferred-until'),
    spec: v.get('spec'),
    ref: v.get('ref'),
  };
}

function emitAdd(flags: Flags): void {
  const input = addInputFrom(flags);
  const result = add(flags.doc, input, grammarDirs(), flags.apply);
  process.stdout.write(
    result.applied
      ? `roadmap add: added ${input.identifier}\n`
      : `roadmap add: dry-run — would add ${input.identifier} (use --apply to write)\n`,
  );
}

function emitAdvance(flags: Flags): void {
  const id = requireId(flags, 'advance');
  const result = advance(flags.doc, id, requireValue(flags, 'to'), grammarDirs(), flags.apply);
  reportMutation(result, 'advance', id);
}

function emitDecompose(flags: Flags): void {
  const id = requireId(flags, 'decompose');
  const into = requireValue(flags, 'into')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  reportMutation(decompose(flags.doc, id, into, grammarDirs(), flags.apply), 'decompose', id);
}

function emitReclassify(flags: Flags): void {
  const id = requireId(flags, 'reclassify');
  const result = reclassify(flags.doc, id, requireValue(flags, 'to'), grammarDirs(), flags.apply);
  reportMutation(result, 'reclassify', id);
}

function emitDefer(flags: Flags): void {
  const id = requireId(flags, 'defer');
  const change = flags.clear ? { clear: true } : { until: requireValue(flags, 'until') };
  reportMutation(defer(flags.doc, id, change, grammarDirs(), flags.apply), 'defer', id);
}

/**
 * Walk UP from the doc's directory to the nearest ancestor that contains
 * `<globParent>` as a subdirectory, and return that ancestor. The roadmap's
 * `spec:` paths (and the reconciliation glob) are relative to wherever the
 * glob-parent dir lives — NOT to the invocation cwd (AUDIT-20260608-15). Failing
 * to locate it is fail-loud (a wrong base must never silently report
 * all-unresolved). Returns the doc's own directory when the grammar declares no
 * glob hook (nothing to anchor to).
 */
function reconcileBaseDir(docPath: string, globParentDir: string | null): string {
  const start = dirname(resolve(docPath));
  if (globParentDir === null) return start;
  let cur = start;
  for (;;) {
    const candidate = join(cur, globParentDir);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new DocumentModelError(
    `reconcile: no ancestor of '${start}' contains the reconciliation glob-parent '${globParentDir}/' ` +
      `(spec correspondences cannot be resolved; refusing to report all-unresolved against a wrong base)`,
  );
}

function emitReconcile(flags: Flags): void {
  // Spec paths resolve relative to wherever the glob-parent dir (e.g. `specs/`)
  // lives, derived from the DOC's location — not the invocation cwd. This makes
  // `roadmap reconcile` correct from any working directory (AUDIT-20260608-15).
  const model = loadRoadmap(flags.doc, grammarDirs());
  const hook = model.doc.grammar.reconciliationHook;
  const globParentDir = hook !== null && hook.kind === 'glob' ? globParent(hook.source) : null;
  const baseDir = reconcileBaseDir(flags.doc, globParentDir);
  const report = reconcile(flags.doc, grammarDirs(), baseDir);
  process.stdout.write(`roadmap reconcile (report-only — proposes, never mutates):\n`);
  process.stdout.write(`  status drift: ${report.statusDrift.length}\n`);
  for (const d of report.statusDrift) {
    process.stdout.write(`    - ${d.identifier}: ${d.recorded} → ${d.onDisk} (${d.proposal})\n`);
  }
  process.stdout.write(`  orphan spec dirs: ${report.orphans.length}\n`);
  for (const o of report.orphans) process.stdout.write(`    - ${o}\n`);
  process.stdout.write(`  unresolved correspondences: ${report.unresolved.length}\n`);
  for (const u of report.unresolved) process.stdout.write(`    - ${u}\n`);
}

export async function runRoadmapCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('roadmap', 'a subaction is required (usage: roadmap <next|blocked|add> [flags])');
  }
  // Reject an unknown subaction before resolving the doc, so an unknown verb is a
  // usage error (exit 2) rather than triggering installation resolution.
  if (SUBACTION_SPECS[subaction] === undefined) {
    failUsage(
      'roadmap',
      `unknown subaction '${subaction}' (known: next, blocked, blocks, order, graph, add, advance, decompose, reclassify, defer, reconcile)`,
    );
  }
  const scanned = scanFlags(args.slice(1));
  validateSubactionFlags('roadmap', subaction, SUBACTION_SPECS[subaction], scanned);
  try {
    const { doc } = resolveVerbDoc({
      key: 'roadmap',
      explicitDoc: scanned.doc === NO_DOC ? null : scanned.doc,
      envSeam: process.env.STACKCTL_ROADMAP_DEFAULT_DOC,
      cwd: process.cwd(),
      announce: (message) => process.stdout.write(`${message}\n`),
    });
    const flags: Flags = { ...scanned, doc };
    switch (subaction) {
      case 'next':
        process.stdout.write(readyList(loadRoadmap(flags.doc, grammarDirs())));
        return;
      case 'blocked':
        process.stdout.write(blockedReport(loadRoadmap(flags.doc, grammarDirs())));
        return;
      case 'blocks':
        emitBlocks(loadRoadmap(flags.doc, grammarDirs()), flags);
        return;
      case 'order':
        emitOrder(loadRoadmap(flags.doc, grammarDirs()));
        return;
      case 'graph':
        process.stdout.write(mermaid(loadRoadmap(flags.doc, grammarDirs())));
        return;
      case 'add':
        emitAdd(flags);
        return;
      case 'advance':
        emitAdvance(flags);
        return;
      case 'decompose':
        emitDecompose(flags);
        return;
      case 'reclassify':
        emitReclassify(flags);
        return;
      case 'defer':
        emitDefer(flags);
        return;
      case 'reconcile':
        emitReconcile(flags);
        return;
    }
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(err.code === 'escape' || err.code === 'collision' ? 2 : 1);
    }
    if (err instanceof DocumentModelError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
