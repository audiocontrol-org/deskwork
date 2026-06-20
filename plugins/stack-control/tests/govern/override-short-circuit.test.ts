// specs/029-govern-operability — Phase 4 / US4 (T027, RED → T028 GREEN).
//
// FR-017/018: `govern --override "<reason>"` MUST short-circuit the convergence
// pass entirely — record the override reason in the audit trail and graduate,
// firing ZERO render/barrage/lift/slush passes. The override is per-invocation
// short-circuit only (it persists no fingerprint-keyed marker) and is
// attributable in the audit trail (distinguishable from a convergence
// graduation — the "OPEN by override" record).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../../src/__tests__/_run-helpers.js';
import { seedDefaultFleetKnowledge } from '../../src/__tests__/_isolation-harness.js';
import { tmpBacklog } from '../backlog/helpers.js';

// A barrage stub that TOUCHES a marker the moment ANY verb is invoked. The
// override short-circuit must NEVER spawn it, so the marker must NOT exist.
function writeMarkerStub(dir: string, marker: string): string {
  const stub = join(dir, 'marker-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `touch "${marker}"`,
    'echo "marker-barrage: should never run under --override" >&2',
    'exit 1',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

function makeRepo(slug: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-override-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  seedDefaultFleetKnowledge(repo);
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  return repo;
}

function runGovern(args: string[], env: Record<string, string>) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      STACKCTL_BACKLOG_DIR: tmpBacklog(),
      GOVERN_FLEET_AVAILABLE: '*',
      ...env,
    },
  });
}

describe('govern --override short-circuit (US4, T027, FR-017/018)', () => {
  it('fires 0 barrage runs, records an attributable override graduation, exits 0', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        [
          '--mode',
          'spec',
          '--feature',
          'feat',
          '--at',
          repo,
          '--spec-path',
          spec,
          '--override',
          'operator accepts residual',
        ],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run') },
      );
      // The barrage stub must NOT have run — zero render/barrage/lift/slush.
      expect(existsSync(marker)).toBe(false);
      // No audit-run dir was produced.
      expect(existsSync(join(fx, 'run'))).toBe(false);
      // Graduated.
      expect(r.status).toBe(0);
      // Attributable: the "OPEN by override" record names the reason.
      expect(`${r.stdout}${r.stderr}`).toMatch(/override/i);
      expect(`${r.stdout}${r.stderr}`).toMatch(/operator accepts residual/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('the override does NOT persist a marker across invocations (per-invocation only, FR-018)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--at', repo, '--spec-path', spec, '--override', 'r'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run') },
      );
      // No fingerprint-keyed override marker is written under the installation's
      // govern state dir — the short-circuit is per-invocation only.
      const overrideDir = join(repo, '.stack-control', 'govern', 'override');
      expect(existsSync(overrideDir)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
