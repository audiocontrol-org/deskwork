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
