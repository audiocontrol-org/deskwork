// 028 T081 (US3) — RED: read-only exemption (FR-050; contract T2).
//
// Read-only query ops are mediation-exempt: the interceptor gates ONLY mutation /
// state-bearing ops. A `read-only` op is never refused, even inside an installation
// with no marker. `decideMediation` consults the op's declared mediation class.

import { describe, expect, it } from 'vitest';
import { decideMediation } from '../../capability/mediate.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

const noMarker = new Set<string>();

describe('read-only exemption in decideMediation (028 T081)', () => {
  it('permits a read-only fronted op with NO marker (FR-050)', () => {
    const d = decideMediation(CAPABILITY_REGISTRY, 'bash', 'backlog list', noMarker, 'read-only');
    expect(d.verdict).toBe('permit');
  });

  it('STILL refuses a mutating fronted op with NO marker (mediation gates mutation)', () => {
    const d = decideMediation(CAPABILITY_REGISTRY, 'bash', 'backlog create', noMarker, 'mutating');
    expect(d.verdict).toBe('refuse');
    expect(d.capability).toBe('backlog');
  });

  it('defaults to mutating when no class is supplied (back-compat — fronted, unmarked → refuse)', () => {
    const d = decideMediation(CAPABILITY_REGISTRY, 'bash', 'backlog create', noMarker);
    expect(d.verdict).toBe('refuse');
  });

  it('permits a marked mutating op regardless of class', () => {
    const d = decideMediation(CAPABILITY_REGISTRY, 'bash', 'backlog create', new Set(['backlog']), 'mutating');
    expect(d.verdict).toBe('permit');
  });

  it('permits a non-backend identity (read-only class is moot)', () => {
    const d = decideMediation(CAPABILITY_REGISTRY, 'bash', 'ls -la', noMarker, 'read-only');
    expect(d.verdict).toBe('permit');
    expect(d.capability).toBeNull();
  });
});
