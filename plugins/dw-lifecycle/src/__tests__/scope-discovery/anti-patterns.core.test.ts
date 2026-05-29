/**
 * Core adversarial scenarios for the anti-patterns scanner (Phase 2
 * Family A). Ported from the audiocontrol pilot's
 * `anti-patterns.validate.ts` and converted to vitest. Six pilot-side
 * core scenarios + the gutted-stub self-check:
 *
 *   1. empty-registry-exit-zero
 *   2. single-pattern-match-detected
 *   3. no-match-exits-zero
 *   4. multi-pattern-fingerprint
 *   5. malformed-registry-exits-two
 *   6. (the gutted-stub self-check; teeth for scenarios 2 + 4)
 *
 * The excludes_paths and canonical_file scenarios live in sibling
 * files (`anti-patterns.excludes.test.ts`,
 * `anti-patterns.canonical-file.test.ts`) — split to keep each file
 * under the 300-500 line cap.
 *
 * Subprocess invocation goes through the plugin CLI dispatcher
 * (`cli.ts check-anti-patterns ...`) — same path adopters trigger via
 * the `dw-lifecycle check-anti-patterns` subcommand. The scanner library
 * itself is not a standalone entry point.
 *
 * Gutted-stub pattern: mirrors Phase 1's clone-detector.error.test.ts —
 * the gut is simulated INSIDE the test via an in-process stub function,
 * not by spawning a separate stub file. The probe asserts the
 * single-pattern-match contract; the stub returns the "registry empty;
 * 0 findings" shape that a no-op scanner would emit; the probe must
 * REJECT the stub. If the probe accepts, the harness has no teeth.
 */

import { describe, it, expect } from 'vitest';
import type { ScannerRun } from './util/run-scanner.js';
import {
  makeAntiPatternsFixture,
  runAntiPatterns,
  type AntiPatternsFixture,
} from './util/anti-patterns-harness.js';

const EMPTY_REGISTRY_YAML = `anti_patterns: []\n`;

const SINGLE_PATTERN_REGISTRY = `anti_patterns:
  - id: prompt-fallback-composer
    added_in: deadbeef
    primitive: ScrapbookComposer
    from: '@/components/ScrapbookComposer'
    shape_regex: 'window\\.prompt\\([^)]*new note'
    message: |
      Replace window.prompt() with the ScrapbookComposer overlay; the
      composer is the canonical new-note affordance.
`;

// Multi-pattern fingerprint. Patterns are simple enough that regex
// escaping survives the JS string → YAML → RegExp double-decoding
// without surprises. YAML single-quoted strings preserve backslashes
// literally, so '\\(' in the JS template literal lands as '\(' in
// YAML and reaches the regex as a literal-paren matcher.
const MULTI_PATTERN_REGISTRY = `anti_patterns:
  - id: slide-drawer-legacy
    added_in: cafef00d
    primitive: useExportDialogLifecycle
    from: '@/hooks/useExportDialogLifecycle'
    shape_regex:
      - 'useState\\(false\\)'
      - 'addEventListener.*keydown'
      - 'onBackdropClick'
    min_distance: 30
    message: |
      Replace the open/close/backdrop trio with useExportDialogLifecycle.
`;

const MALFORMED_REGISTRY = `anti_patterns:
  - id: missing-required-fields
    added_in: deadbeef
    primitive: SomeThing
    # missing 'from', 'shape_regex', 'message'
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

describe('anti-patterns — core scenarios', () => {
  it('empty registry exits 0 even with source files present', async () => {
    const fixture = await makeAntiPatternsFixture('empty');
    try {
      await fixture.writeRegistry(EMPTY_REGISTRY_YAML);
      await fixture.writeSource('a.ts', 'export const a = 1;\n');
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('single-pattern match reported with id + primitive + message', async () => {
    const fixture = await makeAntiPatternsFixture('match');
    try {
      await fixture.writeRegistry(SINGLE_PATTERN_REGISTRY);
      await fixture.writeSource('NoteButton.tsx', MATCH_SOURCE);
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).toContain('prompt-fallback-composer');
      expect(run.stdout).toContain('ScrapbookComposer');
    } finally {
      await fixture.cleanup();
    }
  });

  it('registry populated, no matching source → exit 0', async () => {
    const fixture = await makeAntiPatternsFixture('nomatch');
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

  it('multi-pattern fingerprint matches only when all patterns co-occur within min_distance', async () => {
    const fixture = await makeAntiPatternsFixture('multi');
    try {
      await fixture.writeRegistry(MULTI_PATTERN_REGISTRY);
      // Partial: only one of three patterns. Should NOT match.
      await fixture.writeSource(
        'partial.tsx',
        [
          'const [open, setOpen] = useState(false); // open',
          '// no keydown listener; no backdrop handler',
          '',
        ].join('\n'),
      );
      // Spaced beyond min_distance — 3 patterns, but each separated by
      // 100 empty lines. Should NOT match.
      const filler = Array.from({ length: 100 }, () => '// filler').join('\n');
      await fixture.writeSource(
        'far-apart.tsx',
        [
          `const [open, setOpen] = useState(false); // open`,
          filler,
          `document.addEventListener('keydown', handleEsc);`,
          filler,
          `<div onBackdropClick={close} />`,
          '',
        ].join('\n'),
      );
      // Full match within min_distance. Should match.
      await fixture.writeSource(
        'full-match.tsx',
        [
          `const [open, setOpen] = useState(false); // open`,
          `useEffect(() => {`,
          `  document.addEventListener('keydown', handleEsc);`,
          `  return () => document.removeEventListener('keydown', handleEsc);`,
          `}, []);`,
          `return <Backdrop onBackdropClick={() => setOpen(false)} />;`,
          '',
        ].join('\n'),
      );
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stdout=${run.stdout}`).toBe(1);
      expect(run.stdout).toContain('full-match.tsx');
      expect(run.stdout).not.toContain('partial.tsx');
      expect(run.stdout).not.toContain('far-apart.tsx');
    } finally {
      await fixture.cleanup();
    }
  });

  it('malformed registry → exit 2 with descriptive error', async () => {
    const fixture = await makeAntiPatternsFixture('malformed');
    try {
      await fixture.writeRegistry(MALFORMED_REGISTRY);
      await fixture.writeSource('a.ts', 'export {};\n');
      const run = await runAntiPatterns(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(2);
      expect(run.stderr).toContain('from');
    } finally {
      await fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Gutted-stub self-check — the test that gives the harness teeth.
// ---------------------------------------------------------------------------

type RunScannerFn = (fixture: AntiPatternsFixture) => Promise<ScannerRun>;

/**
 * Simulate a gutted scanner: regardless of input, returns the shape a
 * no-op or accidentally-disabled scanner would emit — `entriesScanned: 0`
 * → `"registry empty; nothing to scan."` at exit 0. This is the exact
 * silent-pass failure mode the gutted-stub test must reject.
 */
function stubGuttedScanner(): RunScannerFn {
  return async () => ({
    code: 0,
    stdout: 'anti-patterns: registry empty; nothing to scan.\n',
    stderr: '',
  });
}

/**
 * Reusable single-pattern-match probe — mirrors the in-spec single-
 * pattern-match-detected scenario. Returns true iff the probe asserts
 * the real scanner's contract (exit 1, stdout names the entry id +
 * primitive). Returns false iff any assertion failed — which is what
 * we WANT against a gutted stub.
 */
async function probeSinglePatternMatch(
  label: string,
  scanner: RunScannerFn,
): Promise<boolean> {
  const fixture = await makeAntiPatternsFixture(label);
  try {
    await fixture.writeRegistry(SINGLE_PATTERN_REGISTRY);
    await fixture.writeSource('NoteButton.tsx', MATCH_SOURCE);
    const run = await scanner(fixture);
    if (run.code !== 1) return false;
    if (!run.stdout.includes('prompt-fallback-composer')) return false;
    if (!run.stdout.includes('ScrapbookComposer')) return false;
    return true;
  } finally {
    await fixture.cleanup();
  }
}

describe('anti-patterns — gutted-stub self-check', () => {
  it('gutted-stub self-check rejects no-op scanner (harness has teeth)', async () => {
    // Sanity: the probe accepts the real scanner. If this side fails,
    // the probe is broken independently of the stub's behavior.
    const realAccepted = await probeSinglePatternMatch(
      'gutted-real',
      runAntiPatterns,
    );
    expect(
      realAccepted,
      'single-pattern-match probe should accept the real scanner; if false, probe is broken',
    ).toBe(true);

    // Teeth: the probe MUST reject the gutted stub. If it would accept
    // the stub (which always returns the empty-registry shape at exit
    // 0), the harness can't distinguish a real scanner from a no-op.
    const stubAccepted = await probeSinglePatternMatch(
      'gutted-stub',
      stubGuttedScanner(),
    );
    expect(
      stubAccepted,
      'single-pattern-match probe accepted a stub that returns "registry empty" at exit 0 — harness has no teeth',
    ).toBe(false);
  });
});
