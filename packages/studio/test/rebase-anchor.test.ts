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
});
