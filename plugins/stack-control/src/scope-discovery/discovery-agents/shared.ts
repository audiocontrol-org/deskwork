/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/shared.ts
 *
 * Common scaffolding used by every discovery agent. The four agents
 * share the same CLI shape, the same module-walking primitive, and the
 * same PRD-reading primitive — extracting it here keeps each agent file
 * under the 300-line cap and prevents the agents from drifting into
 * slightly-different versions of the same helpers.
 *
 * Per .claude/CLAUDE.md: "USE DRY PRINCIPLES … DO NOT DUPLICATE CODE."
 *
 * ## Module-root generalization
 *
 * The original audiocontrol pilot hard-coded `MODULES_DIR = 'modules'`
 * and filtered modules to those ending in `-editor`. That coupled the
 * agents to one project's source-tree convention. dw-lifecycle exposes
 * the module-root path as a configurable option:
 *
 *   - default: `'src'` (matches the deskwork / single-package layout)
 *   - CLI override: `--module-root <path>` (passed by the orchestrating
 *     `scope-inventory` subcommand)
 *   - DiscoveryAgentInput.moduleRoot: every agent receives the resolved
 *     module-root via the input contract; helpers below honor it.
 *
 * The `-editor` suffix filter has been dropped entirely; `listModules`
 * returns every subdirectory under the module-root. Projects that need
 * a name filter can supply it through a future config slot.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiscoveryAgentInput } from './types.js';
import { errorMessage } from '../util/typeguards.js';

/** Default module-root path (relative to repoRoot). */
export const DEFAULT_MODULE_ROOT = 'src';

/** Files/dirs every agent skips when walking sources. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  '.turbo',
  'coverage',
  '.next',
  '__snapshots__',
]);

const SRC_EXTENSIONS: ReadonlyArray<string> = ['.ts', '.tsx'];

/**
 * Resolve the module-root from a DiscoveryAgentInput. Returns the
 * absolute path to the directory holding workspace modules. Callers
 * pass the result to `listModules` / `walkSourceFiles` etc.
 */
export function getModuleRoot(input: DiscoveryAgentInput): string {
  return resolve(input.repoRoot, input.moduleRoot);
}

/**
 * Parse the CLI args shared by all four agents:
 *   --feature <slug>          required
 *   --prd-path <path>         required
 *   --repo-root <path>        optional (defaults to process.cwd())
 *   --module-root <path>      optional (defaults to 'src')
 *
 * Returns a fully-resolved DiscoveryAgentInput. Throws on missing
 * required args — the agent's main() catches and exits non-zero so the
 * subcommand upstream sees a real failure (not a silent fallback).
 */
export function parseAgentCli(argv: ReadonlyArray<string>): DiscoveryAgentInput {
  let featureSlug: string | null = null;
  let prdPath: string | null = null;
  let repoRoot: string | null = null;
  let moduleRoot: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--feature') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('--feature requires a value');
      featureSlug = next;
      i += 1;
    } else if (a === '--prd-path') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('--prd-path requires a value');
      prdPath = next;
      i += 1;
    } else if (a === '--repo-root') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('--repo-root requires a value');
      repoRoot = next;
      i += 1;
    } else if (a === '--module-root') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('--module-root requires a value');
      moduleRoot = next;
      i += 1;
    } else if (a === '--help' || a === '-h') {
      throw new Error('HELP');
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  if (featureSlug === null) throw new Error('--feature is required');
  if (prdPath === null) throw new Error('--prd-path is required');
  const root = resolve(repoRoot ?? process.cwd());
  return {
    featureSlug,
    prdPath: resolve(root, prdPath),
    repoRoot: root,
    moduleRoot: moduleRoot ?? DEFAULT_MODULE_ROOT,
  };
}

/**
 * Standard agent CLI entrypoint shape. Each agent's main() emits the
 * findings JSON to stdout and exits 0 on success, non-zero on infra
 * error. This wrapper centralizes argv parsing + error formatting so
 * each agent file stays focused on its discovery logic.
 */
export async function runAgentCli(
  agentName: string,
  run: (input: DiscoveryAgentInput) => Promise<unknown>,
): Promise<number> {
  let input: DiscoveryAgentInput;
  try {
    input = parseAgentCli(process.argv.slice(2));
  } catch (err) {
    const msg = errorMessage(err);
    if (msg === 'HELP') {
      printAgentUsage(agentName);
      return 0;
    }
    process.stderr.write(`${agentName}: ${msg}\n`);
    printAgentUsage(agentName);
    return 2;
  }
  try {
    const findings = await run(input);
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${agentName}: ${errorMessage(err)}\n`);
    return 1;
  }
}

function printAgentUsage(agentName: string): void {
  process.stderr.write(
    [
      `Usage: tsx plugins/stack-control/src/scope-discovery/discovery-agents/${agentName}.ts \\`,
      '    --feature <slug> \\',
      '    --prd-path <path-to-prd.md> \\',
      '    [--repo-root <path>] \\',
      '    [--module-root <path>]',
      '',
    ].join('\n'),
  );
}

/**
 * Recursively walk a directory yielding repo-relative paths of files
 * matching `extensions`. Skips SKIP_DIRS. Returns sorted output for
 * deterministic agent runs across invocations.
 *
 * `rootAbs` must be absolute; results are relative to `repoRoot` so
 * downstream consumers (synthesis, manifest) see consistent paths.
 *
 * The root is validated up front: a missing/non-directory root throws a
 * descriptive error rather than producing zero findings (which would
 * mask a typo in `--repo-root` as a successful no-op).
 */
export async function walkSourceFiles(args: {
  readonly rootAbs: string;
  readonly repoRoot: string;
  readonly extensions?: ReadonlyArray<string>;
}): Promise<ReadonlyArray<string>> {
  const exts = args.extensions ?? SRC_EXTENSIONS;
  let rootStat: Awaited<ReturnType<typeof stat>>;
  try {
    rootStat = await stat(args.rootAbs);
  } catch (err) {
    throw new Error(
      `walkSourceFiles: source root not accessible: ${args.rootAbs}: ${errorMessage(err)}`,
    );
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`walkSourceFiles: source root is not a directory: ${args.rootAbs}`);
  }
  const collected: string[] = [];
  await walkInto(args.rootAbs, args.repoRoot, exts, collected);
  return collected.sort();
}

/**
 * Recursive walker. Nested-directory `readdir` errors propagate — the
 * deliberate choice for a discovery tool is to fail loudly rather than
 * silently degrade.
 */
async function walkInto(
  dirAbs: string,
  repoRoot: string,
  exts: ReadonlyArray<string>,
  out: string[],
): Promise<void> {
  const raw = await readdir(dirAbs, { withFileTypes: true });
  const entries = raw.map((d) => ({
    name: d.name,
    isDir: d.isDirectory(),
    isFile: d.isFile(),
  }));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dirAbs, entry.name);
    if (entry.isDir) {
      await walkInto(full, repoRoot, exts, out);
    } else if (entry.isFile) {
      const lower = entry.name.toLowerCase();
      const matches = exts.some((e) => lower.endsWith(e));
      if (matches) out.push(relative(repoRoot, full));
    }
  }
}

/**
 * Enumerate the workspace modules present in the repo by scanning
 * `<repoRoot>/<moduleRoot>/` for child directories. Deterministic
 * ordering (sorted).
 *
 * Renamed from `listEditorModules` and de-filtered: the original pilot
 * filtered to entries ending in `-editor` (an audiocontrol naming
 * convention); the generalized version returns every subdirectory the
 * project organizes under the module-root.
 *
 * Returns `[]` (not throw) when the module-root doesn't exist — some
 * projects organize sources directly under the repo root and have no
 * module-root directory; callers degrade to single-module behavior in
 * that case (see `modulesInScopeForFeature`).
 */
export async function listModules(
  input: DiscoveryAgentInput,
): Promise<ReadonlyArray<string>> {
  const modulesAbs = getModuleRoot(input);
  if (!(await isDirectory(modulesAbs))) {
    return [];
  }
  try {
    const raw = await readdir(modulesAbs, { withFileTypes: true });
    return raw
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => !n.startsWith('.'))
      .sort();
  } catch (err) {
    throw new Error(
      `cannot list ${input.moduleRoot}/ under ${input.repoRoot}: ${errorMessage(err)}`,
    );
  }
}

/**
 * Read a UTF-8 text file. Throws a descriptive error including the
 * absolute path on failure — no silent fallback (per the project rule).
 */
export async function readUtf8(absPath: string): Promise<string> {
  try {
    return await readFile(absPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${absPath}: ${errorMessage(err)}`);
  }
}

/**
 * The bag-of-views every pattern-scanning agent needs for a source
 * file: the repo-relative path, the full text, and a pre-split lines
 * array. Computing once + sharing avoids re-splitting in each consumer.
 */
export interface SourceFileView {
  readonly file: string;
  readonly text: string;
  readonly lines: ReadonlyArray<string>;
}

/**
 * Read a repo-relative source file and return its `SourceFileView`.
 * Errors propagate — matching the discovery-tool failure-loud posture.
 */
export async function readSourceFile(args: {
  readonly repoRoot: string;
  readonly relFile: string;
}): Promise<SourceFileView> {
  const text = await readUtf8(repoAbs(args.repoRoot, args.relFile));
  return {
    file: args.relFile,
    text,
    lines: text.split(/\r?\n/),
  };
}

/**
 * Read the feature's PRD as text. The path is the resolved absolute
 * path from the CLI; a missing file is an infra error (the upstream
 * subcommand must surface it).
 */
export async function readPrd(input: DiscoveryAgentInput): Promise<string> {
  return readUtf8(input.prdPath);
}

/**
 * Determine which workspace modules are in scope for a given feature.
 * The heuristic (project-agnostic v1):
 *   1. Enumerate modules under `<repoRoot>/<moduleRoot>/`.
 *   2. If the module-root doesn't exist OR has no subdirectories,
 *      degrade to single-module behavior: return `['.']` so the agents
 *      treat the repo root itself as the only module. This supports
 *      single-package projects that organize sources directly under
 *      the repo root rather than splitting them into subdirectories.
 *   3. Otherwise read the PRD and check whether the module name appears
 *      (case-insensitive). If at least one match, return only matched
 *      modules; otherwise return ALL modules (system-wide default).
 *
 * A missing/unreadable PRD is an infra failure, not a "default to
 * everything" condition — `readPrd` throws a descriptive error which
 * propagates to the agent's CLI wrapper (per CLAUDE.md "no fallbacks
 * outside test code"). Callers that genuinely want the system-wide set
 * without a PRD should call `listModules` directly.
 *
 * The "editor" terminology from the audiocontrol pilot's
 * `modulesInScopeForFeature` is no longer used in the implementation;
 * the function name is retained for cross-agent stability.
 */
export async function modulesInScopeForFeature(
  input: DiscoveryAgentInput,
): Promise<ReadonlyArray<string>> {
  const modules = await listModules(input);
  if (modules.length === 0) {
    // No module-root or empty module-root → single-package layout;
    // treat the repo root as the only "module".
    return ['.'];
  }
  const prdText = await readPrd(input);
  const lower = prdText.toLowerCase();
  const mentioned = modules.filter((m) => lower.includes(m.toLowerCase()));
  return mentioned.length > 0 ? mentioned : modules;
}

/** Resolve a repo-relative path against the repo root. */
export function repoAbs(repoRoot: string, rel: string): string {
  return resolve(repoRoot, rel);
}

/** Quick `fs.stat`-based directory existence check (no throw). */
export async function isDirectory(absPath: string): Promise<boolean> {
  try {
    const s = await stat(absPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Run an agent's `runAgentCli` invocation only when the calling module
 * is the script's entry point — inert when imported by the synthesis
 * pass or the `scope-inventory` subcommand. Each agent passes its
 * `import.meta.url` so this helper can compare against argv[1].
 */
export function runIfMain(args: {
  readonly importMetaUrl: string;
  readonly agentName: string;
  readonly run: (input: DiscoveryAgentInput) => Promise<unknown>;
}): void {
  if (
    process.argv[1] === undefined ||
    fileURLToPath(args.importMetaUrl) !== process.argv[1]
  ) {
    return;
  }
  runAgentCli(args.agentName, args.run)
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      process.stderr.write(`${args.agentName}: ${errorMessage(err)}\n`);
      process.exit(1);
    });
}
