/**
 * plugins/dw-lifecycle/src/scope-discovery/scope-export.ts
 *
 * Read a previously-produced `scope-manifest.yaml` and emit it to stdout
 * verbatim (YAML) or re-serialized as JSON. Companion to
 * `scope-inventory` — that subcommand WRITES the manifest, this one
 * READS it for downstream consumers (skill prose, CI pipelines,
 * operator scripts) that don't want to know the on-disk path.
 *
 * Path resolution:
 *   - default: docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml
 *     (matches the `scope-inventory` default output path).
 *   - `--manifest <path>` overrides the resolved path entirely; --slug
 *     is no longer required when --manifest is set explicitly.
 *
 * Output:
 *   - default: emit the file's raw text on stdout (preserves comments,
 *     ordering, whitespace — the manifest is a human-readable artifact
 *     and round-tripping through YAML.parse + stringify would lose
 *     formatting).
 *   - `--json`: parse the YAML and re-emit as JSON.
 *
 * Exit codes:
 *   0   manifest read + emitted successfully.
 *   2   invalid CLI args, missing manifest, or malformed YAML (when
 *       --json was requested and parsing fails).
 *
 * CLI:
 *   --slug <slug>      Resolve the default manifest path from the slug.
 *                       Required unless --manifest is set.
 *   --manifest <path>  Override the manifest path explicitly.
 *   --repo-root <path> Override the repo root (default: cwd). Manifest
 *                       paths relative to repo root resolve against this.
 *   --json             Emit parsed JSON instead of raw YAML.
 *   --quiet            Suppress informational stderr (status line that
 *                       reports which path was resolved before emission).
 *   --help, -h         Show help.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { errorMessage } from './util/typeguards.js';

const FEATURE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function defaultManifestPath(slug: string): string {
  return `docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`;
}

interface CliOptions {
  readonly slug: string | null;
  readonly manifestPath: string | null;
  readonly repoRoot: string;
  readonly json: boolean;
  readonly quiet: boolean;
}

function parseCli(argv: readonly string[]): CliOptions {
  let slug: string | null = null;
  let manifestPath: string | null = null;
  let repoRoot = process.cwd();
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
  return { slug, manifestPath, repoRoot, json, quiet };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle scope-export [options]',
      '',
      'Emit a previously-produced scope-manifest.yaml to stdout.',
      '',
      'Options:',
      '  --slug <slug>      Feature slug; default manifest path resolves',
      '                      to docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml.',
      '  --manifest <path>  Override manifest path explicitly.',
      '  --repo-root <path> Override repo root (default: cwd).',
      '  --json             Emit parsed JSON instead of raw YAML.',
      '  --quiet            Suppress informational stderr.',
      '  --help, -h         Show this help.',
      '',
      'Exit codes: 0 success, 2 invalid args / missing manifest / malformed YAML.',
      '',
    ].join('\n'),
  );
}

/**
 * Resolve the on-disk manifest path. Absolute paths are honored;
 * relative paths resolve against `repoRoot`.
 */
function resolveManifestPath(opts: CliOptions): string {
  const raw =
    opts.manifestPath !== null
      ? opts.manifestPath
      : defaultManifestPath(opts.slug ?? '');
  return isAbsolute(raw) ? raw : resolve(opts.repoRoot, raw);
}

export interface MainResult {
  readonly code: 0 | 2;
  readonly resolvedPath?: string;
}

/**
 * Programmatic entrypoint. Returns the result code + the resolved path
 * (when known) so tests can assert against the path without grepping
 * stderr.
 */
export async function main(argv: readonly string[]): Promise<MainResult> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`scope-export: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  const path = resolveManifestPath(opts);
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
