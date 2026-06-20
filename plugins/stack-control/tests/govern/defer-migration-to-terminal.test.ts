// specs/029-govern-operability — Phase 4 / US4 (T022, FR-014).
//
// FR-014: MEDIUM-residual migration MUST be deferred until the loop reaches a
// TERMINAL state (gate OPEN = converged or overridden). A BLOCKED (non-terminal)
// round must migrate NOTHING — so a residual still in play across iterations is
// not parked prematurely, and a residual fixed in a later round is never migrated.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../../src/__tests__/_run-helpers.js';
import { seedDefaultFleetKnowledge } from '../../src/__tests__/_isolation-harness.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from '../backlog/helpers.js';

// A stub whose lift appends a run carrying a NEW HIGH (so the dampener never
// engages → gate stays BLOCKED → non-terminal round). The pre-seeded audit-log
// also carries an open MEDIUM residual, which must NOT migrate on a BLOCKED round.
function writeStubBarrage(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
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
    '  audit-barrage) rd="${STUB_RUN_DIR:?}"; mkdir -p "$rd"; printf "%s\\n" "$rd"; exit 0 ;;',
    '  audit-barrage-lift)',
    '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
    '    {',
    '      printf "\\n## 2026-06-20 — audit-barrage lift (stub-run-after_clarify)\\n\\n"',
    '      printf "### A genuinely new high\\n\\n"',
    '      printf "Finding-ID: AUDIT-20260620-99\\nStatus:     open\\nSeverity:   high\\n"',
    '      printf "Surface:    src/new.ts:1\\n\\nBody.\\n"',
    '    } >> "$log"',
    '    exit 0 ;;',
    '  *) echo "stub: unknown verb $verb" >&2; exit 3 ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

function makeRepo(slug: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-defer-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  seedDefaultFleetKnowledge(repo);
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  // Pre-seed an open MEDIUM residual.
  writeFileSync(
    join(dir, 'audit-log.md'),
    [
      `# Audit Log — ${slug}`,
      '',
      '## 2026-06-19 — audit-barrage lift (earlier-run-after_clarify)',
      '',
      '### Earlier residual',
      '',
      'Finding-ID: AUDIT-20260619-01',
      'Status:     open',
      'Severity:   medium',
      'Surface:    src/x.ts:1',
      '',
      'body',
      '',
    ].join('\n'),
    'utf8',
  );
  return repo;
}

describe('FR-014: a BLOCKED (non-terminal) round migrates nothing (US4, T022)', () => {
  it('the open MEDIUM residual is NOT migrated while the gate is BLOCKED', () => {
    const repo = makeRepo('feat');
    const log = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat', 'audit-log.md');
    const fx = mkdtempSync(join(tmpdir(), 'gov-defer-stub-'));
    const stub = writeStubBarrage(fx);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    const backlog = tmpBacklog();
    try {
      const r = spawnSync(
        resolveTsx(),
        [CLI, 'govern', '--mode', 'spec', '--feature', 'feat', '--at', repo, '--spec-path', spec],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            STACKCTL_BACKLOG_DIR: backlog,
            GOVERN_FLEET_AVAILABLE: '*',
            GOVERN_BARRAGE_BIN: stub,
            STUB_RUN_DIR: join(fx, 'run'),
          },
        },
      );
      // The new HIGH keeps the gate BLOCKED → exit 1, non-terminal.
      expect(r.status).toBe(1);
      const t = readFileSync(log, 'utf8');
      // The residual MEDIUM stays open — NOT migrated on a non-terminal round.
      expect(t).toMatch(/AUDIT-20260619-01[\s\S]*?Status:\s+open/);
      expect(t).not.toMatch(/migrated-to-backlog/);
      expect(createBacklogBackend({ cwd: backlog }).list()).toHaveLength(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
