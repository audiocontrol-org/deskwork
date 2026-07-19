// specs/037-instance-observability — dogfood finding T050: the in-memory,
// live-only session-liveness heartbeat store.
//
// The sidecar POSTs a SessionLivenessSignal { installationId, emittedAt } to
// /v1/sidecar/liveness every ~45s (src/sidecar/session-liveness.ts), proving its
// uplink is alive EVEN WHEN the operator runs no verbs. Before this store, the
// plane's `livenessHandler` dropped the heartbeat, so an idle-but-connected
// instance had `lastHeartbeatAt: null` and aged live -> stale -> gone off
// `lastActivityAt` alone. This store records the LATEST heartbeat per
// installationId so `buildInstanceRegistry` can hold an idle instance `live`
// (heartbeat recency, research.md D1) and populate `lastHeartbeatAt`.
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
   * Record a heartbeat's wall-clock for an installation. LATEST wins:
   * best-effort heartbeats may arrive out of order, so a stale re-delivery
   * never walks the recorded time backward (mirrors the registry's no-regress
   * posture — the freshest signal owns the field).
   */
  record(installationId: string, emittedAt: string): void;
  /**
   * A read-only snapshot keyed by installationId -> latest heartbeat ISO time.
   * A fresh copy each call — the registry fold consults it without being able
   * to mutate the live store.
   */
  snapshot(): ReadonlyMap<string, string>;
}

/** Construct an empty {@link HeartbeatStore}. */
export function createHeartbeatStore(): HeartbeatStore {
  const latestByInstallation = new Map<string, string>();
  return {
    record(installationId: string, emittedAt: string): void {
      const prior = latestByInstallation.get(installationId);
      if (prior === undefined || Date.parse(emittedAt) > Date.parse(prior)) {
        latestByInstallation.set(installationId, emittedAt);
      }
    },
    snapshot(): ReadonlyMap<string, string> {
      return new Map(latestByInstallation);
    },
  };
}
