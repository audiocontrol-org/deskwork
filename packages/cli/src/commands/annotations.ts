/**
 * deskwork annotations — enumerate an entry's comment annotations and
 * surface their disposition (Issue #267).
 *
 * Motivation: `deskwork iterate` reports `addressedComments: []` with no
 * way to SEE which comments are still pending on an entry. This verb is a
 * thin read over the entry-keyed annotation store.
 *
 * Disposition model (per DESKWORK-STATE-MACHINE.md + review/types.ts): a
 * `comment` annotation carries NO disposition itself. Disposition is
 * recorded by separate `address` annotations that reference a comment by
 * `commentId` (latest-`createdAt`-wins per comment id, mirroring the
 * studio's `latestAddressByCommentId` fold). A comment with no `address`
 * annotation is PENDING.
 *
 * Pending representation in --json: the literal string "pending" in the
 * `disposition` field (NOT null). This keeps `disposition` a single
 * string type across pending + dispositioned comments, so consumers can
 * switch on one field.
 *
 * Usage:
 *   deskwork annotations <project-root> <slug-or-uuid> [--all] [--json]
 *
 * Default (no --all): show only PENDING comments.
 * --all:  include dispositioned comments too, each with its disposition.
 * --json: emit structured JSON (matches the doctor --json style).
 *
 * Exit codes:
 *   0  Success (including the empty-pending case).
 *   1  Entry not found (descriptive error; never a silent empty success).
 *   2  Usage error (no slug-or-uuid arg, unknown flag).
 */

import { absolutize, fail, parseArgs } from '@deskwork/core/cli-args';
import { resolveEntryUuid, readSidecar } from '@deskwork/core/sidecar';
import { listEntryAnnotations } from '@deskwork/core/entry/annotations';
import type {
  AddressAnnotation,
  CommentAnnotation,
  DraftAnnotation,
} from '@deskwork/core/review/types';

const BOOLEAN_FLAGS = ['all', 'json'] as const;

const USAGE =
  'Usage: deskwork annotations <project-root> <slug-or-uuid> [--all] [--json]';

/** The literal used to represent a comment that has no disposition yet. */
const PENDING = 'pending';

type Disposition = AddressAnnotation['disposition'] | typeof PENDING;

interface SurfacedComment {
  commentId: string;
  disposition: Disposition;
  text: string;
  version: number;
  range: { start: number; end: number };
  category?: string;
  anchor?: string;
}

export async function run(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(argv, [], BOOLEAN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  const { positional, booleans } = parsed;

  if (positional.length < 2) {
    fail(USAGE, 2);
  }

  const [rootArg, slugOrId] = positional;
  const projectRoot = absolutize(rootArg);
  const showAll = booleans.has('all');
  const json = booleans.has('json');

  // Resolve slug → uuid. `resolveEntryUuid` passes a uuid-shaped input
  // through unchanged and throws a descriptive error for an unknown slug.
  let uuid: string;
  try {
    uuid = await resolveEntryUuid(projectRoot, slugOrId);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Confirm the entry actually exists. `resolveEntryUuid` returns a
  // uuid-shaped input verbatim WITHOUT checking it resolves to a real
  // sidecar; reading the sidecar turns "unknown uuid" into a descriptive
  // error instead of a silent empty list (per the no-fallback rule).
  try {
    await readSidecar(projectRoot, uuid);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const annotations = await listEntryAnnotations(projectRoot, uuid);
  const surfaced = surfaceComments(annotations, showAll);

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ entryId: uuid, annotations: surfaced }, null, 2)}\n`,
    );
    process.exit(0);
  }

  emitText(uuid, surfaced, showAll);
  process.exit(0);
}

/**
 * Reduce the folded annotation stream to the comments to surface, each
 * tagged with its disposition. Disposition is the latest `address`
 * annotation per `commentId` (newest `createdAt` wins); absence = pending.
 * In default mode, only pending comments are returned.
 */
function surfaceComments(
  annotations: DraftAnnotation[],
  showAll: boolean,
): SurfacedComment[] {
  const dispositionByCommentId = latestDispositionByCommentId(annotations);

  const out: SurfacedComment[] = [];
  for (const a of annotations) {
    if (a.type !== 'comment') continue;
    const disposition = dispositionByCommentId.get(a.id) ?? PENDING;
    if (!showAll && disposition !== PENDING) continue;
    out.push(toSurfaced(a, disposition));
  }
  return out;
}

/**
 * Map each `commentId` to its latest `address` annotation's disposition,
 * picking the newest by `createdAt`. Mirrors the studio's
 * `latestAddressByCommentId` fold.
 */
function latestDispositionByCommentId(
  annotations: DraftAnnotation[],
): Map<string, AddressAnnotation['disposition']> {
  const addresses: AddressAnnotation[] = annotations.filter(
    (a): a is AddressAnnotation => a.type === 'address',
  );
  addresses.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const map = new Map<string, AddressAnnotation['disposition']>();
  for (const a of addresses) map.set(a.commentId, a.disposition);
  return map;
}

function toSurfaced(
  comment: CommentAnnotation,
  disposition: Disposition,
): SurfacedComment {
  return {
    commentId: comment.id,
    disposition,
    text: comment.text,
    version: comment.version,
    range: { start: comment.range.start, end: comment.range.end },
    ...(comment.category !== undefined ? { category: comment.category } : {}),
    ...(comment.anchor !== undefined ? { anchor: comment.anchor } : {}),
  };
}

function emitText(
  uuid: string,
  surfaced: SurfacedComment[],
  showAll: boolean,
): void {
  if (surfaced.length === 0) {
    if (showAll) {
      process.stdout.write(`No annotations on entry ${uuid}.\n`);
    } else {
      process.stdout.write(`No pending annotations on entry ${uuid}.\n`);
    }
    return;
  }

  const pendingCount = surfaced.filter(
    (s) => s.disposition === PENDING,
  ).length;
  const header = showAll
    ? `${surfaced.length} annotation(s) on entry ${uuid} (${pendingCount} pending):`
    : `${surfaced.length} pending annotation(s) on entry ${uuid}:`;
  process.stdout.write(`${header}\n\n`);

  for (const s of surfaced) {
    const cat = s.category !== undefined ? ` {${s.category}}` : '';
    process.stdout.write(
      `  [${s.disposition}] ${s.commentId}${cat} (v${s.version}, range ${s.range.start}-${s.range.end})\n`,
    );
    process.stdout.write(`      ${oneLine(s.text)}\n`);
  }
}

/** Collapse a multi-line comment to a single display line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
