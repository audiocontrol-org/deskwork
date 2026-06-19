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
import type { LoadOptions } from '../document-model/document.js';
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
import { cluster, type ClusterInput } from '../roadmap/cluster.js';
import { globParent, reconcile } from '../roadmap/reconcile.js';
import { loadRoadmap, type RoadmapModel } from '../roadmap/roadmap-model.js';
import { createBacklogBackend, BacklogError, BACKLOG_DONE_STATUS } from '../backlog/backend.js';
import { backlogRoot } from '../backlog/root.js';
import { blockedReport, mermaid, readyList } from '../roadmap/views.js';
import {
  failUsage,
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

export interface Flags {
  readonly doc: string;
  readonly apply: boolean;
  readonly clear: boolean;
  readonly chain: boolean;
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
  cluster: {
    valueFlags: ['children', 'summary'],
    apply: true,
    clear: false,
    chain: true,
    positionals: 1,
  },
  // `group` is an alias of `cluster` (same grammar + same handler).
  group: {
    valueFlags: ['children', 'summary'],
    apply: true,
    clear: false,
    chain: true,
    positionals: 1,
  },
  'close-related': { valueFlags: [], apply: true, clear: false, positionals: 1 },
};

/** The union of every subaction's value-flag names, so the scanner can reject a
 * forgotten value that swallows another recognized flag (AUDIT-BARRAGE-claude-01). */
const ALL_VALUE_FLAGS: readonly string[] = [
  ...new Set(Object.values(SUBACTION_SPECS).flatMap((s) => s.valueFlags)),
];

/** The known-subaction list rendered in the unknown-subaction usage error —
 * single-sourced so the flat path (`runRoadmapCli`) and the commander mount
 * (`roadmap-command.ts`) emit the byte-identical message (FR-006; AUDIT-BARRAGE-
 * codex-01). The order is the discovery order operators have learned, kept stable. */
export const KNOWN_SUBACTIONS =
  'next, blocked, blocks, order, graph, add, advance, decompose, reclassify, defer, cluster, group, reconcile, close-related';

/** Scan flags via the shared subaction-verb scanner; `--apply`/`--clear`/`--chain` booleans. */
export function scanFlags(args: readonly string[]): Flags {
  const s = scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ALL_VALUE_FLAGS);
  return {
    doc: s.doc,
    apply: s.booleans.has('apply'),
    clear: s.booleans.has('clear'),
    chain: s.booleans.has('chain'),
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
  const partOfRaw = v.get('part-of');
  const partOf =
    partOfRaw === undefined
      ? undefined
      : partOfRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  // A present-but-empty `--part-of` (e.g. `--part-of ,`) is a malformed grouping
  // flag, NOT "no parent": fail loud rather than silently dropping the edge and
  // reporting a successful, ungrouped add (AUDIT-BARRAGE-codex-01).
  if (partOf !== undefined && partOf.length === 0) {
    failUsage('roadmap', 'add: --part-of was given but lists no parent id');
  }
  return {
    identifier,
    status: v.get('status'),
    scope: v.get('scope'),
    dependsOn: dependsOn === undefined ? undefined : dependsOn.split(',').map((s) => s.trim()),
    partOf,
    deferredUntil: v.get('deferred-until'),
    spec: v.get('spec'),
    ref: v.get('ref'),
  };
}

function emitAdd(flags: Flags, opts: LoadOptions): void {
  const input = addInputFrom(flags);
  const result = add(flags.doc, input, opts, flags.apply);
  process.stdout.write(
    result.applied
      ? `roadmap add: added ${input.identifier}\n`
      : `roadmap add: dry-run — would add ${input.identifier} (use --apply to write)\n`,
  );
}

function emitAdvance(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'advance');
  const result = advance(flags.doc, id, requireValue(flags, 'to'), opts, flags.apply);
  reportMutation(result, 'advance', id);
}

function emitDecompose(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'decompose');
  const into = requireValue(flags, 'into')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  reportMutation(decompose(flags.doc, id, into, opts, flags.apply), 'decompose', id);
}

function emitReclassify(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'reclassify');
  const result = reclassify(flags.doc, id, requireValue(flags, 'to'), opts, flags.apply);
  reportMutation(result, 'reclassify', id);
}

function emitDefer(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'defer');
  const change = flags.clear ? { clear: true } : { until: requireValue(flags, 'until') };
  reportMutation(defer(flags.doc, id, change, opts, flags.apply), 'defer', id);
}

/** Build the `cluster` input from the parsed flags (positional parent + --children). */
function clusterInputFrom(flags: Flags, verb: string): ClusterInput {
  const parentId = requireId(flags, verb);
  const children = requireValue(flags, 'children')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { parentId, children, chain: flags.chain, summary: flags.values.get('summary') };
}

/** `roadmap cluster <parent> --children <a,b,…> [--chain] [--summary] [--apply]`. */
function emitCluster(flags: Flags, opts: LoadOptions, verb: string): void {
  const input = clusterInputFrom(flags, verb);
  const result = cluster(flags.doc, input, opts, flags.apply);
  const chainNote = input.chain ? ' + depends-on chain' : '';
  process.stdout.write(
    result.applied
      ? `roadmap ${verb}: grouped ${input.children.join(', ')} under ${input.parentId}${chainNote}\n`
      : `roadmap ${verb}: dry-run — would group ${input.children.join(', ')} under ${input.parentId}${chainNote} (use --apply to write)\n`,
  );
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

function emitReconcile(flags: Flags, opts: LoadOptions): void {
  // Spec paths resolve relative to wherever the glob-parent dir (e.g. `specs/`)
  // lives, derived from the DOC's location — not the invocation cwd. This makes
  // `roadmap reconcile` correct from any working directory (AUDIT-20260608-15).
  const model = loadRoadmap(flags.doc, opts);
  const hook = model.doc.grammar.reconciliationHook;
  const globParentDir = hook !== null && hook.kind === 'glob' ? globParent(hook.source) : null;
  const baseDir = reconcileBaseDir(flags.doc, globParentDir);
  const report = reconcile(flags.doc, opts, baseDir);
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

/**
 * `roadmap close-related <item>` (023) — mechanical terminal closure. Closes EXACTLY
 * the backlog ids recorded on the node (`closes:` ∪ `ref:`) when the item is in a
 * grammar-terminal status. Never title-matches or infers; dry-run by default;
 * fail-loud per id; idempotent (an already-`Done` item is reported, not re-closed).
 */
function emitCloseRelated(model: RoadmapModel, flags: Flags): void {
  const id = requireId(flags, 'close-related');
  const item = model.byId.get(id);
  if (item === undefined) failUsage('roadmap', `close-related: no item '${id}'`);
  const terminal = model.doc.grammar.terminalStatuses;
  if (!terminal.includes(item.status)) {
    failUsage(
      'roadmap',
      `close-related: '${id}' is '${item.status}', not a terminal status (${terminal.join('/')}) — ` +
        `loose ends are tied only once an item reaches a terminal state`,
    );
  }
  // The resolved set is a RECORDED fact: closes: ∪ ref:. Never inferred (023 FR-003).
  const targets = [...new Set([...item.closes, ...(item.ref !== null ? [item.ref] : [])])];
  if (targets.length === 0) {
    process.stdout.write(`roadmap close-related ${id}: no recorded resolved items (closes:/ref:); nothing to close\n`);
    return;
  }

  const backend = createBacklogBackend({ cwd: backlogRoot() });
  const statusById = new Map(backend.list().map((it) => [it.id, it.status]));
  // Fail loud on any unknown id BEFORE applying anything (FR-006 — never a fabricated close).
  const unknown = targets.filter((t) => !statusById.has(t));
  if (unknown.length > 0) {
    throw new BacklogError(`close-related: unknown backlog id(s) ${unknown.join(', ')} (recorded on '${id}' but absent from the backlog)`);
  }

  if (!flags.apply) {
    process.stdout.write(`roadmap close-related ${id}: dry-run — would close (use --apply):\n`);
    for (const t of targets) {
      const already = statusById.get(t) === BACKLOG_DONE_STATUS;
      process.stdout.write(`  - ${t}${already ? ' (already closed)' : ''}\n`);
    }
    return;
  }

  process.stdout.write(`roadmap close-related ${id}: closing resolved items\n`);
  for (const t of targets) {
    if (statusById.get(t) === BACKLOG_DONE_STATUS) {
      process.stdout.write(`  - ${t}: already closed (no-op)\n`);
      continue;
    }
    backend.close(t); // non-zero → BacklogError, never a fabricated success
    process.stdout.write(`  - ${t}: closed -> ${BACKLOG_DONE_STATUS}\n`);
  }
}

// The sentinel `--doc`-absent value exported so the commander mount
// (roadmap-command.ts) marks "no explicit --doc" identically to the flat scan
// path, keeping installation resolution behavior byte-for-byte identical.
export { NO_DOC, SUBACTION_SPECS };

/**
 * The AUDIT-hardened front-end validation, single-sourced for the commander mount
 * (027 T004). Runs the shared subaction-verb scanner + per-subaction grammar
 * validation on the RAW subaction args — preserving every exit-2 guard the flat
 * path enforced, INCLUDING the forgot-value cases commander's own parser does not
 * replicate (`--<value-flag>` immediately followed by a recognized flag → exit 2,
 * AUDIT-20260608-04 / AUDIT-BARRAGE-claude-01). `subaction` MUST already be a known
 * key of SUBACTION_SPECS (the caller rejects unknowns first). Returns the validated
 * `Flags`; on any violation it `process.exit(2)`s via the shared `failUsage`.
 */
export function preflightRoadmapFlags(subaction: string, subActionArgs: readonly string[]): Flags {
  const scanned = scanFlags(subActionArgs);
  validateSubactionFlags('roadmap', subaction, SUBACTION_SPECS[subaction], scanned);
  return scanned;
}

/**
 * The doc-resolution + dispatch + error-mapping core, shared by BOTH the flat
 * hand-rolled path (`runRoadmapCli`) and the commander mount (roadmap-command.ts).
 * `scanned` is a fully-validated `Flags` whose `doc` is either an explicit path
 * or the `NO_DOC` sentinel. Subaction is assumed already validated as a known
 * key of SUBACTION_SPECS (the caller rejects unknowns with exit 2 first).
 *
 * Single-sourcing this here keeps the InstallationError/DocumentModelError/
 * BacklogError → exit-code mapping identical across both entry points (027 T004).
 */
export async function executeRoadmapSubaction(subaction: string, scanned: Flags): Promise<void> {
  try {
    const { doc, opts } = resolveVerbDoc({
      key: 'roadmap',
      explicitDoc: scanned.doc === NO_DOC ? null : scanned.doc,
      envSeam: process.env.STACKCTL_ROADMAP_DEFAULT_DOC,
      cwd: process.cwd(),
      announce: (message) => process.stdout.write(`${message}\n`),
    });
    const flags: Flags = { ...scanned, doc };
    switch (subaction) {
      case 'next':
        process.stdout.write(readyList(loadRoadmap(flags.doc, opts)));
        return;
      case 'blocked':
        process.stdout.write(blockedReport(loadRoadmap(flags.doc, opts)));
        return;
      case 'blocks':
        emitBlocks(loadRoadmap(flags.doc, opts), flags);
        return;
      case 'order':
        emitOrder(loadRoadmap(flags.doc, opts));
        return;
      case 'graph':
        process.stdout.write(mermaid(loadRoadmap(flags.doc, opts)));
        return;
      case 'add':
        emitAdd(flags, opts);
        return;
      case 'advance':
        emitAdvance(flags, opts);
        return;
      case 'decompose':
        emitDecompose(flags, opts);
        return;
      case 'reclassify':
        emitReclassify(flags, opts);
        return;
      case 'defer':
        emitDefer(flags, opts);
        return;
      case 'cluster':
      case 'group':
        emitCluster(flags, opts, subaction);
        return;
      case 'reconcile':
        emitReconcile(flags, opts);
        return;
      case 'close-related':
        emitCloseRelated(loadRoadmap(flags.doc, opts), flags);
        return;
    }
    // Exhaustiveness backstop (AUDIT-20260610-09): the pre-dispatch guard only
    // rejects subactions ABSENT from SUBACTION_SPECS. A subaction REGISTERED in
    // SUBACTION_SPECS but missing a `case` above would otherwise fall through and
    // return exit 0 — a silent no-op. `subaction` is typed `string` (from args[0]),
    // not a union, so the `never` assignment can't be a compile-time check here;
    // the runtime fail-loud below restores the loud-failure guarantee.
    failUsage('roadmap', `unhandled subaction '${subaction}' (registered in grammar but no dispatch case)`);
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(err.code === 'escape' || err.code === 'collision' ? 2 : 1);
    }
    if (err instanceof DocumentModelError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(2);
    }
    if (err instanceof BacklogError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(1);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}

/**
 * The original flat hand-rolled dispatcher, retained as the behavior reference
 * and for any direct caller. The live dispatch path (`cli.ts`) now routes
 * `roadmap` through the commander mount (roadmap-command.ts), which reuses
 * `executeRoadmapSubaction` so both paths share one error-mapping core (027 T004).
 */
export async function runRoadmapCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('roadmap', 'a subaction is required (usage: roadmap <next|blocked|add> [flags])');
  }
  // Reject an unknown subaction before resolving the doc, so an unknown verb is a
  // usage error (exit 2) rather than triggering installation resolution.
  if (SUBACTION_SPECS[subaction] === undefined) {
    failUsage('roadmap', `unknown subaction '${subaction}' (known: ${KNOWN_SUBACTIONS})`);
  }
  const scanned = preflightRoadmapFlags(subaction, args.slice(1));
  await executeRoadmapSubaction(subaction, scanned);
}
