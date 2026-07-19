// specs/037-instance-observability — dogfood finding T050: the in-memory,
// live-only session-liveness heartbeat store.
//
// The sidecar POSTs a SessionLivenessSignal { installationId, host, path, emittedAt }
// to /v1/sidecar/liveness every ~45s (src/sidecar/session-liveness.ts), proving its
// uplink is alive EVEN WHEN the operator runs no verbs. Before this store, the
// plane's `livenessHandler` dropped the heartbeat, so an idle-but-connected
// instance had `lastHeartbeatAt: null` and aged live -> stale -> gone off
// `lastActivityAt` alone. This store records the LATEST heartbeat per INSTANCE
// (keyed by `host:path`) so `buildInstanceRegistry` can hold an idle instance
// `live` (heartbeat recency, research.md D1) and populate `lastHeartbeatAt`.
//
// KEYED BY host:path, NOT installationId (AUDIT-20260719-21): installationId is a
// UUID a COPIED checkout carries verbatim, so it cannot distinguish two observed
// instances that share it (a copied/moved checkout — the exact reason 037 keys the
// instance by `host:path`). Keying by installationId would inject one sidecar's beat
// into EVERY instance sharing the id, marking a stale copy `attached`/`live` and
// defeating the observability goal. The store key is the instance's own `host:path`.
//
// EPHEMERAL BY CONTRACT: this map is in-process only, NEVER durable — it is
// rebuilt from the live heartbeat stream, exactly like the in-memory event fold.
// Reading it (via `snapshot()`) generates ZERO durable-store reads
// (FR-023/SC-007, T024). A plane restart empties it; the next heartbeat (<= one
// interval later) refills it. This is the same "live signal, not durable state"
// posture as the instance registry itself.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports under
// node16 resolution (no `@/` alias — this plugin has none).

/** The plane-side session-liveness heartbeat store (in-memory, live-only). */
export interface HeartbeatStore {
  /**
   * Record a heartbeat's wall-clock for an INSTANCE, keyed by its `host:path`
   * identity (`instanceId`, D8 — NOT installationId, AUDIT-20260719-21). LATEST
   * wins: best-effort heartbeats may arrive out of order, so a stale re-delivery
   * never walks the recorded time backward (mirrors the registry's no-regress
   * posture — the freshest signal owns the field).
   */
  record(instanceId: string, emittedAt: string): void;
  /**
   * A read-only snapshot keyed by instanceId (`host:path`) -> latest heartbeat
   * ISO time. A fresh copy each call — the registry fold consults it without being
   * able to mutate the live store.
   */
  snapshot(): ReadonlyMap<string, string>;
}

/** Construct an empty {@link HeartbeatStore}. */
export function createHeartbeatStore(): HeartbeatStore {
  const latestByInstance = new Map<string, string>();
  return {
    record(instanceId: string, emittedAt: string): void {
      // Never persist an UNPARSEABLE heartbeat (AUDIT-20260719-10): a `NaN` time
      // would break this latest-wins comparison (every `NaN >` is false, so with
      // no prior it would still store garbage) and later NaN-poison the liveness
      // derivation. A garbage timestamp is simply dropped — the freshest VALID
      // heartbeat stays authoritative. (The HTTP boundary already 400s these; this
      // is the defensive belt for any value that reaches the store another way.)
      const ms = Date.parse(emittedAt);
      if (Number.isNaN(ms)) {
        return;
      }
      const prior = latestByInstance.get(instanceId);
      if (prior === undefined || ms > Date.parse(prior)) {
        latestByInstance.set(instanceId, emittedAt);
      }
    },
    snapshot(): ReadonlyMap<string, string> {
      return new Map(latestByInstance);
    },
  };
}
