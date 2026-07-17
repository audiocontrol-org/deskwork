// specs/036-fleet-control-plane — T097 (impl), pairs with the RED tests at
// tests/fleet/object-key.test.ts (T089) and tests/fleet/late-event.test.ts
// (T093), plus tests/fleet/archive-manifest-order.test.ts (this task's own
// ordering test).
//
// The archive writer owns immutable per-event objects and the run manifest.
//
// data-model.md § Storage layout (line ~134) + research.md R-01:
//   - The event object key is `runs/{installationId}/{runId}/events/{seq}.json`
//     where `{seq}` is the invocationSequence zero-padded to a fixed width
//     (10 digits, matching the T008 port-test precedent). `eventId` lives
//     INSIDE the object body, NEVER in the key — so the plane can PROBE the
//     sequence (0, 1, 2, … → 404) without already knowing the id it is
//     discovering, and keys sort lexicographically in numeric order.
//   - The manifest key is `runs/{installationId}/{runId}/manifest-{rev}.json`
//     at the run root.
//
// § Storage layout invariants:
//   - Published event objects are never mutated (FR-066). A duplicate PUT at
//     the same key is a harmless no-op by byte-identity (FR-049) — the writer
//     relies on that, it does not re-read to avoid it.
//   - ORDERING CONTRACT (T097 core): a manifest is written STRICTLY AFTER all
//     of its referenced event PUTs have acked. `writeManifest` awaits every
//     event's `putObject` before issuing the manifest `putObject`.
//
// Relative `.js` imports (node16 module resolution, no `@/` alias). No `any`,
// no `as`, no `@ts-ignore`. Throws descriptive errors — never a fallback.

import type { ObjectStorePort } from '../../storage/port.js';

/** Fixed key width for the zero-padded invocationSequence — matches the T008
 * port-test precedent (`tests/fleet/storage-port.test.ts`). */
const SEQUENCE_KEY_WIDTH = 10;

/** Reject a value that cannot be a valid, sortable sequence position. A
 * non-integer or negative sequence would produce a nonsense (unsortable) key,
 * which is a caller bug — surface it loudly rather than silently padding it. */
function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${label} must be a non-negative integer, received: ${String(value)}`,
    );
  }
}

/** Reject a revision that is not a positive integer. Revisions start at 1
 * (the plane's own index supplies them); 0 or a fraction is a caller bug. */
function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `${label} must be a positive integer (>= 1), received: ${String(value)}`,
    );
  }
}

/** Inputs to `eventObjectKey`. Deliberately carries NO `eventId` — the key is
 * constructible from the run coordinates + sequence alone (research.md R-01). */
export interface EventObjectKeyInput {
  readonly installationId: string;
  readonly runId: string;
  readonly invocationSequence: number;
}

/**
 * Deterministic object key for a single archived event.
 *
 * `runs/{installationId}/{runId}/events/{invocationSequence padded to 10}.json`
 *
 * The padding makes plain string comparison (a bucket LIST / directory sort)
 * agree with numeric order across digit-count boundaries (2 sorts before 10).
 * `eventId` is intentionally absent — it lives inside the object body so the
 * plane can build the URL by counting alone.
 */
export function eventObjectKey(input: EventObjectKeyInput): string {
  assertNonNegativeInteger(input.invocationSequence, 'invocationSequence');
  const padded = String(input.invocationSequence).padStart(SEQUENCE_KEY_WIDTH, '0');
  return `runs/${input.installationId}/${input.runId}/events/${padded}.json`;
}

/** Inputs to `manifestObjectKey`. */
export interface ManifestObjectKeyInput {
  readonly installationId: string;
  readonly runId: string;
  readonly revision: number;
}

/**
 * Deterministic object key for a run manifest revision.
 *
 * `runs/{installationId}/{runId}/manifest-{revision}.json`
 *
 * The revision lives in the key so a new manifest is a new URL — an old
 * manifest is never overwritten (same immutability discipline as events).
 */
export function manifestObjectKey(input: ManifestObjectKeyInput): string {
  assertPositiveInteger(input.revision, 'revision');
  return `runs/${input.installationId}/${input.runId}/manifest-${input.revision}.json`;
}

/** The object store the writer archives into. */
export interface ArchiveWriterDeps {
  readonly store: ObjectStorePort;
}

/** Inputs to `archiveEvent`. `body` is the full serialized event object —
 * `eventId` is carried inside it, never in the key. */
export interface ArchiveEventInput {
  readonly installationId: string;
  readonly runId: string;
  readonly invocationSequence: number;
  readonly body: Uint8Array;
}

/**
 * Archive a single event as an immutable object at its deterministic key.
 *
 * Immutability is a property of the KEY (sequence-derived, unique within a
 * run) plus the port's byte-identity no-op on duplicate PUT (FR-049) — this
 * writer issues a single `putObject` and never re-reads to guard it.
 */
export async function archiveEvent(
  deps: ArchiveWriterDeps,
  input: ArchiveEventInput,
): Promise<{ key: string }> {
  const key = eventObjectKey({
    installationId: input.installationId,
    runId: input.runId,
    invocationSequence: input.invocationSequence,
  });
  await deps.store.putObject({ key, body: input.body });
  return { key };
}

/** Inputs to `writeManifest`. The manifest references a set of events; the
 * writer archives them all, THEN writes the manifest (ordering contract). */
export interface WriteManifestInput {
  readonly installationId: string;
  readonly runId: string;
  readonly revision: number;
  readonly events: readonly ArchiveEventInput[];
  readonly manifestBody: Uint8Array;
}

/**
 * Write a run manifest STRICTLY AFTER every event it references has been
 * archived and acked. This ordering is the contract: a reader that sees the
 * manifest can trust that all referenced event objects already exist.
 *
 * The `for … await` loop awaits each event's `putObject` ack before the next;
 * the manifest `putObject` runs only after the loop completes — so the
 * manifest PUT is observably last (asserted by
 * tests/fleet/archive-manifest-order.test.ts).
 */
export async function writeManifest(
  deps: ArchiveWriterDeps,
  input: WriteManifestInput,
): Promise<{ manifestKey: string; eventKeys: readonly string[] }> {
  const eventKeys: string[] = [];
  for (const event of input.events) {
    const { key } = await archiveEvent(deps, event);
    eventKeys.push(key);
  }

  const manifestKey = manifestObjectKey({
    installationId: input.installationId,
    runId: input.runId,
    revision: input.revision,
  });
  await deps.store.putObject({ key: manifestKey, body: input.manifestBody });

  return { manifestKey, eventKeys };
}
