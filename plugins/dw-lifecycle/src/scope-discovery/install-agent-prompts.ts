/**
 * plugins/dw-lifecycle/src/scope-discovery/install-agent-prompts.ts
 *
 * Library API for `dw-lifecycle install-agent-prompts`. Appends the
 * canonical Step 0 — refactor-precondition verification fragment to
 * the adopting project's .claude/agents/code-reviewer.md and
 * codebase-auditor.md files. Idempotent: a file that already contains
 * the fragment markers is skipped.
 *
 * The fragment lives at
 * plugins/dw-lifecycle/templates/scope-discovery/agent-step-0-fragment.md
 * and is delimited by HTML comment markers (BEGIN/END) so the installer
 * can detect prior installations and so future updates can target the
 * managed block without disturbing operator-authored content above or
 * below.
 *
 * Refuses to auto-create agent files. If the target file is missing,
 * the installer reports the gap with an actionable error — operators
 * own the .claude/agents/ contents.
 *
 * Records each appended file in the hooks-installed.json manifest
 * (shared with install-scope-discovery-hooks) so uninstall can drift-
 * check and remove cleanly.
 *
 * Exit codes:
 *   0   install completed (incl. idempotent no-ops).
 *   2   invalid args, write failure, or missing agent file (without
 *       --skip-missing).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage, isPlainObject } from './util/typeguards.js';
import {
  HookFileRecord,
  HooksManifest,
  mergeFileRecords,
  readExistingManifest,
} from './install-scope-discovery-hooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRAGMENT_PATH = join(
  __dirname,
  '..',
  '..',
  'templates',
  'scope-discovery',
  'agent-step-0-fragment.md',
);

export const STEP_0_BEGIN_MARKER =
  '<!-- dw-lifecycle:scope-discovery:step-0:begin -->';
export const STEP_0_END_MARKER =
  '<!-- dw-lifecycle:scope-discovery:step-0:end -->';

export const TARGET_AGENTS: ReadonlyArray<string> = [
  '.claude/agents/code-reviewer.md',
  '.claude/agents/codebase-auditor.md',
];

export interface AgentPromptsOptions {
  readonly target: string;
  readonly merge: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
}

export interface AgentFileAction {
  readonly path: string;
  readonly action: 'appended' | 'skipped' | 'missing';
  readonly reason?: string;
}

export interface AgentPromptsResult {
  readonly code: 0 | 2;
  readonly target: string;
  readonly actions: ReadonlyArray<AgentFileAction>;
  readonly manifestPath: string;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle install-agent-prompts [options]',
      '',
      'Append the Step 0 refactor-precondition fragment to the project\'s',
      '.claude/agents/code-reviewer.md and codebase-auditor.md files.',
      '',
      'The installer REFUSES to auto-create agent files. If a target',
      'file is missing, the installer reports the gap; the operator',
      'owns .claude/agents/ content.',
      '',
      'Options:',
      '  --target <path>  Target project root. Default: cwd.',
      '  --merge          Append even if file already has the fragment',
      '                   (re-runs the append; harmless because the',
      '                   marker dedup still prevents duplicate blocks).',
      '  --force          Synonym for --merge (semantic alias).',
      '  --dry-run        Print the plan; do not write.',
      '  --help, -h       Show this help.',
      '',
      'Exit codes: 0 success; 2 args / I/O / missing-agent error.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): AgentPromptsOptions {
  let target = process.cwd();
  let merge = false;
  let force = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--target': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--target requires a path');
        target = next;
        i += 1;
        break;
      }
      case '--merge':
        merge = true;
        break;
      case '--force':
        force = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown argument: ${arg ?? '<empty>'}`);
    }
  }
  return { target, merge, force, dryRun };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function readFragment(): string {
  if (!existsSync(FRAGMENT_PATH)) {
    throw new Error(
      `built-in fragment missing: ${FRAGMENT_PATH} (the plugin is ` +
        'incomplete; reinstall the plugin or report this as a bug)',
    );
  }
  return readFileSync(FRAGMENT_PATH, 'utf8');
}

function hasMarker(content: string): boolean {
  return (
    content.includes(STEP_0_BEGIN_MARKER) ||
    content.includes(STEP_0_END_MARKER)
  );
}

function appendFragment(existing: string, fragment: string): string {
  const trimmedFragment = fragment.endsWith('\n')
    ? fragment
    : `${fragment}\n`;
  if (existing.endsWith('\n\n')) {
    return `${existing}${trimmedFragment}`;
  }
  if (existing.endsWith('\n')) {
    return `${existing}\n${trimmedFragment}`;
  }
  return `${existing}\n\n${trimmedFragment}`;
}

function writeManifest(
  manifestPath: string,
  records: ReadonlyArray<HookFileRecord>,
  dryRun: boolean,
): void {
  if (dryRun) return;
  const existing = readExistingManifest(manifestPath);
  mkdirSync(dirname(manifestPath), { recursive: true });
  const merged = mergeFileRecords(existing?.files ?? [], records);
  const manifest: HooksManifest = {
    installed_at: existing?.installed_at ?? new Date().toISOString(),
    installed_by:
      existing?.installed_by ?? 'dw-lifecycle install-agent-prompts',
    husky_detected: existing?.husky_detected ?? false,
    files: merged,
  };
  writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
}

interface AgentFilePlan {
  readonly path: string;
  readonly action: AgentFileAction['action'];
  readonly content: string | null;
  readonly reason?: string;
}

function planAgentFile(
  path: string,
  fragment: string,
  opts: AgentPromptsOptions,
): AgentFilePlan {
  if (!existsSync(path)) {
    return {
      path,
      action: 'missing',
      content: null,
      reason:
        'agent file not present; install-agent-prompts does not auto-create ' +
        'files in .claude/agents/. Create the file first (operator-owned), ' +
        'then re-run the installer.',
    };
  }
  const existing = readFileSync(path, 'utf8');
  if (hasMarker(existing) && !opts.merge && !opts.force) {
    return {
      path,
      action: 'skipped',
      content: null,
      reason: 'Step 0 fragment already present',
    };
  }
  if (hasMarker(existing) && (opts.merge || opts.force)) {
    // The fragment is already there. With --merge / --force the user has
    // opted in to a re-append, but the marker dedup makes that a no-op
    // for any future reader. Skip rather than write garbage.
    return {
      path,
      action: 'skipped',
      content: null,
      reason: 'Step 0 fragment already present (merge no-op)',
    };
  }
  return {
    path,
    action: 'appended',
    content: appendFragment(existing, fragment),
  };
}

export function install(opts: AgentPromptsOptions): AgentPromptsResult {
  const target = resolve(opts.target);
  const configDir = join(target, '.dw-lifecycle', 'scope-discovery');
  const manifestPath = join(configDir, 'hooks-installed.json');
  const fragment = readFragment();
  const actions: AgentFileAction[] = [];
  const appendedRecords: HookFileRecord[] = [];

  for (const relPath of TARGET_AGENTS) {
    const abs = join(target, relPath);
    const plan = planAgentFile(abs, fragment, opts);
    actions.push({
      path: abs,
      action: plan.action,
      ...(plan.reason !== undefined ? { reason: plan.reason } : {}),
    });
    if (plan.action === 'appended' && plan.content !== null) {
      if (!opts.dryRun) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, plan.content, 'utf8');
      }
      appendedRecords.push({
        path: abs,
        sha256: sha256(plan.content),
        managed: true,
      });
    }
  }

  if (appendedRecords.length > 0 && !opts.dryRun) {
    writeManifest(manifestPath, appendedRecords, opts.dryRun);
  }

  const anyMissing = actions.some((a) => a.action === 'missing');
  return {
    code: anyMissing ? 2 : 0,
    target,
    actions,
    manifestPath,
  };
}

function reportActions(result: AgentPromptsResult, dryRun: boolean): void {
  const prefix = dryRun ? '[dry-run] ' : '';
  process.stdout.write(
    `${prefix}install-agent-prompts: target=${result.target}\n`,
  );
  for (const action of result.actions) {
    const detail = action.reason ? ` (${action.reason})` : '';
    process.stdout.write(`${prefix}  ${action.action}: ${action.path}${detail}\n`);
  }
}

export async function main(argv: readonly string[]): Promise<{ code: 0 | 2 }> {
  let opts: AgentPromptsOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`install-agent-prompts: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  try {
    const result = install(opts);
    reportActions(result, opts.dryRun);
    return { code: result.code };
  } catch (err) {
    process.stderr.write(`install-agent-prompts: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
}

// Helper exposed for the uninstall command: a manifest record describes
// a managed agent file iff its path is one of the TARGET_AGENTS shapes.
// (The uninstall command unconditionally drift-checks every recorded
// file; this helper exists so the install path can tag records
// without re-importing the manifest type.)
export function isAgentFilePath(path: string): boolean {
  return TARGET_AGENTS.some((rel) =>
    path.endsWith(rel.split('/').slice(-1)[0] ?? ''),
  );
}

// Re-exported for test imports; isPlainObject is used internally.
export { isPlainObject };
