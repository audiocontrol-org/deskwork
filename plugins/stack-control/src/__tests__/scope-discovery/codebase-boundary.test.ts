// T004 RED — the per-codebase boundary resolver (the novel behavior on top of
// the port). Pins data-model § CodebaseBoundary + FR-007:
//   - default = nearest-enclosing .stack-control installation (009 walk-up)
//   - nested child installations are excluded from the scan
//   - explicit --root override is honored
//   - NO process.cwd() fallback: fail loud when no installation is found

import { describe, it, expect, afterEach } from 'vitest';
import { join, resolve as resolvePath } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { resolveCodebaseBoundary } from '../../scope-discovery/codebase-boundary.js';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('resolveCodebaseBoundary', () => {
  it('resolves to the nearest-enclosing installation root from a nested start dir', () => {
    fx = makeFixture();
    const a = fx.install('a');
    fx.writeFile('a/src/deep/leaf.ts', 'export const x = 1;\n');

    const boundary = resolveCodebaseBoundary({ startDir: join(a, 'src', 'deep') });

    expect(boundary.installationRoot).toBe(resolvePath(a));
    expect(boundary.explicitOverride).toBeNull();
  });

  it('excludes nested child-installation subtrees from the boundary', () => {
    fx = makeFixture();
    const a = fx.install('a');
    const child = fx.install('a/packages/child');
    fx.writeFile('a/src/top.ts', 'export const x = 1;\n');

    const boundary = resolveCodebaseBoundary({ startDir: a });

    expect(boundary.installationRoot).toBe(resolvePath(a));
    expect(boundary.excludedChildren).toContain(resolvePath(child));
  });

  it('does NOT list the boundary root itself as an excluded child', () => {
    fx = makeFixture();
    const a = fx.install('a');

    const boundary = resolveCodebaseBoundary({ startDir: a });

    expect(boundary.excludedChildren).not.toContain(resolvePath(a));
  });

  it('honors an explicit --root override and records it', () => {
    fx = makeFixture();
    fx.install('a');
    const b = fx.install('b');

    const boundary = resolveCodebaseBoundary({ startDir: fx.root, explicitRoot: b });

    expect(boundary.installationRoot).toBe(resolvePath(b));
    expect(boundary.explicitOverride).toBe(resolvePath(b));
  });

  it('fails loud (no cwd fallback) when no installation is found', () => {
    fx = makeFixture(); // bare tree, NO .stack-control anywhere
    fx.writeFile('loose/file.ts', 'export const x = 1;\n');

    expect(() => resolveCodebaseBoundary({ startDir: join(fx!.root, 'loose') })).toThrow(
      /no stack-control installation/i,
    );
  });
});
