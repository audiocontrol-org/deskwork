/**
 * Phase 23f — studio override-render helper.
 *
 * Page renderers consult the override resolver at the top of each
 * render. When a `templates/<name>.ts` file exists in the project's
 * `.deskwork/`, the renderer loads it and delegates the entire render
 * to the override module's `default` export. The default export is
 * called with the same arguments as the built-in renderer.
 *
 * The override contract:
 *   - Module exports a `default` function.
 *   - Function signature must match the built-in renderer (the type
 *     parameter `Args` here makes that explicit at the call site).
 *   - Function returns either a string (sync renderers) or a
 *     Promise<string> (async renderers). Both are awaited in
 *     `runOverride`.
 *
 * If the override exists but its `default` export is missing or not
 * a function, we throw a descriptive error rather than falling back
 * to the built-in renderer. Operators get a loud, actionable failure
 * instead of a silent miss.
 */

import type { OverrideResolver } from '@deskwork/core/overrides';
import { createOverrideResolver } from '@deskwork/core/overrides';
import type { StudioContext } from '../routes/api.ts';

/**
 * Return a resolver for `ctx`. When the context already carries one
 * (production boot), reuse it; otherwise build a fresh resolver from
 * `ctx.projectRoot`. The result is always a real OverrideResolver —
 * there is no skip path.
 */
export function getResolver(ctx: StudioContext): OverrideResolver {
  if (ctx.resolver) return ctx.resolver;
  return createOverrideResolver(ctx.projectRoot);
}

/**
 * Discriminator for a module's default export. Narrows `unknown` to
 * `(...args: Args) => string | Promise<string>` without `as`-casting.
 */
function isOverrideRenderer<Args extends readonly unknown[]>(
  value: unknown,
): value is (...args: Args) => string | Promise<string> {
  return typeof value === 'function';
}

/**
 * Load and execute a templates override.
 *
 * `name` is the template basename (no extension). When no override is
 * registered, returns `null` — the caller proceeds with its built-in
 * renderer. When an override IS registered, the module is dynamically
 * imported and its `default` export is called with `args`.
 */
export async function runTemplateOverride<Args extends readonly unknown[]>(
  ctx: StudioContext,
  name: string,
  args: Args,
): Promise<string | null> {
  const resolver = getResolver(ctx);
  const path = resolver.template(name);
  if (path === null) return null;

  // Dynamic import of an absolute file path. The plugin's runtime tsx
  // loader (the studio is always invoked through tsx — see the
  // server.ts shebang) makes `.ts` imports work at runtime.
  const mod: unknown = await import(path);
  if (typeof mod !== 'object' || mod === null) {
    throw new Error(
      `template override at ${path} did not export a module object`,
    );
  }
  const fn = Reflect.get(mod, 'default');
  if (!isOverrideRenderer<Args>(fn)) {
    throw new Error(
      `template override at ${path} must export a 'default' function (got ${typeof fn})`,
    );
  }
  const out = await fn(...args);
  if (typeof out !== 'string') {
    throw new Error(
      `template override at ${path} returned a ${typeof out}; expected string`,
    );
  }
  return out;
}
