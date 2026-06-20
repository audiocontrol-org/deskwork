/**
 * plugins/stack-control/src/subcommands/record-no-new-findings-section.ts
 *
 * specs/029 US4 — the "no NEW liftable findings" arm of `audit-barrage-lift`,
 * extracted from `audit-barrage-lift.ts` to keep that file under the 300–500 line
 * cap (the graduation-safety fix added a third sub-case).
 *
 * A run with zero NEW liftable findings ALWAYS records a section so the convergence
 * dampener (which counts SECTIONS) sees it as the most-recent run. Three sub-cases,
 * in priority order:
 *
 *   1. `dedupSuppressedOpen` non-empty → a NON-pristine RE-REPORT section carrying
 *      those findings' `Severity:` lines (no new IDs/tasks). A persistent OPEN HIGH
 *      keeps the dampener engaged (US3 SC-001). Takes precedence over the
 *      quiet/degraded branches: the run is NOT clean, it just surfaced nothing the
 *      audit-log hadn't already captured.
 *   2. DEGRADED fleet (and no re-reports) → a section carrying the `Fleet: DEGRADED`
 *      marker so the dampener NEVER counts it as quiet (FR-007).
 *   3. HEALTHY fleet, genuinely 0 findings (or a `fixed-<sha>`-only run) → a QUIET
 *      section (0 Severity lines) the dampener counts as a clean run (FR-008/-013).
 */

import { basename } from 'node:path';
import {
  appendSection,
  renderQuietSection,
  renderRereportSection,
  type SectionFleetStatus,
} from './audit-barrage-lift-render.js';
import type { ExtractedFinding } from '../scope-discovery/promote-findings/extract-barrage-findings.js';
import type { FleetReport } from '../scope-discovery/audit-barrage/types.js';

export interface RecordNoNewFindingsArgs {
  readonly dedupSuppressedOpen: readonly ExtractedFinding[];
  readonly fleet: FleetReport | undefined;
  readonly date: string;
  readonly runDir: string;
  readonly tipSha: string | undefined;
  readonly auditLogText: string;
  readonly auditLogPath: string;
  readonly apply: boolean;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly write: (path: string, content: string) => Promise<void>;
}

function degradedFleetStatus(fleet: FleetReport | undefined): SectionFleetStatus | undefined {
  return fleet !== undefined && fleet.produced < fleet.configured
    ? { produced: fleet.produced, configured: fleet.configured }
    : undefined;
}

/**
 * Record the appropriate no-new-findings section (re-report / degraded / quiet) and
 * return the CLI exit code (always 0 — a no-new-findings run is never a config
 * error). On a dry-run nothing is written; the section that WOULD be written is
 * still announced on stderr.
 */
export async function recordNoNewFindingsSection(
  args: RecordNoNewFindingsArgs,
): Promise<number> {
  const { dedupSuppressedOpen, fleet, date, runDir, tipSha, auditLogText, auditLogPath } = args;
  const { apply, stderr, write } = args;
  const degradedFleet = degradedFleetStatus(fleet);
  const runDirBasename = basename(runDir.replace(/\/$/, ''));

  if (dedupSuppressedOpen.length > 0) {
    stderr.write(
      `audit-barrage-lift: 0 NEW findings from ${runDir}, but ${dedupSuppressedOpen.length} ` +
        `already-tracked finding(s) re-surfaced (FR-016 dedup) — recording a RE-REPORT section ` +
        `(no new IDs/tasks) so the dampener still counts their severity; a persistent open finding ` +
        `keeps blocking (US3 SC-001).\n`,
    );
    if (!apply) {
      stderr.write('audit-barrage-lift: dry-run (re-run with --apply to write).\n');
      return 0;
    }
    const rereport = renderRereportSection(
      dedupSuppressedOpen,
      date,
      runDirBasename,
      degradedFleet,
      tipSha,
    );
    await write(auditLogPath, appendSection(auditLogText, rereport));
    stderr.write(
      `audit-barrage-lift: recorded a RE-REPORT section (${dedupSuppressedOpen.length} ` +
        `already-tracked finding(s)) in ${auditLogPath}.\n`,
    );
    return 0;
  }

  stderr.write(
    degradedFleet !== undefined
      ? `audit-barrage-lift: extracted 0 findings from ${runDir} over a DEGRADED ` +
          `fleet (produced ${degradedFleet.produced} of ${degradedFleet.configured} ` +
          `configured) — absence over non-completed lanes is NOT a clean signal; recording ` +
          `a DEGRADED-marked section so the dampener never counts it as quiet (FR-007).\n`
      : `audit-barrage-lift: extracted 0 findings from ${runDir} over a healthy ` +
          `fleet; recording a quiet run section so the convergence dampener counts it.\n`,
  );
  if (!apply) {
    stderr.write('audit-barrage-lift: dry-run (re-run with --apply to write).\n');
    return 0;
  }
  const quiet = renderQuietSection(date, runDirBasename, degradedFleet, tipSha);
  await write(auditLogPath, appendSection(auditLogText, quiet));
  stderr.write(
    `audit-barrage-lift: recorded a ${degradedFleet !== undefined ? 'DEGRADED' : 'quiet'} ` +
      `run section in ${auditLogPath}.\n`,
  );
  return 0;
}
