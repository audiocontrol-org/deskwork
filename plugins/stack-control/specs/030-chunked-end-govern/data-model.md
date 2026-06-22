# Phase 1 Data Model: Chunked whole-feature end-govern

Entities the feature introduces or changes, with fields, relationships, validation rules, and lifecycle. Persisted artifacts are installation-anchored under `.stack-control/` (FR-010 anchor invariant; same scheme as `convergence-record.ts:35`) and **each needs a doctor/schema surface** (FR-021) — flagged ⬡ below.

---

## Cluster

A coupling-derived group of files that bin-packs into chunks. **Transient** (computed each run; not persisted on its own — its result is captured by the Chunk set).

| Field | Type | Notes |
|---|---|---|
| `memberFiles` | `string[]` (installation-relative) | the coupled changed files in this cluster |
| `couplingEdges` | `{ from: string; to: string; signal: 'dir' \| 'diff-xref' \| 'ts-import' }[]` | provenance of the coupling (R1 signals) |
| `renderedBytes` | `number` | rendered-payload byte size (the bin metric) |
| `oversized` | `boolean` | `renderedBytes > envelope` even after the non-audit trim pre-pass |

**Validation.** `memberFiles` non-empty and disjoint across clusters (every changed file in exactly one cluster). `signal` ∈ the three baseline/precision sources; `ts-import` present only when the TS precision layer fired (R1).

**Lifecycle.** Built from the coupling graph → consumed by the bin-packer → discarded after the Chunk set is produced.

---

## Chunk ⬡

An envelope-sized audit unit. **Persisted** as part of the chunk-set artifact.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (stable hash) | deterministic, pinned to `governedSha`..HEAD (R3); referenced by the convergence record |
| `files` | `string[]` (installation-relative) | the chunk's file set (one or more clusters, or sub-split files) |
| `manifestRef` | `ChunkManifest` ref | the cross-cutting manifest for this chunk (R8) |
| `splitCluster` | `boolean` | true iff this chunk is a sub-chunk of an oversized cluster (R2) |
| `renderedBytes` | `number` | MUST be ≤ active envelope |

**Validation.** `id` stable + unique within the set. `files` non-empty; the union of all chunks' `files` equals the `governedSha`..HEAD changed-file set (no file dropped — FR-007 class). `renderedBytes ≤ envelope` for every chunk (the invariant that removes `boundary-too-large` — FR-002). A `splitCluster` chunk MUST have a corresponding `SplitClusterMarker`.

**Relationships.** Chunk —has-one→ ChunkManifest; Chunk —referenced-by→ TouchedSet, WholeFeatureConvergenceRecord; a split Chunk —member-of→ SplitClusterMarker.

**Lifecycle.** Produced by CLUSTER → audited (AUDIT) → possibly re-audited (RE-AUDIT if in a touched set) → referenced at RECONCILE. Stable across re-runs over identical endpoints.

---

## ChunkManifest

The per-chunk context block listing the OTHER chunks' file lists — "what this chunk cannot see" (R8, FR-005). **Persisted** with / derivable from the chunk-set artifact.

| Field | Type | Notes |
|---|---|---|
| `chunkId` | `string` | the chunk this manifest is rendered into |
| `otherChunks` | `{ id: string; files: string[] }[]` | file lists (not diffs) of every other chunk |

**Validation.** `otherChunks` covers exactly the chunk set minus `chunkId` (complete + no self-entry). File-lists only (envelope discipline — no diff bodies).

**Lifecycle.** Rendered into each chunk's audit payload; recomputed deterministically with the chunk set.

---

## SplitClusterMarker ⬡

Records that a cluster exceeded the envelope and was sub-split, with the coverage caveat. **Persisted.**

| Field | Type | Notes |
|---|---|---|
| `clusterId` | `string` | the oversized source cluster |
| `subChunkIds` | `string[]` | the chunk ids the cluster was split into |
| `trimApplied` | `{ category: 'lockfile' \| 'generated' \| 'vendored' \| 'whitespace' \| 'fixture'; bytes: number }[]` | the non-audit trim pre-pass record (R2) |
| `coverageCaveat` | `string` | human-readable note that within-cluster cross-sub-chunk coverage is reduced and recovered via the seam pass |

**Validation.** `subChunkIds` length ≥ 2 and each MUST reference an existing Chunk with `splitCluster=true` (a dangling reference is a doctor finding — US7 Scenario 2). `coverageCaveat` non-empty (degradation is recorded, never silent — FR-006, Principle V).

**Lifecycle.** Written when the bin-packer sub-splits an oversized cluster; consulted by the seam pass (R7) to recover cross-sub-chunk coverage.

---

## TouchedSet ⬡

The set of chunks a fix round changed — drives bounded re-audit (R5). **Persisted** per round.

| Field | Type | Notes |
|---|---|---|
| `round` | `number` (≥1) | the re-audit round this set governs |
| `chunkIds` | `string[]` | the chunks to re-audit next round (coupling-correct — FR-012) |
| `sourceFixCommits` | `string[]` (sha) | the fix commits this set was derived from |
| `newFiles` | `string[]` | files a fix created, assigned to a chunk by coupling (FR-007) |

**Validation.** Every `chunkId` references an existing Chunk OR a chunk created for a `newFile`. `round` monotonically increases; under non-pathological coupling the `chunkIds` set shrinks toward empty (SC-004). The round cap (FR-013) bounds `round`.

**Lifecycle.** Computed from fix commits after each FIX phase → consumed by the next RE-AUDIT → terminates the loop when empty/dampened OR surfaces a capped stall.

---

## SeamResult ⬡

The outcome of the interface-level cross-chunk / split-cluster pass (R7, FR-014). **Persisted.**

| Field | Type | Notes |
|---|---|---|
| `boundaryPairs` | `{ a: string; b: string }[]` | the chunk-boundary (and split-cluster sub-chunk) pairs audited |
| `findings` | `{ kind: 'removed-export' \| 'renamed-export' \| 'changed-arity' \| 'changed-required-shape'; symbol: string; consumedAcross: boolean; severity: string }[]` | substantive cross-boundary breaks only |
| `suppressedCompatible` | `number` | count of compatible/internal changes NOT flagged (the false-positive guard evidence — SC-003) |

**Validation.** Every `findings` entry MUST have `consumedAcross=true` (substantive-break gate — FR-014; a finding with `consumedAcross=false` is a gating bug). `boundaryPairs` covers every cross-chunk and split-cluster sub-chunk adjacency.

**Lifecycle.** Computed once after the bounded re-audit converges → folded into the single reconcile.

---

## WholeFeatureConvergenceRecord ⬡

The single per-feature record the graduate gate evaluates (FR-015, FR-018). **Persisted** (extends the existing `convergence-record.ts` scheme — `mode='impl'`, one per item, installation-anchored, atomic temp+rename).

| Field | Type | Notes |
|---|---|---|
| `version` | `1` | schema version |
| `mode` | `'impl'` | (the spec-mode record is unchanged/separate) |
| `item` | `string` | the feature/roadmap item id |
| `governedShaBase` | `string` (sha) | the resolved feature base anchor (029 US5; `--diff-base` override) |
| `headSha` | `string` (sha) | HEAD at audit time (the `governedSha`..HEAD endpoint) |
| `chunkIds` | `string[]` | the stable ids of the chunk set governed |
| `rounds` | `number` | re-audit rounds run (≤ round cap) |
| `liftedFindings` | `Finding[]` | findings STILL open at graduation (lifted to backlog) |
| `closedInLoopFindings` | `Finding[]` | findings fixed within the loop, closed BEFORE lift (NOT lifted — FR-016) |
| `seamResultRef` | `SeamResult` ref | the seam pass outcome |
| `splitClusterRefs` | `string[]` | any `SplitClusterMarker` cluster ids (degradation provenance) |
| `outcome` | `'converged' \| 'override-eligible' \| 'round-cap-surfaced' \| 'fix-failure-surfaced' \| 'unresolvable-merge-surfaced' \| 'degraded-fleet-surfaced'` | terminal disposition (`degraded-fleet-surfaced`: the convergence-determining audit round ran on a degraded fleet — a quiet round from fewer lanes is not full cross-model convergence, so it never reconciles to `converged`; AUDIT-20260622-10) |
| `anchorRoot` | `string` | the installation root the record lives under (existing convention) |

**Validation.** Exactly **one** record per feature (FR-015; a second is a doctor finding — US7 Scenario 1 covers malformed; uniqueness is enforced by the `mode__item.json` path scheme at `convergence-record.ts:40`). `closedInLoopFindings` and `liftedFindings` MUST be disjoint (a finding is either fixed-in-loop or still-open, never both — FR-016). `outcome='converged'` requires a clean/dampened final touched set AND a non-degraded convergence-determining round; the five `*-surfaced` outcomes require the corresponding surfaced condition (Principle V) — `degraded-fleet-surfaced` when the final clean round ran on a degraded fleet (AUDIT-20260622-10).

**Lifecycle.** Written once at RECONCILE. `outcome='converged'` ⇒ the `graduate-impl` gate passes on this record alone (FR-018). The `*-surfaced` outcomes STOP the run for operator decision (no auto-graduate of unresolved churn — FR-013).

---

## Relationships (summary)

```text
governedSha..HEAD diff
   └─> Cluster (transient, coupling-derived)
          └─> Chunk ⬡ (1..N, envelope-sized, stable id)
                 ├─ ChunkManifest (other chunks' file lists)
                 └─ SplitClusterMarker ⬡ (if oversized cluster sub-split)
   FIX commits ─> TouchedSet ⬡ (per round) ─drives─> RE-AUDIT of referenced Chunks
   converged ─> SeamResult ⬡ (cross-boundary breaks)
   RECONCILE (once) ─> WholeFeatureConvergenceRecord ⬡ (the sole graduate criterion)
```

## Deleted entities (clean break — FR-017/FR-018)

- **Per-phase checkpoint** (`phase-checkpoints/*.json`) + its schema/doctor rule — DELETED.
- **`PhaseUnit` exclusion scope** (`compositionExcludePaths`, `carriedFilesForComposition`) — DELETED (replaced by inclusion-based Chunk scope, FR-023).
- **`all-phase-checkpoints-current`** gate context (`allPhaseCheckpointsCurrent`) — DELETED.

No migration entity exists (WONTFIX — FR-020).
