/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/adopter-manifest-checker.ts
 *
 * Discovery Agent 6 — Adopter-manifest checker (Phase 4 Family C
 * integration).
 *
 * Thin wrapper around the Phase 2-ported `check-adopters.ts::scan()`
 * library API. Reshapes its `ScanResult` into a
 * `DiscoveryAgentFinding`-typed `AdopterManifestCheckerFindings`
 * payload so the fleet's fan-out can collect it alongside the other
 * agents' outputs.
 *
 * # Activation
 *
 * The orchestrating `scope-inventory` subcommand only runs this
 * wrapper when `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`
 * exists. Standalone CLI runs (`dw-lifecycle check-adopters`) keep
 * their own gracious-empty-registry behavior.
 *
 * # Manifest routing
 *
 * This agent's findings flow into the same manifest section as the
 * regime-holdout-detector's adopter sub-pass
 * (`regime_holdouts.adopter_manifests[]`). Synthesis-derive-regime
 * dedupes by `(file, id)` so running both agents on the same
 * registry doesn't double-count entries.
 *
 * # Why a separate agent
 *
 * The fleet wants one fan-out slot per "thing the operator can ask
 * for independently." Adopter-manifest checking is a first-class
 * concern (Phase 2 already ships a `check-adopters` CLI); surfacing
 * it as its own fleet slot mirrors the standalone CLI's contract
 * and produces a per-agent JSON in the evidence trail keyed
 * `adopter-manifest-checker.json`.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scan as scanAdopters, type ScanResult } from '../check-adopters.js';
import type {
  AdopterManifestCheckerFinding,
  AdopterManifestCheckerFindings,
  DiscoveryAgentInput,
} from './types.js';

/**
 * Default registry path used by the standalone CLI (Family C from
 * Phase 2) AND this fleet wrapper. Per Finding 03 of the branch audit
 * log, project-owned scope-discovery config lives under
 * `.dw-lifecycle/scope-discovery/`.
 */
const ADOPTER_MANIFESTS_REGISTRY = '.dw-lifecycle/scope-discovery/adopter-manifests.yaml';

/**
 * Public agent entrypoint. Reads the adopter-manifests registry,
 * walks the source tree, and reshapes the per-manifest scan results
 * into the discriminated-union finding shape the synthesis layer
 * routes to `regime_holdouts.adopter_manifests[]`.
 *
 * Like the other Phase 3+ agents, this throws on infra failures (no
 * silent fallback) so the orchestrator surfaces real problems.
 */
export async function checkAdopterManifests(
  input: DiscoveryAgentInput,
): Promise<AdopterManifestCheckerFindings> {
  const registryPath = resolve(input.repoRoot, ADOPTER_MANIFESTS_REGISTRY);
  // The orchestrator already gates this agent on `existsSync` of the
  // same path, but mirror the check here so the agent is safe to call
  // standalone (mirrors the pilot's "empty registry == 0 findings"
  // contract without rewriting the upstream scanner's throw-on-ENOENT
  // behavior).
  if (!existsSync(registryPath)) {
    return {
      agent: 'adopter-manifest-checker',
      featureSlug: input.featureSlug,
      registryPath: ADOPTER_MANIFESTS_REGISTRY,
      findings: [],
      meta: { entriesScanned: 0, filesVisited: 0, holdoutCount: 0 },
    };
  }
  const result: ScanResult = await scanAdopters({
    registryPath,
    scanRoot: input.repoRoot,
    quiet: true,
    json: true,
  });
  const findings: AdopterManifestCheckerFinding[] = [];
  for (const manifest of result.manifests) {
    const primary = manifest.entry.from[0] ?? '';
    const summary = oneLine(manifest.entry.message);
    for (const holdout of manifest.holdouts) {
      findings.push({
        manifestId: manifest.entry.id,
        canonicalImport: primary,
        file: holdout,
        replacementSummary: summary,
      });
    }
  }
  // Stable ordering for deterministic JSON output across runs.
  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.manifestId < b.manifestId ? -1 : a.manifestId > b.manifestId ? 1 : 0;
  });
  return {
    agent: 'adopter-manifest-checker',
    featureSlug: input.featureSlug,
    registryPath: ADOPTER_MANIFESTS_REGISTRY,
    findings,
    meta: {
      entriesScanned: result.entriesScanned,
      filesVisited: result.filesVisited,
      holdoutCount: findings.length,
    },
  };
}

function oneLine(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}
