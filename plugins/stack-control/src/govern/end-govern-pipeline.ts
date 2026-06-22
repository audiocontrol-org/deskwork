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
import { dispatchFixSubagents, type FixRunner } from './fix-fanout/worktree-dispatch.js';
import { mergeFixWorktrees, type MergeAttempt } from './fix-fanout/merge-serialize.js';

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

/** The findings a round's audit raised, grouped by the chunk they were found in. */
export interface ChunkFindings {
  readonly chunk: Chunk;
  readonly findings: readonly Finding[];
}

/** The outcome of one FIX round: touched files + fix commits, plus any surfaced failures. */
export interface FixRoundResult {
  readonly changedFiles: readonly string[];
  readonly fixCommits: readonly string[];
  /** Chunks whose fix-subagent failed (FR-011) — surfaced at reconcile. */
  readonly failedChunks?: readonly string[];
  /** Chunks whose merge was unresolvable (FR-010) — surfaced at reconcile. */
  readonly unresolvableMerges?: readonly string[];
}

/** The injected FIX step: fix a round's per-chunk findings autonomously, returning the round result. */
export type ApplyFixes = (chunkFindings: readonly ChunkFindings[], round: number) => Promise<FixRoundResult>;

/** Injected collaborators — stubbed in tests, real machinery at the CLI. */
export interface EndGovernDeps {
  readonly scopeDiff: (installationRoot: string, base: string, head: string) => DiffScope;
  readonly resolveEnvelope: () => number;
  readonly auditChunk: (payload: string, chunkId: string) => Promise<ChunkAuditResult>;
  readonly planContext: () => string;
  /** Apply fixes for a round's findings (US5 worktree-fanout). Absent ⇒ no autonomous fix. */
  readonly applyFixes?: ApplyFixes;
  /** Hard round-cap backstop; defaults to DEFAULT_MAX_ROUNDS. */
  readonly maxRounds?: number;
}

/** Build the autonomous FIX step from the fix-fanout capability port: dispatch per chunk → merge back. */
export function makeFixFanout(opts: { concurrency: number; runFix: FixRunner; canMerge: MergeAttempt }): ApplyFixes {
  return async (chunkFindings) => {
    const jobs = chunkFindings.map((cf) => ({ chunk: cf.chunk, findings: cf.findings }));
    const outcomes = await dispatchFixSubagents(jobs, opts.concurrency, opts.runFix);
    const merge = mergeFixWorktrees(outcomes, opts.canMerge);
    const ok = outcomes.filter((o) => o.failed === false);
    return {
      changedFiles: ok.flatMap((o) => [...o.changedFiles]),
      fixCommits: ok.flatMap((o) => [...o.fixCommits]),
      failedChunks: outcomes.filter((o) => o.failed).map((o) => o.chunkId),
      unresolvableMerges: merge.unresolvableMerges,
    };
  };
}

/** The pipeline result: the single reconcile record + the chunk set it governed. */
export interface EndGovernResult {
  readonly record: WholeFeatureConvergenceRecord;
  readonly chunks: readonly Chunk[];
}

/** Run the chunked end-govern pipeline to a single whole-feature convergence record. */
export async function runEndGovern(input: EndGovernInput, deps: EndGovernDeps): Promise<EndGovernResult> {
  // CLUSTER — scope the committed diff and partition it into envelope-sized chunks.
  // `scope`/`partition` are reassignable because a fix that creates NEW files (FR-007)
  // re-scopes + re-partitions mid-loop so those files are assigned to a chunk for re-audit.
  let scope = deps.scopeDiff(input.installationRoot, input.base, input.head);
  let partition = partitionDiff({ changedFiles: scope.files, fileDiffs: scope.fileDiffs }, deps.resolveEnvelope());
  // AUDIT-20260622-23: fail loud on an EMPTY scope / empty chunk set. With no
  // chunks the audit loop would break immediately with zero findings and reconcile
  // to `converged` — a graduation-gate record written WITHOUT firing any barrage. A
  // bad diff base, an over-broad exclusion filter, or a feature with no scoped files
  // is a defect to surface, never a silent clean pass.
  if (scope.files.length === 0 || partition.chunks.length === 0) {
    throw new Error(
      `govern: FATAL — end-govern found an EMPTY scope for '${input.item}' over ${input.base}..${input.head} ` +
        `(${scope.files.length} scoped file(s) → ${partition.chunks.length} chunk(s)). No barrage fired, so the ` +
        `work is NOT governed — a converged record here would graduate on a zero-audit run. Check the diff base ` +
        `resolves to real changes and that the exclusion filters did not remove the whole surface.`,
    );
  }
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
  const raisedById = new Map<string, Finding>(); // every finding raised in any round (R9 close-before-lift)
  let terminal: WholeFeatureConvergenceRecord['outcome'] | null = null;
  // AUDIT-20260622-10: a degraded chunk barrage (fewer lanes than the configured
  // fleet) that returns a quiet round is NOT equivalent to full cross-model
  // convergence. Track whether the convergence-determining (final) audit round ran
  // on a degraded fleet so a weakened audit cannot reconcile to `converged`.
  let lastAuditDegraded = false;

  for (;;) {
    const toAudit = partition.chunks.filter((c) => auditIds.includes(c.id));
    const audited = await Promise.all(toAudit.map(async (chunk) => ({ chunk, result: await auditOne(chunk) })));
    lastAuditDegraded = audited.some((a) => a.result.degraded);
    openFindings = audited.flatMap((a) => [...a.result.findings]);
    for (const f of openFindings) raisedById.set(f.id, f);

    if (openFindings.length === 0) break; // clean / dampened → proceed to SEAM
    if (deps.applyFixes === undefined) {
      terminal = 'override-eligible'; // no autonomous fix backend → surface for the operator
      break;
    }
    if (round >= maxRounds) {
      terminal = 'round-cap-surfaced'; // FR-013 backstop — STOP, surface, never loop forever
      break;
    }

    const chunkFindings = audited
      .filter((a) => a.result.findings.length > 0)
      .map((a) => ({ chunk: a.chunk, findings: a.result.findings }));
    const fix = await deps.applyFixes(chunkFindings, round);
    fixCommits.push(...fix.fixCommits);
    if ((fix.unresolvableMerges ?? []).length > 0) {
      terminal = 'unresolvable-merge-surfaced'; // FR-010 — surfaced, no fabricated resolution
      break;
    }
    if ((fix.failedChunks ?? []).length > 0) {
      terminal = 'fix-failure-surfaced'; // FR-011 — failure isolated + surfaced at reconcile
      break;
    }
    const touched = computeTouchedSet({
      round: round + 1,
      chunks: partition.chunks,
      coupling: partition.coupling,
      changedFiles: fix.changedFiles,
      fixCommits: fix.fixCommits,
    });
    // FR-007: a fix that creates NEW file(s) not yet in any chunk must have them
    // assigned to a chunk for re-audit — never dropped. Re-scope the committed diff
    // (the fix commit now includes them) and re-partition so the new files land in a
    // chunk; then re-audit those chunk(s) alongside the coupling-touched chunks.
    if (touched.newFiles.length > 0) {
      scope = deps.scopeDiff(input.installationRoot, input.base, input.head);
      partition = partitionDiff({ changedFiles: scope.files, fileDiffs: scope.fileDiffs }, deps.resolveEnvelope());
    }
    const newFileChunkIds = partition.chunks
      .filter((c) => c.files.some((f) => touched.newFiles.includes(f)))
      .map((c) => c.id);
    const nextAuditIds = [...new Set([...touched.chunkIds, ...newFileChunkIds])];
    if (nextAuditIds.length === 0) {
      openFindings = []; // fixes touched nothing re-auditable → loop is complete
      break;
    }
    auditIds = nextAuditIds;
    round++;
  }

  // SEAM — interface-level cross-chunk/split-cluster pass (R7), consulting split-cluster markers.
  const seamResult = runSeamPass({
    chunks: partition.chunks,
    splitClusterMarkers: partition.splitClusterMarkers,
    fileDiffs: scope.fileDiffs,
  });

  // RECONCILE (once) — partition findings (R9, FR-016): findings raised earlier but
  // ABSENT from the final state were fixed in-loop ⇒ CLOSED (not lifted); findings
  // still open at graduation ⇒ LIFTED. The two sets are disjoint by construction.
  const stillOpenIds = new Set(openFindings.map((f) => f.id));
  const liftedFindings = [...new Map(openFindings.map((f) => [f.id, f])).values()];
  const closedInLoopFindings = [...raisedById.values()].filter((f) => stillOpenIds.has(f.id) === false);

  // AUDIT-20260622-10: a clean final state reached on a degraded fleet reconciles
  // to `degraded-fleet-surfaced` (a non-converged terminal), never `converged` —
  // the durable record is the graduation gate, so a weakened audit must not pass it.
  const cleanFinalState = openFindings.length === 0 && seamResult.findings.length === 0;
  const outcome: WholeFeatureConvergenceRecord['outcome'] =
    terminal !== null
      ? terminal
      : cleanFinalState
        ? lastAuditDegraded
          ? 'degraded-fleet-surfaced'
          : 'converged'
        : 'override-eligible';

  const record: WholeFeatureConvergenceRecord = {
    version: 1,
    mode: 'impl',
    item: input.item,
    governedShaBase: input.base,
    headSha: input.head,
    chunkIds: partition.chunkIds,
    rounds: round,
    liftedFindings,
    closedInLoopFindings,
    seamResult,
    splitClusterRefs: partition.splitClusterMarkers.map((m) => m.clusterId),
    outcome,
    anchorRoot: input.installationRoot,
  };
  return { record, chunks: partition.chunks };
}
