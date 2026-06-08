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
import { join } from 'node:path';
import type { LoadOptions } from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';
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
