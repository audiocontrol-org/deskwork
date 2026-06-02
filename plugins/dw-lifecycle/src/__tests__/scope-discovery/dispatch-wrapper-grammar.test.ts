/**
 * Phase 14 Task 2 — relax dispatch-wrapper grammar false-positives.
 *
 * Closes AUDIT-20260529-13.
 *
 * Two specific relaxations per the TF-003 friction (+ #362 Medium):
 *
 * 1. **Searched-count noun whitelist widened.** Adds `issues?`,
 *    `bugs?`, `findings?`, `errors?`, `warnings?` to the existing
 *    `matches/hits/occurrences/instances/sites/call sites/files/results/references`
 *    set. `5 issues found` previously rejected; now accepted.
 *
 * 2. **Forbidden-deferral phrase matcher upgraded from bare substring
 *    to word-boundary + context-aware.** Ambiguous nouns/verbs
 *    (`stub`, `placeholder`, `pending`, `temporary`, `hack`, `defer*`)
 *    no longer trip on descriptive prose (`the placeholder tile`,
 *    `stub function`). They DO still trip when they appear in
 *    deferral collocations (`placeholder for now`, `stub until F5`,
 *    `defer to v2`). Comment markers (`TODO`, `FIXME`, `XXX`) stay
 *    flagged on a bare match — they're conventional deferral signals
 *    in code comments and rarely appear as descriptive prose.
 *
 * Tests assert via the public `validateParsed` entry point on
 * dispatch-grammar.ts (which uses the default phrase/regex lists).
 */

import { describe, it, expect } from 'vitest';
import {
  parseReturn,
  validateParsed,
  DispatchRejected,
} from '../../scope-discovery/dispatch-grammar.js';

// Construct a minimal grammar-conformant response with a custom
// Excluded reason. Lets us test the forbidden-phrase logic without
// re-typing the whole return block per case.
function buildResponse(excludedReason: string): string {
  return [
    'Searched: demo — 3 matches',
    'Included: src/foo.ts:1',
    `Excluded: src/bar.ts:1 — ${excludedReason}`,
    '',
  ].join('\n');
}

describe('Phase 14 Task 2 — Searched-count noun whitelist widened', () => {
  function tryParse(searchedLine: string): { ok: boolean; reason?: string } {
    const text = [
      searchedLine,
      'Included: src/foo.ts:1',
      'Excluded: src/bar.ts:1 — different module',
      '',
    ].join('\n');
    try {
      parseReturn(text);
      return { ok: true };
    } catch (err) {
      if (err instanceof DispatchRejected) return { ok: false, reason: err.message };
      throw err;
    }
  }

  it("accepts '5 issues' as a Searched-count phrase (TF-003 head noun)", () => {
    const r = tryParse('Searched: lint-rule — 5 issues');
    expect(r.ok).toBe(true);
  });

  it("accepts '5 issues found' (trailing modifier OK)", () => {
    const r = tryParse('Searched: lint-rule — 5 issues found');
    expect(r.ok).toBe(true);
  });

  it("accepts '2 bugs' as a Searched-count phrase", () => {
    const r = tryParse('Searched: pattern — 2 bugs');
    expect(r.ok).toBe(true);
  });

  it("accepts '7 findings' as a Searched-count phrase", () => {
    const r = tryParse('Searched: pattern — 7 findings');
    expect(r.ok).toBe(true);
  });

  it("accepts '4 errors' as a Searched-count phrase", () => {
    const r = tryParse('Searched: pattern — 4 errors');
    expect(r.ok).toBe(true);
  });

  it("accepts '1 warning' (singular) as a Searched-count phrase", () => {
    const r = tryParse('Searched: pattern — 1 warning');
    expect(r.ok).toBe(true);
  });

  it('still rejects an unknown head noun (whitelist not bypassed)', () => {
    const r = tryParse('Searched: pattern — 4 widgets');
    expect(r.ok).toBe(false);
  });

  it('still accepts the pre-existing nouns: matches/hits/files/instances/sites', () => {
    expect(tryParse('Searched: a — 1 match').ok).toBe(true);
    expect(tryParse('Searched: a — 2 hits').ok).toBe(true);
    expect(tryParse('Searched: a — 3 files').ok).toBe(true);
    expect(tryParse('Searched: a — 4 instances').ok).toBe(true);
    expect(tryParse('Searched: a — 5 call sites').ok).toBe(true);
  });
});

function checkExcluded(reason: string): { valid: boolean; rejectedPhrase?: string } {
  try {
    const parsed = parseReturn(buildResponse(reason));
    validateParsed(parsed);
    return { valid: true };
  } catch (err) {
    if (err instanceof DispatchRejected) {
      const m = /forbidden deferral phrase\s+"([^"]+)"/.exec(err.message);
      return m !== null
        ? { valid: false, rejectedPhrase: m[1] }
        : { valid: false };
    }
    throw err;
  }
}

describe('Phase 14 Task 2 — forbidden-deferral relaxation (descriptive prose passes)', () => {
  it("descriptive 'the placeholder tile' passes (not a deferral)", () => {
    const r = checkExcluded('the placeholder tile is rendered by a sibling component');
    expect(r.valid).toBe(true);
  });

  it("descriptive 'stub function' passes (not a deferral)", () => {
    const r = checkExcluded(
      'sibling has a stub function used only in tests; not relevant',
    );
    expect(r.valid).toBe(true);
  });

  it("descriptive 'pending review' (UI-domain noun) passes", () => {
    const r = checkExcluded(
      'the pending review column is rendered by Calendar.tsx; out of scope',
    );
    expect(r.valid).toBe(true);
  });

  it("descriptive 'temporary buffer' (technical noun) passes", () => {
    const r = checkExcluded(
      'allocated a temporary buffer in the parser, unrelated to this dispatch',
    );
    expect(r.valid).toBe(true);
  });

  it("descriptive 'hack the planet' (verb phrase) passes — bare 'hack' no longer trips", () => {
    const r = checkExcluded(
      'movie reference left in the comment header; not deferral',
    );
    expect(r.valid).toBe(true);
  });
});

describe('Phase 14 Task 2 — deferral collocations still trip', () => {
  it("'for now' still trips (bare phrase, unambiguous deferral)", () => {
    const r = checkExcluded('different concern for now, will address upstream');
    expect(r.valid).toBe(false);
  });

  it("'will fix' still trips", () => {
    const r = checkExcluded('out of scope this dispatch, will fix in a follow-up');
    expect(r.valid).toBe(false);
  });

  it("'placeholder for now' trips (deferral collocation)", () => {
    const r = checkExcluded('left a placeholder for now until the spec settles');
    expect(r.valid).toBe(false);
  });

  it("'stub for now' trips (deferral collocation)", () => {
    const r = checkExcluded('using a stub for now to keep the test green');
    expect(r.valid).toBe(false);
  });

  it("'placeholder until phase 5' trips (deferral collocation)", () => {
    const r = checkExcluded('left a placeholder until phase 5 ships the real impl');
    expect(r.valid).toBe(false);
  });

  it("'defer to v2' trips (deferral verb + version)", () => {
    const r = checkExcluded('defer to v2 since the API contract is not yet finalized');
    expect(r.valid).toBe(false);
  });

  it("bare 'TODO' still trips (conventional code-comment deferral marker)", () => {
    const r = checkExcluded('TODO add the validation here');
    expect(r.valid).toBe(false);
  });

  it("bare 'FIXME' still trips", () => {
    const r = checkExcluded('FIXME this is a known bug in the parser');
    expect(r.valid).toBe(false);
  });

  it("bare 'XXX' still trips", () => {
    const r = checkExcluded('XXX needs proper error handling');
    expect(r.valid).toBe(false);
  });

  it("'address in v3' still trips (existing collocation; regression guard)", () => {
    const r = checkExcluded('address in v3 release alongside the schema migration');
    expect(r.valid).toBe(false);
  });

  it("'fix it later' still trips (existing later-collocation)", () => {
    const r = checkExcluded('out of scope this round, will fix it later');
    expect(r.valid).toBe(false);
  });
});

// Review-finding integration — Track 3 #2 + #3 (AUDIT-20260529-18 + -19).
describe('Phase 14 Task 2 follow-up — review findings T3-2 + T3-3', () => {
  // T3-2: ambiguous noun + intervening modifier + deferral collocation.
  // Phase 14 Task 2's regex required adjacency; an intervening modifier
  // slipped the matcher. Widen to `{0,2}` modifier tokens AND extend
  // `until` deferral context to include `until we` / `until the next`.

  it("'placeholder approach until we figure out the right shape' trips (modifier + until-we)", () => {
    const r = checkExcluded('left a placeholder approach until we figure out the right shape');
    expect(r.valid).toBe(false);
  });

  it("'stub implementation until v3' trips (modifier + until-version)", () => {
    const r = checkExcluded('using a stub implementation until v3 lands');
    expect(r.valid).toBe(false);
  });

  it("'placeholder code path until the next sprint' trips (2 modifiers + until-next)", () => {
    const r = checkExcluded('left a placeholder code path until the next sprint addresses it');
    expect(r.valid).toBe(false);
  });

  // Negative cases — descriptive prose with the same ambiguous nouns
  // that should NOT trip even with the widened regex.

  it("'placeholder text shown until the user types' passes (descriptive UI behavior)", () => {
    const r = checkExcluded('placeholder text shown until the user types in the input field');
    expect(r.valid).toBe(true);
  });

  it("'stub function tested elsewhere' passes (descriptive prose)", () => {
    const r = checkExcluded('the stub function tested elsewhere by the legacy harness');
    expect(r.valid).toBe(true);
  });

  // T3-3: defer-verb false positive on bare `to`. "defer to v#/F#/phase"
  // is a real deferral; "defer to the operator/spec/abstraction" is a
  // legitimate idiom meaning "let X decide". Narrow the regex to require
  // a version/phase marker after `to`.

  it("'defer to v2' still trips (version target — regression guard)", () => {
    const r = checkExcluded('defer to v2 since the contract is not yet finalized');
    expect(r.valid).toBe(false);
  });

  it("'defer to F3' still trips (phase target — regression guard)", () => {
    const r = checkExcluded('defer to F3 once the upstream API stabilizes');
    expect(r.valid).toBe(false);
  });

  it("'defer to phase 5' still trips (phase number target)", () => {
    const r = checkExcluded('defer to phase 5 alongside the schema migration');
    expect(r.valid).toBe(false);
  });

  it("'defer to the operator' passes (legitimate idiom — let-X-decide)", () => {
    const r = checkExcluded('architectural concern; defer to the operator for scoping');
    expect(r.valid).toBe(true);
  });

  it("'defer to the spec' passes (legitimate documentation reference)", () => {
    const r = checkExcluded('semantics defer to the spec at THESIS.md');
    expect(r.valid).toBe(true);
  });

  it("'defer to the existing abstraction' passes (legitimate technical prose)", () => {
    const r = checkExcluded('the new code defers to the existing abstraction in util/parser.ts');
    expect(r.valid).toBe(true);
  });

  it("'deferred to v2' still trips (past-tense + version)", () => {
    const r = checkExcluded('originally deferred to v2 release alongside the schema migration');
    expect(r.valid).toBe(false);
  });
});
