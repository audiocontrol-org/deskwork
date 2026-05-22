/**
 * @vitest-environment jsdom
 *
 * Tests for rebaseAnchor — the marginalia anchor persistence algorithm.
 *
 * Spec contract (W3C TextQuoteSelector, per #200's design decision):
 *
 *   - Single match of `anchor` in the current text → return that range
 *     (legacy behavior preserved for back-compat with comments that
 *     have no prefix/suffix).
 *   - Zero matches → null (anchor was edited or removed).
 *   - Multiple matches WITHOUT prefix/suffix → null (legacy "refuse to
 *     guess").
 *   - Multiple matches WITH prefix/suffix → score each candidate by
 *     character-boundary match against the captured prefix+suffix;
 *     return the highest-scoring candidate. Null on score-of-zero or
 *     tie (both surrounding contexts equally good or equally bad).
 *
 * Reference: W3C Web Annotation Data Model § TextQuoteSelector.
 * Reference impl: Hypothesis dom-anchor-text-quote (MIT).
 */
import { describe, it, expect } from 'vitest';
import { rebaseAnchor } from '../../../plugins/deskwork-studio/public/src/entry-review/range-utils';

function rootWith(text: string): HTMLElement {
  const div = document.createElement('div');
  div.textContent = text;
  return div;
}

describe('rebaseAnchor', () => {
  describe('back-compat (no prefix/suffix)', () => {
    it('returns the range for a unique anchor', () => {
      const root = rootWith('Hello, world. This is a test.');
      const r = rebaseAnchor(root, 'world');
      expect(r).toEqual({ start: 7, end: 12 });
    });

    it('returns null when anchor appears multiple times without context', () => {
      const root = rootWith('the cat and the dog and the bird');
      const r = rebaseAnchor(root, 'the');
      expect(r).toBeNull();
    });

    it('returns null when anchor does not appear', () => {
      const root = rootWith('Hello, world.');
      const r = rebaseAnchor(root, 'missing');
      expect(r).toBeNull();
    });

    it('returns null for empty or undefined anchor', () => {
      const root = rootWith('Hello, world.');
      expect(rebaseAnchor(root, undefined)).toBeNull();
      expect(rebaseAnchor(root, '')).toBeNull();
    });
  });

  describe('with prefix/suffix disambiguation (W3C TextQuoteSelector)', () => {
    it('picks the candidate whose surrounding context matches prefix+suffix', () => {
      // Anchor "the goal" appears twice; only one has the original context.
      const root = rootWith(
        'In v1 we set the goal of shipping in May. ' +
        'But now the goal is to ship faster.',
      );
      const r = rebaseAnchor(
        root,
        'the goal',
        /* prefix */ 'we set ',
        /* suffix */ ' of shipping',
      );
      expect(r).toEqual({ start: 13, end: 21 });
    });

    it('picks via suffix alone when prefix is empty (anchor at start)', () => {
      const root = rootWith(
        'The agent shipped. The agent shipped today and yesterday.',
      );
      const r = rebaseAnchor(
        root,
        'The agent shipped',
        /* prefix */ '',
        /* suffix */ ' today',
      );
      expect(r).toEqual({ start: 19, end: 36 });
    });

    it('picks via prefix alone when suffix is empty (anchor at end)', () => {
      const root = rootWith(
        'first paragraph done. second paragraph done.',
      );
      const r = rebaseAnchor(
        root,
        'done.',
        /* prefix */ 'second paragraph ',
        /* suffix */ '',
      );
      expect(r).toEqual({ start: 39, end: 44 });
    });

    it('returns null when prefix/suffix match nothing in any candidate', () => {
      // Anchor appears multiple times but neither has the original context.
      const root = rootWith('the cat and the dog');
      const r = rebaseAnchor(
        root,
        'the',
        /* prefix */ 'completely different ',
        /* suffix */ ' surroundings',
      );
      expect(r).toBeNull();
    });

    it('returns null on a tie (two candidates with equal-strength match)', () => {
      // Two occurrences with identical neighboring chars.
      const root = rootWith('alpha word beta. alpha word beta.');
      const r = rebaseAnchor(root, 'word', 'alpha ', ' beta');
      expect(r).toBeNull();
    });

    it('prefers the candidate with stronger boundary match', () => {
      // Two "foo" candidates; only the second has prefix "xy " AND suffix " ab".
      const root = rootWith('xx foo zz some other text xy foo ab end');
      const r = rebaseAnchor(root, 'foo', 'xy ', ' ab');
      expect(r).toEqual({ start: 29, end: 32 });
    });

    it('handles partial prefix match (boundary char matches, deeper does not)', () => {
      // Candidate A: prefix " foo" — only 1 char (space) matches from boundary backward.
      // Candidate B: prefix "abc " — 4 chars match.
      // Should pick B even though both have SOME prefix overlap.
      const root = rootWith('xxx foo zzz abc foo end');
      const r = rebaseAnchor(root, 'foo', 'abc ', ' end');
      expect(r).toEqual({ start: 16, end: 19 });
    });

    it('falls through to single-match when only one occurrence exists', () => {
      // Anchor appears once; prefix/suffix are present but the algorithm
      // doesn't need them. Should return the unique match.
      const root = rootWith('Hello, world.');
      const r = rebaseAnchor(root, 'world', 'Hello, ', '.');
      expect(r).toEqual({ start: 7, end: 12 });
    });

    it('handles prefix that extends beyond document start', () => {
      // Anchor at position 5; prefix captures "[start]X foo " (longer than position 5).
      // Should not throw; should match what it can.
      const root = rootWith('X foo zzz X foo end');
      const r = rebaseAnchor(root, 'foo', 'X ', ' zzz');
      expect(r).toEqual({ start: 2, end: 5 });
    });

    it('handles suffix that extends beyond document end', () => {
      const root = rootWith('start foo end');
      const r = rebaseAnchor(root, 'end', ' foo ', '');
      expect(r).toEqual({ start: 10, end: 13 });
    });
  });

  describe('fuzzy fallback (diff-match-patch, when exact + context fails)', () => {
    it('recovers anchor edited by a single character insertion', () => {
      // Original anchor "the goal" was edited to "the new goal" in v2.
      // Exact indexOf for "the goal" finds nothing → falls through to fuzzy.
      const root = rootWith(
        'We set the new goal of shipping in May. ' +
        'Done.',
      );
      const r = rebaseAnchor(
        root,
        'the goal',
        /* prefix */ 'We set ',
        /* suffix */ ' of shipping',
        /* originalStart */ 7,
      );
      expect(r).not.toBeNull();
      // Returns approximate range near where the fuzzy match landed
      // (Bitap returns the START position of the closest match).
      expect(r!.start).toBeGreaterThanOrEqual(7);
      expect(r!.start).toBeLessThanOrEqual(15);
    });

    it('recovers anchor edited by a single character deletion', () => {
      // Original "the elephant" → "the elphant" (typo introduced).
      const root = rootWith('the elphant in the room');
      const r = rebaseAnchor(
        root,
        'the elephant',
        /* prefix */ '',
        /* suffix */ ' in the room',
        /* originalStart */ 0,
      );
      expect(r).not.toBeNull();
      expect(r!.start).toBe(0);
    });

    it('returns null when fuzzy similarity is below threshold', () => {
      // Anchor "alpha bravo charlie" — completely unrelated to the text.
      const root = rootWith('totally different content here, nothing to match');
      const r = rebaseAnchor(
        root,
        'alpha bravo charlie',
        '',
        '',
        /* originalStart */ 5,
      );
      expect(r).toBeNull();
    });

    it('does not fuzzy-match when originalStart is omitted (back-compat)', () => {
      // Edited anchor + no originalStart hint → no fuzzy fallback.
      // Falls through to exact null since "the new goal" isn't an exact
      // anchor in our search ("the goal" is what we look for).
      const root = rootWith('We set the new goal of shipping.');
      const r = rebaseAnchor(
        root,
        'the goal',
        'We set ',
        ' of shipping',
        /* originalStart omitted */
      );
      expect(r).toBeNull();
    });

    it('prefers exact match over fuzzy when both could apply', () => {
      // "the goal" appears EXACTLY once (no edit) AND fuzzy would also
      // succeed. Exact path should win and return precise range.
      const root = rootWith('We set the goal of shipping.');
      const r = rebaseAnchor(
        root,
        'the goal',
        'We set ',
        ' of shipping',
        /* originalStart */ 7,
      );
      expect(r).toEqual({ start: 7, end: 15 });
    });
  });

  describe('long-anchor handling (>32 chars, diff-match-patch Match_MaxBits)', () => {
    // Regression coverage for the "Pattern too long for this browser."
    // error raised by diff-match-patch's Bitap algorithm when a pattern
    // exceeds Match_MaxBits (default 32) and the dmp instance hasn't
    // opted out of the limit. The studio's marginalia review surface
    // hits this whenever a captured anchor exceeds 32 characters and
    // exact-match misses (e.g. text-normalization drift between
    // capture-time and load-time, or any intervening edit). iOS Safari
    // was the surfacing context (its text-node concatenation diverges
    // from Chromium's just enough to drop exact matches that would
    // succeed on desktop); the underlying behavior is browser-agnostic
    // because the throw lives in dmp's JS source.
    //
    // Anchor strings used here are >=33 chars to exercise the boundary;
    // the longest real-world anchor on the graphical-entries spec is
    // 37 chars ("Per-stage columns are template-aware.").
    it('does not throw on a >32-char anchor when fuzzy fallback fires', () => {
      const longAnchor = 'Per-stage columns are template-aware.'; // 37 chars
      // Body contains a slightly-edited variant (capitalization +
      // trailing token), so exact indexOf misses → fuzzyFallback fires.
      const root = rootWith(
        'See § Render. Per-stage columns are template-aware now. End.',
      );
      expect(() =>
        rebaseAnchor(
          root,
          longAnchor,
          /* prefix */ 'See § Render. ',
          /* suffix */ ' End.',
          /* originalStart */ 14,
        ),
      ).not.toThrow();
    });

    it('returns null (refuse to guess) for a >32-char anchor when exact match fails', () => {
      // dmp's Bitap can't handle patterns longer than Match_MaxBits (32);
      // the fuzzy fallback refuses long anchors rather than throwing.
      // The operator can re-anchor manually via edit-comment if precise
      // placement matters.
      const longAnchor = 'Per-stage columns are template-aware.'; // 37 chars
      const root = rootWith(
        'See § Render. Per-stage columns are template-aware now. End.',
      );
      const r = rebaseAnchor(
        root,
        longAnchor,
        /* prefix */ 'See § Render. ',
        /* suffix */ ' End.',
        /* originalStart */ 14,
      );
      expect(r).toBeNull();
    });

    it('still returns the exact range for a >32-char anchor that matches exactly (no fuzzy fallback)', () => {
      // Length-32-plus anchors should still work fine via the exact path —
      // the dmp Bitap limit only matters for the fuzzy fallback.
      const longAnchor = 'Per-stage columns are template-aware.'; // 37 chars
      const root = rootWith(
        'See § Render. Per-stage columns are template-aware. End.',
      );
      const r = rebaseAnchor(
        root,
        longAnchor,
        /* prefix */ 'See § Render. ',
        /* suffix */ ' End.',
        /* originalStart */ 14,
      );
      expect(r).toEqual({ start: 14, end: 14 + longAnchor.length });
    });

    it('returns null (not throw) when a >32-char anchor has no plausible match', () => {
      const longAnchor = 'alpha bravo charlie delta echo foxtrot'; // 38 chars
      const root = rootWith(
        'totally different content here, nothing similar at all',
      );
      let result: ReturnType<typeof rebaseAnchor> | undefined;
      expect(() => {
        result = rebaseAnchor(
          root,
          longAnchor,
          /* prefix */ '',
          /* suffix */ '',
          /* originalStart */ 5,
        );
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it('handles a 33-char anchor at the Match_MaxBits boundary', () => {
      // Exactly one character over the default 32-char limit.
      const anchor = 'abcdefghijklmnopqrstuvwxyz0123456'; // 33 chars
      const root = rootWith(
        'leading text abcdefghijklmnopqrstuvwxyz0123457 trailing',
      );
      expect(() =>
        rebaseAnchor(root, anchor, 'leading text ', ' trailing', 13),
      ).not.toThrow();
    });
  });
});
