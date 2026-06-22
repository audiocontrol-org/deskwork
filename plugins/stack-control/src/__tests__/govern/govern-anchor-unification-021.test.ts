// specs/021-audit-protocol-friction-burndown — T023/T024 (US4), backlog TASK-45/56.
//
// One-anchor invariant for the COMPOSITE govern run: when govern is invoked from
// OUTSIDE the installation (cwd = outer repo, installation selected via `--at`),
// EVERY sub-step — payload assembly, barrage, lift, slush, gate, clone-step —
// must resolve its state under the installation, never the cwd. The existing
// govern-installation-anchor.test.ts proves the payload + barrage/render carry
// the anchor; this proves the *aggregate*: the outer tree outside the
// installation is byte-identical after a full run (no sub-step leaked to cwd),
// and the lift's audit-log write landed inside the installation.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../_run-helpers.js';
import {
  gitIn,
  makeNestedFixture,
  seedDefaultFleetKnowledge,
  snapshotOutsideInstallation,
  diffSnapshots,
} from '../_isolation-harness.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';

/** Stub barrage for the 030 end-govern pipeline: render writes the prompt, barrage
 * prints the run-dir holding one HIGH model finding (so the pipeline surfaces it as
 * override-eligible and lift-once writes a section INTO the installation's audit-log —
 * the anchor invariant under test). The new path never drives audit-barrage-lift. */
function writeStub(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  writeFileSync(
    stub,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'verb="$1"; shift',
      'output=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    --output) output="$2"; shift 2 ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      'case "$verb" in',
      '  audit-barrage-render)',
      '    [ -n "$output" ] && printf "stub prompt\\n" > "$output" || true',
      '    exit 0 ;;',
      '  audit-barrage)',
      '    rd="${STUB_RUN_DIR:?STUB_RUN_DIR required}-$$-${RANDOM}"',
      '    mkdir -p "$rd"',
      '    {',
      '      printf "### Anchor stub finding\\n\\n"',
      '      printf "Finding-ID: claude-01\\nStatus: open\\nSeverity: high\\nSurface: src/f0.ts:1\\n\\nBody.\\n"',
      '    } > "$rd/model-stub.md"',
      '    printf "%s\\n" "$rd"',
      '    exit 0 ;;',
      '  *) echo "stub-barrage: unknown verb $verb" >&2; exit 3 ;;',
      'esac',
      '',
    ].join('\n'),
    'utf8',
  );
  chmodSync(stub, 0o755);
  return stub;
}

describe('US4 — govern one-anchor unification under nesting (T023/T024)', () => {
  it('a full govern run from the outer root writes nothing outside the installation', () => {
    const fixture = makeNestedFixture();
    const fx = mkdtempSync(join(tmpdir(), 'gov-anchor-uni-'));
    try {
      seedDefaultFleetKnowledge(fixture.installationRoot);
      const auditLogRel = 'docs/1.0/001-IN-PROGRESS/feat/audit-log.md';
      fixture.writeInstallation(auditLogRel, '# Audit Log — feat\n');
      // 030 US9: the whole-feature pipeline keys its convergence record by the
      // roadmap node id, so the installation needs a node whose `spec:` names the
      // feature dir (else resolveConvergenceItem FATALs — exit 2 — before the run).
      fixture.writeInstallation(
        'ROADMAP.md',
        [
          '---',
          'doc-grammar: roadmap',
          '---',
          '',
          '# Roadmap',
          '',
          '## impl:feature/feat',
          '',
          '- status: in-flight',
          '- spec: docs/1.0/001-IN-PROGRESS/feat',
          '',
          'feat scope prose.',
          '',
        ].join('\n'),
      );
      // Substantive source so the clone-step's jscpd run has real files.
      for (const n of [0, 1]) {
        const lines = Array.from({ length: 30 }, (_, i) => `export const v${n}_${i} = ${i} * ${n + 2};`);
        fixture.writeInstallation(`src/f${n}.ts`, `${lines.join('\n')}\n`);
      }
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'feature scaffold']);

      // Snapshot the outer tree (excludes the installation subtree + .git) BEFORE.
      const before = snapshotOutsideInstallation(fixture);

      const stub = writeStub(fx);
      const r = spawnSync(
        resolveTsx(),
        [CLI, 'govern', '--mode', 'implement', '--feature', 'feat', '--at', fixture.installationRoot, '--diff-base', 'HEAD~1'],
        {
          encoding: 'utf8',
          cwd: fixture.outerRoot,
          env: {
            ...process.env,
            GOVERN_BARRAGE_BIN: stub,
            // Hermetic fleet: mark lanes available so a CLI-less env (CI) reaches
            // the full govern run under test instead of short-circuiting on the
            // lane-availability probe (negotiation-failed). See TASK-132.
            GOVERN_FLEET_AVAILABLE: '*',
            STUB_RUN_DIR: join(fx, 'run'),
            // Backlog slush destination isolated to a fresh tmp dir so the test
            // never writes the committed dogfood pile (and so a leak would show
            // as a NEW outer-tree path, not a silent backlog write).
            STACKCTL_BACKLOG_DIR: tmpBacklog(),
          },
        },
      );
      // The gate verdict (OPEN/BLOCKED, exit 0/1) is orthogonal to the anchor
      // invariant under test; a FATAL (exit 2) would signal a real resolution /
      // anchor failure, so only that is disqualifying here.
      expect(r.status, `stderr was:\n${r.stderr}`).not.toBe(2);

      // (1) Lift anchored to the installation: lift-once wrote its section + a
      // fresh AUDIT-<date> finding into the installation's audit-log, not anywhere
      // in the outer tree (the specific id is date-derived now, not hardcoded).
      const auditLog = readFileSync(join(fixture.installationRoot, auditLogRel), 'utf8');
      expect(auditLog).toMatch(/AUDIT-\d{8}-\d+/);

      // (2) One-anchor: the outer tree outside the installation is byte-identical
      // after the full run — no sub-step (payload, barrage, lift, slush, gate,
      // clone-step) leaked a write to the cwd.
      const after = snapshotOutsideInstallation(fixture);
      const delta = diffSnapshots(before, after);
      expect(delta, `outer-tree writes leaked:\n${delta.join('\n')}`).toEqual([]);
    } finally {
      fixture.cleanup();
      rmSync(fx, { recursive: true, force: true });
    }
  }, 120_000);
});
