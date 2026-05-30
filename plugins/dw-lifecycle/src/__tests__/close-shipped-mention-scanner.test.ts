import { describe, it, expect } from 'vitest';
import { extractMentions } from '../close-shipped/mention-scanner.js';

describe('extractMentions', () => {
  it('returns empty set on text with no #NNN', () => {
    expect(extractMentions('no refs here')).toEqual(new Set());
  });

  it('extracts a single bare #NNN', () => {
    expect(extractMentions('see #42')).toEqual(new Set([42]));
  });

  it('extracts multiple distinct issue numbers across one text', () => {
    const text = 'feat: subject (#42)\n\nCloses #43, refs #44 too';
    expect(extractMentions(text)).toEqual(new Set([42, 43, 44]));
  });

  it('deduplicates the same issue number mentioned multiple times', () => {
    const text = '#42 here #42 there #42';
    expect(extractMentions(text)).toEqual(new Set([42]));
  });

  it('excludes `#NNN` segments inside http(s) URLs', () => {
    expect(
      extractMentions('see https://github.com/owner/repo/pull/9999 only'),
    ).toEqual(new Set());
  });

  it('extracts numbers from end-of-subject parens, refs verbs, plain mentions equally', () => {
    expect(extractMentions('feat: x (#10)')).toEqual(new Set([10]));
    expect(extractMentions('Refs #11')).toEqual(new Set([11]));
    expect(extractMentions('plain #12 reference')).toEqual(new Set([12]));
  });

  it('does NOT extract id-fragment shapes like `section#NNN`', () => {
    expect(extractMentions('section#42 anchor')).toEqual(new Set());
  });

  it('does NOT extract cross-repo refs like `owner/repo#NNN`', () => {
    expect(extractMentions('see owner/repo#42 elsewhere')).toEqual(new Set());
  });

  it('caps issue numbers at 7 digits (GitHub upper bound + margin)', () => {
    expect(extractMentions('#1234567 fits; #12345678 does not')).toEqual(
      new Set([1234567]),
    );
  });
});
