/**
 * plugins/dw-lifecycle/src/scope-discovery/synthesis-derive.ts
 *
 * Per-section derivation helpers for the synthesis pass. Each helper
 * consumes a slice of the discriminated-union finding set and emits a
 * typed strawman-shape fragment that synthesize() assembles into the
 * final manifest. No `as Type`, no `any`, no fallbacks.
 *
 * The regime-holdout derivation lives in synthesis-derive-regime.ts so
 * this file stays under the 300-500 line cap.
 */

import { readFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';
import type {
  AstGrepMatrixFindings,
  CloneDetectorFindings,
  PrdModuleRelevanceLevel,
  PrdThemedFindings,
  UiRouteFindings,
} from './discovery-agents/types.js';
import type {
  ManifestModule,
  ManifestModulePattern,
  ManifestModuleRelevance,
  ManifestReferenceDoc,
  ManifestRoute,
  ManifestScenario,
} from './synthesis-types.js';
import { errorMessage } from './util/typeguards.js';
import { buildMissingReferencesWarning } from './synthesis-warnings.js';

const DEFAULT_SCENARIO_ID = 'default';
const MAX_THEMES = 10;

/**
 * Per-module-root regex factory for the `<module-root>/<slug>/` shape.
 * The slug charset matches the schema's slug pattern; the trailing `/`
 * separates the slug from whatever follows. The module-root is
 * configurable per project — the audiocontrol pilot's hardcoded
 * `modules/` literal is gone.
 */
function moduleSlugRegex(moduleRoot: string): RegExp {
  const escaped = moduleRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\/([a-z0-9][a-z0-9-]*)\\/`);
}

/**
 * Extract the `<slug>` from a `<module-root>/<slug>/...` path OR glob.
 * Returns null when the input does not begin with `<module-root>/<slug>/`.
 */
function extractModuleSlug(
  pathOrGlob: string,
  moduleRoot: string,
): string | null {
  const m = pathOrGlob.match(moduleSlugRegex(moduleRoot));
  return m === null ? null : (m[1] ?? null);
}

/** Schema requires `^/.*$` — prepend `/` for relative router paths. */
function absolutizeRoutePath(rawPath: string): string {
  if (rawPath.length === 0) return '/';
  if (rawPath.startsWith('/')) return rawPath;
  return `/${rawPath}`;
}

/**
 * Derive `routes[]` from UI findings. Dedup by absolute path; sort
 * alphabetically. Devices/scenarios are populated with strawman
 * defaults — the operator's curation step fills the real matrix.
 */
export function deriveRoutes(
  uiFindings: ReadonlyArray<UiRouteFindings>,
  defaultScenarioId: string,
): ReadonlyArray<ManifestRoute> {
  const byPath = new Map<string, ManifestRoute>();
  for (const finding of uiFindings) {
    for (const r of finding.routes) {
      const path = absolutizeRoutePath(r.path);
      if (byPath.has(path)) continue;
      byPath.set(path, {
        path,
        devices: ['none'],
        scenarios: [defaultScenarioId],
      });
    }
  }
  return Array.from(byPath.values()).sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

interface ModuleAccumulator {
  readonly slug: string;
  patternsById: Map<string, ManifestModulePattern>;
  fileCount: number;
}

function ensureModuleEntry(
  bySlug: Map<string, ModuleAccumulator>,
  slug: string,
): ModuleAccumulator {
  const existing = bySlug.get(slug);
  if (existing !== undefined) return existing;
  const created: ModuleAccumulator = { slug, patternsById: new Map(), fileCount: 0 };
  bySlug.set(slug, created);
  return created;
}

/**
 * Result of `deriveModules` — the modules themselves plus any warnings
 * the PRD-relevance pruning surfaced. Warnings are routed by
 * `synthesize()` into `metadata.warnings` so the operator sees which
 * modules the PRD's "Out of Scope" section dropped.
 */
export interface DeriveModulesResult {
  readonly modules: ReadonlyArray<ManifestModule>;
  readonly warnings: ReadonlyArray<string>;
}

interface RelevanceLookup {
  readonly byModule: ReadonlyMap<
    string,
    { readonly relevance: PrdModuleRelevanceLevel; readonly section: string }
  >;
}

function buildRelevanceLookup(
  prdThemedFindings: ReadonlyArray<PrdThemedFindings>,
): RelevanceLookup {
  const byModule = new Map<
    string,
    { readonly relevance: PrdModuleRelevanceLevel; readonly section: string }
  >();
  for (const finding of prdThemedFindings) {
    const entries = finding.moduleRelevance;
    if (entries === undefined) continue;
    for (const e of entries) {
      const existing = byModule.get(e.module);
      if (existing?.relevance === 'excluded') continue;
      byModule.set(e.module, { relevance: e.relevance, section: e.section });
    }
  }
  return { byModule };
}

function resolveManifestRelevance(
  level: PrdModuleRelevanceLevel | undefined,
): { drop: true } | { drop: false; annotation: ManifestModuleRelevance | undefined } {
  if (level === 'excluded') return { drop: true };
  if (level === 'low') return { drop: false, annotation: 'low' };
  return { drop: false, annotation: undefined };
}

/**
 * Derive `modules[]` from AST + clone findings. Groups by source-module
 * slug (extracted from `<module-root>/<slug>/...` file paths). Each
 * module accumulates pattern-matrix patterns + any clone group whose
 * members include a file under that module.
 *
 * When prd-themed-pattern-hunter findings supply a `moduleRelevance`
 * map, modules tagged 'excluded' are DROPPED (with a warning naming
 * the section that excluded them); modules tagged 'low' are emitted
 * with a `relevance: 'low'` annotation. Older findings (no
 * `moduleRelevance` field) preserve the default behavior — every
 * module included, no annotations, empty warnings.
 */
export function deriveModules(args: {
  readonly astFindings: ReadonlyArray<AstGrepMatrixFindings>;
  readonly cloneFindings: ReadonlyArray<CloneDetectorFindings>;
  readonly prdThemedFindings?: ReadonlyArray<PrdThemedFindings>;
  readonly moduleRoot: string;
}): DeriveModulesResult {
  const bySlug = new Map<string, ModuleAccumulator>();

  for (const ast of args.astFindings) {
    for (const pattern of ast.patterns) {
      const modulesTouchedByPattern = new Set<string>();
      for (const hit of pattern.hits) {
        const slug = extractModuleSlug(hit.file, args.moduleRoot);
        if (slug === null) continue;
        modulesTouchedByPattern.add(slug);
      }
      for (const slug of modulesTouchedByPattern) {
        const acc = ensureModuleEntry(bySlug, slug);
        acc.fileCount += pattern.hits.filter(
          (h) => extractModuleSlug(h.file, args.moduleRoot) === slug,
        ).length;
        if (!acc.patternsById.has(pattern.id)) {
          acc.patternsById.set(pattern.id, {
            id: pattern.id,
            kind: 'grep',
            description: pattern.description,
            query: pattern.regex,
          });
        }
      }
    }
  }

  for (const clones of args.cloneFindings) {
    for (const group of clones.clones) {
      const slugs = new Set<string>();
      for (const member of group.members) {
        const colon = member.indexOf(':');
        const path = colon === -1 ? member : member.slice(0, colon);
        const slug = extractModuleSlug(path, args.moduleRoot);
        if (slug !== null) slugs.add(slug);
      }
      for (const slug of slugs) {
        const acc = ensureModuleEntry(bySlug, slug);
        const patternId = `clone-group-${group.id}`;
        if (!acc.patternsById.has(patternId)) {
          acc.patternsById.set(patternId, {
            id: patternId,
            kind: 'clone-group',
            description: `jscpd clone group ${group.id} (${group.lines} lines, disposition: ${group.disposition})`,
            query: `jscpd-group:${group.id}`,
          });
        }
      }
    }
  }

  const relevance = buildRelevanceLookup(args.prdThemedFindings ?? []);
  const modules: ManifestModule[] = [];
  const droppedNames: { readonly module: string; readonly section: string }[] = [];
  for (const acc of bySlug.values()) {
    const entry = relevance.byModule.get(acc.slug);
    const resolved = resolveManifestRelevance(entry?.relevance);
    if (resolved.drop) {
      droppedNames.push({ module: acc.slug, section: entry?.section ?? '' });
      continue;
    }
    const base: ManifestModule = {
      glob: `${args.moduleRoot}/${acc.slug}/**/*.{ts,tsx}`,
      label: acc.slug,
      patterns: Array.from(acc.patternsById.values()).sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
    };
    modules.push(
      resolved.annotation === undefined
        ? base
        : { ...base, relevance: resolved.annotation },
    );
  }
  // Sort by hit-count desc, then alphabetically (clone-only modules tie at 0).
  modules.sort((a, b) => {
    const aCount = bySlug.get(extractModuleSlug(a.glob, args.moduleRoot) ?? '')?.fileCount ?? 0;
    const bCount = bySlug.get(extractModuleSlug(b.glob, args.moduleRoot) ?? '')?.fileCount ?? 0;
    if (aCount !== bCount) return bCount - aCount;
    return a.glob < b.glob ? -1 : a.glob > b.glob ? 1 : 0;
  });
  const warnings: string[] = [];
  if (droppedNames.length > 0) {
    droppedNames.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
    const renderEach = droppedNames
      .map(({ module, section }) =>
        section.length > 0 ? `${module} (excluded by "${section}")` : module,
      )
      .join(', ');
    warnings.push(
      `PRD scope sections excluded ${droppedNames.length} module(s) from the strawman manifest: ${renderEach}.`,
    );
  }
  return { modules, warnings };
}

/** v1: single placeholder scenario (schema requires minItems:1); operator curates. */
export function deriveScenarios(): ReadonlyArray<ManifestScenario> {
  return [
    {
      id: DEFAULT_SCENARIO_ID,
      label: 'Default state',
      description: 'Strawman scenario; operator curates the real scenario matrix.',
    },
  ];
}

export function defaultScenarioId(): string {
  return DEFAULT_SCENARIO_ID;
}

/** Derive themes from PrdThemedFindings. Rank by occurrence count desc; cap at MAX_THEMES. */
export function deriveThemes(
  themedFindings: ReadonlyArray<PrdThemedFindings>,
): ReadonlyArray<string> {
  const byTerm = new Map<string, number>();
  for (const finding of themedFindings) {
    for (const theme of finding.themes) {
      const current = byTerm.get(theme.term) ?? 0;
      byTerm.set(theme.term, current + theme.occurrences.length);
    }
  }
  const ranked = Array.from(byTerm.entries()).sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  return ranked
    .slice(0, MAX_THEMES)
    .map(([term, count]) => `${term} (${count} occurrence${count === 1 ? '' : 's'})`);
}

const REFS_HEADING_RE = /^#+\s*(References|Appendix(?:\s+—\s+Source Documents)?)\b/im;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Default fallback path for the on-disk LAYOUT.md when the PRD has no References section. */
const LAYOUT_MD_FALLBACK = '.dw-lifecycle/scope-discovery/LAYOUT.md';

/**
 * Result of `deriveReferenceDocs` — the refs themselves plus any
 * non-fatal warnings the derivation surfaced. Warnings are routed by
 * the synthesis caller into the `## Synthesizer notes` section.
 */
export interface DeriveReferenceDocsResult {
  readonly refs: ReadonlyArray<ManifestReferenceDoc>;
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Derive `reference_docs[]` from PRD References/Appendix; defaults to
 * PRD + LAYOUT.md when no section found (and surfaces a warning).
 */
export async function deriveReferenceDocs(args: {
  readonly prdPath: string;
  readonly prdRelPath: string;
}): Promise<DeriveReferenceDocsResult> {
  let prdText: string;
  try {
    prdText = await readFile(args.prdPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read PRD ${args.prdPath}: ${errorMessage(err)}`);
  }
  const refs = extractAppendixLinks(prdText, args.prdRelPath);
  if (refs.length > 0) {
    return {
      refs: [
        { path: args.prdRelPath, role: 'prd', summary: 'Feature PRD — synthesis anchor.' },
        ...refs,
      ],
      warnings: [],
    };
  }
  return {
    refs: [
      { path: args.prdRelPath, role: 'prd', summary: 'Feature PRD — synthesis anchor.' },
      {
        path: LAYOUT_MD_FALLBACK,
        role: 'other',
        summary: 'On-disk layout contract for scope-discovery artifacts.',
      },
    ],
    warnings: [buildMissingReferencesWarning(args.prdRelPath)],
  };
}

function extractAppendixLinks(
  prdText: string,
  prdRelPath: string,
): ManifestReferenceDoc[] {
  const headingMatch = prdText.match(REFS_HEADING_RE);
  if (headingMatch === null || headingMatch.index === undefined) return [];
  const afterHeading = prdText.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingMatch = afterHeading.match(/\n#+\s/);
  const section =
    nextHeadingMatch === null || nextHeadingMatch.index === undefined
      ? afterHeading
      : afterHeading.slice(0, nextHeadingMatch.index);
  const prdDir = dirname(prdRelPath);
  const refs: ManifestReferenceDoc[] = [];
  const linkRe = new RegExp(MARKDOWN_LINK_RE.source, MARKDOWN_LINK_RE.flags);
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(section)) !== null) {
    const label = m[1];
    const href = m[2];
    if (label === undefined || href === undefined) continue;
    if (/^https?:\/\//.test(href)) continue; // external links — skip for v1
    const resolved = resolveLinkPath(prdDir, href);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    refs.push({ path: resolved, role: 'other', summary: label.replace(/^`|`$/g, '') });
  }
  return refs;
}

/** Resolve `href` (relative to the PRD file) into a repo-rooted POSIX path. */
function resolveLinkPath(prdDir: string, href: string): string {
  if (href.startsWith('/')) return href.replace(/^\/+/, '');
  return posix.normalize(posix.join(prdDir, href));
}

// Re-export the regime-holdout derivation so callers can import a
// single module ("synthesis-derive") for the per-section family.
export { deriveRegimeHoldouts } from './synthesis-derive-regime.js';
