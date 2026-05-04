#!/usr/bin/env tsx
/**
 * Phase 34e — corrupted-review trust rebuild.
 *
 * For each applied longform / outline workflow record on a project,
 * compute a CONTENT diff between:
 *   - what the operator approved (the workflow's `currentVersion`
 *     snapshot, sourced from the per-version history-journal event), and
 *   - what's on disk now (the entry's `artifactPath`).
 *
 * Pre-Phase-34a, the studio dashboard linked to the legacy review
 * surface, which read frozen workflow records. The risk is that an
 * operator approved against version-N content while the entry was
 * subsequently iterated post-pivot via the entry-centric path —
 * leaving the workflow record's "applied" stamp paired with stale
 * content the operator never re-reviewed.
 *
 * Audit semantics:
 *   - Only `state === 'applied'` records matter. Non-applied workflows
 *     never produced an approval click.
 *   - Only `contentKind` of `longform` or `outline` matter. Shortform
 *     stays workflow-keyed by design (per Phase 34a's deferral); its
 *     records aren't pre-Phase-30 corruption suspects.
 *   - For each remaining record, compute the diff. Trivial diffs
 *     (whitespace-only, frontmatter-only) don't warrant re-review.
 *     Non-trivial diffs do.
 *
 * Audit script previously [v1] only computed iteration-count delta
 * and chose the comparison record by directory order. Rewritten to
 * fix two findings from the Phase 34e audit (F1: wrong workflow
 * selection; F2: missing content diff).
 *
 * Usage:
 *   tsx scripts/audit-post-pivot-iterations.ts [<projectRoot>]
 *
 * Defaults `projectRoot` to the repo root.
 *
 * Exit code: 0 always (audit is informational; no auto-remediation).
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface Sidecar {
  uuid: string;
  slug: string;
  title: string;
  currentStage: string;
  artifactPath?: string;
  iterationByStage?: Record<string, number>;
}

interface WorkflowRecord {
  id: string;
  site: string;
  slug: string;
  state: string;
  contentKind?: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  entryId?: string;
}

interface VersionHistoryEvent {
  entry?: {
    kind?: string;
    workflowId?: string;
    version?: { version: number; markdown: string };
  };
}

function readJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const raw = readFileSync(join(dir, name), 'utf8');
    out.push(JSON.parse(raw) as T);
  }
  return out;
}

/**
 * Strip a YAML frontmatter block from the top of a markdown file.
 * Frontmatter changes (e.g. updatedAt timestamps) are not content
 * differences for review-correctness purposes.
 */
function stripFrontmatter(text: string): string {
  if (!text.startsWith('---\n')) return text;
  const close = text.indexOf('\n---\n', 4);
  if (close < 0) return text;
  return text.slice(close + 5).replace(/^\n+/, '');
}

/**
 * Normalize content for diff comparison: strip frontmatter, collapse
 * runs of whitespace into single spaces, trim. Equal normalized
 * content = trivially-different content = no re-review needed.
 */
function normalizeForDiff(text: string): string {
  return stripFrontmatter(text).replace(/\s+/g, ' ').trim();
}

/**
 * Locate the per-version history-journal event for a given workflow.
 * The legacy pipeline emitted one event per `appendVersion` call:
 * `<timestamp>-version-<workflowId>-v<n>.json`.
 */
function readWorkflowVersion(
  historyDir: string,
  workflowId: string,
  version: number,
): string | null {
  if (!existsSync(historyDir)) return null;
  const suffix = `-version-${workflowId}-v${version}.json`;
  for (const name of readdirSync(historyDir)) {
    if (!name.endsWith(suffix)) continue;
    try {
      const raw = readFileSync(join(historyDir, name), 'utf8');
      const event = JSON.parse(raw) as VersionHistoryEvent;
      const md = event.entry?.version?.markdown;
      if (typeof md === 'string') return md;
    } catch {
      // Malformed event — keep looking.
      continue;
    }
  }
  return null;
}

interface ReviewPair {
  entryId: string;
  slug: string;
  title: string;
  workflowId: string;
  workflowVersion: number;
  workflowUpdatedAt: string;
  approvedMarkdown: string | null;
  currentMarkdown: string | null;
  currentArtifactPath: string | null;
}

interface BuiltPair extends ReviewPair {
  /** True when this is the most recent applied workflow for the
   *  (entry, contentKind) pair. Older applied records are
   *  superseded — their content drift is a receipt of the past
   *  approval cycle, not an actionable trust-rebuild concern. */
  readonly isCurrent: boolean;
  /** ContentKind of the workflow record (longform / outline).
   *  Carried through so reporting can group + distinguish. */
  readonly contentKind: string;
}

function buildReviewPairs(
  projectRoot: string,
  sidecars: Sidecar[],
  workflows: WorkflowRecord[],
): BuiltPair[] {
  const sidecarsByEntry = new Map<string, Sidecar>();
  for (const s of sidecars) sidecarsByEntry.set(s.uuid, s);

  // Pre-filter: applied + longform/outline + has entryId + sidecar
  // exists. Then group by (entryId, contentKind) and pick the most
  // recent (by updatedAt) as `isCurrent: true`. Earlier ones are
  // `isCurrent: false` (superseded by the newer approval cycle).
  interface WorkflowEntryPair {
    wf: WorkflowRecord;
    sidecar: Sidecar;
  }
  const eligible: WorkflowEntryPair[] = [];
  for (const wf of workflows) {
    if (wf.state !== 'applied') continue;
    if (wf.contentKind !== 'longform' && wf.contentKind !== 'outline') continue;
    if (wf.entryId === undefined) continue;
    const sidecar = sidecarsByEntry.get(wf.entryId);
    if (sidecar === undefined) continue;
    eligible.push({ wf, sidecar });
  }
  // Identify the most-recent record per (entryId, contentKind).
  const currentKey = (entryId: string, kind: string): string => `${entryId}:${kind}`;
  const currentMap = new Map<string, string>(); // key → workflowId
  for (const { wf } of eligible) {
    if (wf.entryId === undefined || wf.contentKind === undefined) continue;
    const key = currentKey(wf.entryId, wf.contentKind);
    const incumbent = currentMap.get(key);
    if (!incumbent) {
      currentMap.set(key, wf.id);
      continue;
    }
    const incumbentWf = eligible.find((p) => p.wf.id === incumbent)?.wf;
    if (incumbentWf && wf.updatedAt > incumbentWf.updatedAt) {
      currentMap.set(key, wf.id);
    }
  }

  const historyDir = join(projectRoot, '.deskwork/review-journal/history');
  const pairs: BuiltPair[] = [];
  for (const { wf, sidecar } of eligible) {
    if (wf.entryId === undefined || wf.contentKind === undefined) continue;
    const approvedMarkdown = readWorkflowVersion(
      historyDir,
      wf.id,
      wf.currentVersion,
    );
    let currentMarkdown: string | null = null;
    let currentArtifactPath: string | null = null;
    if (sidecar.artifactPath !== undefined) {
      const abs = join(projectRoot, sidecar.artifactPath);
      currentArtifactPath = sidecar.artifactPath;
      if (existsSync(abs)) {
        try {
          currentMarkdown = readFileSync(abs, 'utf8');
        } catch {
          currentMarkdown = null;
        }
      }
    }
    const isCurrent = currentMap.get(currentKey(wf.entryId, wf.contentKind)) === wf.id;
    pairs.push({
      entryId: wf.entryId,
      slug: sidecar.slug,
      title: sidecar.title,
      workflowId: wf.id,
      workflowVersion: wf.currentVersion,
      workflowUpdatedAt: wf.updatedAt,
      approvedMarkdown,
      currentMarkdown,
      currentArtifactPath,
      isCurrent,
      contentKind: wf.contentKind,
    });
  }
  return pairs;
}

interface Diagnosis {
  pair: BuiltPair;
  status:
    | 'identical'
    | 'whitespace-only'
    | 'frontmatter-only'
    | 'non-trivial'
    | 'superseded'
    | 'approved-snapshot-missing'
    | 'current-content-missing';
  detail: string;
}

function diagnose(pair: BuiltPair): Diagnosis {
  // A non-trivial diff against a SUPERSEDED workflow record is just a
  // receipt of a past approval cycle (the operator approved snapshot
  // A; later approved a newer snapshot B; A's diff vs current is
  // historical drift, not actionable trust-rebuild). Surface it as
  // `superseded` so the operator's eye doesn't have to sort actionable
  // from informational. Only the CURRENT workflow record's diff is a
  // real "stale approval relied on" candidate.
  if (!pair.isCurrent) {
    return {
      pair,
      status: 'superseded',
      detail: 'older applied workflow; superseded by a newer approval cycle for the same entry',
    };
  }
  if (pair.approvedMarkdown === null) {
    return {
      pair,
      status: 'approved-snapshot-missing',
      detail: `no version-${pair.workflowVersion} event for workflow ${pair.workflowId}`,
    };
  }
  if (pair.currentMarkdown === null) {
    return {
      pair,
      status: 'current-content-missing',
      detail: `no on-disk content at ${pair.currentArtifactPath ?? '(no artifactPath on sidecar)'}`,
    };
  }
  if (pair.approvedMarkdown === pair.currentMarkdown) {
    return { pair, status: 'identical', detail: 'byte-identical' };
  }
  const approvedNorm = normalizeForDiff(pair.approvedMarkdown);
  const currentNorm = normalizeForDiff(pair.currentMarkdown);
  if (approvedNorm === currentNorm) {
    // Bodies match after frontmatter strip + whitespace normalize.
    // Still want to distinguish whitespace-only from frontmatter-only
    // because the disposition hint differs (whitespace = pure noise;
    // frontmatter = metadata churn that's also noise but worth naming).
    if (
      stripFrontmatter(pair.approvedMarkdown) ===
      stripFrontmatter(pair.currentMarkdown)
    ) {
      return { pair, status: 'whitespace-only', detail: 'differs only in inter-line whitespace' };
    }
    return {
      pair,
      status: 'frontmatter-only',
      detail: 'body identical; frontmatter changed',
    };
  }
  const approvedLines = pair.approvedMarkdown.split('\n').length;
  const currentLines = pair.currentMarkdown.split('\n').length;
  return {
    pair,
    status: 'non-trivial',
    detail: `approved was ${approvedLines} lines; current is ${currentLines} lines`,
  };
}

function main(): void {
  const projectRoot = resolve(process.argv[2] ?? process.cwd());
  const sidecars = readJsonDir<Sidecar>(join(projectRoot, '.deskwork/entries'));
  const workflows = readJsonDir<WorkflowRecord>(
    join(projectRoot, '.deskwork/review-journal/pipeline'),
  );

  process.stdout.write(
    `Audit: ${sidecars.length} sidecars × ${workflows.length} workflow records\n`,
  );
  process.stdout.write(`Project: ${projectRoot}\n\n`);

  const pairs = buildReviewPairs(projectRoot, sidecars, workflows);
  process.stdout.write(
    `Considered ${pairs.length} (entry, applied longform/outline workflow) pairs.\n\n`,
  );

  const diagnoses = pairs.map(diagnose);
  const nonTrivial = diagnoses.filter((d) => d.status === 'non-trivial');
  const trivial = diagnoses.filter(
    (d) =>
      d.status === 'identical' ||
      d.status === 'whitespace-only' ||
      d.status === 'frontmatter-only',
  );
  const superseded = diagnoses.filter((d) => d.status === 'superseded');
  const incomplete = diagnoses.filter(
    (d) =>
      d.status === 'approved-snapshot-missing' ||
      d.status === 'current-content-missing',
  );

  process.stdout.write(
    `Summary: ${nonTrivial.length} actionable diff(s), ${trivial.length} trivial-or-identical, ${superseded.length} superseded historical approval(s), ${incomplete.length} incomplete.\n\n`,
  );

  if (nonTrivial.length > 0) {
    process.stdout.write('Actionable content diffs (current approval, content drifted — re-review recommended):\n\n');
    for (const d of nonTrivial) {
      process.stdout.write(
        `  - ${d.pair.slug} (entry ${d.pair.entryId})\n` +
          `      title: ${d.pair.title}\n` +
          `      workflow: ${d.pair.workflowId} v${d.pair.workflowVersion} applied at ${d.pair.workflowUpdatedAt}\n` +
          `      diff: ${d.detail}\n\n`,
      );
    }
  }

  if (trivial.length > 0) {
    process.stdout.write('Trivial-or-identical (no re-review needed):\n\n');
    for (const d of trivial) {
      process.stdout.write(
        `  - ${d.pair.slug} v${d.pair.workflowVersion} workflow ${d.pair.workflowId.slice(0, 8)}: ${d.status} (${d.detail})\n`,
      );
    }
    process.stdout.write('\n');
  }

  if (superseded.length > 0) {
    process.stdout.write('Superseded historical approvals (informational; receipts of past review cycles, no action needed):\n\n');
    for (const d of superseded) {
      process.stdout.write(
        `  - ${d.pair.slug} v${d.pair.workflowVersion} workflow ${d.pair.workflowId.slice(0, 8)} (applied ${d.pair.workflowUpdatedAt})\n`,
      );
    }
    process.stdout.write('\n');
  }

  if (incomplete.length > 0) {
    process.stdout.write('Incomplete pairs (manual inspection needed):\n\n');
    for (const d of incomplete) {
      process.stdout.write(
        `  - ${d.pair.slug} v${d.pair.workflowVersion} workflow ${d.pair.workflowId.slice(0, 8)}: ${d.status} — ${d.detail}\n`,
      );
    }
    process.stdout.write('\n');
  }
}

main();
