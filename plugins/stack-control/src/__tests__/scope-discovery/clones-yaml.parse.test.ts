/**
 * Adversarial scenarios for parse-time refactor-precondition rejection.
 *
 * Ported from the audiocontrol pilot's
 * `clone-detector.refactor-scenarios.ts` (scenarios 4-7). Each
 * scenario hands a malformed YAML to `parseClonesYaml` and asserts:
 *   (a) the parser throws,
 *   (b) the throw is a RefactorPreconditionError,
 *   (c) the error message names the offending field.
 *
 * These are pure parser-layer tests — refactor-precondition bugs
 * surface at parse time and the gate's job is to surface them as
 * loud, named rejections at exactly that layer.
 *
 * Companion to `clones-yaml.refactor.test.ts` which covers the three
 * canonical_side happy-path + conditional-required-field variants.
 */

import { describe, it, expect } from 'vitest';
import {
  parseClonesYaml,
  RefactorPreconditionError,
} from '../../scope-discovery/clones-yaml.js';

function buildRefactorBaselineYaml(fields: string): string {
  return [
    'generated_at: 2026-05-22T00:00:00.000Z',
    'clones:',
    '  - id: abc123def456',
    '    lines: 12',
    '    members:',
    '      - modules/x/file-a.ts:1:12',
    '      - modules/x/file-b.ts:1:12',
    '    disposition: refactor',
    '    reason: T5.1 fixture — operator-authored refactor disposition',
    fields,
    '',
  ].join('\n');
}

/**
 * Shared adversarial-rejection probe: parse a malformed YAML and
 * confirm (a) it throws, (b) the throw is a RefactorPreconditionError,
 * (c) the error message names `needle`. Returns the captured error so
 * callers can layer additional assertions on top.
 */
function assertRefactorRejection(yaml: string, needle: string): RefactorPreconditionError {
  let captured: unknown = null;
  try {
    parseClonesYaml(yaml);
  } catch (err) {
    captured = err;
  }
  expect(captured, `parser accepted malformed entry; expected rejection naming ${needle}`).not.toBeNull();
  expect(captured).toBeInstanceOf(RefactorPreconditionError);
  if (!(captured instanceof RefactorPreconditionError)) {
    throw new Error('unreachable: expect above guarantees the instanceof'); // narrows TS
  }
  expect(captured.message).toContain(needle);
  return captured;
}

describe('clones-yaml — parse-time refactor-precondition rejection', () => {
  it("missing 'tests' field rejects with RefactorPreconditionError naming tests", () => {
    const yaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: modules/x/file-a.ts',
        '    canonical_reason: file-a.ts is canonical; file-b.ts is the holdout',
        '    tests_proof:',
        '      sha: deadbeef',
        '      demonstration: holdout call sites return legacy shape; test must pin the regression',
      ].join('\n'),
    );
    let captured: unknown = null;
    try {
      parseClonesYaml(yaml);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(RefactorPreconditionError);
    if (captured instanceof RefactorPreconditionError) {
      // The pilot's check tolerated either `'tests'` (quoted) or ` tests `
      // (whitespace-wrapped) framing in the error message; preserve both.
      const mentionsTests =
        captured.message.includes("'tests'") || captured.message.includes(' tests ');
      expect(mentionsTests, `error did not name 'tests' field: ${captured.message}`).toBe(true);
    }
  });

  it('malformed tests[] element (non-string) rejects naming the offending index', () => {
    const yaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: modules/x/file-a.ts',
        '    canonical_reason: file-a.ts is canonical; file-b.ts is the holdout',
        '    tests:',
        '      - 42',
        '      - modules/x/test/valid-test.ts',
        '    tests_proof:',
        '      sha: a1b2c3d',
        '      demonstration: holdout call sites return legacy shape; test pins the regression',
      ].join('\n'),
    );
    assertRefactorRejection(yaml, 'tests[0]');
  });

  it('malformed tests_proof.sha (non-hex) rejects naming tests_proof.sha', () => {
    const yaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: modules/x/file-a.ts',
        '    canonical_reason: file-a.ts is canonical; file-b.ts is the holdout',
        '    tests:',
        '      - modules/x/test/valid-test.ts',
        '    tests_proof:',
        '      sha: ZZZZZZZ',
        '      demonstration: holdout call sites return legacy shape; test pins the regression',
      ].join('\n'),
    );
    assertRefactorRejection(yaml, 'tests_proof.sha');
  });

  it('missing canonical_reason rejects naming canonical_reason', () => {
    const yaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: all',
        '    tests:',
        '      - modules/x/test/valid-test.ts',
        '    tests_proof:',
        '      sha: a1b2c3d',
        '      demonstration: both sides currently render correctly; extraction must preserve identical output',
      ].join('\n'),
    );
    assertRefactorRejection(yaml, 'canonical_reason');
  });
});
