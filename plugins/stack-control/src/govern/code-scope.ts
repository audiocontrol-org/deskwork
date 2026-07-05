// 034 — governance code-scope: the pure filter/resolution core (T004).
//
// Scopes the govern audit payload down to CODE by dropping documentation files,
// while re-including the runtime-defining markdown that behaves like code
// (SKILL.md, WORKFLOW.md, CLAUDE.md, AGENTS.md, `.claude/rules/**`). The core is
// pure and deterministic: `resolveCodeScopePolicy` turns installation config into
// an effective policy (fail-loud on malformed input, Principle V), `applyCodeScope`
// is a total DiffScope → DiffScope filter, and `summarizeCodeScope` reports the
// concise observability facts (FR-014). No I/O, no git, no globals.
//
// Contract: specs/034-governance-code-scope/contracts/code-scope.md (C0-C8).

import picomatch from 'picomatch';
import type { GovernConfig } from '../config/types.js';
import type { DiffScope } from './payload-diff-scope.js';

/**
 * Default exclusion set (FR-006). Documentation markdown falls OUT of the audit
 * payload unless the include set pulls it back. A supplied `exclude` REPLACES this
 * wholesale (FR-008) — never merges.
 */
export const DEFAULT_EXCLUDE: readonly string[] = ['**/*.md', '**/*.markdown'];

/**
 * Default inclusion set (FR-004/FR-006). The runtime-defining markdown that IS code
 * from the audit's perspective — skill/workflow bodies, the rules corpus, and the
 * agent-context files — is re-included so an edit to it stays in scope even though the
 * markdown-exclusion glob excludes it. Include wins over exclude. A supplied `include`
 * REPLACES this wholesale (FR-008).
 */
export const DEFAULT_INCLUDE: readonly string[] = [
  '**/SKILL.md',
  '**/WORKFLOW.md',
  '**/.claude/rules/**/*.md',
  '**/CLAUDE.md',
  'CLAUDE.md',
  '**/AGENTS.md',
  'AGENTS.md',
];

/**
 * The effective, resolved code-scope policy. The compiled picomatch matchers are an
 * implementation detail of `applyCodeScope` (compiled there from these glob lists),
 * deliberately NOT surfaced here — the policy stays a plain, comparable data shape.
 */
export interface CodeScopePolicy {
  /** Whether filtering is active. `false` ⇒ `applyCodeScope` is the identity (FR-007). */
  readonly active: boolean;
  /** Exclusion globs (a file matching any is a drop candidate). */
  readonly exclude: readonly string[];
  /** Inclusion globs (a file matching any survives regardless of exclusion — include wins). */
  readonly include: readonly string[];
}

/** Concise exclusion summary for observability (FR-014) — counts only, never the path list. */
export interface CodeScopeExclusionSummary {
  readonly active: boolean;
  /** How many files the filter dropped (`before.files.length - after.files.length`). */
  readonly excludedCount: number;
  /** True when an active filter reduced a non-empty scope to empty (FR-011). */
  readonly emptiedScope: boolean;
}

/** Render an offending runtime value for a fail-loud error message (no cast, no throw). */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) return 'a non-string-array';
  if (value === null) return 'null';
  return `a ${typeof value}`;
}

/** Runtime guard: an array whose every element is a string. */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Resolve the effective policy from installation `govern` config (FR-006/FR-008).
 *
 * - Absent block ⇒ full defaults, active (this is the specified default, NOT a
 *   silent fallback).
 * - `codeOnly` present but non-boolean, or `codeScope.exclude`/`codeScope.include`
 *   present but not a string array ⇒ THROW a descriptive error naming the offending
 *   key (Principle V). Never silently defaults over malformed input.
 * - A supplied `exclude`/`include` REPLACES the corresponding default (no merge).
 *
 * The parameter is typed `GovernConfig | undefined`, but operator config arrives as
 * loosely-typed parsed data; the runtime `typeof`/array guards below validate the
 * real shape without a cast.
 */
export function resolveCodeScopePolicy(govern: GovernConfig | undefined): CodeScopePolicy {
  if (govern === undefined) {
    return { active: true, exclude: DEFAULT_EXCLUDE, include: DEFAULT_INCLUDE };
  }

  const rawCodeOnly: unknown = govern.codeOnly;
  if (rawCodeOnly !== undefined && typeof rawCodeOnly !== 'boolean') {
    throw new Error(
      `govern: code_only must be a boolean; got ${describeValue(rawCodeOnly)}.`,
    );
  }
  const active: boolean = rawCodeOnly ?? true;

  let exclude: readonly string[] = DEFAULT_EXCLUDE;
  let include: readonly string[] = DEFAULT_INCLUDE;

  const codeScope = govern.codeScope;
  if (codeScope !== undefined) {
    const rawCodeScope: unknown = codeScope;
    if (typeof rawCodeScope !== 'object' || rawCodeScope === null || Array.isArray(rawCodeScope)) {
      throw new Error(
        `govern: code_scope must be a mapping with optional exclude/include arrays; got ${describeValue(rawCodeScope)}.`,
      );
    }

    const rawExclude: unknown = codeScope.exclude;
    if (rawExclude !== undefined) {
      if (!isStringArray(rawExclude)) {
        throw new Error(
          `govern: code_scope.exclude must be an array of strings; got ${describeValue(rawExclude)}.`,
        );
      }
      exclude = rawExclude;
    }

    const rawInclude: unknown = codeScope.include;
    if (rawInclude !== undefined) {
      if (!isStringArray(rawInclude)) {
        throw new Error(
          `govern: code_scope.include must be an array of strings; got ${describeValue(rawInclude)}.`,
        );
      }
      include = rawInclude;
    }
  }

  return { active, exclude, include };
}

/** A path predicate compiled from a glob list; matches when ANY glob matches (dotfiles included). */
function compileMatcher(globs: readonly string[]): (path: string) => boolean {
  if (globs.length === 0) return () => false;
  const matcher = picomatch([...globs], { dot: true });
  return (path: string): boolean => matcher(path);
}

/**
 * Pure DiffScope → DiffScope filter (FR-001/FR-003/FR-004/FR-007).
 *
 * - Identity when the policy is inactive (returns the SAME object — today's payload
 *   exactly).
 * - Otherwise drops a file iff it matches an exclusion glob AND matches no inclusion
 *   glob (include wins). Every other file is kept.
 * - Survivors' per-file diff text is preserved byte-for-byte; `base`/`head` are
 *   preserved.
 */
export function applyCodeScope(scope: DiffScope, policy: CodeScopePolicy): DiffScope {
  if (!policy.active) return scope;

  const isExcluded = compileMatcher(policy.exclude);
  const isIncluded = compileMatcher(policy.include);

  const survivors = scope.files.filter((file) => !(isExcluded(file) && !isIncluded(file)));

  const fileDiffs = new Map<string, string>();
  for (const file of survivors) {
    const diff = scope.fileDiffs.get(file);
    if (diff !== undefined) fileDiffs.set(file, diff);
  }

  return { base: scope.base, head: scope.head, files: survivors, fileDiffs };
}

/**
 * Summarize a filter application for observability (FR-014). Reports counts only —
 * never the excluded path list. `emptiedScope` marks the documentation-only change
 * that an active filter reduces to nothing to govern (FR-011).
 */
export function summarizeCodeScope(
  before: DiffScope,
  after: DiffScope,
  policy: CodeScopePolicy,
): CodeScopeExclusionSummary {
  const excludedCount = before.files.length - after.files.length;
  const emptiedScope = policy.active && before.files.length > 0 && after.files.length === 0;
  return { active: policy.active, excludedCount, emptiedScope };
}
