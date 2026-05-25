/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/anti-patterns.gate-mode.test.ts
 *
 * Phase 6 acceptance criterion: `--gate-mode` flag on check-* commands
 * exits non-zero on violations. This file asserts the flag delta for
 * check-anti-patterns:
 *
 *   (a) Without --gate-mode (default informational mode): findings
 *       present → process exits 0 + the report still prints on stdout.
 *   (b) With --gate-mode: findings present → process exits 1.
 *
 * Both scenarios share a single fixture so the matched-source +
 * registry config are identical; the only variable is the flag.
 */

import { describe, it, expect } from 'vitest';
import {
  makeAntiPatternsFixture,
  runAntiPatterns,
  runAntiPatternsInformational,
} from './util/anti-patterns-harness.js';

const SINGLE_PATTERN_REGISTRY = `anti_patterns:
  - id: prompt-fallback-composer
    added_in: deadbeef
    primitive: ScrapbookComposer
    from: '@/components/ScrapbookComposer'
    shape_regex: 'window\\.prompt\\([^)]*new note'
    message: |
      Replace window.prompt() with the ScrapbookComposer overlay.
`;

const MATCH_SOURCE = [
  'export function NoteButton() {',
  '  return (',
  '    <button onClick={() => window.prompt("new note title")}>',
  '      + new note',
  '    </button>',
  '  );',
  '}',
  '',
].join('\n');

describe('check-anti-patterns — --gate-mode flag', () => {
  it('without --gate-mode: findings present, exits 0, full report on stdout', async () => {
    const fixture = await makeAntiPatternsFixture('informational');
    try {
      await fixture.writeRegistry(SINGLE_PATTERN_REGISTRY);
      await fixture.writeSource('NoteButton.tsx', MATCH_SOURCE);
      const run = await runAntiPatternsInformational(fixture);
      expect(
        run.code,
        `informational default should exit 0 on findings; stdout=${run.stdout}; stderr=${run.stderr}`,
      ).toBe(0);
      // Findings must still be REPORTED — the flag only changes the
      // exit code, not the reporting.
      expect(run.stdout).toContain('prompt-fallback-composer');
    } finally {
      await fixture.cleanup();
    }
  });

  it('with --gate-mode: findings present, exits 1, full report on stdout', async () => {
    const fixture = await makeAntiPatternsFixture('gated');
    try {
      await fixture.writeRegistry(SINGLE_PATTERN_REGISTRY);
      await fixture.writeSource('NoteButton.tsx', MATCH_SOURCE);
      // runAntiPatterns passes --gate-mode by default.
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).toContain('prompt-fallback-composer');
    } finally {
      await fixture.cleanup();
    }
  });

  it('no findings: --gate-mode does NOT change behavior (still exit 0)', async () => {
    const fixture = await makeAntiPatternsFixture('clean');
    try {
      await fixture.writeRegistry(SINGLE_PATTERN_REGISTRY);
      await fixture.writeSource(
        'CleanComponent.tsx',
        'export function CleanComponent() { return <div>hi</div>; }\n',
      );
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
