// specs/014 US5 (TASK-37 / gh-431): the implement-mode govern payload
// must be self-reference-free. The recorded generator (AUDIT-28/42/48
// class): the feature's own audit-log.md rides into the audited diff —
// lift commits land inside the diff range, so the committed-diff arm
// carries the audit-log; and the untracked fold is repo-wide, sweeping
// unrelated features' scaffolds. Models then emit findings whose only
// "evidence" is audit-log prose (or another feature's parked scaffold),
// and the loop feeds itself.
//
// Contract (cli-contracts §govern; research R5 — BOTH arms; data-model
// §Govern implement payload): with the resolved feature root supplied,
// (a) the feature's audit-log.md appears in NEITHER the committed diff
// NOR the untracked fold; (b) the untracked fold excludes files under
// OTHER features' roots (threaded via `excludeRoots`; each drop warned
// + recorded in the `skippedOtherFeature` ledger) while the feature's
// own files AND non-feature files (new source modules) fold in
// (AUDIT-20260611-01 — the prior inclusion-scoped filter silently
// dropped untracked src/** from the payload); (c) the labeled
// audit_log_excerpt context block is the ONLY audit-log content in the
// payload. Without a feature root the assembler's legacy behavior is
// unchanged (govern-payload-implement.test.ts pins that).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleImplementPayload } from '../govern/payload-implement.js';
import { buildImplementVars } from '../subcommands/govern.js';

const FEATURE_REL = join('specs', '001-feat');

function initRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-selfref-'));
  const run = (args: string[]) =>
    spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  run(['init', '-q']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'Test']);
  mkdirSync(join(repo, FEATURE_REL), { recursive: true });
  writeFileSync(join(repo, 'src.ts'), 'export const a = 1;\n');
  writeFileSync(
    join(repo, FEATURE_REL, 'audit-log.md'),
    '# Audit Log\n',
    'utf8',
  );
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'seed']);
  return repo;
}

function commit(repo: string, msg: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { encoding: 'utf8' });
}

// Audit-log prose quoting a FAKE path — the self-reference generator's
// signature: if this lands in the payload, a model will "find" the
// fake path and emit a finding whose evidence exists only in prose.
const LIFTED_PROSE =
  'Finding-ID: AUDIT-FAKE-99\nStatus: open\nSurface: bogus/path/quoted-only-in-prose.ts:1\n';

describe('US5 — self-reference-free implement payload', () => {
  it('committed-diff arm excludes the feature root audit-log.md (lift commit in range)', () => {
    const repo = initRepo();
    try {
      // The implemented change + a lift commit BOTH land in the range.
      writeFileSync(join(repo, 'src.ts'), 'export const a = 2;\n');
      appendFileSync(join(repo, FEATURE_REL, 'audit-log.md'), `\n${LIFTED_PROSE}`);
      commit(repo, 'implement + lift');

      const r = assembleImplementPayload({
        repoRoot: repo,
        base: 'HEAD~1',
        featureRoot: join(repo, FEATURE_REL),
      });
      expect(r.diff).toContain('export const a = 2;');
      expect(r.diff).not.toContain('AUDIT-FAKE-99');
      expect(r.diff).not.toContain('quoted-only-in-prose');
      expect(r.diff).not.toContain('audit-log.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('untracked fold excludes the audit-log AND an unrelated feature scaffold (warned + ledgered); the feature own untracked files fold in', () => {
    const repo = initRepo();
    try {
      // Untracked: the feature's own evidence (must fold), an untracked
      // audit-log variant (must not), an unrelated feature's scaffold
      // (must not — the recorded parked-feature pull; the drop must be
      // VISIBLE: one warn line + a skippedOtherFeature ledger row, per
      // AUDIT-20260611-01).
      writeFileSync(join(repo, FEATURE_REL, 'evidence.md'), 'EVIDENCE NOTE for the feature\n');
      mkdirSync(join(repo, 'specs', '002-unrelated'), { recursive: true });
      writeFileSync(
        join(repo, 'specs', '002-unrelated', 'scaffold.md'),
        'UNRELATED PARKED SCAFFOLD\n',
      );
      appendFileSync(join(repo, FEATURE_REL, 'audit-log.md'), `\n${LIFTED_PROSE}`);

      const warns: string[] = [];
      const r = assembleImplementPayload({
        repoRoot: repo,
        base: 'HEAD',
        featureRoot: join(repo, FEATURE_REL),
        // What runGovern threads from discoverFeatureRoots(repoRoot):
        // ALL feature roots, the audited one included (the assembler
        // skips the featureRoot itself).
        excludeRoots: [join(repo, FEATURE_REL), join(repo, 'specs', '002-unrelated')],
        warn: (m) => warns.push(m),
      });
      expect(r.diff).toContain('EVIDENCE NOTE for the feature');
      expect(r.diff).not.toContain('UNRELATED PARKED SCAFFOLD');
      expect(r.diff).not.toContain('AUDIT-FAKE-99');
      // The drop is announced (no silent scope filtering) …
      expect(warns.some((m) => m.includes('specs/002-unrelated/scaffold.md'))).toBe(true);
      // … and ledgered.
      expect(r.skippedOtherFeature).toContain('specs/002-unrelated/scaffold.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('untracked source files OUTSIDE the feature root fold in when featureRoot is set (AUDIT-20260611-01 RED reproduction)', () => {
    const repo = initRepo();
    try {
      // The exact case the fold exists for (AUDIT-20260605-01): a
      // brand-new uncommitted source module. The feature root is the
      // spec/docs dir, NOT the code dir — the fold must still carry it.
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(
        join(repo, 'src', 'newmod.ts'),
        'export const NEW_UNCOMMITTED_MODULE = 1;\n',
      );

      const r = assembleImplementPayload({
        repoRoot: repo,
        base: 'HEAD',
        featureRoot: join(repo, FEATURE_REL),
      });
      expect(r.diff).toContain('NEW_UNCOMMITTED_MODULE');
      expect(r.skippedOtherFeature).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('committed arm + fold exclude the governance backlog store via excludePaths (AUDIT-20260611-08)', () => {
    const repo = initRepo();
    try {
      // Per-round backlog bookkeeping commits land INSIDE the diff range —
      // the same lift-commit-in-range mechanism US5 closed for the
      // audit-log, but through the backlog task store at the repo root
      // (NOT under the feature root, so the featureRel pathspec misses it).
      writeFileSync(join(repo, 'src.ts'), 'export const a = 4;\n');
      const tasksDir = join(repo, '.stack-control', 'backlog', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(
        join(tasksDir, 'task-1 - x.md'),
        '## Notes\n\nAUDIT-FAKE-77 prose quoting a prior finding\n',
      );
      commit(repo, 'implement + backlog bookkeeping in range');

      // And an UNTRACKED backlog task: the fold applies the same exclusion,
      // silently (governance plumbing — mirrors the audit-log's
      // silent-by-design exclusion; no warn, no ledger row).
      writeFileSync(
        join(tasksDir, 'task-2 - y.md'),
        'AUDIT-FAKE-78 untracked bookkeeping prose\n',
      );

      const warns: string[] = [];
      const r = assembleImplementPayload({
        repoRoot: repo,
        base: 'HEAD~1',
        featureRoot: join(repo, FEATURE_REL),
        excludePaths: [join(repo, '.stack-control', 'backlog')],
        warn: (m) => warns.push(m),
      });
      // The feature's own src change still appears (regression guard) …
      expect(r.diff).toContain('export const a = 4;');
      // … the committed backlog bookkeeping does NOT …
      expect(r.diff).not.toContain('AUDIT-FAKE-77');
      // … nor the untracked one — and its drop is silent-by-design.
      expect(r.diff).not.toContain('AUDIT-FAKE-78');
      expect(warns.some((m) => m.includes('task-2'))).toBe(false);
      expect(r.skippedOtherFeature).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('committed arm excludes a SIBLING feature root audit-log.md but keeps its other committed files (AUDIT-20260611-08)', () => {
    const repo = initRepo();
    try {
      // Two features' lift commits sharing a diff range: the sibling's
      // audit-log.md must not re-feed prior findings — but its OTHER
      // committed files are legitimate diff content (only the fold
      // excludes other-feature roots wholesale).
      const sibling = join(repo, 'specs', '002-other');
      mkdirSync(sibling, { recursive: true });
      writeFileSync(join(repo, 'src.ts'), 'export const a = 5;\n');
      writeFileSync(
        join(sibling, 'audit-log.md'),
        '# Audit Log\n\nAUDIT-FAKE-66 sibling lift prose\n',
      );
      writeFileSync(join(sibling, 'notes.md'), 'SIBLING-LEGIT-COMMITTED-CONTENT\n');
      commit(repo, 'implement + sibling lift sharing the range');

      const r = assembleImplementPayload({
        repoRoot: repo,
        base: 'HEAD~1',
        featureRoot: join(repo, FEATURE_REL),
        excludeRoots: [join(repo, FEATURE_REL), sibling],
      });
      // The feature's own src change still appears (regression guard) …
      expect(r.diff).toContain('export const a = 5;');
      // … the sibling's audit-log does NOT …
      expect(r.diff).not.toContain('AUDIT-FAKE-66');
      // … while the sibling's non-audit-log committed change DOES.
      expect(r.diff).toContain('SIBLING-LEGIT-COMMITTED-CONTENT');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('the labeled audit_log_excerpt context block still threads while the diff stays clean (013/TASK-25 regression guard)', () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, 'src.ts'), 'export const a = 3;\n');
      appendFileSync(join(repo, FEATURE_REL, 'audit-log.md'), `\n${LIFTED_PROSE}`);
      commit(repo, 'implement + lift');

      const built = buildImplementVars(
        repo,
        'feat',
        'HEAD~1',
        undefined,
        'THE-PRIOR-FINDINGS-EXCERPT',
        join(repo, FEATURE_REL),
      );
      expect(built.vars.audit_log_excerpt).toBe('THE-PRIOR-FINDINGS-EXCERPT');
      expect(built.vars.diff).toContain('export const a = 3;');
      expect(built.vars.diff).not.toContain('AUDIT-FAKE-99');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
