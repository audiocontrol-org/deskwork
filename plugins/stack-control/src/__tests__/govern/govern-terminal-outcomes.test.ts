// specs/021-audit-protocol-friction-burndown — T027/T028 (US5).
//
// Every govern exit emits exactly one machine-readable `govern: terminal-outcome=<kind>`
// line so a consumer can distinguish the degraded states without fragile
// message-substring matching. This drives the real CLI for four deterministic
// terminals: graduated, blocked, negotiation-failed, and boundary-too-large.
// (The fleet-floor-shortfall / barrage-outage split is exercised by the barrage's
// own exit-code suite; here we lock the govern-level tag mechanism end to end.)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../_run-helpers.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';

interface RepoOpts {
  /** Enforced lane (viable) vs unenforced (rejected by negotiation). */
  readonly enforced: boolean;
  /** Fleet-knowledge prompt envelope (bytes) for the single lane. */
  readonly maxPromptBytes: number;
}

/** A single-lane fleet on a universally-present binary (`sh`) so the binary
 * probe is deterministic in any environment. Enforcement + envelope are the
 * knobs the terminal-outcome scenarios turn. */
function makeRepo(opts: RepoOpts): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-terminal-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  writeFileSync(
    join(repo, '.stack-control', 'audit-barrage-config.yaml'),
    [
      'models:',
      '  - name: lane1',
      '    binary: sh',
      '    model: stub',
      '    args_template: "-c {{model}} {{prompt-stdin}}"',
      `    readonly_enforcement: ${opts.enforced ? '"--sandbox read-only"' : 'none'}`,
      '    output_mode: text',
      '    liveness_signal: stderr',
      '    liveness_window_seconds: 60',
      '    timeout_floor_seconds: 300',
      '    timeout_secs_per_kb: 7',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(repo, '.stack-control', 'fleet-knowledge.yaml'),
    ['lanes:', '  - name: lane1', `    max_prompt_bytes: ${opts.maxPromptBytes}`, ''].join('\n'),
    'utf8',
  );
  const featureRoot = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat');
  mkdirSync(featureRoot, { recursive: true });
  writeFileSync(join(featureRoot, 'audit-log.md'), '# Audit Log — feat\n', 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  // Substantive source so the implement-mode clone-step's jscpd run analyzes real
  // files (it writes no report — and the step errors — over a trivial tree).
  for (const n of [0, 1]) {
    const lines = Array.from({ length: 30 }, (_, i) => `export const v${n}_${i} = ${i} * ${n + 2};`);
    writeFileSync(join(repo, 'src', `f${n}.ts`), `${lines.join('\n')}\n`, 'utf8');
  }
  const git = (a: string[]) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 't@e.com']);
  git(['config', 'user.name', 'T']);
  // Hermetic: never sign throwaway fixture commits (no operator gpg dependency).
  git(['config', 'commit.gpgsign', 'false']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  return repo;
}

/** Stub barrage whose lift appends a finding of `STUB_SEVERITY` every round. */
function writeStub(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  writeFileSync(
    stub,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'verb="$1"; shift',
      'repo=""; feature=""; output=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    --at) repo="$2"; shift 2 ;;',
      '    --feature) feature="$2"; shift 2 ;;',
      '    --output) output="$2"; shift 2 ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      'case "$verb" in',
      '  audit-barrage-render) [ -n "$output" ] && printf "stub prompt\\n" > "$output" || true; exit 0 ;;',
      '  audit-barrage)',
      '    rd="${STUB_RUN_DIR:?}-$$-${RANDOM}"; mkdir -p "$rd"; printf "%s\\n" "$rd"; exit 0 ;;',
      '  audit-barrage-lift)',
      '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
      '    n=$(grep -c "audit-barrage lift" "$log" 2>/dev/null || true); n=$(( ${n:-0} + 1 ))',
      '    {',
      '      printf "\\n## 2026-06-14 — audit-barrage lift (terminal-stub-%s-after_clarify)\\n\\n" "$n"',
      '      printf "### Stub finding %s\\n\\nFinding-ID: AUDIT-20260614-%02d\\nStatus:     open\\nSeverity:   %s\\nSurface:    spec.md:1\\n\\nBody.\\n" "$n" "$n" "${STUB_SEVERITY:?}"',
      '    } >> "$log"',
      '    exit 0 ;;',
      '  *) echo "stub: unknown $verb" >&2; exit 3 ;;',
      'esac',
      '',
    ].join('\n'),
    'utf8',
  );
  chmodSync(stub, 0o755);
  return stub;
}

function runGovern(repo: string, fx: string, extraArgs: string[], severity: string) {
  return spawnSync(
    resolveTsx(),
    [CLI, 'govern', '--mode', 'implement', '--feature', 'feat', '--at', repo, '--diff-base', 'HEAD', ...extraArgs],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GOVERN_BARRAGE_BIN: writeStub(fx),
        STUB_RUN_DIR: join(fx, 'run'),
        STUB_SEVERITY: severity,
        STACKCTL_BACKLOG_DIR: tmpBacklog(),
      },
    },
  );
}

describe('US5 — machine-readable govern terminal outcomes (T027/T028)', () => {
  it('negotiation-failed: an unenforced lane is rejected before payload assembly', () => {
    const repo = makeRepo({ enforced: false, maxPromptBytes: 24576 });
    const fx = mkdtempSync(join(tmpdir(), 'gov-terminal-fx-'));
    try {
      const r = runGovern(repo, fx, ['--require-models', '1'], 'low');
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toContain('govern: terminal-outcome=negotiation-failed');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // NOTE: a dedicated `boundary-too-large` e2e case is intentionally omitted —
  // `negotiateFleet` already rejects any lane whose envelope is smaller than the
  // rendered prompt (disposition `negotiation-failed`), so `assertBoundaryFits`
  // can never observe an oversized prompt over an ACCEPTED fleet. The terminal
  // KIND is implemented (protocol.ts maps BoundaryTooLargeError → terminalKind
  // 'boundary-too-large') and the boundary math is unit-covered in
  // phase-boundary-sizing.test.ts, but the terminal is currently preempted by
  // negotiation. Captured as a backlog finding (TASK — boundary-too-large
  // unreachable: redundant with the negotiation envelope gate).

  it('graduated: an enforced lane + a clean (low) barrage opens the gate', () => {
    const repo = makeRepo({ enforced: true, maxPromptBytes: 65536 });
    const fx = mkdtempSync(join(tmpdir(), 'gov-terminal-fx-'));
    try {
      const r = runGovern(repo, fx, ['--require-models', '1'], 'low');
      expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain('govern: terminal-outcome=graduated');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('blocked: an enforced lane + an always-HIGH barrage refuses graduation', () => {
    const repo = makeRepo({ enforced: true, maxPromptBytes: 65536 });
    const fx = mkdtempSync(join(tmpdir(), 'gov-terminal-fx-'));
    try {
      const r = runGovern(repo, fx, ['--require-models', '1', '--ceiling', '1'], 'high');
      expect(r.status).toBe(1);
      expect(`${r.stdout}${r.stderr}`).toContain('govern: terminal-outcome=blocked');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
