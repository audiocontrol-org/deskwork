// Report-only reconciliation (006 US5, FR-016/016a/016b/017, R-reconcile).
// Compares each roadmap item's recorded status against the on-disk artifact
// progression at its `spec:` correspondence path, and lists orphan spec dirs +
// unresolved correspondences. PROPOSES ONLY — never mutates a status (FR-017);
// no git/gh. The operator applies any proposal via `roadmap advance`.
//
// Artifact-progression signal (no git/gh, no fabricated data): a spec dir whose
// `tasks.md` exists and has every checkbox checked is treated as complete ⇒ a
// `shipped` proposal. (A dedicated governance-graduation record is not yet an
// on-disk artifact — see audiocontrol-org/deskwork#434; tasks-completion is the
// strongest available real signal, and reconcile only PROPOSES, so the operator
// confirms.)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { LoadOptions } from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';
import { add, setField, type MutationResult } from './mutations.js';
import { loadRoadmap } from './roadmap-model.js';

export interface StatusDrift {
  readonly identifier: string;
  readonly recorded: string;
  readonly onDisk: string;
  readonly proposal: string;
}

export interface ReconciliationReport {
  readonly statusDrift: readonly StatusDrift[];
  readonly orphans: readonly string[];
  readonly unresolved: readonly string[];
}

/**
 * True iff `tasks.md` exists with ≥1 checkbox-shaped task and EVERY one is
 * checked (`[x]`/`[X]`). Any other marker — `[ ]`, `[~]`, or any other single
 * char inside the brackets — counts as NOT complete and blocks the verdict
 * (AUDIT-20260608-10): a partially-done feature must never read as "complete".
 */
function tasksComplete(tasksPath: string): boolean {
  if (!existsSync(tasksPath)) return false;
  const text = readFileSync(tasksPath, 'utf8');
  const all = text.match(/^\s*- \[.\]/gm) ?? [];
  if (all.length === 0) return false;
  const done = text.match(/^\s*- \[[xX]\]/gm) ?? [];
  return done.length === all.length;
}

/** Normalize a spec path for comparison (strip a single trailing slash). */
function normalize(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/** The parent segment of a glob of the form `specs/<id>/spec.md` (e.g. `specs`). */
export function globParent(source: string): string | null {
  const idx = source.indexOf('/*/');
  return idx > 0 ? source.slice(0, idx) : null;
}

/** Spec dirs (relative paths) under the glob parent that contain a `spec.md`. */
function discoverSpecDirs(baseDir: string, parent: string): string[] {
  const root = join(baseDir, parent);
  if (!existsSync(root)) return [];
  const dirs: string[] = [];
  for (const entry of readdirSync(root)) {
    const abs = join(root, entry);
    if (statSync(abs).isDirectory() && existsSync(join(abs, 'spec.md'))) {
      dirs.push(`${parent}/${entry}`);
    }
  }
  return dirs;
}

/**
 * Produce a reconciliation report for the roadmap at `docPath`. Spec paths
 * resolve relative to `baseDir` (the repo root in practice). Report-only.
 */
export function reconcile(
  docPath: string,
  opts: LoadOptions,
  baseDir: string,
): ReconciliationReport {
  const model = loadRoadmap(docPath, opts);

  // Fail loud on a wrong/misconfigured base: when the grammar declares a glob
  // reconciliation hook but the glob-parent dir is absent under `baseDir`, every
  // `spec:` path would silently fail `existsSync` and report all-unresolved
  // (AUDIT-20260608-15). A genuinely-empty `specs/` is a valid project state and
  // does NOT trip this guard — only a missing parent dir does.
  const hook = model.doc.grammar.reconciliationHook;
  const globParentDir = hook !== null && hook.kind === 'glob' ? globParent(hook.source) : null;
  if (globParentDir !== null && !existsSync(join(baseDir, globParentDir))) {
    throw new DocumentModelError(
      `reconcile base '${baseDir}' does not contain the reconciliation glob-parent '${globParentDir}/' ` +
        `(spec correspondences resolve relative to this base; a wrong base must not silently report all-unresolved)`,
    );
  }

  const statusDrift: StatusDrift[] = [];
  const unresolved: string[] = [];
  const referenced = new Set<string>();

  for (const item of model.items) {
    if (item.spec === null) continue; // not reconcilable — no correspondence
    const rel = normalize(item.spec);
    referenced.add(rel);
    const specDir = join(baseDir, rel);
    if (!existsSync(specDir) || !existsSync(join(specDir, 'spec.md'))) {
      unresolved.push(item.identifier); // correspondence cannot be resolved — never guessed
      continue;
    }
    if (tasksComplete(join(specDir, 'tasks.md')) && item.status !== 'shipped') {
      statusDrift.push({
        identifier: item.identifier,
        recorded: item.status,
        onDisk: 'shipped',
        proposal: `advance ${item.identifier} to shipped (tasks complete at ${rel})`,
      });
    }
  }

  const orphans =
    globParentDir === null
      ? []
      : discoverSpecDirs(baseDir, globParentDir).filter((dir) => !referenced.has(normalize(dir)));

  return { statusDrift, orphans, unresolved };
}

/**
 * Derive a roadmap node identifier from an orphan spec dir's basename. A spec dir
 * `specs/099-emergent-feature` → slug `099-emergent-feature` → `impl:feature/<slug>`.
 * The slug is sanitized to the grammar's `[^\s/:]+` slug shape (drop disallowed
 * chars); fail loud if nothing usable remains.
 */
/** Default node-type prefix for an unorphaned node when `--type` is not given. */
export const DEFAULT_UNORPHAN_TYPE = 'impl:feature';

export function nodeIdForOrphan(specRel: string, typePrefix: string = DEFAULT_UNORPHAN_TYPE): string {
  const slug = basename(normalize(specRel)).replace(/[\s/:]+/g, '-');
  if (slug.length === 0) {
    throw new DocumentModelError(
      `reconcile --unorphan: cannot derive a node slug from spec dir '${specRel}'`,
    );
  }
  // The type prefix (`<phase>:<kind>`, e.g. impl:feature / design:gap) is
  // operator-supplied via --type — an orphan spec is not necessarily an
  // impl:feature; defaulting every orphan to impl:feature would mistype a design
  // or multi spec (AUDIT-BARRAGE-claude-06, Phase 4).
  if (!/^[^\s/:]+:[^\s/:]+$/.test(typePrefix)) {
    throw new DocumentModelError(
      `reconcile --unorphan: --type '${typePrefix}' must be a '<phase>:<kind>' prefix ` +
        `(e.g. impl:feature, design:gap, multi:feature)`,
    );
  }
  return `${typePrefix}/${slug}`;
}

/**
 * Resolve a reported orphan spec dir into a roadmap node + a `spec:` edge
 * (FR-015; TASK-133) — the sanctioned `--unorphan` assist that closes the orphan
 * WITHOUT a forbidden ROADMAP.md hand-edit (it reuses the `add` node/edge
 * mutation). A `<spec>` that is NOT actually an orphan (already referenced, or not
 * a discoverable orphan under the glob parent) fails loud (exit-2 class) — never
 * reconcile against a wrong/non-orphan base. The candidate is re-validated by the
 * underlying mutation; dry-run unless `apply`.
 */
export function reconcileUnorphan(
  docPath: string,
  spec: string,
  opts: LoadOptions,
  baseDir: string,
  apply: boolean,
  typePrefix?: string,
): MutationResult {
  const report = reconcile(docPath, opts, baseDir);
  const target = normalize(spec);
  if (!report.orphans.map(normalize).includes(target)) {
    throw new DocumentModelError(
      `reconcile --unorphan: '${spec}' is not a reported orphan spec dir ` +
        `(orphans: ${report.orphans.length === 0 ? 'none' : report.orphans.join(', ')}) — ` +
        `refusing to reconcile against a non-orphan`,
    );
  }
  // gh-506: before minting, check whether an EXISTING node already corresponds to
  // this spec by slug family — an orphan `specs/010-faithful-capture-substrate`
  // and a node `design:feature/faithful-capture-substrate` are the same feature
  // (the node slug equals the spec slug with the `NNN-` numeric prefix stripped).
  // Silently minting a parallel `impl:feature/<NNN-slug>` doubles the node count
  // and leaves the roadmap internally inconsistent. Reuse the existing
  // correspondence; refuse (never mint a duplicate) when the match is ambiguous.
  const specSlug = basename(target);
  const featureSlug = specSlug.replace(/^\d+-/, '');
  const slugOf = (id: string): string => id.slice(id.lastIndexOf('/') + 1);
  const matches = loadRoadmap(docPath, opts).items.filter((i) => {
    const s = slugOf(i.identifier);
    return s === featureSlug || s === specSlug;
  });
  if (matches.length > 1) {
    throw new DocumentModelError(
      `reconcile --unorphan: ${matches.length} existing nodes plausibly correspond to '${spec}' ` +
        `(${matches.map((m) => m.identifier).join(', ')}) — refusing to mint a duplicate. ` +
        `Attach the spec to the right one with \`workflow link-spec <node> ${spec}\`.`,
    );
  }
  if (matches.length === 1) {
    const node = matches[0]!;
    const existingSpec = node.spec === null ? null : normalize(node.spec);
    if (existingSpec !== null && existingSpec !== target) {
      throw new DocumentModelError(
        `reconcile --unorphan: existing node '${node.identifier}' already corresponds to spec ` +
          `'${node.spec}' (not '${spec}') — refusing to clobber. Relink it deliberately with ` +
          `\`workflow link-spec\`, or remove the stale pointer first.`,
      );
    }
    // Reuse the existing node's correspondence instead of minting a parallel node
    // (the `setField` substrate behind `workflow link-spec`). The node's own type
    // is authoritative, so any `--type` is moot on the reuse path.
    return setField(docPath, node.identifier, 'spec', target, opts, apply);
  }
  // No existing correspondence — mint a new node. `spec:` records the spec
  // DIRECTORY (the project convention, e.g. `specs/005-document-primitives`), NOT
  // a path to `spec.md` — reconcile resolves `<spec>/spec.md` itself.
  return add(docPath, { identifier: nodeIdForOrphan(target, typePrefix), spec: target }, opts, apply);
}
