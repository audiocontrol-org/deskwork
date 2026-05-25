/**
 * plugins/dw-lifecycle/src/scope-discovery/synthesis-derive-regime.ts
 *
 * Regime-holdout derivation helper for the synthesis pass. Split out
 * of synthesis-derive.ts to keep that file under the 300-500 line cap
 * and to isolate the Phase 4 regime-holdout section — synthesis only
 * emits this conditionally (when the regime-holdout-detector agent
 * supplies findings).
 */

import type {
  AdopterManifestCheckerFindings,
  RegimeHoldoutFinding,
  RegimeHoldoutFindings,
  RegimeHoldoutSource,
} from './discovery-agents/types.js';
import type {
  ManifestRegimeHoldoutEntry,
  ManifestRegimeHoldouts,
} from './synthesis-types.js';

/**
 * Derive the manifest's `regime_holdouts:` section from regime-
 * holdout-detector outputs AND/OR adopter-manifest-checker outputs.
 *
 * The regime-holdout-detector emits all findings in a single bucket
 * discriminated by `source`; the manifest fans them out into four
 * per-source arrays so an operator reading the YAML can scan one
 * section at a time.
 *
 * The adopter-manifest-checker (Phase 4 Family C) emits an isolated
 * adopter-manifest narration; its findings are spliced into the
 * `adopter_manifests:` bucket with the same shape. Dedup is by
 * `(file, id)`: running both agents on the same registry doesn't
 * double-count entries.
 *
 * Returns null when NEITHER detector kind contributes findings — the
 * synthesis pass omits the top-level `regime_holdouts:` key entirely
 * in that case (the schema marks the field optional). Returning an
 * empty-but-populated section would be a fallback shape the
 * project's "no fallbacks" rule forbids; null lets the caller decide.
 */
export function deriveRegimeHoldouts(
  detectorFindings: ReadonlyArray<RegimeHoldoutFindings>,
  adopterCheckerFindings: ReadonlyArray<AdopterManifestCheckerFindings> = [],
): ManifestRegimeHoldouts | null {
  if (detectorFindings.length === 0 && adopterCheckerFindings.length === 0) {
    return null;
  }
  const buckets: Record<RegimeHoldoutSource, ManifestRegimeHoldoutEntry[]> = {
    'anti-pattern': [],
    'adopter-manifest': [],
    'editor-symmetry': [],
    deprecation: [],
  };
  // Dedup key for adopter-manifest entries: same (file, manifest id)
  // means the same holdout regardless of which agent surfaced it.
  const adopterKey = new Set<string>();
  for (const finding of detectorFindings) {
    for (const entry of finding.findings) {
      const manifestEntry = toManifestEntry(entry);
      if (entry.source === 'adopter-manifest') {
        const key = `${manifestEntry.file}::${manifestEntry.id}`;
        if (adopterKey.has(key)) continue;
        adopterKey.add(key);
      }
      buckets[entry.source].push(manifestEntry);
    }
  }
  for (const f of adopterCheckerFindings) {
    for (const entry of f.findings) {
      const key = `${entry.file}::${entry.manifestId}`;
      if (adopterKey.has(key)) continue;
      adopterKey.add(key);
      buckets['adopter-manifest'].push({
        id: entry.manifestId,
        file: entry.file,
        shape:
          `expected adopter of '${entry.canonicalImport}' ` +
          `(manifest '${entry.manifestId}') — no canonical import found`,
        replacement: `import from '${entry.canonicalImport}' — ${entry.replacementSummary}`,
        evidence: {
          registry_path: f.registryPath,
          registry_id: entry.manifestId,
        },
      });
    }
  }
  // Stable per-bucket ordering — already stable from the agents, but
  // re-sort after fan-out so consumers can rely on the manifest shape
  // directly even if multiple agent outputs are merged.
  for (const list of Object.values(buckets)) {
    list.sort(compareEntries);
  }
  const total =
    buckets['anti-pattern'].length +
    buckets['adopter-manifest'].length +
    buckets['editor-symmetry'].length +
    buckets.deprecation.length;
  return {
    anti_patterns: buckets['anti-pattern'],
    adopter_manifests: buckets['adopter-manifest'],
    editor_symmetry: buckets['editor-symmetry'],
    deprecations: buckets.deprecation,
    meta: {
      total,
      by_source: {
        anti_pattern: buckets['anti-pattern'].length,
        adopter_manifest: buckets['adopter-manifest'].length,
        editor_symmetry: buckets['editor-symmetry'].length,
        deprecation: buckets.deprecation.length,
      },
    },
  };
}

function toManifestEntry(f: RegimeHoldoutFinding): ManifestRegimeHoldoutEntry {
  return {
    id: f.id,
    file: f.file,
    ...(f.line !== undefined ? { line: f.line } : {}),
    shape: f.shape,
    replacement: f.replacement,
    evidence: {
      registry_path: f.evidence.registryPath,
      registry_id: f.evidence.registryId,
    },
  };
}

function compareEntries(
  a: ManifestRegimeHoldoutEntry,
  b: ManifestRegimeHoldoutEntry,
): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  const aLine = a.line ?? 0;
  const bLine = b.line ?? 0;
  if (aLine !== bLine) return aLine - bLine;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
