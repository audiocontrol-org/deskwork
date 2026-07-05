// 034 T003 — RED-first contract test for the code-scope filter (contracts/code-scope.md
// C1-C8). `src/govern/code-scope.ts` does not exist yet (T004 creates it); this test
// pins the exported surface (`resolveCodeScopePolicy`, `applyCodeScope`,
// `summarizeCodeScope`, `DEFAULT_EXCLUDE`, `DEFAULT_INCLUDE`, `CodeScopePolicy`) and its
// behavioral contract so the implementation has a failing target to satisfy.

import { describe, expect, it } from 'vitest';
import {
  applyCodeScope,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  isDefaultDocumentationFile,
  resolveCodeScopePolicy,
  summarizeCodeScope,
  type CodeScopePolicy,
} from '../../govern/code-scope.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

/** Build a well-typed DiffScope fixture from [file, diffText] pairs (never a mocked fs). */
function makeScope(entries: ReadonlyArray<readonly [string, string]>): DiffScope {
  return {
    base: 'base-sha',
    head: 'head-sha',
    files: entries.map(([file]) => file),
    fileDiffs: new Map(entries),
  };
}

describe('034 T003 — code-scope defaults (C0/FR-006)', () => {
  it('DEFAULT_EXCLUDE / DEFAULT_INCLUDE match the documented contract', () => {
    expect(DEFAULT_EXCLUDE).toEqual(['**/*.md', '**/*.markdown']);
    expect(DEFAULT_INCLUDE).toEqual([
      '**/SKILL.md',
      '**/WORKFLOW.md',
      '**/.claude/rules/**/*.md',
      '**/CLAUDE.md',
      'CLAUDE.md',
      '**/AGENTS.md',
      'AGENTS.md',
    ]);
  });

  it('resolveCodeScopePolicy(undefined) resolves to active defaults', () => {
    const policy: CodeScopePolicy = resolveCodeScopePolicy(undefined);
    expect(policy.active).toBe(true);
    expect(policy.exclude).toEqual(DEFAULT_EXCLUDE);
    expect(policy.include).toEqual(DEFAULT_INCLUDE);
  });
});

describe('034 T003 — applyCodeScope behavior (C1-C6)', () => {
  it('C1/FR-007: an inactive policy makes applyCodeScope the identity', () => {
    const policy = resolveCodeScopePolicy({ codeOnly: false, codeScope: { exclude: [], include: [] } });
    expect(policy.active).toBe(false);

    const scope = makeScope([
      ['src/foo.ts', 'diff --git a/src/foo.ts b/src/foo.ts\n+export const foo = 1;\n'],
      ['docs/PRD.md', 'diff --git a/docs/PRD.md b/docs/PRD.md\n+# PRD\n'],
    ]);
    const result = applyCodeScope(scope, policy);

    expect(result.files).toEqual(scope.files);
    expect(Array.from(result.fileDiffs.entries())).toEqual(Array.from(scope.fileDiffs.entries()));
    expect(result).toEqual(scope);
  });

  it('C2/FR-001: default policy keeps code, drops documentation', () => {
    const policy = resolveCodeScopePolicy(undefined);
    const scope = makeScope([
      ['src/foo.ts', '+export const foo = 1;\n'],
      ['docs/PRD.md', '+# PRD\n'],
    ]);
    const result = applyCodeScope(scope, policy);

    expect(result.files).toEqual(['src/foo.ts']);
    expect(result.fileDiffs.has('docs/PRD.md')).toBe(false);
  });

  it('C3/FR-004: an included SKILL.md survives even though *.md is excluded (include wins)', () => {
    const policy = resolveCodeScopePolicy(undefined);
    const scope = makeScope([
      ['x/SKILL.md', '+skill body\n'],
      ['docs/PRD.md', '+# PRD\n'],
    ]);
    const result = applyCodeScope(scope, policy);

    expect(result.files).toEqual(['x/SKILL.md']);
    expect(result.fileDiffs.has('docs/PRD.md')).toBe(false);
  });

  it('C4/FR-009: globs match at the repo root, not only nested paths', () => {
    const policy = resolveCodeScopePolicy(undefined);
    const scope = makeScope([
      ['README.md', '+readme\n'],
      ['CLAUDE.md', '+claude rules\n'],
    ]);
    const result = applyCodeScope(scope, policy);

    expect(result.files).toEqual(['CLAUDE.md']);
    expect(result.fileDiffs.has('README.md')).toBe(false);
  });

  it("C5/FR-003: a survivor's per-file diff text is unchanged by the filter", () => {
    const policy = resolveCodeScopePolicy(undefined);
    const diffText = '+export const foo = 1;\n-export const foo = 0;\n';
    const scope = makeScope([
      ['src/foo.ts', diffText],
      ['docs/PRD.md', '+# PRD\n'],
    ]);
    const result = applyCodeScope(scope, policy);

    expect(result.fileDiffs.get('src/foo.ts')).toBe(diffText);
  });

  it('C6/FR-008: a supplied include REPLACES (never merges into) the default include', () => {
    // DEFAULT_INCLUDE only names specific runtime-defining files (SKILL.md,
    // CLAUDE.md, ...) — it does not match generic markdown. Supplying a broader
    // include (`**/*.md`) must widen the effective policy to match everything the
    // operator asked for, proving replace-not-merge: if it had merged with the
    // narrow default, PRD.md / README.md below would still be dropped.
    const policy = resolveCodeScopePolicy({
      codeOnly: true,
      codeScope: { exclude: DEFAULT_EXCLUDE, include: ['**/*.md'] },
    });
    expect(policy.include).toEqual(['**/*.md']);

    const scope = makeScope([
      ['docs/PRD.md', '+# PRD\n'],
      ['README.md', '+readme\n'],
      ['src/foo.ts', '+code\n'],
    ]);
    const result = applyCodeScope(scope, policy);

    expect([...result.files].sort()).toEqual(['README.md', 'docs/PRD.md', 'src/foo.ts']);
  });
});

describe('034 T003 — fail-loud validation (C7/Principle V)', () => {
  it('resolveCodeScopePolicy throws on a malformed code_scope.exclude, naming the key', () => {
    // A malformed operator config arrives as loosely-typed data (e.g. parsed from
    // YAML), not a value that already satisfies the strict GovernConfig shape —
    // JSON.parse's `any` return (not an explicit annotation, not a cast) is the
    // vehicle for constructing that malformed runtime value here.
    const malformed = JSON.parse('{"codeOnly":true,"codeScope":{"exclude":"not-an-array","include":[]}}');
    expect(() => resolveCodeScopePolicy(malformed)).toThrow(/exclude/);
  });
});

describe('034 T003 — summarizeCodeScope observability (C8/FR-014)', () => {
  it('reports emptiedScope + a positive excludedCount when filtering empties a non-empty scope', () => {
    const policy = resolveCodeScopePolicy(undefined);
    const before = makeScope([
      ['docs/PRD.md', '+# PRD\n'],
      ['README.md', '+readme\n'],
    ]);
    const after = applyCodeScope(before, policy);
    const summary = summarizeCodeScope(before, after, policy);

    expect(summary.active).toBe(true);
    expect(summary.emptiedScope).toBe(true);
    expect(summary.excludedCount).toBeGreaterThan(0);
  });
});

describe('034 T023 (AUDIT-20260705-01) — isDefaultDocumentationFile classifies against the BUILT-IN defaults', () => {
  it('a plain markdown doc is default documentation', () => {
    expect(isDefaultDocumentationFile('docs/PRD.md')).toBe(true);
  });

  it('a source file is NOT default documentation', () => {
    expect(isDefaultDocumentationFile('src/foo.ts')).toBe(false);
  });

  it('SKILL.md is runtime code (re-included by DEFAULT_INCLUDE), NOT documentation', () => {
    expect(isDefaultDocumentationFile('x/SKILL.md')).toBe(false);
  });
});

describe('034 T023 (AUDIT-20260705-01) — summarizeCodeScope.emptiedByDocumentationOnly', () => {
  it('true when a DEFAULT-policy all-docs diff empties (genuinely documentation-only)', () => {
    const policy = resolveCodeScopePolicy(undefined);
    const before = makeScope([
      ['docs/PRD.md', '+# PRD\n'],
      ['README.md', '+readme\n'],
    ]);
    const after = applyCodeScope(before, policy);
    const summary = summarizeCodeScope(before, after, policy);

    expect(summary.emptiedScope).toBe(true);
    expect(summary.emptiedByDocumentationOnly).toBe(true);
  });

  it('false when an over-broad custom exclude ("src/**") empties a CODE-only diff', () => {
    // The removed files are .ts source — NOT default documentation. A custom
    // policy emptying the scope by removing real CODE must NOT be classified as a
    // documentation-only emptying (that would silently graduate unaudited code).
    const policy = resolveCodeScopePolicy({ codeOnly: true, codeScope: { exclude: ['src/**'], include: [] } });
    const before = makeScope([
      ['src/foo.ts', '+export const foo = 1;\n'],
      ['src/bar.ts', '+export const bar = 2;\n'],
    ]);
    const after = applyCodeScope(before, policy);
    const summary = summarizeCodeScope(before, after, policy);

    expect(summary.emptiedScope).toBe(true);
    expect(summary.emptiedByDocumentationOnly).toBe(false);
  });
});
