/**
 * add-time artifactPath composition (Phase 39c-2b, sub-task b).
 *
 * `deskwork add --lane X --kind K [--layout L]` creates a NEW entry that
 * has no `artifactPath` yet. This module composes that path from the
 * lane's add-time `scaffoldDefaults` (the directory), the requested
 * layout (the on-disk file shape), and the entry's slug, then the caller
 * stamps the result onto the new entry's sidecar — from which point it is
 * authoritative (resolution never recomputes it).
 *
 * Per the sites→lanes retirement design (§ "add-time path composition",
 * Option 1 chosen by the operator 2026-06-03):
 *
 *   directory     ← lane.scaffoldDefaults[kind]   (FAILS LOUDLY if absent)
 *   layout        ← --layout flag, else global default `index`
 *   relativePath  ← layoutToContentRelativePath(layout, slug)
 *   artifactPath  ← join(directory, relativePath)
 *
 * The global default layout `index` reproduces today's
 * `{slug}/index.md` behavior exactly — zero behavior change at the
 * cutover.
 *
 * No fallback: a lane that does not declare a `scaffoldDefaults` entry
 * for the requested kind is an actionable operator error, not a silent
 * default directory (per the project no-fallbacks rule). The thrown
 * message names the lane id, the kind, and how to fix it.
 */

import { join } from 'node:path';
import type { LaneConfig, ArtifactKind } from './types.ts';

/**
 * On-disk shape of a scaffolded artifact. Mirrors the legacy
 * `ScaffoldLayout` in `../scaffold.ts` (which now imports the mapping
 * helper from here, so the layout→path contract lives in one place):
 *
 *   - `index`  → `<slug>/index.md`  (default; hub-style)
 *   - `readme` → `<slug>/README.md` (editorial-private directory)
 *   - `flat`   → `<slug>.md`        (sibling file, no own directory)
 */
export type ScaffoldLayout = 'index' | 'readme' | 'flat';

/**
 * The global default layout used by `deskwork add` when `--layout` is
 * omitted. `index` reproduces the legacy `{slug}/index.md` template
 * default byte-for-byte — chosen for zero-behavior-change at the
 * sites→lanes cutover (design Decision #12).
 */
export const DEFAULT_SCAFFOLD_LAYOUT: ScaffoldLayout = 'index';

/** Map a {@link ScaffoldLayout} + slug to the directory-relative path. */
export function layoutToContentRelativePath(
  layout: ScaffoldLayout,
  slug: string,
): string {
  switch (layout) {
    case 'index':
      return `${slug}/index.md`;
    case 'readme':
      return `${slug}/README.md`;
    case 'flat':
      return `${slug}.md`;
  }
}

/**
 * Compose the project-relative `artifactPath` for a NEW entry being
 * scaffolded into a lane.
 *
 * @param lane - The resolved lane config the entry belongs to.
 * @param kind - The entry's artifact kind; selects the
 *   `scaffoldDefaults` directory.
 * @param slug - The entry's slug (one or more `/`-separated kebab-case
 *   segments).
 * @param layout - The on-disk file shape. Defaults to
 *   {@link DEFAULT_SCAFFOLD_LAYOUT} (`index` → `<slug>/index.md`),
 *   matching today's behavior.
 * @returns The project-root-relative path to stamp onto the entry's
 *   sidecar (e.g. `src/content/blog/my-post/index.md`).
 * @throws When the lane declares no `scaffoldDefaults` entry for `kind`.
 *   The message names the lane id, the kind, and the fix (no fallback).
 */
export function composeAddArtifactPath(
  lane: LaneConfig,
  kind: ArtifactKind,
  slug: string,
  layout: ScaffoldLayout = DEFAULT_SCAFFOLD_LAYOUT,
): string {
  const directory = lane.scaffoldDefaults?.[kind];
  if (directory === undefined) {
    const declared = lane.scaffoldDefaults
      ? Object.keys(lane.scaffoldDefaults).sort().join(', ') || '(none)'
      : '(none)';
    throw new Error(
      `Lane "${lane.id}" has no scaffoldDefaults entry for artifact kind ` +
        `"${kind}", so \`deskwork add\` cannot choose where to place the new ` +
        `file. Add a default directory for this kind to the lane — e.g. ` +
        `\`deskwork lane <project-root> update ${lane.id} ` +
        `--scaffold-default ${kind}=<dir>\` — or pick a different --kind. ` +
        `Kinds the lane currently defines: ${declared}.`,
    );
  }
  const relativePath = layoutToContentRelativePath(layout, slug);
  return join(directory, relativePath);
}

/**
 * Narrow a raw `--layout` flag value to a {@link ScaffoldLayout}.
 * Returns `undefined` for unrecognized values so the CLI caller can
 * raise its own argument-shaped error (with the legal list and exit 2).
 */
export function parseScaffoldLayout(value: string): ScaffoldLayout | undefined {
  if (value === 'index' || value === 'readme' || value === 'flat') {
    return value;
  }
  return undefined;
}

/** The legal `--layout` values, for error messages. */
export const SCAFFOLD_LAYOUTS: readonly ScaffoldLayout[] = [
  'index',
  'readme',
  'flat',
];
