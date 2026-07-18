// specs/036-fleet-control-plane — T100 (impl), pairs with T095's RED test
// at tests/fleet/manifest-reconcile.test.ts.
//
// research.md § R-04 (line ~78-86):
//   "Listing survives only as an off-hot-path reconciliation backstop
//    that diffs stored objects against a manifest — the one mechanism
//    that catches a lost manifest write, which is otherwise a silent
//    lie of omission."
// research.md § PT-004 (line ~122-134):
//   "Immutable period manifests replace listing on the read path... The
//    plane's own index resolves the manifest-revision pointer — no
//    mutable `latest.json`, no listing to find the newest revision."
// data-model.md § Storage layout (~134) — a run's objects live under
//   `runs/<installationId>/<runId>/`, with event objects at
//   `.../events/<10-digit>.json` and manifest objects at
//   `.../manifest-<rev>.json`.
//
// Manifest writes happen STRICTLY AFTER event PUTs ack (T097). If the
// process dies between the last event PUT and the manifest PUT, the
// events are durably stored but UNDOCUMENTED — a silent lie of omission,
// because the hot read path (sequence probing / canned manifest reads,
// R-01/PT-004) never lists and so would never notice. This function
// catches that TOTAL-LOSS case: it lists the run's objects, and if no
// manifest is present at all, reports every discovered event key as
// orphaned.
//
// AUDIT-20260718-24: manifest PRESENCE is not the same claim as manifest
// COMPLETENESS. A truncated or stale manifest write is its own lie of
// omission — the manifest object exists, but doesn't document every
// event that actually landed. R-04 says the backstop "diffs stored
// objects against a manifest", not "checks a manifest exists" — so when
// a manifest IS present, this function reads its declared `eventKeys`
// and reports any listed event key ABSENT from that declaration as
// orphaned too. `manifestFound` and "fully documented" are independent
// facts; do not re-collapse them into "manifest present ⇒ nothing to
// report".
//
// DO NOT REMOVE THIS FILE OR ITS `listObjects` CALL. A future reader who
// notices the hot path never lists and concludes listing is unused dead
// code would be wrong — R-04 designates this exact call as the backstop
// that makes a lost manifest write detectable at all. Removing it turns
// a detectable operational incident into a silent, permanent data-loss
// lie.
//
// READ-ONLY by construction: this module calls `listObjects` always, and
// `getObject` AT MOST ONCE per run — only to read the manifest's own
// (small) body when one is present, never an event body. It never calls
// `putObject`, and `ObjectStorePort` (src/storage/port.ts, T008) declares
// no delete/purge method at all — so "reconciliation never deletes" is
// structurally true, not merely a convention this file happens to
// follow.
//
// Relative `.js` imports (node16 module resolution, no `@/` alias). No
// `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).

import type { ObjectMetadata, ObjectStorePort } from '../../storage/port.js';

/** Dependencies `reconcileRun` needs: the object-store port to list
 * against. Nothing else — reconciliation reads no other capability. */
export interface ReconcileDeps {
  readonly store: ObjectStorePort;
}

/** Identifies the single run to reconcile. */
export interface ReconcileRunInput {
  readonly installationId: string;
  readonly runId: string;
}

/** Result of reconciling one run. `manifestFound` and "fully documented"
 * are INDEPENDENT facts (AUDIT-20260718-24): `orphanedEventKeys` can be
 * non-empty even when `manifestFound` is true, because a present manifest
 * can still be truncated/stale — it declared fewer event keys than were
 * actually archived. When `manifestFound` is false, every discovered
 * event key is orphaned (the total-loss case, research.md R-04). */
export interface ReconcileReport {
  readonly manifestFound: boolean;
  readonly orphanedEventKeys: readonly string[];
}

const EVENT_KEY_PATTERN = /\/events\/\d{10}\.json$/;
const MANIFEST_KEY_PATTERN = /\/manifest-(\d+)\.json$/;

function runPrefix(installationId: string, runId: string): string {
  return `runs/${installationId}/${runId}/`;
}

function isEventKey(key: string): boolean {
  return EVENT_KEY_PATTERN.test(key);
}

/** Extract the revision number from a manifest key, or `undefined` if
 * `key` is not a manifest key at all. */
function manifestKeyRevision(key: string): number | undefined {
  const match = MANIFEST_KEY_PATTERN.exec(key);
  const digits = match?.[1];
  if (digits === undefined) {
    return undefined;
  }
  return Number(digits);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a manifest object's body into the set of event keys it DECLARES.
 *
 * `writeManifest` (src/plane/archive/writer.ts, T097) hands its caller an
 * opaque `manifestBody: Uint8Array` to construct — the one field this
 * backstop's diff needs is a top-level `eventKeys: string[]`, matching
 * what `writeManifest` itself returns to its caller to embed. A manifest
 * that EXISTS but cannot be read this way is exactly the kind of lie of
 * omission R-04 exists to catch, so this throws (Principle V — fail loud)
 * rather than silently treating an unreadable manifest as complete or as
 * absent.
 */
function parseManifestEventKeys(body: Uint8Array, manifestKey: string): ReadonlySet<string> {
  const text = new TextDecoder().decode(body);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `reconcileRun: manifest at ${JSON.stringify(manifestKey)} is not valid JSON: ${String(error)}`,
    );
  }
  if (!isRecord(raw)) {
    throw new Error(`reconcileRun: manifest at ${JSON.stringify(manifestKey)} is not a JSON object.`);
  }
  const { eventKeys } = raw;
  if (!Array.isArray(eventKeys) || eventKeys.some((key) => typeof key !== 'string')) {
    throw new Error(
      `reconcileRun: manifest at ${JSON.stringify(manifestKey)} is missing a valid ` +
        '"eventKeys" string array to diff against.',
    );
  }
  const declared: string[] = [];
  for (const key of eventKeys) {
    if (typeof key === 'string') {
      declared.push(key);
    }
  }
  return new Set(declared);
}

/**
 * Reconcile a single run: list its objects ONCE and partition them into
 * event-object keys and manifest keys (keeping only the HIGHEST-revision
 * manifest key, since a run's manifest can itself be rewritten as a new
 * revision — data-model.md § Storage layout — and only the latest is
 * authoritative).
 *
 * If no manifest key is present at all, every discovered event key is
 * reported as orphaned — the run's events made it to durable storage, but
 * the manifest write that was supposed to document them never landed (or
 * hasn't landed yet).
 *
 * If a manifest IS present, its body is read and parsed for the
 * `eventKeys` it declares; any listed event key ABSENT from that
 * declaration is reported as orphaned too (AUDIT-20260718-24) — presence
 * of a manifest object is not proof the manifest is complete.
 *
 * This is the off-hot-path backstop (research.md R-04): it is never
 * called from the plane's gap-detection or read path, only from a
 * deliberate reconciliation sweep.
 */
export async function reconcileRun(
  deps: ReconcileDeps,
  input: ReconcileRunInput,
): Promise<ReconcileReport> {
  const prefix = runPrefix(input.installationId, input.runId);
  const objects: readonly ObjectMetadata[] = await deps.store.listObjects(prefix);

  const eventKeys: string[] = [];
  let latestManifestKey: string | undefined;
  let latestManifestRevision = -Infinity;

  for (const object of objects) {
    if (isEventKey(object.key)) {
      eventKeys.push(object.key);
      continue;
    }
    const revision = manifestKeyRevision(object.key);
    if (revision !== undefined && revision > latestManifestRevision) {
      latestManifestRevision = revision;
      latestManifestKey = object.key;
    }
  }

  if (latestManifestKey === undefined) {
    return { manifestFound: false, orphanedEventKeys: eventKeys };
  }

  const manifestBody = await deps.store.getObject(latestManifestKey);
  if (manifestBody === null) {
    // Listed a moment ago, gone now (race with the underlying store) —
    // there is nothing to diff against, so treat it exactly like "no
    // manifest": every discovered event key is orphaned.
    return { manifestFound: false, orphanedEventKeys: eventKeys };
  }

  const declaredEventKeys = parseManifestEventKeys(manifestBody, latestManifestKey);
  const orphanedEventKeys = eventKeys.filter((key) => !declaredEventKeys.has(key));

  return { manifestFound: true, orphanedEventKeys };
}
