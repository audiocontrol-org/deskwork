/**
 * add-time artifactPath composition (Phase 39c-2b, sub-task b).
 *
 * `deskwork add --lane X --kind K [--layout L]` creates a NEW entry that
 * has no `artifactPath` yet. This module composes that path from the
 * lane's add-time `scaffoldDefaults` (the directory), the artifact KIND
 * (which extension), the requested layout (the on-disk file shape), and
 * the entry's slug, then the caller stamps the result onto the new
 * entry's sidecar — from which point it is authoritative (resolution
 * never recomputes it).
 *
 * Per the sites→lanes retirement design (§ "add-time path composition"
 * + the 39c-2b post-barrage amendment, AUDIT-39/40/44/45):
 *
 *   directory     ← lane.scaffoldDefaults[kind]   (FAILS LOUDLY if absent)
 *   layout        ← --layout flag, else the PER-KIND default
 *   extension     ← derived from the kind (markdown → .md; html-mockup
 *                   / single-file-html → .html; image → not templatable)
 *   relativePath  ← composeRelativePath(kind, layout, slug)
 *   artifactPath  ← posixJoin(directory, relativePath)
 *
 * Kind-awareness (AUDIT-39): a non-markdown kind stamped with a `.md`
 * `artifactPath` is wrong at the authoritative source, so the extension
 * derives from the kind, not a hardcoded `.md`.
 *
 * Per-kind legal layouts (AUDIT-44): each kind only accepts the layouts
 * whose on-disk shape matches its contract. `html-mockup` is "a
 * directory containing index.html" → `index` only; `single-file-html`
 * is "a loose .html file" → `flat` only. An out-of-set (kind, layout)
 * combination is rejected before any disk mutation.
 *
 * `image` is not templatable (AUDIT-42): a binary has no body to
 * scaffold. `add --kind image` requires an explicit `--artifact-path`
 * and this composer throws if asked to template it.
 *
 * POSIX join (AUDIT-40): `artifactPath` is persisted and string-compared
 * against the forward-slash paths the rest of the system stores, so the
 * join uses `node:path/posix` (never `node:path.join`, which yields
 * backslashes on Windows).
 *
 * No fallback: a lane that does not declare a `scaffoldDefaults` entry
 * for the requested kind is an actionable operator error, not a silent
 * default directory (per the project no-fallbacks rule). The thrown
 * message names the lane id, the kind, and how to fix it.
 */

import { posix } from 'node:path';
import type { LaneConfig, ArtifactKind } from './types.ts';

/**
 * On-disk filename shape of a scaffolded artifact. `layout` selects the
 * filename PATTERN; the file EXTENSION is derived from the artifact kind
 * (see {@link composeRelativePath}):
 *
 *   - `index`  → `<slug>/index.<ext>`  (hub-style directory)
 *   - `readme` → `<slug>/README.<ext>` (editorial-private directory)
 *   - `flat`   → `<slug>.<ext>`        (sibling file, no own directory)
 */
export type ScaffoldLayout = 'index' | 'readme' | 'flat';

/**
 * Per-kind file extension. `image` has no single extension and is not
 * templatable (AUDIT-42) — it is absent from this map and the composer
 * throws when asked to template it.
 */
const EXTENSION_BY_KIND: Partial<Record<ArtifactKind, string>> = {
  markdown: 'md',
  'html-mockup': 'html',
  'single-file-html': 'html',
};

/**
 * Per-kind LEGAL layout sets (AUDIT-44). Each kind only accepts the
 * layouts whose on-disk shape matches its contract. The FIRST entry in
 * each list is the per-kind default (AUDIT-39 / Decision #16).
 *
 *   - `markdown`         → index (default), readme, flat
 *   - `html-mockup`      → index only (a directory containing index.html)
 *   - `single-file-html` → flat only  (a loose .html file)
 *   - `image`            → none        (not templatable)
 */
const LEGAL_LAYOUTS_BY_KIND: Record<ArtifactKind, readonly ScaffoldLayout[]> = {
  markdown: ['index', 'readme', 'flat'],
  'html-mockup': ['index'],
  'single-file-html': ['flat'],
  image: [],
};

/**
 * The default layout used by `deskwork add` when `--layout` is omitted,
 * for the markdown and html-mockup kinds. `index` reproduces the legacy
 * `{slug}/index.md` template default byte-for-byte for markdown — chosen
 * for zero-behavior-change at the sites→lanes cutover.
 *
 * Per design Decision #16 (which SUPERSEDES the earlier global-`index`
 * Decision #12, AUDIT-45) the default is now PER-KIND, not a single
 * global value: markdown/html-mockup default to `index`, single-file-html
 * defaults to `flat`, and `image` has no default (not templatable). This
 * constant is the markdown/html-mockup default specifically; use
 * {@link defaultLayoutForKind} for the per-kind value.
 */
export const DEFAULT_SCAFFOLD_LAYOUT: ScaffoldLayout = 'index';

/** The legal layouts for `kind` (empty for the non-templatable `image`). */
export function legalLayoutsForKind(
  kind: ArtifactKind,
): readonly ScaffoldLayout[] {
  return LEGAL_LAYOUTS_BY_KIND[kind];
}

/**
 * The per-kind default layout (the first legal layout), or `undefined`
 * for a non-templatable kind (`image`).
 */
export function defaultLayoutForKind(
  kind: ArtifactKind,
): ScaffoldLayout | undefined {
  return LEGAL_LAYOUTS_BY_KIND[kind][0];
}

/** Whether `layout` is legal for `kind` (AUDIT-44). */
export function isLayoutLegalForKind(
  kind: ArtifactKind,
  layout: ScaffoldLayout,
): boolean {
  return LEGAL_LAYOUTS_BY_KIND[kind].includes(layout);
}

/**
 * Map a {@link ScaffoldLayout} + slug to the directory-relative path for
 * a MARKDOWN artifact. Retained for the legacy file-creating
 * `scaffoldBlogPost` path (sub-task a), which only ever scaffolds
 * markdown. New kind-aware callers use {@link composeRelativePath}.
 */
export function layoutToContentRelativePath(
  layout: ScaffoldLayout,
  slug: string,
): string {
  return composeRelativePath('markdown', layout, slug);
}

/**
 * Compose the directory-relative path for an artifact of `kind` at
 * `layout` for `slug`. The extension is derived from the kind
 * (AUDIT-39); the layout selects the filename pattern.
 *
 * @throws When `kind` is not templatable (`image`), or when `layout` is
 *   not legal for `kind` (AUDIT-44). Both are pre-write argument errors.
 */
export function composeRelativePath(
  kind: ArtifactKind,
  layout: ScaffoldLayout,
  slug: string,
): string {
  const ext = EXTENSION_BY_KIND[kind];
  if (ext === undefined) {
    throw new Error(
      `Artifact kind "${kind}" is not templatable, so deskwork cannot ` +
        `compose a scaffold path for it. (An image is a binary with no body ` +
        `to scaffold — pass an explicit --artifact-path instead.)`,
    );
  }
  if (!isLayoutLegalForKind(kind, layout)) {
    const legal = legalLayoutsForKind(kind).join(', ') || '(none)';
    throw new Error(
      `Layout "${layout}" is not legal for artifact kind "${kind}". ` +
        `Legal layouts for "${kind}": ${legal}.`,
    );
  }
  switch (layout) {
    case 'index':
      return `${slug}/index.${ext}`;
    case 'readme':
      return `${slug}/README.${ext}`;
    case 'flat':
      return `${slug}.${ext}`;
  }
}

/**
 * Compose the project-relative `artifactPath` for a NEW entry being
 * scaffolded into a lane.
 *
 * @param lane - The resolved lane config the entry belongs to.
 * @param kind - The entry's artifact kind; selects the
 *   `scaffoldDefaults` directory AND the file extension.
 * @param slug - The entry's slug (one or more `/`-separated kebab-case
 *   segments).
 * @param layout - The on-disk file shape. When omitted, defaults to the
 *   PER-KIND default ({@link defaultLayoutForKind}).
 * @returns The project-root-relative path to stamp onto the entry's
 *   sidecar (e.g. `src/content/blog/my-post/index.md`), joined with
 *   forward slashes (AUDIT-40).
 * @throws When the lane declares no `scaffoldDefaults` entry for `kind`;
 *   when `kind` is not templatable (`image`); or when `layout` is not
 *   legal for `kind`.
 */
export function composeAddArtifactPath(
  lane: LaneConfig,
  kind: ArtifactKind,
  slug: string,
  layout?: ScaffoldLayout,
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
  const effectiveLayout = layout ?? defaultLayoutForKind(kind);
  if (effectiveLayout === undefined) {
    // Reached only for a non-templatable kind (image) with no explicit
    // layout. composeRelativePath throws the actionable message; this
    // delegation keeps a single source of the "not templatable" error.
    return composeRelativePathForImageGuard(kind, slug);
  }
  const relativePath = composeRelativePath(kind, effectiveLayout, slug);
  // AUDIT-40: POSIX join — persisted paths are forward-slash, compared
  // string-wise against the rest of the system's stored paths.
  return posix.join(directory, relativePath);
}

/**
 * Raise the "not templatable" error for a kind that has no default
 * layout (image). Isolated so {@link composeAddArtifactPath} can satisfy
 * the type checker without an unchecked layout value.
 */
function composeRelativePathForImageGuard(
  kind: ArtifactKind,
  slug: string,
): never {
  // `index` is a syntactically-valid ScaffoldLayout; composeRelativePath
  // throws on the not-templatable kind BEFORE inspecting the layout.
  composeRelativePath(kind, 'index', slug);
  throw new Error(
    `Artifact kind "${kind}" is not templatable (programmer error: ` +
      `composeRelativePath was expected to throw).`,
  );
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
