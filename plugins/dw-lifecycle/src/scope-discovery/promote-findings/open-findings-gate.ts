/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/open-findings-gate.ts
 *
 * Pure-function gate: refuse to advance `/dw-lifecycle:implement` while the
 * named feature has any audit-log entry with `Status: open`.
 *
 * Phase 13 Task 2's structural counterpart to Task 1 (`promote-findings`).
 * Task 1 produces the cure (scope findings into the workplan as TDD-first
 * tasks); this gate is the lock that forces the cure before the next
 * implementation step begins. No `--ignore-open-findings` flag in v1 per
 * operator decision: err on rigidity.
 *
 * The library is fs-touching but I/O-thin: it resolves the audit-log path
 * from `repoRoot` + `featureSlug` and delegates to `walkOpenFindings` for
 * the actual parse + status filter. The result is a discriminated union
 * the CLI (or any in-band caller) renders into a refusal message.
 *
 * NOTE on path resolution: docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md
 * is the canonical layout. AUDIT-20260529-17 (review-finding T3-1)
 * replaced the prior hardcoded `1.0` + `0.x` candidate list with a
 * directory walk that mirrors `findFeatureDirectory` in
 * `../../orchestrator-turn.ts`. The prior narrow list missed real
 * features under `docs/0.19.0/` / `docs/0.16.0/`. The walk inspects
 * every top-level directory under `docs/`, looks for a
 * `001-IN-PROGRESS/<slug>` subdir, and returns the first match.
 *
 * If the feature root is not found under any version, FeatureRootNotFoundError
 * signals a config-level failure the CLI maps to exit 2.
 *
 * If the audit-log file itself is missing (feature root present but the
 * log hasn't been created yet), we treat it as "zero open findings" — a
 * brand-new feature with no findings is, by definition, allowed.
 * walkOpenFindings already returns `[]` for that case.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { walkOpenFindings } from './audit-log-walker.js';
import type { OpenFinding } from './types.js';

export type OpenFindingsGateResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly openFindings: readonly OpenFinding[];
    };

export interface CheckOpenFindingsArgs {
  readonly featureSlug: string;
  readonly repoRoot: string;
}

export class FeatureRootNotFoundError extends Error {
  readonly featureSlug: string;
  readonly searched: readonly string[];
  constructor(featureSlug: string, searched: readonly string[]) {
    super(
      `open-findings-gate: feature '${featureSlug}' not found under docs/<v>/001-IN-PROGRESS/. Checked versions: ${searched.join(', ')}`,
    );
    this.name = 'FeatureRootNotFoundError';
    this.featureSlug = featureSlug;
    this.searched = searched;
  }
}

async function findFeatureRoot(
  docsRoot: string,
  featureSlug: string,
): Promise<{ root: string | undefined; versionsChecked: readonly string[] }> {
  if (!existsSync(docsRoot)) {
    return { root: undefined, versionsChecked: [] };
  }
  let topEntries: ReadonlyArray<string>;
  try {
    topEntries = await readdir(docsRoot);
  } catch {
    return { root: undefined, versionsChecked: [] };
  }
  const versionsChecked: string[] = [];
  for (const version of topEntries) {
    const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    versionsChecked.push(version);
    const featureDir = join(inProgress, featureSlug);
    if (existsSync(featureDir)) return { root: featureDir, versionsChecked };
  }
  return { root: undefined, versionsChecked };
}

export async function checkOpenFindings(
  args: CheckOpenFindingsArgs,
): Promise<OpenFindingsGateResult> {
  const docsRoot = join(args.repoRoot, 'docs');
  const { root: featureRoot, versionsChecked } = await findFeatureRoot(
    docsRoot,
    args.featureSlug,
  );
  if (featureRoot === undefined) {
    throw new FeatureRootNotFoundError(
      args.featureSlug,
      versionsChecked.length > 0 ? versionsChecked : ['<no version dirs found>'],
    );
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  const findings = await walkOpenFindings({
    auditLogPath,
    featureSlug: args.featureSlug,
  });
  if (findings.length === 0) {
    return { allowed: true };
  }
  return { allowed: false, openFindings: findings };
}
