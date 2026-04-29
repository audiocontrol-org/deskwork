/**
 * Override resolver — phase 23f.
 *
 * The customization layer lets operators drop a file into
 * `<projectRoot>/.deskwork/<category>/<name>` and have the plugin pick
 * it up at runtime instead of the built-in default. Three categories
 * exist today: `templates` (studio page renderers), `prompts`
 * (reserved — no defaults yet), and `doctor` (runner rules).
 *
 * This module is the lookup contract. Each method takes a base name
 * (no extension) and returns the absolute path of an override file if
 * one exists, or `null` otherwise. Callers decide what to do with the
 * returned path:
 *   - studio page renderers `await import(path)` and call the module's
 *     `default` export with the same arguments the built-in renderer
 *     expected;
 *   - the doctor runner discovers project rules via the directory
 *     listing path (see `doctor/runner.ts`); the resolver method here
 *     is for one-off basename-collision lookups.
 *
 * Discovery is sync and uses `existsSync` — there is no caching. The
 * project root is captured at construction time, so the resolver is
 * cheap to create per-request if needed.
 *
 * Filename convention: callers pass names without extension. The
 * resolver checks for `.ts` files first (the documented contract); if
 * that doesn't exist it returns `null`. We only support TypeScript
 * source — operators are expected to author overrides as TS modules
 * the plugin's runtime tsx loader can execute.
 *
 * Override module contract for `templates`:
 *   ```ts
 *   import type { StudioContext } from '@deskwork/studio/routes/api';
 *   export default function (ctx: StudioContext, ...args): string;
 *   ```
 *   The exact `args` shape mirrors whatever the built-in renderer
 *   expects (see each `pages/<name>.ts`). The override's return type
 *   must match too (`string` HTML for sync renderers, `Promise<string>`
 *   for async ones).
 *
 * Override module contract for `doctor`:
 *   ```ts
 *   import type { DoctorRule } from '@deskwork/core/doctor';
 *   const rule: DoctorRule = { ... };
 *   export default rule;
 *   ```
 *   The rule's `id` is what the runner uses for fix-by-id lookups; if
 *   the basename matches a built-in rule basename, the project rule
 *   wins (see `doctor/runner.ts` for the merge logic).
 *
 * `prompts` is reserved — no default sources exist yet, so the
 * resolver just returns paths if they happen to be present. Future
 * deskwork features will pin a default-source mapping for this
 * category.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type OverrideCategory = 'templates' | 'prompts' | 'doctor';

export interface OverrideResolver {
  /** Look up a `templates/<name>.ts` override. */
  template(name: string): string | null;
  /** Look up a `prompts/<name>.ts` override. */
  prompt(name: string): string | null;
  /** Look up a `doctor/<name>.ts` override. */
  doctorRule(name: string): string | null;
  /**
   * Absolute path of the `.deskwork/<category>` directory the resolver
   * watches. Useful for callers that want to enumerate every override
   * (the doctor runner does this to merge project rules with built-in
   * rules). Returns the directory path even when it doesn't exist —
   * the caller checks `existsSync` if it cares.
   */
  categoryDir(category: OverrideCategory): string;
}

/**
 * Build a resolver scoped to `projectRoot`. The factory captures the
 * project root once; subsequent lookups join `<projectRoot>/.deskwork/`
 * with the category and basename.
 *
 * Sync by design — every studio request needs to consult the resolver
 * before deciding which renderer to dispatch, and an `await` on the
 * fast-path would cost a microtask hop on every request.
 */
export function createOverrideResolver(projectRoot: string): OverrideResolver {
  const root = join(projectRoot, '.deskwork');

  function lookup(category: OverrideCategory, name: string): string | null {
    const path = join(root, category, `${name}.ts`);
    return existsSync(path) ? path : null;
  }

  return {
    template(name: string): string | null {
      return lookup('templates', name);
    },
    prompt(name: string): string | null {
      return lookup('prompts', name);
    },
    doctorRule(name: string): string | null {
      return lookup('doctor', name);
    },
    categoryDir(category: OverrideCategory): string {
      return join(root, category);
    },
  };
}
