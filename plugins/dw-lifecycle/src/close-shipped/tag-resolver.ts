// Default-tag resolver for /dw-lifecycle:close-shipped.
//
// The skill defaults `--to-tag` to the most recent `v*` tag (semver
// ordering, NOT git-creatordate ordering -- a hand-edited tag could be
// re-pointed and still report as "most recent" by date even when it
// represents an older version). Defaults `--from-tag` to the second-most
// recent `v*` tag. Both tags must exist locally for the apply step to
// run; if no `v*` tags exist, the resolver throws and the operator must
// pass `--from-tag` / `--to-tag` explicitly.

import type { RunGit } from './types.js';

export class TagResolutionError extends Error {
  override name = 'TagResolutionError';
}

interface ParsedSemver {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string;
}

// Accepts `v<major>.<minor>.<patch>` with an optional `-<prerelease>`
// suffix. Trailing build metadata (`+abc123`) is tolerated and ignored
// for ordering.
const SEMVER_PATTERN = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseSemver(tag: string): ParsedSemver | null {
  const m = SEMVER_PATTERN.exec(tag);
  if (!m) return null;
  const major = Number.parseInt(m[1] ?? '', 10);
  const minor = Number.parseInt(m[2] ?? '', 10);
  const patch = Number.parseInt(m[3] ?? '', 10);
  const prerelease = m[4] ?? '';
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  return { raw: tag, major, minor, patch, prerelease };
}

// Semver ordering: releases > prereleases at the same major.minor.patch.
// Within prereleases, lexicographic compare of the prerelease segment is
// "good enough" for the resolver's purpose -- the operator can always
// override via --from-tag / --to-tag if a project's prerelease scheme
// breaks this ordering.
function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === '' && b.prerelease === '') return 0;
  if (a.prerelease === '') return 1;
  if (b.prerelease === '') return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export interface ListTagsArgs {
  readonly runGit: RunGit;
}

/**
 * Return every `v*` tag in the local repo, parsed + sorted ASCENDING by
 * semver. Caller picks the head (most recent) and the head-1 (previous).
 */
export function listSemverTags(args: ListTagsArgs): readonly ParsedSemver[] {
  let raw: string;
  try {
    raw = args.runGit(['tag', '--list', 'v*']);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TagResolutionError(`git tag --list v* failed: ${msg}`);
  }
  const lines = raw.split('\n').map((s) => s.trim()).filter((s) => s !== '');
  const parsed: ParsedSemver[] = [];
  for (const line of lines) {
    const p = parseSemver(line);
    if (p !== null) parsed.push(p);
  }
  parsed.sort(compareSemver);
  return parsed;
}

export interface ResolveDefaultsArgs {
  readonly runGit: RunGit;
  readonly fromTagOverride: string | null;
  readonly toTagOverride: string | null;
}

export interface ResolvedTags {
  readonly fromTag: string;
  readonly toTag: string;
  // True when either side fell back to a semver-resolved default. The
  // subcommand layer surfaces this in the operator output so the
  // defaulted value is visible.
  readonly fromTagDefaulted: boolean;
  readonly toTagDefaulted: boolean;
}

/**
 * Resolve the (fromTag, toTag) pair, honoring operator overrides. When
 * an override is supplied for one side, it is used verbatim and only
 * the other side falls back to the semver-list default. When neither
 * override is supplied, both sides come from the semver list.
 *
 * Throws TagResolutionError when a needed default cannot be resolved
 * (no `v*` tags, or only one `v*` tag and the operator did not supply
 * a from-tag override).
 */
export function resolveDefaults(args: ResolveDefaultsArgs): ResolvedTags {
  const { runGit, fromTagOverride, toTagOverride } = args;
  const fromTagSet = fromTagOverride !== null;
  const toTagSet = toTagOverride !== null;
  if (fromTagSet && toTagSet) {
    return {
      fromTag: fromTagOverride,
      toTag: toTagOverride,
      fromTagDefaulted: false,
      toTagDefaulted: false,
    };
  }
  const tags = listSemverTags({ runGit });
  if (tags.length === 0) {
    throw new TagResolutionError(
      'No `v*` tags found in the local repo. Pass --from-tag and --to-tag explicitly.',
    );
  }
  const head = tags[tags.length - 1];
  if (head === undefined) {
    throw new TagResolutionError(
      'Tag-list resolution returned an empty result. Pass --from-tag and --to-tag explicitly.',
    );
  }
  const toTag = toTagSet ? toTagOverride : head.raw;
  if (fromTagSet) {
    return {
      fromTag: fromTagOverride,
      toTag,
      fromTagDefaulted: false,
      toTagDefaulted: !toTagSet,
    };
  }
  // If the operator overrode --to-tag, default --from-tag to the most
  // recent semver tag STRICTLY LESS than the override. Otherwise default
  // --from-tag to the second-most recent overall.
  if (toTagSet) {
    const overrideParsed = parseSemver(toTagOverride);
    let prev: ParsedSemver | undefined;
    for (const tag of tags) {
      if (overrideParsed !== null && compareSemver(tag, overrideParsed) >= 0) {
        break;
      }
      prev = tag;
    }
    if (prev === undefined) {
      throw new TagResolutionError(
        `No previous release tag found before --to-tag ${toTagOverride}. Pass --from-tag explicitly.`,
      );
    }
    return {
      fromTag: prev.raw,
      toTag: toTagOverride,
      fromTagDefaulted: true,
      toTagDefaulted: false,
    };
  }
  if (tags.length < 2) {
    throw new TagResolutionError(
      `Only one \`v*\` tag found (${head.raw}). Pass --from-tag explicitly so the commit range is well-defined.`,
    );
  }
  const prev = tags[tags.length - 2];
  if (prev === undefined) {
    throw new TagResolutionError(
      'Tag-list resolution returned a malformed result. Pass --from-tag and --to-tag explicitly.',
    );
  }
  return {
    fromTag: prev.raw,
    toTag,
    fromTagDefaulted: true,
    toTagDefaulted: !toTagSet,
  };
}

/**
 * Assert both tags exist in the local repo. Surfaces a clear error per
 * missing tag so the subcommand layer can map to exit code 2.
 */
export function assertTagsExist(
  fromTag: string,
  toTag: string,
  runGit: RunGit,
): void {
  for (const tag of [fromTag, toTag]) {
    try {
      runGit(['rev-parse', '--verify', `refs/tags/${tag}`]);
    } catch {
      throw new TagResolutionError(
        `Tag does not exist locally: ${tag}. Pass --from-tag / --to-tag with a valid tag name, or fetch tags from origin first (git fetch --tags).`,
      );
    }
  }
}
