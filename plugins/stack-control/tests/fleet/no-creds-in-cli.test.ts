// specs/036-fleet-control-plane — T110 (RED), hardened per AUDIT-20260717-06
// contracts/sidecar-plane-protocol.md § C6: "Credentials live in the sidecar
// only — never in a CLI process, never on the local socket."
//
// DISTINCTION FROM token-not-on-socket.test.ts: that test proves the bearer
// token is never serialized onto the socket wire itself (frame-level guard).
// T110 proves a STRUCTURAL boundary: the token-custody module is not on the
// CLI's IMPORT GRAPH at all. The CLI emit path (src/telemetry/emit.js) does
// NOT load, hold, or touch bearer credentials — they live machine-local in
// the sidecar's custody only.
//
// AUDIT-20260717-06 (fix): the original guard here only read
// src/telemetry/emit.ts and regex-checked THAT ONE FILE for a direct
// reference to the token module. It would have PASSED even if emit.ts
// imported some helper that itself (or transitively) imported
// src/machine-state/token.ts — the credential module would still load into
// every CLI process. The fix below walks the STATIC MODULE IMPORT GRAPH
// transitively from the emit path's entry file, following every relative
// `.js`/`.ts` import, and fails if ANY reachable module resolves to
// src/machine-state/token.ts. A same-file self-check (below) proves the
// walker itself can catch a transitive (2-hop) leak — not just a direct one
// — so the strengthened guard has teeth, not just a wider vacuous scope.
//
// SCOPE NOTE: the walk starts at src/telemetry/emit.ts (the entry the
// finding names), not the whole of src/cli.ts. src/cli.ts statically
// imports EVERY subcommand module for its dispatch table, and some of those
// modules legitimately touch token.ts (e.g. the sidecar daemon reads its own
// custody). Walking from cli.ts's full static import list would flag those
// legitimate, unrelated paths as false positives. The concern this test
// guards — SC-011, "the telemetry emit path never touches credentials" — is
// specifically about the emit path, which is why the finding itself named
// src/telemetry/emit.ts as the walk root. (037 Task 5: `plane provision-token`
// — the prior operator-run credential-placement verb — was deleted; `plane
// serve` now boots against the fleet registry and no longer imports token.ts
// at all.)
//
// Assertions:
//   1. Every module transitively reachable (via static relative imports)
//      from src/telemetry/emit.ts is NOT src/machine-state/token.ts.
//   2. Self-check: the same graph-walker, run against an in-test fixture
//      graph where A -> B -> token-like-module, DOES flag the transitive
//      leak — proving the walker's transitivity is real, not vacuous.
//   3. TOKEN_FILE_MODE === 0o600 — the sidecar-local token file mode.
//   4. TokenCustody.read() returns the token from a real machine-state dir
//      (0o600 file in a real temp dir, no mocked fs).
//
// The assumed API (design for T118 impl to conform to):
//   export interface TokenCustody { read(): string | undefined; }
//   export function openTokenCustody(machineStateDir: string): TokenCustody;
//   export const TOKEN_FILE_MODE = 0o600;
//
// Relative `.js` imports under node16; real filesystem; no `any`, no `as`,
// no `@ts-ignore`.

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Matches a relative import/require/dynamic-import specifier:
 *   import X from './y.js'
 *   import type { X } from '../y.js'
 *   export { X } from './y.js'
 *   export * from './y.js'
 *   require('./y.js')
 *   import('./y.js')
 * Bare/package specifiers (no leading `./` or `../`) are deliberately
 * excluded — they resolve into node_modules, which cannot reach our own
 * source tree, so following them would only add noise to the walk.
 */
const RELATIVE_IMPORT_RE = /(?:from\s+|require\(\s*|import\(\s*)['"](\.\.?\/[^'"]+)['"]/g;

/**
 * Resolve a relative import specifier (as written in source, e.g. './foo.js'
 * or '../bar') against the importing file's directory, into a real path on
 * disk. Source files are `.ts` but node16-resolution specifiers say `.js`
 * (or, in this codebase's dynamic-import test helpers, sometimes bear `.ts`
 * directly) — try both, plus an `index.ts` directory-import fallback.
 */
function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  const dir = dirname(fromFile);
  const withoutExt = specifier.replace(/\.(js|ts|tsx)$/, '');
  const candidates = [
    resolve(dir, `${withoutExt}.ts`),
    resolve(dir, `${withoutExt}.tsx`),
    resolve(dir, withoutExt, 'index.ts'),
    resolve(dir, specifier),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Walk the static module import graph transitively, starting at
 * `entryFile`, following only relative `.js`/`.ts` specifiers. Returns the
 * set of every real file path reachable (including the entry file itself).
 * This is the mechanism AUDIT-20260717-06 requires in place of a single-file
 * regex check: a module is "on the graph" if it is reachable through ANY
 * chain of static imports, not only a direct one.
 */
function collectReachableModules(entryFile: string): Set<string> {
  const visited = new Set<string>();
  const stack = [entryFile];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);

    const source = readFileSync(current, 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT_RE)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveRelativeImport(current, specifier);
      if (resolved !== undefined && !visited.has(resolved)) {
        stack.push(resolved);
      }
    }
  }

  return visited;
}

describe('no credentials in CLI process (T110, C6, SC-011)', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir !== undefined) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('AUDIT-20260717-06 self-check: the graph-walker catches a TRANSITIVE leak (A -> B -> token-like), not just a direct one', () => {
    // Build a tiny fixture graph on disk: fixtureA imports fixtureB, and
    // fixtureB (NOT fixtureA directly) imports a stand-in "token" module.
    // If the walker only checked direct imports of the entry file (the
    // bug AUDIT-20260717-06 identifies), this would NOT be flagged. A
    // correct transitive walker must still find it.
    tempDir = mkdtempSync(join(tmpdir(), 'test-import-graph-'));

    const tokenLikePath = join(tempDir, 'token-like.ts');
    const fixtureBPath = join(tempDir, 'fixture-b.ts');
    const fixtureAPath = join(tempDir, 'fixture-a.ts');

    writeFileSync(tokenLikePath, 'export const CREDENTIAL = "shh";\n', 'utf8');
    writeFileSync(
      fixtureBPath,
      "import { CREDENTIAL } from './token-like.js';\nexport const reexported = CREDENTIAL;\n",
      'utf8',
    );
    writeFileSync(
      fixtureAPath,
      "import { reexported } from './fixture-b.js';\nexport const value = reexported;\n",
      'utf8',
    );

    const reachable = collectReachableModules(fixtureAPath);

    // The walker must have followed fixtureA -> fixtureB -> token-like, two
    // hops deep, proving transitivity actually works.
    expect(reachable.has(fixtureBPath)).toBe(true);
    expect(reachable.has(tokenLikePath)).toBe(true);
  });

  it('CLI emit path (src/telemetry/emit.ts) does NOT transitively reach the token-custody module anywhere on its static import graph', () => {
    const emitSourcePath = resolve(__dirname, '../../src/telemetry/emit.ts');
    const tokenModulePath = resolve(__dirname, '../../src/machine-state/token.ts');

    const reachable = collectReachableModules(emitSourcePath);

    // Structural guard: the token-custody module must not appear ANYWHERE
    // in the transitive graph reachable from the emit path's entry file —
    // not as a direct import, and not N hops away through a helper.
    expect(reachable.has(tokenModulePath)).toBe(false);

    // Belt-and-suspenders: also confirm none of the reachable files
    // reference the token module's known exports by name (catches a
    // same-directory copy/paste of the credential-reading logic that
    // wouldn't show up as an import of token.ts itself).
    for (const file of reachable) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/TokenCustody|openTokenCustody|TOKEN_FILE_MODE/);
    }
  });

  it('TOKEN_FILE_MODE is 0o600 — the machine-local durable token file mode', async () => {
    // RED phase: token.ts does not exist. This test will fail with ModuleNotFoundError.
    // After T118 lands, it will pass.
    const { TOKEN_FILE_MODE } = await import(
      '../../src/machine-state/token.ts'
    );
    expect(TOKEN_FILE_MODE).toBe(0o600);
  });

  it('openTokenCustody.read() returns undefined when no token file exists', async () => {
    const { openTokenCustody } = await import(
      '../../src/machine-state/token.ts'
    );

    // Create a fresh temp dir with no token file inside.
    tempDir = mkdtempSync(join(tmpdir(), 'test-token-custody-'));

    const custody = openTokenCustody(tempDir);
    const result = custody.read();

    // No token file present → read() returns undefined (not throw).
    expect(result).toBeUndefined();
  });

  it('openTokenCustody.read() returns the seeded token from a real 0o600 file', async () => {
    const { openTokenCustody, TOKEN_FILE_MODE } = await import(
      '../../src/machine-state/token.ts'
    );

    // Create a fresh temp dir and write a token file at the expected location.
    tempDir = mkdtempSync(join(tmpdir(), 'test-token-custody-'));

    const testToken = 'sk-fleet-test-token-abc123def456';
    const tokenFilePath = join(tempDir, 'bearer-token');

    // Write with 0o600 mode (the contract).
    writeFileSync(tokenFilePath, testToken, {
      encoding: 'utf8',
      mode: TOKEN_FILE_MODE,
    });

    const custody = openTokenCustody(tempDir);
    const result = custody.read();

    // The seeded token is returned.
    expect(result).toBe(testToken);
  });

  it('TokenCustody interface surface is correct (no excessive properties)', async () => {
    const { openTokenCustody } = await import(
      '../../src/machine-state/token.ts'
    );

    tempDir = mkdtempSync(join(tmpdir(), 'test-token-custody-'));
    const custody = openTokenCustody(tempDir);

    // Verify the interface: read() method exists and is callable.
    expect(typeof custody.read).toBe('function');

    // Call it (should return undefined on empty dir).
    const result = custody.read();
    expect(result === undefined || typeof result === 'string').toBe(true);

    // No extraneous surface (no token property, no bearer, etc.).
    expect(Object.prototype.hasOwnProperty.call(custody, 'token')).toBe(false);
  });
});
