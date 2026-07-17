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
// R-01/PT-004) never lists and so would never notice. This function is
// the ONE thing that catches that: it lists the run's objects, and if no
// manifest is present, reports every discovered event key as orphaned.
//
// DO NOT REMOVE THIS FILE OR ITS `listObjects` CALL. A future reader who
// notices the hot path never lists and concludes listing is unused dead
// code would be wrong — R-04 designates this exact call as the backstop
// that makes a lost manifest write detectable at all. Removing it turns
// a detectable operational incident into a silent, permanent data-loss
// lie.
//
// READ-ONLY by construction: this module calls ONLY `listObjects`. It
// never calls `getObject` or `putObject`, and `ObjectStorePort`
// (src/storage/port.ts, T008) declares no delete/purge method at all —
// so "reconciliation never deletes" is structurally true, not merely a
// convention this file happens to follow.
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

/** Result of reconciling one run. `orphanedEventKeys` is non-empty ONLY
 * when `manifestFound` is false — the lost-manifest-write lie-of-omission
 * case (research.md R-04). When a manifest IS found, nothing is orphaned:
 * the manifest is trusted as the documented record, and this backstop
 * does not second-guess it against the listed events. */
export interface ReconcileReport {
  readonly manifestFound: boolean;
  readonly orphanedEventKeys: readonly string[];
}

const EVENT_KEY_PATTERN = /\/events\/\d{10}\.json$/;
const MANIFEST_KEY_PATTERN = /\/manifest-\d+\.json$/;

function runPrefix(installationId: string, runId: string): string {
  return `runs/${installationId}/${runId}/`;
}

function isEventKey(key: string): boolean {
  return EVENT_KEY_PATTERN.test(key);
}

function isManifestKey(key: string): boolean {
  return MANIFEST_KEY_PATTERN.test(key);
}

/**
 * Reconcile a single run: list its objects ONCE and partition them into
 * event-object keys and manifest keys. If no manifest key is present,
 * every discovered event key is reported as orphaned — the run's events
 * made it to durable storage, but the manifest write that was supposed
 * to document them never landed (or hasn't landed yet).
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
  let manifestFound = false;

  for (const object of objects) {
    if (isEventKey(object.key)) {
      eventKeys.push(object.key);
      continue;
    }
    if (isManifestKey(object.key)) {
      manifestFound = true;
    }
  }

  return {
    manifestFound,
    orphanedEventKeys: manifestFound ? [] : eventKeys,
  };
}
