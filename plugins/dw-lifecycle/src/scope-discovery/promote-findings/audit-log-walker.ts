/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/audit-log-walker.ts
 *
 * Walk a feature's audit-log.md for entries with `Status: open`.
 *
 * Uses the existing `parseAuditLogFile` helper from
 * `../util/audit-log-parser.ts` so the parser logic (Field: value
 * tolerance, multi-line Affects bullet form, body capture) stays in one
 * place. This module's job is the status filter + stamping the absolute
 * audit-log path on each finding so downstream consumers don't re-thread
 * it.
 *
 * `featureSlug` is informational only in v1: each feature has its own
 * audit-log.md (per the feature workplan convention), so the path
 * already encodes which feature's findings we're reading. The argument
 * is in the API for symmetry with future-proofing (e.g. a multi-feature
 * audit-log aggregator) and so the subcommand's logging line can name
 * the feature without re-deriving it. We do NOT conditionally filter
 * entries on it.
 */

import { parseAuditLogFile } from '../util/audit-log-parser.js';
import type { OpenFinding } from './types.js';

export interface WalkOpenFindingsArgs {
  readonly auditLogPath: string;
  readonly featureSlug: string;
}

export async function walkOpenFindings(
  args: WalkOpenFindingsArgs,
): Promise<readonly OpenFinding[]> {
  const log = await parseAuditLogFile(args.auditLogPath);
  const out: OpenFinding[] = [];
  for (const entry of log.entries) {
    if (entry.status !== 'open') continue;
    const finding: {
      -readonly [K in keyof OpenFinding]: OpenFinding[K];
    } = {
      findingId: entry.findingId,
      heading: entry.heading,
      body: entry.body,
      lineNumber: entry.lineNumber,
      auditLogPath: args.auditLogPath,
    };
    if (entry.severity !== undefined) finding.severity = entry.severity;
    if (entry.surface !== undefined) finding.surface = entry.surface;
    out.push(finding);
  }
  return out;
}
