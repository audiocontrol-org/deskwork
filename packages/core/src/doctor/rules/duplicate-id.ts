/**
 * Rule: duplicate-id.
 *
 * Audit: more than one file under contentDir claims the same frontmatter
 * id. The content index reports the byId map keeping only the first
 * encountered, but byPath records every file. We re-walk byPath grouped
 * by id and flag any group with > 1 entry.
 *
 * Repair: prompt the operator to pick a canonical file; clear the id
 * from the others. With `--yes`, skip — picking a canonical file is
 * an editorial decision, not something doctor should default.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter, removeFrontmatterPaths } from '../../frontmatter.ts';
import { resolveContentDir } from '../../paths.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'duplicate-id';

/**
 * Clear the `deskwork.id` field from a markdown file. Returns true when
 * the field was present and cleared. Issue #38: scoped to the
 * namespaced key — top-level `id:` belongs to the operator and is left
 * alone.
 */
function clearFrontmatterId(absPath: string): boolean {
  const raw = readFileSync(absPath, 'utf-8');
  const { data } = parseFrontmatter(raw);
  const block = data.deskwork;
  if (block === undefined || block === null) return false;
  if (typeof block !== 'object' || Array.isArray(block)) return false;
  const blockObj = block as Record<string, unknown>;
  if (!('id' in blockObj)) return false;

  const updated = removeFrontmatterPaths(raw, [['deskwork', 'id']]);
  if (updated === raw) return false;
  writeFileSync(absPath, updated, 'utf-8');
  return true;
}

interface DuplicateGroup {
  id: string;
  /** Absolute paths of every file claiming `id`. */
  files: string[];
}

/**
 * Group `index.byPath` (relPath → uuid) by uuid, return only groups
 * with more than one file. Caller resolves relative paths against
 * the site's contentDir to get absolute paths for repair.
 */
export function findDuplicateGroups(
  ctx: DoctorContext,
): DuplicateGroup[] {
  const contentDir = resolveContentDir(ctx.projectRoot, ctx.config, ctx.site);
  const byUuid = new Map<string, string[]>();
  for (const [relPath, uuid] of ctx.index.byPath) {
    const abs = join(contentDir, relPath);
    const list = byUuid.get(uuid);
    if (list) list.push(abs);
    else byUuid.set(uuid, [abs]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [uuid, files] of byUuid) {
    if (files.length > 1) {
      groups.push({ id: uuid, files: files.slice().sort() });
    }
  }
  return groups;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Multiple files share the same frontmatter id',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const groups = findDuplicateGroups(ctx);
    return groups.map((g) => ({
      ruleId: RULE_ID,
      site: ctx.site,
      severity: 'error',
      message: `id ${g.id} appears in ${g.files.length} files`,
      details: { entryId: g.id, files: g.files },
    }));
  },

  async plan(ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const rawFiles = finding.details.files;
    const files: string[] = Array.isArray(rawFiles)
      ? rawFiles.filter((x): x is string => typeof x === 'string')
      : [];
    if (files.length < 2) {
      return {
        kind: 'report-only',
        finding,
        reason: 'duplicate group has fewer than 2 files — re-run audit',
      };
    }
    return {
      kind: 'prompt',
      finding,
      question: `Multiple files claim id ${finding.details.entryId}. Pick the canonical file; the id will be cleared from the others.`,
      choices: files.map((abs) => ({
        id: abs,
        label: relative(ctx.projectRoot, abs),
        payload: { canonical: abs, others: files.filter((f) => f !== abs) },
      })),
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message: 'plan is not directly appliable; runner should resolve prompt first',
      };
    }
    const canonical = String(plan.payload.canonical ?? '');
    const othersRaw = plan.payload.others;
    const others = Array.isArray(othersRaw)
      ? (othersRaw.filter((x): x is string => typeof x === 'string'))
      : [];
    if (!canonical || others.length === 0) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing canonical or others',
      };
    }
    const cleared: string[] = [];
    const failed: string[] = [];
    for (const abs of others) {
      try {
        const changed = clearFrontmatterId(abs);
        if (changed) cleared.push(abs);
      } catch {
        failed.push(abs);
      }
    }
    if (failed.length > 0) {
      return {
        finding: plan.finding,
        applied: cleared.length > 0,
        message: `cleared id from ${cleared.length} file(s); failed on ${failed.length}: ${failed.map((p) => relative(ctx.projectRoot, p)).join(', ')}`,
        details: { canonical, cleared, failed },
      };
    }
    return {
      finding: plan.finding,
      applied: true,
      message: `cleared id from ${cleared.length} file(s); canonical: ${relative(ctx.projectRoot, canonical)}`,
      details: { canonical, cleared },
    };
  },
};

export default rule;
