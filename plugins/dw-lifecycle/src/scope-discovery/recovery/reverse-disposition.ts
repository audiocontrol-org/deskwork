/**
 * plugins/dw-lifecycle/src/scope-discovery/recovery/reverse-disposition.ts
 *
 * Reversal-proposal builder.
 *
 * Given a `WrongDecisionEvent`, produce a `CatalogEditProposal` that
 * transitions the affected catalog entry to `status: withdrawn` and
 * stamps `provenance.context: audit-finding-<findingId>` (the
 * reversibility primitive's contract per `util/catalog-status.ts` +
 * catalog status + provenance).
 *
 * # Soft proposals
 *
 * Per task pre-made decision #4: "Recovery operations are SOFT — they
 * propose the reversal as a `CatalogEditProposal`; the operator/
 * orchestrator commits the edit per orchestrator-agent mediation." This module is
 * pure — no disk I/O. The proposal carries the target metadata block
 * verbatim; the consumer's edit applier sets the entry's
 * `status:` + `provenance:` fields to match the proposal.
 *
 * # Provenance integrity
 *
 * The reversal proposal's provenance:
 *
 *   - `source: orchestrator-agent` — the reversal is itself an agent
 *     edit; surfacing the proposalSource separately keeps both the
 *     edit-source AND the recovery-source visible.
 *
 *   - `authored_at: <proposedAt>` — the moment the proposal was built.
 *
 *   - `authored_by: 'recovery'` — short tag identifying the recovery
 *     library as the origin (distinct from the orchestrator-agent's
 *     own free-form work).
 *
 *   - `context: 'audit-finding-<findingId>'` — REQUIRED by the
 *     reversibility primitive's invariant: a `withdrawn` entry must
 *     carry an `audit-finding-` context. `parseCatalogEntryMetadata`
 *     throws if this rule is violated; the proposal would fail to
 *     parse on the consumer side without it.
 *
 *   - `evidence_link` — left unset by default; the consumer / operator
 *     can attach a path to the audit-log entry when applying.
 */

import type { Provenance } from '../util/catalog-status.js';
import type {
  CatalogEditProposal,
  WrongDecisionEvent,
} from './recovery-types.js';

/**
 * Produce the `Provenance` block for a reversal proposal. Stamps:
 *
 *   - source: 'orchestrator-agent'
 *   - authored_at: proposedAt
 *   - authored_by: 'recovery'
 *   - context: 'audit-finding-<findingId>'
 *
 * Pure over its inputs.
 */
function reversalProvenance(
  event: WrongDecisionEvent,
  proposedAt: string,
): Provenance {
  return {
    source: 'orchestrator-agent',
    authored_at: proposedAt,
    authored_by: 'recovery',
    context: `audit-finding-${event.findingId}`,
  };
}

/**
 * Build one reversal proposal from a wrong-decision event. The
 * proposal sets the target status to `withdrawn` and stamps the
 * provenance with the audit-finding context.
 *
 * `proposedAt` defaults to the wrong-decision event's `detectedAt`
 * when omitted — keeping the timestamps coherent for the common case.
 */
export function buildReversalProposal(
  event: WrongDecisionEvent,
  proposedAt?: string,
): CatalogEditProposal {
  const at = proposedAt ?? event.detectedAt;
  const provenance = reversalProvenance(event, at);
  return {
    registryPath: event.registryPath,
    entryId: event.catalogEntryId,
    targetStatus: 'withdrawn',
    targetProvenance: provenance,
    proposalSource: 'recovery',
    note:
      `Reverse prior agent-driven status (${event.priorStatus}, from ` +
      `${event.priorProvenanceSource}) on ${event.registryPath}#` +
      `${event.catalogEntryId} per audit-finding-${event.findingId}. ` +
      event.detectionGrounds,
    proposedAt: at,
  };
}

/**
 * Build reversal proposals for every event in the input list. The
 * result preserves the input order; the consumer applies proposals
 * in whatever order is appropriate (typically newest-first to honour
 * the audit-log convention).
 */
export function buildReversalProposals(
  events: ReadonlyArray<WrongDecisionEvent>,
  proposedAt?: string,
): ReadonlyArray<CatalogEditProposal> {
  return events.map((e) => buildReversalProposal(e, proposedAt));
}
