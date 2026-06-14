import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../_run-helpers.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';
import { computeScopeFingerprint, writePhaseCheckpoint } from '../../govern/checkpoint-state.js';

function writeStubBarrage(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  writeFileSync(
    stub,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'verb="$1"; shift',
      'repo=""; feature=""; output=""',
      'while [ "$#" -gt 0 ]; do case "$1" in',
      '  --at) repo="$2"; shift 2 ;;',
      '  --feature) feature="$2"; shift 2 ;;',
      '  --output) output="$2"; shift 2 ;;',
      '  --output-run-dir) shift ;;',
      '  *) shift ;;',
      'esac; done',
      'case "$verb" in',
      '  audit-barrage-render) [ -n "$output" ] && printf "p\\n" > "$output" || true; exit 0 ;;',
      '  audit-barrage) rd="${STUB_RUN_DIR}"; mkdir -p "$rd"; printf "%s\\n" "$rd"; exit 0 ;;',
      '  audit-barrage-lift) exit 0 ;;',
      '  *) echo "unknown $verb" >&2; exit 3 ;;',
      'esac',
      '',
    ].join('\n'),
    'utf8',
  );
  chmodSync(stub, 0o755);
  return stub;
}

function git(repo: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return typeof r.stdout === 'string' ? r.stdout.trim() : '';
}

function commitAll(repo: string, message: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync(
    'git',
    [
      '-C',
      repo,
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '--no-gpg-sign',
      '-m',
      message,
    ],
    { encoding: 'utf8' },
  );
}

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-phase-checkpoints-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  writeFileSync(
    join(repo, '.stack-control', 'audit-barrage-config.yaml'),
    [
      'models:',
      '  - name: codex',
      '    binary: codex',
      '    model: gpt-5.5',
      '    args_template: "exec -m {{model}} --sandbox read-only {{prompt-stdin}}"',
      '    output_mode: text',
      '    readonly_enforcement: "--sandbox read-only"',
      '    liveness_signal: stderr',
      '    liveness_window_seconds: 60',
      '    timeout_floor_seconds: 300',
      '    timeout_secs_per_kb: 7',
      '',
    ].join('\n'),
    'utf8',
  );
  const featureRoot = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat');
  mkdirSync(featureRoot, { recursive: true });
  writeFileSync(join(featureRoot, 'audit-log.md'), '# Audit Log — feat\n', 'utf8');
  writeFileSync(
    join(featureRoot, 'tasks.md'),
    [
      '# Tasks',
      '',
      '## Phase 1: Setup',
      '',
      '- T001 in `src/a.ts`',
      '',
      '## Phase 2: Work',
      '',
      '- T002 in `src/b.ts`',
      '',
    ].join('\n'),
    'utf8',
  );
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const A = 1;\n', 'utf8');
  writeFileSync(join(repo, 'src', 'b.ts'), 'export const B = 2;\n', 'utf8');
  spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
  commitAll(repo, 'base');
  return repo;
}

function runGovern(repo: string, stub: string, args: readonly string[]) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      STACKCTL_BACKLOG_DIR: tmpBacklog(),
      GOVERN_BARRAGE_BIN: stub,
      STUB_RUN_DIR: join(repo, '.tmp-run'),
    },
  });
}

describe('phase checkpoint enforcement (US1)', () => {
  it('blocks phase advancement when an earlier phase checkpoint is missing', () => {
    const repo = makeRepo();
    const fx = mkdtempSync(join(tmpdir(), 'gov-phase-stub-'));
    const stub = writeStubBarrage(fx);
    try {
      const r = runGovern(repo, stub, [
        '--mode',
        'implement',
        '--feature',
        'feat',
        '--at',
        repo,
        '--diff-base',
        'HEAD',
        '--phase',
        '2',
        '--require-models',
        '1',
      ]);
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/missing phase-1/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('blocks phase advancement when an earlier checkpoint is stale', () => {
    const repo = makeRepo();
    const fx = mkdtempSync(join(tmpdir(), 'gov-phase-stub-'));
    const stub = writeStubBarrage(fx);
    try {
      writePhaseCheckpoint(repo, {
        version: 1,
        featureSlug: 'feat',
        phaseId: '1',
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        scopeFingerprint: computeScopeFingerprint(repo, ['src/a.ts']),
        passedAt: '2026-06-13T00:00:00.000Z',
        governedPaths: ['src/a.ts'],
      });
      writeFileSync(join(repo, 'src', 'a.ts'), 'export const A = 999;\n', 'utf8');
      const r = runGovern(repo, stub, [
        '--mode',
        'implement',
        '--feature',
        'feat',
        '--at',
        repo,
        '--diff-base',
        'HEAD',
        '--phase',
        '2',
        '--require-models',
        '1',
      ]);
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/stale phase-1/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
