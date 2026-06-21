// 030 — the end-govern pipeline orchestration:
// CLUSTER → AUDIT → (FIX → RE-AUDIT)* → SEAM → RECONCILE (once).
// Audits the whole committed governedSha..HEAD diff as a single end-of-feature
// run that never FATALs on size (FR-001/FR-002). Phase 3 (T023) lands the
// CLUSTER→AUDIT→RECONCILE skeleton; FIX/RE-AUDIT (US4/US5), SEAM (US3), and
// reconcile-once-close-before-lift (US6) refine the marked steps.
//
// Dependencies are injected (the committed-diff scoper, the fleet envelope, the
// per-chunk barrage, the plan/spec/contracts context) so the engine is exercised
// against stubs in tests and wired to the real machinery at the CLI (Principle
// IX — branch on capability, never vendor identity).

import type { Chunk, Finding, WholeFeatureConvergenceRecord } from './chunk-artifacts.js';
import type { DiffScope } from './payload-diff-scope.js';
import { partitionDiff } from './cluster-payload/partition.js';
import { renderChunkPayload } from './payload-chunk.js';

/** Inputs to an end-govern run over a feature's committed work. */
export interface EndGovernInput {
  readonly installationRoot: string;
  readonly item: string;
  readonly base: string;
  readonly head: string;
}

/** The outcome of auditing one chunk's payload. */
export interface ChunkAuditResult {
  readonly findings: readonly Finding[];
  readonly degraded: boolean;
}

/** Injected collaborators — stubbed in tests, real machinery at the CLI. */
export interface EndGovernDeps {
  readonly scopeDiff: (installationRoot: string, base: string, head: string) => DiffScope;
  readonly resolveEnvelope: () => number;
  readonly auditChunk: (payload: string, chunkId: string) => Promise<ChunkAuditResult>;
  readonly planContext: () => string;
}

/** The pipeline result: the single reconcile record + the chunk set it governed. */
export interface EndGovernResult {
  readonly record: WholeFeatureConvergenceRecord;
  readonly chunks: readonly Chunk[];
}

/** Run the chunked end-govern pipeline to a single whole-feature convergence record. */
export async function runEndGovern(input: EndGovernInput, deps: EndGovernDeps): Promise<EndGovernResult> {
  // CLUSTER — scope the committed diff and partition it into envelope-sized chunks.
  const scope = deps.scopeDiff(input.installationRoot, input.base, input.head);
  const envelope = deps.resolveEnvelope();
  const partition = partitionDiff({ changedFiles: scope.files, fileDiffs: scope.fileDiffs }, envelope);
  const planContext = deps.planContext();

  // AUDIT — barrage each chunk in parallel (chunks × lanes is owned by auditChunk).
  const audits = await Promise.all(
    partition.chunks.map((chunk) => {
      const manifest = partition.manifests.find((m) => m.chunkId === chunk.id) ?? { chunkId: chunk.id, otherChunks: [] };
      const payload = renderChunkPayload({ chunk, manifest, fileDiffs: scope.fileDiffs, planContext });
      return deps.auditChunk(payload, chunk.id);
    }),
  );

  // RECONCILE (once) — skeleton: collect findings into a single whole-feature record.
  // FIX/RE-AUDIT bounds the loop (US4/US5); SEAM backstops cross-chunk breaks (US3);
  // close-in-loop-before-lift partitions findings (US6) — wired in later phases.
  const openFindings = audits.flatMap((a) => [...a.findings]);
  const outcome: WholeFeatureConvergenceRecord['outcome'] = openFindings.length === 0 ? 'converged' : 'override-eligible';

  const record: WholeFeatureConvergenceRecord = {
    version: 1,
    mode: 'impl',
    item: input.item,
    governedShaBase: input.base,
    headSha: input.head,
    chunkIds: partition.chunkIds,
    rounds: 1,
    liftedFindings: openFindings,
    closedInLoopFindings: [],
    seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 },
    splitClusterRefs: partition.splitClusterMarkers.map((m) => m.clusterId),
    outcome,
    anchorRoot: input.installationRoot,
  };
  return { record, chunks: partition.chunks };
}
