/**
 * plugins/dw-lifecycle/src/scope-discovery/scope-widen-delta.ts
 *
 * Pure delta-computation + merge helpers for `scope-widen`. Extracted
 * from scope-widen.ts so the orchestration module stays under the
 * 300-500 line cap.
 *
 * Two pure functions + one structural typeguard live here:
 *
 *   computeDelta(prior, next)  — returns only the ADDITIONS (entries
 *                                in `next` not present in `prior`).
 *                                Removals are intentionally NOT
 *                                surfaced; scope-widen is purely
 *                                additive (the operator who curated
 *                                the prior manifest may have pruned
 *                                entries deliberately).
 *
 *   mergeDelta(prior, delta)   — appends the delta into the prior
 *                                manifest. Preserves `generated_by`
 *                                (so an operator-`curated` manifest
 *                                doesn't get downgraded to
 *                                `strawman`) and recomputes
 *                                `regime_holdouts.meta` from the
 *                                merged section lengths.
 *
 *   isScopeManifestShape(v)    — narrow typeguard mirroring the
 *                                manifest schema's required fields.
 *                                Used by scope-widen's
 *                                `loadPriorManifest` AFTER the schema
 *                                validator has already confirmed the
 *                                shape; the typeguard is the
 *                                TS-side narrowing primitive (no
 *                                `as` cast).
 *
 * Per-entry identity keys (used to detect "what's new"):
 *
 *   route          — `path` (the natural key)
 *   module         — `glob` (the natural key)
 *   theme          — TERM, NOT the rendered `<term> (N occurrences)`
 *                    string; the synthesizer's render-time annotation
 *                    changes across runs even when the same theme is
 *                    still present, and keying on the rendered string
 *                    would false-positive every occurrence-count shift
 *                    as an "addition".
 *   regime-holdout — `(file, id, registry_path, line?)` tuple, which
 *                    uniquely keys a finding under any source bucket.
 */

import type {
  ManifestModule,
  ManifestRegimeHoldoutEntry,
  ManifestRoute,
  ScopeManifest,
} from './synthesis-types.js';
import { isPlainObject } from './util/typeguards.js';

/**
 * Per-section delta — only the additions surface. Removals are silent
 * (scope-widen is purely additive; if the new run drops a finding the
 * old manifest had, we keep the old finding intact).
 */
export interface ScopeWidenDelta {
  readonly routes: ReadonlyArray<ManifestRoute>;
  readonly modules: ReadonlyArray<ManifestModule>;
  readonly themes: ReadonlyArray<string>;
  readonly regimeHoldouts: {
    readonly anti_patterns: ReadonlyArray<ManifestRegimeHoldoutEntry>;
    readonly adopter_manifests: ReadonlyArray<ManifestRegimeHoldoutEntry>;
    readonly editor_symmetry: ReadonlyArray<ManifestRegimeHoldoutEntry>;
    readonly deprecations: ReadonlyArray<ManifestRegimeHoldoutEntry>;
  };
  readonly total: number;
}

function routeKey(r: ManifestRoute): string {
  return r.path;
}
function moduleKey(m: ManifestModule): string {
  return m.glob;
}
function regimeKey(e: ManifestRegimeHoldoutEntry): string {
  return `${e.file}|${e.id}|${e.evidence.registry_path}|${e.line ?? ''}`;
}

/**
 * Extract the theme TERM from a rendered theme entry. `deriveThemes`
 * formats themes as `<term> (<N> occurrence[s])`; the term is the
 * identity key, the occurrence count is annotation that changes
 * across runs even when the same theme is still present. Splitting
 * on the first ` (` keeps the key stable.
 *
 * Returns the term as-is when no ` (` is present (defensive — a
 * hand-curated manifest may have themes without the occurrence
 * annotation).
 */
function themeKey(theme: string): string {
  const idx = theme.indexOf(' (');
  return idx === -1 ? theme : theme.slice(0, idx);
}

/**
 * Structural typeguard for ScopeManifest. The schema validator in
 * `scope-widen.ts#loadPriorManifest` already guarantees the shape
 * against the JSON Schema; this typeguard mirrors the SUBSET of
 * fields scope-widen actually reads. A drift between this guard and
 * the schema surfaces as a thrown error at load time (loud failure)
 * rather than silent narrowing of a malformed manifest.
 */
export function isScopeManifestShape(v: unknown): v is ScopeManifest {
  if (!isPlainObject(v)) return false;
  const kind = v['kind'];
  if (kind !== 'ui' && kind !== 'code' && kind !== 'hybrid') return false;
  if (typeof v['feature_slug'] !== 'string') return false;
  if (typeof v['generated_by'] !== 'string') return false;
  if (typeof v['generated_at'] !== 'string') return false;
  if (!Array.isArray(v['scenarios'])) return false;
  if (!Array.isArray(v['reference_docs'])) return false;
  if (!Array.isArray(v['discovery_themes'])) return false;
  // Optional sections: presence is fine, but if present they must be
  // arrays/objects respectively. Detailed per-element narrowing is
  // delegated to the schema validator upstream.
  if (v['routes'] !== undefined && !Array.isArray(v['routes'])) return false;
  if (v['modules'] !== undefined && !Array.isArray(v['modules'])) return false;
  if (v['regime_holdouts'] !== undefined && !isPlainObject(v['regime_holdouts'])) {
    return false;
  }
  return true;
}

/**
 * Compute additions: entries present in `next` but absent in `prior`.
 * Removals are intentionally NOT surfaced — scope-widen is purely
 * additive. The operator who curated the prior manifest may have
 * pruned entries deliberately; a new scan that re-discovers them is
 * noise, not signal, and re-introducing them would undo the curation.
 */
export function computeDelta(
  prior: ScopeManifest,
  next: ScopeManifest,
): ScopeWidenDelta {
  const priorRouteKeys = new Set((prior.routes ?? []).map(routeKey));
  const routes = (next.routes ?? []).filter((r) => !priorRouteKeys.has(routeKey(r)));

  const priorModuleKeys = new Set((prior.modules ?? []).map(moduleKey));
  const modules = (next.modules ?? []).filter(
    (m) => !priorModuleKeys.has(moduleKey(m)),
  );

  // Themes are formatted as `<term> (<N> occurrence[s])` by the
  // synthesizer; the term is the identity key. A re-run that produces
  // a different occurrence count for the same term is NOT a new
  // theme — keying on the rendered string would surface every theme
  // as a "new" addition whenever the count shifted.
  const priorThemeKeys = new Set((prior.discovery_themes ?? []).map(themeKey));
  const themes = (next.discovery_themes ?? []).filter(
    (t) => !priorThemeKeys.has(themeKey(t)),
  );

  const priorAnti = new Set(
    (prior.regime_holdouts?.anti_patterns ?? []).map(regimeKey),
  );
  const priorAdopter = new Set(
    (prior.regime_holdouts?.adopter_manifests ?? []).map(regimeKey),
  );
  const priorEditor = new Set(
    (prior.regime_holdouts?.editor_symmetry ?? []).map(regimeKey),
  );
  const priorDepr = new Set(
    (prior.regime_holdouts?.deprecations ?? []).map(regimeKey),
  );
  const anti_patterns = (next.regime_holdouts?.anti_patterns ?? []).filter(
    (e) => !priorAnti.has(regimeKey(e)),
  );
  const adopter_manifests = (next.regime_holdouts?.adopter_manifests ?? []).filter(
    (e) => !priorAdopter.has(regimeKey(e)),
  );
  const editor_symmetry = (next.regime_holdouts?.editor_symmetry ?? []).filter(
    (e) => !priorEditor.has(regimeKey(e)),
  );
  const deprecations = (next.regime_holdouts?.deprecations ?? []).filter(
    (e) => !priorDepr.has(regimeKey(e)),
  );

  const total =
    routes.length +
    modules.length +
    themes.length +
    anti_patterns.length +
    adopter_manifests.length +
    editor_symmetry.length +
    deprecations.length;
  return {
    routes,
    modules,
    themes,
    regimeHoldouts: { anti_patterns, adopter_manifests, editor_symmetry, deprecations },
    total,
  };
}

/**
 * Merge a delta INTO the prior manifest. Returns a new manifest with
 * the additions appended to each section; existing entries are
 * preserved verbatim. The `generated_by` field stays whatever the
 * prior manifest had (so an operator-curated manifest doesn't get
 * downgraded back to 'strawman' just because scope-widen ran).
 *
 * `regime_holdouts.meta` is recomputed from the merged section lengths
 * so the meta counts stay consistent with the surfaced findings.
 */
export function mergeDelta(
  prior: ScopeManifest,
  delta: ScopeWidenDelta,
): ScopeManifest {
  const mergedRoutes = prior.routes
    ? [...prior.routes, ...delta.routes]
    : delta.routes.length > 0
      ? delta.routes
      : undefined;
  const mergedModules = prior.modules
    ? [...prior.modules, ...delta.modules]
    : delta.modules.length > 0
      ? delta.modules
      : undefined;
  const mergedThemes = [...prior.discovery_themes, ...delta.themes];

  let mergedRegime = prior.regime_holdouts;
  const hasRegimeDelta =
    delta.regimeHoldouts.anti_patterns.length > 0 ||
    delta.regimeHoldouts.adopter_manifests.length > 0 ||
    delta.regimeHoldouts.editor_symmetry.length > 0 ||
    delta.regimeHoldouts.deprecations.length > 0;
  if (mergedRegime !== undefined || hasRegimeDelta) {
    const ap = [
      ...(mergedRegime?.anti_patterns ?? []),
      ...delta.regimeHoldouts.anti_patterns,
    ];
    const am = [
      ...(mergedRegime?.adopter_manifests ?? []),
      ...delta.regimeHoldouts.adopter_manifests,
    ];
    const es = [
      ...(mergedRegime?.editor_symmetry ?? []),
      ...delta.regimeHoldouts.editor_symmetry,
    ];
    const dp = [
      ...(mergedRegime?.deprecations ?? []),
      ...delta.regimeHoldouts.deprecations,
    ];
    // re-derive `by_status` rollup over the merged
    // entries. The synthesis-derive-regime helper computes this from
    // first principles; we mirror that derivation here so the merge
    // produces a manifest with the same shape (operators reading the
    // merged manifest see by_status counts regardless of merge path).
    let activelyEnforced = 0;
    let candidate = 0;
    for (const list of [ap, am, es, dp]) {
      for (const e of list) {
        const s = e.status_provenance.source_status;
        if (s === 'blessed' || s === 'cursed') activelyEnforced += 1;
        else if (s === 'pending') candidate += 1;
      }
    }
    mergedRegime = {
      anti_patterns: ap,
      adopter_manifests: am,
      editor_symmetry: es,
      deprecations: dp,
      meta: {
        total: ap.length + am.length + es.length + dp.length,
        by_source: {
          anti_pattern: ap.length,
          adopter_manifest: am.length,
          editor_symmetry: es.length,
          deprecation: dp.length,
        },
        by_status: {
          actively_enforced: activelyEnforced,
          candidate,
        },
      },
    };
  }

  return {
    ...prior,
    discovery_themes: mergedThemes,
    ...(mergedRoutes !== undefined ? { routes: mergedRoutes } : {}),
    ...(mergedModules !== undefined ? { modules: mergedModules } : {}),
    ...(mergedRegime !== undefined ? { regime_holdouts: mergedRegime } : {}),
  };
}

/**
 * Render a delta as a multi-line stderr summary. Returned without
 * trailing newline so callers can decide their own line-terminator.
 */
export function formatDelta(delta: ScopeWidenDelta): string {
  const lines: string[] = [];
  lines.push(`scope-widen delta — ${delta.total} addition(s):`);
  lines.push(`  routes:           +${delta.routes.length}`);
  lines.push(`  modules:          +${delta.modules.length}`);
  lines.push(`  themes:           +${delta.themes.length}`);
  lines.push(
    `  regime-holdouts:  +${delta.regimeHoldouts.anti_patterns.length} anti-pattern, ` +
      `+${delta.regimeHoldouts.adopter_manifests.length} adopter-manifest, ` +
      `+${delta.regimeHoldouts.editor_symmetry.length} editor-symmetry, ` +
      `+${delta.regimeHoldouts.deprecations.length} deprecation`,
  );
  return lines.join('\n');
}
