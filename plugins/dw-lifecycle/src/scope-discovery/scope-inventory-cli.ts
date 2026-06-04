/**
 * plugins/dw-lifecycle/src/scope-discovery/scope-inventory-cli.ts
 *
 * CLI parser + USAGE string extracted from `scope-inventory.ts` so the
 * library entry stays under the 300–500 line cap after the the orchestrator loop
 * Task 7 LLM-ensemble integration. The split is mechanical (no
 * semantic change) — `parseCli` + `USAGE` + the `CliOptions` interface
 * + the slug regex / default module-root constants live here; the
 * orchestrator (`scopeInventoryMain`) imports them.
 */

import { isAbsolute, resolve } from 'node:path';

export const FEATURE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export const DEFAULT_MODULE_ROOT = 'src';

export interface CliOptions {
  readonly featureSlug: string;
  readonly prdPath: string;
  readonly outPath: string;
  readonly repoRoot: string;
  readonly moduleRoot: string;
  readonly evidenceTrail: boolean;
  readonly quiet: boolean;
  // Phase 25 Task 5 rename: was `editorSymmetryOut`. The CLI surface
  // still accepts `--editor-symmetry-out` as a back-compat alias (one
  // release cycle; removal target v0.37.0) — same shape as the verb
  // alias landed in Phase 25 Task 5.
  readonly moduleSymmetryOut: string | null;
  /**
   * LLM ensemble opt-out flags. Default behavior is
   * "engage the audit-log read at the start of the run + fire the
   * external auditor at the end of the run." Operators set these
   * flags to silence the integration without removing scope-discovery
   * itself.
   */
  readonly noAuditRead: boolean;
  readonly noAuditFire: boolean;
  /**
   * TF-016 (dogfood) — when true, the orchestrator does NOT emit the
   * "zero modules detected" advisory on stderr. The modules array can
   * still be empty (the schema relaxation in TF-016a permits this);
   * the flag only silences the per-run note for adopters who already
   * understand their repo doesn't use a `<module-root>/<feature-slug>/`
   * layout. Default false preserves the advisory for new adopters.
   */
  readonly noRequireModules: boolean;
}

export const USAGE =
  'Usage: dw-lifecycle scope-inventory \\\n' +
  '    --slug <feature-slug> \\\n' +
  '    [--out <manifest-path>] \\\n' +
  '    [--prd-path <prd-path>] \\\n' +
  '    [--repo-root <repo-root>] \\\n' +
  '    [--module-root <module-root>] \\\n' +
  '    [--evidence-trail on|off] \\\n' +
  '    [--module-symmetry-out <path>] \\\n' +
  '    [--no-audit-read] [--no-audit-fire] \\\n' +
  '    [--no-require-modules] \\\n' +
  '    [--quiet]\n';

export function parseCli(argv: ReadonlyArray<string>): CliOptions {
  const scalars = new Map<string, string>();
  const SCALAR_FLAGS = new Set([
    '--slug',
    '--out',
    '--prd-path',
    '--repo-root',
    '--module-root',
    '--evidence-trail',
    // `--module-symmetry-out` is the Phase 25 Task 5 canonical name;
    // `--editor-symmetry-out` stays as a deprecation-warning alias for
    // one release cycle (removal target v0.37.0).
    '--module-symmetry-out',
    '--editor-symmetry-out',
  ]);
  let quiet = false;
  let noAuditRead = false;
  let noAuditFire = false;
  let noRequireModules = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') throw new Error('HELP');
    if (a === '--quiet') {
      quiet = true;
      continue;
    }
    if (a === '--no-audit-read') {
      noAuditRead = true;
      continue;
    }
    if (a === '--no-audit-fire') {
      noAuditFire = true;
      continue;
    }
    if (a === '--no-require-modules') {
      noRequireModules = true;
      continue;
    }
    if (a !== undefined && SCALAR_FLAGS.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      scalars.set(a, v);
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
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
  const prdPathRaw =
    scalars.get('--prd-path') ?? `docs/1.0/001-IN-PROGRESS/${slug}/prd.md`;
  const prdPath = isAbsolute(prdPathRaw) ? prdPathRaw : resolve(root, prdPathRaw);
  const outPathRaw =
    scalars.get('--out') ?? `docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`;
  const outPath = isAbsolute(outPathRaw) ? outPathRaw : resolve(root, outPathRaw);
  const evidenceFlag = scalars.get('--evidence-trail') ?? 'on';
  if (evidenceFlag !== 'on' && evidenceFlag !== 'off') {
    throw new Error(`--evidence-trail must be 'on' or 'off' (got '${evidenceFlag}')`);
  }
  // Resolve `--module-symmetry-out` (canonical) and fall back to the
  // legacy `--editor-symmetry-out` alias. When the alias is used, emit
  // a one-line deprecation note on stderr naming the canonical flag +
  // the removal target — same shape as the subcommand alias landed in
  // Phase 25 Task 5.
  const moduleSymmetryOutRaw = scalars.get('--module-symmetry-out');
  const editorSymmetryOutRaw = scalars.get('--editor-symmetry-out');
  if (moduleSymmetryOutRaw === undefined && editorSymmetryOutRaw !== undefined) {
    process.stderr.write(
      'scope-inventory: `--editor-symmetry-out` is deprecated; ' +
        'use `--module-symmetry-out`. Removal target: v0.37.0.\n',
    );
  }
  const symmetryOutRaw = moduleSymmetryOutRaw ?? editorSymmetryOutRaw;
  const moduleSymmetryOut =
    symmetryOutRaw === undefined
      ? null
      : isAbsolute(symmetryOutRaw)
        ? symmetryOutRaw
        : resolve(root, symmetryOutRaw);
  return {
    featureSlug: slug,
    prdPath,
    outPath,
    repoRoot: root,
    moduleRoot: scalars.get('--module-root') ?? DEFAULT_MODULE_ROOT,
    evidenceTrail: evidenceFlag === 'on',
    quiet,
    moduleSymmetryOut,
    noAuditRead,
    noAuditFire,
    noRequireModules,
  };
}
