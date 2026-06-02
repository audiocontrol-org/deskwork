/**
 * plugins/dw-lifecycle/src/subcommands/audit-barrage-render.ts
 *
 * CLI shim for the prompt-renderer sibling verb. Takes a vars JSON
 * file + a feature slug, runs `renderAuditBarragePrompt`, and writes
 * the rendered prompt to `--output` (default stdout).
 *
 * Workflow:
 *
 *   1. Operator assembles a vars JSON file mapping each
 *      `EXPECTED_VARS` key to its substitution value. The keys must
 *      match the renderer's contract exactly:
 *      `feature_slug`, `workplan_summary`, `diff`, `audit_log_excerpt`,
 *      `commit_subjects`.
 *
 *      Example:
 *        {
 *          "feature_slug": "scope-discovery",
 *          "workplan_summary": "...",
 *          "diff": "...",
 *          "audit_log_excerpt": "...",
 *          "commit_subjects": "..."
 *        }
 *
 *   2. `dw-lifecycle audit-barrage-render --feature <slug> --vars-file <path>
 *      [--output <path>]` reads the JSON, validates the keys, runs the
 *      renderer (which resolves project override vs plugin default
 *      automatically), and writes the rendered prompt.
 *
 *   3. The output of this verb is the input to `audit-barrage --prompt-file`.
 *
 * Exit code contract:
 *   - 0 — render succeeded; prompt written.
 *   - 1 — render failed (missing var, malformed template, unsubstituted
 *         declared var). Renderer's error message goes to stderr.
 *   - 2 — usage error (missing flag, unreadable vars file, unparseable
 *         JSON, vars not a flat string-map).
 *
 * Note on the `--feature` flag: the renderer takes the slug via
 * `vars.feature_slug`. The CLI flag is preserved as a safety check —
 * the operator's flag must match the value embedded in the JSON, so a
 * mismatched vars file is caught here instead of producing a prompt
 * with the wrong feature reference inside.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  EXPECTED_VARS,
  renderAuditBarragePrompt,
} from '../scope-discovery/audit-barrage/prompt-renderer.js';
import { errorMessage, isPlainObject } from '../scope-discovery/util/typeguards.js';

const USAGE = [
  'Usage: dw-lifecycle audit-barrage-render',
  '    --feature <slug>',
  '    --vars-file <path>',
  '    [--output <path>]',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--feature <slug>          The feature directory slug. Must match the',
  '                          `feature_slug` key inside the vars JSON.',
  '--vars-file <path>        Path to a JSON file mapping each EXPECTED_VARS',
  '                          key to its substitution value. Required keys:',
  `                          ${EXPECTED_VARS.join(', ')}`,
  '--output <path>           File path to write the rendered prompt to.',
  '                          Defaults to stdout.',
  '--repo-root <path>        Project root for override resolution.',
  '                          Defaults to cwd.',
  '',
  'Reads the vars JSON, invokes the prompt-renderer (project-local override',
  'at .dw-lifecycle/scope-discovery/audit-barrage-prompt.md takes precedence',
  'over the plugin default), and writes the rendered prompt. The output is',
  'the input file expected by `dw-lifecycle audit-barrage --prompt-file`.',
  '',
].join('\n');

export interface RenderParsedFlags {
  readonly featureSlug: string;
  readonly varsFilePath: string;
  readonly outputPath: string | undefined;
  readonly repoRoot: string;
}

export interface RenderParseResult {
  readonly ok: boolean;
  readonly flags?: RenderParsedFlags;
  readonly help?: boolean;
  readonly error?: string;
}

/**
 * Parse the subcommand's argv slice. Exported for tests.
 */
export function parseRenderFlags(argv: ReadonlyArray<string>): RenderParseResult {
  let featureSlug: string | undefined;
  let varsFilePath: string | undefined;
  let outputPath: string | undefined;
  let repoRoot: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      return { ok: true, help: true };
    }
    if (
      flag === '--feature' ||
      flag === '--vars-file' ||
      flag === '--output' ||
      flag === '--repo-root'
    ) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--vars-file') varsFilePath = value;
      else if (flag === '--output') outputPath = value;
      else if (flag === '--repo-root') repoRoot = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(empty)'}` };
  }

  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  if (varsFilePath === undefined) {
    return { ok: false, error: '--vars-file <path> is required' };
  }

  const flags: RenderParsedFlags = {
    featureSlug,
    varsFilePath,
    outputPath,
    repoRoot: repoRoot ?? process.cwd(),
  };
  return { ok: true, flags };
}

/**
 * Validate the parsed JSON payload is a flat `{string: string}` map.
 * Exported for tests so the validation contract can be exercised
 * without disk I/O.
 *
 * Returns the typed map or an error message. The error path keeps the
 * usage classification (caller exits 2 on validation failure) separate
 * from the renderer's runtime failures (caller exits 1).
 */
export function validateVarsPayload(
  parsed: unknown,
): { ok: true; vars: Record<string, string> } | { ok: false; error: string } {
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: 'vars file: top-level value must be a JSON object',
    };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      return {
        ok: false,
        error: `vars file: key '${key}' must be a string (got ${typeof value})`,
      };
    }
    out[key] = value;
  }
  return { ok: true, vars: out };
}

/**
 * Subcommand entry. Parses flags, reads the vars file, runs the
 * renderer, writes the rendered prompt, and exits.
 */
export async function auditBarrageRender(args: string[]): Promise<void> {
  const parsed = parseRenderFlags(args);
  if (parsed.help === true) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!parsed.ok || parsed.flags === undefined) {
    process.stderr.write(`audit-barrage-render: ${parsed.error ?? 'parse error'}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const flags = parsed.flags;
  const repoRoot = resolve(flags.repoRoot);

  let varsRaw: string;
  try {
    varsRaw = await readFile(flags.varsFilePath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `audit-barrage-render: failed to read --vars-file ${flags.varsFilePath}: ${errorMessage(err)}\n`,
    );
    process.exit(2);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(varsRaw);
  } catch (err) {
    process.stderr.write(
      `audit-barrage-render: --vars-file ${flags.varsFilePath} is not valid JSON: ${errorMessage(err)}\n`,
    );
    process.exit(2);
  }

  const validation = validateVarsPayload(parsedJson);
  if (!validation.ok) {
    process.stderr.write(`audit-barrage-render: ${validation.error}\n`);
    process.exit(2);
  }

  // Operator-safety check: a vars file whose `feature_slug` doesn't
  // match the CLI's `--feature` flag almost always means the operator
  // pointed at the wrong file. Surface that as a usage error here
  // instead of letting the renderer produce a prompt with a stale
  // feature reference baked in.
  const slugFromVars = validation.vars['feature_slug'];
  if (typeof slugFromVars === 'string' && slugFromVars !== flags.featureSlug) {
    process.stderr.write(
      `audit-barrage-render: --feature ${flags.featureSlug} does not match ` +
        `vars.feature_slug=${slugFromVars} in ${flags.varsFilePath}\n`,
    );
    process.exit(2);
  }

  let rendered: string;
  try {
    rendered = await renderAuditBarragePrompt({
      repoRoot,
      vars: validation.vars,
    });
  } catch (err) {
    process.stderr.write(`audit-barrage-render: ${errorMessage(err)}\n`);
    process.exit(1);
  }

  if (flags.outputPath !== undefined) {
    try {
      await writeFile(flags.outputPath, rendered, 'utf8');
    } catch (err) {
      process.stderr.write(
        `audit-barrage-render: failed to write --output ${flags.outputPath}: ${errorMessage(err)}\n`,
      );
      process.exit(1);
    }
    process.stderr.write(
      `audit-barrage-render: rendered prompt written to ${flags.outputPath} (${rendered.length} bytes)\n`,
    );
  } else {
    process.stdout.write(rendered);
  }
  process.exit(0);
}
