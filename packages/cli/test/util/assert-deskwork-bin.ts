/**
 * Shared precondition helper for CLI integration tests that spawn the
 * real `deskwork` binary.
 *
 * AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3). Previously,
 * every test helper (lane/, pipeline/, group/, plus two test files with
 * inlined copies) checked only `existsSync(deskworkBin)`. That left two
 * silent-failure modes:
 *
 *   1. The bin exists but resolves to a stale standalone copy (not the
 *      workspace symlink). Tests pass against yesterday's compiled CLI
 *      while reporting green.
 *   2. The error message said "run npm install" only. A missing-bin
 *      failure caused by a never-built `packages/cli/dist/` directory
 *      (workspace symlink target absent) sent the operator down the
 *      wrong remediation path.
 *
 * This helper centralizes the precondition and tightens both axes:
 *
 *   - Verifies the bin file exists.
 *   - Verifies the bin's resolved (`realpath`) target lives under the
 *     monorepo's `packages/cli/dist/` directory — i.e. it's the
 *     workspace-symlinked freshly-built CLI, not a standalone npm-
 *     installed copy or some other artifact.
 *   - On any failure, the error message names BOTH `npm install` AND
 *     `npm run build` (the build step rebuilds the workspace target the
 *     bin symlink resolves to).
 */

import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const utilDir = dirname(fileURLToPath(import.meta.url));
// test/util/ -> packages/cli/test/util/ -> workspace root is four levels up.
const workspaceRoot = resolve(utilDir, '../../../..');

/** Absolute path to the `deskwork` bin shim in the workspace node_modules. */
export const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

/**
 * Expected workspace-symlink target prefix. The bin shim at
 * `node_modules/.bin/deskwork` is a relative symlink pointing at
 * `../@deskwork/cli/dist/cli.js`. The middle directory
 * (`node_modules/@deskwork/cli`) is itself a workspace symlink to
 * `packages/cli`. So `realpath` resolves through both hops and lands
 * under `packages/cli/dist/`. A standalone copy installed into
 * `node_modules/@deskwork/cli/dist/cli.js` (no workspace symlink)
 * would resolve under `node_modules/`, not `packages/`.
 */
const expectedWorkspaceCliDist = join(workspaceRoot, 'packages/cli/dist');

/**
 * Defensive precondition for CLI integration tests: confirm the
 * `deskwork` bin is present AND reflects the workspace's current
 * `packages/cli/dist/` build — not a stale standalone copy.
 *
 * Throws with an actionable error message naming the two remediation
 * commands when either invariant fails. Call once per test file from
 * a `beforeAll(() => { ... })`. The check is two filesystem syscalls
 * and is effectively free.
 */
export function assertDeskworkBinPresent(): void {
  if (!existsSync(deskworkBin)) {
    throw new Error(
      `deskwork binary not found at ${deskworkBin} — run \`npm install\` `
        + `at the workspace root, then \`npm --workspace @deskwork/cli run `
        + `build\` to compile the CLI before running integration tests.`,
    );
  }
  let resolved: string;
  try {
    resolved = realpathSync(deskworkBin);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `deskwork binary at ${deskworkBin} failed to resolve (${message}) — `
        + `the symlink target is missing. Run \`npm --workspace `
        + `@deskwork/cli run build\` to rebuild `
        + `${expectedWorkspaceCliDist}/cli.js.`,
    );
  }
  if (!resolved.startsWith(expectedWorkspaceCliDist)) {
    throw new Error(
      `deskwork binary at ${deskworkBin} resolves to ${resolved}, which is `
        + `not under the workspace's ${expectedWorkspaceCliDist}/ directory `
        + `— the bin is not the workspace-symlinked freshly-built CLI. `
        + `Integration tests would run against stale or unrelated code. `
        + `Run \`npm install\` then \`npm --workspace @deskwork/cli run `
        + `build\` to restore the workspace symlink + dist.`,
    );
  }
}
