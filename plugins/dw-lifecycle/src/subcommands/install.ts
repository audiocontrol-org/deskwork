import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig, validateConfig } from '../config.js';
import { repoRoot } from '../repo.js';

interface ParsedInstallArgs {
  projectRoot: string;
  dryRun: boolean;
  help: boolean;
}

function printInstallUsage(): void {
  console.log('Usage: dw-lifecycle install <project-root> [--dry-run]');
  console.log('Probes the host project and writes .dw-lifecycle/config.json.');
}

export function parseInstallArgs(args: string[]): ParsedInstallArgs {
  let projectRoot: string | undefined;
  let dryRun = false;
  let help = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (projectRoot) {
      throw new Error('Usage: dw-lifecycle install <project-root> [--dry-run]');
    }
    projectRoot = arg;
  }

  return {
    projectRoot: projectRoot ?? process.cwd(),
    dryRun,
    help,
  };
}

function looksLikeVersionDir(name: string): boolean {
  return /^\d+\.\d+$/.test(name);
}

function isDocsVersionShape(projectRoot: string, docsRoot: string, version: string): boolean {
  const versionDir = join(projectRoot, docsRoot, version);
  const { inProgress, waiting, complete } = defaultConfig().docs.statusDirs;
  return [inProgress, waiting, complete].some((stage) => existsSync(join(versionDir, stage)));
}

export function probeInstallConfig(projectRoot: string) {
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

  const config = probeInstallConfig(projectRoot);

  if (!parsed.dryRun) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  console.log(JSON.stringify({ configPath, config }, null, 2));
}
