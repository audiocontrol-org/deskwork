import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  manifestPath as resolveManifestPath,
  readManifest,
  shimPathFor,
  type ManifestShimEntry,
} from '../shortcuts/manifest.js';
import { DriftError, isRefusalError } from '../shortcuts/errors.js';
import { shimBody } from '../shortcuts/shim-body.js';

/**
 * Maximum characters of an "actual" file body included in a drift
 * error message. Long bodies (an operator who replaced a shim with a
 * 200-line custom prompt) get truncated with `...` so the error fits
 * a terminal pane. The expected body is always one line and never
 * truncated.
 */
const DRIFT_ACTUAL_PREVIEW_LIMIT = 200;

export interface ParsedUninstallShortcutsArgs {
  forceUninstall: boolean;
  dryRun: boolean;
  help: boolean;
}

export interface UninstallShortcutsOptions {
  home: string;
  forceUninstall?: boolean;
  dryRun?: boolean;
}

export interface DriftReport {
  shimName: string;
  command: string;
  path: string;
  reason: 'missing' | 'modified';
  /** Present when reason === 'modified'. */
  expected?: string;
  /** Present when reason === 'modified'. */
  actual?: string;
}

export interface UninstallShortcutsResult {
  /** Absolute paths of shims actually deleted (or planned, on dry-run). */
  shimsRemoved: ReadonlyArray<string>;
  /** Shims listed in the manifest that were not on disk; never a failure. */
  missingShims: ReadonlyArray<DriftReport>;
  /** Shims listed in the manifest whose body had drifted; surfaced even on the force path. */
  driftedShims: ReadonlyArray<DriftReport>;
  /** True only if the manifest was actually deleted in this call. False on dry-run. */
  manifestRemoved: boolean;
  dryRun: boolean;
}

function printUninstallShortcutsUsage(): void {
  console.log(
    'Usage: dw-lifecycle uninstall-shortcuts [--force-uninstall] [--dry-run]',
  );
  console.log(
    'Removes the slash-command shims previously written by install-shortcuts.',
  );
  console.log(
    '  --force-uninstall  Remove shims even if their content has drifted from the canonical body.',
  );
  console.log(
    '  --dry-run          Print planned removals without touching the filesystem.',
  );
}

export function parseUninstallShortcutsArgs(
  args: string[],
): ParsedUninstallShortcutsArgs {
  let forceUninstall = false;
  let dryRun = false;
  let help = false;

  for (const arg of args) {
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--force-uninstall') {
      forceUninstall = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  return { forceUninstall, dryRun, help };
}

/**
 * Build a single `DriftReport` for one manifest entry by reading the
 * shim from disk and comparing it against the canonical body. Pure of
 * side effects; safe to call during dry-run. Returns `null` when the
 * shim matches the canonical body (no report needed).
 */
function inspectShim(
  home: string,
  entry: ManifestShimEntry,
): DriftReport | null {
  const path = shimPathFor(home, entry.shimName);
  if (!existsSync(path)) {
    return {
      shimName: entry.shimName,
      command: entry.command,
      path,
      reason: 'missing',
    };
  }

  const expected = shimBody(entry.command);
  let actual: string;
  try {
    actual = readFileSync(path, 'utf8');
  } catch (err) {
    // Permission errors / mid-flight unlinks are reported as drift
    // rather than crashing the whole uninstall; the operator still
    // gets the option to `--force-uninstall`.
    const reason = err instanceof Error ? err.message : String(err);
    return {
      shimName: entry.shimName,
      command: entry.command,
      path,
      reason: 'modified',
      expected,
      actual: `<read error: ${reason}>`,
    };
  }

  if (actual === expected) {
    return null;
  }
  return {
    shimName: entry.shimName,
    command: entry.command,
    path,
    reason: 'modified',
    expected,
    actual,
  };
}

function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + '...';
}

/**
 * Render a single drift-report field for terminal display: strip the
 * trailing newline, then escape any remaining internal `\n` as the
 * two-character literal `\n` so the rendered line stays single-row in
 * the operator's terminal. Applied to both `expected` and `actual` for
 * symmetry, even though the canonical body is single-line today —
 * defensive against future changes to `shimBody`.
 */
function escapeForDriftLine(value: string): string {
  return value.replace(/\n+$/, '').replace(/\n/g, '\\n');
}

function formatDriftMessage(drifts: ReadonlyArray<DriftReport>): string {
  const header =
    `Refusing to uninstall: ${drifts.length} shim file(s) have drifted from their original content.\n` +
    'Pass --force-uninstall to remove them anyway.\n';
  const body = drifts
    .map((d) => {
      const expectedLine = escapeForDriftLine(d.expected ?? '');
      const actualLine = truncate(
        escapeForDriftLine(d.actual ?? ''),
        DRIFT_ACTUAL_PREVIEW_LIMIT,
      );
      return (
        `  ${d.path}\n` +
        `    expected: ${expectedLine}\n` +
        `    actual:   ${actualLine}`
      );
    })
    .join('\n');
  return `${header}\n${body}`;
}

export function runUninstallShortcuts(
  options: UninstallShortcutsOptions,
): UninstallShortcutsResult {
  const manifestFile = resolveManifestPath(options.home);
  const dryRun = options.dryRun === true;
  const forceUninstall = options.forceUninstall === true;

  if (!existsSync(manifestFile)) {
    throw new Error(
      `No manifest found at ${manifestFile}; nothing to uninstall.`,
    );
  }

  // readManifest already throws actionable errors on missing /
  // malformed / wrong-schema; don't wrap.
  const manifest = readManifest(manifestFile);

  const missingShims: DriftReport[] = [];
  const driftedShims: DriftReport[] = [];
  const matchedPaths: string[] = [];

  for (const entry of manifest.shims) {
    const report = inspectShim(options.home, entry);
    if (report === null) {
      matchedPaths.push(shimPathFor(options.home, entry.shimName));
      continue;
    }
    if (report.reason === 'missing') {
      missingShims.push(report);
      continue;
    }
    driftedShims.push(report);
  }

  // Refusal-on-drift fires on BOTH the dry-run and the real path. The
  // dry-run's job is to preview the operator-visible outcome; if the
  // real run would refuse, the dry-run must surface the same refusal.
  if (driftedShims.length > 0 && !forceUninstall) {
    throw new DriftError(formatDriftMessage(driftedShims));
  }

  // Paths that will be deleted: every matched shim, plus every drifted
  // shim when --force-uninstall is set. Missing shims aren't included
  // (there's nothing to delete).
  const shimsToRemove: string[] = [...matchedPaths];
  if (forceUninstall) {
    for (const d of driftedShims) {
      shimsToRemove.push(d.path);
    }
  }

  if (dryRun) {
    return {
      shimsRemoved: shimsToRemove,
      missingShims,
      driftedShims,
      manifestRemoved: false,
      dryRun: true,
    };
  }

  // Real run: delete the shims, then the manifest. Manifest goes last
  // so a partial-failure-then-crash leaves the manifest as the
  // recovery breadcrumb (re-running the uninstall picks up where we
  // left off, since matched-and-already-removed shims surface as
  // missing-and-not-fatal on the second pass).
  for (const path of shimsToRemove) {
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
  }
  rmSync(manifestFile, { force: true });

  return {
    shimsRemoved: shimsToRemove,
    missingShims,
    driftedShims,
    manifestRemoved: true,
    dryRun: false,
  };
}

export async function uninstallShortcuts(args: string[]): Promise<void> {
  let parsed: ParsedUninstallShortcutsArgs;
  try {
    parsed = parseUninstallShortcutsArgs(args);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    process.exit(1);
    return;
  }

  if (parsed.help) {
    printUninstallShortcutsUsage();
    process.exit(0);
    return;
  }

  const home = homedir();
  const options: UninstallShortcutsOptions = {
    home,
    forceUninstall: parsed.forceUninstall,
    dryRun: parsed.dryRun,
  };

  let result: UninstallShortcutsResult;
  try {
    result = runUninstallShortcuts(options);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    // Refusal-class errors (drift) exit with code 2; every other
    // failure exits 1. Discriminating on `instanceof` keeps the
    // routing safe across message rephrasings.
    process.exit(isRefusalError(err) ? 2 : 1);
    return;
  }

  if (result.dryRun) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const path of result.shimsRemoved) {
    console.log(path);
  }
  console.log(
    `Removed ${result.shimsRemoved.length} shim(s) and manifest.`,
  );
  if (result.missingShims.length > 0) {
    console.log(
      `Note: ${result.missingShims.length} shim(s) in the manifest were already gone from disk.`,
    );
  }
  if (result.driftedShims.length > 0) {
    console.log(
      `Note: ${result.driftedShims.length} shim(s) were drifted and removed under --force-uninstall.`,
    );
  }
}
