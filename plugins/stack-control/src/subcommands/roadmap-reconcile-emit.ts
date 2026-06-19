// The `roadmap reconcile` emit handler + its base-dir resolver. Split out of
// roadmap.ts to keep that file under the size cap. `reconcile` is report-only by
// default; `--unorphan <spec>` is the single MUTATING assist (028 US2, FR-015) —
// it resolves a reported orphan spec dir into a node + spec: edge WITHOUT a
// ROADMAP.md hand-edit (reusing the node/edge mutations). A non-orphan `<spec>`
// fails loud (exit 2) inside reconcileUnorphan.

import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { LoadOptions } from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';
import { globParent, reconcile, reconcileUnorphan } from '../roadmap/reconcile.js';
import { loadRoadmap } from '../roadmap/roadmap-model.js';
import type { Flags } from './roadmap.js';

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

export function emitReconcile(flags: Flags, opts: LoadOptions): void {
  // Spec paths resolve relative to wherever the glob-parent dir (e.g. `specs/`)
  // lives, derived from the DOC's location — not the invocation cwd. This makes
  // `roadmap reconcile` correct from any working directory (AUDIT-20260608-15).
  const model = loadRoadmap(flags.doc, opts);
  const hook = model.doc.grammar.reconciliationHook;
  const globParentDir = hook !== null && hook.kind === 'glob' ? globParent(hook.source) : null;
  const baseDir = reconcileBaseDir(flags.doc, globParentDir);

  // `--unorphan <spec>` is the single MUTATING reconcile assist: resolve a
  // reported orphan into a node + spec: edge (no ROADMAP.md hand-edit). A
  // non-orphan `<spec>` fails loud (exit 2) inside reconcileUnorphan. Bare
  // `reconcile` (no `--unorphan`) stays report-only below.
  const unorphan = flags.values.get('unorphan');
  if (unorphan !== undefined) {
    const result = reconcileUnorphan(flags.doc, unorphan, opts, baseDir, flags.apply);
    process.stdout.write(
      result.applied
        ? `roadmap reconcile --unorphan: resolved ${unorphan} into a node\n`
        : `roadmap reconcile --unorphan: dry-run — would resolve ${unorphan} into a node (use --apply to write)\n`,
    );
    return;
  }

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
