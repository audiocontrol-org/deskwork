import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ReleaseArtifactKind =
  | 'root-package'
  | 'workspace-package'
  | 'claude-plugin'
  | 'codex-plugin'
  | 'claude-marketplace'
  | 'codex-marketplace'
  | 'extension-manifest';

export interface ReleaseArtifact {
  readonly name: string;
  readonly path: string;
  readonly kind: ReleaseArtifactKind;
  readonly version: string;
}

export interface PortableReleaseState {
  readonly canonicalVersion: string;
  readonly artifacts: readonly ReleaseArtifact[];
  readonly stackControlDistributions: {
    readonly claudePluginVersion: string;
    readonly codexPluginVersion: string;
    readonly claudeMarketplaceVersion: string;
    readonly codexMarketplaceName: string;
  };
}

interface ReleaseArtifactSpec {
  readonly name: string;
  readonly path: string;
  readonly kind: ReleaseArtifactKind;
  readonly readVersion: (repoRoot: string) => string;
}

const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readJsonVersion(path: string): string {
  const parsed = readJson(path);
  if (typeof parsed.version !== 'string' || parsed.version === '') {
    throw new Error(`release-check: missing string version in ${path}`);
  }
  return parsed.version;
}

function readMarketplaceVersion(repoRoot: string, pluginName: string): string {
  const path = resolve(repoRoot, '.claude-plugin/marketplace.json');
  const parsed = readJson(path);
  const plugins = parsed.plugins;
  if (!Array.isArray(plugins)) {
    throw new Error(`release-check: missing plugins[] in ${path}`);
  }
  const match = plugins.find(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.name === 'string' &&
      entry.name === pluginName,
  );
  if (match === undefined || typeof match.version !== 'string' || match.version === '') {
    throw new Error(`release-check: missing marketplace version for plugin '${pluginName}' in ${path}`);
  }
  return match.version;
}

function readCodexMarketplaceEntry(
  repoRoot: string,
  pluginName: string,
): { marketplaceName: string; pluginPath: string } {
  const path = resolve(repoRoot, '.agents/plugins/marketplace.json');
  const parsed = readJson(path);
  if (typeof parsed.name !== 'string' || parsed.name === '') {
    throw new Error(`release-check: missing marketplace name in ${path}`);
  }
  const plugins = parsed.plugins;
  if (!Array.isArray(plugins)) {
    throw new Error(`release-check: missing plugins[] in ${path}`);
  }
  const match = plugins.find(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.name === 'string' &&
      entry.name === pluginName,
  );
  if (match === undefined) {
    throw new Error(`release-check: missing Codex marketplace entry for plugin '${pluginName}' in ${path}`);
  }
  const source = match.source;
  if (!isRecord(source)) {
    throw new Error(`release-check: missing source object for Codex marketplace entry '${pluginName}' in ${path}`);
  }
  if (source.source !== 'local' || source.path !== './plugins/stack-control') {
    throw new Error(
      `release-check: Codex marketplace entry '${pluginName}' in ${path} must point at ./plugins/stack-control`,
    );
  }
  return {
    marketplaceName: parsed.name,
    pluginPath: String(source.path),
  };
}

function readExtensionVersion(path: string): string {
  const text = readFileSync(path, 'utf8');
  const match = /\n[ \t]+version:\s*"([^"]+)"/.exec(text);
  if (match === null || match[1] === undefined || match[1] === '') {
    throw new Error(`release-check: missing extension version in ${path}`);
  }
  return match[1];
}

const RELEASE_ARTIFACTS: readonly ReleaseArtifactSpec[] = [
  {
    name: 'deskwork monorepo root',
    path: 'package.json',
    kind: 'root-package',
    readVersion: (repoRoot) => readJsonVersion(resolve(repoRoot, 'package.json')),
  },
  {
    name: '@deskwork/core',
    path: 'packages/core/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) => readJsonVersion(resolve(repoRoot, 'packages/core/package.json')),
  },
  {
    name: '@deskwork/cli',
    path: 'packages/cli/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) => readJsonVersion(resolve(repoRoot, 'packages/cli/package.json')),
  },
  {
    name: '@deskwork/studio',
    path: 'packages/studio/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) => readJsonVersion(resolve(repoRoot, 'packages/studio/package.json')),
  },
  {
    name: '@deskwork/plugin',
    path: 'plugins/deskwork/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) => readJsonVersion(resolve(repoRoot, 'plugins/deskwork/package.json')),
  },
  {
    name: '@deskwork/plugin-studio',
    path: 'plugins/deskwork-studio/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) =>
      readJsonVersion(resolve(repoRoot, 'plugins/deskwork-studio/package.json')),
  },
  {
    name: '@deskwork/plugin-dw-lifecycle',
    path: 'plugins/dw-lifecycle/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) =>
      readJsonVersion(resolve(repoRoot, 'plugins/dw-lifecycle/package.json')),
  },
  {
    name: '@deskwork/plugin-stack-control',
    path: 'plugins/stack-control/package.json',
    kind: 'workspace-package',
    readVersion: (repoRoot) =>
      readJsonVersion(resolve(repoRoot, 'plugins/stack-control/package.json')),
  },
  {
    name: 'stack-control claude plugin manifest',
    path: 'plugins/stack-control/.claude-plugin/plugin.json',
    kind: 'claude-plugin',
    readVersion: (repoRoot) =>
      readJsonVersion(resolve(repoRoot, 'plugins/stack-control/.claude-plugin/plugin.json')),
  },
  {
    name: 'stack-control codex plugin manifest',
    path: 'plugins/stack-control/.codex-plugin/plugin.json',
    kind: 'codex-plugin',
    readVersion: (repoRoot) =>
      readJsonVersion(resolve(repoRoot, 'plugins/stack-control/.codex-plugin/plugin.json')),
  },
  {
    name: 'stack-control claude marketplace entry',
    path: '.claude-plugin/marketplace.json#plugins[name=stack-control]',
    kind: 'claude-marketplace',
    readVersion: (repoRoot) => readMarketplaceVersion(repoRoot, 'stack-control'),
  },
  {
    name: 'stack-control codex marketplace entry',
    path: '.agents/plugins/marketplace.json#plugins[name=stack-control]',
    kind: 'codex-marketplace',
    readVersion: (repoRoot) => {
      readCodexMarketplaceEntry(repoRoot, 'stack-control');
      return readJsonVersion(resolve(repoRoot, 'plugins/stack-control/.codex-plugin/plugin.json'));
    },
  },
  {
    name: 'spec-governance extension manifest',
    path: 'plugins/stack-control/spec-kit/spec-governance/extension.yml',
    kind: 'extension-manifest',
    readVersion: (repoRoot) =>
      readExtensionVersion(
        resolve(repoRoot, 'plugins/stack-control/spec-kit/spec-governance/extension.yml'),
      ),
  },
];

export function collectPortableReleaseState(repoRoot: string = DEFAULT_REPO_ROOT): PortableReleaseState {
  const artifacts = RELEASE_ARTIFACTS.map((spec) => {
    const abs = resolve(repoRoot, spec.path.split('#', 1)[0]!);
    if (!existsSync(abs)) {
      throw new Error(`release-check: required artifact missing: ${spec.path}`);
    }
    return {
      name: spec.name,
      path: spec.path,
      kind: spec.kind,
      version: spec.readVersion(repoRoot),
    } satisfies ReleaseArtifact;
  });
  const canonicalVersion = verifyPortableReleaseState(artifacts);
  const claudePluginVersion = artifacts.find((artifact) => artifact.kind === 'claude-plugin')!.version;
  const codexPluginVersion = artifacts.find((artifact) => artifact.kind === 'codex-plugin')!.version;
  const claudeMarketplaceVersion = artifacts.find(
    (artifact) => artifact.kind === 'claude-marketplace',
  )!.version;
  const codexMarketplaceName = readCodexMarketplaceEntry(repoRoot, 'stack-control').marketplaceName;
  return {
    canonicalVersion,
    artifacts,
    stackControlDistributions: {
      claudePluginVersion,
      codexPluginVersion,
      claudeMarketplaceVersion,
      codexMarketplaceName,
    },
  };
}

export function verifyPortableReleaseState(artifacts: readonly ReleaseArtifact[]): string {
  if (artifacts.length === 0) {
    throw new Error('release-check: no release artifacts configured');
  }
  const canonicalVersion = artifacts[0]!.version;
  const mismatches = artifacts.filter((artifact) => artifact.version !== canonicalVersion);
  if (mismatches.length > 0) {
    const details = mismatches.map((artifact) => `${artifact.path}=${artifact.version}`).join(', ');
    throw new Error(
      `release-check: lockstep release drift detected; expected ${canonicalVersion} everywhere but found ${details}`,
    );
  }
  return canonicalVersion;
}
