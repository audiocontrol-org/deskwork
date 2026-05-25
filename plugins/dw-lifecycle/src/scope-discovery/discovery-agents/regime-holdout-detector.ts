/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts
 *
 * Discovery Agent 5 — Regime-holdout detector (Phase 4 Family A).
 *
 * Fuses up to four in-process gates into a single structured
 * `RegimeHoldoutFindings` JSON object that the synthesis pass
 * (`synthesis-derive-regime.ts`) merges into `scope-manifest.yaml`
 * under the top-level `regime_holdouts:` section.
 *
 * What it does:
 *   1. Load the anti-pattern registry and the adopter-manifest
 *      registry. Scan the source tree for each.
 *   2. Compute the editor-symmetry matrix from the same adopter-
 *      manifest registry, surfacing per-(manifest x editor) cells
 *      flagged 'partial' or 'missing' (the operator's regime-drift
 *      attention queue).
 *   3. Deprecation-queue collection: STUBBED in Phase 4 — the pilot's
 *      `deprecation-scan.ts` has not yet been ported. The stub
 *      returns an empty array so `meta.deprecation_count` is always
 *      0. Tracked at:
 *        https://github.com/audiocontrol-org/deskwork/issues/287
 *      When that issue lands, replace `collectDeprecationFindings`
 *      with the real scan path.
 *   4. Emit structured findings with per-finding evidence
 *      back-pointers to the registry / scan output that caught each
 *      entry.
 *
 * # Activation
 *
 * The agent is activated by the orchestrating `scope-inventory`
 * subcommand only when at least one of `anti-patterns.yaml`,
 * `adopter-manifests.yaml`, or `editor-symmetry.md` exists under
 * `<repoRoot>/.dw-lifecycle/scope-discovery/`. Standalone CLI
 * invocations always run all gates; missing registries are tolerated
 * by each scanner's "empty registry -> zero findings" contract.
 *
 * # DRY (per .claude/CLAUDE.md)
 *
 * Re-uses the in-process scan APIs of `check-anti-patterns.ts`,
 * `check-adopters.ts`, and `editor-symmetry-matrix.ts` directly — no
 * subprocess round-trip, no shape duplication. The shared agent CLI
 * wrapper (`shared.ts`'s `runIfMain` + `runAgentCli`) handles argv
 * parsing and JSON serialization the same way the other four agents
 * do.
 *
 * # Engine choice
 *
 * Importing the three (eventually four) scan modules in-process lets
 * the agent run all gates against the same on-disk snapshot in a
 * single tsx invocation; piping through subprocesses would add 3x
 * the startup cost and break the synthesis pass's "all agents are
 * importable" assumption (synthesis.ts loads agents via dynamic
 * import, not spawn).
 *
 * # CLI
 *
 *   tsx plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts \
 *     --feature <slug> --prd-path <path> [--repo-root <path>] [--module-root <path>]
 */

import { resolve } from 'node:path';
import { scan as scanAntiPatterns } from '../check-anti-patterns.js';
import { scan as scanAdopters } from '../check-adopters.js';
import { computeMatrix } from '../editor-symmetry-matrix.js';
import type {
  DiscoveryAgentInput,
  RegimeHoldoutFinding,
  RegimeHoldoutFindings,
  RegimeHoldoutMeta,
} from './types.js';
import { runIfMain } from './shared.js';
import { errorMessage } from '../util/typeguards.js';

/**
 * Default registry paths — match the upstream gates' defaults. Per
 * Finding 03 of the branch audit log, project-owned scope-discovery
 * config lives under `.dw-lifecycle/scope-discovery/` (not the legacy
 * `docs/scope-discovery/` location).
 */
const ANTI_PATTERNS_REGISTRY = '.dw-lifecycle/scope-discovery/anti-patterns.yaml';
const ADOPTER_MANIFESTS_REGISTRY = '.dw-lifecycle/scope-discovery/adopter-manifests.yaml';

/**
 * Module-root path used by the anti-pattern scanner + editor-symmetry
 * matrix. The audiocontrol pilot hard-coded `'modules'`; dw-lifecycle
 * threads the value through `DiscoveryAgentInput.moduleRoot` so each
 * project picks its own convention (default `'src'`).
 */
function moduleRootAbs(input: DiscoveryAgentInput): string {
  return resolve(input.repoRoot, input.moduleRoot);
}

/**
 * Run the anti-pattern gate and convert each finding into a regime-
 * holdout entry. Anti-pattern findings carry an absolute `file` path
 * because the scanner accepts an absolute scan-root; we relativize
 * back to the repo root so downstream consumers see the same shape
 * as the other sources.
 */
async function collectAntiPatternFindings(
  input: DiscoveryAgentInput,
): Promise<readonly RegimeHoldoutFinding[]> {
  const repoRoot = input.repoRoot;
  const result = await scanAntiPatterns({
    registryPath: resolve(repoRoot, ANTI_PATTERNS_REGISTRY),
    scanRoot: moduleRootAbs(input),
    quiet: true,
    json: true,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const f of result.findings) {
    out.push({
      source: 'anti-pattern',
      id: f.entry.id,
      file: toRepoRel(f.file, repoRoot),
      line: f.line,
      shape: `matches anti-pattern '${f.entry.id}' (primitive: ${f.entry.primitive})`,
      replacement: `import ${f.entry.primitive} from ${f.entry.from} — ${oneLine(f.entry.message)}`,
      evidence: {
        registryPath: ANTI_PATTERNS_REGISTRY,
        registryId: f.entry.id,
      },
    });
  }
  return out;
}

/**
 * Run the adopter-manifest gate and convert each holdout file into a
 * whole-file regime-holdout entry (no line number — the holdout is
 * "this file matches the glob but does not import the canonical
 * primitive," not a specific line within the file).
 */
async function collectAdopterManifestFindings(
  input: DiscoveryAgentInput,
): Promise<readonly RegimeHoldoutFinding[]> {
  const repoRoot = input.repoRoot;
  const result = await scanAdopters({
    registryPath: resolve(repoRoot, ADOPTER_MANIFESTS_REGISTRY),
    scanRoot: repoRoot,
    quiet: true,
    json: true,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const manifest of result.manifests) {
    const primary = manifest.entry.from[0] ?? '';
    for (const holdout of manifest.holdouts) {
      out.push({
        source: 'adopter-manifest',
        id: manifest.entry.id,
        file: holdout,
        // `entry.from` is a non-empty array (AUDIT-08). Use the
        // primary canonical path (index 0) in finding-narrative
        // text; alias paths are transitional and don't add signal
        // here.
        shape: `expected adopter of '${primary}' (manifest '${manifest.entry.id}') — no canonical import found`,
        replacement: `import from '${primary}' — ${oneLine(manifest.entry.message)}`,
        evidence: {
          registryPath: ADOPTER_MANIFESTS_REGISTRY,
          registryId: manifest.entry.id,
        },
      });
    }
  }
  return out;
}

/**
 * Run the editor-symmetry matrix builder and surface per-(manifest x
 * editor) cells in 'partial' or 'missing' state. Each cell becomes a
 * finding whose `id` is `<manifest-id>:<editor>` (composite). The
 * cell does not name an offending file directly — the holdout IS the
 * editor's failure to participate — so `file` is the editor's module
 * directory and `line` is undefined.
 */
async function collectEditorSymmetryFindings(
  input: DiscoveryAgentInput,
): Promise<readonly RegimeHoldoutFinding[]> {
  const repoRoot = input.repoRoot;
  const matrix = await computeMatrix({
    registryPath: resolve(repoRoot, ADOPTER_MANIFESTS_REGISTRY),
    scanRoot: repoRoot,
    moduleRoot: input.moduleRoot,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const row of matrix.rows) {
    const primary = row.entry.from[0] ?? '';
    matrix.editors.forEach((editor, idx) => {
      const cell = row.cells[idx];
      if (cell === undefined) return;
      if (cell.status !== 'partial' && cell.status !== 'missing') return;
      const composite = `${row.entry.id}:${editor}`;
      const shape =
        cell.status === 'missing'
          ? `editor '${editor}' targeted by manifest '${row.entry.id}' but has no adopters (expected ${cell.expected}, actual ${cell.actual}, holdouts ${cell.holdouts})`
          : `editor '${editor}' partially adopts manifest '${row.entry.id}' (expected ${cell.expected}, actual ${cell.actual}, holdouts ${cell.holdouts})`;
      out.push({
        source: 'editor-symmetry',
        id: composite,
        file: `${input.moduleRoot}/${editor}/`,
        shape,
        replacement: `import '${primary}' across the editor's adopter set — ${oneLine(row.entry.message)}`,
        evidence: {
          registryPath: ADOPTER_MANIFESTS_REGISTRY,
          registryId: row.entry.id,
        },
      });
    });
  }
  return out;
}

/**
 * Deprecation-queue collection. STUBBED in Phase 4 — the pilot's
 * `deprecation-scan.ts` (and its `check-deprecations` CLI surface)
 * has not yet been ported. Always returns an empty array.
 *
 * Tracked at issue #287:
 *   https://github.com/audiocontrol-org/deskwork/issues/287
 *
 * When that issue lands, replace this stub with a call to the real
 * scan path (mirroring the other `collect*Findings` helpers above).
 * The `meta.deprecation_count` will follow automatically.
 */
async function collectDeprecationFindings(
  _input: DiscoveryAgentInput,
): Promise<readonly RegimeHoldoutFinding[]> {
  // TODO(#287): replace stub with call to scanDeprecations(...) once
  // deprecation-scan.ts is ported from the audiocontrol pilot.
  return [];
}

/**
 * Compress a multi-line registry / marker message into a single line
 * for the manifest.
 */
function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

/**
 * Anti-pattern scanner's `file` is absolute (it accepts an absolute
 * `--root`). The other scanners already emit repo-relative POSIX
 * paths. Normalize to repo-relative POSIX so the merged shape is
 * uniform.
 */
function toRepoRel(absOrRel: string, repoRoot: string): string {
  if (!absOrRel.startsWith('/')) return absOrRel;
  const root = resolve(repoRoot);
  if (absOrRel === root) return '';
  if (absOrRel.startsWith(root + '/')) return absOrRel.substring(root.length + 1);
  return absOrRel;
}

function deriveMeta(findings: readonly RegimeHoldoutFinding[]): RegimeHoldoutMeta {
  let antiPattern = 0;
  let adopter = 0;
  let symmetry = 0;
  let deprecation = 0;
  for (const f of findings) {
    switch (f.source) {
      case 'anti-pattern':
        antiPattern += 1;
        break;
      case 'adopter-manifest':
        adopter += 1;
        break;
      case 'editor-symmetry':
        symmetry += 1;
        break;
      case 'deprecation':
        deprecation += 1;
        break;
    }
  }
  return {
    anti_pattern_count: antiPattern,
    adopter_manifest_count: adopter,
    editor_symmetry_holdout_count: symmetry,
    deprecation_count: deprecation,
    total: findings.length,
  };
}

/**
 * Public agent entrypoint. Imported by the synthesis layer + the
 * `scope-inventory` subcommand; invoked via the CLI wrapper at the
 * bottom of this file for standalone smoke-testing.
 */
export async function detectRegimeHoldouts(
  input: DiscoveryAgentInput,
): Promise<RegimeHoldoutFindings> {
  // Run the gates in parallel — they read disjoint files and share no
  // in-process state. Per gate, individual scan failures propagate
  // (no silent fallback): a misshapen registry should fail loudly so
  // the operator fixes it rather than getting a partial regime
  // picture.
  const [antiPattern, adopter, symmetry, deprecation] = await Promise.all([
    collectAntiPatternFindings(input),
    collectAdopterManifestFindings(input),
    collectEditorSymmetryFindings(input),
    collectDeprecationFindings(input),
  ]);
  const findings: RegimeHoldoutFinding[] = [
    ...antiPattern,
    ...adopter,
    ...symmetry,
    ...deprecation,
  ];
  // Stable ordering for deterministic JSON output across runs.
  findings.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    const aLine = a.line ?? 0;
    const bLine = b.line ?? 0;
    return aLine - bLine;
  });
  return {
    agent: 'regime-holdout-detector',
    featureSlug: input.featureSlug,
    findings,
    meta: deriveMeta(findings),
  };
}

runIfMain({
  importMetaUrl: import.meta.url,
  agentName: 'regime-holdout-detector',
  run: async (input) => {
    try {
      return await detectRegimeHoldouts(input);
    } catch (err) {
      throw new Error(`regime-holdout-detector failed: ${errorMessage(err)}`);
    }
  },
});
