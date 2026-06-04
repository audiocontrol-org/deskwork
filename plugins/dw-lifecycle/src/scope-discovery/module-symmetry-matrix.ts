/**
 * plugins/dw-lifecycle/src/scope-discovery/module-symmetry-matrix.ts
 *
 * Matrix computation for the cross-module symmetry checker (Phase 4
 * Family B). Walks `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`
 * (the same registry Family C's `check-adopters` consumes) and, for
 * each manifest entry, computes a per-module adoption status from the
 * entry's `expected_adopters_glob` + canonical `from` path.
 *
 * # Terminology
 *
 * "Module" in this file means "parallel top-level module that shares
 * canonical primitives with its peers." The pilot's audiocontrol
 * convention was `modules/<slug>-editor/` per device family; the
 * concept generalizes to any project with parallel top-level modules
 * (see `util/modules.ts` for the canonical terminology note —
 * including why the "editor" connotation persists in some downstream
 * surfaces).
 *
 * # Output shape
 *
 * An in-memory `SymmetryMatrix` whose `rows[i].cells[j]` holds the
 * adoption status of `modules[j]` for `manifests[i]`. The renderer
 * (`module-symmetry-report.ts`) emits the matrix as a markdown table.
 * The CLI (`check-module-symmetry.ts`) wires the pieces together.
 *
 * # Status semantics per cell
 *
 *   - ✓: every glob-matched file in the module imports the canonical
 *        path OR is exempted; no holdouts AND no tracked-holdouts.
 *   - ⚠: at least one glob-matched file in the module does NOT import
 *        the canonical path and is not exempted (partial adoption).
 *        REAL holdouts dominate tracked-holdouts: if both exist in
 *        the same cell, status is ⚠, not ⏳.
 *   - ✗: the manifest's glob targets the module (the glob's static
 *        prefix is `<moduleRoot>/<module>/...` or a wildcard module
 *        segment) but no glob-matched files exist in the module OR
 *        all matched files are holdouts with no adoption. The module
 *        was EXPECTED to participate but isn't.
 *   - ⏳: the module has tracked-holdouts but NO regular holdouts.
 *        Gate-passing (AUDIT-06): operator has explicitly deferred
 *        these files via `tracked_holdouts:` with mandatory tracking
 *        issues; matrix surfaces them distinctly so the deferral is
 *        visible instead of masked behind a false ✓.
 *   - —: the manifest's glob does not target this module at all
 *        (n/a). The cell carries no signal; it's there for matrix
 *        alignment.
 *
 * # DRY
 *
 * Re-uses `loadRegistry` + `AdopterManifestEntry` from Family C's
 * `adopter-manifests-registry.ts`, the glob walker from `util/glob.ts`,
 * the module-set helpers from `util/modules.ts`, and the import-regex
 * builder from Family C's `check-adopters.ts`. No copy-paste.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  loadRegistry,
  type AdopterManifestEntry,
} from './adopter-manifests-registry.js';
import { buildImportRegex } from './check-adopters.js';
import {
  discoverModules,
  moduleForPath,
  modulesTargetedByGlob,
} from './util/modules.js';
import { listFilesMatching, toPosix } from './util/glob.js';
import { errorMessage } from './util/typeguards.js';
import {
  filterActiveEntries,
  type CatalogStatus,
} from './util/catalog-status.js';

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx']);

const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.git',
]);

const DEFAULT_MODULE_ROOT = 'src';

/** Adoption status of one (manifest x module) cell. */
export type CellStatus = 'ok' | 'partial' | 'missing' | 'tracked' | 'na';

export interface MatrixCell {
  readonly status: CellStatus;
  /** Files in the module matching the manifest's glob (count). */
  readonly expected: number;
  /** Subset of `expected` that import the canonical `from` path. */
  readonly actual: number;
  /** Subset of `expected` that match a declared exception. */
  readonly exempted: number;
  /** Subset of `expected` flagged as holdouts (not adopting, not exempted, not tracked). */
  readonly holdouts: number;
  /**
   * Subset of `expected` flagged as tracked-holdouts (AUDIT-06).
   * Gate-passing; surfaced via the ⏳ glyph instead of being silently
   * subtracted (as exceptions are).
   */
  readonly trackedHoldouts: number;
}

export interface MatrixRow {
  readonly entry: AdopterManifestEntry;
  /** One cell per module, in `modules` order. */
  readonly cells: readonly MatrixCell[];
  /**
   * Loop status inherited verbatim from the
   * adopter-manifest entry that drives this row. The matrix renderer
   * surfaces this on the row label so operators see whether a row is
   * actively enforced (`blessed` / `cursed`), pending triage, or
   * suppressed. Rows with status outside `{blessed, cursed}` are NEVER
   * present in the matrix because `computeMatrix` filters them at the
   * registry boundary — this field is exposed here so downstream
   * consumers (the renderer + the regime-holdout-detector) can read
   * the inherited status without re-reading the entry.
   */
  readonly status: CatalogStatus;
}

export interface SymmetryMatrix {
  readonly modules: readonly string[];
  readonly rows: readonly MatrixRow[];
  /** Total unique TS/TSX files visited across all manifest scans. */
  readonly filesVisited: number;
  /** Module-root used to compute the matrix (for downstream reporting). */
  readonly moduleRoot: string;
}

export interface ComputeOptions {
  readonly registryPath: string;
  readonly scanRoot: string;
  /** Module-root directory (relative to scanRoot). Default `'src'`. */
  readonly moduleRoot?: string;
}

/**
 * Compute the full module-symmetry matrix from the on-disk registry +
 * module set. Empty registry -> matrix with zero rows; the renderer
 * produces a "no manifests" placeholder body in that case.
 */
export async function computeMatrix(opts: ComputeOptions): Promise<SymmetryMatrix> {
  const rootAbs = resolve(opts.scanRoot);
  const moduleRoot = opts.moduleRoot ?? DEFAULT_MODULE_ROOT;
  const modules = await discoverModules(rootAbs, moduleRoot);
  const registry = await loadRegistry(opts.registryPath);
  // filter to actively-enforced entries before
  // building the matrix. Adopter-manifest entries with `status:
  // pending | ignore | tracked-holdout | withdrawn` are skipped so the
  // matrix doesn't surface withdrawn / pending rows alongside
  // actively-enforced ones. Pre-Loop registries without explicit
  // status default to `blessed` so the legacy enforcement surface is
  // preserved (back-compat with all pre-Phase-11 baselines).
  const activeEntries = filterActiveEntries(registry.entries);
  if (activeEntries.length === 0) {
    return { modules, rows: [], filesVisited: 0, moduleRoot };
  }
  const visited = new Set<string>();
  const rows: MatrixRow[] = [];
  for (const entry of activeEntries) {
    rows.push(await computeRow(entry, rootAbs, modules, moduleRoot, visited));
  }
  return { modules, rows, filesVisited: visited.size, moduleRoot };
}

interface PerModuleBuckets {
  expected: Set<string>;
  actual: Set<string>;
  exempted: Set<string>;
  trackedHoldouts: Set<string>;
  holdouts: Set<string>;
}

async function computeRow(
  entry: AdopterManifestEntry,
  rootAbs: string,
  modules: readonly string[],
  moduleRoot: string,
  visited: Set<string>,
): Promise<MatrixRow> {
  // Step 1: find every file matching ANY of the entry's globs. The
  // scanner walks the tree once; we bucket per-module below.
  const globRegexes = entry.globs.map((g) => g.regex);
  const matchedAbs = await listFilesMatching(
    rootAbs,
    globRegexes,
    SKIP_DIRS,
    SCANNED_EXTENSIONS,
  );

  // Step 2: build a per-module bucket map. Keys are module slugs;
  // values are sets of repo-relative paths.
  const buckets = new Map<string, PerModuleBuckets>();
  for (const module of modules) {
    buckets.set(module, {
      expected: new Set(),
      actual: new Set(),
      exempted: new Set(),
      trackedHoldouts: new Set(),
      holdouts: new Set(),
    });
  }

  const exceptionSet = new Set(entry.exceptions.map((e) => e.path));
  const trackedHoldoutSet = new Set(entry.trackedHoldouts.map((th) => th.path));
  const importRe = buildImportRegex(entry.from);

  for (const abs of matchedAbs) {
    visited.add(abs);
    const rel = toPosix(toRepoRel(abs, rootAbs));
    const module = moduleForPath(rel, modules, moduleRoot);
    if (module === null) continue;
    const bucket = buckets.get(module);
    if (bucket === undefined) continue;
    bucket.expected.add(rel);
    if (exceptionSet.has(rel)) {
      bucket.exempted.add(rel);
      continue;
    }
    if (trackedHoldoutSet.has(rel)) {
      bucket.trackedHoldouts.add(rel);
      continue;
    }
    const content = await readFileSafe(abs);
    if (importRe.test(content)) {
      bucket.actual.add(rel);
    } else {
      bucket.holdouts.add(rel);
    }
  }

  // Step 3: which modules does this manifest target? A module is in
  // scope if at least one of its globs' static prefixes covers it.
  const targetedModules = new Set<string>();
  for (const glob of entry.globs) {
    for (const m of modulesTargetedByGlob(glob.pattern, modules, moduleRoot)) {
      targetedModules.add(m);
    }
  }

  // Step 4: build the cells, in `modules` order.
  const cells: MatrixCell[] = modules.map((module) => {
    const bucket = buckets.get(module);
    if (bucket === undefined) {
      return cellNa();
    }
    const expected = bucket.expected.size;
    const actual = bucket.actual.size;
    const exempted = bucket.exempted.size;
    const trackedHoldouts = bucket.trackedHoldouts.size;
    const holdouts = bucket.holdouts.size;
    if (!targetedModules.has(module)) {
      // The glob doesn't target this module's tree.
      return cellNa();
    }
    const status = deriveStatus(expected, actual, exempted, holdouts, trackedHoldouts);
    return { status, expected, actual, exempted, holdouts, trackedHoldouts };
  });

  return { entry, cells, status: entry.status };
}

function deriveStatus(
  expected: number,
  actual: number,
  exempted: number,
  holdouts: number,
  trackedHoldouts: number,
): CellStatus {
  if (expected === 0) return 'missing';
  // Real holdouts dominate tracked-holdouts: if there's a non-deferred
  // gap, surface it as ⚠ / ✗ even when tracked-holdouts also exist.
  if (holdouts === 0 && actual + exempted + trackedHoldouts === expected) {
    return trackedHoldouts > 0 ? 'tracked' : 'ok';
  }
  if (actual === 0 && exempted === 0 && trackedHoldouts === 0) return 'missing';
  return 'partial';
}

function cellNa(): MatrixCell {
  return {
    status: 'na',
    expected: 0,
    actual: 0,
    exempted: 0,
    holdouts: 0,
    trackedHoldouts: 0,
  };
}

function toRepoRel(abs: string, rootAbs: string): string {
  if (abs === rootAbs) return '';
  if (abs.startsWith(rootAbs + '/')) return abs.substring(rootAbs.length + 1);
  return abs;
}

async function readFileSafe(path: string): Promise<string> {
  try {
    const fileStat = await stat(path);
    if (fileStat.size === 0) return '';
    return await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`module-symmetry: failed to read ${path}: ${errorMessage(err)}`);
  }
}
