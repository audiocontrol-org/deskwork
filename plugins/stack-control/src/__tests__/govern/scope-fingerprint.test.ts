// computeScopeFingerprint (030 T085) — content-addressed fingerprint of a governed scope.
// Extracted from the retired per-phase checkpoint-state.ts; the fingerprint is the survivor
// the whole-feature convergence record uses. These cover determinism, directory hashing,
// dedupe, separator normalization, and the fail-loud rejections (escape / empty / symlink).

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeScopeFingerprint } from '../../govern/scope-fingerprint.js';

describe('computeScopeFingerprint', () => {
  it('is deterministic for the same scope + content', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    expect(computeScopeFingerprint(root, ['src/a.ts'])).toBe(
      computeScopeFingerprint(root, ['src/a.ts']),
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('hashes directory scopes deterministically from their children', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    mkdirSync(join(root, 'src', 'govern'), { recursive: true });
    writeFileSync(join(root, 'src', 'govern', 'a.ts'), 'export const a = 1;\n', 'utf8');
    const first = computeScopeFingerprint(root, ['src/govern']);
    writeFileSync(join(root, 'src', 'govern', 'b.ts'), 'export const b = 2;\n', 'utf8');
    expect(computeScopeFingerprint(root, ['src/govern'])).not.toBe(first);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects governed paths that escape the installation root', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    expect(() => computeScopeFingerprint(root, ['../escape'])).toThrow(/dot segments|escapes the installation root/);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects an empty governed path set instead of producing a reusable fingerprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    expect(() => computeScopeFingerprint(root, [])).toThrow(/at least one path/);
    // Entries that canonicalize away (empty strings, bare separators) collapse to an empty
    // scope and must fail the same way — never hash to the stable digest of nothing.
    expect(() => computeScopeFingerprint(root, [''])).toThrow(/at least one path/);
    expect(() => computeScopeFingerprint(root, ['/', ''])).toThrow(/at least one path/);
    rmSync(root, { recursive: true, force: true });
  });

  it('dedupes descendant paths when an ancestor directory is already governed', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'README.md'), 'hi\n', 'utf8');
    expect(computeScopeFingerprint(root, ['docs'])).toBe(
      computeScopeFingerprint(root, ['docs', 'docs/README.md']),
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('normalizes path separators before deduping and hashing scope paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'README.md'), 'hi\n', 'utf8');
    expect(computeScopeFingerprint(root, ['docs'])).toBe(
      computeScopeFingerprint(root, ['docs\\README.md', 'docs']),
    );
    expect(computeScopeFingerprint(root, ['docs/README.md'])).toBe(
      computeScopeFingerprint(root, ['docs\\README.md']),
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects symlinked governed paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'target.ts'), 'export const T = 1;\n', 'utf8');
    symlinkSync(join(root, 'target.ts'), join(root, 'src', 'linked.ts'));
    expect(() => computeScopeFingerprint(root, ['src/linked.ts'])).toThrow(/must not be a symlink/);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects governed paths whose intermediate directory is a symlink outside the installation root', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-fp-'));
    const outside = mkdtempSync(join(tmpdir(), 'scope-fp-outside-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(outside, 'target'), { recursive: true });
      writeFileSync(join(outside, 'target', 'outside.ts'), 'export const T = 1;\n', 'utf8');
      symlinkSync(join(outside, 'target'), join(root, 'src', 'linked-dir'), 'dir');
      expect(() => computeScopeFingerprint(root, ['src/linked-dir/outside.ts'])).toThrow(
        /must not be a symlink|escapes the installation root/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
