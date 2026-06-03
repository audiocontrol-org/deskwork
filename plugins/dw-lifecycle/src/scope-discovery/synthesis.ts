/**
 * plugins/dw-lifecycle/src/scope-discovery/synthesis.ts
 *
 * Synthesis pass — consumes the discriminated-union DiscoveryAgentFinding[]
 * from the four-agent fleet, deduplicates + ranks the signal, and
 * emits a strawman scope-manifest.yaml validated against the schema
 * before write.
 *
 * Kind detection branches on the `agent` tag: ui-only → 'ui';
 * ast/clone-only → 'code'; both → 'hybrid'; neither → throw.
 * Per-section derivation lives in synthesis-derive.ts (with the regime
 * fan-out further split into synthesis-derive-regime.ts); validation
 * via schema/manifest-validator.ts.
 *
 * The orchestrating `scope-inventory` subcommand fans the agents in
 * parallel, then calls `synthesize()` in-process — no JSON disk round-
 * trip needed for the production path. The standalone CLI surface
 * (parseCli / loadFinding / renderSynthesizerNotes) lives in
 * synthesis-cli.ts.
 */

import type {
  AdopterManifestCheckerFindings,
  AstGrepMatrixFindings,
  CloneDetectorFindings,
  DiscoveryAgentFinding,
  DiscoveryAgentName,
  PrdThemedFindings,
  RegimeHoldoutFindings,
  UiRouteFindings,
} from './discovery-agents/types.js';
import type {
  ManifestKind,
  ScopeManifest,
  SynthesisInput,
  SynthesisOutput,
} from './synthesis-types.js';
import {
  defaultScenarioId,
  deriveModules,
  deriveReferenceDocs,
  deriveRoutes,
  deriveScenarios,
  deriveThemes,
} from './synthesis-derive.js';
import { deriveRegimeHoldouts } from './synthesis-derive-regime.js';
import {
  compileManifestValidator,
  validateManifest,
} from './schema/manifest-validator.js';
import { computeCodebaseStateMetrics } from './discovery-agents/codebase-state-metrics.js';
import { gatherMetricsInput } from './discovery-agents/codebase-state-metrics-gather.js';
import { errorMessage } from './util/typeguards.js';
import type { CodebaseStateMetrics } from './discovery-agents/codebase-state-metrics-types.js';
import { mediate, toManifestSection } from './mediation/mediation.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

interface PartitionedFindings {
  readonly ui: ReadonlyArray<UiRouteFindings>;
  readonly ast: ReadonlyArray<AstGrepMatrixFindings>;
  readonly clones: ReadonlyArray<CloneDetectorFindings>;
  readonly themes: ReadonlyArray<PrdThemedFindings>;
  readonly regime: ReadonlyArray<RegimeHoldoutFindings>;
  readonly adopterChecker: ReadonlyArray<AdopterManifestCheckerFindings>;
  readonly agentsConsumed: ReadonlyArray<DiscoveryAgentName>;
  readonly rawCount: number;
}

function partition(
  findings: ReadonlyArray<DiscoveryAgentFinding>,
): PartitionedFindings {
  const ui: UiRouteFindings[] = [];
  const ast: AstGrepMatrixFindings[] = [];
  const clones: CloneDetectorFindings[] = [];
  const themes: PrdThemedFindings[] = [];
  const regime: RegimeHoldoutFindings[] = [];
  const adopterChecker: AdopterManifestCheckerFindings[] = [];
  const seenAgents = new Set<DiscoveryAgentName>();
  // rawCount counts the *signal* the agents handed us — individual
  // hits, clone members, route entries, theme matches — so dedupCount =
  // rawCount - emittedUnique is a meaningful "input → output reduction"
  // number rather than something that needs to be clamped to non-negative.
  let rawCount = 0;
  for (const f of findings) {
    seenAgents.add(f.agent);
    switch (f.agent) {
      case 'ui-route-enumerator':
        ui.push(f);
        rawCount += f.routes.length;
        break;
      case 'ast-grep-matrix':
        ast.push(f);
        for (const pattern of f.patterns) {
          rawCount += pattern.hits.length;
        }
        break;
      case 'clone-detector-reader':
        clones.push(f);
        for (const group of f.clones) {
          rawCount += group.members.length;
        }
        break;
      case 'prd-themed-pattern-hunter':
        themes.push(f);
        for (const theme of f.themes) {
          rawCount += theme.occurrences.length;
        }
        break;
      case 'regime-holdout-detector':
        regime.push(f);
        rawCount += f.findings.length;
        break;
      case 'adopter-manifest-checker':
        adopterChecker.push(f);
        rawCount += f.findings.length;
        break;
    }
  }
  return {
    ui,
    ast,
    clones,
    themes,
    regime,
    adopterChecker,
    rawCount,
    agentsConsumed: Array.from(seenAgents).sort(),
  };
}

function determineKind(p: PartitionedFindings): ManifestKind {
  // A finding's PRESENCE in the partition isn't enough — an empty
  // ui-route-enumerator finding (zero routes) shouldn't push 'kind' to
  // 'ui' or 'hybrid'. Look at the actual content.
  const hasUi = p.ui.some((f) => f.routes.length > 0);
  const hasCode =
    p.ast.some((f) => f.patterns.some((pat) => pat.hits.length > 0)) ||
    p.clones.some((f) => f.clones.length > 0);
  if (hasUi && hasCode) return 'hybrid';
  if (hasUi) return 'ui';
  if (hasCode) return 'code';
  throw new Error(
    'synthesis: no UI/AST/clone signal present — cannot determine manifest kind. ' +
      'At least one of ui-route-enumerator / pattern-matrix / clone-detector-reader must ' +
      'contribute non-empty findings (themes-only input is insufficient).',
  );
}

/**
 * Synthesis input contract extended for in-process orchestration. The
 * `scope-inventory` subcommand passes a `moduleRoot` alongside the
 * findings so `deriveModules` can interpret `<module-root>/<slug>/`
 * file paths in the AST and clone findings.
 */
export interface SynthesizeOptions extends SynthesisInput {
  /** Module-root directory name (relative to repoRoot). Default 'src'. */
  readonly moduleRoot: string;
  /**
   * Repo root used for gathering codebase-state metrics. Defaults to
   * undefined when omitted; passed explicitly by the scope-inventory
   * subcommand for predictability.
   */
  readonly repoRoot?: string;
  /**
   * When true, skip the git-history read used by the catalog-stability
   * metric. Lets adopters opt out when their `git log` invocation is
   * problematic (slow remote, large monorepo, etc.).
   */
  readonly noGitHistory?: boolean;
}

/** Public synthesis entrypoint. Throws on derivation/validation failure (no silent fallback). */
export async function synthesize(input: SynthesizeOptions): Promise<SynthesisOutput> {
  if (input.findings.length === 0) {
    throw new Error('synthesize: input.findings is empty');
  }
  const partitioned = partition(input.findings);
  const kind = determineKind(partitioned);

  const scenarios = deriveScenarios();
  const scenarioId = defaultScenarioId();
  const routes =
    kind === 'ui' || kind === 'hybrid'
      ? deriveRoutes(partitioned.ui, scenarioId)
      : undefined;
  // deriveModules consumes the PRD-themed findings to honor the PRD's
  // `## In Scope` / `## Out of Scope` sections (dropping excluded
  // modules + annotating low-relevance ones). The returned `warnings`
  // get folded into the synthesis-level warning list so the operator
  // sees which modules were pruned.
  const moduleResult =
    kind === 'code' || kind === 'hybrid'
      ? deriveModules({
          astFindings: partitioned.ast,
          cloneFindings: partitioned.clones,
          prdThemedFindings: partitioned.themes,
          moduleRoot: input.moduleRoot,
        })
      : undefined;
  const modules = moduleResult?.modules;
  const themesList = deriveThemes(partitioned.themes);
  // Empty themes is a real "no signal" outcome. Emitting a literal
  // "placeholder" string is the deferral-shape the project's
  // agent-discipline rules forbid; fail loudly instead.
  if (themesList.length === 0) {
    throw new Error(
      'synthesis: PRD-themed agent contributed no themes; cannot produce a ' +
        'manifest. Either no prd-themed-pattern-hunter findings were passed ' +
        'in or the agent ran and matched zero terms (investigate the PRD ' +
        "content or the agent's tokenizer).",
    );
  }
  const warnings: string[] = [];
  if (moduleResult !== undefined) {
    for (const w of moduleResult.warnings) warnings.push(w);
  }
  const refDocsResult = await deriveReferenceDocs({
    prdPath: input.prdPath,
    prdRelPath: input.prdRelPath,
  });
  const referenceDocs = refDocsResult.refs;
  for (const w of refDocsResult.warnings) warnings.push(w);
  const regimeHoldouts = deriveRegimeHoldouts(
    partitioned.regime,
    partitioned.adopterChecker,
  );
  if (regimeHoldouts === null) {
    warnings.push(
      'No regime-holdout-detector or adopter-manifest-checker findings supplied; ' +
        'manifest omits `regime_holdouts:` section. Run the agents to surface ' +
        'anti-pattern / adopter-manifest / module-symmetry / deprecation holdouts.',
    );
  }
  if (kind === 'ui' && partitioned.ui.length > 0) {
    const totalRoutes = partitioned.ui.reduce((n, f) => n + f.routes.length, 0);
    if (totalRoutes <= 1) {
      warnings.push(
        `ui-route-enumerator surfaced only ${totalRoutes} route(s); the UI surface may be ` +
          'under-walked. Re-run with a deeper crawl or supply additional UI findings.',
      );
    }
  }

  const generatedAt = new Date().toISOString();
  const finalCount =
    (routes?.length ?? 0) +
    (modules?.length ?? 0) +
    themesList.length +
    (regimeHoldouts?.meta.total ?? 0);
  const dedupCount = partitioned.rawCount - finalCount;
  if (dedupCount < 0) {
    throw new Error(
      `synthesis: dedupCount went negative (raw=${partitioned.rawCount}, ` +
        `final=${finalCount}); raw-count metric is miscounting signal vs ` +
        'emitted entries. This is a bug in partition() or the derive helpers.',
    );
  }

  // gather + compute codebase-state metrics when
  // the project ships any catalog files. Informational: failures
  // surface as warnings, not throws, so a broken git history doesn't
  // take down an otherwise-healthy synthesis run.
  const codebaseStateMetrics = await gatherCodebaseStateMetrics({
    repoRoot: input.repoRoot,
    patternMatrixFindings: partitioned.ast[0],
    noGitHistory: input.noGitHistory === true,
    generatedAt,
    warnings,
  });

  // orchestrator-agent mediation: cluster raw
  // findings into architectural-scale candidate classes. PHASE 1
  // invocation (no dispositions) — surfaces clusters + summaries
  // for the operator to triage. The dispositions + line-level edits
  // happen later via `/dw-lifecycle:implement`'s autonomous loop.
  const mediationOutput = mediate({ findings: input.findings });
  const discoveredCandidates =
    mediationOutput.summaries.length > 0
      ? toManifestSection(mediationOutput.summaries)
      : null;

  const manifest: ScopeManifest = {
    kind,
    feature_slug: input.featureSlug,
    generated_by: 'strawman',
    generated_at: generatedAt,
    scenarios,
    reference_docs: referenceDocs,
    discovery_themes: themesList,
    ...(routes !== undefined ? { routes } : {}),
    ...(modules !== undefined ? { modules } : {}),
    ...(regimeHoldouts !== null ? { regime_holdouts: regimeHoldouts } : {}),
    ...(discoveredCandidates !== null
      ? { discovered_candidates: discoveredCandidates }
      : {}),
    ...(codebaseStateMetrics !== null
      ? { codebase_state_metrics: codebaseStateMetrics }
      : {}),
    notes:
      `Strawman synthesized from ${partitioned.agentsConsumed.length} discovery agent(s) ` +
      `(${partitioned.agentsConsumed.join(', ')}). Operator curates devices/scenarios/primitives.`,
  };

  const validator = await compileManifestValidator();
  const result = validateManifest(manifest, validator);
  if (!result.ok) {
    throw new Error(
      `synthesis produced a manifest that fails the manifest schema:\n  - ${result.errors.join('\n  - ')}`,
    );
  }

  return {
    manifest,
    metadata: {
      generatedAt,
      agentsConsumed: partitioned.agentsConsumed,
      dedupCount,
      findingsCount: input.findings.length,
      warnings,
    },
  };
}

interface GatherCodebaseStateMetricsArgs {
  readonly repoRoot: string | undefined;
  readonly patternMatrixFindings: AstGrepMatrixFindings | undefined;
  readonly noGitHistory: boolean;
  readonly generatedAt: string;
  readonly warnings: string[];
}

/**
 * Compute the codebase-state metrics section. Returns null when no
 * catalog files are present under .dw-lifecycle/scope-discovery/ (the
 * project hasn't authored a regime) — the synthesis layer omits the
 * section entirely in that case so the manifest stays clean for
 * pre-Loop adopters.
 *
 * Throws are caught + surfaced as warnings: the metrics are informa-
 * tional and shouldn't take down an otherwise-healthy synthesis run.
 */
async function gatherCodebaseStateMetrics(
  args: GatherCodebaseStateMetricsArgs,
): Promise<CodebaseStateMetrics | null> {
  if (args.repoRoot === undefined) return null;
  const configDir = resolve(args.repoRoot, '.dw-lifecycle/scope-discovery');
  if (!existsSync(configDir)) return null;
  try {
    const baseArgs = {
      repoRoot: args.repoRoot,
      noGitHistory: args.noGitHistory,
      generatedAt: args.generatedAt,
    };
    const gatheredInput = await gatherMetricsInput(
      args.patternMatrixFindings !== undefined
        ? { ...baseArgs, patternMatrixFindings: args.patternMatrixFindings }
        : baseArgs,
    );
    if (
      gatheredInput.entries.length === 0 &&
      !gatheredInput.gitAvailable
    ) {
      return null;
    }
    return computeCodebaseStateMetrics(gatheredInput);
  } catch (err) {
    args.warnings.push(
      `codebase-state-metrics: gather failed — ${errorMessage(err)}. ` +
        'Section omitted from manifest. This is informational; the rest of ' +
        'the manifest is valid.',
    );
    return null;
  }
}
