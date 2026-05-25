/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/dispatch-wrapper.test.ts
 *
 * Adversarial validator harness for the scope-discovery dispatch wrapper
 * (Phase 5 Task 5). Proves the wrapper actually rejects sub-agent
 * returns that violate the grammar + agent-discipline.md forbidden-
 * deferral rules, and accepts well-formed returns — including the
 * tricky edge cases (multi-line Included, prelude-quoted grammar,
 * narrowed "later"/"until" regexes).
 *
 * Scenario fixtures live in `dispatch-wrapper.fixtures.ts`. The harness
 * itself runs:
 *
 *   - Each ACCEPTANCE_SCENARIO and REJECTION_SCENARIO through the real
 *     `wrap()` function via vitest `it()` blocks. Failures surface
 *     with the scenario name in the test output.
 *   - A two-level gutted-stub self-check that proves BOTH the parser
 *     and the validator are load-bearing:
 *       Level 1 — fully-gutted wrap: every rejection scenario MUST
 *         fail its assertion (else the harness has no teeth).
 *       Level 2 — parser-only wrap: scenarios trip dynamically; the
 *         partition into parser-caught + validator-caught is checked
 *         and both classes must be non-empty.
 *   - Targeted tests for the refactor-marker auto-prelude (one per
 *     default marker regex) and the project-override loaders (forbidden
 *     phrases YAML; refactor markers YAML).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DispatchRejected,
  parseReturn,
  type DispatchFn,
  type ParsedDispatchReturn,
  type WrapOptions,
  REFACTOR_CONTEXT_MARKERS,
  wrap,
} from '../../scope-discovery/dispatch-wrapper.js';
import {
  ACCEPTANCE_SCENARIOS,
  REJECTION_SCENARIOS,
  type Scenario,
} from './dispatch-wrapper.fixtures.js';

// ---------------------------------------------------------------------------
// Wrap-function indirection — lets the gutted self-check substitute a
// stubbed wrap() into the rejection-asserting helper.
// ---------------------------------------------------------------------------

type WrapFn = (
  agentType: string,
  taskPrompt: string,
  options: WrapOptions,
) => Promise<ParsedDispatchReturn>;

/** Build a DispatchFn that always returns `text`, ignoring the prompt. */
function cannedDispatch(text: string): DispatchFn {
  return async () => text;
}

/**
 * A fully-gutted wrap() substitute: ignores the dispatched response
 * entirely and always returns a fixed ParsedDispatchReturn. Simulates
 * the failure mode where someone has commented out BOTH parseReturn and
 * validateParsed and the gate silently accepts every sub-agent dispatch.
 */
const guttedWrap: WrapFn = async () => ({
  searched: { pattern: 'gutted', count: 0 },
  included: [],
  excluded: [],
  rawText: '',
});

/**
 * A partially-gutted wrap() substitute: runs parseReturn (so malformed
 * grammar still throws) but skips validateParsed. Simulates the failure
 * mode where the parser is intact but the semantic validator (skipped-
 * audit + forbidden-phrase rules) has been commented out.
 */
const parserOnlyWrap: WrapFn = async (_agentType, _taskPrompt, options) => {
  const responseText = await options.dispatchFn({
    agentType: 'test-agent',
    prompt: 'test prompt',
  });
  return parseReturn(responseText);
};

// ---------------------------------------------------------------------------
// Scenario assertion helper
// ---------------------------------------------------------------------------

type RunOutcome =
  | { readonly kind: 'accepted'; readonly parsed: ParsedDispatchReturn }
  | { readonly kind: 'rejected'; readonly error: DispatchRejected }
  | { readonly kind: 'crashed'; readonly error: unknown };

async function runWrap(
  wrapFn: WrapFn,
  response: string,
  options?: Partial<WrapOptions>,
): Promise<RunOutcome> {
  try {
    const parsed = await wrapFn('test-agent', 'test prompt', {
      dispatchFn: cannedDispatch(response),
      ...options,
    });
    return { kind: 'accepted', parsed };
  } catch (err) {
    if (err instanceof DispatchRejected) {
      return { kind: 'rejected', error: err };
    }
    return { kind: 'crashed', error: err };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface ScenarioOutcomeAssertion {
  readonly kind: 'pass' | 'fail';
  readonly detail: string;
}

/**
 * Compute the pass/fail outcome of running `wrapFn` against the
 * scenario, without itself calling `expect()` — that way the gutted-
 * stub self-check can compose this helper without polluting the test
 * report with failing expectations.
 */
async function evaluateScenario(
  scenario: Scenario,
  wrapFn: WrapFn,
): Promise<ScenarioOutcomeAssertion> {
  const outcome = await runWrap(wrapFn, scenario.response);
  if (outcome.kind === 'crashed') {
    return {
      kind: 'fail',
      detail: `wrapper crashed with non-DispatchRejected error: ${errorMessage(outcome.error)}`,
    };
  }
  if (scenario.expect.kind === 'accept') {
    if (outcome.kind !== 'accepted') {
      return {
        kind: 'fail',
        detail: `expected accept but rejected: ${outcome.error.message}`,
      };
    }
    const checkErr = scenario.expect.check?.(outcome.parsed) ?? null;
    if (checkErr !== null) {
      return {
        kind: 'fail',
        detail: `accepted but post-check failed: ${checkErr}`,
      };
    }
    return { kind: 'pass', detail: 'accepted as expected' };
  }
  if (outcome.kind !== 'rejected') {
    return {
      kind: 'fail',
      detail: 'expected reject but wrapper accepted the return',
    };
  }
  const sub = scenario.expect.messageSubstring;
  if (sub !== undefined && !outcome.error.message.includes(sub)) {
    return {
      kind: 'fail',
      detail: `rejected but message lacks "${sub}". Got: ${outcome.error.message}`,
    };
  }
  const expectedBlocks = scenario.expect.missingBlocks;
  if (expectedBlocks !== undefined) {
    const got = [...outcome.error.missingBlocks].sort().join(',');
    const want = [...expectedBlocks].sort().join(',');
    if (got !== want) {
      return {
        kind: 'fail',
        detail: `missingBlocks mismatch — want [${want}], got [${got}]`,
      };
    }
  }
  return {
    kind: 'pass',
    detail: `rejected as expected (${outcome.error.message.slice(0, 80)}...)`,
  };
}

// ---------------------------------------------------------------------------
// Scenario tables: one vitest `it()` per scenario
// ---------------------------------------------------------------------------

describe('dispatch-wrapper — acceptance scenarios', () => {
  it.each(ACCEPTANCE_SCENARIOS.map((s) => [s.name, s] as const))(
    '%s',
    async (_name, scenario) => {
      const result = await evaluateScenario(scenario, wrap);
      if (result.kind !== 'pass') {
        throw new Error(`scenario "${scenario.name}" failed: ${result.detail}`);
      }
    },
  );
});

describe('dispatch-wrapper — rejection scenarios', () => {
  it.each(REJECTION_SCENARIOS.map((s) => [s.name, s] as const))(
    '%s',
    async (_name, scenario) => {
      const result = await evaluateScenario(scenario, wrap);
      if (result.kind !== 'pass') {
        throw new Error(`scenario "${scenario.name}" failed: ${result.detail}`);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Two-level gutted-logic self-check — proves teeth
// ---------------------------------------------------------------------------

describe('dispatch-wrapper — gutted-stub self-check (two-level teeth)', () => {
  it('Level 1: fully-gutted wrap accepts every rejection scenario (no teeth without parser+validator)', async () => {
    const passesAgainstGutted: string[] = [];
    for (const scenario of REJECTION_SCENARIOS) {
      const result = await evaluateScenario(scenario, guttedWrap);
      if (result.kind === 'pass') {
        // The scenario's REJECTION assertion passed against a wrap()
        // that accepts everything — that's a contradiction (the gutted
        // wrap returns a fake ParsedDispatchReturn for every input, so
        // a reject-expecting assertion should FAIL).
        passesAgainstGutted.push(scenario.name);
      }
    }
    expect(passesAgainstGutted).toEqual([]);
  });

  it('Level 2: REJECTION_SCENARIOS partitions non-trivially into parser-caught + validator-caught', async () => {
    const parserCaught: string[] = [];
    const validatorCaught: string[] = [];
    for (const scenario of REJECTION_SCENARIOS) {
      try {
        parseReturn(scenario.response);
        validatorCaught.push(scenario.name);
      } catch (err) {
        if (err instanceof DispatchRejected) {
          parserCaught.push(scenario.name);
        } else {
          throw new Error(
            `parseReturn threw non-DispatchRejected for "${scenario.name}": ${errorMessage(err)}`,
          );
        }
      }
    }
    // Both classes must be non-empty — otherwise one of the two layers
    // is not exercised and the harness has a blind spot.
    expect(parserCaught.length).toBeGreaterThan(0);
    expect(validatorCaught.length).toBeGreaterThan(0);
  });

  it('Level 2 (a): parser-only wrap still rejects parser-caught scenarios (parser doing its job)', async () => {
    const failures: string[] = [];
    for (const scenario of REJECTION_SCENARIOS) {
      let parserRejects = false;
      try {
        parseReturn(scenario.response);
      } catch (err) {
        if (err instanceof DispatchRejected) parserRejects = true;
      }
      if (!parserRejects) continue; // not a parser-caught scenario
      const result = await evaluateScenario(scenario, parserOnlyWrap);
      if (result.kind !== 'pass') {
        failures.push(`${scenario.name}: ${result.detail}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('Level 2 (b): parser-only wrap silently accepts validator-caught scenarios (proves validator is load-bearing)', async () => {
    // Each validator-caught scenario expects rejection. Under parser-
    // only wrap, parseReturn succeeds and validateParsed is skipped —
    // so the wrapper accepts and the reject-expecting assertion FAILS.
    // We invert that: assert that EVERY validator-caught scenario's
    // assertion fails under parserOnlyWrap.
    const unexpectedPasses: string[] = [];
    for (const scenario of REJECTION_SCENARIOS) {
      let parserRejects = false;
      try {
        parseReturn(scenario.response);
      } catch (err) {
        if (err instanceof DispatchRejected) parserRejects = true;
      }
      if (parserRejects) continue; // not a validator-caught scenario
      const result = await evaluateScenario(scenario, parserOnlyWrap);
      if (result.kind === 'pass') {
        // The reject assertion "passed" against a no-validator wrap —
        // means the validator isn't doing the work the assertion thinks
        // it is. Surface this scenario as a teeth-loss.
        unexpectedPasses.push(scenario.name);
      }
    }
    expect(unexpectedPasses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Refactor-marker auto-prelude — one scenario per default marker
// ---------------------------------------------------------------------------

interface RecordingDispatch {
  readonly fn: DispatchFn;
  readonly captured: { value: string };
}

function makeRecordingDispatch(response: string): RecordingDispatch {
  const captured = { value: '' };
  const fn: DispatchFn = async ({ prompt }) => {
    captured.value = prompt;
    return response;
  };
  return { fn, captured };
}

const WELL_FORMED_RESPONSE = [
  'Did the work.',
  '',
  'Searched: foo — 1 matches',
  'Included: src/a.tsx:1',
  'Excluded: src/b.tsx:2 — different primitive',
].join('\n');

describe('dispatch-wrapper — refactor-marker auto-prelude', () => {
  it('non-refactor prompt does NOT receive the refactor prelude', async () => {
    const recorder = makeRecordingDispatch(WELL_FORMED_RESPONSE);
    await wrap('code-reviewer', 'Review this PR for general quality.', {
      dispatchFn: recorder.fn,
    });
    expect(recorder.captured.value.includes('REFACTOR-CONTEXT PRECONDITIONS')).toBe(false);
  });

  // One it() per default marker regex.
  it.each(REFACTOR_CONTEXT_MARKERS.map((re): readonly [string, RegExp] => [
    re.source,
    re,
  ]))(
    'refactor prompt matching /%s/ receives the refactor prelude',
    async (_src, marker) => {
      // Build a prompt that contains a string the regex will match.
      // Pick a deterministic phrase per marker.
      const samplePerMarker: Record<string, string> = {
        '\\brefactor\\b': 'Please refactor the duplicated logic.',
        '\\bextract(?:ion|ing)?\\b':
          'Carry out the extraction on the cloned helper.',
        '\\bclones?\\.yaml\\b':
          'Closes clones.yaml entry abc123.',
        '\\bcanonical_side\\b':
          'The clone-group entry sets canonical_side to "all".',
        '\\btests_proof\\b':
          'tests_proof.sha points to the demonstrated regression.',
      };
      const sample = samplePerMarker[marker.source];
      if (sample === undefined) {
        throw new Error(
          `no sample prompt for marker /${marker.source}/ — extend samplePerMarker`,
        );
      }
      // Sanity: the sample DOES match the marker.
      if (!marker.test(sample)) {
        throw new Error(
          `sample "${sample}" does not match marker /${marker.source}/`,
        );
      }
      const recorder = makeRecordingDispatch(WELL_FORMED_RESPONSE);
      await wrap('typescript-pro', sample, { dispatchFn: recorder.fn });
      expect(recorder.captured.value.includes('REFACTOR-CONTEXT PRECONDITIONS')).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// Project-override loaders — YAML on disk
// ---------------------------------------------------------------------------

describe('dispatch-wrapper — project overrides honored', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'dispatch-wrapper-overrides-'));
  });

  afterAll(async () => {
    if (tmpRoot !== undefined) {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('forbidden-deferral-phrases.yaml REPLACES built-in list (built-in phrase no longer rejects)', async () => {
    const projectDir = join(tmpRoot, 'forbidden-replace');
    await mkdir(join(projectDir, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    // Override list contains ONLY "absolutely-not" — built-in "for now"
    // is no longer in the active list.
    await writeFile(
      join(projectDir, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'phrases:\n  - absolutely-not\n',
      'utf8',
    );
    const response = [
      'Searched: foo — 3 matches',
      'Included: src/a.tsx:1, src/b.tsx:2',
      'Excluded: src/c.tsx:3 — different primitive (for now this is intentional)',
      '',
    ].join('\n');
    const outcome = await runWrap(wrap, response, { repoRoot: projectDir });
    // Under built-in rules "for now" would reject; under override it accepts.
    expect(outcome.kind).toBe('accepted');
  });

  it('forbidden-deferral-phrases.yaml override REJECTS its own phrase', async () => {
    const projectDir = join(tmpRoot, 'forbidden-custom-rejects');
    await mkdir(join(projectDir, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    await writeFile(
      join(projectDir, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'phrases:\n  - "absolutely-not"\n',
      'utf8',
    );
    const response = [
      'Searched: foo — 3 matches',
      'Included: src/a.tsx:1, src/b.tsx:2',
      'Excluded: src/c.tsx:3 — absolutely-not in scope',
      '',
    ].join('\n');
    const outcome = await runWrap(wrap, response, { repoRoot: projectDir });
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') {
      expect(outcome.error.message).toContain('absolutely-not');
    }
  });

  it('refactor-markers.yaml REPLACES built-in markers (built-in marker no longer triggers prelude)', async () => {
    const projectDir = join(tmpRoot, 'refactor-replace');
    await mkdir(join(projectDir, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    // Override marker list does NOT contain "refactor" — only a custom
    // marker. So a prompt with "refactor" should NOT receive the
    // prelude under override.
    await writeFile(
      join(projectDir, '.dw-lifecycle', 'scope-discovery', 'refactor-markers.yaml'),
      'markers:\n  - "custom-marker-xyz"\n',
      'utf8',
    );
    const recorder = makeRecordingDispatch(WELL_FORMED_RESPONSE);
    await wrap('typescript-pro', 'Please refactor the duplicated logic.', {
      dispatchFn: recorder.fn,
      repoRoot: projectDir,
    });
    expect(recorder.captured.value.includes('REFACTOR-CONTEXT PRECONDITIONS')).toBe(false);
  });

  it('refactor-markers.yaml override TRIGGERS prelude on its own marker', async () => {
    const projectDir = join(tmpRoot, 'refactor-custom-triggers');
    await mkdir(join(projectDir, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    await writeFile(
      join(projectDir, '.dw-lifecycle', 'scope-discovery', 'refactor-markers.yaml'),
      'markers:\n  - "custom-marker-xyz"\n',
      'utf8',
    );
    const recorder = makeRecordingDispatch(WELL_FORMED_RESPONSE);
    await wrap('typescript-pro', 'This dispatch contains custom-marker-xyz.', {
      dispatchFn: recorder.fn,
      repoRoot: projectDir,
    });
    expect(recorder.captured.value.includes('REFACTOR-CONTEXT PRECONDITIONS')).toBe(true);
  });

  it('malformed forbidden-deferral-phrases.yaml throws on parse', async () => {
    const projectDir = join(tmpRoot, 'forbidden-malformed');
    await mkdir(join(projectDir, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    // YAML object but neither `phrases` nor `regexes` set.
    await writeFile(
      join(projectDir, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'other_field: oops\n',
      'utf8',
    );
    await expect(
      wrap('test', 'noop', {
        dispatchFn: cannedDispatch(WELL_FORMED_RESPONSE),
        repoRoot: projectDir,
      }),
    ).rejects.toThrow(/produced zero phrases/);
  });
});
