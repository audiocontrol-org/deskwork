import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.types.js';
import type {
  WorkplanFeatureCounts,
  WorkplanMarkerKey,
  WorkplanMarkerSample,
  WorkplanTbdsReport,
} from './types.js';

export interface ScanWorkplanTbdsArgs {
  readonly projectRoot: string;
  readonly config: Config;
}

// Sample cap: prevents a runaway workplan from bloating the JSON report.
// The count fields remain authoritative — only the per-line sample list
// is truncated.
const MAX_SAMPLES_PER_FEATURE = 20;

// Text excerpt cap: keeps each sample's `text` field short enough that the
// JSON payload stays scan-friendly even at 20 samples per feature.
const SAMPLE_TEXT_MAX_LENGTH = 200;

interface MarkerRule {
  readonly key: WorkplanMarkerKey;
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

interface MarkerScanResult {
  readonly counts: WorkplanFeatureCounts['counts'];
  readonly samples: readonly WorkplanMarkerSample[];
}

function excerpt(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > SAMPLE_TEXT_MAX_LENGTH
    ? trimmed.slice(0, SAMPLE_TEXT_MAX_LENGTH)
    : trimmed;
}

function scanMarkers(content: string): MarkerScanResult {
  let tbd = 0;
  let defer = 0;
  let follow_up = 0;
  let out_of_scope = 0;
  const samples: WorkplanMarkerSample[] = [];

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
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
        if (samples.length < MAX_SAMPLES_PER_FEATURE) {
          samples.push({
            lineNumber: i + 1,
            markerKey: rule.key,
            text: excerpt(line),
          });
        }
      }
    }
  }
  return {
    counts: {
      tbd,
      defer,
      follow_up,
      out_of_scope,
      total: tbd + defer + follow_up + out_of_scope,
    },
    samples,
  };
}

// Single-file scanner used by Phase 3 (/dw-lifecycle:promote-deferrals).
// Runs the SAME marker parser logic as the full-tree walk, but against a
// caller-supplied file path. Returns the per-marker counts + sample list
// (with line numbers) so the promote-deferrals propose step can drive
// workplan edits without re-tokenizing the file.
//
// The sample cap (MAX_SAMPLES_PER_FEATURE = 20) applies identically here.
// When a workplan exceeds the cap, propose surfaces the first 20 markers;
// the operator runs propose again after applying the first batch to pick
// up the remainder.
//
// Throws when the path does not exist or is not a file. Callers handle the
// error and surface it as a usage error to the operator.
export interface ScanSingleWorkplanFileResult {
  readonly workplanPath: string;
  readonly counts: WorkplanFeatureCounts['counts'];
  readonly samples: readonly WorkplanMarkerSample[];
}

export function scanSingleWorkplanFile(
  workplanPath: string,
): ScanSingleWorkplanFileResult {
  if (!existsSync(workplanPath)) {
    throw new Error(
      `Workplan not found at ${workplanPath}. Pass --workplan <path> pointing at an existing file.`,
    );
  }
  const content = readFileSync(workplanPath, 'utf8');
  const { counts, samples } = scanMarkers(content);
  return { workplanPath, counts, samples };
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
      const { counts, samples } = scanMarkers(content);
      features.push({
        slug,
        target_version: version || config.docs.defaultTargetVersion,
        path: workplanPath,
        counts,
        samples,
      });
      total += counts.total;
    }
  }

  return { total, features };
}
