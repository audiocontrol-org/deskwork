/**
 * add-time artifactPath composition (Phase 39c-2b, sub-task b).
 *
 * `deskwork add --lane X [--kind markdown] [--layout L]` creates a NEW
 * entry that has no `artifactPath` yet. This module composes that path
 * from the lane's add-time `scaffoldDefaults` (the directory), the
 * requested layout (the on-disk file shape), and the entry's slug, then
 * the caller stamps the result onto the new entry's sidecar — from which
 * point it is authoritative (resolution never recomputes it).
 *
 * MARKDOWN ONLY (operator decision): `deskwork add` supports only
 * markdown entries right now. The verb that actually CREATES the file
 * (scaffoldBlogPost) is markdown-only, so a non-markdown entry can't be
 * materialized. {@link composeAddArtifactPath} therefore throws loudly
 * for any non-markdown kind rather than composing a path that nothing
 * can fulfill. The `ArtifactKind` TYPE still carries the other kinds for
 * graphical-entries; only the add path gates to markdown.
 *
 * Per the sites→lanes retirement design (§ "add-time path composition"):
 *
 *   directory     ← lane.scaffoldDefaults['markdown']  (FAILS LOUDLY if absent)
 *   layout        ← --layout flag, else DEFAULT_SCAFFOLD_LAYOUT (index)
 *   relativePath  ← layoutToContentRelativePath(layout, slug)
 *   artifactPath  ← posixJoin(directory, relativePath)
 *
 * POSIX join (AUDIT-40): `artifactPath` is persisted and string-compared
 * against the forward-slash paths the rest of the system stores, so the
 * join uses `node:path/posix` (never `node:path.join`, which yields
 * backslashes on Windows).
 *
 * No fallback: a lane that does not declare a `scaffoldDefaults['markdown']`
 * entry is an actionable operator error, not a silent default directory
 * (per the project no-fallbacks rule). The thrown message names the lane
 * id and how to fix it.
 */

import { posix } from 'node:path';
import type { LaneConfig, ArtifactKind } from './types.ts';

/**
 * On-disk filename shape of a scaffolded markdown artifact:
 *
 *   - `index`  → `<slug>/index.md`  (hub-style directory)
 *   - `readme` → `<slug>/README.md` (editorial-private directory)
 *   - `flat`   → `<slug>.md`        (sibling file, no own directory)
 */
export type ScaffoldLayout = 'index' | 'readme' | 'flat';

/**
 * The default layout used by `deskwork add` when `--layout` is omitted.
 * `index` reproduces the legacy `{slug}/index.md` template default
 * byte-for-byte — chosen for zero-behavior-change at the sites→lanes
 * cutover.
 *
 * Per design Decision #12 this is a single GLOBAL default. (The
 * superseding per-kind Decision #16 was retired alongside the multi-kind
 * machinery when `add` was gated to markdown-only — a global default is
 * correct again now that only one kind is supported.)
 */
export const DEFAULT_SCAFFOLD_LAYOUT: ScaffoldLayout = 'index';

/**
 * Map a {@link ScaffoldLayout} + slug to the directory-relative path for
 * a MARKDOWN artifact (the only kind `deskwork add` scaffolds).
 */
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
 * Compose the project-relative `artifactPath` for a NEW markdown entry
 * being scaffolded into a lane.
 *
 * @param lane - The resolved lane config the entry belongs to.
 * @param kind - The entry's artifact kind. ONLY `markdown` is supported;
 *   any other kind throws (see module docblock — file creation for
 *   non-markdown kinds is not implemented).
 * @param slug - The entry's slug (one or more `/`-separated kebab-case
 *   segments).
 * @param layout - The on-disk file shape. When omitted, defaults to
 *   {@link DEFAULT_SCAFFOLD_LAYOUT} (`index`).
 * @returns The project-root-relative path to stamp onto the entry's
 *   sidecar (e.g. `src/content/blog/my-post/index.md`), joined with
 *   forward slashes (AUDIT-40).
 * @throws When `kind` is not `markdown`; or when the lane declares no
 *   `scaffoldDefaults['markdown']` entry.
 */
export function composeAddArtifactPath(
  lane: LaneConfig,
  kind: ArtifactKind,
  slug: string,
  layout?: ScaffoldLayout,
): string {
  if (kind !== 'markdown') {
    throw new Error(
      `deskwork add currently supports only markdown entries; artifact kind ` +
        `"${kind}" is not yet supported because file creation for ` +
        `non-markdown kinds is not implemented. Use --kind markdown (the ` +
        `default), or omit --kind.`,
    );
  }
  const directory = lane.scaffoldDefaults?.['markdown'];
  if (directory === undefined) {
    const declared = lane.scaffoldDefaults
      ? Object.keys(lane.scaffoldDefaults).sort().join(', ') || '(none)'
      : '(none)';
    throw new Error(
      `Lane "${lane.id}" has no scaffoldDefaults entry for artifact kind ` +
        `"markdown", so \`deskwork add\` cannot choose where to place the ` +
        `new file. Add a default directory for markdown to the lane — e.g. ` +
        `\`deskwork lane <project-root> update ${lane.id} ` +
        `--scaffold-default markdown=<dir>\`. ` +
        `Kinds the lane currently defines: ${declared}.`,
    );
  }
  const effectiveLayout = layout ?? DEFAULT_SCAFFOLD_LAYOUT;
  const relativePath = layoutToContentRelativePath(effectiveLayout, slug);
  // AUDIT-40: POSIX join — persisted paths are forward-slash, compared
  // string-wise against the rest of the system's stored paths.
  return posix.join(directory, relativePath);
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
