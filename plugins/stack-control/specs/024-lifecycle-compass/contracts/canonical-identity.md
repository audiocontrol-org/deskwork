# Contract: Canonical Feature Identity (FR-013 / TASK-139)

US6: the roadmap node, its spec dir, govern, the convergence record, and `close-related` share
**one canonical identity** so all five resolve the same feature the same way — eliminating the
basename-collision class (TASK-139) and the branch-slug mismatch (FR-011). Lives in
`src/workflow/identity.ts`.

## The root problem (three identities today)

| Subsystem | Identifies a feature by | Bug |
|---|---|---|
| govern | branch slug (`resolveSlug`) | FATALs on session-pinned branch (FR-011) |
| convergence record | `basename(item.spec)` (`workflow-context.ts:41`, `convergence-record.ts`) | two specs sharing a dir basename collide (TASK-139) |
| roadmap / workflow | node id (`<phase>:<codename>`) | (the stable one) |

## The canonical key

The **roadmap node id** (`<phase>:<codename>`) is THE canonical feature identity. It is
already stable, human-legible, and the key the roadmap + 022 workflow engine resolve items by.
The spec-dir binding is carried by the node's `spec:` pointer — never by the spec-dir basename.

```
resolveIdentity(installationRoot, item) → {
  nodeId: string,             // <phase>:<codename> — canonical
  specPointer: string | null, // node's spec: field (installation-relative)
  specDir: string | null,     // absolute, install-anchored
}
```

## Required changes (route all five through it)

1. **Convergence record key**: replace `basename(item.spec)` with `nodeId` in
   `workflow-context.ts` (`convergenceKey`) and in `convergence-record.ts` read/write paths.
   Two specs sharing a basename now write/read distinct records (SC-005).
2. **govern**: resolve "the feature" from `resolveIdentity(item).specPointer` (FR-011), not the
   branch slug.
3. **compass**: resolve the item through `resolveIdentity` (same nodeId the skills + govern use).
4. **`close-related`** (023): resolve its target feature through `resolveIdentity` so it agrees
   with compass + govern (SC-005, US6.2).

## Migration (existing records)

Existing convergence records keyed by spec-dir basename are legacy data. Per the spec
Assumptions (legacy migration, default applied): grandfather terminal/shipped items; for
in-flight items, the re-key is a read-side concern — a record written under the old key is
re-derived on the next govern run under the canonical key (no destructive rewrite required, no
silent fabrication). A record that cannot be resolved under either key is reported, not faked.

## Acceptance (SC-005, US6)

- Two items with distinct specs sharing a spec-dir basename ⇒ distinct convergence records;
  governing one does not mark the other converged.
- The compass, govern, and `close-related` resolve a given item to the same `nodeId`.

## Tests (canonical-identity.test.ts)

- RED: two fixture items, specs `specs/010-foo/` and `specs/020-foo/` (shared basename `foo`
  if keyed naively differently — construct the collision per TASK-139's actual shape) ⇒ their
  convergence records are independent. Fails before the re-key.
- `resolveIdentity` returns the node id as `nodeId` and the node's `spec:` as `specPointer`.
- compass + govern + close-related agree on `nodeId` for the same item.

## Known limitation (AUDIT-BARRAGE claude-04, LOW)

The convergence-record KEY is canonical (node id via `resolveConvergenceItem`), so the FR-013
basename-collision class is closed for the record. But govern's feature-root LOOKUP path
(`resolveFeatureFromItem` → `basename(specPointer)` → `resolveFeatureRoot`) still keys on the
spec-dir basename. For the standard `specs/NNN-<slug>` layout basenames are unique (the numeric
prefix), so this is safe in practice; it only re-opens the seam in the exotic same-basename
layout the collision test invents (`specs/lane-a/compass`, `specs/lane-b/compass`). A cleaner
future change threads the resolved `specDir` (or node id) through to feature-root resolution so
the same canonical identity governs both the record key and the file lookup. Tracked as low.
