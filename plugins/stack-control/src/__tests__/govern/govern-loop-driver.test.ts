// specs/015-audit-protocol-convergence — T020 (RED→GREEN integration, SC-004).
//
// `stackctl govern` delegates the convergence loop to the code driver: it reaches
// a recorded terminal (converged / non-converged) with NO agent-held iterate/stop
// step. Driven with a stubbed barrage (GOVERN_BARRAGE_BIN):
//   - an always-BLOCKED stub (lift appends a HIGH every round) under GOVERN_CEILING=3
//     runs exactly 3 in-process rounds then terminates non-converged (exit 1) —
//     the loop bounds itself, the agent never decides to re-run.
//   - a clean stub (single-run-clean) converges on round 1 (exit 0).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../_run-helpers.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';

/** Stub barrage whose lift appends a finding of `STUB_SEVERITY` every round. */
function writeStubBarrage(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'verb="$1"; shift',
    'repo=""; feature=""; output=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    --repo-root) repo="$2"; shift 2 ;;',
    '    --feature) feature="$2"; shift 2 ;;',
    '    --output) output="$2"; shift 2 ;;',
    '    --output-run-dir) shift ;;',
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
    '    printf "%s\\n" "$rd"',
    '    exit 0 ;;',
    '  audit-barrage-lift)',
    '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
    '    n=$(grep -c "audit-barrage lift" "$log" 2>/dev/null || true)',
    '    n=$(( ${n:-0} + 1 ))',
    '    {',
    '      printf "\\n## 2026-06-11 — audit-barrage lift (stub-round-%s-after_clarify)\\n\\n" "$n"',
    '      printf "### Stub finding %s\\n\\n" "$n"',
    '      printf "Finding-ID: AUDIT-20260611-%02d\\nStatus:     open\\nSeverity:   %s\\n" "$n" "${STUB_SEVERITY:?}"',
    '      printf "Surface:    spec.md:1\\n\\nBody.\\n"',
    '    } >> "$log"',
    '    exit 0 ;;',
    '  *) echo "stub-barrage: unknown verb $verb" >&2; exit 3 ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

function makeRepo(slug: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-loop-'));
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  return repo;
}

function runGovern(args: string[], env: Record<string, string>) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog(), ...env },
  });
}

describe('govern delegates the convergence loop to the code driver (SC-004)', () => {
  it('always-BLOCKED stub at GOVERN_CEILING=3 runs 3 rounds then non-converged (exit 1)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-loop-stub-'));
    const stub = writeStubBarrage(fx);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--repo-root', repo, '--spec-path', spec, '--ceiling', '3'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run'), STUB_SEVERITY: 'high' },
      );
      expect(r.status).toBe(1);
      expect(`${r.stdout}${r.stderr}`).toMatch(/after 3 round\(s\)/);
      // The driver ran exactly `ceiling` barrage passes — each appended one lift
      // section; 3 sections proves the code-owned loop drove 3 rounds.
      const log = readFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat', 'audit-log.md'), 'utf8');
      const sections = (log.match(/audit-barrage lift/g) ?? []).length;
      expect(sections).toBe(3);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('clean stub converges on round 1 (exit 0), single barrage pass', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-loop-stub-'));
    const stub = writeStubBarrage(fx);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--repo-root', repo, '--spec-path', spec, '--ceiling', '3'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run'), STUB_SEVERITY: 'low' },
      );
      expect(r.status).toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/may graduate/);
      const log = readFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat', 'audit-log.md'), 'utf8');
      const sections = (log.match(/audit-barrage lift/g) ?? []).length;
      // Converged on the first pass — the loop stopped; it did not re-barrage.
      expect(sections).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
