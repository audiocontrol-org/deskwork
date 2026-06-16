// Item-driven feature resolution for govern (024 US4 / FR-011). A gate cannot
// enforce a step that cannot run: on the long-lived, session-pinned branch
// (`feature/stack-control`) the branch slug is NOT a feature slug, so deriving the
// feature from the branch FATALs "feature not found" for every spec on the branch.
// This resolver prefers an existing feature root — explicit, then branch-derived
// (when it resolves), then the CLAUDE.md SPECKIT marker — and fails loud when none
// resolves (Principle V — no silent slug fallback). Kept in its own module so
// govern.ts / protocol.ts do not grow further past the line cap (finding C1).

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
