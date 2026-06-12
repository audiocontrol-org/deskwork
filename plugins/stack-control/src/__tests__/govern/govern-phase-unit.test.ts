// specs/015-audit-protocol-convergence — T025 (integration): the `--phase`
// selector audits ONE tasks.md phase as a bounded unit through the SAME
// convergence loop (FR-007). The phase runs under its own checkpoint
// (`phase-<id>`), so the gate evaluates that phase's convergence independently
// of other checkpoints (per-checkpoint loops). Missing tasks.md fails loud.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../_run-helpers.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';

/** Stub barrage: lift appends one finding under a fixed section label (STUB_LABEL). */
function writeStubBarrage(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'verb="$1"; shift',
    'repo=""; feature=""; output=""',
    'while [ "$#" -gt 0 ]; do case "$1" in',
    '  --repo-root) repo="$2"; shift 2 ;;',
    '  --feature) feature="$2"; shift 2 ;;',
    '  --output) output="$2"; shift 2 ;;',
    '  --output-run-dir) shift ;;',
    '  *) shift ;;',
    'esac; done',
    'case "$verb" in',
    '  audit-barrage-render) [ -n "$output" ] && printf "p\\n" > "$output" || true; exit 0 ;;',
    '  audit-barrage) rd="${STUB_RUN_DIR}"; mkdir -p "$rd"; printf "%s\\n" "$rd"; exit 0 ;;',
    '  audit-barrage-lift)',
    '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
    '    {',
    '      printf "\\n## 2026-06-11 — audit-barrage lift (%s)\\n\\n" "${STUB_LABEL}"',
    '      printf "### Stub finding\\n\\nFinding-ID: AUDIT-20260611-77\\nStatus:     open\\nSeverity:   %s\\nSurface:    a.ts:1\\n\\nB.\\n" "${STUB_SEVERITY}"',
    '    } >> "$log"',
    '    exit 0 ;;',
    '  *) echo "unknown $verb" >&2; exit 3 ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

const TASKS_MD = [
  '# Tasks',
  '',
  '## Phase 1: Setup',
  '',
  '- T001 in `src/a.ts`',
  '',
  '## Phase 2: User Story A',
  '',
  '- T002 in `src/b.ts`',
  '',
].join('\n');

function makeRepo(seedAuditLog: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-phase-'));
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), seedAuditLog, 'utf8');
  spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
  return repo;
}

function runGovern(args: string[], env: Record<string, string>) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog(), ...env },
  });
}

describe('govern --phase audits one tasks.md phase under its own checkpoint (FR-007)', () => {
  it('converges on the phase-2 checkpoint, IGNORING a HIGH in the after_implement checkpoint', () => {
    // Seed a HIGH under a different checkpoint (after_implement). The phase-2 gate
    // must scope to phase-2 sections only and converge on the clean phase-2 run.
    const seed = [
      '# Audit Log — feat',
      '',
      '## 2026-06-10 — audit-barrage lift (run-after_implement)',
      '',
      '### Unrelated HIGH in another checkpoint',
      '',
      'Finding-ID: AUDIT-20260610-01',
      'Status:     open',
      'Severity:   high',
      'Surface:    other.ts:1',
      '',
      'Body.',
      '',
    ].join('\n');
    const repo = makeRepo(seed);
    writeFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat', 'tasks.md'), TASKS_MD, 'utf8');
    const fx = mkdtempSync(join(tmpdir(), 'gov-phase-stub-'));
    const stub = writeStubBarrage(fx);
    try {
      const r = runGovern(
        ['--mode', 'implement', '--feature', 'feat', '--repo-root', repo, '--diff-base', 'HEAD', '--phase', '2'],
        {
          GOVERN_BARRAGE_BIN: stub,
          STUB_RUN_DIR: join(fx, 'run-phase-2'),
          // The lift section label must end with `-phase-2` so the gate's
          // per-checkpoint filter scopes to this run.
          STUB_LABEL: 'run-phase-2',
          STUB_SEVERITY: 'low',
        },
      );
      expect(r.status).toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/governed|OPEN/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('fails loud (exit 2) when --phase is given but tasks.md is absent', () => {
    const repo = makeRepo('# Audit Log — feat\n');
    const fx = mkdtempSync(join(tmpdir(), 'gov-phase-stub-'));
    const stub = writeStubBarrage(fx);
    try {
      const r = runGovern(
        ['--mode', 'implement', '--feature', 'feat', '--repo-root', repo, '--diff-base', 'HEAD', '--phase', '2'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-phase-2'), STUB_LABEL: 'run-phase-2', STUB_SEVERITY: 'low' },
      );
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/tasks\.md not found/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
