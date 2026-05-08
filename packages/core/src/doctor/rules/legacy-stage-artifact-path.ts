/**
 * Rule: legacy-stage-artifact-path.
 *
 * Issue #222 (Option B + hybrid refinement) — `index.md` is always
 * "the document under review". Pre-T1 entries had per-stage
 * `artifactPath` values pointing at `<dir>/scrapbook/<stage>.md`
 * (idea.md / plan.md / outline.md depending on stage). After T1 the
 * convention is `<dir>/index.md` — same `dirname`, but the leaf file
 * is unconditionally `index.md`.
 *
 * Detection: walk every sidecar; flag those whose `artifactPath` ends
 * with `/scrapbook/<stage>.md` for any of the legacy per-stage names.
 *
 * Repair: copy the legacy per-stage file's content into
 * `<dir>/index.md`, then update the sidecar's `artifactPath` to
 * `<dir>/index.md`. Leave the per-stage file in place — it's now the
 * scrapbook snapshot for that stage and must be preserved (the
 * snapshot IS the prior-stage history).
 *
 * Idempotent: subsequent runs detect `artifactPath` already at
 * `index.md` and skip. Safe for `--yes` / `--fix=all` mode.
 *
 * Sibling-relative imports per the project convention.
 */

import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, posix, sep } from 'node:path';
import { readAllSidecars } from '../../sidecar/read-all.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import type { Entry } from '../../schema/entry.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'legacy-stage-artifact-path';

const LEGACY_LEAFS: ReadonlySet<string> = new Set([
  'idea.md',
  'plan.md',
  'outline.md',
  'drafting.md',
]);

interface LegacyHit {
  readonly entry: Entry;
  /** The artifactPath as stored on the sidecar (project-relative). */
  readonly relativePath: string;
  /** Project-relative path the new artifactPath will hold. */
  readonly nextRelativePath: string;
}

/** Normalize the project-relative artifactPath to forward-slash form
 *  for endsWith / segment checks. Sidecar values may have been written
 *  with either separator depending on the OS that ingested them. */
function toPosix(p: string): string {
  if (sep === posix.sep) return p;
  return p.split(sep).join(posix.sep);
}

function classify(entry: Entry): LegacyHit | null {
  if (!entry.artifactPath) return null;
  const posixPath = toPosix(entry.artifactPath);
  // Must end with `/scrapbook/<legacy-leaf>` to qualify.
  const segments = posixPath.split('/');
  if (segments.length < 3) return null;
  const leaf = segments[segments.length - 1];
  const parent = segments[segments.length - 2];
  if (parent !== 'scrapbook') return null;
  if (!LEGACY_LEAFS.has(leaf.toLowerCase())) return null;
  // <dir> is everything above the `scrapbook/` segment.
  const dirSegments = segments.slice(0, segments.length - 2);
  const nextRelativePath = [...dirSegments, 'index.md'].join('/');
  return {
    entry,
    relativePath: entry.artifactPath,
    nextRelativePath,
  };
}

async function fileExists(absPath: string): Promise<boolean> {
  return stat(absPath).then(
    (s) => s.isFile(),
    () => false,
  );
}

async function atomicWrite(absPath: string, content: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, content);
  await rename(tmpPath, absPath);
}

interface MigrateResult {
  /** The path the per-stage file was copied FROM (absolute). */
  readonly fromAbs: string;
  /** The path index.md was written TO (absolute). */
  readonly toAbs: string;
}

/**
 * Apply the migration to a single hit:
 *
 *  1. Copy `<dir>/scrapbook/<legacy>.md` → `<dir>/index.md` (atomic
 *     write via tmp + rename). Skip the copy when `index.md` already
 *     exists with the same bytes (idempotent).
 *  2. Caller then updates the sidecar's `artifactPath` to
 *     `<dir>/index.md`.
 *
 *  Refuses when `<dir>/index.md` exists with DIFFERENT content from the
 *  legacy per-stage file — manual resolution required (operator may
 *  have hand-edited one of the two).
 */
async function migrate(
  projectRoot: string,
  hit: LegacyHit,
): Promise<MigrateResult> {
  const fromAbs = join(projectRoot, hit.relativePath);
  const toAbs = join(projectRoot, hit.nextRelativePath);

  if (!(await fileExists(fromAbs))) {
    throw new Error(
      `legacy artifact file not found at ${fromAbs}; sidecar artifactPath ` +
        `points at a missing file. Repair manually before re-running ` +
        `doctor (the per-stage file may have been moved or deleted).`,
    );
  }

  const legacy = await readFile(fromAbs, 'utf8');

  if (await fileExists(toAbs)) {
    const current = await readFile(toAbs, 'utf8');
    if (legacy !== current) {
      throw new Error(
        `${toAbs} exists with different content from ${fromAbs}; refusing ` +
          `to overwrite. Resolve manually (decide which copy is canonical ` +
          `for index.md, leave the other under scrapbook/) and re-run.`,
      );
    }
    return { fromAbs, toAbs };
  }

  await atomicWrite(toAbs, legacy);
  return { fromAbs, toAbs };
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Sidecar artifactPath should point at index.md (Issue #222)',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    let entries: Entry[];
    try {
      entries = await readAllSidecars(ctx.projectRoot);
    } catch {
      return [];
    }
    const findings: Finding[] = [];
    for (const entry of entries) {
      const hit = classify(entry);
      if (hit === null) continue;
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message:
          `Entry ${entry.uuid} (slug=${entry.slug}) has a legacy per-stage ` +
          `artifactPath (${hit.relativePath}); should be ` +
          `${hit.nextRelativePath}.`,
        details: {
          entryId: entry.uuid,
          slug: entry.slug,
          legacyPath: hit.relativePath,
          nextPath: hit.nextRelativePath,
        },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const entryId = String(finding.details.entryId ?? '');
    const legacyPath = String(finding.details.legacyPath ?? '');
    const nextPath = String(finding.details.nextPath ?? '');
    if (!entryId || !legacyPath || !nextPath) {
      return {
        kind: 'report-only',
        finding,
        reason: 'finding missing entryId / legacyPath / nextPath — re-run audit',
      };
    }
    return {
      kind: 'apply',
      finding,
      summary:
        `migrate ${legacyPath} → ${nextPath} and update sidecar ` +
        `${entryId}'s artifactPath`,
      payload: { entryId, legacyPath, nextPath },
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message:
          'plan is not directly appliable; runner should resolve prompt first',
        skipReason: 'apply-failed',
      };
    }
    const entryId = String(plan.payload.entryId ?? '');
    const legacyPath = String(plan.payload.legacyPath ?? '');
    const nextPath = String(plan.payload.nextPath ?? '');
    if (!entryId || !legacyPath || !nextPath) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing entryId / legacyPath / nextPath',
        skipReason: 'apply-failed',
      };
    }

    let entries: Entry[];
    try {
      entries = await readAllSidecars(ctx.projectRoot);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `failed to read sidecars: ${reason}`,
        skipReason: 'apply-failed',
      };
    }
    const entry = entries.find((e) => e.uuid === entryId);
    if (!entry) {
      return {
        finding: plan.finding,
        applied: false,
        message: `sidecar for ${entryId} disappeared between audit and apply`,
        skipReason: 'apply-failed',
      };
    }

    try {
      await migrate(ctx.projectRoot, {
        entry,
        relativePath: legacyPath,
        nextRelativePath: nextPath,
      });
      const updated: Entry = { ...entry, artifactPath: nextPath };
      await writeSidecar(ctx.projectRoot, updated);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `failed to migrate artifactPath for ${entryId}: ${reason}`,
        skipReason: 'apply-failed',
      };
    }

    return {
      finding: plan.finding,
      applied: true,
      message:
        `migrated ${legacyPath} → ${nextPath} and updated sidecar ` +
        `${entryId}'s artifactPath`,
      details: { entryId, legacyPath, nextPath },
    };
  },
};

export default rule;
