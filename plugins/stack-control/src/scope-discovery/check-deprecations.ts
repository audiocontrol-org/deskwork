/**
 * plugins/stack-control/src/scope-discovery/check-deprecations.ts
 *
 * Deprecation-driven scan SUBCOMMAND SURFACE (010 / US4). Walks the
 * source tree for file-level `@deprecated` JSDoc tags + inline
 * `// DEPRECATED:` markers, counts remaining importers per deprecated
 * file, and emits a status report split into:
 *
 *   - "blocked" (importers > 0 — deletion is blocked until every
 *     importer migrates; the report names every importer with
 *     file:line),
 *   - "safe-to-delete" (importers === 0 — the next refactor commit
 *     can remove the file).
 *
 * Per-codebase (010 / US4): with no `--root` override the scan root
 * resolves to the nearest-enclosing stack-control installation (009's
 * walk-up), so the scan is scoped to the codebase it is run inside —
 * never the whole repo. The `--root` override still wins.
 *
 * Two outputs:
 *
 *   - stdout (always, unless `--quiet`): the rendered markdown body +
 *     a summary line. The summary line + counts let an operator scan
 *     the terminal without parsing the markdown.
 *   - `<installation>/.stack-control/scope-discovery/deprecation-queue.md`
 *     (only with `--write`): the operator-readable artifact committed
 *     to the repo. Mirrors `check-module-symmetry --write`'s contract.
 *
 * Exit codes:
 *
 *   0   scan completed successfully (the gate is informational; a
 *       non-zero importer count is NOT an error — it's a tracked
 *       in-flight status).
 *   2   scanner internal / IO error.
 *
 * Note: this gate intentionally does NOT exit 1 when importers exist.
 * The other registry-driven gates (anti-patterns, adopters,
 * module-symmetry) DO block commits because they surface "you regressed
 * the regime" conditions. Deprecation is the dual — "someone marked this
 * for deletion; here's who's still holding it in place" — which is
 * information, not a regression to block. The operator drains the queue
 * when ready; the gate's job is to make "ready" observable.
 *
 * # DRY
 *
 * Re-uses the walker (`util/glob.ts`'s `listFilesMatching`) via
 * `deprecation-scan.ts`, mirrors the CLI shape of
 * `check-module-symmetry.ts` for parity, and shares the `errorMessage`
 * type-guard from `util/typeguards.ts`. No copy-paste of subprocess /
 * glob / regex utilities.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, type ScanResult } from './deprecation-scan.js';
import {
  ARTIFACT_PATH,
  renderJson,
  renderMarkdown,
  summaryLine,
} from './deprecation-report.js';
import { errorMessage } from './util/typeguards.js';
import { resolveCodebaseBoundary } from './codebase-boundary.js';

const DEFAULT_MODULE_ROOT = 'src';

export interface CliOptions {
  /** `--root` override (scan boundary + root verbatim); null = the installation root. */
  readonly rootOverride: string | null;
  readonly moduleRoot: string;
  readonly writeArtifact: boolean;
  readonly artifactPath: string;
  readonly quiet: boolean;
  readonly json: boolean;
}

export function parseCli(argv: readonly string[]): CliOptions {
  let rootOverride: string | null = null;
  let moduleRoot = DEFAULT_MODULE_ROOT;
  let writeArtifact = false;
  let artifactPath = ARTIFACT_PATH;
  let quiet = false;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
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
      case '--json':
        json = true;
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
  return { rootOverride, moduleRoot, writeArtifact, artifactPath, quiet, json };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl check-deprecations [options]',
      '',
      'Informational gate: surfaces @deprecated files + remaining importers.',
      '',
      'Options:',
      '  --root <path>         Override scan root (default: the enclosing stack-control installation)',
      `  --module-root <path>  Module root for the @/ alias (default: ${DEFAULT_MODULE_ROOT})`,
      '  --write               Write the rendered markdown to --artifact path',
      `  --artifact <path>     Override artifact path (default: ${ARTIFACT_PATH})`,
      '  --quiet               Suppress markdown body on stdout; summary line only',
      '  --json                Emit JSON to stdout instead of the markdown body',
      '  --help, -h            Show this help',
      '',
      'Exit codes: 0 success (gate is informational); 2 args / I/O error.',
      '',
    ].join('\n'),
  );
}

/**
 * Programmatic entrypoint. Exported so tests can drive it without
 * spawning a subprocess. Returns the numeric exit code; the subcommand
 * shim forwards it via `process.exit`.
 *
 * `cwd` is injectable for tests/integration; defaults to `process.cwd()`.
 */
export async function main(
  argv: readonly string[],
  cwd: string = process.cwd(),
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`check-deprecations: ${errorMessage(err)}\n`);
    return 2;
  }
  let result: ScanResult;
  let scanRoot: string;
  try {
    // Resolve the scan root per-codebase: with no --root override, the
    // nearest-enclosing stack-control installation (009 walk-up). Fails
    // loud when cwd is not inside an installation (no whole-repo fallback).
    const boundary = resolveCodebaseBoundary({
      startDir: cwd,
      explicitRoot: opts.rootOverride,
    });
    scanRoot = boundary.installationRoot;
    result = await scan({ scanRoot, moduleRoot: opts.moduleRoot });
  } catch (err) {
    process.stderr.write(`check-deprecations: ${errorMessage(err)}\n`);
    return 2;
  }
  if (opts.writeArtifact) {
    try {
      const markdown = renderMarkdown(result);
      const dest = resolve(scanRoot, opts.artifactPath);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, markdown, 'utf8');
    } catch (err) {
      process.stderr.write(
        `check-deprecations: write artifact failed: ${errorMessage(err)}\n`,
      );
      return 2;
    }
  }
  if (opts.json) {
    // JSON mode: stdout is pure JSON so downstream tools (jq, etc.)
    // can consume it. The summary line + markdown body go nowhere
    // — the JSON object carries the same counts.
    process.stdout.write(renderJson(result) + '\n');
    return 0;
  }
  if (!opts.quiet) {
    process.stdout.write(renderMarkdown(result));
  }
  process.stdout.write(summaryLine(result) + '\n');
  return 0;
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
      process.stderr.write(`check-deprecations: fatal: ${errorMessage(err)}\n`);
      process.exit(2);
    },
  );
}
