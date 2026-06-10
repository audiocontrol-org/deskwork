/**
 * Adversarial scenarios for the refactor-disposition precondition
 * variants (canonical_side: <file-path> | "all" | "new").
 *
 * Ported from the audiocontrol pilot's
 * `clone-detector.refactor-scenarios.ts` (scenarios 1-3). These are
 * pure parser-layer tests against `parseClonesYaml` directly — no
 * subprocess invocation, no jscpd run. Refactor-precondition bugs
 * surface at parse time; the test belongs at the parse-time layer.
 *
 * Companion to `clones-yaml.parse.test.ts` which covers the four
 * parse-time wire-format rejection cases (missing/malformed fields).
 *
 * Fixture YAML strings that mention package-manager invocations
 * (`pnpm --filter @audiocontrol/...`) are test DATA validated only
 * for non-empty-string semantics by the parser — the literal value
 * is irrelevant and intentionally left as-is from the pilot.
 */

import { describe, it, expect } from 'vitest';
import {
  parseClonesYaml,
  RefactorPreconditionError,
  hasRefactorDisposition,
} from '../../scope-discovery/clones-yaml.js';

/**
 * Build a baseline-shaped YAML payload with ONE refactor entry whose
 * precondition fields are spelled out by the caller. The `fields`
 * fragment is interpolated AFTER `disposition: refactor` so the caller
 * controls exactly which precondition fields appear.
 */
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

describe('clones-yaml — refactor canonical_side variants', () => {
  it('accepts canonical_side: <file-path> with all five precondition fields', () => {
    const yaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: modules/x/file-a.ts',
        '    canonical_reason: file-a.ts already uses the documented regime; file-b.ts is the holdout',
        '    tests:',
        '      - modules/x/test/file-a.regime.test.ts',
        '    tests_proof:',
        '      sha: a1b2c3d',
        '      demonstration: file-b.ts call site returned legacy shape before extracting; test pinned it',
      ].join('\n'),
    );
    const parsed = parseClonesYaml(yaml);
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(parsed.clones.length).toBe(1);
    const group = parsed.clones[0];
    expect(group).toBeDefined();
    if (group === undefined) return;
    expect(hasRefactorDisposition(group)).toBe(true);
    if (!hasRefactorDisposition(group)) return;
    expect(group.canonical_side).toBe('modules/x/file-a.ts');
  });

  it('accepts canonical_side: "all" without new_shape_summary', () => {
    const yaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: all',
        '    canonical_reason: both files are correctly migrated; duplication is a missing-primitive gap',
        '    tests:',
        '      - pnpm --filter @audiocontrol/roland-sxx0-editor test:ui',
        '    tests_proof:',
        '      sha: 1234567890abcdef',
        '      demonstration: both sides currently render correctly; extraction must preserve identical output',
      ].join('\n'),
    );
    const parsed = parseClonesYaml(yaml);
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(parsed.clones.length).toBe(1);
    const group = parsed.clones[0];
    expect(group).toBeDefined();
    if (group === undefined) return;
    expect(hasRefactorDisposition(group)).toBe(true);
    if (!hasRefactorDisposition(group)) return;
    expect(group.canonical_side).toBe('all');
    expect(group.new_shape_summary).toBeUndefined();
  });

  it('accepts canonical_side: "new" WITH new_shape_summary; rejects WITHOUT it', () => {
    const happyYaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: new',
        '    canonical_reason: no side is canonical; both call sites diverge from the documented design',
        '    new_shape_summary: extract a CommonRow primitive accepting label + value + trailing-action slots',
        '    tests:',
        '      - modules/x/test/common-row.test.ts',
        '    tests_proof:',
        '      sha: 0123abc4567',
        '      demonstration: neither side currently renders the trailing-action slot; new primitive adds it',
      ].join('\n'),
    );
    const happy = parseClonesYaml(happyYaml);
    expect(happy).not.toBeNull();
    if (happy === null) return;
    expect(happy.clones.length).toBe(1);
    const happyGroup = happy.clones[0];
    expect(happyGroup).toBeDefined();
    if (happyGroup === undefined) return;
    expect(hasRefactorDisposition(happyGroup)).toBe(true);
    if (!hasRefactorDisposition(happyGroup)) return;
    expect(happyGroup.new_shape_summary).toBeDefined();
    expect((happyGroup.new_shape_summary ?? '').length).toBeGreaterThan(0);

    // canonical_side: "new" without new_shape_summary -> must reject.
    const rejectYaml = buildRefactorBaselineYaml(
      [
        '    canonical_side: new',
        '    canonical_reason: no side is canonical — both diverge from the design',
        '    tests:',
        '      - modules/x/test/common-row.test.ts',
        '    tests_proof:',
        '      sha: 0123abc4567',
        '      demonstration: neither side currently renders the trailing-action slot',
      ].join('\n'),
    );
    expect(() => parseClonesYaml(rejectYaml)).toThrow(RefactorPreconditionError);
    try {
      parseClonesYaml(rejectYaml);
    } catch (err) {
      expect(err).toBeInstanceOf(RefactorPreconditionError);
      if (err instanceof RefactorPreconditionError) {
        expect(err.message).toContain('new_shape_summary');
      }
    }
  });
});
