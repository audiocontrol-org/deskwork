// US5 — legacy out-of-tree state is detected and announced
// (specs/installation-isolation; research R6; contracts §notices).
//
// A marker-less `.stack-control/` at the derived git toplevel, with the
// real installation below it (this repo's own half-installation shape),
// produces the three-part notice — what was found and IGNORED, what is
// actually read/written, safe migration advice — once per invocation,
// from the shared resolver, on every resolving verb. No legacy state →
// no notice (no cry-wolf). The advice never names an existing tuned file
// as an overwrite target (the audit-protocol-reliability AUDIT-09/-15
// lesson), and writes never land at the legacy location.

import { describe, expect, it } from 'vitest';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';
import { resolveInstallation } from '../config/installation.js';
import {
  diffSnapshots,
  makeNestedFixture,
  snapshotOutsideInstallation,
  type NestedFixture,
} from './_isolation-harness.js';

const WARNING_RE = /WARNING — legacy stack-control state present and IGNORED at /;

/** Marker-less legacy debris at the outer root (config + run dirs). */
function plantLegacyState(fixture: NestedFixture): void {
  fixture.writeOuter(
    '.stack-control/audit-barrage-config.yaml',
    'models:\n  - name: tuned\n    binary: echo\n    args_template: "x {{prompt}}"\n    timeout_seconds: 60\n',
  );
  fixture.writeOuter(
    '.stack-control/audit-runs/20260601T000000000Z-old/INDEX.md',
    'old run\n',
  );
}

interface NoticeRow {
  readonly name: string;
  readonly args: (fixture: NestedFixture) => string[];
  readonly env?: Record<string, string>;
}

const ROWS: readonly NoticeRow[] = [
  {
    name: 'install-scope-discovery',
    args: () => ['install-scope-discovery'],
  },
  {
    name: 'backlog capture',
    args: () => ['backlog', 'capture', 'legacy notice probe', '--type', 'bug'],
    env: { STACKCTL_BACKLOG_DIR: '' },
  },
  {
    name: 'scope-export',
    args: () => ['scope-export', '--slug', 'nope'],
  },
];

describe('US5 — legacy half-installation notice (R6)', () => {
  it.each(ROWS.map((row) => [row.name, row] as const))(
    '%s emits the three-part notice exactly once and never writes to the legacy location',
    (_name, row) => {
      const fixture = makeNestedFixture();
      try {
        plantLegacyState(fixture);
        const before = snapshotOutsideInstallation(fixture);
        const res = runCli(row.args(fixture), {
          cwd: fixture.installationRoot,
          ...(row.env !== undefined ? { env: row.env } : {}),
        });
        // Part 1: the legacy location, named and marked IGNORED.
        expect(res.stderr).toMatch(WARNING_RE);
        expect(res.stderr).toContain('.stack-control (no config.yaml marker)');
        // Part 2: where reads/writes actually go (realpath: the child
        // process sees the macOS-resolved /private/… spelling).
        expect(res.stderr).toContain(
          `reading/writing under ${join(realpathSync(fixture.installationRoot), '.stack-control')}`,
        );
        // Part 3: safe migration advice — never a destructive command
        // naming an existing tuned file as the destination (AUDIT-09/-15).
        expect(res.stderr).toContain('migrate by moving the legacy files into the installation');
        expect(res.stderr).not.toContain(
          `mv ${join(fixture.outerRoot, '.stack-control', 'audit-barrage-config.yaml')} ${join(fixture.installationRoot, '.stack-control', 'audit-barrage-config.yaml')}`,
        );
        // Once per invocation.
        const fires = res.stderr.match(new RegExp(WARNING_RE.source, 'g')) ?? [];
        expect(fires.length).toBe(1);
        // Writes never target the legacy location (outer tree untouched).
        const after = snapshotOutsideInstallation(fixture);
        expect(diffSnapshots(before, after)).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    },
    120_000,
  );

  it('no legacy state → no notice (no cry-wolf)', () => {
    const fixture = makeNestedFixture();
    try {
      const res = runCli(['install-scope-discovery'], {
        cwd: fixture.installationRoot,
      });
      expect(res.status).toBe(0);
      expect(res.stderr).not.toMatch(WARNING_RE);
    } finally {
      fixture.cleanup();
    }
  }, 120_000);

  // AUDIT-20260611-05 — "once per invocation" must hold at OPERATOR
  // granularity, not process granularity: `stackctl govern` spawns child
  // stackctl processes (audit-barrage / lift / slush — protocol.ts
  // spawnText, which inherits process.env), and each child re-resolves the
  // installation. The cross-process carrier is an environment latch: the
  // resolver SETS STACKCTL_LEGACY_NOTICE_SEEN=1 when the notice fires, and
  // SKIPS the notice when it arrives already set.
  it('the env latch suppresses the notice in child processes (AUDIT-20260611-05)', () => {
    const fixture = makeNestedFixture();
    try {
      plantLegacyState(fixture);
      const res = runCli(['install-scope-discovery'], {
        cwd: fixture.installationRoot,
        env: { STACKCTL_LEGACY_NOTICE_SEEN: '1' },
      });
      expect(res.status).toBe(0);
      expect(res.stderr).not.toMatch(WARNING_RE);
    } finally {
      fixture.cleanup();
    }
  }, 120_000);

  it('the resolver SETS the env latch when the notice fires (AUDIT-20260611-05)', () => {
    const fixture = makeNestedFixture();
    const saved = process.env.STACKCTL_LEGACY_NOTICE_SEEN;
    delete process.env.STACKCTL_LEGACY_NOTICE_SEEN;
    try {
      plantLegacyState(fixture);
      // In-process resolve against the legacy fixture: the notice fires
      // (first resolve in this vitest process) and must plant the latch
      // that spawned children will inherit.
      resolveInstallation(fixture.installationRoot);
      expect(process.env.STACKCTL_LEGACY_NOTICE_SEEN).toBe('1');
    } finally {
      // Restore: later tests in this file spawn children that inherit
      // process.env — a leaked latch would suppress their notices.
      if (saved === undefined) delete process.env.STACKCTL_LEGACY_NOTICE_SEEN;
      else process.env.STACKCTL_LEGACY_NOTICE_SEEN = saved;
      fixture.cleanup();
    }
  }, 120_000);

  it('a MARKED outer .stack-control (a real enclosing installation) is not legacy: no notice', () => {
    const fixture = makeNestedFixture();
    try {
      // The outer root carries a real installation marker — nested
      // installations are the 009 nearest-wins model, not debris.
      fixture.writeOuter('.stack-control/config.yaml', 'version: 1\n');
      const res = runCli(['install-scope-discovery'], {
        cwd: fixture.installationRoot,
      });
      expect(res.status).toBe(0);
      expect(res.stderr).not.toMatch(WARNING_RE);
    } finally {
      fixture.cleanup();
    }
  }, 120_000);
});
