// RED-first (govern consolidation): full `stackctl govern` orchestration with a
// STUBBED barrage bin (GOVERN_BARRAGE_BIN). Both modes must run
// render → barrage → lift → slush → gate and surface the gate verdict + the
// correct exit code (0 converged/overridden). This is the intended behavior
// change for IMPLEMENT mode: it now runs slush+gate (govern.sh previously
// stopped after lift).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from './_run-helpers.js';

// A fake barrage bin that satisfies the render/barrage/lift verbs the protocol
// shells out to. It ignores all flags except the few it needs:
//   render  --output <p>     → writes a stub prompt
//   audit-barrage --output-run-dir → prints a run-dir, exit 0 (OUTAGE if STUB_OUTAGE=1)
//   audit-barrage-lift --apply     → appends a CLEAN (0-HIGH, 0-MED) finding
//                                    section to the feature audit-log so the
//                                    real slush+gate see a converged history.
function writeStubBarrage(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  // The lift appends to the audit-log resolved from --repo-root + --feature.
  // We resolve the feature dir the same way the real verbs do: docs/1.0/...
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
    '    if [ "${STUB_OUTAGE:-0}" = "1" ]; then exit 1; fi',
    '    rd="${STUB_RUN_DIR:?STUB_RUN_DIR required}"',
    '    mkdir -p "$rd"',
    '    printf "%s\\n" "$rd"',
    '    exit 0 ;;',
    '  audit-barrage-lift)',
    '    # feature here is the bare slug (the protocol passes the bare slug to lift).',
    '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
    '    {',
    '      printf "\\n## 2026-06-07 — audit-barrage lift (stub-run-after_clarify)\\n\\n"',
    '      printf "### Clean finding\\n\\n"',
    '      printf "Finding-ID: AUDIT-20260607-99\\nStatus:     open\\nSeverity:   low\\n"',
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
  const repo = mkdtempSync(join(tmpdir(), 'gov-orch-'));
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  // Seed an audit-log so lift/slush/gate can resolve it.
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  return repo;
}

function runGovern(args: string[], env: Record<string, string>) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('stackctl govern — full orchestration with stubbed barrage', () => {
  it('spec mode runs render→barrage→lift→slush→gate; converged verdict, exit 0', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-stub-'));
    const stub = writeStubBarrage(fx);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--repo-root', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-a') },
      );
      expect(`${r.stdout}${r.stderr}`).toMatch(/converged/);
      expect(r.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('implement mode now runs slush+gate (behavior change): converged verdict, exit 0', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-stub-'));
    const stub = writeStubBarrage(fx);
    // implement mode needs a git tree for the diff base.
    const git = (a: string[]) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'seed']);
    try {
      const r = runGovern(
        ['--mode', 'implement', '--feature', 'feat', '--repo-root', repo, '--diff-base', 'HEAD'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-b') },
      );
      expect(`${r.stdout}${r.stderr}`).toMatch(/converged/);
      expect(r.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('barrage OUTAGE (stub exits non-zero) → no lift, fail-loud exit 2 (AUDIT-20260607-07)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-stub-'));
    const stub = writeStubBarrage(fx);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--repo-root', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-c'), STUB_OUTAGE: '1' },
      );
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/OUTAGE/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('--mode is required (fail-loud usage, exit 2)', () => {
    const r = runGovern(['--feature', 'x'], {});
    expect(r.status).toBe(2);
  });

  it('empty slug from feature/ branch is FATAL (exit 2)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-stub-'));
    const stub = writeStubBarrage(fx);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'spec\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', '', '--repo-root', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-d') },
      );
      expect(r.status).toBe(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
