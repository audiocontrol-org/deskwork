/**
 * plugins/dw-lifecycle/src/scope-discovery/install-scope-discovery.ts
 *
 * Library API for `dw-lifecycle install-scope-discovery`. Bootstraps the
 * project-side `.dw-lifecycle/scope-discovery/` config directory by
 * copying templates from the plugin and seeding the operator-curated
 * registries with empty arrays.
 *
 * Idempotent: re-runs against a fully-populated target are no-ops; each
 * already-present file produces a "skipped" record in the result.
 * `--force` overwrites; `--dry-run` plans without writing.
 *
 * CONFIG path is fixed at `<target>/.dw-lifecycle/scope-discovery/` per
 * Finding 03 in the feature audit-log (canonical CONFIG path was
 * migrated away from `docs/scope-discovery/` in commit f05de65). The
 * install command MUST match the parser's expected layout.
 *
 * Files written / seeded:
 *
 *   README.md                              (copied from template)
 *   LAYOUT.md                              (copied from template)
 *   refactor-preconditions-checklist.md    (copied from template)
 *   .jscpd.json                            (copied from template)
 *   clones.yaml                            (seeded: `clones: []`)
 *   anti-patterns.yaml                     (seeded: `anti_patterns: []`)
 *   adopter-manifests.yaml                 (seeded: `adopter_manifests: []`)
 *   deprecation-queue.yaml                 (seeded: `deprecations: []`)
 *
 * Exit codes (returned via `main()` for the subcommand shim to forward):
 *   0   install completed (incl. idempotent no-ops).
 *   2   invalid args, write failure, or missing built-in template.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from './util/typeguards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILTIN_TEMPLATES_DIR = join(
  __dirname,
  '..',
  '..',
  'templates',
  'scope-discovery',
);

/** Files copied verbatim from the plugin's templates dir. */
const COPY_FILES: ReadonlyArray<{
  readonly name: string;
  readonly relPath: string;
}> = [
  { name: 'README.md', relPath: 'README.md' },
  { name: 'LAYOUT.md', relPath: 'LAYOUT.md' },
  {
    name: 'refactor-preconditions-checklist.md',
    relPath: 'refactor-preconditions-checklist.md',
  },
  { name: '.jscpd.json', relPath: '.jscpd.json' },
];

/**
 * Empty-seed YAMLs (each registry's empty shape per its schema).
 *
 * `schemaVersion: 1` is seeded into each registry so the
 * `scope-discovery-schema-stale` doctor rule has a known-good baseline
 * to compare against. The field is optional in the parsers; existing
 * registries without the field continue to parse but get a doctor
 * warning prompting the operator to add it.
 *
 * NOTE on shape: `generated_at` is omitted from the seed clones.yaml
 * because it's set by the detector at write-time (operators don't hand-
 * edit it). The schema permits `generated_at` to be added later when
 * the first check-clones run writes the baseline. The seed deliberately
 * leaves the field out so the doctor's schema-violation rule reports a
 * missing-field for any registry that was hand-authored without a real
 * detector run.
 */
const SEED_FILES: ReadonlyArray<{
  readonly name: string;
  readonly content: string;
}> = [
  {
    name: 'clones.yaml',
    // `generated_at: 1970-01-01T00:00:00Z` is an explicit placeholder
    // marking "no detector run has overwritten this file yet". The
    // strict parser requires `generated_at` to be a string; the
    // detector overwrites this on the first real run. Doctor rules
    // can treat the epoch value as a signal that the operator hasn't
    // run `dw-lifecycle check-clones` yet (separately surfaced).
    content:
      'schemaVersion: 1\ngenerated_at: "1970-01-01T00:00:00Z"\nclones: []\n',
  },
  {
    name: 'anti-patterns.yaml',
    content: 'schemaVersion: 1\nanti_patterns: []\n',
  },
  {
    name: 'adopter-manifests.yaml',
    content: 'schemaVersion: 1\nadopter_manifests: []\n',
  },
  {
    name: 'deprecation-queue.yaml',
    // The v1 scanner discovers `@deprecated` markers from source — the
    // YAML is seeded as a placeholder for future baseline persistence
    // (mirroring `clones.yaml`'s role for the clone detector). Empty
    // is the steady state until that enhancement lands; the doctor's
    // schema-stale rule keys off `schemaVersion: 1` to detect drift.
    content: 'schemaVersion: 1\ndeprecations: []\n',
  },
];

export interface InstallOptions {
  readonly target: string;
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
  readonly target: string;
  readonly actions: ReadonlyArray<FileAction>;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle install-scope-discovery [options]',
      '',
      'Bootstrap .dw-lifecycle/scope-discovery/ in the target project.',
      '',
      'Options:',
      '  --target <path>  Target project root. Default: cwd.',
      '  --force          Overwrite files that already exist.',
      '  --dry-run        Print the planned actions; do not write.',
      '  --help, -h       Show this help.',
      '',
      'Exit codes: 0 success (incl. idempotent no-ops); 2 args / I/O error.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): InstallOptions {
  let target = process.cwd();
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
  return { target, force, dryRun };
}

/**
 * Plan + (optionally) execute the install. Returns the resolved
 * per-file actions so callers (tests, the subcommand shim) can assert
 * the outcome without grepping stdout.
 */
export function install(opts: InstallOptions): InstallResult {
  const target = resolve(opts.target);
  const configDir = join(target, '.dw-lifecycle', 'scope-discovery');
  const actions: FileAction[] = [];

  if (!opts.dryRun) {
    mkdirSync(configDir, { recursive: true });
  }

  for (const file of COPY_FILES) {
    const src = join(BUILTIN_TEMPLATES_DIR, file.relPath);
    const dest = join(configDir, file.name);
    if (!existsSync(src)) {
      throw new Error(
        `built-in template missing: ${src} (the plugin is incomplete; ` +
          'reinstall the plugin or report this as a bug)',
      );
    }
    if (existsSync(dest) && !opts.force) {
      actions.push({ path: dest, action: 'skipped', reason: 'already present' });
      continue;
    }
    const action: 'created' | 'overwritten' = existsSync(dest)
      ? 'overwritten'
      : 'created';
    if (!opts.dryRun) {
      copyFileSync(src, dest);
    }
    actions.push({ path: dest, action });
  }

  for (const file of SEED_FILES) {
    const dest = join(configDir, file.name);
    if (existsSync(dest) && !opts.force) {
      actions.push({ path: dest, action: 'skipped', reason: 'already present' });
      continue;
    }
    const action: 'created' | 'overwritten' = existsSync(dest)
      ? 'overwritten'
      : 'created';
    if (!opts.dryRun) {
      writeFileSync(dest, file.content, 'utf8');
    }
    actions.push({ path: dest, action });
  }

  return { code: 0, target, actions };
}

function reportActions(result: InstallResult, dryRun: boolean): void {
  const prefix = dryRun ? '[dry-run] ' : '';
  process.stdout.write(
    `${prefix}install-scope-discovery: target=${result.target}\n`,
  );
  for (const action of result.actions) {
    const detail = action.reason ? ` (${action.reason})` : '';
    process.stdout.write(`${prefix}  ${action.action}: ${action.path}${detail}\n`);
  }
  const created = result.actions.filter((a) => a.action === 'created').length;
  const overwritten = result.actions.filter(
    (a) => a.action === 'overwritten',
  ).length;
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
    process.stderr.write(`install-scope-discovery: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
}
