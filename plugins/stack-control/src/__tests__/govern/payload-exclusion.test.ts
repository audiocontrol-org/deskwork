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
import {
  buildImplementVars,
  formatScopeExclusionSummary,
} from '../../subcommands/govern.js';

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

describe('buildImplementVars surfaces the path-scope exclusions structurally (claude-20260612-03)', () => {
  it('returns skippedOutOfScope so the exclusions reach the verdict surface, not just per-file stderr warns', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-skip-surface-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    mkdirSync(join(repo, 'src', 'phase-2'), { recursive: true });
    mkdirSync(join(repo, 'src', 'parked'), { recursive: true });
    writeFileSync(join(repo, 'src', 'phase-2', 'in.ts'), 'export const IN = true;\n');
    writeFileSync(join(repo, 'src', 'parked', 'out.ts'), 'export const OUT = true;\n');
    const built = buildImplementVars(repo, 'feat', 'HEAD', undefined, ['src/phase-2/in.ts']);
    expect(built.skippedOutOfScope).toContain('src/parked/out.ts');
    expect(built.skippedOutOfScope).not.toContain('src/phase-2/in.ts');
  });

  it('returns an empty skippedOutOfScope for a whole-feature unit (no path scope)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-skip-none-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    writeFileSync(join(repo, 'a.ts'), 'export const A = 1;\n');
    const built = buildImplementVars(repo, 'feat', 'HEAD', undefined);
    expect(built.skippedOutOfScope).toEqual([]);
  });
});

describe('formatScopeExclusionSummary — the verdict-surface line (claude-20260612-r3-01/-02)', () => {
  it('emits nothing when no files were excluded', () => {
    expect(formatScopeExclusionSummary([])).toBeUndefined();
  });

  it('emits one consolidated line naming every excluded file and the count', () => {
    const line = formatScopeExclusionSummary(['src/parked/a.ts', 'src/parked/b.ts']);
    expect(line).toBeDefined();
    expect(line).toContain('excluded 2 untracked');
    expect(line).toContain('src/parked/a.ts');
    expect(line).toContain('src/parked/b.ts');
  });

  it('places the file list LAST after a single ": " so a consumer can extract it cleanly (claude-r3-02)', () => {
    const line = formatScopeExclusionSummary(['src/parked/a.ts', 'src/parked/b.ts'])!;
    // The trailing segment after the final ": " is exactly the comma-joined list.
    const extracted = line.slice(line.lastIndexOf(': ') + 2);
    expect(extracted).toBe('src/parked/a.ts, src/parked/b.ts');
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
      installationRoot: repo,
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
    const r = assembleImplementPayload({ installationRoot: repo, base: 'HEAD' });
    expect(r.diff).toContain('export const A = 1;');
    expect(r.diff).toContain('export const B = 2;');
    expect(r.skippedOutOfScope).toEqual([]);
  });
});

describe('committed diff is scoped to the unit path scope (AUDIT-20260612-01)', () => {
  // The pre-fix gap: pathScope gated ONLY the untracked fold; the committed
  // `git diff base` was unconditional. So a `--phase` audit of COMMITTED work
  // (the normal commit-per-task flow) folded the whole-feature committed diff,
  // not the phase — contradicting SC-006. This block exercises a COMMITTED
  // phase, which the untracked-only tests above never reached.
  function gitCommitAll(repo: string, message: string): string {
    spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
    spawnSync(
      'git',
      [
        '-C', repo,
        '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false',
        'commit', '-q', '--no-gpg-sign', '-m', message,
      ],
      { encoding: 'utf8' },
    );
    return spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  }

  it('a committed in-scope change is audited; a committed out-of-scope change is excluded', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-committed-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    mkdirSync(join(repo, 'src', 'phase-2'), { recursive: true });
    mkdirSync(join(repo, 'src', 'phase-1'), { recursive: true });
    writeFileSync(join(repo, 'src', 'phase-1', 'old.ts'), 'export const OLD = 1;\n');
    const base = gitCommitAll(repo, 'base');
    // Phase-2 work AND an unrelated phase-1 edit both land as committed changes.
    writeFileSync(join(repo, 'src', 'phase-2', 'feature.ts'), 'export const PHASE_TWO = true;\n');
    writeFileSync(join(repo, 'src', 'phase-1', 'old.ts'), 'export const OLD = 999;\n');
    gitCommitAll(repo, 'phase 2 + drive-by phase 1 edit');

    const r = assembleImplementPayload({
      installationRoot: repo,
      base,
      pathScope: ['src/phase-2/feature.ts'],
    });
    expect(r.diff).toContain('PHASE_TWO');
    expect(r.diff).not.toContain('OLD = 999');
  });

  it('an untracked sibling NOT named in the phase scope is excluded (per-phase contract)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'payload-sibling-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    mkdirSync(join(repo, 'src', 'phase-2'), { recursive: true });
    writeFileSync(join(repo, 'src', 'phase-2', 'feature.ts'), 'export const NAMED = true;\n');
    // A sibling under the same directory the implementer created but did NOT
    // name in a task line — the phase scope is its named files, so it is out.
    writeFileSync(join(repo, 'src', 'phase-2', 'unnamed.ts'), 'export const UNNAMED = true;\n');
    const r = assembleImplementPayload({
      installationRoot: repo,
      base: 'HEAD',
      pathScope: ['src/phase-2/feature.ts'],
    });
    expect(r.diff).toContain('NAMED');
    expect(r.diff).not.toContain('UNNAMED');
    expect(r.skippedOutOfScope).toContain('src/phase-2/unnamed.ts');
  });
});
