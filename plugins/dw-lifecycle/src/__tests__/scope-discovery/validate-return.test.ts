/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/validate-return.test.ts
 *
 * Tests for the `dw-lifecycle validate-return` CLI bridge that exposes
 * the dispatch-wrapper's response-validation logic to the orchestrating
 * Claude session. Per the project test rule "use fixture project trees
 * on disk, never mock the filesystem", uses tmp directories for project
 * roots when exercising overrides.
 *
 * Coverage:
 *   - Happy path: all three blocks present + no forbidden phrases →
 *     valid=true.
 *   - Missing Searched / Included / Excluded blocks: valid=false with
 *     missingBlocks populated.
 *   - Forbidden-deferral phrase ("for now", "will fix"): valid=false
 *     with forbiddenPhrases array populated.
 *   - Skipped-audit shape (Searched count > 1, Included covers 1,
 *     Excluded empty): valid=false with skippedAudit populated.
 *   - Refactor-precondition cue check: response claims a refactor without
 *     citing canonical_side / tests_proof → refactorPreconditionViolations
 *     populated (only fires for refactor-eligible agent types).
 *   - Project override: custom forbidden phrase REJECTS its own phrase.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateReturnForCli } from '../../scope-discovery/dispatch-wrapper-cli.js';
import { parseFlags } from '../../subcommands/validate-return.js';

const WELL_FORMED_RESPONSE = [
  'Did the work.',
  '',
  'Searched: foo-pattern — 2 matches',
  'Included: src/a.tsx:42, src/b.tsx:117',
  'Excluded: src/legacy.tsx:88 — different primitive (CodeMirror)',
  '',
].join('\n');

describe('validate-return CLI assembler', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'validate-return-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('happy path: well-formed response is valid', async () => {
    const result = await validateReturnForCli({
      response: WELL_FORMED_RESPONSE,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(true);
    expect(result.parseError).toBeNull();
    expect(result.forbiddenPhrases).toEqual([]);
    expect(result.skippedAudit).toBeNull();
    expect(result.foundBlocks.searched).toBe(true);
    expect(result.foundBlocks.included).toBe(true);
    expect(result.foundBlocks.excluded).toBe(true);
    expect(result.missingBlocks).toEqual([]);
    expect(result.refactorPreconditionViolations).toEqual([]);
    expect(result.summary).toContain('valid');
  });

  it('missing Searched block surfaces missingBlocks', async () => {
    const response = [
      'Did the work.',
      '',
      'Included: src/a.tsx:42',
      'Excluded: src/legacy.tsx:88 — different primitive',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.foundBlocks.searched).toBe(false);
    expect(result.missingBlocks).toContain('Searched');
    expect(result.parseError).not.toBeNull();
  });

  it('missing Included block surfaces missingBlocks', async () => {
    const response = [
      'Searched: foo — 1 matches',
      'Excluded: src/legacy.tsx:88 — different primitive',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.foundBlocks.included).toBe(false);
    expect(result.missingBlocks).toContain('Included');
  });

  it('missing Excluded block surfaces missingBlocks', async () => {
    const response = [
      'Searched: foo — 1 matches',
      'Included: src/a.tsx:42',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.foundBlocks.excluded).toBe(false);
    expect(result.missingBlocks).toContain('Excluded');
  });

  it('forbidden-deferral phrase "for now" surfaces in forbiddenPhrases', async () => {
    const response = [
      'Searched: foo — 3 matches',
      'Included: src/a.tsx:1, src/b.tsx:2',
      'Excluded: src/c.tsx:3 — for now this is intentional',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.forbiddenPhrases.length).toBe(1);
    const hit = result.forbiddenPhrases[0];
    if (hit === undefined) throw new Error('expected a hit');
    expect(hit.phrase).toBe('for now');
    expect(hit.file).toBe('src/c.tsx');
    expect(hit.line).toBe(3);
    expect(result.summary).toContain('REJECTED');
  });

  it('skipped-audit shape (multi-match + 1 included + 0 excluded) surfaces skippedAudit', async () => {
    const response = [
      'Searched: foo-pattern — 5 matches',
      'Included: src/a.tsx:1',
      'Excluded:',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.skippedAudit).not.toBeNull();
    expect(result.skippedAudit).toContain('5 matches');
  });

  it('refactor-precondition violation: response claims refactor but cites neither canonical_side nor tests_proof', async () => {
    const response = [
      'I performed the refactor by extracting the shared helper to src/util.ts.',
      'I did not run the cite-the-disposition checks because the change felt obvious.',
      '',
      'Searched: shared-helper-pattern — 1 matches',
      'Included: src/util.ts:1',
      'Excluded: src/old.ts:5 — replaced by the new helper',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.refactorPreconditionViolations.length).toBe(2);
    expect(
      result.refactorPreconditionViolations.some((v) => v.includes('canonical_side')),
    ).toBe(true);
    expect(
      result.refactorPreconditionViolations.some((v) => v.includes('tests_proof')),
    ).toBe(true);
  });

  it('refactor-precondition cue check does NOT fire for non-refactor-eligible agent types', async () => {
    // Same response as above, but agent-type is reviewer (read-only,
    // not in the refactor-eligible set). The cue check is skipped.
    const response = [
      'I performed the refactor by extracting the shared helper to src/util.ts.',
      '',
      'Searched: shared-helper-pattern — 1 matches',
      'Included: src/util.ts:1',
      'Excluded: src/old.ts:5 — replaced by the new helper',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'reviewer',
      repoRoot: tmp,
    });
    expect(result.refactorPreconditionViolations).toEqual([]);
  });

  it('refactor-precondition cue check does NOT fire when response makes no refactor claim', async () => {
    const result = await validateReturnForCli({
      response: WELL_FORMED_RESPONSE,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.refactorPreconditionViolations).toEqual([]);
  });

  it('refactor response that cites canonical_side AND tests_proof passes the cue check', async () => {
    const response = [
      'I performed the refactor by extracting the shared helper to src/util.ts.',
      'Per the clones.yaml entry with canonical_side: "all", I verified the',
      'extracted code is a faithful lift; tests_proof.sha was resolved via',
      'git rev-parse and the diff confirms a deliberate canonical-side mutation.',
      '',
      'Searched: shared-helper-pattern — 1 matches',
      'Included: src/util.ts:1',
      'Excluded: src/old.ts:5 — replaced by the new helper',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.refactorPreconditionViolations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('project override REJECTS its own phrase', async () => {
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await writeFile(
      join(tmp, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'phrases:\n  - "absolutely-not"\n',
      'utf8',
    );
    const response = [
      'Searched: foo — 3 matches',
      'Included: src/a.tsx:1, src/b.tsx:2',
      'Excluded: src/c.tsx:3 — absolutely-not in scope',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    expect(result.valid).toBe(false);
    expect(result.forbiddenPhrases.length).toBe(1);
    const hit = result.forbiddenPhrases[0];
    if (hit === undefined) throw new Error('expected a hit');
    expect(hit.phrase).toBe('absolutely-not');
  });

  it('project override no longer rejects the built-in "for now" phrase', async () => {
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await writeFile(
      join(tmp, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'phrases:\n  - "absolutely-not"\n',
      'utf8',
    );
    const response = [
      'Searched: foo — 3 matches',
      'Included: src/a.tsx:1, src/b.tsx:2',
      'Excluded: src/c.tsx:3 — different primitive (for now this is intentional)',
      '',
    ].join('\n');
    const result = await validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: tmp,
    });
    // Under the built-in list "for now" would reject; under override it passes.
    expect(result.valid).toBe(true);
    expect(result.forbiddenPhrases).toEqual([]);
  });
});

describe('validate-return flag parser', () => {
  it('happy path: parses --response-file + --agent-type', () => {
    const parsed = parseFlags([
      '--response-file', '/tmp/r.md',
      '--agent-type', 'implementer',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.args?.responseFile).toBe('/tmp/r.md');
    expect(parsed.args?.agentType).toBe('implementer');
    expect(parsed.args?.jsonOnly).toBe(false);
  });

  it('--json flag is honored', () => {
    const parsed = parseFlags([
      '--response-file', '/tmp/r.md',
      '--agent-type', 'implementer',
      '--json',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.args?.jsonOnly).toBe(true);
  });

  it('missing --response-file is a usage error', () => {
    const parsed = parseFlags(['--agent-type', 'implementer']);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('--response-file');
  });

  it('missing --agent-type is a usage error', () => {
    const parsed = parseFlags(['--response-file', '/tmp/r.md']);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('--agent-type');
  });

  it('unknown agent-type is a usage error', () => {
    const parsed = parseFlags([
      '--response-file', '/tmp/r.md',
      '--agent-type', 'malarkey-pro',
    ]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('malarkey-pro');
  });

  it('unknown flag is a usage error', () => {
    const parsed = parseFlags([
      '--response-file', '/tmp/r.md',
      '--agent-type', 'implementer',
      '--bogus',
    ]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('unknown arg');
  });

  it('--help short-circuits with help=true', () => {
    const parsed = parseFlags(['--help']);
    expect(parsed.ok).toBe(true);
    expect(parsed.help).toBe(true);
  });
});

/**
 * TF-008 (canary 2026-05-28) — Searched-count noun whitelist.
 *
 * Real implementer dispatches naturally use descriptive nouns
 * ("source-emitter call sites", "occurrences", "hits") instead of
 * the literal "matches". Pre-fix parser required exactly "matches"
 * and rejected everything else. Fix: accept a whitelist of head
 * nouns + up to 3 modifier tokens preceding the head.
 */
describe('validate-return — TF-008 Searched-count noun whitelist', () => {
  function responseWithCount(searchedCountPhrase: string): string {
    return [
      'Did the work.',
      '',
      `Searched: foo-pattern — ${searchedCountPhrase}`,
      'Included: src/a.tsx:42',
      'Excluded: src/legacy.tsx:88 — different primitive (CodeMirror)',
      '',
    ].join('\n');
  }

  async function validate(response: string) {
    return validateReturnForCli({
      response,
      agentType: 'implementer',
      repoRoot: '/nonexistent',
    });
  }

  it('accepts the original literal "matches"', async () => {
    const r = await validate(responseWithCount('2 matches'));
    expect(r.valid).toBe(true);
  });

  it('accepts the canary failing case: "2 source-emitter call sites (...)"', async () => {
    const r = await validate(
      responseWithCount('2 source-emitter call sites (`swimlane-card.ts`)'),
    );
    expect(r.valid).toBe(true);
  });

  it('accepts synonym nouns: hits, occurrences, instances, sites, files, results, references', async () => {
    for (const phrase of [
      '3 hits',
      '5 occurrences',
      '7 instances',
      '4 sites',
      '2 files',
      '6 results',
      '1 reference',
    ]) {
      const r = await validate(responseWithCount(phrase));
      expect(r.valid, `expected accept for: ${phrase}; parseError=${r.parseError}`).toBe(true);
    }
  });

  it('accepts up to 3 modifier tokens before head noun', async () => {
    for (const phrase of [
      '3 unique occurrences',
      '2 cross-cutting call sites',
      '5 distinct source-emitter call sites',
    ]) {
      const r = await validate(responseWithCount(phrase));
      expect(r.valid, `expected accept for: ${phrase}; parseError=${r.parseError}`).toBe(true);
    }
  });

  it('rejects nouns outside the whitelist (places, spots, things)', async () => {
    // Phase 14 Task 2 (AUDIT-20260529-13) — `5 issues found` was
    // previously in this rejection list; the whitelist now includes
    // `issues`/`bugs`/`findings`/`errors`/`warnings`, so it accepts.
    // `places`/`spots`/`things` are still out-of-whitelist sentinels.
    for (const phrase of [
      '7 places',
      '4 spots',
      '3 things',
    ]) {
      const r = await validate(responseWithCount(phrase));
      expect(r.valid, `expected reject for: ${phrase}`).toBe(false);
      expect(r.parseError).toContain('Malformed Searched: count');
    }
  });

  it('rejection message names the whitelist so the agent can self-correct', async () => {
    const r = await validate(responseWithCount('5 widgets'));
    expect(r.valid).toBe(false);
    expect(r.parseError).toContain('matches/match/hits');
    expect(r.parseError).toContain('call sites');
    // Phase 14 Task 2 — added nouns are named in the error.
    expect(r.parseError).toContain('issues');
  });
});

/**
 * TF-008 + TF-009 (canary 2026-05-28) — GRAMMAR_INSTRUCTION prelude
 * documents the three known agent-natural-writing gotchas: noun
 * whitelist, :LINE-with-:1-sentinel, project-vocabulary collisions.
 *
 * Documentation-only assertions; the actual workaround is for the
 * agent to read these before writing the grammar block.
 */
describe('GRAMMAR_INSTRUCTION prelude — TF-008 + TF-009 documentation', () => {
  it('documents the Searched-count noun whitelist (TF-008)', async () => {
    const { GRAMMAR_INSTRUCTION } = await import(
      '../../scope-discovery/dispatch-wrapper.js'
    );
    expect(GRAMMAR_INSTRUCTION).toContain('Searched-count noun whitelist');
    expect(GRAMMAR_INSTRUCTION).toContain('`matches`');
    expect(GRAMMAR_INSTRUCTION).toContain('`call sites`');
    expect(GRAMMAR_INSTRUCTION).toContain('modifier tokens');
  });

  it('documents the :LINE :1 sentinel for whole-file Excluded entries (TF-008 addendum)', async () => {
    const { GRAMMAR_INSTRUCTION } = await import(
      '../../scope-discovery/dispatch-wrapper.js'
    );
    expect(GRAMMAR_INSTRUCTION).toContain('Excluded entries require');
    expect(GRAMMAR_INSTRUCTION).toContain(':1');
    expect(GRAMMAR_INSTRUCTION).toContain('whole-file');
  });

  it('documents the project-vocabulary collision workaround (TF-009)', async () => {
    const { GRAMMAR_INSTRUCTION } = await import(
      '../../scope-discovery/dispatch-wrapper.js'
    );
    expect(GRAMMAR_INSTRUCTION).toContain('Forbidden-deferral phrase list');
    expect(GRAMMAR_INSTRUCTION).toContain('project');
    expect(GRAMMAR_INSTRUCTION.toLowerCase()).toContain('swim-stub');
    expect(GRAMMAR_INSTRUCTION).toContain('PURPOSE');
  });
});
