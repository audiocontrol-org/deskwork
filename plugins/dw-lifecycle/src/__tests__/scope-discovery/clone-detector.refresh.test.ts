/**
 * Adversarial scenario: dispositioned entries stay out of NEW on
 * subsequent runs, regardless of which non-pending disposition the
 * operator chose.
 *
 * Ported from the audiocontrol pilot's `clone-detector.validate.ts`
 * (scenarioIgnoreWithJustification). Captures a baseline at the
 * default `pending` disposition, then hand-edits the baseline's
 * disposition to `ignore-with-justification` (matching the
 * discriminated-union shape from `clones-yaml.ts`), and re-runs.
 * The detector keys NEW/DROPPED by group id — changing the
 * disposition does NOT cause the previously-baselined group to
 * resurface as NEW. This is the "honor the ignore" semantic for
 * the gate.
 */

import { describe, it, expect } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import {
  type CloneGroup,
  type ClonesYaml,
  parseClonesYaml,
  serializeClonesYaml,
} from '../../scope-discovery/clones-yaml.js';
import { makeFixture, detectorArgs, runDetector } from './util/detector-harness.js';

const CLONE_BODY_A = `export function fixtureCalc(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

describe('clone-detector — dispositioned entries honored across runs', () => {
  it('keeps an ignore-with-justification entry out of the NEW set on subsequent runs', async () => {
    const fixture = await makeFixture('ignore');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY_A);
      await fixture.writeFile('b.ts', CLONE_BODY_A);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      const baselineText = await readFile(fixture.baseline, 'utf8');
      const parsed = parseClonesYaml(baselineText);
      expect(parsed, `expected baseline parse to succeed; raw:\n${baselineText}`).not.toBeNull();
      if (parsed === null) return; // narrows for TS; the expect above already failed
      expect(
        parsed.clones.length,
        `expected at least one baseline entry; raw:\n${baselineText}`,
      ).toBeGreaterThan(0);

      // Rebuild each entry explicitly from the common fields (no spread).
      // Spreading a RefactorCloneGroup into a non-refactor disposition
      // would carry forward refactor-only fields the type system permits
      // but the discriminated-union semantics reject.
      const mutated: ClonesYaml = {
        generated_at: parsed.generated_at,
        clones: parsed.clones.map(
          (g): CloneGroup => ({
            id: g.id,
            lines: g.lines,
            members: g.members,
            disposition: 'ignore-with-justification',
            reason: 'harness: legitimate near-duplicate, not refactor candidate',
          }),
        ),
      };
      await writeFile(fixture.baseline, serializeClonesYaml(mutated), 'utf8');

      const second = await runDetector(detectorArgs(fixture));
      expect(
        second.code,
        `expected exit 0; stdout:\n${second.stdout}\nstderr:\n${second.stderr}`,
      ).toBe(0);
      expect(second.stdout).toMatch(/0 NEW/);
    } finally {
      await fixture.cleanup();
    }
  });
});
