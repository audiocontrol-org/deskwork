// US2 — no installation, no write: fail loud (specs/installation-isolation;
// contracts §refusal, SC-005).
//
// In a repository with NO enclosing installation, every state-writing verb
// refuses with the uniform wording class —
//   `<verb>: FATAL — no stack-control installation found from <start-dir>
//    (no .stack-control/config.yaml at or above it) — run \`stackctl setup\``
// — exits non-zero, and creates ZERO new state anywhere (no fallback to the
// git toplevel, the cwd, or any other location).

import { describe, expect, it } from 'vitest';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';
import {
  diffSnapshots,
  makeMarkerlessFixture,
  snapshotOutsideInstallation,
  type NestedFixture,
} from './_isolation-harness.js';

interface RefusalRow {
  /** The `<verb>:` stderr prefix the uniform refusal carries. */
  readonly verb: string;
  readonly name: string;
  readonly args: (fixture: NestedFixture) => string[];
  readonly env?: Record<string, string>;
}

const ROWS: readonly RefusalRow[] = [
  {
    verb: 'audit-barrage',
    name: 'audit-barrage',
    args: (fixture) => [
      'audit-barrage',
      '--feature',
      'iso-refusal',
      '--prompt-file',
      join(fixture.outerRoot, 'README.md'),
    ],
  },
  {
    verb: 'audit-barrage-lift',
    name: 'audit-barrage-lift',
    args: (fixture) => [
      'audit-barrage-lift',
      '--feature',
      'iso-refusal',
      '--run-dir',
      join(fixture.outerRoot, 'no-such-run-dir'),
    ],
  },
  {
    verb: 'scope-widen',
    name: 'scope-widen',
    args: () => ['scope-widen', 'a complaint', '--slug', 'iso-refusal'],
  },
  {
    verb: 'scope-inventory',
    name: 'scope-inventory',
    args: () => ['scope-inventory', '--slug', 'iso-refusal'],
  },
  {
    verb: 'slush-findings',
    name: 'slush-findings',
    args: () => ['slush-findings', '--feature', 'iso-refusal'],
  },
  {
    verb: 'install-scope-discovery',
    name: 'install-scope-discovery',
    args: () => ['install-scope-discovery'],
  },
  {
    verb: 'backlog',
    name: 'backlog capture',
    args: () => ['backlog', 'capture', 'refusal probe item', '--type', 'bug'],
    env: { STACKCTL_BACKLOG_DIR: '' },
  },
  {
    verb: 'backlog',
    name: 'backlog import-github',
    args: () => ['backlog', 'import-github', '--apply'],
    env: { STACKCTL_BACKLOG_DIR: '' },
  },
];

describe('US2 — no installation, no write: uniform loud refusal', () => {
  it.each(ROWS.map((row) => [row.name, row] as const))(
    '%s refuses, names the start dir + stackctl setup, writes nothing',
    (_name, row) => {
      const fixture = makeMarkerlessFixture();
      try {
        const before = snapshotOutsideInstallation(fixture);
        const res = runCli(row.args(fixture), {
          cwd: fixture.outerRoot,
          ...(row.env !== undefined ? { env: row.env } : {}),
        });
        expect(res.status, `stderr was:\n${res.stderr}`).not.toBe(0);
        expect(res.stderr).toContain(`${row.verb}: FATAL — `);
        // realpath: the spawned verb sees the macOS-resolved /private/… cwd.
        expect(res.stderr).toContain(
          `no stack-control installation found from ${realpathSync(fixture.outerRoot)}`,
        );
        expect(res.stderr).toContain('stackctl setup');
        const after = snapshotOutsideInstallation(fixture);
        expect(
          diffSnapshots(before, after),
          'refused verb still created state (US2: there is no fallback write location)',
        ).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );
});
