# Contract: cluster-payload (committed diff → deterministic chunk set)

The partitioner that makes a whole-feature audit fit the fleet envelope while preserving coupling. Pure + deterministic (FR-002/FR-003/FR-004).

## Input

| Field | Type | Source |
|---|---|---|
| `committedDiff` | the `git diff base..HEAD` over the installation subtree | `base` = resolved `governedSha` or `--diff-base` (FR-001) |
| `envelopeBytes` | `number` | `Math.min(...negotiatedLanes.maxPromptBytes)` (`protocol.ts:388`) |
| `tsImportGraph?` | optional precision signal | present only when the changed set is TS and resolvable (capability-gated, R1) |

## Output

A **deterministic, ordered chunk set**:

| Field | Type | Notes |
|---|---|---|
| `chunks` | `Chunk[]` | each with `renderedBytes ≤ envelopeBytes`; stable ordered |
| `chunkIds` | `string[]` | stable hashes pinned to `base..HEAD` (R3) |
| `manifests` | `ChunkManifest[]` | per-chunk other-chunks file lists (R8) |
| `splitClusterMarkers` | `SplitClusterMarker[]` | one per oversized cluster that was sub-split (R2) |

## Behavior

1. **Couple** — build the coupling graph: directory-adjacency + diff cross-references (universal baseline), plus TS import edges where available (R1, FR-003). Language-neutral; never hard-blocks a non-TS adopter.
2. **Cluster** — group coupled files into clusters (every changed file in exactly one cluster).
3. **Bin-pack** — first-fit-decreasing clusters (ordered by stable id) into chunks ≤ `envelopeBytes`, measured in rendered-payload bytes (R2).
4. **Oversized cluster** — if a single cluster alone exceeds the envelope: apply the cheap **non-audit-byte trim pre-pass** (lockfiles/generated/vendored/whitespace/fixtures); if still oversized, **sub-split** into envelope-sized sub-chunks and emit a `SplitClusterMarker` (R2, FR-006). **Never FATAL** (FR-002).
5. **Manifest** — render each chunk's other-chunks file lists (R8, FR-005).

## Determinism contract (FR-004)

Same `committedDiff` over the same `base..HEAD` endpoints + same `envelopeBytes` ⇒ **identical** `chunks`, `chunkIds`, `manifests`, and `splitClusterMarkers`. Tested by running the partitioner twice on a fixture and asserting byte-identical output (US1 Scenario 3).

## Invariants (testable)

- ⋃ `chunks[*].files` = the `base..HEAD` changed-file set (no file dropped — FR-007 class).
- Every `chunks[*].renderedBytes ≤ envelopeBytes` (FR-002 — removes `boundary-too-large`).
- Coupled files (import / same-dir / diff cross-ref) land in the same chunk where the envelope permits (US3 Scenario 1).
- An oversized single cluster ⇒ a recorded `SplitClusterMarker` with a non-empty coverage caveat (degradation never silent — Principle V).
- A non-TS changed set partitions with the baseline only and never errors on missing language tooling (US "Non-TS adopter" edge case).
