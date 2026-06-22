// specs/021-audit-protocol-friction-burndown — T027/T028 (US5).
//
// Every govern EXECUTION exit emits exactly one machine-readable
// `govern: terminal-outcome=<kind>` line so a consumer can distinguish the
// degraded states without fragile message-substring matching. This drives the
// real CLI for the deterministic terminals (graduated, blocked,
// negotiation-failed) plus the pre-try usage exits. The `--help` usage-info early
// return is the ONE deliberate non-emitter (no governance work, no outcome) and
// that boundary is locked here too.

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

  it('chunks a >envelope committed diff into envelope-sized chunks (030 FR-002, SC-001)', () => {
    const repo = makeRepo({ enforced: true, maxPromptBytes: 400 });
    const fx = mkdtempSync(join(tmpdir(), 'gov-chunk-fx-'));
    const git = (a: string[]) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    try {
      const seed = git(['rev-parse', 'HEAD']).stdout.trim();
      // Two files in DISTINCT dirs ⇒ two coupling clusters; each renders < the 400-byte
      // envelope but together > it ⇒ the partitioner yields >1 chunk.
      mkdirSync(join(repo, 'a'), { recursive: true });
      mkdirSync(join(repo, 'b'), { recursive: true });
      writeFileSync(join(repo, 'a', 'x.ts'), `${Array.from({ length: 8 }, (_, i) => `export const ax${i} = ${i};`).join('\n')}\n`, 'utf8');
      writeFileSync(join(repo, 'b', 'y.ts'), `${Array.from({ length: 8 }, (_, i) => `export const by${i} = ${i};`).join('\n')}\n`, 'utf8');
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'feature work across two dirs']);
      const r = runGovern(repo, fx, ['--require-models', '1', '--diff-base', seed], 'low');
      // The observable proof of chunking (printed before the per-chunk barrage loop).
      expect(`${r.stdout}${r.stderr}`).toMatch(/chunked the whole committed feature diff into [2-9]/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // 030 US2 (T028/T035): the `boundary-too-large` terminal is DELETED — an oversized
  // rendered payload no longer FATALs; the chunked bin-packer sizes every chunk ≤ the
  // active envelope so the condition is avoided, not asserted against.

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
      const out = `${r.stdout}${r.stderr}`;
      expect(out).toContain('govern: terminal-outcome=blocked');
      // "exactly one" part of the contract.
      expect(out.match(/govern: terminal-outcome=/g) ?? []).toHaveLength(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // AUDIT-BARRAGE-codex-01 (021 phase-2 round, cross-model HIGH): the contract is
  // "EVERY exit emits exactly one terminal-outcome line" — including the pre-try
  // usage/preflight `process.exit(2)` paths that previously emitted nothing.
  it('usage exits (missing --mode, bad --require-models) emit exactly one usage terminal-outcome', () => {
    const env = { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog() };
    const noMode = spawnSync(resolveTsx(), [CLI, 'govern', '--feature', 'x'], { encoding: 'utf8', env });
    expect(noMode.status).toBe(2);
    const out1 = `${noMode.stdout}${noMode.stderr}`;
    expect(out1).toContain('govern: terminal-outcome=usage');
    expect(out1.match(/govern: terminal-outcome=/g) ?? []).toHaveLength(1);

    const badN = spawnSync(
      resolveTsx(),
      [CLI, 'govern', '--mode', 'implement', '--require-models', 'nope'],
      { encoding: 'utf8', env },
    );
    expect(badN.status).toBe(2);
    const out2 = `${badN.stdout}${badN.stderr}`;
    expect(out2).toContain('govern: terminal-outcome=usage');
    expect(out2.match(/govern: terminal-outcome=/g) ?? []).toHaveLength(1);
  });

  // 030 dogfood (TASK-#3): a partition error must FAIL LOUD, never silently degrade
  // to a whole over-envelope payload (the exact pathology 030 removes). A single file
  // whose diff alone exceeds the envelope is a-priori broken (line cap) — the
  // partitioner throws FATAL and govern must surface it as a fatal terminal (exit 2),
  // not swallow it and audit the whole diff as one oversized barrage.
  it('a single file over the envelope fails loud (fatal), not a silent whole-payload fallback', () => {
    const repo = makeRepo({ enforced: true, maxPromptBytes: 200 });
    const fx = mkdtempSync(join(tmpdir(), 'gov-oversize-fx-'));
    const git = (a: string[]) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    try {
      const seed = git(['rev-parse', 'HEAD']).stdout.trim();
      // One file in one dir whose diff alone is well over the 200-byte envelope.
      mkdirSync(join(repo, 'big'), { recursive: true });
      writeFileSync(
        join(repo, 'big', 'huge.ts'),
        `${Array.from({ length: 40 }, (_, i) => `export const huge${i} = ${i};`).join('\n')}\n`,
        'utf8',
      );
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'one oversized file']);
      const r = runGovern(repo, fx, ['--require-models', '1', '--diff-base', seed], 'low');
      expect(r.status).toBe(2);
      const out = `${r.stdout}${r.stderr}`;
      expect(out).toContain('govern: terminal-outcome=fatal');
      // The descriptive cause is surfaced, not swallowed.
      expect(out).toMatch(/exceed|envelope|partition/i);
      // It did NOT silently degrade.
      expect(out).not.toMatch(/auditing the whole committed diff as one payload/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // AUDIT-BARRAGE-codex-01 (021 phase-2 round 2): the contract is scoped to
  // EXECUTION exits. `--help` does no governance work, so it deliberately emits
  // NO terminal-outcome — locking the boundary so the contract is precise (not
  // over-claimed) and the next audit sees a tested, honest scope.
  it('--help is a usage-info early return and emits NO terminal-outcome', () => {
    const r = spawnSync(resolveTsx(), [CLI, 'govern', '--help'], {
      encoding: 'utf8',
      env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog() },
    });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).not.toContain('govern: terminal-outcome=');
  });
});
