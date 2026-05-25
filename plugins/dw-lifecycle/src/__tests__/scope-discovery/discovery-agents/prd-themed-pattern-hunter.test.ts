/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/prd-themed-pattern-hunter.test.ts
 *
 * Ported from the audiocontrol pilot's
 * `tools/scope-discovery/discovery-agents/prd-themed-pattern-hunter.validate.ts`
 * (T7.5 polish). Asserts the PRD-themed pattern hunter's tokenizer
 * strips URL components (https?:// + bare hostnames like github.com)
 * BEFORE splitting on non-word, so URL fragments don't pollute the
 * theme bag-of-words. Without this gate, a PRD with N references to
 * github.com pages can promote "github" / "com" over actual domain
 * terms.
 *
 * Single tokenizer scenario plus a gutted-stub self-check (the harness
 * has teeth — confirms a regressed tokenizer WOULD leak URL components,
 * proving the production assertion is meaningful).
 *
 * The relevance + synthesizer end-to-end scenarios live in the sibling
 * `prd-themed-pattern-hunter.relevance.test.ts` file (split to keep
 * both files well under the 500-line cap).
 */

import { describe, it, expect } from 'vitest';
import {
  tokenizePrd,
  type TermRank,
} from '../../../scope-discovery/discovery-agents/prd-themed-pattern-hunter.js';

/**
 * Build a PRD-shaped text that contains:
 *   - a real domain theme repeated >= MIN_TERM_FREQ (3) times so it
 *     should survive the frequency filter and appear in the output;
 *   - several URL/host fragments that would, without stripping, also
 *     reach the MIN_TERM_FREQ threshold (`github`, `com`, `https`).
 * The assertion: only the domain theme appears in the tokenized
 * result; the URL/host fragments are absent.
 */
function buildFixturePrd(): string {
  return [
    '# Feature: polishtest',
    '',
    'The polishtest feature concerns polishtest tones and polishtest patches.',
    '',
    '## References',
    '',
    '- See https://github.com/example/repo/issues/1',
    '- See https://github.com/example/repo/issues/2',
    '- See https://github.com/example/repo/blob/main/README.md',
    '- And bare host: github.com/foo/bar',
    '- Another: example.org/qux',
    '',
    '## More polishtest context',
    '',
    'polishtest tooling supports polishtest tones in polishtest patches.',
  ].join('\n');
}

function termsContain(ranked: ReadonlyArray<TermRank>, term: string): boolean {
  return ranked.some((r) => r.term === term);
}

/**
 * Regressed tokenizer that skips URL stripping. Otherwise identical
 * config: stopword + len floor + freq floor. We can't import the in-file
 * constants without exporting them, so we rebuild a minimum check
 * structure here (the assertion below only needs presence/absence,
 * not the full pipeline).
 *
 * This shape mirrors `clone-detector.error.test.ts`'s gutted-stub
 * approach: simulate the failure mode and confirm the harness catches
 * it.
 */
function buildRegressedTokenization(text: string): ReadonlyArray<TermRank> {
  const STOPWORDS_LIGHT = new Set([
    'and', 'the', 'see', 'with', 'context', 'feature', 'concerns',
    'tooling', 'supports', 'more', 'main', 'bare', 'host', 'another',
    'foo', 'bar', 'qux', 'repo',
  ]);
  const counts = new Map<string, number>();
  for (const rawTok of text.split(/[^A-Za-z0-9-]+/g)) {
    const tok = rawTok.toLowerCase();
    if (tok.length < 4) continue;
    if (STOPWORDS_LIGHT.has(tok)) continue;
    if (/^\d+$/.test(tok)) continue;
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  const ranked: TermRank[] = [];
  for (const [term, freq] of counts) {
    if (freq < 3) continue;
    ranked.push({ term, freq });
  }
  return ranked;
}

describe('prd-themed-pattern-hunter — tokenizer URL stripping', () => {
  it('strips URL / bare-host components before bag-of-words tokenization', () => {
    const ranked = tokenizePrd(buildFixturePrd());
    // The fixture's domain term "polishtest" occurs >= 3 times and must
    // be present.
    expect(
      termsContain(ranked, 'polishtest'),
      `expected domain term "polishtest" in ranked output; got: ${ranked.map((r) => r.term).join(', ')}`,
    ).toBe(true);
    // The URL/host components must NOT appear — they would have if the
    // tokenizer naively split on `[^A-Za-z0-9-]+` without URL stripping.
    const forbidden = ['github', 'https', 'example', 'issues', 'blob'];
    const leaked = forbidden.filter((t) => termsContain(ranked, t));
    expect(
      leaked,
      `URL/host components leaked into bag-of-words; full bag: ${ranked.map((r) => r.term).join(', ')}`,
    ).toEqual([]);
  });

  it('gutted-stub self-check: regressed tokenizer leaks URL components (harness has teeth)', () => {
    const regressed = buildRegressedTokenization(buildFixturePrd());
    // The regressed tokenizer should leak at least one URL-component
    // term (github appears 4 times in the fixture). If it doesn't, our
    // fixture is too weak to prove the gate has teeth.
    expect(
      termsContain(regressed, 'github'),
      'regressed tokenizer did NOT leak github; fixture is too weak to prove the gate has teeth',
    ).toBe(true);
    // The leak must be the same kind the production assertion above
    // would reject — re-running the production "leaked.length === 0"
    // check on the regressed bag would surface non-empty leaked. That's
    // the teeth check.
    const forbidden = ['github', 'https', 'example', 'issues', 'blob'];
    const leakedFromRegressed = forbidden.filter((t) => termsContain(regressed, t));
    expect(
      leakedFromRegressed.length,
      'regressed tokenizer leaked zero URL components; the production assertion would NOT reject it',
    ).toBeGreaterThan(0);
  });
});
