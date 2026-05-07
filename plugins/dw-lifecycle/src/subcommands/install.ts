import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig, validateConfig } from '../config.js';
import { repoRoot } from '../repo.js';

interface ParsedInstallArgs {
  projectRoot: string;
  dryRun: boolean;
  help: boolean;
  configOverlay?: string;
}

function printInstallUsage(): void {
  console.log(
    'Usage: dw-lifecycle install <project-root> [--dry-run] [--config-overlay <path>]',
  );
  console.log('Probes the host project and writes .dw-lifecycle/config.json.');
  console.log(
    '  --config-overlay <path>  JSON file deep-merged onto the probed config before write.',
  );
}

export function parseInstallArgs(args: string[]): ParsedInstallArgs {
  let projectRoot: string | undefined;
  let dryRun = false;
  let help = false;
  let configOverlay: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--config-overlay') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --config-overlay');
      configOverlay = next;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (projectRoot) {
      throw new Error('Usage: dw-lifecycle install <project-root> [--dry-run] [--config-overlay <path>]');
    }
    projectRoot = arg;
  }

  return {
    projectRoot: projectRoot ?? process.cwd(),
    dryRun,
    help,
    configOverlay,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `overlay` onto `base`. Only walks plain objects; arrays
 * and primitives replace wholesale (the operator's expressed intent
 * for `knownVersions: [...]` is to set the array, not to extend the
 * probed list). Returns a new object; does not mutate inputs.
 */
function deepMerge<T>(base: T, overlay: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    // For non-objects, the overlay wins. Cast through unknown so the
    // caller's T-typed hole gets the overlay value as-is — the
    // subsequent validateConfig() pass is what enforces shape.
    return (overlay === undefined ? base : (overlay as unknown as T));
  }
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseValue = (base as Record<string, unknown>)[key];
    const overlayValue = overlay[key];
    if (isPlainObject(baseValue) && isPlainObject(overlayValue)) {
      result[key] = deepMerge(baseValue, overlayValue);
    } else {
      result[key] = overlayValue;
    }
  }
  return result as T;
}

function looksLikeVersionDir(name: string): boolean {
  return /^\d+\.\d+$/.test(name);
}

function isDocsVersionShape(projectRoot: string, docsRoot: string, version: string): boolean {
  const versionDir = join(projectRoot, docsRoot, version);
  const { inProgress, waiting, complete } = defaultConfig().docs.statusDirs;
  return [inProgress, waiting, complete].some((stage) => existsSync(join(versionDir, stage)));
}

export function probeInstallConfig(projectRoot: string, overlayPath?: string) {
  repoRoot(projectRoot);

  const config = defaultConfig();
  const docsRoot = join(projectRoot, config.docs.root);

  if (existsSync(docsRoot) && statSync(docsRoot).isDirectory()) {
    const versions = readdirSync(docsRoot)
      .filter(looksLikeVersionDir)
      .filter((entry) => isDocsVersionShape(projectRoot, config.docs.root, entry))
      .sort();

    if (versions.length > 0) {
      const firstVersion = versions[0];
      config.docs.byVersion = true;
      config.docs.knownVersions = versions;
      if (firstVersion) {
        config.docs.defaultTargetVersion = firstVersion;
      }
    }
  }

  if (overlayPath) {
    if (!existsSync(overlayPath)) {
      throw new Error(`Config overlay file not found: ${overlayPath}`);
    }
    let overlay: unknown;
    try {
      overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Config overlay parse failed: ${overlayPath}: ${reason}`);
    }
    const merged = deepMerge(config, overlay);
    return validateConfig(merged);
  }

  return validateConfig(config);
}

export async function install(args: string[]): Promise<void> {
  const parsed = parseInstallArgs(args);

  if (parsed.help) {
    printInstallUsage();
    process.exit(0);
  }

  const projectRoot = parsed.projectRoot;
  const configDir = join(projectRoot, '.dw-lifecycle');
  const configPath = join(configDir, 'config.json');

  if (existsSync(configPath)) {
    console.error(`Config already exists at ${configPath}. Refusing to overwrite.`);
    process.exit(1);
  }

  const config = probeInstallConfig(projectRoot, parsed.configOverlay);

  if (!parsed.dryRun) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  console.log(JSON.stringify({ configPath, config }, null, 2));
}
