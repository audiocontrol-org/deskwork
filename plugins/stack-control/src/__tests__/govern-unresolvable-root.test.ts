// RED-first (AUDIT-20260611-04): govern --mode implement must FAIL LOUD (exit 2,
// stderr naming the slug + BOTH probed layouts) when the feature root does not
// resolve — instead of silently reverting to the pre-014 self-referential
// repo-wide payload (audit-log riding in the diff + repo-wide untracked fold,
// the exact AUDIT-28/42/48 generator US5 closed). Sibling verbs (scope-widen,
// scope-inventory, slush-findings) already FATAL on the identical condition;
// this pins govern's implement mode to the same refusal.
//
// Spec mode is untouched: its payload doesn't use the feature root. The green
// "spec mode with a resolvable root + --spec-path works end-to-end" pin already
// exists in govern-orchestration.test.ts ('spec mode runs
// render→barrage→lift→slush→gate; gate OPEN, exit 0') — reused, not duplicated
// here. This file additionally pins that the new refusal is implement-scoped:
// a spec-mode run with the same unresolvable slug proceeds past the decision
// site (the barrage fires) and never emits the implement-mode FATAL.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from './_run-helpers.js';
import { tmpBacklog } from '../../tests/backlog/helpers.js';

// Minimal stub barrage bin (same seam as govern-orchestration.test.ts —
// GOVERN_BARRAGE_BIN). Creating STUB_RUN_DIR on the `audit-barrage` verb is the
// observable marker that the protocol proceeded past the feature-root decision
// site; the implement-mode refusal must fire BEFORE the barrage ever runs.
function writeStubBarrage(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
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
    '    rd="${STUB_RUN_DIR:?STUB_RUN_DIR required}"',
    '    mkdir -p "$rd"',
    '    printf "%s\\n" "$rd"',
    '    exit 0 ;;',
    '  audit-barrage-lift)',
    '    exit 0 ;;',
    '  *) echo "stub-barrage: unknown verb $verb" >&2; exit 3 ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

// A git repo seeded with one commit and NO feature dirs at all — no
// specs/<NNN>-<slug>, no docs/*/001-IN-PROGRESS/<slug>. resolveFeatureRoot
// returns root: undefined for every slug here.
function makeRepoWithoutFeatureDirs(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-unres-'));
  writeFileSync(join(repo, 'seed.txt'), 'seed\n', 'utf8');
  const git = (a: string[]) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 't@e.com']);
  git(['config', 'user.name', 'T']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  return repo;
}

function runGovern(args: string[], env: Record<string, string>) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    // Isolate the backlog destination of govern's slush step to a fresh tmp
    // dir so no govern test ever writes the committed dogfood pile.
    env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog(), ...env },
  });
}

describe('stackctl govern — unresolvable feature root (AUDIT-20260611-04)', () => {
  it('implement mode FATALs (exit 2) naming the slug + both probed layouts; barrage never fires', () => {
    const repo = makeRepoWithoutFeatureDirs();
    const fx = mkdtempSync(join(tmpdir(), 'gov-unres-stub-'));
    const stub = writeStubBarrage(fx);
    const runDir = join(fx, 'run-implement');
    try {
      const r = runGovern(
        ['--mode', 'implement', '--feature', 'nonexistent', '--repo-root', repo, '--diff-base', 'HEAD'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: runDir },
      );
      expect(r.status).toBe(2);
      // The FATAL names the unresolved slug AND both probed layouts, mirroring
      // slush-findings' message style.
      expect(r.stderr).toMatch(/govern: FATAL — feature 'nonexistent' not found under /);
      expect(r.stderr).toContain(`${join(repo, 'specs')}/<NNN>-nonexistent (speckit)`);
      expect(r.stderr).toContain(`${join(repo, 'docs')}/*/001-IN-PROGRESS/nonexistent (legacy-docs)`);
      // The refusal fires at the decision site — BEFORE the barrage runs, so
      // no self-referential repo-wide payload ever ships off-box.
      expect(existsSync(runDir)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('spec mode with the same unresolvable slug is untouched: proceeds past the decision site, no implement-mode FATAL', () => {
    const repo = makeRepoWithoutFeatureDirs();
    const fx = mkdtempSync(join(tmpdir(), 'gov-unres-stub-'));
    const stub = writeStubBarrage(fx);
    const runDir = join(fx, 'run-spec');
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n', 'utf8');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'nonexistent', '--repo-root', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: runDir },
      );
      // The implement-only refusal never fires for spec mode (its payload
      // doesn't use the feature root)…
      expect(r.stderr).not.toMatch(/govern: FATAL — feature 'nonexistent' not found under /);
      // …and the protocol proceeds past the decision site (the barrage runs).
      // Downstream behavior (lift/slush/gate resolution against the absent
      // audit-log) is unchanged by this fix and not pinned here.
      expect(existsSync(runDir)).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
