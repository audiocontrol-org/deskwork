/**
 * Phase 23f — project-level doctor rule loader.
 *
 * Operators can drop a `.ts` module in `<projectRoot>/.deskwork/doctor/`
 * to register a custom rule. The runner merges those project rules
 * with the built-in rules; basename collisions let the project rule
 * override the built-in (e.g., a project-supplied
 * `missing-frontmatter-id.ts` replaces the bundled one).
 *
 * Override resolution by basename, not by `rule.id`: the basename is
 * what the operator types; mapping it to a rule object happens in the
 * import. We chose basename-as-key so operators can author a rule
 * whose internal `id` differs from the file name (e.g., a project's
 * "tighter" version of an existing rule keeps the same id for `--fix`
 * compatibility but lives at a basename-collision path).
 *
 * Discovery is sync — the runner builds the merged rule list once at
 * the start of an audit/repair run, not per finding. We use
 * `readdirSync` + `import()` (the latter is async; we await all
 * project rules in `loadProjectRules`).
 *
 * Failure mode: a project rule that fails to import (bad TypeScript,
 * wrong default export shape) throws. The runner surfaces the throw
 * to the operator rather than silently dropping the rule.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DoctorRule } from './types.ts';

const RULE_FILE_SUFFIX = '.ts';

/**
 * Narrow an unknown imported value to a `DoctorRule`. We require:
 *   - object with non-null id+label string fields,
 *   - audit / plan / apply functions.
 *
 * Failures throw a descriptive message — the operator's rule file is
 * malformed and they need to know which file and which field.
 */
function assertDoctorRule(value: unknown, source: string): DoctorRule {
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `project doctor rule ${source}: default export must be an object`,
    );
  }
  const id = Reflect.get(value, 'id');
  const label = Reflect.get(value, 'label');
  const audit = Reflect.get(value, 'audit');
  const plan = Reflect.get(value, 'plan');
  const apply = Reflect.get(value, 'apply');
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(
      `project doctor rule ${source}: 'id' must be a non-empty string`,
    );
  }
  if (typeof label !== 'string' || label.length === 0) {
    throw new Error(
      `project doctor rule ${source}: 'label' must be a non-empty string`,
    );
  }
  if (typeof audit !== 'function') {
    throw new Error(
      `project doctor rule ${source}: 'audit' must be a function`,
    );
  }
  if (typeof plan !== 'function') {
    throw new Error(
      `project doctor rule ${source}: 'plan' must be a function`,
    );
  }
  if (typeof apply !== 'function') {
    throw new Error(
      `project doctor rule ${source}: 'apply' must be a function`,
    );
  }
  // The shape checks above narrow `value` to a DoctorRule for
  // practical purposes; we synthesize a plain rule reference rather
  // than `as`-cast to avoid the lint rule about type assertions.
  return {
    id,
    label,
    audit: audit.bind(value),
    plan: plan.bind(value),
    apply: apply.bind(value),
  };
}

/**
 * One loaded project rule plus its source basename. The basename is
 * what the runner uses to detect override collisions with built-in
 * rules.
 */
export interface LoadedProjectRule {
  /** Filename without extension — e.g. `missing-frontmatter-id`. */
  basename: string;
  /** Absolute path of the source file. */
  path: string;
  /** Imported and type-narrowed rule. */
  rule: DoctorRule;
}

/**
 * Walk `<projectRoot>/.deskwork/doctor/` and return every rule found,
 * in alphabetical order. Returns an empty list when the directory
 * doesn't exist — no `.deskwork/doctor/` is the common case and must
 * not throw.
 */
export async function loadProjectRules(
  projectRoot: string,
): Promise<LoadedProjectRule[]> {
  const dir = join(projectRoot, '.deskwork', 'doctor');
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir).filter((n) => n.endsWith(RULE_FILE_SUFFIX));
  entries.sort();

  const out: LoadedProjectRule[] = [];
  for (const name of entries) {
    const path = join(dir, name);
    const basename = name.slice(0, -RULE_FILE_SUFFIX.length);
    // Dynamic import via an absolute path — works under tsx (the
    // runtime the CLI uses) and node when project rules are pre-
    // compiled to JS adjacent paths in some future workflow.
    const mod: unknown = await import(path);
    if (typeof mod !== 'object' || mod === null) {
      throw new Error(
        `project doctor rule ${path}: import did not produce a module object`,
      );
    }
    const def = Reflect.get(mod, 'default');
    const rule = assertDoctorRule(def, path);
    out.push({ basename, path, rule });
  }
  return out;
}

/**
 * Merge built-in rules with project rules. Project rules with a
 * basename matching a built-in rule's basename REPLACE the built-in
 * (override). Project rules with new basenames are APPENDED in their
 * loaded order (alphabetical from `loadProjectRules`).
 *
 * The basename-of-built-in mapping uses each built-in rule's `id`,
 * because every shipped rule is named after its id. If we ever ship
 * a built-in whose file basename and id differ, this mapping will
 * need an explicit table.
 */
export function mergeRules(
  builtIns: ReadonlyArray<DoctorRule>,
  projectRules: ReadonlyArray<LoadedProjectRule>,
): DoctorRule[] {
  // Map built-in rule id (== basename today) → index, so we can
  // splice in the override at the same position.
  const builtInIndexByBasename = new Map<string, number>();
  for (let i = 0; i < builtIns.length; i++) {
    builtInIndexByBasename.set(builtIns[i].id, i);
  }

  const merged: DoctorRule[] = builtIns.slice();
  const overriddenBasenames = new Set<string>();

  for (const p of projectRules) {
    const idx = builtInIndexByBasename.get(p.basename);
    if (idx !== undefined) {
      merged[idx] = p.rule;
      overriddenBasenames.add(p.basename);
    }
  }

  for (const p of projectRules) {
    if (overriddenBasenames.has(p.basename)) continue;
    merged.push(p.rule);
  }

  return merged;
}
