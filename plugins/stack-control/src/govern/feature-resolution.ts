// Item-driven feature resolution for govern (024 US4 / FR-011). A gate cannot
// enforce a step that cannot run: on the long-lived, session-pinned branch
// (`feature/stack-control`) the branch slug is NOT a feature slug, so deriving the
// feature from the branch FATALs "feature not found" for every spec on the branch.
// This resolver prefers an existing feature root — explicit, then branch-derived
// (when it resolves), then the CLAUDE.md SPECKIT marker — and fails loud when none
// resolves (Principle V — no silent slug fallback). Kept in its own module so
// govern.ts / protocol.ts do not grow further past the line cap (finding C1).

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { Installation } from '../config/types.js';
import { loadRoadmap } from '../roadmap/roadmap-model.js';
import { grammarOptsForRoot } from '../subcommands/document-verb-shared.js';
import { resolveIdentityFromSpecDir } from '../workflow/identity.js';
import { GovernProtocolError } from './protocol.js';

export interface ResolveFeatureSlugArgs {
  /** An explicit `--feature` / GOVERN_FEATURE_SLUG override; wins when non-empty. */
  readonly explicit?: string | undefined;
  /** The current git branch (a `feature/<slug>` branch yields a candidate slug). */
  readonly branch?: string | undefined;
  /** The active feature slug named by the CLAUDE.md SPECKIT marker, or null. */
  readonly markerSlug?: string | null;
  /** Reports whether a candidate slug has an existing feature root (spec dir). */
  readonly featureRootExists?: (slug: string) => boolean;
}

/** Derive a `feature/<slug>` branch's slug, or null when the branch is not feature-shaped. */
export function branchDerivedSlug(branch: string | undefined): string | null {
  const b = branch ?? '';
  if (!b.startsWith('feature/')) return null;
  const slug = b.slice('feature/'.length);
  return slug.length > 0 ? slug : null;
}

/**
 * The active feature slug named by Spec Kit's OWN pointer (`.specify/feature.json`
 * `feature_directory`) — the basename of the feature dir (FR-011 marker source).
 * Reading the tool's pointer rather than inventing a parallel "active feature"
 * notion keeps faith with Principle VIII. Null when absent/unreadable.
 */
export function readActiveFeatureSlug(repoRoot: string): string | null {
  const pointer = join(repoRoot, '.specify', 'feature.json');
  if (!existsSync(pointer)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(pointer, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
      const dir = (parsed as Record<string, unknown>)['feature_directory'];
      if (typeof dir === 'string' && dir.length > 0) return basename(dir);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve the feature slug for a govern run (FR-011). Order of preference:
 * explicit override → branch-derived slug whose feature root exists → SPECKIT
 * marker slug whose feature root exists → fail loud. When no `featureRootExists`
 * predicate is supplied (legacy callers), the branch slug is returned as-is
 * (preserving the pre-024 contract) or the resolution fails loud.
 */
export function resolveFeatureSlug(args: ResolveFeatureSlugArgs): string {
  if (args.explicit !== undefined && args.explicit.length > 0) return args.explicit;
  if (args.explicit !== undefined && args.explicit.length === 0) {
    throw new GovernProtocolError(
      'govern: FATAL — feature slug resolved to empty; set --feature/GOVERN_FEATURE_SLUG explicitly.',
    );
  }

  const fromBranch = branchDerivedSlug(args.branch);
  const exists = args.featureRootExists;

  if (exists === undefined) {
    if (fromBranch !== null) return fromBranch;
    throw new GovernProtocolError(
      `govern: FATAL — cannot derive a feature slug from branch '${args.branch ?? ''}'. ` +
        'Set --feature/GOVERN_FEATURE_SLUG, or run from a feature/<slug> branch.',
    );
  }

  if (fromBranch !== null && exists(fromBranch)) return fromBranch;
  if (args.markerSlug != null && args.markerSlug.length > 0 && exists(args.markerSlug)) {
    return args.markerSlug;
  }

  throw new GovernProtocolError(
    `govern: FATAL — no feature resolved (branch '${args.branch ?? ''}' slug ` +
      `'${fromBranch ?? '(none)'}', SPECKIT marker '${args.markerSlug ?? '(none)'}'). ` +
      'Set --feature/GOVERN_FEATURE_SLUG, or ensure the active spec dir exists.',
  );
}

/**
 * 024 FR-013 / TASK-139: the canonical convergence-record key for a governed
 * feature — the roadmap NODE ID resolved from the governed spec dir, so it matches
 * the workflow read-side (`convergenceKeyFor(item) === item.identifier`).
 *
 * FAIL LOUD, never key by a divergent fallback shape (AUDIT-BARRAGE codex-02 HIGH +
 * claude-04, cross-family agreement): the read side keys UNCONDITIONALLY by the node
 * id, so writing under any other key (the relative spec dir, etc.) silently diverges
 * — govern would report success while the `governing → shipped` gate, reading the
 * node-id key, stays closed. An unreadable roadmap is NOT a safe condition for
 * inventing a second key (Principle V); a readable roadmap with no matching node is
 * an orphan/legacy feature that must be surfaced, not papered over. Both raise; the
 * govern caller leaves the gate CLOSED (fail-safe) on the throw.
 */
export function resolveConvergenceItem(
  installation: Installation,
  featureRoot: string | undefined,
  slug: string,
): string {
  if (featureRoot === undefined) return slug;
  // Let a roadmap load error propagate — fail loud, no silent fallback key.
  const model = loadRoadmap(installation.resolved.roadmap, grammarOptsForRoot(installation.root));
  const id = resolveIdentityFromSpecDir(model, featureRoot);
  if (id !== null) return id.nodeId;
  throw new GovernProtocolError(
    `govern-convergence: no roadmap node references the governed feature dir ` +
      `'${relative(installation.root, featureRoot)}' — cannot key the convergence record by ` +
      `canonical identity (orphan/legacy feature; capture it on the roadmap first). The read ` +
      `side keys by node id, so a fallback key would silently leave the gate closed.`,
  );
}
