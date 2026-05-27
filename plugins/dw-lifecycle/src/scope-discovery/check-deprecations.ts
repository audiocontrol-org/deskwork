/**
 * plugins/dw-lifecycle/src/scope-discovery/check-deprecations.ts
 *
 * Deprecation-driven scan SUBCOMMAND SURFACE. Walks the source tree
 * for file-level `@deprecated` JSDoc tags + inline `// DEPRECATED:`
 * markers, counts remaining importers per deprecated file, and emits a
 * status report split into:
 *
 *   - "blocked" (importers > 0 — deletion is blocked until every
 *     importer migrates; the report names every importer with
 *     file:line),
 *   - "safe-to-delete" (importers === 0 — the next refactor commit
 *     can remove the file).
 *
 * Two outputs:
 *
 *   - stdout (always, unless `--quiet`): the rendered markdown body +
 *     a summary line. The summary line + counts let an operator scan
 *     the terminal without parsing the markdown.
 *   - `.dw-lifecycle/scope-discovery/deprecation-queue.md` (only with
 *     `--write`): the operator-readable artifact committed to the
 *     repo. Mirrors `check-editor-symmetry --write`'s contract.
 *
 * Exit codes:
 *
 *   0   scan completed successfully (the gate is informational; a
 *       non-zero importer count is NOT an error — it's a tracked
 *       in-flight status).
 *   2   scanner internal / IO error.
 *
 * Note: this gate intentionally does NOT exit 1 when importers exist.
 * The other Phase 6 gates (anti-patterns, adopters, editor-symmetry)
 * DO block commits because they surface "you regressed the regime"
 * conditions. Deprecation is the dual — "someone marked this for
 * deletion; here's who's still holding it in place" — which is
 * information, not a regression to block. The operator drains the
 * queue when ready; the gate's job is to make "ready" observable.
 *
 * # DRY
 *
 * Re-uses the walker (`util/glob.ts`'s `listFilesMatching`) via
 * `deprecation-scan.ts`, mirrors the CLI shape of
 * `check-editor-symmetry.ts` for parity, and shares the `errorMessage`
 * type-guard from `util/typeguards.ts`. No copy-paste of subprocess /
 * glob / regex utilities.
 *
 * # Ports
 *
 * The scan logic + report rendering ported from the audiocontrol pilot
 * (`tools/scope-discovery/check-deprecations.ts` +
 * `deprecation-scan.ts` + `deprecation-report.ts`). Closes issue #287.
 * The pre-port shell at this path had a forward-compatible CLI surface
 * (flag names + exit codes) so adopter wiring didn't churn when this
 * port landed.
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

const DEFAULT_ROOT = '.';
const DEFAULT_MODULE_ROOT = 'src';

export interface CliOptions {
  readonly scanRoot: string;
  readonly moduleRoot: string;
  readonly writeArtifact: boolean;
  readonly artifactPath: string;
  readonly quiet: boolean;
  readonly json: boolean;
}

export function parseCli(argv: readonly string[]): CliOptions {
  let scanRoot = DEFAULT_ROOT;
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
        scanRoot = next;
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
  return { scanRoot, moduleRoot, writeArtifact, artifactPath, quiet, json };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle check-deprecations [options]',
      '',
      'Informational gate: surfaces @deprecated files + remaining importers.',
      '',
      'Options:',
      '  --root <path>         Override scan root (default: cwd)',
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
 */
export async function main(argv: readonly string[]): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`check-deprecations: ${errorMessage(err)}\n`);
    return 2;
  }
  let result: ScanResult;
  try {
    result = await scan({ scanRoot: opts.scanRoot, moduleRoot: opts.moduleRoot });
  } catch (err) {
    process.stderr.write(`check-deprecations: ${errorMessage(err)}\n`);
    return 2;
  }
  if (opts.writeArtifact) {
    try {
      const markdown = renderMarkdown(result);
      const dest = resolve(opts.scanRoot, opts.artifactPath);
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
