/**
 * specs/029-govern-operability — Phase 3 / US3 (T014, RED).
 *
 * FR-019: a finding-signature is the tuple `(normalized-heading,
 * primary-file-path)`, defined ONCE and shared between the dampener identity
 * key (FR-009) and the lift dedup (FR-016). Normalization mirrors the existing
 * cross-model cluster-merge `stripHeading` (lowercase, punctuation-stripped,
 * whitespace-collapsed) — a single normalizer, not a second one.
 */

import { describe, expect, it } from 'vitest';
import {
  findingSignature,
  normalizeHeading,
  primaryFilePath,
} from '../../src/scope-discovery/promote-findings/extract-barrage-findings.js';

describe('finding-signature (US3, FR-019)', () => {
  it('normalizeHeading lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeHeading('  The `Foo`  BAR — baz! ')).toBe('the foo bar baz');
  });

  it('primaryFilePath takes the first file path and strips line:col', () => {
    expect(primaryFilePath('src/x.ts:12:3')).toBe('src/x.ts');
    expect(primaryFilePath('src/a.ts:5; src/b.ts:9')).toBe('src/a.ts');
    expect(primaryFilePath('src/a.ts:5, src/b.ts:9')).toBe('src/a.ts');
    expect(primaryFilePath('src/no-line.ts')).toBe('src/no-line.ts');
  });

  it('equal normalized-heading + equal primary file → equal signature', () => {
    const a = findingSignature('Race in the watchdog kill path', 'src/spawn-cli.ts:42');
    const b = findingSignature('race in the WATCHDOG kill path!', 'src/spawn-cli.ts:99:1');
    expect(a).toBe(b);
  });

  it('different primary file → different signature (same heading)', () => {
    const a = findingSignature('Same heading text here', 'src/a.ts:1');
    const b = findingSignature('Same heading text here', 'src/b.ts:1');
    expect(a).not.toBe(b);
  });

  it('different heading → different signature (same file)', () => {
    const a = findingSignature('First distinct heading', 'src/a.ts:1');
    const b = findingSignature('Second distinct heading', 'src/a.ts:1');
    expect(a).not.toBe(b);
  });

  it('the signature is a stable string key (usable in a Set/Map)', () => {
    const seen = new Set<string>();
    seen.add(findingSignature('Heading one', 'src/a.ts:1'));
    expect(seen.has(findingSignature('heading  one', 'src/a.ts:9'))).toBe(true);
    expect(seen.has(findingSignature('Heading two', 'src/a.ts:1'))).toBe(false);
  });
});
