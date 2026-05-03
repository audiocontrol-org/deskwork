import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CONFIG_RELATIVE_PATH } from '../config.js';

export interface Finding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface DoctorOptions {
  projectRoot: string;
  pluginRegistry: InstalledPluginsRegistry;
  fileExists?: (path: string) => boolean;
  checkConfig: () => boolean;
}

const REQUIRED_PEERS = ['superpowers'];
const RECOMMENDED_PEERS = ['feature-dev'];
const OFFICIAL_MARKETPLACE = 'claude-plugins-official';
const INSTALLED_PLUGINS_RELATIVE_PATH = '.claude/plugins/installed_plugins.json';

interface InstalledPluginEntry {
  scope?: string;
  projectPath?: string;
  installPath?: string;
}

interface InstalledPluginsRegistry {
  plugins: Record<string, InstalledPluginEntry[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseInstalledPluginsRegistry(raw: string): InstalledPluginsRegistry {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !isRecord(parsed.plugins)) {
    return { plugins: {} };
  }

  const plugins: Record<string, InstalledPluginEntry[]> = {};
  for (const [key, value] of Object.entries(parsed.plugins)) {
    if (!Array.isArray(value)) {
      continue;
    }

    const installs = value
      .filter(isRecord)
      .map((entry) => ({
        scope: typeof entry.scope === 'string' ? entry.scope : undefined,
        projectPath:
          typeof entry.projectPath === 'string' ? resolve(entry.projectPath) : undefined,
        installPath:
          typeof entry.installPath === 'string' ? resolve(entry.installPath) : undefined,
      }));

    plugins[key] = installs;
  }

  return { plugins };
}

export function loadInstalledPluginsRegistry(
  registryPath: string = join(homedir(), INSTALLED_PLUGINS_RELATIVE_PATH)
): InstalledPluginsRegistry {
  return parseInstalledPluginsRegistry(readFileSync(registryPath, 'utf8'));
}

export function detectPeerPluginInstalled(
  registry: InstalledPluginsRegistry,
  name: string,
  projectRoot: string,
  fileExists: (path: string) => boolean = existsSync
): boolean {
  const installs = registry.plugins[`${name}@${OFFICIAL_MARKETPLACE}`] ?? [];
  const normalizedRoot = resolve(projectRoot);

  return installs.some((install) => {
    if (!install.installPath || !fileExists(install.installPath)) {
      return false;
    }

    if (install.scope === 'project' && install.projectPath) {
      return install.projectPath === normalizedRoot;
    }

    return install.scope === undefined || install.scope === 'user' || install.scope === 'project';
  });
}

export async function runDoctor(opts: DoctorOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  const fileExists = opts.fileExists ?? existsSync;

  if (!opts.checkConfig()) {
    findings.push({
      rule: 'missing-config',
      severity: 'error',
      message: `No ${CONFIG_RELATIVE_PATH} found. Run /dw-lifecycle:install first.`,
    });
  }

  for (const peer of REQUIRED_PEERS) {
    if (!detectPeerPluginInstalled(opts.pluginRegistry, peer, opts.projectRoot, fileExists)) {
      findings.push({
        rule: 'peer-plugins',
        severity: 'error',
        message: `Required peer plugin "${peer}" not installed. Install: /plugin install ${peer}@claude-plugins-official`,
      });
    }
  }

  for (const peer of RECOMMENDED_PEERS) {
    if (!detectPeerPluginInstalled(opts.pluginRegistry, peer, opts.projectRoot, fileExists)) {
      findings.push({
        rule: 'peer-plugins',
        severity: 'warning',
        message: `Recommended peer plugin "${peer}" not installed. Install: /plugin install ${peer}@claude-plugins-official`,
      });
    }
  }

  return findings;
}

export async function doctor(args: string[]): Promise<void> {
  const projectRoot = args[0] ?? process.cwd();
  const findings = await runDoctor({
    projectRoot,
    pluginRegistry: loadInstalledPluginsRegistry(),
    checkConfig: () => existsSync(join(projectRoot, CONFIG_RELATIVE_PATH)),
  });
  console.log(JSON.stringify({ findings }, null, 2));
  if (findings.some((f) => f.severity === 'error')) {
    process.exit(1);
  }
}
