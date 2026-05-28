import { describe, it, expect } from 'vitest';
import {
  bannedPhraseDisplayNames,
  MIN_REASON_LENGTH,
  validateSubstantiveReason,
} from '../promote-deferrals/substantive-reason.js';

describe('validateSubstantiveReason — length floor', () => {
  it('refuses an empty string', () => {
    const r = validateSubstantiveReason('');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it('refuses whitespace-only input', () => {
    const r = validateSubstantiveReason('     \t\n   ');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it(`refuses input below ${MIN_REASON_LENGTH} chars after trim`, () => {
    const r = validateSubstantiveReason('Just too short to count.');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/minimum/i);
  });

  it('counts characters AFTER trim', () => {
    const padded = `${' '.repeat(50)}OK${' '.repeat(50)}`;
    const r = validateSubstantiveReason(padded);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/minimum/i);
  });

  it('accepts a clean reason of exactly the minimum length', () => {
    const exact = 'X'.repeat(MIN_REASON_LENGTH);
    const r = validateSubstantiveReason(exact);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('rejects non-string input', () => {
    // The validator is the gate; defensive against malformed JSON input
    // where the field decoded to a non-string.
    const r = validateSubstantiveReason(
      // Coerce through `unknown` to exercise the runtime guard.
      (42 as unknown) as string,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/string/i);
  });
});

describe('validateSubstantiveReason — banned hedge phrases', () => {
  it.each([
    'this is something we should fix for now until the schema settles down',
    'just for now we leave the validator off because the suite is loud enough',
    'the next pass will probably handle the negative-balance case correctly',
    'TBD whether the receipt parser handles multi-currency line items right',
    'will fix later when the upstream API ships its v3 endpoint',
    'will fix this once the renderer stops eating trailing newlines on Safari',
    'will address the duplicate-key race in the index-rebuild sprint window',
    'address in the cache-invalidation cleanup that follows the lockfile bump',
    'fix later when the customer-facing telemetry pipeline becomes available',
    'eventually we will need to special-case the locale fallback chain here',
    'tomorrow we ship the v2 endpoint and that obsoletes this branch entirely',
    'next sprint will absorb the migration cost when the cluster is rotated',
    'next cycle we will revisit the scheduling heuristic under real-world load',
    'next milestone gates the cleanup; this surface is frozen until then',
    'this is deferred to the next architecture review because too much rides on it',
    'TODO: figure out how to handle the multi-region case before this can ship',
    'FIXME: the parser miscounts curly braces inside string literal escapes',
    'we can investigate this later if the failure rate climbs past 0.5 percent',
    'follow up after the next architecture review with the storage team owner',
    'will follow-up after the next sync once the storage team has weighed in',
  ])('rejects reason containing banned phrase: %s', (reason) => {
    const r = validateSubstantiveReason(reason);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/banned hedge phrase/i);
  });

  it('matches case-insensitively', () => {
    const r = validateSubstantiveReason(
      'This is something we should FIX LATER when the time comes around again',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/banned hedge phrase/i);
  });

  it('does NOT match `later` inside compound words like `later-version`', () => {
    // `later` is a word-boundary regex; the compound form must pass the
    // banned-phrase check (it can still fail the length floor depending
    // on content; here we make it long enough to clear the floor).
    const reason =
      'the api ships a later-version flag that supersedes the legacy gate we ship today';
    const r = validateSubstantiveReason(reason);
    expect(r.valid).toBe(true);
  });

  it('does NOT match `tbd` as a substring inside a longer word', () => {
    const reason =
      'the atbdmark sentinel character means something specific in our parser internals here';
    const r = validateSubstantiveReason(reason);
    expect(r.valid).toBe(true);
  });

  it('does NOT match `todo` as a substring inside a longer word', () => {
    const reason =
      'mastodonts roam through the integration suite when the harness is misconfigured here';
    const r = validateSubstantiveReason(reason);
    expect(r.valid).toBe(true);
  });

  it('surfaces multiple banned hits in the rejection reason', () => {
    const r = validateSubstantiveReason(
      'this is a TODO that we will fix later when the time comes around the bend',
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/todo/i);
    expect(r.reason).toMatch(/will fix/i);
  });
});

describe('validateSubstantiveReason — accepts substantive reasons', () => {
  it.each([
    'this conflicts with the lane-immutability invariant Phase 4 codified; surfaces would need redesign',
    'the receipt parser was retired in v0.18; this surface no longer exists in mainline',
    'the operator explicitly approved leaving this as a no-op per the 2026-05-12 design review',
    'replaced by the structured-event audit log when the GitHub-Actions migration shipped',
  ])('accepts: %s', (reason) => {
    const r = validateSubstantiveReason(reason);
    expect(r.valid).toBe(true);
  });
});

describe('validateSubstantiveReason — banned-phrase catalog', () => {
  it('exposes the canonical display names', () => {
    const names = bannedPhraseDisplayNames();
    expect(names).toContain('for now');
    expect(names).toContain('next pass');
    expect(names).toContain('TBD');
    expect(names).toContain('will fix later');
    expect(names).toContain('eventually');
    expect(names).toContain('todo');
    expect(names).toContain('fixme');
    expect(names).toContain('later (standalone word)');
    expect(names).toContain('follow up / follow-up');
  });

  it('exports the minimum length constant', () => {
    expect(MIN_REASON_LENGTH).toBe(40);
  });
});
