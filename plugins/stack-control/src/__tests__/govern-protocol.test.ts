// RED-first (govern consolidation): slug/repo-root resolution + barrage-bin
// guard + barrage-OUTAGE handling, ported from govern.sh / govern-spec.sh.
//   - AUDIT-20260604-24/-30: slug derives from feature/<slug>; empty slug FATAL.
//   - FR-005/Principle V: barrage bin absent FATAL.
//   - AUDIT-20260607-07: a non-zero barrage exit is an OUTAGE → fail-loud,
//     NEVER lift (an empty run must not score as converged).

import { describe, it, expect } from 'vitest';
import {
  resolveSlug,
  assertBarrageBinPresent,
  GovernProtocolError,
} from '../govern/protocol.js';

describe('resolveSlug (port of govern.sh slug derivation)', () => {
  it('uses the explicit override when present', () => {
    expect(resolveSlug({ explicit: 'my-feature', branch: 'feature/other' })).toBe(
      'my-feature',
    );
  });

  it('derives from feature/<slug> branch', () => {
    expect(resolveSlug({ branch: 'feature/parallel-engine' })).toBe(
      'parallel-engine',
    );
  });

  it('FATAL when branch is not feature/<slug> and no override (AUDIT-20260604-24)', () => {
    expect(() => resolveSlug({ branch: 'main' })).toThrow(GovernProtocolError);
  });

  it('FATAL on empty derived slug from feature/ (AUDIT-20260604-30)', () => {
    expect(() => resolveSlug({ branch: 'feature/' })).toThrow(/empty/i);
  });
});

describe('assertBarrageBinPresent (port of fail-loud capability guard)', () => {
  it('FATAL when the barrage bin path does not exist (FR-005)', () => {
    expect(() =>
      assertBarrageBinPresent('/nonexistent/stackctl-missing'),
    ).toThrow(GovernProtocolError);
  });
});
