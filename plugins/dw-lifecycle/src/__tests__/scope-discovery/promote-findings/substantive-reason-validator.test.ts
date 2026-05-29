import { describe, it, expect } from 'vitest';
import {
  bannedAcknowledgedPhraseDisplayNames,
  MIN_REASON_LENGTH,
  validateAcknowledgedReason,
} from '../../../scope-discovery/promote-findings/substantive-reason-validator.js';

describe('validateAcknowledgedReason — length floor', () => {
  it('refuses empty string', () => {
    const r = validateAcknowledgedReason('');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it('refuses whitespace-only input', () => {
    const r = validateAcknowledgedReason('     \t\n  ');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it(`refuses input below ${MIN_REASON_LENGTH} chars after trim`, () => {
    const r = validateAcknowledgedReason('Too short.');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/minimum/i);
  });

  it('counts characters AFTER trim', () => {
    const padded = `${' '.repeat(50)}OK${' '.repeat(50)}`;
    const r = validateAcknowledgedReason(padded);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/minimum/i);
  });

  it('accepts a clean reason at exactly the minimum length', () => {
    const exact = 'X'.repeat(MIN_REASON_LENGTH);
    const r = validateAcknowledgedReason(exact);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('rejects non-string input', () => {
    const r = validateAcknowledgedReason(
      (42 as unknown) as string,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/string/i);
  });
});

describe('validateAcknowledgedReason — Phase 13 PRD banned phrases', () => {
  it.each([
    'this is something we should fix for now until the schema settles down',
    'will fix later when the upstream API ships its v3 endpoint',
    'this finding is non-trivial and we should think about it carefully',
    'mark this as future work and revisit after the architecture review',
    'this is deferred to v2 because the cluster migration takes priority',
    'this is deferred to v18 because the storage team is busy',
    'not in scope for this feature; the parent issue handles the surface',
    'TODO: figure out how to handle the multi-region case before this can ship',
    'we should come back to this after the architecture board meets',
  ])('rejects reason containing banned phrase: %s', (reason) => {
    const r = validateAcknowledgedReason(reason);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/banned hedge phrase/i);
  });
});

describe('validateAcknowledgedReason — hygiene-list banned phrases (duplicate canon)', () => {
  it.each([
    'just for now we leave the validator off because the suite is loud enough',
    'the next pass will probably handle the negative-balance case correctly',
    'TBD whether the receipt parser handles multi-currency line items right',
    'will fix this once the renderer stops eating trailing newlines on Safari',
    'will address the duplicate-key race in the index-rebuild sprint window',
    'address in the cache-invalidation cleanup that follows the lockfile bump',
    'fix later when the customer-facing telemetry pipeline becomes available',
    'eventually we will need to special-case the locale fallback chain here',
    'tomorrow we ship the v2 endpoint and that obsoletes this branch entirely',
    'next sprint will absorb the migration cost when the cluster is rotated',
    'next cycle we will revisit the scheduling heuristic under real-world load',
    'next milestone gates the cleanup; this surface is frozen until then',
    'FIXME: the parser miscounts curly braces inside string literal escapes',
    'we can investigate this later if the failure rate climbs past 0.5 percent',
    'follow up after the next architecture review with the storage team owner',
    'this is a HACK until the renderer team rewrites the diff-application path next',
    'XXX we need to revisit this once the cluster has migrated off the legacy quorum',
    'a temporary workaround while the storage team works out the migration path',
    'a stub implementation that wires up the right shape but does not validate inputs',
    'a placeholder UI while the design team finalizes the affordance shape and tokens',
    'pending re-architecture per the 2026-05 architecture review board decision draft',
    'this should land until F5 brings in the cap-relief rewrite across all surfaces',
    'this should land until v0.20 brings in the cap-relief rewrite across all surfaces',
  ])('rejects hygiene-canon banned phrase: %s', (reason) => {
    const r = validateAcknowledgedReason(reason);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/banned hedge phrase/i);
  });
});

describe('validateAcknowledgedReason — accepts substantive reasons', () => {
  it.each([
    'this conflicts with the lane-immutability invariant Phase 4 codified; surfaces would need redesign',
    'the receipt parser was retired in v0.18; this surface no longer exists in mainline',
    'the operator explicitly approved leaving this as a no-op per the 2026-05-12 design review',
    'replaced by the structured-event audit log when the GitHub-Actions migration shipped',
  ])('accepts: %s', (reason) => {
    const r = validateAcknowledgedReason(reason);
    expect(r.valid).toBe(true);
  });
});

describe('validateAcknowledgedReason — banned-phrase catalog', () => {
  it('exposes the Phase 13 PRD-required display names', () => {
    const names = bannedAcknowledgedPhraseDisplayNames();
    expect(names).toContain('for now');
    expect(names).toContain('will fix later');
    expect(names).toContain('non-trivial');
    expect(names).toContain('future work');
    expect(names).toContain('deferred to v<N>');
    expect(names).toContain('not in scope');
    expect(names).toContain('TODO');
    expect(names).toContain('come back to');
  });

  it('exposes the hygiene canonical display names (duplicated locally)', () => {
    const names = bannedAcknowledgedPhraseDisplayNames();
    expect(names).toContain('just for now');
    expect(names).toContain('next pass');
    expect(names).toContain('TBD');
    expect(names).toContain('eventually');
    expect(names).toContain('fixme');
    expect(names).toContain('HACK');
    expect(names).toContain('XXX');
    expect(names).toContain('temporary');
    expect(names).toContain('stub');
    expect(names).toContain('placeholder');
    expect(names).toContain('pending');
    expect(names).toContain('until F<phase>');
    expect(names).toContain('until v<version>');
  });

  it('exports the minimum length constant', () => {
    expect(MIN_REASON_LENGTH).toBe(40);
  });
});
