// `roadmap resolves <node> [--add …] [--remove …] [--apply]` (031 US2, FR-008/
// FR-009; contract roadmap-resolves.md) — record resolved backlog ids onto a
// node's PROSE `closes:` set without a hand-edit and without misusing the unit-
// reference-edge machinery (which correctly refuses the prose `closes` field).
//
// Extracted out of roadmap.ts to keep that file under the 500-line cap (it
// composes the pure `closes-mutation` engine + the shared commit substrate). The
// engine computes the before/after canonical sets + the rewritten source; this
// arm renders the dry-run (`before → after`) and, on `--apply`, re-validates the
// candidate (zero-write on failure) and writes via commitCandidate.

import type { LoadOptions } from '../document-model/document.js';
import { commitCandidate } from '../document-model/mutations-core.js';
import { DocumentModelError } from '../document-model/types.js';
import { computeCloses, type ClosesChange, type ClosesMutation } from '../roadmap/closes-mutation.js';
import { failUsage } from './document-verb-shared.js';
import type { Flags } from './roadmap.js';

/** Render a closes set for the dry-run line ("(none)" when empty). */
function renderSet(ids: readonly string[]): string {
  return ids.length === 0 ? '(none)' : ids.join(', ');
}

/**
 * `roadmap resolves <node> [--add A B …] [--remove A …] [--apply]`. At least one
 * of `--add`/`--remove` is required (neither → exit 1, fail-loud per contract).
 * Dry-run by default: prints `closes: <before> → <after>` and writes NOTHING.
 * `--apply` re-validates the candidate and writes (zero-write on a validation
 * failure). Idempotent: a no-op (every add present, every remove absent) is
 * reported, not an error.
 */
export function emitResolves(flags: Flags, opts: LoadOptions): void {
  const id = flags.positionals[0];
  if (id === undefined) failUsage('roadmap', 'resolves requires an <identifier> positional');
  const add = flags.multiValues.get('add');
  const remove = flags.multiValues.get('remove');
  if (add === undefined && remove === undefined) {
    // Neither flag is a fail-loud (exit 1) per the contract — DocumentModelError
    // would be exit 2; this is a deliberate exit-1 surface. Write to stderr and
    // exit 1 directly (the verb's catch maps the document/installation classes).
    process.stderr.write(
      'roadmap: resolves requires at least one of --add <ids…> / --remove <ids…>\n',
    );
    process.exit(1);
  }
  const change: ClosesChange = { add, remove };
  // Per contract roadmap-resolves.md, a node-not-found / unreadable roadmap is a
  // fail-loud exit 1 (NOT the exit-2 validation class). Map the DocumentModelError
  // the engine throws on a missing node to exit 1 here; a candidate-validation
  // failure on apply (commitCandidate, below) stays exit 2 via the verb's catch.
  let result: ClosesMutation;
  try {
    result = computeCloses(flags.doc, id, change, opts);
  } catch (err) {
    if (err instanceof DocumentModelError) {
      process.stderr.write(`roadmap: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  if (!flags.apply) {
    process.stdout.write(
      `roadmap resolves ${id}: dry-run — closes: ${renderSet(result.before)} -> ${renderSet(result.after)} ` +
        `(use --apply to write)\n`,
    );
    return;
  }
  if (!result.changed) {
    process.stdout.write(
      `roadmap resolves ${id}: no change — closes: ${renderSet(result.after)} (already at the requested set)\n`,
    );
    return;
  }
  commitCandidate(flags.doc, result.text, opts, true);
  process.stdout.write(
    `roadmap resolves ${id}: applied — closes: ${renderSet(result.before)} -> ${renderSet(result.after)}\n`,
  );
}
