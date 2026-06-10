/**
 * 010 T059 — customize / override-resolver unit tests.
 *
 * The runtime resolver prefers a project override at
 * `<installation>/.stack-control/scope-discovery/<name>.ts` over the plugin
 * default; `customizeScopeDiscovery` copies the default into that location so
 * the resolver picks it up. On-disk fixtures only.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import {
  customizeScopeDiscovery,
  overridePath,
  pluginDefaultPath,
  resolveScopeDiscoveryModule,
} from '../../scope-discovery/customize.js';

const SD_REL = '.stack-control/scope-discovery';

let fixtures: Fixture[] = [];
function fx(): Fixture {
  const f = makeFixture('sd-customize-');
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

describe('resolveScopeDiscoveryModule', () => {
  it('returns the plugin default when no override exists', () => {
    const f = fx();
    const root = f.install('.');
    const resolved = resolveScopeDiscoveryModule(root, 'summary');
    expect(resolved.isOverride).toBe(false);
    expect(resolved.path).toBe(pluginDefaultPath('summary'));
    expect(existsSync(resolved.path)).toBe(true);
  });

  it('prefers a project override over the plugin default', () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(`${SD_REL}/summary.ts`, 'export const overridden = true;\n');
    const resolved = resolveScopeDiscoveryModule(root, 'summary');
    expect(resolved.isOverride).toBe(true);
    expect(resolved.path).toBe(overridePath(root, 'summary'));
  });

  it('fails loud for a module with no default and no override', () => {
    const f = fx();
    const root = f.install('.');
    expect(() => resolveScopeDiscoveryModule(root, 'no-such-module')).toThrow(
      /no plugin default/,
    );
  });
});

describe('customizeScopeDiscovery — copy', () => {
  it('copies the plugin default into the override location; resolver then prefers it', () => {
    const f = fx();
    const root = f.install('.');
    const result = customizeScopeDiscovery({
      name: 'summary',
      startDir: root,
      at: root,
      force: false,
    });
    expect(result.code).toBe(0);
    expect(result.action).toBe('created');
    const dest = overridePath(root, 'summary');
    expect(existsSync(dest)).toBe(true);
    // The override is a byte copy of the plugin default.
    expect(readFileSync(dest, 'utf8')).toBe(readFileSync(pluginDefaultPath('summary'), 'utf8'));
    const resolved = resolveScopeDiscoveryModule(root, 'summary');
    expect(resolved.isOverride).toBe(true);
  });

  it('is non-destructive: skips an existing override without --force', () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(`${SD_REL}/summary.ts`, 'export const mine = 1;\n');
    const result = customizeScopeDiscovery({
      name: 'summary',
      startDir: root,
      at: root,
      force: false,
    });
    expect(result.action).toBe('skipped');
    expect(readFileSync(join(root, SD_REL, 'summary.ts'), 'utf8')).toBe('export const mine = 1;\n');
  });

  it('--force overwrites an existing override', () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(`${SD_REL}/summary.ts`, 'export const mine = 1;\n');
    const result = customizeScopeDiscovery({
      name: 'summary',
      startDir: root,
      at: root,
      force: true,
    });
    expect(result.action).toBe('overwritten');
    expect(readFileSync(join(root, SD_REL, 'summary.ts'), 'utf8')).toBe(
      readFileSync(pluginDefaultPath('summary'), 'utf8'),
    );
  });

  it('fails loud for an unknown module name', () => {
    const f = fx();
    const root = f.install('.');
    expect(() =>
      customizeScopeDiscovery({ name: 'no-such-module', startDir: root, at: root, force: false }),
    ).toThrow(/no plugin default/);
  });
});
