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
// NOR the untracked fold; (b) the untracked fold contains only files
// under the feature under audit; (c) the labeled audit_log_excerpt
// context block is the ONLY audit-log content in the payload.
// Without a feature root the assembler's legacy behavior is unchanged
// (govern-payload-implement.test.ts pins that).

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

  it('untracked fold excludes the audit-log AND an unrelated feature scaffold; the feature own untracked files fold in', () => {
    const repo = initRepo();
    try {
      // Untracked: the feature's own evidence (must fold), an untracked
      // audit-log variant (must not), an unrelated feature's scaffold
      // (must not — the recorded parked-feature pull).
      writeFileSync(join(repo, FEATURE_REL, 'evidence.md'), 'EVIDENCE NOTE for the feature\n');
      mkdirSync(join(repo, 'specs', '002-unrelated'), { recursive: true });
      writeFileSync(
        join(repo, 'specs', '002-unrelated', 'scaffold.md'),
        'UNRELATED PARKED SCAFFOLD\n',
      );
      appendFileSync(join(repo, FEATURE_REL, 'audit-log.md'), `\n${LIFTED_PROSE}`);

      const r = assembleImplementPayload({
        repoRoot: repo,
        base: 'HEAD',
        featureRoot: join(repo, FEATURE_REL),
      });
      expect(r.diff).toContain('EVIDENCE NOTE for the feature');
      expect(r.diff).not.toContain('UNRELATED PARKED SCAFFOLD');
      expect(r.diff).not.toContain('AUDIT-FAKE-99');
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
