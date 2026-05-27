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
 *   3. Deprecation-queue collection: walks the scan root for files
 *      with a top-of-file `@deprecated` JSDoc tag or a `// DEPRECATED:`
 *      line comment within the first 20 lines, then counts external
 *      importers per deprecated file. Files with importers > 0 become
 *      regime-holdout findings (the importer itself is the holdout —
 *      it's the file blocking deletion). Closes #287.
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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scan as scanAntiPatterns } from '../check-anti-patterns.js';
import { scan as scanAdopters } from '../check-adopters.js';
import { computeMatrix } from '../editor-symmetry-matrix.js';
import { scan as scanDeprecations } from '../deprecation-scan.js';
import type {
  DiscoveryAgentInput,
  FindingStatusProvenance,
  RegimeHoldoutFinding,
  RegimeHoldoutFindings,
  RegimeHoldoutMeta,
} from './types.js';
import { runIfMain } from './shared.js';
import { errorMessage } from '../util/typeguards.js';
import {
  isActivelyEnforced,
  type CatalogStatus,
  type Provenance,
} from '../util/catalog-status.js';

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
 * Phase 11 Task 11 — extract the FindingStatusProvenance wire shape
 * from a catalog entry's `status` + `provenance` pair. Uniform across
 * every scanner so the synthesizer + the operator surface see one
 * consistent field regardless of which catalog the finding originated
 * from.
 */
function statusProvenance(
  status: CatalogStatus,
  provenance: Provenance,
): FindingStatusProvenance {
  return {
    source_status: status,
    provenance_source: provenance.source,
  };
}

/**
 * Phase 11 Task 11 — implicit Loop metadata for sources that have NO
 * underlying catalog entry. The deprecation scanner reads markers
 * embedded in source files; the markers themselves are the registry,
 * and they carry no Loop fields. We synthesize `blessed` + `install-
 * seed` so the wire shape is uniform; the doctor rule
 * `catalog-entry-missing-status` does NOT fire on deprecation markers
 * (they're a different concept from registry catalog entries).
 */
const IMPLICIT_BLESSED: FindingStatusProvenance = {
  source_status: 'blessed',
  provenance_source: 'install-seed',
};

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
  const registryPath = resolve(repoRoot, ANTI_PATTERNS_REGISTRY);
  // Per-gate activation guard: the orchestrator's outer `runAgents`
  // activates this agent when ANY of the three gate files exist;
  // each individual sub-scan must guard its OWN registry file because
  // the upstream scanner throws on a missing file (no silent fallback).
  if (!existsSync(registryPath)) return [];
  const result = await scanAntiPatterns({
    registryPath,
    scanRoot: moduleRootAbs(input),
    quiet: true,
    json: true,
    // Internal scan call — `gateMode` only affects the CLI exit code.
    gateMode: false,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const f of result.findings) {
    // Phase 11 Task 11 — the scanner has already filtered to
    // actively-enforced entries; this assertion documents the
    // invariant (and protects against a future scanner refactor that
    // forgets the filter). If a non-active entry leaked through, the
    // detector throws loudly rather than silently surfacing
    // suppressed findings.
    if (!isActivelyEnforced(f.entry.status)) {
      throw new Error(
        `regime-holdout-detector: anti-pattern scanner returned a finding for ` +
          `entry '${f.entry.id}' with status '${f.entry.status}'. The scanner ` +
          `is expected to filter to blessed/cursed entries at its registry ` +
          `boundary; this finding should never have surfaced.`,
      );
    }
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
      status_provenance: statusProvenance(f.entry.status, f.entry.provenance),
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
  const registryPath = resolve(repoRoot, ADOPTER_MANIFESTS_REGISTRY);
  // Per-gate activation guard — see `collectAntiPatternFindings`.
  if (!existsSync(registryPath)) return [];
  const result = await scanAdopters({
    registryPath,
    scanRoot: repoRoot,
    quiet: true,
    json: true,
    // Internal scan call — `gateMode` only affects the CLI exit code.
    gateMode: false,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const manifest of result.manifests) {
    const primary = manifest.entry.from[0] ?? '';
    if (!isActivelyEnforced(manifest.entry.status)) {
      throw new Error(
        `regime-holdout-detector: adopter scanner returned a manifest entry ` +
          `'${manifest.entry.id}' with status '${manifest.entry.status}'. The ` +
          `scanner is expected to filter to blessed/cursed entries at its ` +
          `registry boundary; this manifest should never have surfaced.`,
      );
    }
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
        status_provenance: statusProvenance(
          manifest.entry.status,
          manifest.entry.provenance,
        ),
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
  const registryPath = resolve(repoRoot, ADOPTER_MANIFESTS_REGISTRY);
  // Per-gate activation guard — see `collectAntiPatternFindings`.
  // The editor-symmetry matrix is derived from the adopter-manifests
  // registry, so its guard mirrors the adopter sub-pass's gate.
  if (!existsSync(registryPath)) return [];
  const matrix = await computeMatrix({
    registryPath,
    scanRoot: repoRoot,
    moduleRoot: input.moduleRoot,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const row of matrix.rows) {
    const primary = row.entry.from[0] ?? '';
    // Phase 11 Task 11 — matrix rows are already filtered to actively-
    // enforced entries by `computeMatrix`; assert the invariant.
    if (!isActivelyEnforced(row.status)) {
      throw new Error(
        `regime-holdout-detector: editor-symmetry matrix surfaced row ` +
          `'${row.entry.id}' with status '${row.status}'. computeMatrix is ` +
          `expected to filter to blessed/cursed entries; this row should ` +
          `never have surfaced.`,
      );
    }
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
        status_provenance: statusProvenance(row.status, row.entry.provenance),
      });
    });
  }
  return out;
}

/**
 * Deprecation-queue collection. Walks the scan root for files marked
 * `@deprecated` (top-of-file JSDoc) or `// DEPRECATED:` (within the
 * first 20 lines) and surfaces every external importer as a regime-
 * holdout finding. The importer is the holdout — it's the file
 * preventing deletion of the deprecated source. Files with zero
 * importers are safe to delete and DO NOT surface here as findings
 * (they appear in the standalone `check-deprecations` artifact's
 * "safe to delete" section, but they are not regime drift — they are
 * work-ready dispositions).
 *
 * Closes #287 (port of the audiocontrol pilot's deprecation-scan).
 */
async function collectDeprecationFindings(
  input: DiscoveryAgentInput,
): Promise<readonly RegimeHoldoutFinding[]> {
  const result = await scanDeprecations({
    scanRoot: input.repoRoot,
    moduleRoot: input.moduleRoot,
  });
  const out: RegimeHoldoutFinding[] = [];
  for (const deprecated of result.blocked) {
    for (const importer of deprecated.importers) {
      const markerLabel =
        deprecated.markerKind === 'jsdoc' ? '`@deprecated`' : '`// DEPRECATED:`';
      const tail = deprecated.message.length > 0 ? ` ${deprecated.message}` : '';
      out.push({
        source: 'deprecation',
        // `id` is the deprecated file's path — it's the unit of work
        // (operators drain the queue one deprecated file at a time).
        id: deprecated.path,
        file: importer.path,
        line: importer.line,
        shape: `imports deprecated file '${deprecated.path}'${
          deprecated.message.length > 0 ? ` (${deprecated.message})` : ''
        }`,
        replacement: `migrate off '${deprecated.path}' — the marker is ${markerLabel}${tail}`,
        evidence: {
          // The deprecation "registry" is the source file itself — the
          // marker IS the entry. Point operators at the deprecated file
          // so they can read its message in context.
          registryPath: deprecated.path,
          registryId: deprecated.markerKind,
        },
        // Phase 11 Task 11 — deprecation markers have no Loop fields
        // (they're embedded in source code, not a catalog YAML); we
        // surface implicit `blessed` so the wire shape is uniform.
        status_provenance: IMPLICIT_BLESSED,
      });
    }
  }
  return out;
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
  let activelyEnforced = 0;
  let candidate = 0;
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
    // Phase 11 Task 11 — per-status rollup.
    if (
      f.status_provenance.source_status === 'blessed' ||
      f.status_provenance.source_status === 'cursed'
    ) {
      activelyEnforced += 1;
    } else if (f.status_provenance.source_status === 'pending') {
      candidate += 1;
    }
  }
  return {
    anti_pattern_count: antiPattern,
    adopter_manifest_count: adopter,
    editor_symmetry_holdout_count: symmetry,
    deprecation_count: deprecation,
    total: findings.length,
    actively_enforced_count: activelyEnforced,
    candidate_count: candidate,
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
