// specs/015-audit-protocol-convergence — T021 (RED): the barrage payload excludes
// its own prior audit-log AND unrelated parked scaffolds (FR-006 / SC-005 / D7).
//
//   - the implement-mode vars carry an EMPTY audit_log_excerpt: the
//     self-referential fold that manufactured findings about the audit-log's own
//     prose is gone (the dampener/gate still read the audit-log FILE directly —
//     only the audited payload the models read excludes it).
//   - the untracked fold is bounded to the unit's path scope: an in-scope
//     untracked file is folded; an unrelated parked-feature scaffold is excluded.

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleImplementPayload } from '../../govern/payload-implement.js';
import { buildImplementVars } from '../../subcommands/govern.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('payload excludes the feature own audit-log (SC-005, self-reference removed)', () => {
  it('implement-mode vars carry an empty audit_log_excerpt even when an audit-log exists', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-excl-'));
    dirs.push(repo);
    // A populated audit-log exists at the feature root.
    const featureRoot = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat');
    mkdirSync(featureRoot, { recursive: true });
    writeFileSync(
      join(featureRoot, 'audit-log.md'),
      '# Audit log\n\nSELF-REFERENTIAL-FINDING-PROSE that the barrage must NOT re-audit.\n',
      'utf8',
    );
    const { vars } = buildImplementVars(repo, 'feat', 'HEAD', undefined);
    expect(vars.audit_log_excerpt).toBe('');
    // The self-referential prose is nowhere in the assembled payload vars.
    expect(JSON.stringify(vars)).not.toContain('SELF-REFERENTIAL-FINDING-PROSE');
  });
});

describe('untracked fold is bounded to the unit path scope (SC-005, parked scaffold excluded)', () => {
  it('folds an in-scope untracked file but excludes an unrelated parked scaffold', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-scope-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    mkdirSync(join(repo, 'src', 'feature-a'), { recursive: true });
    mkdirSync(join(repo, 'src', 'parked-feature-b'), { recursive: true });
    writeFileSync(join(repo, 'src', 'feature-a', 'new.ts'), 'export const IN_SCOPE = true;\n');
    writeFileSync(
      join(repo, 'src', 'parked-feature-b', 'scaffold.ts'),
      'export const PARKED_SCAFFOLD = true;\n',
    );
    const r = assembleImplementPayload({
      repoRoot: repo,
      base: 'HEAD',
      pathScope: ['src/feature-a'],
    });
    expect(r.diff).toContain('IN_SCOPE');
    expect(r.diff).not.toContain('PARKED_SCAFFOLD');
    expect(r.skippedOutOfScope).toContain('src/parked-feature-b/scaffold.ts');
  });

  it('no path scope (whole-feature unit) folds all untracked files (pre-015 behavior)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-noscope-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    writeFileSync(join(repo, 'a.ts'), 'export const A = 1;\n');
    writeFileSync(join(repo, 'b.ts'), 'export const B = 2;\n');
    const r = assembleImplementPayload({ repoRoot: repo, base: 'HEAD' });
    expect(r.diff).toContain('export const A = 1;');
    expect(r.diff).toContain('export const B = 2;');
    expect(r.skippedOutOfScope).toEqual([]);
  });
});
