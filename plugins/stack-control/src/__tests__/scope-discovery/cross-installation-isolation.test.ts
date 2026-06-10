/**
 * 010 T080 — cross-installation isolation (SC-004 clause b).
 *
 * With TWO sibling stack-control installations A and B, a registry write /
 * install scoped to A leaves B's `.stack-control/scope-discovery/` byte-for-
 * byte unchanged. GREEN is satisfied by boundary-scoped writes (every verb
 * resolves the enclosing installation and writes only under it). On-disk
 * fixtures only.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { install } from '../../scope-discovery/install-scope-discovery.js';
import { customizeScopeDiscovery } from '../../scope-discovery/customize.js';

const SD_REL = '.stack-control/scope-discovery';

let fixtures: Fixture[] = [];
function fx(): Fixture {
  const f = makeFixture('sd-isolation-');
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

/** Snapshot every file under a dir as {relPath -> content}; empty when absent. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (cur: string, prefix: string): void => {
    if (!existsSync(cur)) return;
    for (const name of readdirSync(cur)) {
      const abs = join(cur, name);
      const rel = prefix === '' ? name : `${prefix}/${name}`;
      if (statSync(abs).isDirectory()) walk(abs, rel);
      else out[rel] = readFileSync(abs, 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

describe('cross-installation isolation (SC-004 clause b)', () => {
  it('install into A leaves B byte-for-byte unchanged', () => {
    const f = fx();
    const a = f.install('proj-a');
    const b = f.install('proj-b');
    // Pre-populate B so there is a non-empty baseline to compare against.
    install({ startDir: b, at: b, force: false, dryRun: false });
    const bBefore = snapshot(join(b, SD_REL));
    expect(Object.keys(bBefore).length).toBeGreaterThan(0);

    // Now install into A.
    install({ startDir: a, at: a, force: false, dryRun: false });
    expect(existsSync(join(a, SD_REL, 'clones.yaml'))).toBe(true);

    // B is untouched.
    expect(snapshot(join(b, SD_REL))).toEqual(bBefore);
  });

  it('install resolved via walk-up from inside A does not reach into B', () => {
    const f = fx();
    const a = f.install('proj-a');
    const b = f.install('proj-b');
    install({ startDir: b, at: b, force: false, dryRun: false });
    const bBefore = snapshot(join(b, SD_REL));

    // Walk-up from a nested dir inside A (no --at): must resolve to A only.
    f.writeFile('proj-a/src/deep/x.ts', 'export const x = 1;\n');
    const result = install({
      startDir: join(a, 'src', 'deep'),
      at: null,
      force: false,
      dryRun: false,
    });
    expect(result.installationRoot).toBe(a);
    expect(snapshot(join(b, SD_REL))).toEqual(bBefore);
  });

  it('customize override into A does not touch B', () => {
    const f = fx();
    const a = f.install('proj-a');
    const b = f.install('proj-b');
    install({ startDir: b, at: b, force: false, dryRun: false });
    const bBefore = snapshot(join(b, SD_REL));

    customizeScopeDiscovery({ name: 'summary', startDir: a, at: a, force: false });
    expect(existsSync(join(a, SD_REL, 'summary.ts'))).toBe(true);
    expect(existsSync(join(b, SD_REL, 'summary.ts'))).toBe(false);
    expect(snapshot(join(b, SD_REL))).toEqual(bBefore);
  });
});
