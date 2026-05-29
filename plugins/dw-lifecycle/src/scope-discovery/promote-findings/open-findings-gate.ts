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
 * from `repoRoot` + `featureSlug` (mirroring promote-findings.ts's
 * `resolveFeatureRoot` shape) and delegates to `walkOpenFindings` for the
 * actual parse + status filter. The result is a discriminated union the
 * CLI (or any in-band caller) renders into a refusal message.
 *
 * NOTE on path resolution: docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md
 * is the canonical layout. We try `1.0` first then `0.x` (matching the
 * candidate list in promote-findings.ts so this gate behaves identically
 * to the upstream promotion verb). If neither exists,
 * FeatureRootNotFoundError signals a config-level failure the CLI maps
 * to exit 2.
 *
 * If the audit-log file itself is missing (feature root present but
 * the log hasn't been created yet), we treat it as "zero open findings"
 * — a brand-new feature with no findings is, by definition, allowed.
 * walkOpenFindings already returns `[]` for that case.
 */

import { existsSync } from 'node:fs';
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
      `open-findings-gate: feature '${featureSlug}' not found under any of: ${searched.join(', ')}`,
    );
    this.name = 'FeatureRootNotFoundError';
    this.featureSlug = featureSlug;
    this.searched = searched;
  }
}

export async function checkOpenFindings(
  args: CheckOpenFindingsArgs,
): Promise<OpenFindingsGateResult> {
  const docsRoot = join(args.repoRoot, 'docs');
  const candidates = [
    join(docsRoot, '1.0', '001-IN-PROGRESS', args.featureSlug),
    join(docsRoot, '0.x', '001-IN-PROGRESS', args.featureSlug),
  ];
  const featureRoot = candidates.find((c) => existsSync(c));
  if (featureRoot === undefined) {
    throw new FeatureRootNotFoundError(args.featureSlug, candidates);
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
