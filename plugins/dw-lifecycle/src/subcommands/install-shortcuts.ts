import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getScheme,
  isSchemeId,
  SCHEME_IDS,
  type SchemeId,
  type SchemeMapping,
} from '../shortcuts/schemes.js';
import {
  manifestPath as resolveManifestPath,
  readManifest,
  writeManifest,
  MANIFEST_SCHEMA_VERSION,
  type ManifestShimEntry,
  type ShortcutsManifest,
} from '../shortcuts/manifest.js';

const RENAME_PATTERN = /^[a-z0-9-]+$/;

export interface ParsedInstallShortcutsArgs {
  scheme?: SchemeId;
  force: boolean;
  dryRun: boolean;
  rename?: string;
  replace: boolean;
  help: boolean;
}

export interface InstallShortcutsOptions {
  home: string;
  scheme: SchemeId;
  force?: boolean;
  dryRun?: boolean;
  rename?: string;
  replace?: boolean;
  pluginVersion: string;
}

export interface InstallShortcutsResult {
  scheme: SchemeId;
  shimsWritten: ReadonlyArray<string>;
  manifestPath: string;
  collisions: ReadonlyArray<string>;
  dryRun: boolean;
}

function printInstallShortcutsUsage(): void {
  console.log(
    'Usage: dw-lifecycle install-shortcuts --scheme=<A|B|C> [--force] [--dry-run] [--rename <prefix>] [--replace]',
  );
  console.log(
    'Writes user-level slash-command shims at ~/.claude/commands/<shim>.md plus a manifest.',
  );
  console.log('  --scheme <A|B|C>   Required. Selects the naming scheme for shims.');
  console.log(
    '  --force            Overwrite foreign shim files at colliding paths.',
  );
  console.log('  --dry-run          Print intended writes without touching the filesystem.');
  console.log(
    '  --rename <prefix>  Replace the scheme default prefix (dw / dw-) with <prefix>.',
  );
  console.log(
    '  --replace          Uninstall a prior deskwork-managed install before installing.',
  );
}

function parseSchemeValue(value: string): SchemeId {
  if (!isSchemeId(value)) {
    throw new Error(
      `Invalid scheme: ${value} (expected one of: ${SCHEME_IDS.join(', ')})`,
    );
  }
  return value;
}

export function parseInstallShortcutsArgs(
  args: string[],
): ParsedInstallShortcutsArgs {
  let scheme: SchemeId | undefined;
  let force = false;
  let dryRun = false;
  let rename: string | undefined;
  let replace = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--replace') {
      replace = true;
      continue;
    }
    if (arg === '--scheme') {
      const next = args[++i];
      if (next === undefined) {
        throw new Error('Missing value for --scheme');
      }
      scheme = parseSchemeValue(next);
      continue;
    }
    if (arg.startsWith('--scheme=')) {
      scheme = parseSchemeValue(arg.slice('--scheme='.length));
      continue;
    }
    if (arg === '--rename') {
      const next = args[++i];
      if (next === undefined) {
        throw new Error('Missing value for --rename');
      }
      rename = next;
      continue;
    }
    if (arg.startsWith('--rename=')) {
      rename = arg.slice('--rename='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  // Help short-circuits scheme validation in dispatch.
  if (!help && !scheme) {
    throw new Error(
      'Missing required --scheme=<A|B|C>. See --help for usage.',
    );
  }

  const result: ParsedInstallShortcutsArgs = {
    force,
    dryRun,
    replace,
    help,
  };
  if (scheme !== undefined) {
    result.scheme = scheme;
  }
  if (rename !== undefined) {
    result.rename = rename;
  }
  return result;
}

function validateRename(rename: string): void {
  if (rename.length === 0) {
    throw new Error('Invalid --rename: prefix must be non-empty.');
  }
  if (!RENAME_PATTERN.test(rename)) {
    throw new Error(
      `Invalid --rename: ${JSON.stringify(rename)} (must match [a-z0-9-]+; no uppercase, no path separators).`,
    );
  }
}

/**
 * Compute the on-disk shim name after applying an optional rename.
 *
 * Scheme A uses the `dw` prefix (no hyphen): `dwi`, `dws`, `dwsh`, ...
 * Schemes B and C use the `dw-` prefix: `dw-im`, `dw-implement`, ...
 *
 * The rename replaces the leading prefix while preserving the rest of
 * the shim name. We detect the prefix from the shim string directly
 * rather than threading scheme information through — both prefixes are
 * unambiguously identifiable from the shim itself.
 */
export function applyRename(shim: string, rename: string | undefined): string {
  if (rename === undefined) return shim;
  if (shim.startsWith('dw-')) {
    return `${rename}-${shim.slice('dw-'.length)}`;
  }
  if (shim.startsWith('dw')) {
    return `${rename}${shim.slice('dw'.length)}`;
  }
  throw new Error(
    `applyRename: shim ${JSON.stringify(shim)} does not start with the expected dw / dw- prefix.`,
  );
}

function shimBody(command: string): string {
  return `/dw-lifecycle:${command} $ARGUMENTS\n`;
}

function plannedShimEntries(
  scheme: SchemeMapping,
  rename: string | undefined,
  commandsDir: string,
): ReadonlyArray<ManifestShimEntry> {
  return scheme.entries().map(([command, baseShim]) => {
    const shimName = applyRename(baseShim, rename);
    return {
      command,
      shimName,
      path: join(commandsDir, `${shimName}.md`),
    };
  });
}

function uninstallPriorManifest(manifestFile: string): void {
  const prior = readManifest(manifestFile);
  for (const entry of prior.shims) {
    if (existsSync(entry.path)) {
      rmSync(entry.path, { force: true });
    }
  }
  rmSync(manifestFile, { force: true });
}

export function runInstallShortcuts(
  options: InstallShortcutsOptions,
): InstallShortcutsResult {
  if (options.rename !== undefined) {
    validateRename(options.rename);
  }

  const scheme = getScheme(options.scheme);
  const commandsDir = join(options.home, '.claude', 'commands');
  const manifestFile = resolveManifestPath(options.home);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const replace = options.replace === true;

  const planned = plannedShimEntries(scheme, options.rename, commandsDir);

  // Prior-manifest handling. If a manifest exists, --replace must be set;
  // otherwise the call refuses. With --replace, the prior install is
  // unwound in a real run (dry-run leaves it alone but still reports the
  // intent via the planned writes).
  const priorManifestExists = existsSync(manifestFile);
  if (priorManifestExists && !replace) {
    throw new Error(
      `Prior deskwork shortcuts manifest exists at ${manifestFile}. ` +
        `Pass --replace to uninstall the prior install before installing the new scheme.`,
    );
  }

  // After --replace cleanup (or no prior manifest), detect foreign-file
  // collisions. A foreign file is any planned shim path that already
  // exists on disk and is NOT going to be removed by the prior-manifest
  // cleanup. In dry-run we approximate by ignoring files that are in the
  // prior manifest's shim set.
  const priorPaths = new Set<string>();
  if (priorManifestExists && replace) {
    const prior = readManifest(manifestFile);
    for (const entry of prior.shims) {
      priorPaths.add(entry.path);
    }
  }

  const collisions: string[] = [];
  for (const entry of planned) {
    if (priorPaths.has(entry.path)) continue;
    if (existsSync(entry.path)) {
      collisions.push(entry.path);
    }
  }

  if (collisions.length > 0 && !force) {
    const list = collisions.map((p) => `  - ${p}`).join('\n');
    throw new Error(
      `Refusing to overwrite ${collisions.length} foreign file(s) at planned shim paths (collision):\n${list}\n` +
        `Pass --force to overwrite, or move the foreign files aside.`,
    );
  }

  if (dryRun) {
    return {
      scheme: options.scheme,
      shimsWritten: planned.map((p) => p.path),
      manifestPath: manifestFile,
      collisions,
      dryRun: true,
    };
  }

  // Real run: unwind prior install first.
  if (priorManifestExists && replace) {
    uninstallPriorManifest(manifestFile);
  }

  mkdirSync(commandsDir, { recursive: true });

  for (const entry of planned) {
    writeFileSync(entry.path, shimBody(entry.command), 'utf8');
  }

  const manifest: ShortcutsManifest = {
    version: MANIFEST_SCHEMA_VERSION,
    scheme: options.scheme,
    rename: options.rename ?? null,
    pluginVersion: options.pluginVersion,
    shims: planned,
  };
  writeManifest(manifestFile, manifest);

  return {
    scheme: options.scheme,
    shimsWritten: planned.map((p) => p.path),
    manifestPath: manifestFile,
    collisions,
    dryRun: false,
  };
}

interface PackageJsonShape {
  version: string;
}

function isPackageJsonShape(value: unknown): value is PackageJsonShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).version === 'string'
  );
}

/**
 * Read the dw-lifecycle plugin version from the workspace package.json.
 * The path is resolved relative to the compiled module location, which
 * keeps the lookup correct whether we're running from dist/ (one level
 * down from the package root) or via tsx from src/subcommands/ (two
 * levels down). Both resolve via `../../package.json`.
 */
function readPluginVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isPackageJsonShape(parsed)) {
    throw new Error(
      `Could not read plugin version from ${pkgPath}: missing or non-string "version" field.`,
    );
  }
  return parsed.version;
}

export async function installShortcuts(args: string[]): Promise<void> {
  let parsed: ParsedInstallShortcutsArgs;
  try {
    parsed = parseInstallShortcutsArgs(args);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    process.exit(1);
    return;
  }

  if (parsed.help) {
    printInstallShortcutsUsage();
    process.exit(0);
    return;
  }

  if (parsed.scheme === undefined) {
    // parseInstallShortcutsArgs guarantees this is set when help is false,
    // but the type system can't see across that branch — guard explicitly
    // rather than reaching for a non-null assertion.
    console.error('Missing required --scheme=<A|B|C>.');
    process.exit(1);
    return;
  }

  const home = homedir();
  const pluginVersion = readPluginVersion();

  const options: InstallShortcutsOptions = {
    home,
    scheme: parsed.scheme,
    force: parsed.force,
    dryRun: parsed.dryRun,
    replace: parsed.replace,
    pluginVersion,
  };
  if (parsed.rename !== undefined) {
    options.rename = parsed.rename;
  }

  let result: InstallShortcutsResult;
  try {
    result = runInstallShortcuts(options);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    // Exit code 2 signals a collision / refusal per the workplan spec;
    // other failures (invalid rename, etc.) also surface here. Distinguish
    // collisions by inspecting the message.
    const isCollision =
      reason.toLowerCase().includes('collision') ||
      reason.toLowerCase().includes('prior deskwork shortcuts manifest');
    process.exit(isCollision ? 2 : 1);
    return;
  }

  if (result.dryRun) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `Installed ${result.shimsWritten.length} shortcuts (scheme ${result.scheme}) at ${join(
      home,
      '.claude',
      'commands',
    )}/`,
  );
  if (result.collisions.length > 0) {
    console.log(
      `Overwrote ${result.collisions.length} foreign file(s) under --force.`,
    );
  }
}
