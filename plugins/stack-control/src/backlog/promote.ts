// T006/T008/T015 (012) — the record-only backlog→feature-rigor promotion writer.
// Mirrors the inbox `promote` CONTRACT (record-don't-create, a greppable
// `Promoted-to:` linkage, a `promoted` marker, a terminal-state guard,
// dry-run-by-default) but NOT its implementation: the backlog is a different
// substrate (one backlog.md task file per item via the CLI adapter), so this is
// its own writer composed over the backlog backend (D1). It NEVER creates the
// target (FR-004) and NEVER partially applies — the whole batch is validated
// before any write (all-or-nothing, SC-002).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BacklogBackend } from './backend.js';
import { PROMOTED_LABEL, promotedToLine } from './mappings.js';
import type { PromoteTarget } from './promote-targets.js';

/** A named item already carries the `promoted` label → re-promotion refused
 * (FR-006). The verb maps this to a usage error (exit 2). */
export class PromoteAlreadyPromotedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromoteAlreadyPromotedError';
  }
}

/** A named item does not exist in the store → fail loud (FR-009). The verb maps
 * this to a runtime error (exit 1). */
export class PromoteItemMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromoteItemMissingError';
  }
}

export interface PromoteRequest {
  /** One id (single) or N ids (batch — caller already enforced batch is tasks:-only). */
  readonly ids: readonly string[];
  readonly target: PromoteTarget;
  /** Absent ⇒ dry-run (report only, zero write) (FR-008). */
  readonly apply: boolean;
  readonly backend: BacklogBackend;
  /** Dir the target.path is resolved against for the pending-create advisory (D4). */
  readonly cwd: string;
}

export interface PromoteResult {
  /** The ids recorded (apply) or that would be recorded (dry-run), in input order. */
  readonly recorded: readonly string[];
  readonly targetRef: string;
  readonly applied: boolean;
  /** Set when the target has a filesystem path that does not yet exist (D4) —
   * the operator's create step is still pending; advisory, not an error. */
  readonly pendingCreate?: string;
}

/**
 * Record the promotion linkage on each named item (record-only). Validates the
 * WHOLE batch first — every id must exist and be un-promoted — then, only under
 * `apply`, writes the `promoted` label + the `Promoted-to:` linkage additively
 * (preserving every pre-existing field, FR-013). Any precondition failure throws
 * before a single write (all-or-nothing). Reads labels via the backend's
 * file-frontmatter projection (as `exists()` does — `list --plain` exposes
 * neither, D6).
 */
export function promote(req: PromoteRequest): PromoteResult {
  const byId = new Map(req.backend.list().map((i) => [i.id, i]));

  // Validate the entire batch before any mutation (SC-002, all-or-nothing).
  for (const id of req.ids) {
    const item = byId.get(id);
    if (item === undefined) {
      throw new PromoteItemMissingError(
        `backlog item '${id}' does not exist — promote records a linkage on an existing item`,
      );
    }
    if (item.labels.includes(PROMOTED_LABEL)) {
      throw new PromoteAlreadyPromotedError(
        `backlog item '${id}' is already promoted — re-promotion is refused (FR-006)`,
      );
    }
  }

  const pendingCreate =
    req.target.path !== undefined && !existsSync(resolve(req.cwd, req.target.path))
      ? req.target.path
      : undefined;

  if (req.apply) {
    for (const id of req.ids) {
      req.backend.edit(id, {
        addLabel: PROMOTED_LABEL,
        appendNotes: promotedToLine(req.target.ref),
      });
    }
  }

  return { recorded: req.ids, targetRef: req.target.ref, applied: req.apply, pendingCreate };
}
