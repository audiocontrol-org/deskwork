// specs/015 SC-005 + 030 — the implement-mode vars carry an EMPTY audit_log_excerpt (the
// self-referential fold that manufactured findings about the audit-log's own prose is gone;
// the dampener/gate still read the audit-log FILE directly), and the spec-mode exclusion
// summary renders cleanly. 030 (FR-024): the per-phase pathScope exclusion + the committed-
// diff scoping the old assembler did are retired — the end-govern pipeline re-scopes per
// chunk, and filterDiffScope/resolveImplementExclusion (payload-diff-scope.test.ts) own the
// exclusion behavior now.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildImplementVars,
  formatScopeExclusionSummary,
} from '../../govern/govern-vars.js';

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
