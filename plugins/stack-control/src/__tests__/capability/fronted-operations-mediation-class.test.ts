// 028 US4 T101 — each fronted-operations entry records its mediationClass (FR-050; R3).
//
// The read-only exemption is mechanical: a read-only entry is conformant WITHOUT a
// mediation registration; only mutating entries are subject to the C2c registration
// assertion. This test pins that the registry CARRIES the class on every entry, and
// that a read-only entry is faithfully copied (so the exemption can be read off the
// registry, not re-derived).

import { describe, expect, it } from 'vitest';
import { buildFrontedOperationsRegistry } from '../../capability/fronted-operations.js';

describe('fronted-operations mediationClass (028 T101; R3 / FR-050)', () => {
  it('every entry records a mediationClass of mutating | read-only', () => {
    const reg = buildFrontedOperationsRegistry();
    for (const op of reg.operations) {
      expect(['mutating', 'read-only']).toContain(op.mediationClass);
    }
  });

  it('a read-only command-tree op is recorded read-only (mediation-exempt by class)', () => {
    const reg = buildFrontedOperationsRegistry();
    // backlog list is a declared read-only query.
    const backlogList = reg.operations.find((o) => o.operationId === 'backlog/list');
    expect(backlogList?.mediationClass).toBe('read-only');
    // roadmap graph / order / next / blocked / blocks are all read-only.
    for (const sub of ['next', 'blocked', 'blocks', 'order', 'graph']) {
      const op = reg.operations.find((o) => o.operationId === `roadmap/${sub}`);
      expect(op?.mediationClass, `roadmap/${sub}`).toBe('read-only');
    }
  });

  it('a mutating command-tree op is recorded mutating (subject to the registration assertion)', () => {
    const reg = buildFrontedOperationsRegistry();
    const backlogCapture = reg.operations.find((o) => o.operationId === 'backlog/capture');
    expect(backlogCapture?.mediationClass).toBe('mutating');
  });

  it('skill-declaration entries are mutating (capabilities front state-bearing drives)', () => {
    const reg = buildFrontedOperationsRegistry();
    const declared = reg.operations.filter((o) => o.source === 'skill-declaration');
    expect(declared.length).toBeGreaterThan(0);
    for (const op of declared) {
      expect(op.mediationClass, op.operationId).toBe('mutating');
    }
  });
});
