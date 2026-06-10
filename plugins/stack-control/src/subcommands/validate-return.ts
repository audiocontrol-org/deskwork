/**
 * plugins/stack-control/src/subcommands/validate-return.ts
 *
 * CLI shim for the orchestrator-facing sub-agent response validation
 * step. Companion to `stackctl wrap-prompt`. After the Agent tool
 * returns the sub-agent's response, the orchestrator writes the response
 * to a file and invokes this verb to validate against the same dispatch
 * grammar `wrap()` enforces in-band — see TF-005 in the canary's
 * tooling-feedback.md for the motivating friction.
 *
 * Reads the response from `--response-file`, parses the three required
 * blocks (Searched/Included/Excluded), checks forbidden-deferral phrases
 * + the skipped-audit shape + refactor-precondition cues (when the
 * agent-type is refactor-eligible), and emits a structured
 * `ValidationResult` (JSON) to stdout.
 *
 * Exit codes:
 *   0 — response valid; the orchestrator accepts the response.
 *   1 — response rejected by validation; the orchestrator re-dispatches
 *        with the augmented prompt + a correction note describing the
 *        violation(s) surfaced in the JSON.
 *   2 — usage error (missing flag, unknown arg, bad agent-type, file
 *        unreadable).
 */

import { readFile } from 'node:fs/promises';
import { validateReturnForCli } from '../scope-discovery/dispatch-wrapper-cli.js';
import { errorMessage, isEnoent } from '../scope-discovery/util/typeguards.js';

/**
 * Phase 14 Task 3 (AUDIT-20260529-14): signaled-empty stdin when
 * `--response-file -` is used. Distinct error class lets the CLI surface
 * an actionable exit-2 message and lets tests assert on the type.
 */
export class EmptyStdinError extends Error {
  constructor() {
    super(
      "validate-return: stdin was empty (passed `--response-file -` but no bytes were read). " +
        'Pipe the response body in (e.g. `… | stackctl validate-return --response-file - ...`) ' +
        'or pass a real file path.',
    );
    this.name = 'EmptyStdinError';
  }
}

/**
 * Read the sub-agent response from either stdin (when `responseFile`
 * is the `-` sentinel, mirroring the `gh issue create --body-file -`
 * convention) or from disk via `readFile`. Exported so tests can pass
 * an in-memory Readable stream without spawning a child process.
 */
export async function readResponseSource(
  responseFile: string,
  stdin: NodeJS.ReadableStream,
): Promise<string> {
  if (responseFile === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    // AUDIT-20260529-20 (review-finding T3-4): `body.length === 0` only
    // catches truly-empty stdin. A pipe of whitespace-only content (the
    // common `echo "" | ...` case) passed through as non-empty and the
    // operator got a confusing DispatchRejected on missing blocks
    // instead of the actionable `EmptyStdinError` shape. Trim before
    // the empty check so whitespace-only stdin is treated as empty.
    if (body.trim().length === 0) throw new EmptyStdinError();
    return body;
  }
  return readFile(responseFile, 'utf8');
}

const USAGE = [
  'Usage: stackctl validate-return',
  '    --response-file <path|->',
  '    --agent-type <type>',
  '    [--repo-root <path>]',
  '    [--json]',
  '    [--help]',
  '',
  '--response-file <path|->',
  '                         Path to the file containing the sub-agent\'s',
  '                         response text (the Agent tool return value).',
  '                         Pass `-` to read from stdin (e.g.',
  '                         `echo "$RESP" | stackctl validate-return',
  '                         --response-file - --agent-type reviewer`).',
  '                         Mirrors the `gh issue create --body-file -`',
  '                         convention. Empty stdin → exit 2 with hint.',
  '--agent-type <type>      The Agent-tool agent type the response is from.',
  '                         Some validation rules vary by agent type — the',
  '                         refactor-precondition cue check only fires when',
  '                         the agent type is refactor-eligible.',
  '--repo-root <path>       Project root for resolving',
  '                         \`.stack-control/scope-discovery/*.yaml\` overrides.',
  '                         Defaults to the current working directory.',
  '--json                   Suppress the stderr one-line summary; emit only',
  '                         the structured JSON to stdout. Use in pipelines',
  '                         where stderr noise is unwanted.',
  '',
  'Emits a ValidationResult (JSON) to stdout. Exit 0 on valid; exit 1',
  'when one or more validation rules reject the response. The agent',
  'branches on the exit code: 0 = accept; 1 = re-dispatch with correction.',
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

export interface ValidateReturnParsedArgs {
  readonly responseFile: string;
  readonly agentType: string;
  readonly repoRoot: string;
  readonly jsonOnly: boolean;
}

export interface ValidateReturnParseResult {
  readonly ok: boolean;
  readonly args?: ValidateReturnParsedArgs;
  readonly help?: boolean;
  readonly error?: string;
}

/**
 * Exported for tests. Parses argv without touching `process.exit` —
 * tests assert against the parse result directly.
 */
export function parseFlags(argv: ReadonlyArray<string>): ValidateReturnParseResult {
  let responseFile: string | undefined;
  let agentType: string | undefined;
  let repoRoot: string | undefined;
  let jsonOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (flag === '--json') {
      jsonOnly = true;
      continue;
    }
    if (
      flag === '--response-file' ||
      flag === '--agent-type' ||
      flag === '--repo-root'
    ) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--response-file') responseFile = value;
      else if (flag === '--agent-type') agentType = value;
      else if (flag === '--repo-root') repoRoot = value;
      continue;
    }
    return { ok: false, error: `unknown arg: ${flag ?? '(empty)'}` };
  }

  if (responseFile === undefined) {
    return { ok: false, error: '--response-file <path> is required' };
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
  return {
    ok: true,
    args: {
      responseFile,
      agentType,
      repoRoot: repoRoot ?? process.cwd(),
      jsonOnly,
    },
  };
}

export async function validateReturn(argv: string[]): Promise<void> {
  const parsed = parseFlags(argv);
  if (parsed.help === true) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!parsed.ok || parsed.args === undefined) {
    process.stderr.write(`validate-return: ${parsed.error ?? 'parse error'}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  let response: string;
  try {
    response = await readResponseSource(parsed.args.responseFile, process.stdin);
  } catch (err) {
    if (err instanceof EmptyStdinError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
    if (isEnoent(err)) {
      process.stderr.write(
        `validate-return: --response-file not found: ${parsed.args.responseFile}\n`,
      );
      process.exit(2);
    }
    process.stderr.write(
      `validate-return: cannot read ${parsed.args.responseFile}: ${errorMessage(err)}\n`,
    );
    process.exit(2);
  }

  let result;
  try {
    result = await validateReturnForCli({
      response,
      agentType: parsed.args.agentType,
      repoRoot: parsed.args.repoRoot,
    });
  } catch (err) {
    process.stderr.write(`validate-return: ${errorMessage(err)}\n`);
    process.exit(2);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!parsed.args.jsonOnly) {
    process.stderr.write(`${result.summary}\n`);
  }
  process.exit(result.valid ? 0 : 1);
}
