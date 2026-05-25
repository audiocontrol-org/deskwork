/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/ui-route-enumerator.ts
 *
 * Discovery Agent 1 — UI route enumerator.
 *
 * What it does:
 *   1. Identify which workspace modules are in scope for the feature.
 *   2. Detect which `RouterStrategy` applies to the repo (currently only
 *      React-Router-DOM is bundled; see #286 for follow-ups).
 *   3. Delegate route enumeration to the matched strategy.
 *   4. Emit structured UiRouteFindings JSON.
 *
 * Honest scope: this agent enumerates the route MAP — it does NOT
 * drive Playwright. Capture-via-Playwright is the `scope-inventory`
 * subcommand's job at invocation time. The agent's output is the
 * deterministic seed the subcommand uses to plan its walks.
 *
 * ## Router-strategy architecture
 *
 * The pilot version hardcoded React-Router-DOM regexes inline. We
 * extract a `RouterStrategy` interface so additional frameworks
 * (Vue Router, Next.js, SvelteKit) can be added incrementally without
 * touching the orchestration shell. See #286 for the follow-up to
 * port additional default strategies.
 *
 * Project-supplied strategy overrides (loaded from
 * `.dw-lifecycle/scope-discovery/router-strategies/<id>.ts`) are
 * deferred to a later phase — only the bundled defaults ship today.
 *
 * CLI:
 *   tsx plugins/dw-lifecycle/src/scope-discovery/discovery-agents/ui-route-enumerator.ts \
 *     --feature <slug> --prd-path <path> [--repo-root <path>] [--module-root <path>]
 */

import { join } from 'node:path';
import type {
  DiscoveryAgentInput,
  UiRoute,
  UiRouteFindings,
} from './types.js';
import {
  isDirectory,
  modulesInScopeForFeature,
  readUtf8,
  repoAbs,
  runIfMain,
} from './shared.js';
import { errorMessage } from '../util/typeguards.js';

/**
 * RouterStrategy — pluggable adapter for a single UI-framework
 * routing convention. Implementations:
 *
 *  - declare a stable `id` (e.g., 'react-router-dom').
 *  - implement `detect()` to return true only when the strategy's
 *    framework is in use in the repo. detect() may inspect package.json,
 *    look for known config files, or any other heuristic.
 *  - implement `enumerate()` to return the routes the strategy can
 *    extract from a single module (or from the repo root when
 *    `module === null` in single-package projects).
 *
 * The agent's orchestration shell selects the strategy automatically by
 * calling `detect()` on each registered strategy. When more than one
 * matches, the agent throws asking the operator to disambiguate — see
 * the dispatch logic in `enumerateUiRoutes`.
 *
 * Follow-up issue #286 tracks porting Vue Router, Next.js App/Pages
 * Router, and SvelteKit strategies.
 */
export interface RouterStrategy {
  readonly id: string;
  detect(opts: { readonly repoRoot: string }): Promise<boolean>;
  enumerate(opts: {
    readonly repoRoot: string;
    readonly moduleRoot: string;
    readonly module: string | null;
  }): Promise<ReadonlyArray<UiRoute>>;
}

const APP_TSX = 'src/App.tsx';
const PAGES_DIR = 'src/pages';

/**
 * Match a JSX `<Route path="..." element={<XPage />} />` declaration.
 * The path may be a string literal (single or double-quoted). We
 * capture both the path literal and the element identifier so we can
 * resolve the page file.
 *
 * We intentionally tolerate cross-line declarations by reading the
 * whole file as one string and using the `s` flag — Route tags are
 * sometimes split across lines for readability.
 */
const ROUTE_RE =
  /<Route\b[^>]*?\bpath\s*=\s*["']([^"']+)["'][^>]*?\belement\s*=\s*\{\s*<([A-Z][A-Za-z0-9_]*)\b/gs;

/**
 * Match an `index` route: `<Route index element={<HomePage />} />`.
 * Index routes have no path attribute; we model them as path = "" so
 * the synthesis layer can render them as "the default route".
 */
const INDEX_ROUTE_RE =
  /<Route\b[^>]*?\bindex\b[^>]*?\belement\s*=\s*\{\s*<([A-Z][A-Za-z0-9_]*)\b/gs;

interface RawRoute {
  readonly path: string;
  readonly element: string;
}

function extractRoutesFromAppTsx(text: string): ReadonlyArray<RawRoute> {
  const out: RawRoute[] = [];
  // Reset lastIndex by constructing fresh regexes per call (top-level
  // RE objects with /g flag preserve lastIndex across runs which would
  // produce wrong results on the second invocation).
  const routeRe = new RegExp(ROUTE_RE.source, ROUTE_RE.flags);
  const indexRe = new RegExp(INDEX_ROUTE_RE.source, INDEX_ROUTE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = routeRe.exec(text)) !== null) {
    const path = m[1];
    const element = m[2];
    if (path === undefined || element === undefined) continue;
    // Skip the catch-all `<Route path="*" ... Navigate />` — it's not a
    // real surface, just a redirect.
    if (path === '*') continue;
    out.push({ path, element });
  }
  while ((m = indexRe.exec(text)) !== null) {
    const element = m[1];
    if (element === undefined) continue;
    out.push({ path: '', element });
  }
  return out;
}

/**
 * Best-effort resolution of an element identifier (e.g., "PatchesPage")
 * to its page file under `<module-prefix>/<PAGES_DIR>/<PageName>.tsx`.
 * Returns null if the file doesn't exist — the route is still reported.
 */
async function resolvePageFile(args: {
  readonly repoRoot: string;
  readonly moduleAbsPath: string | null; // null = single-package layout
  readonly elementName: string;
}): Promise<string | null> {
  const pagesRel =
    args.moduleAbsPath === null
      ? join(PAGES_DIR, `${args.elementName}.tsx`)
      : join(args.moduleAbsPath, PAGES_DIR, `${args.elementName}.tsx`);
  const abs = repoAbs(args.repoRoot, pagesRel);
  try {
    await readUtf8(abs);
    return pagesRel;
  } catch {
    return null;
  }
}

/**
 * Built-in React-Router strategy. Mirrors the pilot's behavior
 * verbatim — detects React-Router-DOM via the presence of `src/App.tsx`
 * in the in-scope module (or the project root for single-package
 * projects); extracts routes via `<Route>` element regex.
 *
 * The detect() heuristic is intentionally lightweight: looking up
 * `react-router-dom` in package.json would be more precise but the
 * package.json's location is itself project-dependent (monorepo root
 * vs per-module). The `src/App.tsx` file is the load-bearing
 * convention every React-Router-DOM project we know of follows.
 */
const reactRouterStrategy: RouterStrategy = {
  id: 'react-router-dom',
  async detect(opts) {
    // Detect by probing for App.tsx anywhere reasonable. Module-level
    // detection happens in enumerate(); detect() answers the "does
    // this project use React Router at all?" question.
    const candidates = [
      'src/App.tsx',
      'src/App.jsx',
      'App.tsx',
    ];
    for (const c of candidates) {
      try {
        await readUtf8(repoAbs(opts.repoRoot, c));
        return true;
      } catch {
        continue;
      }
    }
    return false;
  },
  async enumerate(opts) {
    const moduleAbsPath =
      opts.module === null || opts.module === '.'
        ? null
        : join(opts.moduleRoot, opts.module);
    const appRel =
      moduleAbsPath === null ? APP_TSX : join(moduleAbsPath, APP_TSX);
    const appAbs = repoAbs(opts.repoRoot, appRel);
    let text: string;
    try {
      text = await readUtf8(appAbs);
    } catch {
      // Module has no App.tsx — it's not a routed surface for this
      // strategy. Return empty.
      return [];
    }
    const raw = extractRoutesFromAppTsx(text);
    const resolved: UiRoute[] = [];
    for (const r of raw) {
      const pageFile = await resolvePageFile({
        repoRoot: opts.repoRoot,
        moduleAbsPath,
        elementName: r.element,
      });
      resolved.push({
        module: opts.module ?? '.',
        path: r.path,
        file: appRel,
        pageFile,
      });
    }
    return resolved;
  },
};

/**
 * Default bundled strategy registry. Adding new strategies (#286) means
 * extending this array; the dispatch logic below handles selection.
 */
const DEFAULT_STRATEGIES: ReadonlyArray<RouterStrategy> = [reactRouterStrategy];

/**
 * Select the active strategy by running each registered strategy's
 * `detect()`. Throws when more than one matches (operator must
 * disambiguate via config — Phase 4+ work). Throws when zero match
 * (the project either uses a strategy we don't bundle yet, or doesn't
 * have a UI surface at all; the agent's emitted findings will have
 * an empty `routes[]` and the synthesis layer's kind-detection will
 * decide whether that produces a `kind: 'code'` manifest).
 */
async function selectStrategy(args: {
  readonly repoRoot: string;
  readonly strategies: ReadonlyArray<RouterStrategy>;
}): Promise<RouterStrategy | null> {
  const matched: RouterStrategy[] = [];
  for (const s of args.strategies) {
    if (await s.detect({ repoRoot: args.repoRoot })) {
      matched.push(s);
    }
  }
  if (matched.length === 0) return null;
  if (matched.length === 1) {
    const first = matched[0];
    if (first === undefined) {
      throw new Error('selectStrategy: matched[0] undefined despite length 1');
    }
    return first;
  }
  const ids = matched.map((s) => s.id).join(', ');
  throw new Error(
    `ui-route-enumerator: multiple router strategies match (${ids}); ` +
      'operator must disambiguate via project config. ' +
      'See #286 for the strategy-selection roadmap.',
  );
}

/**
 * Public agent entrypoint. Imported by the synthesis layer + the
 * `scope-inventory` subcommand.
 */
export async function enumerateUiRoutes(
  input: DiscoveryAgentInput,
): Promise<UiRouteFindings> {
  const modulesInScope = await modulesInScopeForFeature(input);
  const strategy = await selectStrategy({
    repoRoot: input.repoRoot,
    strategies: DEFAULT_STRATEGIES,
  });
  if (strategy === null) {
    // No strategy applies — emit empty routes. The synthesizer's
    // kind-detection will pick 'code' if other agents contribute.
    return {
      agent: 'ui-route-enumerator',
      featureSlug: input.featureSlug,
      modulesInScope,
      routes: [],
    };
  }
  const routes: UiRoute[] = [];
  for (const module of modulesInScope) {
    if (module !== '.') {
      const modAbs = repoAbs(input.repoRoot, join(input.moduleRoot, module));
      if (!(await isDirectory(modAbs))) {
        throw new Error(
          `module directory missing: ${modAbs} ` +
            `(in-scope set was derived from PRD ${input.prdPath})`,
        );
      }
    }
    const moduleRoutes = await strategy.enumerate({
      repoRoot: input.repoRoot,
      moduleRoot: input.moduleRoot,
      module: module === '.' ? null : module,
    });
    for (const r of moduleRoutes) routes.push(r);
  }
  return {
    agent: 'ui-route-enumerator',
    featureSlug: input.featureSlug,
    modulesInScope,
    routes,
  };
}

// CLI entrypoint — only fires when invoked directly via `tsx <file>`;
// inert when imported by the synthesis pass or the subcommand.
runIfMain({
  importMetaUrl: import.meta.url,
  agentName: 'ui-route-enumerator',
  run: async (input) => {
    try {
      return await enumerateUiRoutes(input);
    } catch (err) {
      throw new Error(`enumeration failed: ${errorMessage(err)}`);
    }
  },
});
