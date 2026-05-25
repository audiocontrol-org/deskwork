/**
 * plugins/dw-lifecycle/src/scope-discovery/check-deprecations.ts
 *
 * Deprecation-driven scan SUBCOMMAND SURFACE — informational gate that
 * surfaces "this file is marked @deprecated; here are the importers
 * still holding it in place." When the importer count reaches zero, the
 * operator can safely delete the file in the next refactor commit.
 *
 * Status (v1): SUBCOMMAND SHELL ONLY. The underlying `deprecation-scan`
 * port from the audiocontrol pilot is tracked at
 * https://github.com/audiocontrol-org/deskwork/issues/287 and is NOT
 * shipped in this commit. Until that lands, this subcommand:
 *
 *   - validates its flags and prints help on `--help`,
 *   - reports an empty registry on stdout (no markers found, summary
 *     line cites 0 deprecated files, 0 blocked, 0 safe-to-delete),
 *   - exits 0 (informational gate; "0 markers" is not a failure).
 *
 * This mirrors the pattern-matrix empty-registry contract: an empty
 * registry is a healthy no-op, not a misconfiguration. The shell lets
 * operators wire the verb into their tooling NOW (skill prose,
 * documentation, hooks scaffold) without blocking on the full scan port.
 *
 * Exit codes:
 *   0   scan completed (always — gate is informational; non-zero importer
 *       count is NOT an error, it's a tracked status).
 *   2   invalid CLI args or scanner internal error.
 *
 * CLI:
 *   --write            (no-op until #287) write rendered markdown to
 *                       --artifact path. Accepted for symmetry with
 *                       check-editor-symmetry.
 *   --artifact <path>  (no-op until #287) artifact override.
 *   --root <path>      (no-op until #287) scan-root override.
 *   --quiet            suppress the empty-registry status line.
 *   --json             emit `{ "blocked": [], "safeToDelete": [], "deprecation_count": 0 }`.
 *   --help, -h         show help and exit 0.
 *
 * The flag surface mirrors the pilot so that when #287 lands the port can
 * back-fill the scan logic without changing the CLI contract.
 */

import { errorMessage } from './util/typeguards.js';

const DEFAULT_ARTIFACT = 'docs/scope-discovery/deprecation-queue.md';
const DEFAULT_ROOT = '.';
const EMPTY_REGISTRY_LINE =
  'check-deprecations: registry empty; nothing to scan. ' +
  '(deprecation-scan port pending — see ' +
  'https://github.com/audiocontrol-org/deskwork/issues/287)';

export interface CliOptions {
  readonly scanRoot: string;
  readonly writeArtifact: boolean;
  readonly artifactPath: string;
  readonly quiet: boolean;
  readonly json: boolean;
}

export function parseCli(argv: readonly string[]): CliOptions {
  let scanRoot = DEFAULT_ROOT;
  let writeArtifact = false;
  let artifactPath = DEFAULT_ARTIFACT;
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
  return { scanRoot, writeArtifact, artifactPath, quiet, json };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle check-deprecations [options]',
      '',
      'Informational gate: surfaces @deprecated files + remaining importers.',
      '',
      'Options:',
      '  --root <path>      Override scan root (default: cwd)',
      '  --write            Write the rendered markdown to --artifact path',
      `  --artifact <path>  Override artifact path (default: ${DEFAULT_ARTIFACT})`,
      '  --quiet            Suppress the empty-registry status line',
      '  --json             Emit JSON instead of human text',
      '  --help, -h         Show this help',
      '',
      'Status: subcommand shell. Full scan port tracked at',
      '  https://github.com/audiocontrol-org/deskwork/issues/287',
      '',
    ].join('\n'),
  );
}

/**
 * Programmatic entrypoint. Exported so tests can drive it without
 * spawning a subprocess. Until #287 lands this always reports an
 * empty registry; callers should treat exit 0 as "scan ran cleanly."
 */
export async function main(argv: readonly string[]): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`check-deprecations: ${errorMessage(err)}\n`);
    return 2;
  }
  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        blocked: [],
        safeToDelete: [],
        deprecation_count: 0,
        note:
          'deprecation-scan port pending; see ' +
          'https://github.com/audiocontrol-org/deskwork/issues/287',
      }) + '\n',
    );
    return 0;
  }
  if (!opts.quiet) {
    process.stdout.write(`${EMPTY_REGISTRY_LINE}\n`);
  }
  // --write + --artifact are accepted but no-op until #287 lands. Callers
  // wiring this into operator scripts NOW won't break when the full port
  // arrives — the contract widens from "no-op" to "write the markdown."
  void opts.writeArtifact;
  void opts.artifactPath;
  void opts.scanRoot;
  return 0;
}
