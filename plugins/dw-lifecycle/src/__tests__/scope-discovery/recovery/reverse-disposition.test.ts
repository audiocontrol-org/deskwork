/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/recovery/reverse-disposition.test.ts
 *
 * Phase 11 Task 8 — Reversal-proposal builder tests.
 *
 * The proposal is the SOFT signal: the consumer applies it (per
 * Task 3). These tests verify the proposal shape +
 * `audit-finding-<findingId>` provenance contract — the same
 * invariant `parseCatalogEntryMetadata` enforces on read.
 */

import { describe, expect, it } from 'vitest';
import {
  buildReversalProposal,
  buildReversalProposals,
} from '../../../scope-discovery/recovery/reverse-disposition.js';
import { parseCatalogEntryMetadata } from '../../../scope-discovery/util/catalog-status.js';
import { makeWrongDecisionEvent } from './recovery.fixtures.js';

describe('buildReversalProposal', () => {
  it('produces a withdrawn-status proposal with audit-finding context', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'legacy-foo',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      priorStatus: 'blessed',
      priorProvenanceSource: 'orchestrator-agent',
      detectedAt: '2026-05-26T12:00:00Z',
    });
    const proposal = buildReversalProposal(event);
    expect(proposal.registryPath).toBe('anti-patterns.yaml');
    expect(proposal.entryId).toBe('legacy-foo');
    expect(proposal.targetStatus).toBe('withdrawn');
    expect(proposal.targetProvenance.source).toBe('orchestrator-agent');
    expect(proposal.targetProvenance.authored_by).toBe('recovery');
    expect(proposal.targetProvenance.authored_at).toBe('2026-05-26T12:00:00Z');
    expect(proposal.targetProvenance.context).toBe(
      'audit-finding-AUDIT-20260526-01',
    );
    expect(proposal.proposalSource).toBe('recovery');
    expect(proposal.note).toContain('AUDIT-20260526-01');
    expect(proposal.proposedAt).toBe('2026-05-26T12:00:00Z');
  });

  it('honours an explicit proposedAt override', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'foo',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-99',
      detectedAt: '2026-05-26T12:00:00Z',
    });
    const proposal = buildReversalProposal(event, '2026-06-01T00:00:00Z');
    expect(proposal.proposedAt).toBe('2026-06-01T00:00:00Z');
    expect(proposal.targetProvenance.authored_at).toBe(
      '2026-06-01T00:00:00Z',
    );
  });

  it('proposal targets satisfy parseCatalogEntryMetadata invariant', () => {
    // The roundtrip: produce a reversal proposal, embed it in a raw
    // catalog entry shape, parse it through `parseCatalogEntryMetadata`
    // and verify no throw. This is the contract that matters — the
    // operator/orchestrator applies the proposal as a literal YAML
    // edit; the parser must accept the result.
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'roundtrip',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-50',
    });
    const proposal = buildReversalProposal(event);
    const rawEntry = {
      id: proposal.entryId,
      description: 'irrelevant',
      status: proposal.targetStatus,
      provenance: {
        source: proposal.targetProvenance.source,
        authored_at: proposal.targetProvenance.authored_at,
        authored_by: proposal.targetProvenance.authored_by,
        context: proposal.targetProvenance.context,
      },
    };
    const result = parseCatalogEntryMetadata(
      rawEntry,
      `entry "${proposal.entryId}"`,
      'reverse-disposition-test',
    );
    expect(result.metadata.status).toBe('withdrawn');
    expect(result.metadata.provenance.context).toBe(
      'audit-finding-AUDIT-20260526-50',
    );
  });

  it('builds one proposal per event in buildReversalProposals', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'b',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-02',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'c',
        registryPath: 'clones.yaml',
        findingId: 'AUDIT-20260526-03',
      }),
    ];
    const proposals = buildReversalProposals(events);
    expect(proposals.length).toBe(3);
    expect(proposals.map((p) => p.entryId)).toEqual(['a', 'b', 'c']);
    expect(proposals.map((p) => p.targetStatus)).toEqual([
      'withdrawn',
      'withdrawn',
      'withdrawn',
    ]);
    for (const p of proposals) {
      expect(p.targetProvenance.context?.startsWith('audit-finding-')).toBe(true);
    }
  });

  it('captures priorStatus + priorProvenanceSource in the note', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'note-test',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-04',
      priorStatus: 'cursed',
      priorProvenanceSource: 'llm-judge-proposed',
    });
    const proposal = buildReversalProposal(event);
    expect(proposal.note).toContain('cursed');
    expect(proposal.note).toContain('llm-judge-proposed');
    expect(proposal.note).toContain('anti-patterns.yaml#note-test');
  });
});
