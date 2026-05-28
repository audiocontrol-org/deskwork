import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.types.js';
import type {
  WorkplanFeatureCounts,
  WorkplanTbdsReport,
} from './types.js';

export interface ScanWorkplanTbdsArgs {
  readonly projectRoot: string;
  readonly config: Config;
}

interface MarkerRule {
  readonly key: 'tbd' | 'defer' | 'follow_up' | 'out_of_scope';
  readonly pattern: RegExp;
}

// Regexes are case-insensitive. They match the marker form anywhere on the
// line; the [debt: #NNN] back-reference suppression happens before pattern
// dispatch so a single annotated line doesn't contribute to any bucket.
const MARKER_RULES: readonly MarkerRule[] = [
  { key: 'tbd', pattern: /\bTBD\b/i },
  { key: 'defer', pattern: /\bdefer\b/i },
  { key: 'follow_up', pattern: /\bfollow-up:/i },
  { key: 'out_of_scope', pattern: /\bout of scope\b/i },
];

// A line is treated as "already promoted" when it carries a [debt: #NNN]
// back-link. The check is intentionally simple — operators write the
// link by hand so any [debt: #<digits>] form matches.
const PROMOTED_RE = /\[debt:\s*#\d+\]/i;

function listInProgressVersions(projectRoot: string, cfg: Config): string[] {
  const docsRoot = join(projectRoot, cfg.docs.root);
  if (!existsSync(docsRoot)) return [];

  if (!cfg.docs.byVersion) {
    // Non-versioned layout: the in-progress dir is a direct child of docs/.
    const inProgress = join(docsRoot, cfg.docs.statusDirs.inProgress);
    return existsSync(inProgress) ? [''] : [];
  }

  // Versioned layout: every directory under docs/ that has the in-progress
  // stage dir is a version we walk. We also union with knownVersions so a
  // configured-but-empty version still resolves to its stage dir.
  const onDisk: string[] = [];
  for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const stageDir = join(docsRoot, entry.name, cfg.docs.statusDirs.inProgress);
    if (existsSync(stageDir)) onDisk.push(entry.name);
  }
  const known = cfg.docs.knownVersions.filter((v) =>
    existsSync(join(docsRoot, v, cfg.docs.statusDirs.inProgress)),
  );
  return Array.from(new Set([...onDisk, ...known])).sort();
}

function listFeatureSlugs(stageDir: string): string[] {
  if (!existsSync(stageDir)) return [];
  return readdirSync(stageDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function countMarkers(content: string): WorkplanFeatureCounts['counts'] {
  let tbd = 0;
  let defer = 0;
  let follow_up = 0;
  let out_of_scope = 0;

  for (const line of content.split('\n')) {
    if (PROMOTED_RE.test(line)) continue;
    for (const rule of MARKER_RULES) {
      if (rule.pattern.test(line)) {
        switch (rule.key) {
          case 'tbd':
            tbd += 1;
            break;
          case 'defer':
            defer += 1;
            break;
          case 'follow_up':
            follow_up += 1;
            break;
          case 'out_of_scope':
            out_of_scope += 1;
            break;
        }
      }
    }
  }
  return {
    tbd,
    defer,
    follow_up,
    out_of_scope,
    total: tbd + defer + follow_up + out_of_scope,
  };
}

export function scanWorkplanTbds(args: ScanWorkplanTbdsArgs): WorkplanTbdsReport {
  const { projectRoot, config } = args;
  const docsRoot = join(projectRoot, config.docs.root);
  const features: WorkplanFeatureCounts[] = [];
  let total = 0;

  for (const version of listInProgressVersions(projectRoot, config)) {
    const stageDir =
      config.docs.byVersion && version !== ''
        ? join(docsRoot, version, config.docs.statusDirs.inProgress)
        : join(docsRoot, config.docs.statusDirs.inProgress);
    for (const slug of listFeatureSlugs(stageDir)) {
      const workplanPath = join(stageDir, slug, 'workplan.md');
      if (!existsSync(workplanPath)) continue;
      const content = readFileSync(workplanPath, 'utf8');
      const counts = countMarkers(content);
      features.push({
        slug,
        target_version: version || config.docs.defaultTargetVersion,
        path: workplanPath,
        counts,
      });
      total += counts.total;
    }
  }

  return { total, features };
}
