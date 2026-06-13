/**
 * plugins/stack-control/src/scope-discovery/install-scope-discovery.ts
 *
 * Library API for `stackctl install-scope-discovery`. Bootstraps the
 * per-codebase `<installation>/.stack-control/scope-discovery/` config
 * directory: seeds the operator-curated registries (clones / anti-patterns /
 * adopter-manifests / deprecation-queue) with empty-but-valid shapes, copies
 * the JSON schemas the doctor rules diff against, and creates the
 * scope-discovery `config.yaml` (the sd-config, its own schemaVersion line).
 *
 * Generalized from dw-lifecycle (010 / US6, OQ-6):
 *   - Target installation resolves via `resolveCodebaseBoundary` (009's
 *     nearest-enclosing-installation walk-up), or an explicit `--at <dir>`
 *     scan root. No `process.cwd()` whole-repo fallback — fail loud when no
 *     installation encloses the start dir.
 *   - Config path is `<installation>/.stack-control/scope-discovery/` (NOT
 *     `.dw-lifecycle/...`).
 *   - The dw-lifecycle template-copy machinery (README/LAYOUT/checklist) is
 *     DROPPED — install seeds registries + schemas + config.yaml inline; there
 *     is no hook-install machinery to drop (OQ-6: none existed).
 *
 * Idempotent + non-destructive (009 setup semantics): re-runs against a
 * populated target are no-ops; each already-present file produces a "skipped"
 * record. `--force` overwrites; `--dry-run` plans without writing.
 *
 * Exit codes (returned via `main()` for the subcommand shim to forward):
 *   0   install completed (incl. idempotent no-ops).
 *   2   invalid args, write failure, or no enclosing installation.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstallationError } from '../config/errors.js';
import { resolveCodebaseBoundary } from './codebase-boundary.js';
import { DEFAULT_SD_CONFIG_BODY } from './sd-config.js';
import { errorMessage } from './util/typeguards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** The ported JSON schemas live alongside this module under `schema/`. */
const BUILTIN_SCHEMA_DIR = join(__dirname, 'schema');

/** Config dir relative to an installation root. */
const SD_DIR_REL = join('.stack-control', 'scope-discovery');

/**
 * Empty-seed registries (each registry's empty shape per its schema).
 * `schemaVersion: 1` is seeded so the `scope-discovery-schema-stale` doctor
 * rule has a known-good baseline. `generated_at` epoch placeholder on
 * clones.yaml marks "no detector run has overwritten this yet".
 */
const SEED_FILES: ReadonlyArray<{ readonly name: string; readonly content: string }> = [
  {
    name: 'clones.yaml',
    content: 'schemaVersion: 1\ngenerated_at: "1970-01-01T00:00:00Z"\nclones: []\n',
  },
  { name: 'anti-patterns.yaml', content: 'schemaVersion: 1\nanti_patterns: []\n' },
  { name: 'adopter-manifests.yaml', content: 'schemaVersion: 1\nadopter_manifests: []\n' },
  { name: 'deprecation-queue.yaml', content: 'schemaVersion: 1\ndeprecations: []\n' },
  { name: 'config.yaml', content: DEFAULT_SD_CONFIG_BODY },
];

export interface InstallOptions {
  /** Start dir for the installation walk-up. Default: cwd. */
  readonly startDir: string;
  /** Explicit installation/scan root (`--at`). Overrides the walk-up when set. */
  readonly at: string | null;
  readonly force: boolean;
  readonly dryRun: boolean;
}

export interface FileAction {
  readonly path: string;
  readonly action: 'created' | 'overwritten' | 'skipped';
  readonly reason?: string;
}

export interface InstallResult {
  readonly code: 0 | 2;
  readonly installationRoot: string;
  readonly configDir: string;
  readonly actions: ReadonlyArray<FileAction>;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl install-scope-discovery [options]',
      '',
      'Bootstrap .stack-control/scope-discovery/ in the enclosing installation.',
      '',
      'Options:',
      '  --at <dir>       Installation/scan root. Default: nearest-enclosing',
      '                    .stack-control installation above the cwd.',
      '  --force          Overwrite files that already exist.',
      '  --dry-run        Print the planned actions; do not write.',
      '  --help, -h       Show this help.',
      '',
      'Exit codes: 0 success (incl. idempotent no-ops); 2 args / I/O / no install.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): InstallOptions {
  let at: string | null = null;
  let force = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--at': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--at requires a path');
        at = next;
        i += 1;
        break;
      }
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
  return { startDir: process.cwd(), at, force, dryRun };
}

/** Enumerate the JSON schema files shipped beside this module. */
function builtinSchemaFiles(): readonly string[] {
  try {
    return readdirSync(BUILTIN_SCHEMA_DIR).filter((name) => name.endsWith('.schema.json'));
  } catch (err) {
    throw new Error(
      `built-in schema dir missing at ${BUILTIN_SCHEMA_DIR} (the plugin is incomplete; ` +
        `reinstall or report this as a bug): ${errorMessage(err)}`,
    );
  }
}

/**
 * Plan + (optionally) execute the install against the resolved installation.
 * Returns the resolved per-file actions so callers (tests, the subcommand
 * shim) can assert the outcome without grepping stdout.
 */
export function install(opts: InstallOptions): InstallResult {
  const boundary = resolveCodebaseBoundary({ startDir: opts.startDir, explicitRoot: opts.at });
  const installationRoot = boundary.installationRoot;
  const configDir = join(installationRoot, SD_DIR_REL);
  const schemaDir = join(configDir, 'schema');
  const actions: FileAction[] = [];

  if (!opts.dryRun) {
    mkdirSync(schemaDir, { recursive: true });
  }

  for (const file of SEED_FILES) {
    const dest = join(configDir, file.name);
    actions.push(planWrite(dest, opts, () => writeFileSync(dest, file.content, 'utf8')));
  }

  for (const name of builtinSchemaFiles()) {
    const src = join(BUILTIN_SCHEMA_DIR, name);
    const dest = join(schemaDir, name);
    actions.push(planWrite(dest, opts, () => copyFileSync(src, dest)));
  }

  return { code: 0, installationRoot, configDir, actions };
}

/** Compute + (unless dry-run) apply one file's action under idempotency + --force semantics. */
function planWrite(dest: string, opts: InstallOptions, write: () => void): FileAction {
  if (existsSync(dest) && !opts.force) {
    return { path: dest, action: 'skipped', reason: 'already present' };
  }
  const action: 'created' | 'overwritten' = existsSync(dest) ? 'overwritten' : 'created';
  if (!opts.dryRun) write();
  return { path: dest, action };
}

function reportActions(result: InstallResult, dryRun: boolean): void {
  const prefix = dryRun ? '[dry-run] ' : '';
  process.stdout.write(
    `${prefix}install-scope-discovery: installation=${result.installationRoot}\n`,
  );
  for (const action of result.actions) {
    const detail = action.reason ? ` (${action.reason})` : '';
    process.stdout.write(`${prefix}  ${action.action}: ${action.path}${detail}\n`);
  }
  const created = result.actions.filter((a) => a.action === 'created').length;
  const overwritten = result.actions.filter((a) => a.action === 'overwritten').length;
  const skipped = result.actions.filter((a) => a.action === 'skipped').length;
  process.stdout.write(
    `${prefix}install-scope-discovery: ` +
      `${created} created, ${overwritten} overwritten, ${skipped} skipped\n`,
  );
}

export async function main(argv: readonly string[]): Promise<{ code: 0 | 2 }> {
  let opts: InstallOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`install-scope-discovery: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  try {
    const result = install(opts);
    reportActions(result, opts.dryRun);
    return { code: 0 };
  } catch (err) {
    // specs/installation-isolation US2: the no-installation refusal uses
    // the uniform wording class (`<verb>: FATAL — …` + the resolver's
    // start-dir + `stackctl setup` message).
    const prefix =
      err instanceof InstallationError && err.code === 'not-found'
        ? 'FATAL — '
        : '';
    process.stderr.write(`install-scope-discovery: ${prefix}${errorMessage(err)}\n`);
    return { code: 2 };
  }
}
