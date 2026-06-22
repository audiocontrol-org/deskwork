// 030 US9 (T084, FR-026): record the chunked end-govern run's reconciled findings
// as EXACTLY ONE audit-log lift section — never one section per chunk (the
// per-chunk lift balloon the unwired stand-in produced). Reuses the
// audit-barrage-lift section machinery (partition → assign ids → render →
// append) over the pipeline-reconciled findings instead of a single run-dir's
// raw model markdown, so the dampener counts the whole invocation as ONE run and
// the promote-findings flow sees one coherent section.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ExtractedFinding } from '../scope-discovery/promote-findings/extract-barrage-findings.js';
import { partitionLiftableFindings } from './loop-hygiene.js';
import {
  appendSection,
  buildAuditLogHeader,
  renderSection,
} from '../subcommands/audit-barrage-lift-render.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';

/** Highest existing `AUDIT-<date>-NN` so the new section continues the sequence. */
function highestExistingNn(text: string, date: string): number {
  const re = new RegExp(`AUDIT-${date}-(\\d+)`, 'g');
  let highest = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number.parseInt(m[1] ?? '0', 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return highest;
}

/** A legacy-docs root carries a version axis (`docs/<v>/001-IN-PROGRESS/<slug>`); speckit has none. */
function targetVersion(root: string, layout: 'legacy-docs' | 'speckit' | undefined): string {
  return layout === 'legacy-docs' ? basename(dirname(dirname(root))) : '';
}

export interface LiftOnceArgs {
  readonly installationRoot: string;
  readonly slug: string;
  readonly findings: readonly ExtractedFinding[];
  /** YYYYMMDD for the new AUDIT-<date>-NN ids (resolved by the caller). */
  readonly date: string;
  /** The run label the section header carries (a stable per-invocation tag). */
  readonly runLabel: string;
  readonly stderr: (s: string) => void;
}

/**
 * Write the reconciled end-govern findings as ONE audit-log lift section. A clean
 * run (no NEW liftable findings) writes nothing — the whole-feature convergence
 * record is the graduation signal (FR-025); the audit-log section exists so the
 * agent-in-the-loop can action the surfaced findings on an `override-eligible`
 * run. Throws (fail loud) if the feature root cannot be resolved.
 */
export async function liftEndGovernFindingsOnce(args: LiftOnceArgs): Promise<void> {
  const { root, layout } = await resolveFeatureRoot({
    repoRoot: args.installationRoot,
    slug: args.slug,
  });
  if (root === undefined) {
    throw new Error(
      `govern: lift-once — feature '${args.slug}' not found under the installation; ` +
        `cannot record the surfaced findings.`,
    );
  }
  const auditLogPath = join(root, 'audit-log.md');
  const existing = existsSync(auditLogPath)
    ? await readFile(auditLogPath, 'utf8')
    : buildAuditLogHeader(args.slug, targetVersion(root, layout));

  const { liftable } = partitionLiftableFindings(args.findings, existing, args.stderr);
  if (liftable.length === 0) {
    args.stderr('govern: lift-once — no NEW findings to record (all already tracked or resolved).\n');
    return;
  }
  const startingNn = highestExistingNn(existing, args.date) + 1;
  const { section } = renderSection(liftable, args.date, startingNn, args.runLabel);
  await atomicWriteFile(auditLogPath, appendSection(existing, section));
  args.stderr(
    `govern: lift-once — recorded ${liftable.length} finding(s) as ONE section in ${auditLogPath} (FR-026).\n`,
  );
}
