// 009 T004 (RED-first) — resolveInstallation upward-walk: nearest enclosing
// `.stack-control/config.yaml` marks the root; nearest-wins on nesting; no-match
// fails loud naming the start dir; accepts an explicit start dir (surface-
// agnostic, FR-026).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { resolveInstallation } from '../../src/config/installation.js';
import { InstallationError } from '../../src/config/errors.js';

function mkInstallation(root: string, body = 'version: 1\n'): void {
  mkdirSync(join(root, '.stack-control'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), body);
}

describe('resolveInstallation', () => {
  it('resolves an installation when the config is in the start dir', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'sc-inst-')));
    mkInstallation(root);
    const inst = resolveInstallation(root);
    expect(inst.root).toBe(root);
    expect(inst.configPath).toBe(join(root, '.stack-control', 'config.yaml'));
    expect(inst.config.version).toBe(1);
    expect(inst.resolved.roadmap).toBe(join(root, 'ROADMAP.md'));
  });

  it('upward-walks to a config in an ancestor directory', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'sc-inst-')));
    mkInstallation(root);
    const deep = join(root, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    const inst = resolveInstallation(deep);
    expect(inst.root).toBe(root);
  });

  it('nearest-wins: a nested installation shadows its ancestor', () => {
    const outer = realpathSync(mkdtempSync(join(tmpdir(), 'sc-inst-')));
    mkInstallation(outer);
    const inner = join(outer, 'pkg');
    mkdirSync(inner, { recursive: true });
    mkInstallation(inner);
    const sub = join(inner, 'src');
    mkdirSync(sub, { recursive: true });
    expect(resolveInstallation(sub).root).toBe(inner);
    expect(resolveInstallation(inner).root).toBe(inner);
    expect(resolveInstallation(outer).root).toBe(outer);
  });

  it('fails loud naming the start dir when no installation is found', () => {
    const lonely = realpathSync(mkdtempSync(join(tmpdir(), 'sc-none-')));
    expect(() => resolveInstallation(lonely)).toThrow(InstallationError);
    expect(() => resolveInstallation(lonely)).toThrow(new RegExp(lonely.replace(/[.\\+*?[^\]$(){}=!<>|:#-]/g, '\\$&')));
  });

  it('a no-match error carries code "not-found" and directs to stackctl setup', () => {
    const lonely = realpathSync(mkdtempSync(join(tmpdir(), 'sc-none-')));
    try {
      resolveInstallation(lonely);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InstallationError);
      expect((err as InstallationError).code).toBe('not-found');
      expect((err as InstallationError).message).toMatch(/stackctl setup/);
    }
  });
});
