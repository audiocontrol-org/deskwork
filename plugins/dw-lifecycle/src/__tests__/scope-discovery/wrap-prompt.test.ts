/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/wrap-prompt.test.ts
 *
 * Tests for the `dw-lifecycle wrap-prompt` CLI bridge that exposes the
 * dispatch-wrapper's prompt-augmentation logic to the orchestrating
 * Claude session. Per the project test rule "use fixture project trees
 * on disk, never mock the filesystem", uses tmp directories for project
 * roots + prompt files.
 *
 * Coverage:
 *   - Happy path: augmented prompt contains the grammar instruction.
 *   - Refactor marker detection: prompt with `refactor` carries the
 *     REFACTOR-CONTEXT prelude; non-refactor prompts do not.
 *   - Project override: forbidden-deferral-phrases.yaml on disk REPLACES
 *     the default phrase list in the augmented prompt.
 *   - Flag parsing: missing flags / unknown args / unknown agent-type
 *     produce usage errors (parseFlags result, not exit).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wrapPromptForCli } from '../../scope-discovery/dispatch-wrapper-cli.js';
import { parseFlags } from '../../subcommands/wrap-prompt.js';

describe('wrap-prompt CLI assembler', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'wrap-prompt-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('happy path: emits augmented prompt with grammar instruction appended', async () => {
    const result = await wrapPromptForCli({
      agentType: 'implementer',
      taskPrompt: 'Build the foo widget.',
      repoRoot: tmp,
    });
    expect(result.augmentedPrompt).toContain('Build the foo widget.');
    expect(result.augmentedPrompt).toContain('REQUIRED RETURN GRAMMAR');
    expect(result.augmentedPrompt).toContain('Searched: <pattern>');
    expect(result.augmentedPrompt).toContain('Included: <file:line>');
    expect(result.augmentedPrompt).toContain('Excluded: <file:line>');
    expect(result.refactorMarkerMatched).toBe(false);
    expect(result.projectOverrideForbiddenLoaded).toBe(false);
    expect(result.projectOverrideMarkersLoaded).toBe(false);
    expect(result.summary).toContain('agent-type=implementer');
    expect(result.summary).toContain('refactor-marker: no');
    expect(result.summary).toContain('project override: no');
  });

  it('refactor marker triggers REFACTOR-CONTEXT prelude', async () => {
    const result = await wrapPromptForCli({
      agentType: 'typescript-pro',
      taskPrompt: 'Please refactor the duplicated helper in src/util.ts.',
      repoRoot: tmp,
    });
    expect(result.augmentedPrompt).toContain('REFACTOR-CONTEXT PRECONDITIONS');
    expect(result.augmentedPrompt).toContain('canonical_side');
    expect(result.refactorMarkerMatched).toBe(true);
    expect(result.summary).toContain('refactor-marker: yes');
  });

  it('non-refactor prompt does NOT carry the REFACTOR-CONTEXT prelude', async () => {
    const result = await wrapPromptForCli({
      agentType: 'reviewer',
      taskPrompt: 'Review the PR diff for style + correctness.',
      repoRoot: tmp,
    });
    expect(result.augmentedPrompt).not.toContain('REFACTOR-CONTEXT PRECONDITIONS');
    expect(result.refactorMarkerMatched).toBe(false);
  });

  it('forbidden-deferral-phrases.yaml override REPLACES the built-in list in the prompt', async () => {
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await writeFile(
      join(tmp, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'phrases:\n  - "absolutely-not"\n',
      'utf8',
    );
    const result = await wrapPromptForCli({
      agentType: 'implementer',
      taskPrompt: 'Carry out the fix.',
      repoRoot: tmp,
    });
    // The override's only phrase appears in the prompt; built-in "for now"
    // is gone from the active list.
    expect(result.augmentedPrompt).toContain('absolutely-not');
    expect(result.projectOverrideForbiddenLoaded).toBe(true);
    expect(result.summary).toContain('project override: yes');
  });

  it('refactor-markers.yaml override REPLACES built-in markers', async () => {
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await writeFile(
      join(tmp, '.dw-lifecycle', 'scope-discovery', 'refactor-markers.yaml'),
      'markers:\n  - "custom-marker-xyz"\n',
      'utf8',
    );
    // A prompt with "refactor" should NOT receive the prelude under override.
    const noPrelude = await wrapPromptForCli({
      agentType: 'typescript-pro',
      taskPrompt: 'Please refactor the duplicated helper.',
      repoRoot: tmp,
    });
    expect(noPrelude.refactorMarkerMatched).toBe(false);
    expect(noPrelude.augmentedPrompt).not.toContain('REFACTOR-CONTEXT PRECONDITIONS');

    // A prompt with the custom marker SHOULD receive the prelude.
    const withPrelude = await wrapPromptForCli({
      agentType: 'typescript-pro',
      taskPrompt: 'This dispatch contains custom-marker-xyz.',
      repoRoot: tmp,
    });
    expect(withPrelude.refactorMarkerMatched).toBe(true);
    expect(withPrelude.augmentedPrompt).toContain('REFACTOR-CONTEXT PRECONDITIONS');
    expect(withPrelude.projectOverrideMarkersLoaded).toBe(true);
  });

  it('malformed forbidden override surfaces a clear error', async () => {
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
    await writeFile(
      join(tmp, '.dw-lifecycle', 'scope-discovery', 'forbidden-deferral-phrases.yaml'),
      'other_field: oops\n',
      'utf8',
    );
    await expect(
      wrapPromptForCli({
        agentType: 'implementer',
        taskPrompt: 'noop',
        repoRoot: tmp,
      }),
    ).rejects.toThrow(/produced zero phrases/);
  });
});

describe('wrap-prompt flag parser', () => {
  it('happy path: parses --agent-type + --prompt-file', () => {
    const parsed = parseFlags([
      '--agent-type', 'implementer',
      '--prompt-file', '/tmp/p.md',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.args?.agentType).toBe('implementer');
    expect(parsed.args?.promptFile).toBe('/tmp/p.md');
    expect(parsed.args?.quiet).toBe(false);
  });

  it('missing --agent-type is a usage error', () => {
    const parsed = parseFlags(['--prompt-file', '/tmp/p.md']);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('--agent-type');
  });

  it('missing --prompt-file is a usage error', () => {
    const parsed = parseFlags(['--agent-type', 'implementer']);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('--prompt-file');
  });

  it('unknown agent-type is a usage error', () => {
    const parsed = parseFlags([
      '--agent-type', 'malarkey-pro',
      '--prompt-file', '/tmp/p.md',
    ]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('malarkey-pro');
    expect(parsed.error).toContain('recognized agent type');
  });

  it('unknown flag is a usage error', () => {
    const parsed = parseFlags([
      '--agent-type', 'implementer',
      '--prompt-file', '/tmp/p.md',
      '--bogus',
    ]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('unknown arg');
  });

  it('--quiet flag is honored', () => {
    const parsed = parseFlags([
      '--agent-type', 'implementer',
      '--prompt-file', '/tmp/p.md',
      '--quiet',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.args?.quiet).toBe(true);
  });

  it('--help short-circuits with help=true', () => {
    const parsed = parseFlags(['--help']);
    expect(parsed.ok).toBe(true);
    expect(parsed.help).toBe(true);
  });
});
