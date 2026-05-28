import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// The three built-in bucket query templates. `$DATE_NNd_AGO` is a placeholder
// substituted at proposal time with an ISO date computed against the caller-
// supplied `now`. The substitution makes the query deterministic for tests
// and prevents the query from drifting between propose and any audit.
const BUILT_IN_BUCKETS: Record<string, string> = {
  'stale-30d': 'state:open updated:<$DATE_30d_AGO',
  unlabeled: 'state:open no:label',
  // Open issues labeled `bug`, with zero comments, opened more than 7 days
  // ago. The comment-age threshold catches bugs that languished without
  // even an acknowledgement reply.
  'bug-no-comment-7d': 'state:open label:bug comments:0 created:<$DATE_7d_AGO',
};

const BUILT_IN_NAMES = Object.keys(BUILT_IN_BUCKETS).join(', ');

export interface BucketRegistry {
  // Map of bucket name → query template (pre-substitution). The registry
  // merges built-ins with any overrides from .dw-lifecycle/triage-buckets.yaml;
  // overrides win on name collision.
  readonly templates: Record<string, string>;
  // True when the project supplied an override file. Surfaced in the
  // proposal-file header so the audit trail records whether a custom
  // catalog was used.
  readonly hasProjectOverride: boolean;
}

export function loadBucketRegistry(projectRoot: string): BucketRegistry {
  const overridePath = join(
    projectRoot,
    '.dw-lifecycle',
    'triage-buckets.yaml',
  );
  if (!existsSync(overridePath)) {
    return { templates: { ...BUILT_IN_BUCKETS }, hasProjectOverride: false };
  }
  const raw = readFileSync(overridePath, 'utf8');
  const parsed = parseYaml(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Could not parse ${overridePath}: expected a YAML mapping of bucket-name to query-string.`,
    );
  }
  const overrides = parsed as Record<string, unknown>;
  const merged: Record<string, string> = { ...BUILT_IN_BUCKETS };
  for (const [name, query] of Object.entries(overrides)) {
    if (typeof query !== 'string' || query.trim() === '') {
      throw new Error(
        `Bucket '${name}' in ${overridePath} must be a non-empty query string.`,
      );
    }
    merged[name] = query;
  }
  return { templates: merged, hasProjectOverride: true };
}

// Substitute `$DATE_NNd_AGO` placeholders against the supplied `now` date.
// `now` is injected so tests are deterministic. Returns the gh-search-ready
// query string.
export function resolveQuery(template: string, now: Date): string {
  return template.replace(/\$DATE_(\d+)d_AGO/g, (_match, days: string) => {
    const n = Number.parseInt(days, 10);
    const targetMs = now.getTime() - n * 86400_000;
    const target = new Date(targetMs);
    // gh search uses YYYY-MM-DD; trim to date portion.
    return target.toISOString().slice(0, 10);
  });
}

export interface ResolveBucketArgs {
  readonly bucket: string;
  readonly projectRoot: string;
  readonly now: Date;
}

export interface ResolvedBucket {
  readonly name: string;
  readonly query: string;
  readonly hasProjectOverride: boolean;
}

export function resolveBucket(args: ResolveBucketArgs): ResolvedBucket {
  const registry = loadBucketRegistry(args.projectRoot);
  const template = registry.templates[args.bucket];
  if (template === undefined) {
    throw new Error(
      `Unknown bucket: ${args.bucket}. Built-in buckets: ${BUILT_IN_NAMES}. Override defaults at .dw-lifecycle/triage-buckets.yaml.`,
    );
  }
  return {
    name: args.bucket,
    query: resolveQuery(template, args.now),
    hasProjectOverride: registry.hasProjectOverride,
  };
}

export function builtInBucketNames(): readonly string[] {
  return Object.keys(BUILT_IN_BUCKETS);
}
