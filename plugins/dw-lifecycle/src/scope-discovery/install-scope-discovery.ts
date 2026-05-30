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
 *   audit-barrage-prompt.md                (seeded: commented-out pointer)
 *   audit-barrage-config.yaml              (seeded: commented-out pointer)
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
const AUDIT_BARRAGE_PROMPT_SEED = `# Audit-barrage prompt override (project-local)
#
# To override the plugin's shipped audit-barrage prompt template, copy
# the default body from plugins/dw-lifecycle/templates/audit-barrage-prompt.md
# (in the dw-lifecycle plugin install) into this file and edit. The
# renderer treats this file's presence as the override signal; when this
# file is absent, the plugin default is used.
#
# This seeded scaffold is a header-only marker so the override path
# exists at a discoverable location without overriding the default
# until the operator opts in. The renderer requires the SAME {{var}}
# substitution markers as the default (feature_slug, workplan_summary,
# diff, audit_log_excerpt, commit_subjects); missing any will throw at
# render time.
#
# To opt in: replace this file's content with the default's body, then edit.
`;

const AUDIT_BARRAGE_CONFIG_SEED = `# Audit-barrage model battery override (project-local)
#
# To override the plugin's shipped audit-barrage model battery, uncomment
# + edit the example below. The config-loader treats a file with a
# parseable, non-empty 'models:' list as the override; when this file is
# absent OR its 'models:' list is commented out, the plugin default at
# plugins/dw-lifecycle/templates/audit-barrage-config.yaml is used.
#
# Schema: see scope-discovery/schema/audit-barrage-config.yaml.schema.json
# Default invocations are derived from the live-probed contracts in
# docs/.../audit-barrage-cli-notes.md.
#
# Example override (uncomment + edit to activate):
#
# models:
#   - name: claude
#     binary: claude
#     args_template: "-p {{prompt}}"
#     timeout_seconds: 300
#   - name: codex
#     binary: codex
#     args_template: "exec {{prompt}}"
#     timeout_seconds: 300
#   - name: gemini
#     binary: gemini
#     args_template: "{{prompt}}"
#     timeout_seconds: 300
`;

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
  {
    name: 'audit-barrage-prompt.md',
    // Pointer scaffold for the audit-barrage prompt override. The
    // plugin's shipped default at `plugins/dw-lifecycle/templates/audit-barrage-prompt.md`
    // is the runtime fallback when this file is absent OR empty-after-
    // stripping-comments. Operators who want to customize the audit
    // prompt copy the plugin default's body in here and edit. We seed
    // a header-only commented marker so the file lives at a discoverable
    // path without overriding the default until the operator opts in.
    content: AUDIT_BARRAGE_PROMPT_SEED,
  },
  {
    name: 'audit-barrage-config.yaml',
    // Pointer scaffold for the audit-barrage model battery override.
    // The plugin's shipped default at `plugins/dw-lifecycle/templates/audit-barrage-config.yaml`
    // is the runtime fallback while this file's `models:` list stays
    // commented-out. To override the default battery, uncomment + edit
    // the example block below; the config-loader validates each entry
    // against the schema at scope-discovery/schema/audit-barrage-config.yaml.schema.json.
    content: AUDIT_BARRAGE_CONFIG_SEED,
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
