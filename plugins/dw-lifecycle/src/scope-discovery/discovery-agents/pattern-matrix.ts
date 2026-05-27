/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-matrix.ts
 *
 * Discovery Agent 2 — pattern matrix builder.
 *
 * Renamed from `ast-grep-matrix.ts` (the pilot's name) because the
 * agent does NOT shell out to the `ast-grep` binary — it uses pure-JS
 * line-grep + glob-based scanners for the polymorphic pattern catalog.
 *
 * # Phase 11 Task 1 — polymorphic dispatcher
 *
 * The agent now routes catalog entries by `type` discriminator to
 * type-specific handlers under `./pattern-handlers/`. The supported
 * types in v1.1 Task 1:
 *
 *   - `regex` (legacy default; pre-Phase-11 backward-compat)
 *   - `negative-space` (NEW; the audiocontrol #315 KeygroupSummary
 *     repro shape — file matches the expected-adopter glob but does
 *     NOT contain the canonical primitive)
 *   - `coverage` (NEW; emits a synthesis-layer adoption metric)
 *   - `outlier` (NEW; statistical outlier detection)
 *   - `semantic` (NEW; LLM-augmented — STUB in this dispatch; the
 *     wiring lands under Phase 11 Task 7)
 *
 * The dispatcher in `pattern-handlers/index.ts` is the registry of
 * record. Adding a new type requires a new handler file there + a
 * schema extension.
 *
 * # Built-in catalog
 *
 * The four CLAUDE.md-aligned regex patterns ship as the default
 * built-in catalog (as-type-cast, any-annotation, ts-ignore-pragma,
 * magic-number). Projects override the entire catalog via
 * `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` — the
 * loader parses every supported `type` and returns a typed catalog.
 *
 * # Engine choice
 *
 * Line-grep + glob for handler implementations. A true AST walk (via
 * the `typescript` compiler API or `ts-morph`) would catch fewer
 * false-positives, but the cost is a new dependency, ~10× the wall-
 * clock, and significantly more code. Line-grep produces usable
 * signal at low cost — the synthesis layer + operator curation prunes
 * false positives.
 *
 * # G5 — unmatched-shape clustering (stub here)
 *
 * The synthesis-layer unmatched-shape clustering pass (G5) is NOT a
 * per-file pattern type and does not route through this dispatcher.
 * Its stub lives in `synthesis-discovered-candidates.ts`.
 *
 * # CLI
 *
 *   tsx plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-matrix.ts \
 *     --feature <slug> --prd-path <path> [--repo-root <path>] [--module-root <path>]
 */

import { join } from 'node:path';
import type {
  AstGrepMatrixFindings,
  DiscoveryAgentInput,
  PatternFinding,
} from './types.js';
import {
  type SourceFileView,
  getModuleRoot,
  isDirectory,
  modulesInScopeForFeature,
  readSourceFile,
  repoAbs,
  runIfMain,
  walkSourceFiles,
} from './shared.js';
import { errorMessage } from '../util/typeguards.js';
import { dispatchPattern } from './pattern-handlers/index.js';
import { loadOverridePatterns } from './pattern-handlers/loader.js';
import type { PatternCatalogEntry, RegexEntry } from './pattern-handlers/types.js';
import { clusterUnmatchedShapes } from './synthesis-discovered-candidates.js';
import {
  filterActiveEntries,
  synthesizeDefaultProvenance,
} from '../util/catalog-status.js';

/**
 * Built-in pattern catalog. Each entry has a stable kebab-case `id`
 * surfaced verbatim in the agent's output so the synthesis layer can
 * address patterns by identity.
 *
 * The regexes are intentionally conservative — the synthesis layer
 * deduplicates and ranks; false positives at this layer are cheaper
 * than false negatives.
 *
 * All built-ins are `type: 'regex'`. Project overrides can mix any of
 * the dispatcher's supported types.
 */
// Phase 11 Task 2 — built-ins are `status: 'blessed'` (actively
// enforced) with synthesized install-seed provenance. Operators who
// override the catalog can mark entries with any status they choose;
// the dispatcher filters on status before running handlers.
const BUILTIN_PROVENANCE = synthesizeDefaultProvenance();
const BUILTIN_PATTERNS: ReadonlyArray<RegexEntry> = [
  {
    type: 'regex',
    id: 'as-type-cast',
    description: '`as <TypeName>` cast (banned per CLAUDE.md "never bypass typing")',
    regex: /\bas\s+(?!const\b|unknown\b)[A-Z][A-Za-z0-9_]*/g,
    status: 'blessed',
    provenance: BUILTIN_PROVENANCE,
  },
  {
    type: 'regex',
    id: 'any-annotation',
    description: '`: any` type annotation (banned per CLAUDE.md)',
    regex: /:\s*any\b(?![A-Za-z0-9_])/g,
    status: 'blessed',
    provenance: BUILTIN_PROVENANCE,
  },
  {
    type: 'regex',
    id: 'ts-ignore-pragma',
    description: '`@ts-ignore` or `@ts-expect-error` (banned per CLAUDE.md)',
    regex: /@ts-(?:ignore|expect-error)\b/g,
    status: 'blessed',
    provenance: BUILTIN_PROVENANCE,
  },
  {
    type: 'regex',
    id: 'magic-number',
    description:
      'Inline numeric literal >= 10 not bound to a const/named identifier (heuristic — synthesis layer + operator curate)',
    regex: /(?<![A-Za-z0-9_.=])\d{2,}\b/g,
    status: 'blessed',
    provenance: BUILTIN_PROVENANCE,
  },
];

async function gatherInScopeFiles(
  input: DiscoveryAgentInput,
): Promise<ReadonlyArray<string>> {
  const modulesInScope = await modulesInScopeForFeature(input);
  const collected: string[] = [];
  for (const module of modulesInScope) {
    // Single-package degradation: walk the module-root directly when
    // the module marker is '.'.
    const modSrc =
      module === '.'
        ? getModuleRoot(input)
        : repoAbs(input.repoRoot, join(input.moduleRoot, module));
    if (!(await isDirectory(modSrc))) continue;
    const files = await walkSourceFiles({
      rootAbs: modSrc,
      repoRoot: input.repoRoot,
    });
    for (const f of files) collected.push(f);
  }
  return collected.sort();
}

/**
 * Public agent entrypoint. Imported by the synthesis layer + the
 * `scope-inventory` subcommand.
 *
 * The function signature is preserved across the Phase 11 refactor
 * (callers continue to pass `DiscoveryAgentInput` and receive
 * `AstGrepMatrixFindings`). Internally the per-pattern execution now
 * routes through the polymorphic dispatcher.
 */
export async function buildPatternMatrix(
  input: DiscoveryAgentInput,
): Promise<AstGrepMatrixFindings> {
  const override = await loadOverridePatterns(input.repoRoot);
  const allPatterns: ReadonlyArray<PatternCatalogEntry> =
    override ?? BUILTIN_PATTERNS;
  // Phase 11 Task 2 — filter to actively-enforced entries before
  // dispatching. Operators can plant `status: pending` entries in
  // their override YAML (e.g., promoted-from-candidate proposals
  // pending triage) without those entries firing as findings until
  // the operator transitions them to `blessed` or `cursed`.
  const patterns = filterActiveEntries(allPatterns);
  const files = await gatherInScopeFiles(input);
  const scans: SourceFileView[] = [];
  for (const f of files) {
    scans.push(await readSourceFile({ repoRoot: input.repoRoot, relFile: f }));
  }
  const findings: PatternFinding[] = [];
  for (const entry of patterns) {
    findings.push(dispatchPattern(entry, scans));
  }
  // G5 stub — synthesis-layer unmatched-shape clustering pass. Always
  // emitted (may be empty); the stub returns [] until the clustering
  // algorithm lands (see synthesis-discovered-candidates.ts for the
  // tracking issue cross-reference).
  const discoveredCandidates = clusterUnmatchedShapes({
    scans,
    findings,
  });
  return {
    agent: 'ast-grep-matrix',
    featureSlug: input.featureSlug,
    patterns: findings,
    discoveredCandidates,
  };
}

runIfMain({
  importMetaUrl: import.meta.url,
  agentName: 'pattern-matrix',
  run: async (input) => {
    try {
      return await buildPatternMatrix(input);
    } catch (err) {
      throw new Error(`pattern-matrix failed: ${errorMessage(err)}`);
    }
  },
});
