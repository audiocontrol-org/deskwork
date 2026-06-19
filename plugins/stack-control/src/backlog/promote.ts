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

/** The same id appears more than once in a batch → usage error (exit 2), zero
 * write — a duplicate would append a second `Promoted-to:` linkage, violating
 * the no-duplicate-linkage guard (AUDIT-BARRAGE codex-01). */
export class PromoteDuplicateIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromoteDuplicateIdError';
  }
}

/**
 * A batch write failed PART-WAY through (AUDIT-BARRAGE claude-01 ≡ codex-02).
 * Preflight validation is all-or-nothing, but the per-item writes are not
 * transactional — the shelled backlog.md CLI owns the task-file format (D6) and
 * exposes no multi-task atomic edit, so a backend failure on item k+1 leaves
 * items 1..k genuinely promoted. This is the HONEST surface of that state: it
 * names exactly which ids were written so the operator retries only the
 * remainder (a re-run of the whole batch is safely refused by the idempotency
 * guard on the already-written items). The verb maps it to a runtime exit 1.
 */
export class PromotePartialWriteError extends Error {
  readonly written: readonly string[];
  readonly failedId: string;
  constructor(written: readonly string[], failedId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `promote partially applied — recorded [${written.join(', ')}] then failed on ${failedId}: ${detail}. ` +
        `The recorded items are promoted; re-run promote on the REMAINING ids only (already-promoted ids are refused).`,
    );
    this.name = 'PromotePartialWriteError';
    this.written = written;
    this.failedId = failedId;
  }
}

/** An item targeted for unpromote carries NO promotion linkage → there is
 * nothing to remove (028 FR-012, contract B3). The verb maps this to a usage
 * error (exit 2): asking to unpromote a never-promoted item is a no-op the
 * operator should know about, not a silent success. */
export class UnpromoteNotPromotedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnpromoteNotPromotedError';
  }
}

export interface UnpromoteRequest {
  readonly id: string;
  /** Absent ⇒ dry-run (report only, zero write). */
  readonly apply: boolean;
  readonly backend: BacklogBackend;
}

export interface UnpromoteResult {
  readonly id: string;
  readonly applied: boolean;
}

/** The greppable token of the promotion-linkage notes line (mirrors
 * promotedToLine's bold bullet). Used to strip exactly that line on unpromote. */
const PROMOTED_TO_TOKEN = '**Promoted-to:**';

/** Strip every promotion-linkage line from a notes block, returning the
 * remaining notes (trimmed). */
function stripPromotedToLines(notes: string): string {
  return notes
    .split('\n')
    .filter((line) => !line.includes(PROMOTED_TO_TOKEN))
    .join('\n')
    .trim();
}

/**
 * Remove the promotion linkage `promote` recorded — the exact inverse (028
 * FR-012). Validates the item exists (missing → PromoteItemMissingError, exit 1)
 * and actually carries a promotion linkage (the `promoted` label OR a
 * `Promoted-to:` notes line); a never-promoted item throws
 * UnpromoteNotPromotedError (exit 2) with zero write. On `apply`, removes the
 * `promoted` label AND strips the `Promoted-to:` line(s) from the notes,
 * preserving every other label and notes line (FR-013). Reads labels/notes via
 * the backend's file-frontmatter projection (as promote does — `list --plain`
 * exposes neither, D6).
 */
export function unpromote(req: UnpromoteRequest): UnpromoteResult {
  const item = req.backend.list().find((i) => i.id === req.id);
  if (item === undefined) {
    throw new PromoteItemMissingError(
      `backlog item '${req.id}' does not exist — unpromote removes the linkage from an existing item`,
    );
  }
  const notes = req.backend.readNotes(req.id);
  const hasLabel = item.labels.includes(PROMOTED_LABEL);
  const hasLine = notes.includes(PROMOTED_TO_TOKEN);
  if (!hasLabel && !hasLine) {
    throw new UnpromoteNotPromotedError(
      `backlog item '${req.id}' carries no promotion linkage — nothing to unpromote`,
    );
  }

  if (req.apply) {
    req.backend.edit(req.id, {
      ...(hasLabel ? { removeLabel: PROMOTED_LABEL } : {}),
      setNotes: stripPromotedToLines(notes),
    });
  }

  return { id: req.id, applied: req.apply };
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
 * WHOLE batch first — no duplicate ids, every id exists and is un-promoted — so
 * any **preflight** failure throws before a single write (all-or-nothing on the
 * validation axis). Then, under `apply`, writes the `promoted` label + the
 * `Promoted-to:` linkage additively (preserving every pre-existing field,
 * FR-013). The per-item writes are NOT transactional: the shelled backlog.md CLI
 * exposes no multi-task atomic edit (D6), so a backend failure mid-batch leaves
 * the already-written items promoted and raises PromotePartialWriteError naming
 * them (the honest surface — see that error's doc). Reads labels via the
 * backend's file-frontmatter projection (as `exists()` does — `list --plain`
 * exposes neither, D6).
 */
export function promote(req: PromoteRequest): PromoteResult {
  // Preflight: reject duplicate ids before any store access (codex-01) — a
  // repeated id would append a second linkage, violating the no-duplicate guard.
  const seen = new Set<string>();
  for (const id of req.ids) {
    if (seen.has(id)) {
      throw new PromoteDuplicateIdError(`backlog item '${id}' is listed more than once in the batch`);
    }
    seen.add(id);
  }

  const byId = new Map(req.backend.list().map((i) => [i.id, i]));

  // Validate the entire batch before any mutation (preflight all-or-nothing).
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
    const written: string[] = [];
    for (const id of req.ids) {
      try {
        req.backend.edit(id, {
          addLabel: PROMOTED_LABEL,
          appendNotes: promotedToLine(req.target.ref),
        });
      } catch (err) {
        // Non-transactional mid-batch failure: surface what already landed so the
        // operator retries only the remainder (claude-01 ≡ codex-02).
        throw new PromotePartialWriteError(written, id, err);
      }
      written.push(id);
    }
  }

  return { recorded: req.ids, targetRef: req.target.ref, applied: req.apply, pendingCreate };
}
