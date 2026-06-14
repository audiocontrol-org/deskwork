// specs/014 US1 (T004): govern passes the fleet floor 2 by default
// (Clarification 2026-06-11 — protocol runs exist for the cross-model
// agreement signal), flag-overridable in both directions; a MANUAL
// `stackctl audit-barrage` invocation carries no floor.
//
// Harness: full `stackctl govern` subprocess with a stubbed barrage bin
// (GOVERN_BARRAGE_BIN) that RECORDS the argv it receives for the
// `audit-barrage` verb, so the test asserts the invocation itself.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from './_run-helpers.js';
import { seedDefaultFleetKnowledge } from './_isolation-harness.js';
import { tmpBacklog } from '../../tests/backlog/helpers.js';
import { parseFlags as parseBarrageFlags } from '../subcommands/audit-barrage.js';

// Stub barrage bin: like govern-orchestration's, plus it appends the
// argv of every `audit-barrage` verb call to $STUB_ARGS_FILE.
function writeRecordingStub(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'verb="$1"; shift',
    'if [ "$verb" = "audit-barrage" ]; then',
    '  printf "%s\\n" "$*" >> "${STUB_ARGS_FILE:?STUB_ARGS_FILE required}"',
    'fi',
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
    '  audit-barrage-render)',
    '    [ -n "$output" ] && printf "stub prompt\\n" > "$output" || true',
    '    exit 0 ;;',
    '  audit-barrage)',
    '    rd="${STUB_RUN_DIR:?STUB_RUN_DIR required}"',
    '    mkdir -p "$rd"',
    '    printf "%s\\n" "$rd"',
    '    exit 0 ;;',
    '  audit-barrage-lift)',
    '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
    '    {',
    '      printf "\\n## 2026-06-11 — audit-barrage lift (stub-run-after_clarify)\\n\\n"',
    '      printf "### Clean finding\\n\\n"',
    '      printf "Finding-ID: AUDIT-20260611-99\\nStatus:     open\\nSeverity:   low\\n"',
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
  const repo = mkdtempSync(join(tmpdir(), 'gov-floor-'));
  // Installation marker (specs/installation-isolation): govern resolves
  // the enclosing installation from --at.
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
    env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog(), ...env },
  });
}

function recordedBarrageArgs(argsFile: string): string {
  return existsSync(argsFile) ? readFileSync(argsFile, 'utf8') : '';
}

describe('US1 — govern fleet floor (T004)', () => {
  it('govern invokes the barrage with --require-models 2 by default', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-floor-stub-'));
    const stub = writeRecordingStub(fx);
    const argsFile = join(fx, 'barrage-args.txt');
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--at', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-a'), STUB_ARGS_FILE: argsFile },
      );
      expect(r.status).toBe(0);
      const recorded = recordedBarrageArgs(argsFile);
      expect(recorded).toMatch(/--require-models 2\b/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('govern --require-models 1 overrides the default (lenient opt-out passes through)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-floor-stub-'));
    const stub = writeRecordingStub(fx);
    const argsFile = join(fx, 'barrage-args.txt');
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
          '--require-models',
          '1',
        ],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run-b'), STUB_ARGS_FILE: argsFile },
      );
      expect(r.status).toBe(0);
      const recorded = recordedBarrageArgs(argsFile);
      expect(recorded).toMatch(/--require-models 1\b/);
      expect(recorded).not.toMatch(/--require-models 2\b/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('govern rejects a non-positive-integer --require-models (usage, exit 2)', () => {
    const r = runGovern(
      ['--mode', 'spec', '--feature', 'feat', '--require-models', 'zero'],
      {},
    );
    expect(r.status).toBe(2);
  });

  it('a manual audit-barrage invocation carries no floor (default undefined)', () => {
    const parsed = parseBarrageFlags([
      '--feature',
      'demo',
      '--prompt-file',
      '/tmp/p.md',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.flags?.requireModels).toBeUndefined();
  });
});
