import { describe, it, expect } from 'vitest';
import { validateSlug, validateTargetVersion } from '../slug.js';

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

describe('validateTargetVersion', () => {
  describe('valid target versions', () => {
    it.each([
      ['1.0'],
      ['1.1'],
      ['v1'],
      ['v1.0'],
      ['2026-05'],
      ['release-1.2'],
      ['a'],
    ])('accepts %s', (targetVersion) => {
      expect(() => validateTargetVersion(targetVersion)).not.toThrow();
    });
  });

  describe('invalid target versions', () => {
    it.each([
      ['..'],
      ['../etc'],
      ['../../foo'],
      ['foo/bar'],
      ['foo\\bar'],
      ['/etc/passwd'],
      ['-1.0'],
      ['1.0-'],
      [' foo'],
      ['foo '],
      ['foo bar'],
      ['foo:bar'],
      ['foo;bar'],
      [''],
    ])('rejects %s', (targetVersion) => {
      expect(() => validateTargetVersion(targetVersion)).toThrow(/Invalid target version/);
    });
  });
});
