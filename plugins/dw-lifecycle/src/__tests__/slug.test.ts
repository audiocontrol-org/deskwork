import { describe, it, expect } from 'vitest';
import { validateSlug } from '../slug.js';

describe('validateSlug', () => {
  describe('valid slugs', () => {
    it.each([
      ['dw-lifecycle'],
      ['deskwork-plugin'],
      ['feature-1'],
      ['a'],
      ['a1'],
      ['abc-def-ghi'],
      ['test-feature'],
    ])('accepts %s', (slug) => {
      expect(() => validateSlug(slug)).not.toThrow();
    });
  });

  describe('invalid slugs', () => {
    it.each([
      ['..'],
      ['../etc'],
      ['../../foo'],
      ['foo/bar'],
      ['foo\\bar'],
      ['/etc/passwd'],
      ['-foo'],
      ['foo-'],
      ['-'],
      ['Foo'],
      ['MY-SLUG'],
      [''],
      [' foo'],
      ['foo '],
      ['foo bar'],
      ['foo.bar'],
      ['foo:bar'],
      ['foo;bar'],
    ])('rejects %s', (slug) => {
      expect(() => validateSlug(slug)).toThrow(/Invalid slug/);
    });
  });
});
