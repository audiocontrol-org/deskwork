// 030 cluster-payload — bin-pack clusters into chunks each within the active
// fleet envelope (FR-002), sub-splitting an oversized MULTI-file cluster (after
// the non-audit trim pre-pass) into envelope-sized sub-chunks with a
// SplitClusterMarker (FR-006). NEVER throws boundary-too-large for the
// feature-size case — the packer AVOIDS the condition. A single FILE whose own
// diff exceeds the envelope is a-priori-broken (operator decision 2026-06-21):
// govern FAILS LOUD naming it rather than hunk-splitting. Implemented in Phase 3
// (T019).

import type { Chunk, SplitClusterMarker } from '../chunk-artifacts.js';
import { computeChunkId } from './chunk-id.js';
import type { Cluster } from './clustering.js';
import { trimNonAuditBytes, type FileDiff } from './non-audit-trim.js';

/** The bin-pack outcome: the envelope-sized chunk set + any split-cluster markers. */
export interface BinPackResult {
  readonly chunks: readonly Chunk[];
  readonly splitClusterMarkers: readonly SplitClusterMarker[];
}

interface Bin {
  files: string[];
  bytes: number;
}

function bytesOf(files: readonly string[], fileDiffs: ReadonlyMap<string, string>): number {
  let total = 0;
  for (const f of files) total += (fileDiffs.get(f) ?? '').length;
  return total;
}

function makeChunk(bin: Bin, splitCluster: boolean): Chunk {
  return { id: computeChunkId(bin.files), files: [...bin.files].sort(), splitCluster, renderedBytes: bin.bytes };
}

/** Sub-split an oversized cluster (after trim) into envelope-sized sub-chunks; fail loud on a single oversized file. */
function subSplitOversized(
  cluster: Cluster,
  fileDiffs: ReadonlyMap<string, string>,
  envelopeBytes: number,
): { chunks: Chunk[]; marker: SplitClusterMarker } {
  const clusterId = computeChunkId(cluster.memberFiles);
  const list: FileDiff[] = cluster.memberFiles.map((f) => ({ path: f, diffText: fileDiffs.get(f) ?? '' }));
  const trimmed = trimNonAuditBytes(list);

  const subChunks: Chunk[] = [];
  let current: Bin = { files: [], bytes: 0 };
  for (const fd of trimmed.kept) {
    const fb = fd.diffText.length;
    if (fb > envelopeBytes) {
      throw new Error(
        `govern: FATAL — file '${fd.path}' alone renders ${fb} bytes, exceeding the fleet envelope ${envelopeBytes}. ` +
          `A code file this large violates the 300-500-line cap (Constitution VI); a non-code file this large is not ` +
          `useful in the stack-control audit context. Fix or remove the file — govern does not hunk-split an ` +
          `a-priori-broken input.`,
      );
    }
    if (current.bytes + fb > envelopeBytes && current.files.length > 0) {
      subChunks.push(makeChunk(current, true));
      current = { files: [], bytes: 0 };
    }
    current.files.push(fd.path);
    current.bytes += fb;
  }
  if (current.files.length > 0) subChunks.push(makeChunk(current, true));

  const marker: SplitClusterMarker = {
    clusterId,
    subChunkIds: subChunks.map((c) => c.id),
    trimApplied: trimmed.trimApplied,
    coverageCaveat:
      `cluster ${clusterId} exceeded the envelope and was sub-split into ${subChunks.length} sub-chunks at file ` +
      `granularity; within-cluster cross-sub-chunk coverage is reduced and recovered via the seam pass.`,
  };
  return { chunks: subChunks, marker };
}

/** Pack clusters into chunks ≤ envelope (first-fit-decreasing); sub-split an oversized cluster. */
export function binpackClusters(
  clusters: readonly Cluster[],
  fileDiffs: ReadonlyMap<string, string>,
  envelopeBytes: number,
): BinPackResult {
  const chunks: Chunk[] = [];
  const splitClusterMarkers: SplitClusterMarker[] = [];
  const fitting: { cluster: Cluster; bytes: number }[] = [];

  for (const cluster of clusters) {
    const bytes = bytesOf(cluster.memberFiles, fileDiffs);
    if (bytes <= envelopeBytes) {
      fitting.push({ cluster, bytes });
      continue;
    }
    // Oversized: try the trim pre-pass; if it now fits, one chunk, else sub-split + marker.
    const list: FileDiff[] = cluster.memberFiles.map((f) => ({ path: f, diffText: fileDiffs.get(f) ?? '' }));
    const keptBytes = trimNonAuditBytes(list).kept.reduce((s, fd) => s + fd.diffText.length, 0);
    if (keptBytes <= envelopeBytes && keptBytes > 0) {
      const keptFiles = trimNonAuditBytes(list).kept.map((fd) => fd.path);
      chunks.push(makeChunk({ files: keptFiles, bytes: keptBytes }, false));
      continue;
    }
    const split = subSplitOversized(cluster, fileDiffs, envelopeBytes);
    chunks.push(...split.chunks);
    splitClusterMarkers.push(split.marker);
  }

  // First-fit-decreasing over the fitting clusters (size desc; tiebreak by stable cluster id).
  fitting.sort(
    (a, b) =>
      b.bytes - a.bytes ||
      computeChunkId(a.cluster.memberFiles).localeCompare(computeChunkId(b.cluster.memberFiles)),
  );
  const bins: Bin[] = [];
  for (const { cluster, bytes } of fitting) {
    let placed = false;
    for (const bin of bins) {
      if (bin.bytes + bytes <= envelopeBytes) {
        bin.files.push(...cluster.memberFiles);
        bin.bytes += bytes;
        placed = true;
        break;
      }
    }
    if (placed === false) bins.push({ files: [...cluster.memberFiles], bytes });
  }
  for (const bin of bins) chunks.push(makeChunk(bin, false));

  chunks.sort((a, b) => a.id.localeCompare(b.id));
  return { chunks, splitClusterMarkers };
}
