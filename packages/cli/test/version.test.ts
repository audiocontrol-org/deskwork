/**
 * `deskwork --version` / `-v` / `version` (#256).
 *
 * Before this fix, all three forms hit the subcommand parser and exited 2
 * with "unknown subcommand". An operator triaging a friction had no quick
 * way to attach the running version. Spawns the built dist (the artifact
 * adopters actually run) and asserts the version banner on stdout.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIST = join(__dirname, '..', 'dist', 'cli.js');

function runVersion(arg: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('node', [CLI_DIST, arg], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('deskwork version reporting (#256)', () => {
  for (const arg of ['--version', '-v', 'version']) {
    it(`\`deskwork ${arg}\` prints the @deskwork/cli + @deskwork/core versions and exits 0`, () => {
      const r = runVersion(arg);
      expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/@deskwork\/cli\s+\d+\.\d+\.\d+/);
      expect(r.stdout).toMatch(/@deskwork\/core\s+\d+\.\d+\.\d+/);
      expect(r.stdout).not.toMatch(/unknown subcommand/);
    });
  }
});
