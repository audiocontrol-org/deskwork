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
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';
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
        // Part 2: where reads/writes actually go.
        expect(res.stderr).toContain(
          `reading/writing under ${join(fixture.installationRoot, '.stack-control')}`,
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
