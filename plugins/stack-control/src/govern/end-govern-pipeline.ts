// 030 — the end-govern pipeline orchestration:
// CLUSTER → (AUDIT → FIX → RE-AUDIT)* (bounded) → SEAM → RECONCILE (once).
// Audits the whole committed governedSha..HEAD diff as a single end-of-feature
// run that never FATALs on size (FR-001/FR-002). The re-audit loop re-audits ONLY
// the fix-touched chunks (FR-012) and terminates by construction — the touched
// set shrinks toward empty, with a hard round-cap backstop (FR-013). Phase 3
// (T023) landed CLUSTER→AUDIT→RECONCILE; Phase 5 (T042) inserted SEAM; Phase 6
// (T047/T048) added the bounded loop + round cap. FIX dispatch (US5) and
// reconcile-once-close-before-lift (US6) refine the marked steps.
//
// Dependencies are injected so the engine runs against stubs in tests and the
// real machinery at the CLI (Principle IX — capability, not vendor identity).

import type { Chunk, Finding, WholeFeatureConvergenceRecord } from './chunk-artifacts.js';
import type { DiffScope } from './payload-diff-scope.js';
import { partitionDiff } from './cluster-payload/partition.js';
import { renderChunkPayload } from './payload-chunk.js';
import { runSeamPass } from './seam-pass.js';
import { computeTouchedSet } from './touched-set.js';

/** The default hard round-cap backstop against a non-shrinking coupling cycle (FR-013). */
export const DEFAULT_MAX_ROUNDS = 10;

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

/** The outcome of one FIX round: the files the fixes touched + the fix commits. */
export interface FixRoundResult {
  readonly changedFiles: readonly string[];
  readonly fixCommits: readonly string[];
}

/** Injected collaborators — stubbed in tests, real machinery at the CLI. */
export interface EndGovernDeps {
  readonly scopeDiff: (installationRoot: string, base: string, head: string) => DiffScope;
  readonly resolveEnvelope: () => number;
  readonly auditChunk: (payload: string, chunkId: string) => Promise<ChunkAuditResult>;
  readonly planContext: () => string;
  /** Apply fixes for a round's findings, returning the touched files (US5 worktree dispatch). Absent ⇒ no autonomous fix. */
  readonly applyFixes?: (findings: readonly Finding[], round: number) => Promise<FixRoundResult>;
  /** Hard round-cap backstop; defaults to DEFAULT_MAX_ROUNDS. */
  readonly maxRounds?: number;
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
  const partition = partitionDiff({ changedFiles: scope.files, fileDiffs: scope.fileDiffs }, deps.resolveEnvelope());
  const planContext = deps.planContext();
  const maxRounds = deps.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const auditOne = (chunk: Chunk): Promise<ChunkAuditResult> => {
    const manifest = partition.manifests.find((m) => m.chunkId === chunk.id) ?? { chunkId: chunk.id, otherChunks: [] };
    const payload = renderChunkPayload({ chunk, manifest, fileDiffs: scope.fileDiffs, planContext });
    return deps.auditChunk(payload, chunk.id);
  };

  // BOUNDED LOOP — AUDIT → FIX → RE-AUDIT only the touched chunks (FR-012/FR-013).
  let round = 1;
  let auditIds = partition.chunks.map((c) => c.id);
  let openFindings: readonly Finding[] = [];
  const fixCommits: string[] = [];
  let terminal: WholeFeatureConvergenceRecord['outcome'] | null = null;

  for (;;) {
    const toAudit = partition.chunks.filter((c) => auditIds.includes(c.id));
    const audits = await Promise.all(toAudit.map(auditOne));
    openFindings = audits.flatMap((a) => [...a.findings]);

    if (openFindings.length === 0) break; // clean / dampened → proceed to SEAM
    if (deps.applyFixes === undefined) {
      terminal = 'override-eligible'; // no autonomous fix backend → surface for the operator
      break;
    }
    if (round >= maxRounds) {
      terminal = 'round-cap-surfaced'; // FR-013 backstop — STOP, surface, never loop forever
      break;
    }

    const fix = await deps.applyFixes(openFindings, round);
    fixCommits.push(...fix.fixCommits);
    const touched = computeTouchedSet({
      round: round + 1,
      chunks: partition.chunks,
      coupling: partition.coupling,
      changedFiles: fix.changedFiles,
      fixCommits: fix.fixCommits,
    });
    if (touched.chunkIds.length === 0) {
      openFindings = []; // fixes touched nothing re-auditable → loop is complete
      break;
    }
    auditIds = [...touched.chunkIds];
    round++;
  }

  // SEAM — interface-level cross-chunk/split-cluster pass (R7), consulting split-cluster markers.
  const seamResult = runSeamPass({
    chunks: partition.chunks,
    splitClusterMarkers: partition.splitClusterMarkers,
    fileDiffs: scope.fileDiffs,
  });

  // RECONCILE (once) — single whole-feature record. close-in-loop-before-lift (US6) refines lifted/closed.
  const outcome: WholeFeatureConvergenceRecord['outcome'] =
    terminal !== null ? terminal : openFindings.length === 0 && seamResult.findings.length === 0 ? 'converged' : 'override-eligible';

  const record: WholeFeatureConvergenceRecord = {
    version: 1,
    mode: 'impl',
    item: input.item,
    governedShaBase: input.base,
    headSha: input.head,
    chunkIds: partition.chunkIds,
    rounds: round,
    liftedFindings: [...openFindings],
    closedInLoopFindings: [],
    seamResult,
    splitClusterRefs: partition.splitClusterMarkers.map((m) => m.clusterId),
    outcome,
    anchorRoot: input.installationRoot,
  };
  return { record, chunks: partition.chunks };
}
