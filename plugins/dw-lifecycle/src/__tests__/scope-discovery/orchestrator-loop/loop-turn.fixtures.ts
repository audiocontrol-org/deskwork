/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-loop/loop-turn.fixtures.ts
 *
 * Shared synthetic-input builders for the loop-turn end-to-end tests.
 * Co-located with the test files; not part of the production module.
 */

import type {
  AstGrepMatrixFindings,
  PatternFinding,
} from '../../../scope-discovery/discovery-agents/types.js';
import type { CodebaseStateMetrics } from '../../../scope-discovery/discovery-agents/codebase-state-metrics-types.js';
import type {
  AuditorInput,
  JudgeInput,
} from '../../../scope-discovery/llm/types.js';

/**
 * Build a canned judge sub-agent response with PROPOSAL blocks + a
 * trailing dispatch-grammar block. The wrap() function requires the
 * grammar block; this helper bakes it in. Matches the format from
 * `llm/judge.ts`'s `parseJudgeProposals` parser.
 */
export function judgeResponse(args: {
  proposals: ReadonlyArray<{
    candidateId: string;
    status: string;
    confidence: string;
    reasoning: string;
  }>;
}): string {
  const proposalBlocks = args.proposals
    .map(
      (p) =>
        `PROPOSAL: ${p.candidateId}\n` +
        `  status: ${p.status}\n` +
        `  confidence: ${p.confidence}\n` +
        `  reasoning: ${p.reasoning}`,
    )
    .join('\n\n');
  const included = args.proposals
    .map((_p, i) => `scope-manifest.yaml:${i + 1}`)
    .join(', ');
  return [
    proposalBlocks,
    '',
    `Searched: candidates — ${args.proposals.length} matches`,
    `Included: ${included.length === 0 ? 'scope-manifest.yaml:1' : included}`,
    'Excluded: ',
  ].join('\n');
}

/**
 * Realistic-shape codebase-state metrics block for the loop-turn
 * tests. Each sub-metric carries one or two synthetic entries so the
 * MetricsSnapshot projection has data to average / sum.
 */
export function fakeMetrics(generatedAt: string): CodebaseStateMetrics {
  return {
    generated_at: generatedAt,
    classification_completeness: {
      catalogued_distinct_shapes: 8,
      pending_distinct_shapes: 2,
      uncatalogued_candidates: 0,
      total_distinct_shapes: 10,
      ratio: 0.8,
    },
    coverage_per_blessed_pattern: [
      {
        entry_id: 'cov-1',
        catalog: 'anti-patterns',
        match_glob: 'src/**/*.tsx',
        files_matching_glob: 20,
        files_with_primitive: 14,
        ratio: 0.7,
      },
    ],
    violation_density_per_cursed_pattern: [
      {
        entry_id: 'viol-1',
        catalog: 'anti-patterns',
        total_hits: 50,
        per_directory_hits: [{ directory: 'src/foo', hit_count: 50 }],
        concentration: 1,
      },
    ],
    surface_uniformity: [
      {
        directory: 'src/foo',
        population: 5,
        outlier_count: 0,
        variance: 0.2,
      },
    ],
    catalog_stability: {
      git_available: true,
      lookback_commits: 20,
      commits_with_edits: 3,
      total_catalog_edits: 5,
      edits_per_commit_avg: 0.25,
      trend: 'stable',
    },
    discovered_candidate_rate: {
      pending_entries_total: 2,
      unattributed_pending: 0,
      by_scan_run: [],
      trend: null,
    },
    disposition_latency: {
      transitioned_count: 0,
      median_latency_ms: null,
      p90_latency_ms: null,
      slowest_five: [],
    },
  };
}

/** Empty judge input with featureSlug=test + zeroed catalog summary. */
export function emptyJudgeInput(): JudgeInput {
  return {
    featureSlug: 'test',
    recentWork: {},
    openCandidates: [],
    catalogState: {
      statusCounts: {
        pending: 0,
        blessed: 0,
        cursed: 0,
        ignore: 0,
        'tracked-holdout': 0,
        withdrawn: 0,
      },
      totalEntries: 0,
    },
  };
}

/** Empty auditor input mirroring the judge input shape. */
export function emptyAuditorInput(): AuditorInput {
  return {
    featureSlug: 'test',
    recentWork: {},
    judgeProposals: [],
    catalogState: {
      statusCounts: {
        pending: 0,
        blessed: 0,
        cursed: 0,
        ignore: 0,
        'tracked-holdout': 0,
        withdrawn: 0,
      },
      totalEntries: 0,
    },
  };
}

/** Build an ast-grep-matrix finding shape with one pattern + N file hits. */
export function makePatternFinding(
  patternId: string,
  description: string,
  regex: string,
  files: ReadonlyArray<string>,
): AstGrepMatrixFindings {
  const pattern: PatternFinding = {
    id: patternId,
    description,
    regex,
    hits: files.map((f, i) => ({
      file: f,
      line: i + 1,
      snippet: `// match in ${f}`,
    })),
  };
  return {
    agent: 'ast-grep-matrix',
    featureSlug: 'test',
    patterns: [pattern],
  };
}
