/**
 * plugins/stack-control/src/scope-discovery/check-module-symmetry.ts
 *
 * Cross-module symmetry gate (010 / US4). Reads
 * `<installation>/.stack-control/scope-discovery/adopter-manifests.yaml`
 * (the same registry `check-adopters` consumes) and produces a fleet
 * matrix: rows = adopter-manifest conventions, columns = parallel
 * top-level modules under the configured module-root.
 *
 * Per-codebase (010 / US4): with no `--registry`/`--root` override the
 * registry + scan root resolve against the nearest-enclosing
 * stack-control installation (009's walk-up), so the matrix is scoped to
 * the codebase it is run inside — never the whole repo, never a stale
 * `.dw-lifecycle` path. Overrides still win, resolved relative to the
 * installation root.
 *
 * # Outputs
 *
 *   - stdout (always): the rendered markdown table, suitable for
 *     piping into a markdown renderer or scanning in a terminal.
 *   - `<installation>/.stack-control/scope-discovery/editor-symmetry.md`
 *     (only with `--write`): the committed operator-readable artifact.
 *     The on-disk filename retains the `editor-symmetry` suffix — that's
 *     wire-format and travels on its own deprecation arc.
 *
 * # Exit codes
 *
 *   0   empty registry OR matrix has no ⚠ / ✗ cells.
 *   1   at least one cell is ⚠ (partial adoption) or ✗ (missing).
 *   2   infra / parse / IO error.
 *
 * # DRY
 *
 * Re-uses `computeMatrix` from `module-symmetry-matrix.ts` and the
 * renderer from `module-symmetry-report.ts`; the registry parser +
 * glob walker + import detection are inherited via the adopter-manifests
 * extraction. No duplicated YAML loading, no duplicated glob walk,
 * no duplicated import regex.
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMatrix, type SymmetryMatrix } from './module-symmetry-matrix.js';
import {
  ARTIFACT_PATH,
  renderMatrix,
  tallyStatuses,
} from './module-symmetry-report.js';
import { errorMessage } from './util/typeguards.js';
import { resolveCheckScope } from './check-scope.js';

const DEFAULT_REGISTRY_NAME = 'adopter-manifests.yaml';
const DEFAULT_MODULE_ROOT = 'src';

export interface CliOptions {
  /** `--registry` override (relative to installation root); null = per-codebase default. */
  readonly registryOverride: string | null;
  /** `--root` override (scan boundary + root verbatim); null = the installation root. */
  readonly rootOverride: string | null;
  readonly moduleRoot: string;
  readonly writeArtifact: boolean;
  readonly artifactPath: string;
  readonly quiet: boolean;
}

export function parseCli(argv: readonly string[]): CliOptions {
  let registryOverride: string | null = null;
  let rootOverride: string | null = null;
  let moduleRoot = DEFAULT_MODULE_ROOT;
  let writeArtifact = false;
  let artifactPath = ARTIFACT_PATH;
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--registry': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--registry requires a path argument');
        registryOverride = next;
        i += 1;
        break;
      }
      case '--root': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--root requires a path argument');
        rootOverride = next;
        i += 1;
        break;
      }
      case '--module-root': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--module-root requires a path argument');
        moduleRoot = next;
        i += 1;
        break;
      }
      case '--write':
        writeArtifact = true;
        break;
      case '--artifact': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--artifact requires a path argument');
        artifactPath = next;
        i += 1;
        break;
      }
      case '--quiet':
        quiet = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return {
    registryOverride,
    rootOverride,
    moduleRoot,
    writeArtifact,
    artifactPath,
    quiet,
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      'stackctl check-module-symmetry [options]',
      '',
      'Options:',
      '  --registry <path>     Override registry path (default: <installation>/.stack-control/scope-discovery/adopter-manifests.yaml)',
      '  --root <path>         Override scan root (default: the enclosing stack-control installation)',
      `  --module-root <path>  Override module-root (default: ${DEFAULT_MODULE_ROOT})`,
      '  --write               Write the rendered matrix to --artifact path',
      `  --artifact <path>     Override artifact path (default: ${ARTIFACT_PATH})`,
      '  --quiet               Suppress matrix output on stdout; summary line only',
      '  --help, -h            Show this help',
      '',
    ].join('\n'),
  );
}

export async function main(
  argv: readonly string[],
  cwd: string = process.cwd(),
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`module-symmetry: ${errorMessage(err)}\n`);
    return 2;
  }
  let matrix: SymmetryMatrix;
  let scanRoot: string;
  try {
    const scope = resolveCheckScope({
      startDir: cwd,
      defaultRegistryName: DEFAULT_REGISTRY_NAME,
      registryOverride: opts.registryOverride,
      rootOverride: opts.rootOverride,
    });
    scanRoot = scope.scanRoot;
    // Config-activated (FR-019 / SC-008): an ABSENT default registry is a
    // clean no-op — an empty matrix (zero rows), which the renderer + summary
    // already treat as "registry empty; nothing to check." (An explicit
    // `--registry` to a missing path still fails loud below.)
    if (!scope.registryExists && scope.registryIsDefault) {
      matrix = {
        modules: [],
        rows: [],
        filesVisited: 0,
        moduleRoot: opts.moduleRoot,
      };
    } else {
      matrix = await computeMatrix({
        registryPath: scope.registryPath,
        scanRoot: scope.scanRoot,
        moduleRoot: opts.moduleRoot,
      });
    }
  } catch (err) {
    process.stderr.write(`module-symmetry: ${errorMessage(err)}\n`);
    return 2;
  }
  const rendered = renderMatrix(matrix);
  if (opts.writeArtifact) {
    try {
      const dest = resolve(scanRoot, opts.artifactPath);
      await writeFile(dest, rendered, 'utf8');
    } catch (err) {
      process.stderr.write(`module-symmetry: write artifact failed: ${errorMessage(err)}\n`);
      return 2;
    }
  }
  const totals = tallyStatuses(matrix);
  if (!opts.quiet) {
    process.stdout.write(rendered);
  }
  const summary = formatSummary(matrix, totals);
  process.stdout.write(summary + '\n');
  if (matrix.rows.length === 0) return 0;
  return totals.partial + totals.missing === 0 ? 0 : 1;
}

function formatSummary(
  matrix: SymmetryMatrix,
  totals: Record<string, number>,
): string {
  if (matrix.rows.length === 0) {
    return 'module-symmetry: registry empty; nothing to check.';
  }
  const cellCount = matrix.rows.length * matrix.modules.length;
  return (
    `module-symmetry: ${matrix.rows.length} convention(s) x ${matrix.modules.length} module(s) ` +
    `= ${cellCount} cells; ` +
    `${totals['ok']} ✓, ${totals['partial']} ⚠, ${totals['missing']} ✗, ${totals['tracked']} ⏳, ${totals['na']} —.`
  );
}

function isCliEntryPoint(): boolean {
  if (typeof process === 'undefined' || process.argv.length < 2) return false;
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  return invoked === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`module-symmetry: fatal: ${errorMessage(err)}\n`);
      process.exit(2);
    },
  );
}
