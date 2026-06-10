/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/clones-yaml-refactor-incomplete.ts
 *
 * Doctor rule: walks clones.yaml looking for entries with
 * `disposition: refactor` and reports any missing / malformed Step 0a
 * or Step 0b fields. Repair hints are per-branch (one per Step 0a /
 * Step 0b sub-case) so the operator gets specific guidance, not a
 * generic "fix the file" pointer.
 *
 * Each precondition error from `validateRefactorPreconditions` becomes
 * its own finding so the doctor surfaces the full picture in one pass.
 *
 * Step 0a branches (canonical declaration):
 *   1. canonical_side missing/empty   → name a file path | "all" | "new"
 *   2. canonical_reason missing/empty → justify the canonical_side choice
 *   3. new_shape_summary required when canonical_side === "new"
 *   4. new_shape_summary present-but-empty in non-"new" branch
 *
 * Step 0b branches (test safety net):
 *   5. tests missing/empty            → add at least one test id/command
 *   6. tests_proof missing or wrong shape → add { sha, demonstration }
 *   7. tests_proof.sha malformed      → use 7-40 lowercase hex
 *
 * The validator's error messages are already specific; this rule's
 * job is to (a) classify each into a Step 0a vs Step 0b branch and (b)
 * append a per-branch repair hint that names the exact missing artifact.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'node:path';
import { validateRefactorPreconditions } from '../clones-yaml.refactor.js';
import { errorMessage, isPlainObject } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'clones-yaml-refactor-incomplete';
const FILE_REL = '.stack-control/scope-discovery/clones.yaml';

interface RepairBranch {
  readonly match: RegExp;
  readonly hint: string;
}

const REPAIR_BRANCHES: ReadonlyArray<RepairBranch> = [
  {
    match: /'canonical_side'/,
    hint:
      'Add `canonical_side: <file-path> | "all" | "new"` to the entry. ' +
      'See plugins/stack-control/src/scope-discovery/clones-yaml.refactor.ts for ' +
      'the three branch semantics.',
  },
  {
    match: /'canonical_reason'/,
    hint:
      'Add a non-empty `canonical_reason:` explaining why this side ' +
      'carries the canonical regime (or why "all" / "new" is correct).',
  },
  {
    match: /'new_shape_summary' is required/,
    hint:
      'When `canonical_side: "new"`, add `new_shape_summary:` describing ' +
      'the new shape being designed. Required because no side is canonical; ' +
      'without it, the new shape gets invented mid-extraction.',
  },
  {
    match: /'new_shape_summary' must be omitted or/,
    hint:
      'Either remove `new_shape_summary:` (the entry\'s canonical_side names a ' +
      'concrete file or "all") OR populate it with a non-empty description. ' +
      'Empty string is rejected as a malformed declaration.',
  },
  {
    match: /'tests' is required/,
    hint:
      'Add `tests:` as a non-empty list of test ids / commands that anchor ' +
      'the refactor\'s safety net (e.g. vitest test names, shell commands).',
  },
  {
    match: /tests\[\d+\]/,
    hint:
      'Each `tests[]` entry must be a non-empty string. Remove or fix any ' +
      'entries that are not strings (numbers, nulls, objects).',
  },
  {
    match: /'tests_proof' is required/,
    hint:
      'Add `tests_proof: { sha: <commit-sha>, demonstration: <text> }` showing ' +
      'a failing-then-passing commit pair that proves the test suite catches ' +
      'the regression the refactor protects against.',
  },
  {
    match: /'tests_proof\.sha'/,
    hint:
      'tests_proof.sha must be 7-40 lowercase hex characters (a git commit SHA).',
  },
  {
    match: /'tests_proof\.demonstration'/,
    hint:
      'tests_proof.demonstration must be a non-empty string describing how ' +
      'the test demonstrates the regression catch.',
  },
];

function classify(message: string): string | undefined {
  for (const branch of REPAIR_BRANCHES) {
    if (branch.match.test(message)) return branch.hint;
  }
  return undefined;
}

interface RefactorishEntry {
  readonly raw: Record<string, unknown>;
  readonly id: string;
}

function collectRefactorishEntries(yamlText: string): readonly RefactorishEntry[] {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return [];
  }
  if (!isPlainObject(parsed)) return [];
  const clones = parsed['clones'];
  if (!Array.isArray(clones)) return [];
  const out: RefactorishEntry[] = [];
  for (const entry of clones) {
    if (!isPlainObject(entry)) continue;
    if (entry['disposition'] !== 'refactor') continue;
    const id = entry['id'];
    if (typeof id !== 'string' || id.length === 0) continue;
    out.push({ raw: entry, id });
  }
  return out;
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const path = join(opts.repoRoot, FILE_REL);
  if (!existsSync(path)) return [];
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return [
      {
        rule: RULE_ID,
        severity: 'error',
        message: `${path}: failed to read (${errorMessage(err)}).`,
      },
    ];
  }

  // Re-parse loosely so we can iterate refactor entries even when the
  // strict parser would reject the file for an unrelated shape issue
  // (which the clones-yaml-schema-violation rule catches separately).
  const entries = collectRefactorishEntries(text);
  const findings: ScopeDoctorFinding[] = [];
  for (const entry of entries) {
    const result = validateRefactorPreconditions(entry.raw, entry.id);
    if (result.ok) {
      continue;
    }
    for (const err of result.errors) {
      const hint = classify(err);
      findings.push({
        rule: RULE_ID,
        severity: 'error',
        message: hint ? `${err} → ${hint}` : err,
      });
    }
  }
  return findings;
};
