/**
 * plugins/stack-control/src/scope-discovery/scope-export.ts
 *
 * Read a previously-produced `scope-manifest.yaml` and emit it to stdout
 * verbatim (YAML) or re-serialized as JSON. Companion to `scope-inventory`
 * (that subcommand WRITES the manifest; this one READS it) for downstream
 * consumers (skill prose, CI pipelines, operator scripts) that don't want to
 * know the on-disk path.
 *
 * Generalized from dw-lifecycle (010 / US6): the manifest base root defaults
 * to the nearest-enclosing stack-control installation root (resolved via
 * `resolveCodebaseBoundary`) instead of `process.cwd()`, so the manifest path
 * resolves per-codebase exactly the way every other governed verb agrees on
 * "which codebase am I in". `--repo-root <path>` still overrides explicitly;
 * `--at <dir>` overrides the installation walk-up start.
 *
 * Path resolution:
 *   - default: docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml relative to
 *     the resolved installation root.
 *   - `--manifest <path>` overrides the resolved path entirely (--slug then
 *     optional).
 *
 * Output:
 *   - default: emit the file's raw text on stdout (preserves comments + order).
 *   - `--json`: parse the YAML and re-emit as JSON.
 *
 * Exit codes:
 *   0   manifest read + emitted successfully.
 *   2   invalid CLI args, no enclosing installation, missing manifest, or
 *       malformed YAML (when --json was requested and parsing fails).
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveCodebaseBoundary } from './codebase-boundary.js';
import { errorMessage } from './util/typeguards.js';

const FEATURE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function defaultManifestPath(slug: string): string {
  return `docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`;
}

interface CliOptions {
  readonly slug: string | null;
  readonly manifestPath: string | null;
  /** Explicit repo root (`--repo-root`); null → resolve from the installation. */
  readonly repoRoot: string | null;
  /** Installation walk-up start dir override (`--at`). */
  readonly at: string | null;
  readonly json: boolean;
  readonly quiet: boolean;
}

function parseCli(argv: readonly string[]): CliOptions {
  let slug: string | null = null;
  let manifestPath: string | null = null;
  let repoRoot: string | null = null;
  let at: string | null = null;
  let json = false;
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--slug': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--slug requires a value');
        slug = next;
        i += 1;
        break;
      }
      case '--manifest': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--manifest requires a path');
        manifestPath = next;
        i += 1;
        break;
      }
      case '--repo-root': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--repo-root requires a path');
        repoRoot = next;
        i += 1;
        break;
      }
      case '--at': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--at requires a path');
        at = next;
        i += 1;
        break;
      }
      case '--json':
        json = true;
        break;
      case '--quiet':
        quiet = true;
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
  if (slug === null && manifestPath === null) {
    throw new Error('--slug <slug> or --manifest <path> is required');
  }
  if (slug !== null && !FEATURE_SLUG_REGEX.test(slug)) {
    throw new Error(
      `--slug '${slug}' is not a valid feature slug ` +
        '(must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ — lowercase alphanumeric ' +
        '+ dashes, no leading/trailing dash, min 2 chars)',
    );
  }
  return { slug, manifestPath, repoRoot, at, json, quiet };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl scope-export [options]',
      '',
      'Emit a previously-produced scope-manifest.yaml to stdout.',
      '',
      'Options:',
      '  --slug <slug>      Feature slug; default manifest path resolves',
      '                      to docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml.',
      '  --manifest <path>  Override manifest path explicitly.',
      '  --repo-root <path> Override the base root (default: enclosing installation).',
      '  --at <dir>         Installation walk-up start dir (default: cwd).',
      '  --json             Emit parsed JSON instead of raw YAML.',
      '  --quiet            Suppress informational stderr.',
      '  --help, -h         Show this help.',
      '',
      'Exit codes: 0 success, 2 invalid args / no install / missing manifest / malformed YAML.',
      '',
    ].join('\n'),
  );
}

/**
 * Resolve the base root the manifest path resolves against. Explicit
 * `--repo-root` wins; otherwise the nearest-enclosing installation (via the
 * shared boundary resolver — fails loud when none encloses the start dir).
 */
function resolveBaseRoot(opts: CliOptions): string {
  if (opts.repoRoot !== null) return resolve(opts.repoRoot);
  const boundary = resolveCodebaseBoundary({
    startDir: opts.at ?? process.cwd(),
    explicitRoot: opts.at,
  });
  return boundary.installationRoot;
}

/** Resolve the on-disk manifest path. Absolute paths honored; relatives resolve against the base root. */
function resolveManifestPath(opts: CliOptions, baseRoot: string): string {
  const raw =
    opts.manifestPath !== null ? opts.manifestPath : defaultManifestPath(opts.slug ?? '');
  return isAbsolute(raw) ? raw : resolve(baseRoot, raw);
}

export interface MainResult {
  readonly code: 0 | 2;
  readonly resolvedPath?: string;
}

/**
 * Programmatic entrypoint. Returns the result code + the resolved path
 * (when known) so tests can assert against the path without grepping stderr.
 */
export async function main(argv: readonly string[]): Promise<MainResult> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`scope-export: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  let path: string;
  try {
    path = resolveManifestPath(opts, resolveBaseRoot(opts));
  } catch (err) {
    process.stderr.write(`scope-export: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    process.stderr.write(
      `scope-export: failed to read manifest at ${path}: ${errorMessage(err)}\n`,
    );
    return { code: 2, resolvedPath: path };
  }
  if (!opts.quiet) {
    process.stderr.write(`scope-export: reading ${path}\n`);
  }
  if (opts.json) {
    let parsed: unknown;
    try {
      parsed = parseYaml(text);
    } catch (err) {
      process.stderr.write(
        `scope-export: failed to parse manifest YAML: ${errorMessage(err)}\n`,
      );
      return { code: 2, resolvedPath: path };
    }
    process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
  } else {
    process.stdout.write(text);
    if (!text.endsWith('\n')) process.stdout.write('\n');
  }
  return { code: 0, resolvedPath: path };
}
