/**
 * Adversarial scenarios for the per-NEW-group batch-dispose operator
 * hint. Ported from the audiocontrol pilot's
 * `clone-detector.batch-dispose-hint-scenarios.ts`.
 *
 * The hint is a pre-filled command line the operator can paste-and-
 * edit instead of hand-writing a YAML entry. The audiocontrol pilot
 * cited `tsx tools/scope-discovery/batch-dispose.ts ...`; this port
 * cites the forthcoming subcommand shape `dw-lifecycle batch-dispose
 * ...` — the subcommand itself is filed for Phase 6 of the
 * scope-discovery workplan (see TODO in
 * `clone-detector.ts#batchDisposeHintLines` referencing GH issue
 * #284). The assertion string here is updated to match the post-port
 * output.
 *
 * Four scenarios:
 *   1. --diff mode: NEW groups cite batch-dispose with the actual id.
 *   2. Default (non-quiet) mode: same hint lands in default output.
 *   3. DROPPED-only run: no batch-dispose citation (DROPPED groups
 *      are removed via refresh-clones-baseline, not batch-dispose).
 *   4. No-changes run: no batch-dispose citation anywhere.
 */

import { describe, it, expect } from 'vitest';
import { makeFixture, detectorArgs, runDetector } from './util/detector-harness.js';

const CLONE_BODY = `export function batchhintAlpha(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

const CLONE_BODY_B = `export function batchhintBeta(a: number, b: number): number {
  const total = a + b;
  const scaled = a * b;
  const delta = a - b;
  const ratio = b === 0 ? 0 : a / b;
  return total + scaled + delta + ratio;
}
`;

const NONCLONE_BODY = `type BatchhintGreeter = { name: string };
export function batchhintGreet(g: BatchhintGreeter): string {
  const stamp = new Date().toISOString();
  const headline = \`hello, \${g.name}!\`;
  const trailer = headline.toUpperCase();
  return \`[\${stamp}] \${trailer}\`;
}
`;

// Post-port hint command — see `clone-detector.ts#batchDisposeHintLines`.
// The pilot emitted `tsx tools/scope-discovery/batch-dispose.ts`; the
// dw-lifecycle port emits `dw-lifecycle batch-dispose` as a forward-
// compatible reference to the eventual subcommand (GH issue #284, Phase
// 6 of the scope-discovery workplan).
const HINT_CITATION = 'dw-lifecycle batch-dispose';

function extractNewIds(stdout: string): readonly string[] {
  const ids: string[] = [];
  for (const line of stdout.split('\n')) {
    const m = /^\s*NEW\s+([0-9a-f]+)\s+\(\d+\s+lines\)\s*$/.exec(line);
    if (m !== null && m[1] !== undefined) ids.push(m[1]);
  }
  return ids;
}

describe('clone-detector — batch-dispose hint citation', () => {
  it('--diff mode: NEW group cites batch-dispose with the actual id', async () => {
    const fixture = await makeFixture('batchhint-diff');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY);
      await fixture.writeFile('b.ts', CLONE_BODY);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      await fixture.writeFile('c.ts', CLONE_BODY_B);
      await fixture.writeFile('d.ts', CLONE_BODY_B);
      const diffRun = await runDetector(detectorArgs(fixture, {}, ['--diff']));
      expect(
        diffRun.code,
        `expected exit 1 with NEW group; stdout:\n${diffRun.stdout}`,
      ).toBe(1);

      const newIds = extractNewIds(diffRun.stdout);
      expect(newIds.length, `no NEW group ids parsed; stdout:\n${diffRun.stdout}`).toBeGreaterThan(
        0,
      );
      expect(diffRun.stdout).toContain(HINT_CITATION);
      for (const id of newIds) {
        expect(diffRun.stdout).toContain(`--ids ${id}`);
      }
      expect(diffRun.stdout).toContain(
        '--disposition <refactor|keep-with-reason|ignore-with-justification>',
      );
      expect(diffRun.stdout).toContain('--reason "<one-line rationale>"');
    } finally {
      await fixture.cleanup();
    }
  });

  it('default mode (non-quiet): NEW group cites batch-dispose with the actual id', async () => {
    const fixture = await makeFixture('batchhint-default');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY);
      await fixture.writeFile('b.ts', CLONE_BODY);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      await fixture.writeFile('c.ts', CLONE_BODY_B);
      await fixture.writeFile('d.ts', CLONE_BODY_B);
      // Default mode = no --quiet, no --diff.
      const defaultRun = await runDetector(detectorArgs(fixture, { quiet: false }));
      expect(
        defaultRun.code,
        `expected exit 1; stdout:\n${defaultRun.stdout}`,
      ).toBe(1);

      const newIds = extractNewIds(defaultRun.stdout);
      expect(
        newIds.length,
        `no NEW group ids parsed; stdout:\n${defaultRun.stdout}`,
      ).toBeGreaterThan(0);
      for (const id of newIds) {
        expect(defaultRun.stdout).toContain(`--ids ${id}`);
      }
      expect(defaultRun.stdout).toContain(HINT_CITATION);
    } finally {
      await fixture.cleanup();
    }
  });

  it('DROPPED-only run does NOT cite batch-dispose (default + --diff modes)', async () => {
    const fixture = await makeFixture('batchhint-dropped');
    try {
      await fixture.writeFile('a.ts', CLONE_BODY);
      await fixture.writeFile('b.ts', CLONE_BODY);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      // Drop one clone member -> group becomes DROPPED with 0 NEW.
      await fixture.removeFile('b.ts');
      const droppedRun = await runDetector(detectorArgs(fixture));
      expect(
        droppedRun.code,
        `expected exit 0; stdout:\n${droppedRun.stdout}\nstderr:\n${droppedRun.stderr}`,
      ).toBe(0);
      expect(droppedRun.stdout).toContain('DROPPED');
      expect(droppedRun.stdout).not.toContain(HINT_CITATION);

      // Belt-and-suspenders: same for --diff mode.
      const diffRun = await runDetector(detectorArgs(fixture, {}, ['--diff']));
      expect(diffRun.stdout).not.toContain(HINT_CITATION);
    } finally {
      await fixture.cleanup();
    }
  });

  it('no-NEW no-DROPPED run does NOT cite batch-dispose (default + --diff modes)', async () => {
    const fixture = await makeFixture('batchhint-nochanges');
    try {
      await fixture.writeFile('lonely-a.ts', CLONE_BODY);
      await fixture.writeFile('lonely-b.ts', NONCLONE_BODY);
      const first = await runDetector(detectorArgs(fixture));
      expect(first.code, `baseline-capture stderr:\n${first.stderr}`).toBe(0);

      // Unchanged tree: 0 NEW, 0 DROPPED.
      const second = await runDetector(detectorArgs(fixture));
      expect(second.code, `expected exit 0; stdout:\n${second.stdout}`).toBe(0);
      expect(second.stdout).not.toContain(HINT_CITATION);

      // Same for --diff mode.
      const diffRun = await runDetector(detectorArgs(fixture, {}, ['--diff']));
      expect(diffRun.stdout).not.toContain(HINT_CITATION);
    } finally {
      await fixture.cleanup();
    }
  });
});
