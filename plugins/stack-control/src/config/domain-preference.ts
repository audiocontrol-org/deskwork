import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { InstallationError } from './errors.js';

export type PreferenceScope = 'session' | 'branch';

interface PreferenceFile {
  readonly version: number;
  readonly session?: string;
  readonly branches?: Record<string, string>;
}

export interface PreferenceStatus {
  readonly gitRoot: string;
  readonly currentBranch: string | null;
  readonly session: string | null;
  readonly branch: string | null;
}

const STORE_VERSION = 1;

export function getPreferenceStatus(startDir: string): PreferenceStatus {
  const gitRoot = requireGitRoot(startDir);
  const currentBranch = readCurrentBranch(startDir);
  const store = loadStore(startDir);
  return {
    gitRoot,
    currentBranch,
    session: store.session ?? null,
    branch:
      currentBranch !== null && currentBranch !== 'HEAD' ? (store.branches?.[currentBranch] ?? null) : null,
  };
}

export function readApplicableDomainPreference(
  startDir: string,
): { scope: PreferenceScope; path: string } | null {
  const store = loadStore(startDir);
  if (store.session !== undefined) return { scope: 'session', path: store.session };

  const branch = readCurrentBranch(startDir);
  if (branch === null || branch === 'HEAD') return null;
  const path = store.branches?.[branch];
  return path === undefined ? null : { scope: 'branch', path };
}

export function writeDomainPreference(
  startDir: string,
  scope: PreferenceScope,
  installationRoot: string,
): void {
  const storePath = preferenceStorePath(startDir);
  const store = loadStore(startDir);
  const canonical = realpathSync(installationRoot);
  const next: PreferenceFile =
    scope === 'session'
      ? { version: STORE_VERSION, session: canonical, branches: store.branches }
      : {
          version: STORE_VERSION,
          session: store.session,
          branches: {
            ...(store.branches ?? {}),
            [requireBranch(startDir)]: canonical,
          },
        };
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function clearDomainPreference(startDir: string, scope: PreferenceScope | 'all'): void {
  const storePath = preferenceStorePath(startDir);
  const store = loadStore(startDir);
  const next: PreferenceFile =
    scope === 'session'
      ? { version: STORE_VERSION, branches: store.branches }
      : scope === 'branch'
        ? {
            version: STORE_VERSION,
            session: store.session,
            branches: omitBranch(store.branches ?? {}, requireBranch(startDir)),
          }
        : { version: STORE_VERSION };
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function omitBranch(
  branches: Record<string, string>,
  branch: string,
): Record<string, string> | undefined {
  const next = { ...branches };
  delete next[branch];
  return Object.keys(next).length === 0 ? undefined : next;
}

function loadStore(startDir: string): PreferenceFile {
  const storePath = preferenceStorePath(startDir);
  if (!existsSync(storePath)) return { version: STORE_VERSION };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(storePath, 'utf8')) as unknown;
  } catch (err) {
    throw new InstallationError(
      'invalid-preference',
      `stackctl config-domain: malformed preference store at ${storePath}: ${errorMessage(err)}`,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new InstallationError(
      'invalid-preference',
      `stackctl config-domain: preference store at ${storePath} must be a JSON object`,
    );
  }

  if (parsed['version'] !== STORE_VERSION) {
    throw new InstallationError(
      'invalid-preference',
      `stackctl config-domain: preference store at ${storePath} has unsupported version ${String(
        parsed['version'],
      )}`,
    );
  }

  const session = optionalNonEmptyString(parsed['session'], storePath, 'session');
  const branches = optionalStringMap(parsed['branches'], storePath, 'branches');
  return { version: STORE_VERSION, session, branches };
}

function optionalNonEmptyString(value: unknown, storePath: string, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && value.length > 0) return value;
  throw new InstallationError(
    'invalid-preference',
    `stackctl config-domain: ${storePath}: ${field} must be a non-empty string`,
  );
}

function optionalStringMap(
  value: unknown,
  storePath: string,
  field: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new InstallationError(
      'invalid-preference',
      `stackctl config-domain: ${storePath}: ${field} must be an object`,
    );
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new InstallationError(
        'invalid-preference',
        `stackctl config-domain: ${storePath}: ${field}.${key} must be a non-empty string`,
      );
    }
    out[key] = raw;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function preferenceStorePath(startDir: string): string {
  const gitDir = requireGitDir(startDir);
  return join(gitDir, 'stack-control', 'domain-preferences.json');
}

function requireGitRoot(startDir: string): string {
  const root = readGit(['rev-parse', '--show-toplevel'], startDir);
  if (root === null) {
    throw new InstallationError(
      'not-found',
      `no git repository found from ${resolvePath(startDir)}; config-domain preferences are repo-local`,
    );
  }
  return root;
}

function requireGitDir(startDir: string): string {
  const gitDir = readGit(['rev-parse', '--absolute-git-dir'], startDir);
  if (gitDir === null) {
    throw new InstallationError(
      'not-found',
      `no git repository found from ${resolvePath(startDir)}; config-domain preferences are repo-local`,
    );
  }
  return gitDir;
}

function requireBranch(startDir: string): string {
  const branch = readCurrentBranch(startDir);
  if (branch === null || branch === 'HEAD') {
    throw new InstallationError(
      'invalid-preference',
      'stackctl config-domain: cannot set a branch preference from detached HEAD',
    );
  }
  return branch;
}

function readCurrentBranch(startDir: string): string | null {
  return readGit(['rev-parse', '--abbrev-ref', 'HEAD'], startDir);
}

function readGit(args: readonly string[], startDir: string): string | null {
  const r = spawnSync('git', ['-C', startDir, ...args], { encoding: 'utf8' });
  if (r.status !== 0 || typeof r.stdout !== 'string') return null;
  const value = r.stdout.trim();
  return value.length === 0 ? null : value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
