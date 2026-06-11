/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/clone-detector-reader.ts
 *
 * Discovery Agent 3 — clone-detector output reader.
 *
 * What it does: reads the committed `.stack-control/scope-discovery/clones.yaml`
 * baseline (the Phase 1 output), filters the clone groups whose member
 * files fall within the feature's scope, and emits structured
 * CloneDetectorFindings JSON.
 *
 * Filter heuristic (v1):
 *   - If `modulesInScopeForFeature(input)` returns a strict subset of
 *     all modules (i.e., the PRD names specific modules), filter the
 *     clone groups so every reported group has at least one member
 *     under one of those modules.
 *   - Otherwise (system-wide default), report ALL groups unfiltered.
 *
 * Tighter PRD-driven filtering (e.g., reading a "Modules Affected"
 * section explicitly) is a v2 enhancement.
 *
 * Does NOT re-run jscpd — that's the role of
 * `plugins/stack-control/src/scope-discovery/clone-detector.ts`. This
 * agent only READS the dispositioned baseline, which is the operator's
 * curated record of what the project knows about its own duplication
 * backlog.
 *
 * CLI:
 *   tsx plugins/stack-control/src/scope-discovery/discovery-agents/clone-detector-reader.ts \
 *     --feature <slug> --prd-path <path> [--repo-root <path>] [--module-root <path>]
 */

import { resolve } from 'node:path';
import { DEFAULT_BASELINE_REL } from '../baseline-path.js';
import { parseClonesYaml, type CloneGroup } from '../clones-yaml.js';
import type {
  CloneDetectorFindings,
  CloneGroupFinding,
  DiscoveryAgentInput,
} from './types.js';
import {
  listModules,
  modulesInScopeForFeature,
  readUtf8,
  runIfMain,
} from './shared.js';
import { errorMessage, isEnoent } from '../util/typeguards.js';

// Baseline rel-path is the SHARED constant from baseline-path.ts — the
// same derivation check-clones resolves through (specs/installation-
// isolation US1; research row 3: this reader's private literal was the
// split-brain sibling). `input.repoRoot` carries the verb-entry-resolved
// installation root (R1), so `resolve(input.repoRoot, DEFAULT_BASELINE_REL)`
// and check-clones' `resolveBaselinePath` agree by construction.

interface ScopeFilter {
  readonly applied: 'none' | 'modules-in-scope';
  readonly modulesInScope: ReadonlyArray<string>;
  readonly memberPathPrefixes: ReadonlyArray<string>;
}

/**
 * Decide whether to filter clone groups by feature scope, and if so
 * which path prefixes count as in-scope. When the feature is system-
 * wide (PRD names no specific module), we apply no filter.
 */
async function deriveScopeFilter(
  input: DiscoveryAgentInput,
): Promise<ScopeFilter> {
  const inScope = await modulesInScopeForFeature(input);
  const allModules = await listModules(input);
  // Heuristic: if the set returned by modulesInScopeForFeature is
  // strictly smaller than the full module set, the PRD named specific
  // modules; otherwise the default is system-wide.
  //
  // Special case: when allModules is empty (single-package projects),
  // modulesInScopeForFeature returns ['.']; system-wide applies.
  const systemWide =
    allModules.length === 0 ||
    inScope.length === 0 ||
    inScope.length === allModules.length;
  if (systemWide) {
    return {
      applied: 'none',
      modulesInScope: allModules.length > 0 ? allModules : inScope,
      memberPathPrefixes: [],
    };
  }
  return {
    applied: 'modules-in-scope',
    modulesInScope: inScope,
    memberPathPrefixes: inScope.map((m) => `${input.moduleRoot}/${m}/`),
  };
}

/** Extract the path portion from a "path:start:end" member string. */
function memberPath(member: string): string {
  // The member is "<path>:<startLine>:<endLine>". Path may contain
  // colons in pathological cases (it shouldn't, but be defensive).
  // Split from the right: drop the trailing two numeric components.
  const parts = member.split(':');
  if (parts.length < 3) return member;
  return parts.slice(0, parts.length - 2).join(':');
}

function groupMatchesScope(
  group: CloneGroup,
  filter: ScopeFilter,
): boolean {
  if (filter.applied === 'none') return true;
  for (const member of group.members) {
    const path = memberPath(member);
    for (const prefix of filter.memberPathPrefixes) {
      if (path.startsWith(prefix)) return true;
    }
  }
  return false;
}

function toFinding(group: CloneGroup): CloneGroupFinding {
  return {
    id: group.id,
    members: group.members,
    lines: group.lines,
    disposition: group.disposition,
  };
}

/**
 * Public agent entrypoint. Imported by the synthesis layer + the
 * `scope-inventory` subcommand.
 */
export async function readCloneDetectorOutput(
  input: DiscoveryAgentInput,
): Promise<CloneDetectorFindings> {
  const baselinePath = DEFAULT_BASELINE_REL;
  const baselineAbs = resolve(input.repoRoot, baselinePath);
  let yamlText: string;
  try {
    yamlText = await readUtf8(baselineAbs);
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(
        `clone-detector baseline missing at ${baselineAbs}; ` +
          `run \`stackctl check-clones --refresh-baseline\` to generate it`,
      );
    }
    throw err;
  }
  const parsed = parseClonesYaml(yamlText);
  if (parsed === null) {
    throw new Error(
      `clone-detector baseline at ${baselineAbs} did not parse as a clones.yaml document; ` +
        `the file may be malformed — see plugins/stack-control/src/scope-discovery/clones-yaml.ts for the contract`,
    );
  }
  const filter = await deriveScopeFilter(input);
  const filtered: CloneGroupFinding[] = [];
  for (const group of parsed.clones) {
    if (groupMatchesScope(group, filter)) filtered.push(toFinding(group));
  }
  return {
    agent: 'clone-detector-reader',
    featureSlug: input.featureSlug,
    baselinePath,
    filterApplied: filter.applied,
    modulesInScope: filter.modulesInScope,
    clones: filtered,
  };
}

runIfMain({
  importMetaUrl: import.meta.url,
  agentName: 'clone-detector-reader',
  run: async (input) => {
    try {
      return await readCloneDetectorOutput(input);
    } catch (err) {
      throw new Error(`clone-detector-reader failed: ${errorMessage(err)}`);
    }
  },
});
