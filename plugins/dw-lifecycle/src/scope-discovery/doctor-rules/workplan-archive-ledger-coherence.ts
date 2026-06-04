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
 *   - Per AUDIT-20260604-02: `archived-fix-tasks` ranges that
 *     `expandRange` tolerates via singleton-pair fallback (cross-phase
 *     `5.10-6.3`, mismatched-dotted `5.1-5`, non-numeric `5.x-5.y`).
 *     `expandRange` does NOT throw on these — `archive-phases` keeps
 *     running — but the operator deserves a notification so they can
 *     fix the ledger before downstream consumers misread it. This rule
 *     calls `classifyFixTaskRange` per range and warns on each
 *     non-`well-formed` shape.
 *
 * Non-scenarios (intentionally NOT checked):
 *   - Workplan content vs archive content drift (per-phase fidelity) —
 *     out of scope; the archive is append-only.
 *   - `archived-fix-tasks` cross-reference with the archive file's
 *     actual `### Task <N>` headings — a stricter rule (future work)
 *     could compare declared fix-task IDs against the ones the
 *     archive file physically contains.
 *
 * Severity: warning (operator action required, not a parse blocker).
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseLedgerFromWorkplan,
  classifyFixTaskRange,
  type IdRange,
  type Ledger,
} from '../workplan-archive/ledger.js';
import { errorMessage } from '../util/typeguards.js';
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
        // Per AUDIT-20260603-91: parseLedgerFromWorkplan throws on
        // malformed ledger content. A malformed ledger in one feature
        // must NOT abort the entire scan — emit a warning finding
        // naming the slug + parse error and continue to other features.
        let ledger: Ledger | null;
        try {
          ledger = parseLedgerFromWorkplan(workplanBody);
        } catch (err) {
          findings.push({
            rule: RULE,
            severity: 'warning',
            message: `${slug}: ledger annotation parse error: ${errorMessage(err)}. Fix the workplan-archive-ledger HTML comment in workplan.md (or remove it if no archive exists yet).`,
          });
          continue;
        }
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
        // Per AUDIT-20260604-02: walk each archived-fix-tasks range and
        // warn on the three malformed shapes that `expandRange` tolerates
        // via singleton-pair fallback. The fallback is correct (it lets
        // archivePhases keep running) but the operator deserves a
        // notification so the ledger can be repaired before downstream
        // consumers misread it.
        for (const range of ledger.archivedFixTasks) {
          const shape = classifyFixTaskRange(range);
          if (shape === 'well-formed') continue;
          const repr = range.end === undefined ? range.start : `${range.start}-${range.end}`;
          findings.push({
            rule: RULE,
            severity: 'warning',
            message: `${slug}: archived-fix-tasks range "${repr}" has malformed shape "${shape}" (per AUDIT-20260604-02). expandRange tolerates this via singleton-pair fallback, but the ledger entry should be repaired so downstream consumers read the intended IDs. Fix the workplan's <!-- workplan-archive-ledger --> annotation.`,
          });
        }
      }
    }
  }
  return findings;
};
