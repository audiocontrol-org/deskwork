// 030 — the end-govern pipeline orchestration:
// CLUSTER → AUDIT → FIX → RE-AUDIT (bounded) → SEAM → RECONCILE (once).
// Audits the whole committed governedSha..HEAD diff as a single end-of-feature
// run that never FATALs on size (FR-001/FR-002). Phase 1 stub (T002); the
// CLUSTER→AUDIT→RECONCILE skeleton lands in Phase 3 (T023), with FIX/RE-AUDIT/
// SEAM wired in Phases 5–8.

import type { WholeFeatureConvergenceRecord } from './chunk-artifacts.js';

/** Inputs to an end-govern run over a feature's committed work. */
export interface EndGovernInput {
  readonly installationRoot: string;
  readonly item: string;
  readonly base: string;
  readonly head: string;
}

/** Run the chunked end-govern pipeline to a single whole-feature convergence record. */
export function runEndGovern(_input: EndGovernInput): Promise<WholeFeatureConvergenceRecord> {
  throw new Error('not implemented (030 end-govern-pipeline stub — Phase 3 T023)');
}
