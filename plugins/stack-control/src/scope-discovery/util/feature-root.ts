/**
 * plugins/stack-control/src/scope-discovery/util/feature-root.ts
 *
 * Per AUDIT-20260530-15: the docs/<version>/001-IN-PROGRESS/<slug>/
 * walker used to live as two byte-for-byte identical copies — one in
 * workplan-aware-gate.ts (`findFeatureRoot`) and one in
 * audit-barrage-lift.ts (`resolveFeatureRoot`). AUDIT-06 (split-brain
 * determinism), AUDIT-08 (lex-greatest version pick), and AUDIT-12
 * (canonicalization gap) each had to patch both copies in lockstep.
 * Cross-model agreement on round 3 (claude×2 + codex×2) called this
 * structural: the next maintainer who improves one and forgets the
 * other re-introduces the divergence. Extracting one helper closes
 * the *class* of bug.
 *
 * The helper returns both the resolved feature root AND the list of
 * version directories that were considered. The gate's
 * FeatureRootNotFoundError uses the version list in its error
 * message; the lift just checks `root === undefined`.
 *
 * Lex-greatest sort (descending) is the AUDIT-06+AUDIT-08 contract:
 * with `docs/1.0/`, `docs/0.19.0/`, `docs/0.x/`, the walker picks
 * `1.0` — the active version, biasing AWAY from archived
 * directories. Lex compares strings character-by-character, so
 * `0.10.0` < `0.9.0` because `'1' < '9'`: a project that ships a
 * `0.10.0` alongside a `0.9.0` resolves to `0.9.0`. The regression
 * test `feature-root.test.ts > 'picks lex-greatest, NOT semver-
 * greatest, when they diverge'` pins this contract: lex is the
 * specification, not a placeholder. Changing the sort changes the
 * contract; both the implementation AND the regression test must
 * change in lockstep.
 *
 * Spec 013 (audit-protocol-hardening): the resolver is layout-aware.
 * Two concrete physical layouts flow through this one helper:
 *
 *   - `speckit`     — `<repoRoot>/specs/<NNN>-<slug>/` (or the
 *                     exact-name `<repoRoot>/specs/<slug>/`), the
 *                     Spec Kit feature layout.
 *   - `legacy-docs` — `<docsRoot>/<version>/001-IN-PROGRESS/<slug>/`,
 *                     the original layout (lex-greatest version pick,
 *                     unchanged).
 *
 * Precedence is specs-first (research D3): the `speckit` branch runs
 * BEFORE the legacy walk, so when a slug exists under both layouts the
 * `speckit` root wins deterministically. The `speckit` branch fails
 * loud — naming the candidates — when two `specs/` dirs both match the
 * slug (no silent pick). The `speckit` branch only runs when `repoRoot`
 * is supplied (it derives `<repoRoot>/specs`); a `docsRoot`-only caller
 * resolves `legacy-docs` exactly as before. The result's `layout` field
 * records which layout produced `root`; neither layout matching leaves
 * `root` undefined (the caller fails loud, naming both searched layouts).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ResolveFeatureRootArgs {
  /**
   * Either the absolute path of the project's `docs/` directory
   * (`docsRoot`), OR the project's repo root (the helper joins
   * `docs/` for you when `repoRoot` is supplied). Pass exactly one.
   * Per AUDIT-20260531-05: pre-fix both callers independently
   * constructed `join(repoRoot, 'docs')` — same DRY-extraction
   * pattern AUDIT-20260530-15 closed for the walker logic itself.
   */
  readonly docsRoot?: string;
  readonly repoRoot?: string;
  /** The feature slug (the leaf dir name under `001-IN-PROGRESS`). */
  readonly slug: string;
}

export interface ResolveFeatureRootResult {
  /**
   * The absolute path of the resolved feature root
   * (`<docsRoot>/<version>/001-IN-PROGRESS/<slug>`), or `undefined`
   * when the slug doesn't exist under any version with a
   * `001-IN-PROGRESS` subdirectory.
   */
  readonly root: string | undefined;
  /**
   * Lex-descending list of version directories the walker
   * considered (those that have a `001-IN-PROGRESS` subdir). Useful
   * for the gate's not-found error message. Always `[]` for a
   * `speckit` resolution (no version axis).
   */
  readonly versionsChecked: readonly string[];
  /**
   * Which physical layout produced `root` (spec 013). `'speckit'` for
   * a `specs/<NNN>-<slug>` match, `'legacy-docs'` for the
   * `docs/<version>/001-IN-PROGRESS/<slug>` walk. Absent when `root`
   * is `undefined` (neither layout matched).
   */
  readonly layout?: 'legacy-docs' | 'speckit';
}

/**
 * Derive the git toplevel enclosing `base` — an EXTERNAL anchor read from
 * git's own marker (specs/installation-isolation FR-004), used here only
 * to keep the transitional legacy spec locations read-resolvable (T015:
 * spec artifacts at the monorepo root while the installation sits below
 * it). Returns null when `base` is not inside a git work tree, or when
 * the toplevel IS `base` (no separate layer to consult).
 */
function deriveDistinctGitToplevel(base: string): string | null {
  const r = spawnSync('git', ['-C', base, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') return null;
  const toplevel = r.stdout.trim();
  if (toplevel.length === 0) return null;
  try {
    if (realpathSync(toplevel) === realpathSync(base)) return null;
  } catch {
    return null;
  }
  return toplevel;
}

export async function resolveFeatureRoot(
  args: ResolveFeatureRootArgs,
): Promise<ResolveFeatureRootResult> {
  // Layer 1: the caller's base (the installation root under the isolation
  // model). Layer 2 (only when layer 1 misses and `repoRoot` was
  // supplied): the same two layouts at the derived git toplevel — the
  // transitional legacy locations (T015; installation layers always win).
  const primary = await resolveFeatureRootAt(args);
  if (primary.root !== undefined || args.repoRoot === undefined) {
    return primary;
  }
  const toplevel = deriveDistinctGitToplevel(args.repoRoot);
  if (toplevel === null) return primary;
  const legacy = await resolveFeatureRootAt({
    repoRoot: toplevel,
    slug: args.slug,
  });
  if (legacy.root === undefined) {
    return {
      root: undefined,
      versionsChecked: [
        ...primary.versionsChecked,
        ...legacy.versionsChecked,
      ],
    };
  }
  return legacy;
}

async function resolveFeatureRootAt(
  args: ResolveFeatureRootArgs,
): Promise<ResolveFeatureRootResult> {
  // Per AUDIT-20260531-05: accept either `docsRoot` (the legacy
  // shape, kept for the workplan-aware-gate's pre-extracted path)
  // OR `repoRoot` (the helper does the `join(repoRoot, 'docs')`
  // itself). Both call sites previously constructed the docs path
  // independently — moving that one line into the helper means the
  // resolution logic AND the path construction live in one place.
  const docsRoot =
    args.docsRoot ?? (args.repoRoot !== undefined ? join(args.repoRoot, 'docs') : undefined);
  if (docsRoot === undefined) {
    throw new Error(
      'resolveFeatureRoot: one of `docsRoot` or `repoRoot` must be supplied.',
    );
  }

  // Spec 013: specs-first precedence (research D3). The `speckit`
  // branch runs BEFORE the legacy walk, so a slug present under both
  // layouts resolves to the `specs/` root deterministically. It only
  // runs when `repoRoot` is supplied (it needs `<repoRoot>/specs`);
  // a `docsRoot`-only caller skips straight to `legacy-docs`.
  if (args.repoRoot !== undefined) {
    const speckitRoot = await resolveSpeckitRoot(args.repoRoot, args.slug);
    if (speckitRoot !== undefined) {
      return { root: speckitRoot, versionsChecked: [], layout: 'speckit' };
    }
  }

  if (!existsSync(docsRoot)) {
    return { root: undefined, versionsChecked: [] };
  }
  let topEntries: ReadonlyArray<string>;
  try {
    topEntries = [...(await readdir(docsRoot))].sort().reverse();
  } catch {
    return { root: undefined, versionsChecked: [] };
  }
  const versionsChecked: string[] = [];
  for (const version of topEntries) {
    const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    versionsChecked.push(version);
    const featureDir = join(inProgress, args.slug);
    if (existsSync(featureDir)) {
      return { root: featureDir, versionsChecked, layout: 'legacy-docs' };
    }
  }
  return { root: undefined, versionsChecked };
}

/**
 * Enumerate EVERY feature root across both physical layouts (specs/014
 * US7). Used by consumers that walk all features rather than resolving
 * one slug — e.g. the provenance doctor rule's audit-log discovery.
 * Living here keeps the layout literals inside the one shared resolver
 * module (FR-010: no consumer outside this file constructs the legacy
 * `001-IN-PROGRESS` path). Hidden (dot-prefixed) directories are
 * skipped; the result is sorted for deterministic downstream output.
 */
export async function discoverFeatureRoots(
  repoRoot: string,
): Promise<readonly string[]> {
  // Union of the caller's base layer + the derived-toplevel legacy layer
  // (T015), deduped by realpath so a base that IS the toplevel (or a
  // symlinked variant) contributes each root once.
  const bases = [repoRoot];
  const toplevel = deriveDistinctGitToplevel(repoRoot);
  if (toplevel !== null) bases.push(toplevel);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    for (const root of await discoverFeatureRootsAt(base)) {
      let key: string;
      try {
        key = realpathSync(root);
      } catch {
        key = root;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(root);
    }
  }
  return out.sort();
}

/** Single-base enumeration (the pre-T015 body of discoverFeatureRoots). */
async function discoverFeatureRootsAt(
  repoRoot: string,
): Promise<readonly string[]> {
  const out: string[] = [];
  const specsRoot = join(repoRoot, 'specs');
  if (existsSync(specsRoot)) {
    for (const child of await readDirNames(specsRoot)) {
      out.push(join(specsRoot, child));
    }
  }
  const docsRoot = join(repoRoot, 'docs');
  if (existsSync(docsRoot)) {
    for (const version of await readDirNames(docsRoot)) {
      const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
      if (!existsSync(inProgress)) continue;
      for (const slug of await readDirNames(inProgress)) {
        out.push(join(inProgress, slug));
      }
    }
  }
  return out.sort();
}

/** Non-hidden subdirectory names of `parent`; [] when unreadable. */
async function readDirNames(parent: string): Promise<readonly string[]> {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Resolve a Spec Kit feature under `<repoRoot>/specs/`. A child dir
 * matches when its name is exactly `<slug>` or `^\d+-<slug>$` (the
 * NNN-slug Spec Kit convention). Returns the matched absolute root, or
 * `undefined` when no child matches (the caller falls through to the
 * legacy walk). Throws fail-loud — naming the candidates — when more
 * than one child matches, so an ambiguous slug never resolves to a
 * silently-picked directory (spec 013 FR / Constitution Principle V).
 */
async function resolveSpeckitRoot(
  repoRoot: string,
  slug: string,
): Promise<string | undefined> {
  const specsRoot = join(repoRoot, 'specs');
  if (!existsSync(specsRoot)) return undefined;
  let children: ReadonlyArray<string>;
  try {
    children = await readdir(specsRoot);
  } catch {
    return undefined;
  }
  const prefixed = new RegExp(`^\\d+-${escapeRegExp(slug)}$`);
  const matches = children
    .filter((name) => name === slug || prefixed.test(name))
    .sort();
  if (matches.length === 0) return undefined;
  if (matches.length > 1) {
    throw new Error(
      `resolveFeatureRoot: ambiguous slug '${slug}' under ${specsRoot} — ` +
        `${matches.length} directories match (${matches.join(', ')}). ` +
        `Disambiguate the specs/ layout; the resolver will not silently pick one.`,
    );
  }
  return join(specsRoot, matches[0]!);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
