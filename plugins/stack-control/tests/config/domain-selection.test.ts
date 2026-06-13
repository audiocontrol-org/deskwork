import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { resolveInstallation } from '../../src/config/installation.js';
import { InstallationError } from '../../src/config/errors.js';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sc-domain-')));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Test User');
  git(root, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(root, 'README.md'), '# test\n', 'utf8');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'init');
  return root;
}

function mkInstallation(root: string, body = 'version: 1\n'): void {
  mkdirSync(join(root, '.stack-control'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), body, 'utf8');
}

describe('config-domain selection', () => {
  it('auto-resolves the sole discovered installation below the repo root', () => {
    const repo = initRepo();
    const domain = join(repo, 'plugins', 'stack-control');
    mkdirSync(domain, { recursive: true });
    mkInstallation(domain);

    expect(resolveInstallation(repo).root).toBe(domain);
  });

  it('fails loud listing candidate domains when discovery is ambiguous', () => {
    const repo = initRepo();
    const a = join(repo, 'plugins', 'deskwork');
    const b = join(repo, 'plugins', 'stack-control');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    mkInstallation(a);
    mkInstallation(b);

    try {
      resolveInstallation(repo);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InstallationError);
      expect((err as InstallationError).code).toBe('ambiguous-domain');
      expect((err as InstallationError).message).toContain(a);
      expect((err as InstallationError).message).toContain(b);
      expect((err as InstallationError).message).toContain('stackctl config-domain use');
    }
  });

  it('uses a branch preference when discovery is ambiguous', () => {
    const repo = initRepo();
    const a = join(repo, 'plugins', 'deskwork');
    const b = join(repo, 'plugins', 'stack-control');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    mkInstallation(a);
    mkInstallation(b);

    const r = runCli(['config-domain', 'use', b, '--scope', 'branch'], { cwd: repo });
    expect(r.status).toBe(0);
    expect(resolveInstallation(repo).root).toBe(b);
  });

  it('lets a session preference override the branch preference', () => {
    const repo = initRepo();
    const a = join(repo, 'plugins', 'deskwork');
    const b = join(repo, 'plugins', 'stack-control');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    mkInstallation(a);
    mkInstallation(b);

    expect(runCli(['config-domain', 'use', a, '--scope', 'branch'], { cwd: repo }).status).toBe(0);
    expect(runCli(['config-domain', 'use', b, '--scope', 'session'], { cwd: repo }).status).toBe(0);
    expect(resolveInstallation(repo).root).toBe(b);
  });

  it('fails loud on an invalid stored preference instead of silently guessing', () => {
    const repo = initRepo();
    const a = join(repo, 'plugins', 'deskwork');
    const b = join(repo, 'plugins', 'stack-control');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    mkInstallation(a);
    mkInstallation(b);

    expect(runCli(['config-domain', 'use', a, '--scope', 'session'], { cwd: repo }).status).toBe(0);
    rmSync(join(a, '.stack-control', 'config.yaml'));

    try {
      resolveInstallation(repo);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InstallationError);
      expect((err as InstallationError).code).toBe('invalid-preference');
      expect((err as InstallationError).message).toContain(a);
      expect((err as InstallationError).message).toContain('session');
    }
  });
});
