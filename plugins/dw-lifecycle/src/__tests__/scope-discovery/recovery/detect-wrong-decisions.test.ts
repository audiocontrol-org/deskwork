/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/recovery/detect-wrong-decisions.test.ts
 *
 * Phase 11 Task 8 — Detection tests.
 *
 * Verifies that wrong-decision events surface only when:
 *   - the audit-log entry's body contains a disagreement token, AND
 *   - the entry's `Affects:` cites a catalog entry whose provenance
 *     source is `orchestrator-agent` or `llm-judge-proposed`.
 *
 * Operator-authored entries, install-seed entries, and entries with
 * no audit-log disagreement are explicitly verified to NOT surface.
 */

import { describe, expect, it } from 'vitest';
import {
  detectWrongDecisions,
  filterByWatermark,
} from '../../../scope-discovery/recovery/detect-wrong-decisions.js';
import {
  makeAuditEntry,
  makeAuditLog,
  makeCatalogView,
} from './recovery.fixtures.js';

describe('detectWrongDecisions — disagreement-token gating', () => {
  it('surfaces an event when body contains "overturn" + affects an agent-driven entry', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-01',
        body: 'The prior auto-disposition is wrong; we overturn it.',
        affects: ['anti-patterns.yaml#legacy-foo'],
      }),
    ]);
    const view = makeCatalogView({
      registryPath: 'anti-patterns.yaml',
      entryId: 'legacy-foo',
      status: 'blessed',
      provenanceSource: 'orchestrator-agent',
    });
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [view],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(1);
    const ev = events[0];
    if (ev === undefined) throw new Error('expected one event');
    expect(ev.catalogEntryId).toBe('legacy-foo');
    expect(ev.registryPath).toBe('anti-patterns.yaml');
    expect(ev.findingId).toBe('AUDIT-20260526-01');
    expect(ev.priorProvenanceSource).toBe('orchestrator-agent');
    expect(ev.priorStatus).toBe('blessed');
    expect(ev.detectionGrounds).toContain('disagreement token');
    // First match in the body wins (regex left-to-right); the body has
    // "wrong" before "overturn", so "wrong" is the surfaced token.
    expect(ev.detectionGrounds.toLowerCase()).toContain('wrong');
  });

  it('surfaces an event for "incorrect" and "disagree" and "reverse" tokens', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-02',
        body: 'This disposition is incorrect.',
        affects: ['anti-patterns.yaml#a'],
      }),
      makeAuditEntry({
        findingId: 'AUDIT-20260526-03',
        body: 'I disagree with this finding.',
        affects: ['anti-patterns.yaml#b'],
      }),
      makeAuditEntry({
        findingId: 'AUDIT-20260526-04',
        body: 'Reverse the prior status please.',
        affects: ['anti-patterns.yaml#c'],
      }),
    ]);
    const views = [
      makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'a' }),
      makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'b' }),
      makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'c' }),
    ];
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: views,
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(3);
    expect(events.map((e) => e.findingId)).toEqual([
      'AUDIT-20260526-02',
      'AUDIT-20260526-03',
      'AUDIT-20260526-04',
    ]);
  });

  it('does NOT surface when body has no disagreement token', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-05',
        body: 'Audited and validated; everything in order.',
        affects: ['anti-patterns.yaml#legacy-foo'],
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [
        makeCatalogView({
          registryPath: 'anti-patterns.yaml',
          entryId: 'legacy-foo',
        }),
      ],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(0);
  });

  it('does NOT surface when entry provenance source is operator-authored', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-06',
        body: 'This is wrong — please overturn.',
        affects: ['anti-patterns.yaml#operator-entry'],
      }),
    ]);
    const view = makeCatalogView({
      registryPath: 'anti-patterns.yaml',
      entryId: 'operator-entry',
      provenanceSource: 'operator-authored',
    });
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [view],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(0);
  });

  it('does NOT surface when entry provenance source is install-seed', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-07',
        body: 'Wrong call here.',
        affects: ['anti-patterns.yaml#seeded'],
      }),
    ]);
    const view = makeCatalogView({
      registryPath: 'anti-patterns.yaml',
      entryId: 'seeded',
      provenanceSource: 'install-seed',
    });
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [view],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(0);
  });

  it('also gates on llm-judge-proposed source', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-08',
        body: 'This is wrong.',
        affects: ['anti-patterns.yaml#judge-driven'],
      }),
    ]);
    const view = makeCatalogView({
      registryPath: 'anti-patterns.yaml',
      entryId: 'judge-driven',
      provenanceSource: 'llm-judge-proposed',
    });
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [view],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(1);
    expect(events[0]?.priorProvenanceSource).toBe('llm-judge-proposed');
  });

  it('emits an event per affected entry when multiple affects are listed', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-09',
        body: 'These are wrong.',
        affects: [
          'anti-patterns.yaml#a',
          'anti-patterns.yaml#b',
        ],
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'a' }),
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'b' }),
      ],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(2);
    expect(events.map((e) => e.catalogEntryId)).toEqual(['a', 'b']);
  });

  it('resolves bare-id citations against the by-entry-id index', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-10',
        body: 'Wrong.',
        affects: ['bare-id-entry'],
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [
        makeCatalogView({
          registryPath: 'clones.yaml',
          entryId: 'bare-id-entry',
        }),
      ],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(1);
    expect(events[0]?.registryPath).toBe('clones.yaml');
  });

  it('does NOT cross-match when citation specifies a wrong registry', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-11',
        body: 'Wrong.',
        affects: ['clones.yaml#shared-id'],
      }),
    ]);
    const view = makeCatalogView({
      registryPath: 'anti-patterns.yaml',
      entryId: 'shared-id',
    });
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [view],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(0);
  });

  it('carries patternType from the catalog view onto the event', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-12',
        body: 'Wrong.',
        affects: ['pattern-matrix.yaml#neg-space-1'],
      }),
    ]);
    const view = makeCatalogView({
      registryPath: 'pattern-matrix.yaml',
      entryId: 'neg-space-1',
      patternType: 'negative-space',
    });
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [view],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(1);
    expect(events[0]?.patternType).toBe('negative-space');
  });

  it('does not emit when there are no affects on a disagreement entry', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-13',
        body: 'Something is wrong but no specific entries cited.',
        affects: [],
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'x' }),
      ],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(0);
  });
});

describe('filterByWatermark', () => {
  it('returns every event when watermark is empty', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-01',
        body: 'wrong',
        affects: ['anti-patterns.yaml#a'],
      }),
      makeAuditEntry({
        findingId: 'AUDIT-20260527-02',
        body: 'wrong',
        affects: ['anti-patterns.yaml#b'],
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'a' }),
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'b' }),
      ],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(filterByWatermark(events, '').length).toBe(2);
  });

  it('filters out events at or below the watermark', () => {
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-01',
        body: 'wrong',
        affects: ['anti-patterns.yaml#a'],
      }),
      makeAuditEntry({
        findingId: 'AUDIT-20260527-02',
        body: 'wrong',
        affects: ['anti-patterns.yaml#b'],
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries: [
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'a' }),
        makeCatalogView({ registryPath: 'anti-patterns.yaml', entryId: 'b' }),
      ],
      detectedAt: '2026-05-26T12:00:00Z',
    });
    const filtered = filterByWatermark(events, 'AUDIT-20260526-01');
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.findingId).toBe('AUDIT-20260527-02');
  });
});
