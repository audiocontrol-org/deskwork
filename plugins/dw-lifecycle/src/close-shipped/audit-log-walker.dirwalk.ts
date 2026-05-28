// Shared directory-walk helpers used by the audit-log walker, the
// tooling-feedback walker, and the workplan-checkbox walker. Kept in
// its own module so all three sources stay textually independent while
// sharing one definition of "where do feature slug-dirs live."

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.types.js';

export interface ListSlugDirsArgs {
  readonly projectRoot: string;
  readonly config: Config;
}

function listInProgressDirs(args: ListSlugDirsArgs): readonly string[] {
  const { projectRoot, config } = args;
  const docsRoot = join(projectRoot, config.docs.root);
  if (!existsSync(docsRoot)) return [];
  const inProgress = config.docs.statusDirs.inProgress;
  const versions: string[] = [];
  if (config.docs.byVersion) {
    for (const known of config.docs.knownVersions) {
      const versioned = join(docsRoot, known, inProgress);
      if (existsSync(versioned)) versions.push(versioned);
    }
    let entries: readonly string[] = [];
    try {
      entries = readdirSync(docsRoot);
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const versioned = join(docsRoot, entry, inProgress);
      try {
        if (
          statSync(versioned).isDirectory() &&
          !versions.includes(versioned)
        ) {
          versions.push(versioned);
        }
      } catch {
        // ignore
      }
    }
  } else {
    const flat = join(docsRoot, inProgress);
    if (existsSync(flat)) versions.push(flat);
  }
  return versions;
}

function listFeatureSlugDirs(inProgressDir: string): readonly string[] {
  let entries: readonly string[] = [];
  try {
    entries = readdirSync(inProgressDir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(inProgressDir, entry);
    try {
      if (statSync(path).isDirectory()) out.push(path);
    } catch {
      // ignore
    }
  }
  return out;
}

export function listAllFeatureSlugDirs(
  args: ListSlugDirsArgs,
): readonly string[] {
  const out: string[] = [];
  for (const ipDir of listInProgressDirs(args)) {
    for (const slugDir of listFeatureSlugDirs(ipDir)) {
      out.push(slugDir);
    }
  }
  return out;
}

export const __dirWalk = {
  listInProgressDirs,
  listFeatureSlugDirs,
  listAllFeatureSlugDirs,
} as const;
