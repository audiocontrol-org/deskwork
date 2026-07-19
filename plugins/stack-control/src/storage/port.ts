// specs/036-fleet-control-plane — T008 (impl), pairs with T008's RED test
// at tests/fleet/storage-port.test.ts.
//
// The **vendor-free** object-store capability contract. Per Constitution
// Principle III (capability, not provider identity), no vendor name, no
// vendor SDK import, and no vendor-specific concept may appear in this
// file. The plane archives immutable per-event objects to an object store
// fronted by a CDN (research.md PT-004) — but the specific vendor confines
// entirely to a LATER adapter (a future `src/storage/*.ts` module, T096)
// that implements `ObjectStorePort`, and to the separate CDN read path
// (built in a later task). This file only ever says "object store".
//
// Method set derivation — every method below traces to a specific
// data-model.md / research.md clause; nothing here is speculative:
//
//   putObject   — data-model.md § Storage layout invariants: "Published
//                 event objects are never mutated (FR-066). A late event
//                 lands as a new object... it never rewrites a stored
//                 object." A duplicate PUT at the same key is a harmless
//                 no-op because upstream never writes non-identical bytes
//                 to the same key (FR-049 byte-identity) — the port does
//                 NOT need compare-and-set / conditional-write semantics;
//                 plain overwrite-by-key is sufficient.
//   getObject   — reads full object bytes. Returns `null` (never throws)
//                 for an absent key, because "does this key exist yet" is
//                 a legitimate, expected outcome — not an error — of
//                 sequence probing (research.md R-01: "the plane should
//                 walk 0, 1, 2, … → 404").
//   headObject  — existence + size WITHOUT the body. Justified by
//                 research.md R-04: gap detection never reads object-store
//                 contents on the hot path, but the "off-hot-path
//                 reconciliation backstop... diffs stored objects against a
//                 manifest" needs cheap presence/size checks over many
//                 objects without paying for full-body downloads.
//   listObjects — prefix listing. Justified ONLY as R-04's backstop:
//                 "Listing survives only as an off-hot-path reconciliation
//                 backstop." The primary read path never lists (R-01, R-04).
//                 Pagination against the underlying vendor's list API
//                 (whatever cursor/continuation-token shape it uses) is the
//                 adapter's concern, hidden behind this single-array
//                 return — the CAPABILITY is "give me every object under
//                 this prefix", not any particular wire pagination shape.
//
// Deliberately ABSENT (do not add speculatively):
//   - delete / purge      — data-model.md § invariants: "Never purge... a
//                            new revision is a new URL, so staleness is
//                            unrepresentable rather than operationally
//                            avoided." No FR calls for deletion.
//   - ACL / bucket-policy  — no FR requires per-call ACL control; bucket-
//                            level policy (e.g. "public bucket") is a
//                            vendor adapter provisioning concern, not a
//                            per-object capability this port exposes.
//   - cache-control /      — data-model.md § invariants: every object gets
//     content-type            the SAME `Cache-Control: public,
//                            max-age=31536000, immutable` header, and every
//                            object in the storage layout is `.json`. A
//                            uniform, non-varying value is an adapter-side
//                            constant, not a per-call knob.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

/** A single object's identity + size, without its body. Returned by
 * `headObject` (existence check) and `listObjects` (prefix enumeration). */
export interface ObjectMetadata {
  readonly key: string;
  readonly size: number;
}

/** Input to `putObject`. `body` is raw bytes — byte-identity (FR-049) is
 * what makes a duplicate `putObject` at the same key harmless, so the
 * capability contract carries exactly the bytes, nothing else. */
export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
}

/**
 * Vendor-free object-store capability. A LATER adapter (T096) implements
 * this interface against a specific vendor; every caller in the core —
 * archival, reconciliation — depends only on this interface, never on the
 * adapter's vendor identity (Constitution Principle III).
 */
export interface ObjectStorePort {
  /** Write an immutable object at a deterministic key. Overwriting an
   * existing key is a harmless no-op in practice (see FR-049 above) — the
   * port itself does not special-case it. */
  putObject(input: PutObjectInput): Promise<void>;

  /** Read an object's full bytes. `null` (never a thrown error) means the
   * key does not exist — the expected, legitimate result of probing an
   * as-yet-unwritten sequence position. */
  getObject(key: string): Promise<Uint8Array | null>;

  /** Existence + size, without transferring the body. `null` means the key
   * does not exist. */
  headObject(key: string): Promise<ObjectMetadata | null>;

  /** Every object whose key starts with `prefix`. Reconciliation backstop
   * ONLY (research.md R-04) — never the plane's hot read or gap-detection
   * path. */
  listObjects(prefix: string): Promise<readonly ObjectMetadata[]>;
}
