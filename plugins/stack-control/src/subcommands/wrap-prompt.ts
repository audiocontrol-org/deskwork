/**
 * plugins/stack-control/src/subcommands/wrap-prompt.ts
 *
 * CLI shim for the orchestrator-facing prompt augmentation step. The
 * orchestrating Claude session uses this verb to engage the dispatch
 * wrapper's prompt-augmentation logic (refactor-marker auto-prelude,
 * project-override loading, GRAMMAR_INSTRUCTION append) without needing
 * to supply a TypeScript `dispatchFn` to `wrap()` — see TF-005 in the
 * canary's tooling-feedback.md for the motivating friction.
 *
 * Reads the operator-authored sub-agent prompt from `--prompt-file` and
 * emits the augmented prompt (grammar instruction + optional refactor
 * prelude appended) to stdout. The orchestrator pastes stdout into the
 * Agent tool's `prompt` parameter.
 *
 * Exit codes:
 *   0 — success.
 *   1 — infra error (prompt-file unreadable, malformed override YAML).
 *   2 — usage error (missing flag, unknown arg, bad agent-type).
 */

import { readFile } from 'node:fs/promises';
import { wrapPromptForCli } from '../scope-discovery/dispatch-wrapper-cli.js';
import { errorMessage, isEnoent } from '../scope-discovery/util/typeguards.js';

const USAGE = [
  'Usage: stackctl wrap-prompt',
  '    --agent-type <type>',
  '    --prompt-file <path>',
  '    [--repo-root <path>]',
  '    [--quiet]',
  '    [--help]',
  '',
  '--agent-type <type>    The Agent-tool agent type the augmented prompt',
  '                       will dispatch to. Required. One of:',
  '                       implementer, reviewer, code-explorer,',
  '                       code-architect, ui-engineer, typescript-pro,',
  '                       documentation-engineer, project-orchestrator,',
  '                       feature-orchestrator, codebase-auditor,',
  '                       architect-reviewer, code-reviewer.',
  '                       (The augmentation profile is the same for every',
  '                       agent type today; the flag is required so the',
  '                       stderr summary names the dispatch correctly and',
  '                       future per-agent-type profiles are forward-',
  '                       compatible without a CLI breaking change.)',
  '--prompt-file <path>   Path to the operator-authored sub-agent prompt.',
  '                       Read verbatim; the augmented prompt is stdout.',
  '--repo-root <path>     Project root for resolving',
  '                       \`.stack-control/scope-discovery/*.yaml\` overrides.',
  '                       Defaults to the current working directory.',
  '--quiet                Suppress the stderr one-line summary.',
  '',
  'Outputs the augmented prompt (original prompt + grammar instruction',
  '+ optional refactor-context prelude) to stdout. The orchestrator',
  'pastes stdout into the Agent tool prompt parameter.',
  '',
].join('\n');

const KNOWN_AGENT_TYPES: ReadonlyArray<string> = [
  'implementer',
  'reviewer',
  'code-explorer',
  'code-architect',
  'ui-engineer',
  'typescript-pro',
  'documentation-engineer',
  'project-orchestrator',
  'feature-orchestrator',
  'codebase-auditor',
  'architect-reviewer',
  'code-reviewer',
];

export interface WrapPromptParsedArgs {
  readonly agentType: string;
  readonly promptFile: string;
  readonly repoRoot: string;
  readonly quiet: boolean;
}

export interface WrapPromptParseResult {
  readonly ok: boolean;
  readonly args?: WrapPromptParsedArgs;
  readonly help?: boolean;
  readonly error?: string;
}

/**
 * Exported for tests. Parses argv without touching `process.exit` —
 * tests assert against the parse result directly.
 */
export function parseFlags(argv: ReadonlyArray<string>): WrapPromptParseResult {
  let agentType: string | undefined;
  let promptFile: string | undefined;
  let repoRoot: string | undefined;
  let quiet = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (flag === '--quiet') {
      quiet = true;
      continue;
    }
    if (
      flag === '--agent-type' ||
      flag === '--prompt-file' ||
      flag === '--repo-root'
    ) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--agent-type') agentType = value;
      else if (flag === '--prompt-file') promptFile = value;
      else if (flag === '--repo-root') repoRoot = value;
      continue;
    }
    return { ok: false, error: `unknown arg: ${flag ?? '(empty)'}` };
  }

  if (agentType === undefined) {
    return { ok: false, error: '--agent-type <type> is required' };
  }
  if (!KNOWN_AGENT_TYPES.includes(agentType)) {
    return {
      ok: false,
      error:
        `--agent-type ${agentType} is not a recognized agent type — ` +
        `expected one of: ${KNOWN_AGENT_TYPES.join(', ')}`,
    };
  }
  if (promptFile === undefined) {
    return { ok: false, error: '--prompt-file <path> is required' };
  }
  return {
    ok: true,
    args: {
      agentType,
      promptFile,
      repoRoot: repoRoot ?? process.cwd(),
      quiet,
    },
  };
}

export async function wrapPrompt(argv: string[]): Promise<void> {
  const parsed = parseFlags(argv);
  if (parsed.help === true) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!parsed.ok || parsed.args === undefined) {
    process.stderr.write(`wrap-prompt: ${parsed.error ?? 'parse error'}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  let taskPrompt: string;
  try {
    taskPrompt = await readFile(parsed.args.promptFile, 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      process.stderr.write(
        `wrap-prompt: --prompt-file not found: ${parsed.args.promptFile}\n`,
      );
      process.exit(1);
    }
    process.stderr.write(
      `wrap-prompt: cannot read ${parsed.args.promptFile}: ${errorMessage(err)}\n`,
    );
    process.exit(1);
  }

  let result;
  try {
    result = await wrapPromptForCli({
      agentType: parsed.args.agentType,
      taskPrompt,
      repoRoot: parsed.args.repoRoot,
    });
  } catch (err) {
    process.stderr.write(`wrap-prompt: ${errorMessage(err)}\n`);
    process.exit(1);
  }

  process.stdout.write(result.augmentedPrompt);
  // Ensure trailing newline so the agent pasting stdout into Agent tool
  // ends cleanly when the original prompt did not.
  if (!result.augmentedPrompt.endsWith('\n')) process.stdout.write('\n');

  if (!parsed.args.quiet) {
    process.stderr.write(`${result.summary}\n`);
  }
  process.exit(0);
}
