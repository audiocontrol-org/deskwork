/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.ts
 *
 * Phase 26 Task 5 — doctor rule that validates the workplan's
 * `<!-- workplan-archive-ledger -->` annotation matches the
 * `workplan-archive.md` file's actual content. Surfaces drift between
 * the ledger's recorded `archived-phases` range + the phases physically
 * present in the archive file.
 *
 * Scenarios it catches:
 *   - Ledger says `archived-phases: 1-5` but the archive file is missing
 *     Phase 3.
 *   - Archive file contains Phase 7 but ledger doesn't list it.
 *   - Ledger references an archive-file path that doesn't exist.
 *
 * Non-scenarios (intentionally NOT checked):
 *   - Workplan content vs archive content drift (per-phase fidelity) —
 *     out of scope; the archive is append-only.
 *   - Ledger fix-task ID coherence — a separate rule (future work)
 *     could validate `archived-fix-tasks` against actual archived
 *     content.
 *
 * Severity: warning (operator action required, not a parse blocker).
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parseLedgerFromWorkplan, type IdRange } from '../workplan-archive/ledger.js';
import type { DoctorRuleCheck, ScopeDoctorFinding, DoctorRuleOptions } from './types.js';

const RULE = 'workplan-archive-ledger-coherence';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function expandRanges(ranges: ReadonlyArray<IdRange>): number[] {
  const out: number[] = [];
  for (const r of ranges) {
    if (r.end === undefined) {
      const n = Number(r.start);
      if (Number.isFinite(n)) out.push(n);
    } else {
      const start = Number(r.start);
      const end = Number(r.end);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let i = start; i <= end; i += 1) out.push(i);
      }
    }
  }
  return out;
}

function collectPhasesInArchive(archiveBody: string): Set<number> {
  const phases = new Set<number>();
  const re = /^## Phase (\d+)(?::|$|\s)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(archiveBody)) !== null) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) phases.add(n);
  }
  return phases;
}

/**
 * Walk all in-progress features (one per dir under docs/<v>/001-IN-PROGRESS/);
 * for each, parse the workplan's ledger + compare against the archive
 * file's content. Skip features with no ledger annotation (the
 * pre-archive case).
 */
export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const findings: ScopeDoctorFinding[] = [];
  const docsRoot = join(opts.repoRoot, 'docs');
  if (!(await pathExists(docsRoot))) return findings;
  // Walk docs/<version>/<status>/<slug>/ structure.
  let versions: string[];
  try {
    versions = (await readdir(docsRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return findings;
  }
  for (const version of versions) {
    const versionPath = join(docsRoot, version);
    let statuses: string[];
    try {
      statuses = (await readdir(versionPath, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const status of statuses) {
      const statusPath = join(versionPath, status);
      let slugs: string[];
      try {
        slugs = (await readdir(statusPath, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        continue;
      }
      for (const slug of slugs) {
        const featureDir = join(statusPath, slug);
        const workplanPath = join(featureDir, 'workplan.md');
        if (!(await pathExists(workplanPath))) continue;
        const workplanBody = await readFile(workplanPath, 'utf8');
        const ledger = parseLedgerFromWorkplan(workplanBody);
        if (ledger === null) continue; // no ledger → no coherence check
        // Resolve archive file (relative to feature dir).
        const archivePath = join(featureDir, ledger.archiveFile);
        if (!(await pathExists(archivePath))) {
          findings.push({
            rule: RULE,
            severity: 'warning',
            message: `${slug}: ledger references archive-file "${ledger.archiveFile}" but ${archivePath} does not exist. Either run \`dw-lifecycle archive-phases --apply\` to create it, or correct the ledger's archive-file field.`,
          });
          continue;
        }
        const archiveBody = await readFile(archivePath, 'utf8');
        const declaredPhases = new Set(expandRanges(ledger.archivedPhases));
        const actualPhases = collectPhasesInArchive(archiveBody);
        // Missing from archive: ledger lists them but they're not in the file.
        const missing = [...declaredPhases].filter((p) => !actualPhases.has(p)).sort((a, b) => a - b);
        if (missing.length > 0) {
          findings.push({
            rule: RULE,
            severity: 'warning',
            message: `${slug}: ledger lists phases ${missing.join(', ')} as archived but they are NOT present in ${ledger.archiveFile}. Either restore them via \`unarchive-phases\` and re-archive, or remove the stale entries from the ledger's archived-phases range.`,
          });
        }
        // Extra in archive: present in the file but not declared in the ledger.
        const extra = [...actualPhases].filter((p) => !declaredPhases.has(p)).sort((a, b) => a - b);
        if (extra.length > 0) {
          findings.push({
            rule: RULE,
            severity: 'warning',
            message: `${slug}: ${ledger.archiveFile} contains phases ${extra.join(', ')} that are NOT declared in the workplan's archived-phases ledger range. Update the ledger to include them (or unarchive them via \`unarchive-phases\` if they should be active).`,
          });
        }
      }
    }
  }
  return findings;
};
