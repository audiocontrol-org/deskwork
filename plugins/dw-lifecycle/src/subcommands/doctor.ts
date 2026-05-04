import { execFileSync } from 'node:child_process';
import { Dirent, existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CONFIG_RELATIVE_PATH, loadConfig } from '../config.js';
import type { Config } from '../config.types.js';
import { parseFrontmatter } from '../frontmatter.js';

export interface Finding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface DoctorOptions {
  projectRoot: string;
  pluginRegistry: InstalledPluginsRegistry;
  fileExists?: (path: string) => boolean;
  checkConfig?: () => boolean;
  config?: Config;
  resolveIssueState?: (issueNumber: number) => Promise<'OPEN' | 'CLOSED' | undefined> | 'OPEN' | 'CLOSED' | undefined;
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

interface FeatureDocRef {
  slug: string;
  dir: string;
  targetVersion?: string;
}

const FEATURE_HEADING_RE = /^### Feature:\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*$/gm;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeReadDir(path: string): Dirent[] {
  if (!existsSync(path)) {
    return [];
  }
  return readdirSync(path, { withFileTypes: true });
}

function listConfiguredVersionDirs(cfg: Config, projectRoot: string): string[] {
  if (!cfg.docs.byVersion) {
    return [];
  }

  const docsRoot = join(projectRoot, cfg.docs.root);
  const statusDirs = new Set(Object.values(cfg.docs.statusDirs));

  return safeReadDir(docsRoot)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      safeReadDir(join(docsRoot, name)).some(
        (child) => child.isDirectory() && statusDirs.has(child.name)
      )
    )
    .sort();
}

function listFeatureDocRefs(cfg: Config, projectRoot: string, stage?: keyof Config['docs']['statusDirs']): FeatureDocRef[] {
  const docsRoot = join(projectRoot, cfg.docs.root);
  const stageNames = stage ? [stage] : (Object.keys(cfg.docs.statusDirs) as Array<keyof Config['docs']['statusDirs']>);
  const refs: FeatureDocRef[] = [];

  if (cfg.docs.byVersion) {
    for (const version of listConfiguredVersionDirs(cfg, projectRoot)) {
      for (const stageName of stageNames) {
        const stageDir = join(docsRoot, version, cfg.docs.statusDirs[stageName]);
        for (const entry of safeReadDir(stageDir)) {
          if (!entry.isDirectory()) continue;
          refs.push({
            slug: entry.name,
            dir: join(stageDir, entry.name),
            targetVersion: version,
          });
        }
      }
    }
    return refs;
  }

  for (const stageName of stageNames) {
    const stageDir = join(docsRoot, cfg.docs.statusDirs[stageName]);
    for (const entry of safeReadDir(stageDir)) {
      if (!entry.isDirectory()) continue;
      refs.push({
        slug: entry.name,
        dir: join(stageDir, entry.name),
      });
    }
  }

  return refs;
}

function parseParentIssueNumber(readmePath: string): number | undefined {
  if (!existsSync(readmePath)) {
    return undefined;
  }

  const { data } = parseFrontmatter(readFileSync(readmePath, 'utf8'));
  const raw = data.parentIssue;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === 'string') {
    const match = /^#?(\d+)$/.exec(raw.trim());
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

function extractJournalFeatureSlugs(source: string): string[] {
  const slugs = new Set<string>();
  for (const match of source.matchAll(FEATURE_HEADING_RE)) {
    const slug = match[1];
    if (slug) {
      slugs.add(slug);
    }
  }
  return [...slugs].sort();
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
  const hasConfig =
    opts.config !== undefined
      ? true
      : (opts.checkConfig ?? (() => existsSync(join(opts.projectRoot, CONFIG_RELATIVE_PATH))))();

  if (!hasConfig) {
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

  if (!hasConfig) {
    return findings;
  }

  const cfg = opts.config ?? loadConfig(opts.projectRoot);

  if (cfg.docs.byVersion) {
    const configuredVersions = new Set(cfg.docs.knownVersions);
    for (const version of listConfiguredVersionDirs(cfg, opts.projectRoot)) {
      if (configuredVersions.has(version)) {
        continue;
      }
      findings.push({
        rule: 'version-shape-drift',
        severity: 'warning',
        message: `Docs version directory "${version}" exists under ${cfg.docs.root}/ but is missing from config.docs.knownVersions.`,
      });
    }
  }

  const inProgressRefs = listFeatureDocRefs(cfg, opts.projectRoot, 'inProgress');

  for (const ref of inProgressRefs) {
    const workplanPath = join(ref.dir, 'workplan.md');
    if (fileExists(workplanPath)) {
      continue;
    }
    findings.push({
      rule: 'orphan-feature-doc',
      severity: 'warning',
      message: `In-progress feature "${ref.slug}" is missing workplan.md at ${workplanPath}.`,
    });
  }

  if (opts.resolveIssueState) {
    for (const ref of inProgressRefs) {
      const readmePath = join(ref.dir, 'README.md');
      const issueNumber = parseParentIssueNumber(readmePath);
      if (!issueNumber) {
        continue;
      }

      const state = await opts.resolveIssueState(issueNumber);
      if (state === 'CLOSED') {
        findings.push({
          rule: 'stale-issue',
          severity: 'warning',
          message: `Feature "${ref.slug}" is still in ${cfg.docs.statusDirs.inProgress} but parent issue #${issueNumber} is closed.`,
        });
      }
    }
  }

  const journalPath = join(opts.projectRoot, cfg.journal.path);
  if (fileExists(journalPath)) {
    const knownSlugs = new Set(listFeatureDocRefs(cfg, opts.projectRoot).map((ref) => ref.slug));
    for (const slug of extractJournalFeatureSlugs(readFileSync(journalPath, 'utf8'))) {
      if (knownSlugs.has(slug)) {
        continue;
      }
      findings.push({
        rule: 'journal-feature-mismatch',
        severity: 'warning',
        message: `Journal ${cfg.journal.path} references feature "${slug}" but no feature doc directory exists for that slug.`,
      });
    }
  }

  return findings;
}

function detectRepo(projectRoot: string): string {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match?.[1]) {
    throw new Error(`Could not parse GitHub repo from origin: ${remote}`);
  }
  return match[1];
}

function resolveIssueStateFactory(projectRoot: string) {
  const repo = detectRepo(projectRoot);
  return (issueNumber: number): 'OPEN' | 'CLOSED' | undefined => {
    const state = execFileSync(
      'gh',
      ['issue', 'view', String(issueNumber), '--repo', repo, '--json', 'state', '--jq', '.state'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    )
      .trim()
      .toUpperCase();
    if (state === 'OPEN' || state === 'CLOSED') {
      return state;
    }
    return undefined;
  };
}

export async function doctor(args: string[]): Promise<void> {
  const projectRoot = args[0] ?? process.cwd();
  let resolveIssueState: DoctorOptions['resolveIssueState'];
  try {
    resolveIssueState = resolveIssueStateFactory(projectRoot);
  } catch {
    resolveIssueState = undefined;
  }
  const findings = await runDoctor({
    projectRoot,
    pluginRegistry: loadInstalledPluginsRegistry(),
    resolveIssueState,
  });
  console.log(JSON.stringify({ findings }, null, 2));
  if (findings.some((f) => f.severity === 'error')) {
    process.exit(1);
  }
}
