/**
 * plugins/dw-lifecycle/src/scope-discovery/install-scope-discovery-hooks.ts
 *
 * Library API for `dw-lifecycle install-scope-discovery-hooks`. Wires a
 * pre-commit hook into the adopting project that runs the scope-
 * discovery gate chain on every commit. Detects three project shapes:
 *
 *  (1) `.githooks/pre-commit` already exists — refuse by default; allow
 *      `--merge` (concat to existing hook) or `--replace` (overwrite).
 *      `--force` is a synonym for `--replace`.
 *  (2) `package.json` lists `husky` in deps/devDeps — write the hook to
 *      `.husky/pre-commit` so husky's install path picks it up.
 *  (3) Neither — write `.githooks/pre-commit` AND run
 *      `git config core.hooksPath .githooks` so the new hook is active.
 *
 * Hook content runs these gates in sequence (non-short-circuiting per
 * Phase 4 / TF-004): detect-clones, check-anti-patterns,
 * check-adopters, check-disposition-survivor, check-editor-symmetry.
 * Each gate's exit code is captured; the hook exits 1 if any gate
 * reports a violation but never short-circuits, so the operator sees
 * the full picture on every commit attempt.
 *
 * Provenance is recorded at .dw-lifecycle/scope-discovery/hooks-installed.json
 * with timestamp, installer version, list of managed files, and each
 * file's sha256 at install time. The uninstall command uses this
 * manifest to drift-check before removing.
 *
 * Exit codes:
 *   0   install completed (incl. idempotent no-ops).
 *   2   invalid args, write failure, or refusal (existing hook +
 *       no --merge / --replace / --force).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { errorMessage, isPlainObject } from './util/typeguards.js';

export const HOOK_BEGIN_MARKER =
  '# >>> dw-lifecycle scope-discovery hook >>>';
export const HOOK_END_MARKER = '# <<< dw-lifecycle scope-discovery hook <<<';

const HOOK_BODY_LINES: ReadonlyArray<string> = [
  HOOK_BEGIN_MARKER,
  '# This block is managed by `dw-lifecycle install-scope-discovery-hooks`.',
  '# Do not hand-edit; use `dw-lifecycle uninstall-scope-discovery-hooks`',
  '# to remove, then re-run install if you need to regenerate.',
  '',
  'set +e',
  'dw_lifecycle_gate_failures=0',
  '',
  'dw-lifecycle detect-clones --gate-mode || dw_lifecycle_gate_failures=$((dw_lifecycle_gate_failures + 1))',
  'dw-lifecycle check-anti-patterns --gate-mode || dw_lifecycle_gate_failures=$((dw_lifecycle_gate_failures + 1))',
  'dw-lifecycle check-adopters --gate-mode || dw_lifecycle_gate_failures=$((dw_lifecycle_gate_failures + 1))',
  'dw-lifecycle check-disposition-survivor || dw_lifecycle_gate_failures=$((dw_lifecycle_gate_failures + 1))',
  '',
  'if [ -f .dw-lifecycle/scope-discovery/adopter-manifests.yaml ]; then',
  '  dw-lifecycle check-editor-symmetry --gate-mode || dw_lifecycle_gate_failures=$((dw_lifecycle_gate_failures + 1))',
  'fi',
  '',
  'set -e',
  '',
  'if [ "$dw_lifecycle_gate_failures" -gt 0 ]; then',
  '  echo "scope-discovery: $dw_lifecycle_gate_failures gate(s) failed; commit aborted." >&2',
  '  exit 1',
  'fi',
  HOOK_END_MARKER,
];

function shebangLine(): string {
  return '#!/usr/bin/env bash';
}

function fullStandaloneHook(): string {
  return [shebangLine(), 'set -euo pipefail', '', ...HOOK_BODY_LINES, ''].join(
    '\n',
  );
}

function hookManagedBlock(): string {
  return HOOK_BODY_LINES.join('\n');
}

export interface HooksInstallOptions {
  readonly target: string;
  readonly merge: boolean;
  readonly replace: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
}

export interface HookFileRecord {
  readonly path: string;
  readonly sha256: string;
  readonly managed: boolean;
}

export interface HooksManifest {
  readonly installed_at: string;
  readonly installed_by: string;
  readonly husky_detected: boolean;
  readonly files: ReadonlyArray<HookFileRecord>;
}

export interface HooksInstallResult {
  readonly code: 0 | 2;
  readonly target: string;
  readonly mode: 'fresh-githooks' | 'merge-githooks' | 'replace-githooks' | 'husky';
  readonly actions: ReadonlyArray<string>;
  readonly manifestPath: string;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle install-scope-discovery-hooks [options]',
      '',
      'Wire a pre-commit hook that runs the scope-discovery gate chain.',
      '',
      'Detection order:',
      '  1. .husky/ exists OR package.json lists husky → husky mode.',
      '  2. .githooks/pre-commit already exists → require --merge or',
      '     --replace (alias: --force).',
      '  3. Otherwise → fresh-githooks (writes .githooks/pre-commit +',
      '     sets git config core.hooksPath .githooks).',
      '',
      'Options:',
      '  --target <path>  Target project root. Default: cwd.',
      '  --merge          Append managed block to existing hook.',
      '  --replace        Overwrite existing hook.',
      '  --force          Synonym for --replace.',
      '  --dry-run        Print the plan; do not write.',
      '  --help, -h       Show this help.',
      '',
      'Exit codes: 0 success; 2 refused / args / I/O error.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): HooksInstallOptions {
  let target = process.cwd();
  let merge = false;
  let replace = false;
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
      case '--replace':
        replace = true;
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
  return { target, merge, replace, force, dryRun };
}

export function detectHusky(target: string): boolean {
  if (existsSync(join(target, '.husky'))) {
    return true;
  }
  const pkgPath = join(target, 'package.json');
  if (!existsSync(pkgPath)) {
    return false;
  }
  try {
    const text = readFileSync(pkgPath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) return false;
    const deps = parsed['dependencies'];
    const devDeps = parsed['devDependencies'];
    const hasHusky = (obj: unknown): boolean =>
      isPlainObject(obj) && typeof obj['husky'] === 'string';
    return hasHusky(deps) || hasHusky(devDeps);
  } catch {
    return false;
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function readVersion(): string {
  // The plugin's package.json version is the published version of the
  // CLI bin. We resolve it at runtime via the templates dir's parent so
  // bundling concerns don't matter.
  try {
    const here = new URL('.', import.meta.url).pathname;
    const candidate = resolve(here, '..', '..', 'package.json');
    if (existsSync(candidate)) {
      const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (isPlainObject(parsed) && typeof parsed['version'] === 'string') {
        return parsed['version'];
      }
    }
  } catch {
    // fallthrough
  }
  return '0.0.0-unknown';
}

function ensureDirFor(path: string, dryRun: boolean): void {
  if (dryRun) return;
  mkdirSync(dirname(path), { recursive: true });
}

function chmodExecutable(path: string, dryRun: boolean): void {
  if (dryRun) return;
  try {
    // 0o755 — rwx for owner, rx for group + others.
    // Git hooks require executable bits.
    // eslint-disable-next-line no-bitwise -- intentional Unix mode literal
    const mode = 0o755;
    execSync(`chmod ${mode.toString(8)} ${JSON.stringify(path)}`);
  } catch {
    // chmod failures are non-fatal on Windows; the hook still works
    // when git invokes it.
  }
}

function writeManifest(
  manifestPath: string,
  manifest: HooksManifest,
  dryRun: boolean,
): void {
  if (dryRun) return;
  ensureDirFor(manifestPath, dryRun);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

interface FileWritePlan {
  readonly path: string;
  readonly content: string;
  readonly managed: boolean;
}

function writePlan(plan: FileWritePlan, dryRun: boolean): void {
  ensureDirFor(plan.path, dryRun);
  if (dryRun) return;
  writeFileSync(plan.path, plan.content, 'utf8');
  chmodExecutable(plan.path, dryRun);
}

function configureHooksPath(target: string, dryRun: boolean): void {
  if (dryRun) return;
  try {
    execSync('git config core.hooksPath .githooks', { cwd: target });
  } catch (err) {
    throw new Error(
      `failed to set git core.hooksPath: ${errorMessage(err)} ` +
        '(ensure the target is a git repo; run `git init` first if needed)',
    );
  }
}

/**
 * Choose the install mode based on filesystem detection + user flags.
 * Returns the mode discriminant; throws if the user's flag set is
 * inconsistent with what's on disk.
 */
export function chooseMode(
  target: string,
  opts: HooksInstallOptions,
): HooksInstallResult['mode'] {
  if (detectHusky(target)) {
    return 'husky';
  }
  const existing = join(target, '.githooks', 'pre-commit');
  if (existsSync(existing)) {
    if (opts.merge) return 'merge-githooks';
    if (opts.replace || opts.force) return 'replace-githooks';
    throw new Error(
      `.githooks/pre-commit already exists at ${existing}; ` +
        'pass --merge to append the managed block, --replace (or --force) ' +
        'to overwrite, or remove the existing file before re-running',
    );
  }
  return 'fresh-githooks';
}

export function install(opts: HooksInstallOptions): HooksInstallResult {
  const target = resolve(opts.target);
  const configDir = join(target, '.dw-lifecycle', 'scope-discovery');
  const manifestPath = join(configDir, 'hooks-installed.json');
  const mode = chooseMode(target, opts);
  const actions: string[] = [];

  let hookPath: string;
  let hookContent: string;
  if (mode === 'husky') {
    hookPath = join(target, '.husky', 'pre-commit');
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, 'utf8');
      if (existing.includes(HOOK_BEGIN_MARKER)) {
        actions.push(`skipped (already managed): ${hookPath}`);
        hookContent = existing;
      } else {
        hookContent = existing.endsWith('\n')
          ? `${existing}\n${hookManagedBlock()}\n`
          : `${existing}\n\n${hookManagedBlock()}\n`;
        actions.push(`merged into husky hook: ${hookPath}`);
      }
    } else {
      hookContent = fullStandaloneHook();
      actions.push(`created husky hook: ${hookPath}`);
    }
  } else if (mode === 'fresh-githooks') {
    hookPath = join(target, '.githooks', 'pre-commit');
    hookContent = fullStandaloneHook();
    actions.push(`created: ${hookPath}`);
  } else if (mode === 'merge-githooks') {
    hookPath = join(target, '.githooks', 'pre-commit');
    const existing = readFileSync(hookPath, 'utf8');
    if (existing.includes(HOOK_BEGIN_MARKER)) {
      actions.push(`skipped (already managed): ${hookPath}`);
      hookContent = existing;
    } else {
      hookContent = existing.endsWith('\n')
        ? `${existing}\n${hookManagedBlock()}\n`
        : `${existing}\n\n${hookManagedBlock()}\n`;
      actions.push(`merged: ${hookPath}`);
    }
  } else {
    hookPath = join(target, '.githooks', 'pre-commit');
    hookContent = fullStandaloneHook();
    actions.push(`replaced: ${hookPath}`);
  }

  writePlan({ path: hookPath, content: hookContent, managed: true }, opts.dryRun);

  if (mode === 'fresh-githooks') {
    configureHooksPath(target, opts.dryRun);
    actions.push('git config core.hooksPath .githooks');
  }

  const files: HookFileRecord[] = [
    {
      path: hookPath,
      sha256: sha256(hookContent),
      managed: true,
    },
  ];

  const existingManifest = readExistingManifest(manifestPath);
  const mergedFiles = mergeFileRecords(existingManifest?.files ?? [], files);

  const manifest: HooksManifest = {
    installed_at: new Date().toISOString(),
    installed_by: `dw-lifecycle install-scope-discovery-hooks v${readVersion()}`,
    husky_detected: mode === 'husky',
    files: mergedFiles,
  };
  writeManifest(manifestPath, manifest, opts.dryRun);
  actions.push(`manifest: ${manifestPath}`);

  return { code: 0, target, mode, actions, manifestPath };
}

export function readExistingManifest(
  manifestPath: string,
): HooksManifest | null {
  if (!existsSync(manifestPath)) return null;
  try {
    const text = readFileSync(manifestPath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) return null;
    const files = parsed['files'];
    if (!Array.isArray(files)) return null;
    const records: HookFileRecord[] = [];
    for (const entry of files) {
      if (
        isPlainObject(entry) &&
        typeof entry['path'] === 'string' &&
        typeof entry['sha256'] === 'string' &&
        typeof entry['managed'] === 'boolean'
      ) {
        records.push({
          path: entry['path'],
          sha256: entry['sha256'],
          managed: entry['managed'],
        });
      }
    }
    const installed_at =
      typeof parsed['installed_at'] === 'string'
        ? parsed['installed_at']
        : new Date(0).toISOString();
    const installed_by =
      typeof parsed['installed_by'] === 'string'
        ? parsed['installed_by']
        : 'unknown';
    const husky_detected =
      typeof parsed['husky_detected'] === 'boolean'
        ? parsed['husky_detected']
        : false;
    return { installed_at, installed_by, husky_detected, files: records };
  } catch {
    return null;
  }
}

export function mergeFileRecords(
  existing: ReadonlyArray<HookFileRecord>,
  added: ReadonlyArray<HookFileRecord>,
): HookFileRecord[] {
  const byPath = new Map<string, HookFileRecord>();
  for (const record of existing) {
    byPath.set(record.path, record);
  }
  for (const record of added) {
    byPath.set(record.path, record);
  }
  return [...byPath.values()];
}

function reportActions(result: HooksInstallResult, dryRun: boolean): void {
  const prefix = dryRun ? '[dry-run] ' : '';
  process.stdout.write(
    `${prefix}install-scope-discovery-hooks: target=${result.target} mode=${result.mode}\n`,
  );
  for (const action of result.actions) {
    process.stdout.write(`${prefix}  ${action}\n`);
  }
}

export async function main(argv: readonly string[]): Promise<{ code: 0 | 2 }> {
  let opts: HooksInstallOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`install-scope-discovery-hooks: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  try {
    const result = install(opts);
    reportActions(result, opts.dryRun);
    return { code: 0 };
  } catch (err) {
    process.stderr.write(`install-scope-discovery-hooks: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
}
