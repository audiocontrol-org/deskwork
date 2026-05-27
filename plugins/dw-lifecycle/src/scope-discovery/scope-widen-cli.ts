/**
 * plugins/dw-lifecycle/src/scope-discovery/scope-widen-cli.ts
 *
 * CLI parsing for the `scope-widen` subcommand. Extracted from
 * scope-widen.ts to keep the orchestration module under the 300-500
 * line cap.
 *
 * Owns:
 *   - `CliOptions` interface (the parsed-options contract).
 *   - `USAGE` banner.
 *   - `parseCli(argv)` — argv → CliOptions; throws on invalid input.
 *     Throws `Error('HELP')` when the operator passed --help/-h so
 *     the caller can route to stdout (vs the normal stderr).
 *
 * The contract is owned by SKILL.md (operator-facing) + scope-widen.ts
 * (the orchestrator); this module is the implementation side.
 */

import { isAbsolute, resolve } from 'node:path';

const FEATURE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const DEFAULT_MODULE_ROOT = 'src';

export interface CliOptions {
  readonly featureSlug: string;
  readonly complaint: string;
  readonly manifestPath: string;
  readonly prdPath: string;
  readonly repoRoot: string;
  readonly moduleRoot: string;
  readonly apply: boolean;
  readonly evidenceTrail: boolean;
  readonly quiet: boolean;
}

export const USAGE =
  'Usage: dw-lifecycle scope-widen "<complaint>" \\\n' +
  '    --slug <feature-slug> \\\n' +
  '    [--manifest <manifest-path>] \\\n' +
  '    [--prd-path <prd-path>] \\\n' +
  '    [--repo-root <repo-root>] \\\n' +
  '    [--module-root <module-root>] \\\n' +
  '    [--apply] \\\n' +
  '    [--evidence-trail on|off] \\\n' +
  '    [--quiet]\n' +
  '\n' +
  'Default behavior is dry-run (prints delta to stderr, exits 0 without\n' +
  'modifying the manifest). Pass --apply to merge the delta into the\n' +
  'existing manifest.\n';

const SCALAR_FLAGS: ReadonlySet<string> = new Set([
  '--slug',
  '--manifest',
  '--prd-path',
  '--repo-root',
  '--module-root',
  '--evidence-trail',
]);

/**
 * Argv parser. Throws on invalid input; the orchestrator catches and
 * surfaces the message + usage. Throws the sentinel `Error('HELP')`
 * when the operator passed --help/-h.
 */
export function parseCli(argv: ReadonlyArray<string>): CliOptions {
  const scalars = new Map<string, string>();
  const positionals: string[] = [];
  let apply = false;
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--help' || a === '-h') throw new Error('HELP');
    if (a === '--quiet') {
      quiet = true;
      continue;
    }
    if (a === '--apply') {
      apply = true;
      continue;
    }
    if (SCALAR_FLAGS.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      scalars.set(a, v);
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`unknown arg: ${a}`);
    }
    positionals.push(a);
  }
  if (positionals.length === 0) {
    throw new Error('a quoted complaint positional is required');
  }
  if (positionals.length > 1) {
    throw new Error(
      `expected exactly one complaint positional; got ${positionals.length} ` +
        '(quote the complaint to keep it as a single argument)',
    );
  }
  const complaintRaw = positionals[0];
  if (complaintRaw === undefined || complaintRaw.trim().length === 0) {
    throw new Error('complaint must be non-empty');
  }
  const slug = scalars.get('--slug');
  if (slug === undefined) throw new Error('--slug is required');
  if (!FEATURE_SLUG_REGEX.test(slug)) {
    throw new Error(
      `--slug '${slug}' is not a valid feature slug ` +
        '(must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ — lowercase alphanumeric ' +
        '+ dashes, no leading/trailing dash, min 2 chars)',
    );
  }
  const root = resolve(scalars.get('--repo-root') ?? process.cwd());
  const manifestRaw =
    scalars.get('--manifest') ??
    `docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`;
  const manifestPath = isAbsolute(manifestRaw)
    ? manifestRaw
    : resolve(root, manifestRaw);
  const prdRaw =
    scalars.get('--prd-path') ?? `docs/1.0/001-IN-PROGRESS/${slug}/prd.md`;
  const prdPath = isAbsolute(prdRaw) ? prdRaw : resolve(root, prdRaw);
  const evidenceFlag = scalars.get('--evidence-trail') ?? 'on';
  if (evidenceFlag !== 'on' && evidenceFlag !== 'off') {
    throw new Error(`--evidence-trail must be 'on' or 'off' (got '${evidenceFlag}')`);
  }
  return {
    featureSlug: slug,
    complaint: complaintRaw,
    manifestPath,
    prdPath,
    repoRoot: root,
    moduleRoot: scalars.get('--module-root') ?? DEFAULT_MODULE_ROOT,
    apply,
    evidenceTrail: evidenceFlag === 'on',
    quiet,
  };
}
