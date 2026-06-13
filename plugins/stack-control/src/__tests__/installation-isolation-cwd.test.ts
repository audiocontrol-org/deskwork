// US4 — the working directory never decides placement
// (specs/installation-isolation; SC-003; TASK-40 generalized).
//
// Three-cwd invariance: the same state-writing verb invoked from (a) the
// installation root, (b) a subdirectory of it, and (c) the outer repo
// with an explicit `--at` anchor places state at the SAME paths inside
// the installation. cwd's only sanctioned role is the default start
// point of the walk-up.
//
// The slush-destination row is the recorded divergence class: the verb's
// audit-log target resolves through `--at`, but its backlog DESTINATION
// resolved through a `process.cwd()` walk-up — the same command placing
// the two halves of one operation in different trees depending on the
// shell it ran from.

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';
import { makeNestedFixture, type NestedFixture } from './_isolation-harness.js';

/**
 * The set of paths (relative to the installation root) a run created,
 * with timestamped run-dir segments normalized — placement identity,
 * independent of when the run happened.
 */
function placementPaths(fixture: NestedFixture): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = rel === '' ? fixture.installationRoot : join(fixture.installationRoot, rel);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        out.push(`${childRel}/`);
        walk(childRel);
      } else {
        out.push(childRel);
      }
    }
  };
  walk('');
  return out
    .map((p) =>
      p
        .split('/')
        .map((seg) => (/^\d{8}T\d+Z/.test(seg) ? 'TS' : seg))
        .join('/'),
    )
    .sort();
}

interface CwdVariant {
  readonly label: string;
  readonly cwd: (fixture: NestedFixture) => string;
  readonly extraArgs: (fixture: NestedFixture) => string[];
}

const THREE_CWDS: readonly CwdVariant[] = [
  {
    label: 'installation root',
    cwd: (f) => f.installationRoot,
    extraArgs: () => [],
  },
  {
    label: 'installation subdirectory',
    cwd: (f) => join(f.installationRoot, 'nested', 'deeper'),
    extraArgs: () => [],
  },
  {
    label: 'outer repo with --at',
    cwd: (f) => f.outerRoot,
    extraArgs: (f) => ['--at', f.installationRoot],
  },
];

function runVariant(
  variant: CwdVariant,
  baseArgs: string[],
  env?: Record<string, string>,
): string[] {
  const fixture = makeNestedFixture();
  try {
    mkdirSync(join(fixture.installationRoot, 'nested', 'deeper'), {
      recursive: true,
    });
    const res = runCli([...baseArgs, ...variant.extraArgs(fixture)], {
      cwd: variant.cwd(fixture),
      ...(env !== undefined ? { env } : {}),
    });
    expect(res.status, `[${variant.label}] stderr:\n${res.stderr}`).toBe(0);
    return placementPaths(fixture);
  } finally {
    fixture.cleanup();
  }
}

describe('US4 — three-cwd invariance (SC-003)', () => {
  it('install-scope-discovery places identical state from all three working directories', () => {
    const [a, b, c] = THREE_CWDS.map((v) =>
      runVariant(v, ['install-scope-discovery']),
    );
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  }, 120_000);

  it('backlog capture places identical state from the installation root and a subdirectory', () => {
    const variants = THREE_CWDS.slice(0, 2); // backlog has no --at by contract
    const [a, b] = variants.map((v) =>
      runVariant(
        v,
        ['backlog', 'capture', 'cwd-invariance item', '--type', 'bug'],
        { STACKCTL_BACKLOG_DIR: '' },
      ),
    );
    expect(b).toEqual(a);
  }, 120_000);
});

describe('US4 — the slush destination follows the --at anchor, never the cwd (TASK-40 class)', () => {
  it('slush-findings --at <installation> from the outer repo migrates into the installation store', () => {
    const fixture = makeNestedFixture();
    try {
      // Scaffold the installation's backlog store (one captured seed item).
      const seed = runCli(
        ['backlog', 'capture', 'store seed', '--type', 'bug'],
        { cwd: fixture.installationRoot, env: { STACKCTL_BACKLOG_DIR: '' } },
      );
      expect(seed.status, seed.stderr).toBe(0);

      // An engaged dampener: latest lift section is 0-HIGH/0-MED with one
      // open LOW — the parked flip the rewire migrates to the backlog.
      fixture.writeInstallation(
        'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
        [
          '# Audit Log — feat',
          '',
          '## 2026-06-07 — audit-barrage lift (20260607T100000000Z-feat-after_clarify)',
          '',
          '### Residual low finding',
          '',
          'Finding-ID: AUDIT-20260607-01',
          'Status:     open',
          'Severity:   low',
          'Surface:    spec.md:1',
          '',
          'Body.',
          '',
        ].join('\n'),
      );

      const r = runCli(
        [
          'slush-findings',
          '--feature',
          'feat',
          '--at',
          fixture.installationRoot,
          '--slush-date',
          '2026-06-07',
          '--apply',
        ],
        { cwd: fixture.outerRoot, env: { STACKCTL_BACKLOG_DIR: '' } },
      );
      expect(r.status, `stderr:\n${r.stderr}`).toBe(0);

      const log = readFileSync(
        join(fixture.installationRoot, 'docs/1.0/001-IN-PROGRESS/feat/audit-log.md'),
        'utf8',
      );
      expect(log).toMatch(/Status:\s+migrated-to-backlog TASK-\d+/);
      // The migrated item landed in the INSTALLATION's store (the seed is
      // task 1; the migration adds a second task file).
      const tasksDir = join(
        fixture.installationRoot,
        '.stack-control',
        'backlog',
        'tasks',
      );
      expect(readdirSync(tasksDir).length).toBeGreaterThan(1);
    } finally {
      fixture.cleanup();
    }
  }, 120_000);
});
