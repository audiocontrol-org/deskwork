// specs/029-govern-operability — Phase 4 / US4 (T027, RED → T028 GREEN).
//
// FR-017/018: `govern --override "<reason>"` MUST short-circuit the convergence
// pass entirely — record the override reason in the audit trail and graduate,
// firing ZERO render/barrage/lift/slush passes. The override is per-invocation
// short-circuit only (it persists no fingerprint-keyed marker) and is
// attributable in the audit trail (distinguishable from a convergence
// graduation — the "OPEN by override" record).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { resolveTsx, CLI } from '../../src/__tests__/_run-helpers.js';
import { seedDefaultFleetKnowledge } from '../../src/__tests__/_isolation-harness.js';
import { tmpBacklog } from '../backlog/helpers.js';
import {
  checkpointPath,
  computeScopeFingerprint,
  readPhaseCheckpoint,
  writePhaseCheckpoint,
} from '../../src/govern/checkpoint-state.js';
import { readGovernConvergenceRecord } from '../../src/govern/convergence-record.js';

// A barrage stub that TOUCHES a marker the moment ANY verb is invoked. The
// override short-circuit must NEVER spawn it, so the marker must NOT exist.
function writeMarkerStub(dir: string, marker: string): string {
  const stub = join(dir, 'marker-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `touch "${marker}"`,
    'echo "marker-barrage: should never run under --override" >&2',
    'exit 1',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

// Finding 2 (codex HIGH): an override now FAILS LOUD when no roadmap node resolves
// (the durable convergence record cannot be keyed, so the override does NOT
// graduate). The graduates-path therefore requires the fixture to carry a ROADMAP.md
// node whose `spec:` pointer names the feature dir. Mirrors makeWorkflowFixture's
// roadmap shape (doc-grammar: roadmap; `## <id>` heading + `- spec: <pointer>`).
function writeRoadmapWithNode(repo: string, slug: string, specDirRel: string): void {
  const body = [
    '---',
    'doc-grammar: roadmap',
    '---',
    '',
    '# Roadmap',
    '',
    `## impl:feature/${slug}`,
    '',
    '- status: in-flight',
    `- spec: ${specDirRel}`,
    '',
    `impl:feature/${slug} scope prose.`,
    '',
  ].join('\n');
  writeFileSync(join(repo, 'ROADMAP.md'), body, 'utf8');
}

function makeRepo(slug: string, opts: { withRoadmapNode?: boolean } = {}): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-override-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  seedDefaultFleetKnowledge(repo);
  const specDirRel = join('docs', '1.0', '001-IN-PROGRESS', slug);
  const dir = join(repo, specDirRel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  // Default: give the override a resolvable roadmap node so the graduates-path is
  // exercised WITH a durable convergence record. Opt out (no node) to exercise the
  // no-node FATAL.
  if (opts.withRoadmapNode !== false) writeRoadmapWithNode(repo, slug, specDirRel);
  return repo;
}

function runGovern(args: string[], env: Record<string, string>) {
  return spawnSync(resolveTsx(), [CLI, 'govern', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      STACKCTL_BACKLOG_DIR: tmpBacklog(),
      GOVERN_FLEET_AVAILABLE: '*',
      ...env,
    },
  });
}

describe('govern --override short-circuit (US4, T027, FR-017/018)', () => {
  it('fires 0 barrage runs, records an attributable override graduation, exits 0', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
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
          '--override',
          'operator accepts residual',
        ],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run') },
      );
      // The barrage stub must NOT have run — zero render/barrage/lift/slush.
      expect(existsSync(marker)).toBe(false);
      // No audit-run dir was produced.
      expect(existsSync(join(fx, 'run'))).toBe(false);
      // Graduated.
      expect(r.status).toBe(0);
      // Attributable: the "OPEN by override" record names the reason.
      expect(`${r.stdout}${r.stderr}`).toMatch(/override/i);
      expect(`${r.stdout}${r.stderr}`).toMatch(/operator accepts residual/);
      // Finding 2 (codex HIGH): a clean override graduation ALWAYS leaves a durable
      // `override: true` convergence record — CLI success matches the gate signal.
      const rec = readGovernConvergenceRecord(repo, 'spec', 'impl:feature/feat');
      expect(rec).not.toBeNull();
      if (rec === null) throw new Error('convergence record missing');
      expect(rec.converged).toBe(true);
      expect(rec.override).toBe(true);
      expect(rec.overrideReason).toBe('operator accepts residual');
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // Finding 2 (codex HIGH): when NO roadmap node resolves, the override cannot write
  // the durable convergence record (the governing -> shipped gate signal), so it must
  // FAIL LOUD (exit 2, terminal fatal) rather than print a clean "graduated". The
  // barrage must STILL fire zero passes (the FATAL precedes the barrage path).
  it('FATALs (exit 2) when no roadmap node resolves — no clean graduation', () => {
    const repo = makeRepo('feat', { withRoadmapNode: false });
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
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
          '--override',
          'operator accepts residual',
        ],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run') },
      );
      // Failed loud, not a clean graduation.
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/FATAL/);
      expect(`${r.stdout}${r.stderr}`).toMatch(/could not resolve a roadmap node/);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/may graduate|governed \(overridden\)/);
      // Still zero barrage — the FATAL precedes the barrage path.
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(join(fx, 'run'))).toBe(false);
      // No durable convergence record was written.
      const rec = readGovernConvergenceRecord(repo, 'spec', 'impl:feature/feat');
      expect(rec).toBeNull();
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // specs/029 US4 (AUDIT-BARRAGE codex-02 + claude-02, phase-4 re-govern): the
  // blank-reason guard must cover the GOVERN_OVERRIDE ENV VAR too, not only the
  // --override flag. A whitespace-only env value must FAIL LOUD (exit 2) — never
  // graduate with a blank attribution, never fall through to a full barrage.
  it('FATALs (exit 2) when GOVERN_OVERRIDE is whitespace-only (env-var bypass closed)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--at', repo, '--spec-path', spec],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run'), GOVERN_OVERRIDE: '   ' },
      );
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/FATAL/);
      expect(`${r.stdout}${r.stderr}`).toMatch(/non-empty reason/i);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/may graduate|governed \(overridden\)/);
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(join(fx, 'run'))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  // specs/029 US4 (AUDIT-BARRAGE codex-01 HIGH + claude-03, phase-4 re-govern): a
  // convergence-record WRITE failure must FAIL LOUD on the override path — the CLI
  // must NOT report a graduation the durable `governing -> shipped` gate signal does
  // not back (the US4 Finding-2 "CLI success ⟺ gate signal" principle, extended to
  // the write-failure case). Blocking the write: a FILE where the convergence DIR
  // must be → mkdir/write throws ENOTDIR.
  it('FATALs (non-zero) when the durable convergence record cannot be written', () => {
    const repo = makeRepo('feat');
    const govDir = join(repo, '.stack-control', 'govern');
    mkdirSync(govDir, { recursive: true });
    writeFileSync(join(govDir, 'convergence'), 'not a directory\n'); // blocks the record write
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      const r = runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--at', repo, '--spec-path', spec,
          '--override', 'operator accepts residual'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run') },
      );
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/FATAL/);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/may graduate|governed \(overridden\)/);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });

  it('the override does NOT persist a marker across invocations (per-invocation only, FR-018)', () => {
    const repo = makeRepo('feat');
    const fx = mkdtempSync(join(tmpdir(), 'gov-override-stub-'));
    const marker = join(fx, 'barrage-ran.marker');
    const stub = writeMarkerStub(fx, marker);
    const spec = join(repo, 'spec.md');
    writeFileSync(spec, 'A spec under audit.\n');
    try {
      runGovern(
        ['--mode', 'spec', '--feature', 'feat', '--at', repo, '--spec-path', spec, '--override', 'r'],
        { GOVERN_BARRAGE_BIN: stub, STUB_RUN_DIR: join(fx, 'run') },
      );
      // No fingerprint-keyed override marker is written under the installation's
      // govern state dir — the short-circuit is per-invocation only.
      const overrideDir = join(repo, '.stack-control', 'govern', 'override');
      expect(existsSync(overrideDir)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(fx, { recursive: true, force: true });
    }
  });
});

// 029 US4 + US7 correctness gap: a PER-PHASE override (`--phase <id> --override`) must
// STILL write/refresh the `phase-<id>` checkpoint at the current tree state — otherwise
// the overridden phase has no current checkpoint and the all-phase-checkpoints-current
// gate refuses to let LATER phases advance. The write must fire ZERO barrage (FR-017).
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

function git(repo: string, args: string[]): void {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
}

function commit(repo: string, message: string): void {
  git(repo, ['add', '-A']);
  git(repo, [
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
  ]);
}

// A git installation with two phases: phase-1 owns src/a.ts (its checkpoint seeded
// CURRENT), phase-2 owns src/b.ts (committed in a SECOND commit so HEAD~1..HEAD carries
// hunkBlocks). Returns the repo root.
function makePhaseRepo(slug: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-override-phase-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  seedDefaultFleetKnowledge(repo);
  const specDirRel = join('docs', '1.0', '001-IN-PROGRESS', slug);
  const dir = join(repo, specDirRel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  writeFileSync(join(dir, 'tasks.md'), TASKS_MD, 'utf8');
  // Finding 2 (codex HIGH): a resolvable roadmap node so the override graduates with
  // a durable convergence record (committed below as part of the base commit).
  writeRoadmapWithNode(repo, slug, specDirRel);
  mkdirSync(join(repo, 'src'), { recursive: true });
  const aLines = Array.from({ length: 20 }, (_, i) => `export const a${i} = ${i};`);
  writeFileSync(join(repo, 'src', 'a.ts'), `${aLines.join('\n')}\n`, 'utf8');
  writeFileSync(join(repo, 'src', 'b.ts'), 'export const seed = 0;\n', 'utf8');
  git(repo, ['init', '-q']);
  commit(repo, 'base');
  // Second commit: phase-2's OWN added lines (HEAD~1..HEAD yields hunkBlocks for src/b.ts).
  const bLines = Array.from({ length: 12 }, (_, i) => `export const b${i} = ${i} * 7;`);
  writeFileSync(join(repo, 'src', 'b.ts'), `export const seed = 0;\n${bLines.join('\n')}\n`, 'utf8');
  commit(repo, 'phase-2 work on src/b.ts');
  return repo;
}
