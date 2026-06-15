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
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from './_run-helpers.js';
import { seedDefaultFleetKnowledge } from './_isolation-harness.js';
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
  // Installation marker (specs/installation-isolation): govern resolves
  // the enclosing installation from --at.
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  seedDefaultFleetKnowledge(repo);
  writeFileSync(join(repo, 'seed.txt'), 'seed\n', 'utf8');
  const git = (a: string[]) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 't@e.com']);
  git(['config', 'user.name', 'T']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  return repo;
}

// A git repo seeded with one commit and TWO Spec Kit dirs matching the same
// slug — specs/001-amb AND specs/002-amb. resolveFeatureRoot THROWS (plain
// Error, fail-loud) for slug 'amb' here rather than silently picking one.
function makeRepoWithAmbiguousFeatureDirs(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-amb-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  seedDefaultFleetKnowledge(repo);
  mkdirSync(join(repo, 'specs', '001-amb'), { recursive: true });
  mkdirSync(join(repo, 'specs', '002-amb'), { recursive: true });
  writeFileSync(join(repo, 'specs', '001-amb', 'spec.md'), 'spec one\n', 'utf8');
  writeFileSync(join(repo, 'specs', '002-amb', 'spec.md'), 'spec two\n', 'utf8');
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
    // Hermetic fleet: mark lanes available so a CLI-less env (CI) exercises the
    // feature-root resolution under test instead of short-circuiting on the
    // lane-availability probe (negotiation-failed). See TASK-132.
    env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog(), GOVERN_FLEET_AVAILABLE: '*', ...env },
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
        ['--mode', 'implement', '--feature', 'nonexistent', '--at', repo, '--diff-base', 'HEAD'],
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
        ['--mode', 'spec', '--feature', 'nonexistent', '--at', repo, '--spec-path', spec],
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

// RED-first (AUDIT-20260611-12): an AMBIGUOUS feature root (two specs/ dirs
// matching the same slug) escapes runGovern as an uncaught plain-Error stack
// trace (exit 1) — the catch block only translates GovernProtocolError /
// GovernPayloadError. The same feature-root decision surface the unresolvable
// case above hardens must surface ambiguity as a controlled
// `govern: FATAL — <resolver message>` on stderr with exit 2, before the
// barrage ever fires. feature-root.ts's throw is correct (fail-loud, names
// the candidates); the translation belongs at govern's CLI boundary.
describe('stackctl govern — ambiguous feature root (AUDIT-20260611-12)', () => {
  it('implement mode surfaces the ambiguity as a controlled FATAL (exit 2) naming both candidates; barrage never fires', () => {
    const repo = makeRepoWithAmbiguousFeatureDirs();
    const fx = mkdtempSync(join(tmpdir(), 'gov-amb-stub-'));
    const stub = writeStubBarrage(fx);
    const runDir = join(fx, 'run-implement');
    try {
      const r = runGovern(
        ['--mode', 'implement', '--feature', 'amb', '--at', repo, '--diff-base', 'HEAD'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: runDir },
      );
      expect(r.status).toBe(2);
      // Controlled operator-facing refusal — same channel as the
      // unresolvable-root FATAL, carrying the resolver's message verbatim
      // (it names both candidate dirs).
      expect(r.stderr).toContain('govern: FATAL');
      expect(r.stderr).toMatch(/ambiguous slug 'amb' under /);
      expect(r.stderr).toContain('001-amb');
      expect(r.stderr).toContain('002-amb');
      // No raw stack trace leaks to the operator.
      expect(r.stderr).not.toMatch(/^\s+at /m);
      // The refusal fires at the decision site — the barrage never runs.
      expect(existsSync(runDir)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('spec mode with the same ambiguous slug also exits 2 with the message, not a stack trace (resolveAuditLogExcerpt throws first)', () => {
    const repo = makeRepoWithAmbiguousFeatureDirs();
    const fx = mkdtempSync(join(tmpdir(), 'gov-amb-stub-'));
    const stub = writeStubBarrage(fx);
    const runDir = join(fx, 'run-spec');
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n', 'utf8');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'amb', '--at', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: runDir },
      );
      // resolveAuditLogExcerpt resolves the feature root on the spec path
      // too, so the same ambiguity throw fires — pinned to the same
      // controlled exit-2 channel, never an uncaught stack.
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('govern: FATAL');
      expect(r.stderr).toMatch(/ambiguous slug 'amb' under /);
      expect(r.stderr).not.toMatch(/^\s+at /m);
      expect(existsSync(runDir)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});
