/**
 * Rule: missing-frontmatter-id.
 *
 * Audit: every calendar entry whose `id` is not a key in `index.byId`
 * is a finding. The file binding for that entry isn't there yet.
 *
 * Repair: search the content tree for candidate files. Three searches,
 * widening:
 *   1. The file at the slug-template path (today's behavior — pre-Phase-19
 *      scaffolds and most Astro flat layouts).
 *   2. Any file whose frontmatter `title` matches the entry title.
 *   3. Any file whose basename (without extension) matches the slug.
 *
 * If exactly one candidate emerges, the plan is "write `id: <entry.id>`
 * into <path>". Multiple candidates produce a prompt the operator
 * resolves; `--yes` mode skips. Zero candidates is reported and skipped
 * (nothing to repair without operator input — the file may not exist
 * at all yet).
 *
 * Sibling-relative imports per the project convention.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import type { CalendarEntry } from '../../types.ts';
import { resolveBlogFilePath, resolveContentDir } from '../../paths.ts';
import { readFrontmatter, updateFrontmatter } from '../../frontmatter.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'missing-frontmatter-id';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);
const SKIP_DIRS = new Set(['scrapbook', 'node_modules', 'dist', '.git']);

interface CandidateFile {
  /** Absolute path to the candidate. */
  absolutePath: string;
  /** Why this file was considered (for operator-facing labels). */
  matchReason: 'template-path' | 'title-match' | 'basename-match';
}

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.')) return true;
  return SKIP_DIRS.has(name.toLowerCase());
}

function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  visit(dir);
  out.sort();
  return out;

  function visit(currentDir: string): void {
    let names: string[];
    try {
      names = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = join(currentDir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (shouldSkipDir(name)) continue;
        visit(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (MARKDOWN_EXTENSIONS.has(extname(name).toLowerCase())) {
        out.push(abs);
      }
    }
  }
}

function readTitle(absPath: string): string | undefined {
  try {
    const parsed = readFrontmatter(absPath);
    const t = parsed.data.title;
    return typeof t === 'string' ? t : undefined;
  } catch {
    return undefined;
  }
}

function basenameNoExt(p: string): string {
  return basename(p, extname(p));
}

/**
 * Search the content tree for files that could be bound to `entry`.
 * Excludes files already claiming a (different) id — those are not
 * candidates here; the duplicate-id and orphan rules handle them.
 */
export function findCandidatesForEntry(
  projectRoot: string,
  config: DoctorContext['config'],
  site: string,
  entry: CalendarEntry,
): CandidateFile[] {
  const candidates: CandidateFile[] = [];
  const seen = new Set<string>();
  const contentDir = resolveContentDir(projectRoot, config, site);

  function consider(abs: string, reason: CandidateFile['matchReason']): void {
    if (!existsSync(abs)) return;
    if (seen.has(abs)) return;
    // Skip files whose frontmatter already has a deskwork.id (they
    // belong to another entry or are duplicates — out of this rule's
    // scope). Top-level `id:` is the operator's keyspace per Issue #38
    // and doesn't disqualify a file as a candidate.
    try {
      const parsed = readFrontmatter(abs);
      const existingId = readDeskworkId(parsed.data);
      if (existingId !== undefined) {
        return;
      }
    } catch {
      // Unreadable frontmatter — skip; the index already reports it.
      return;
    }
    seen.add(abs);
    candidates.push({ absolutePath: abs, matchReason: reason });
  }

  // 1. Slug-template path.
  const templatePath = resolveBlogFilePath(
    projectRoot,
    config,
    site,
    entry.slug,
  );
  consider(templatePath, 'template-path');

  // 2. + 3. Walk content tree once, match by title and basename.
  let files: string[];
  try {
    files = collectMarkdownFiles(contentDir);
  } catch {
    return candidates;
  }
  const slugBasename = entry.slug.split('/').pop() ?? entry.slug;
  for (const abs of files) {
    if (seen.has(abs)) continue;
    const title = readTitle(abs);
    if (title !== undefined && title.trim() === entry.title.trim()) {
      consider(abs, 'title-match');
      continue;
    }
    const bn = basenameNoExt(abs);
    if (bn === slugBasename) {
      consider(abs, 'basename-match');
    }
  }

  return candidates;
}

/**
 * Write `deskwork.id: <entryId>` into the markdown file's frontmatter.
 * Idempotent when the file already carries the same id (no-op write
 * avoided). Issue #38: writes under the `deskwork:` namespace, not the
 * global top-level `id:`.
 */
export function bindFrontmatterId(absPath: string, entryId: string): void {
  const raw = readFileSync(absPath, 'utf-8');
  const updated = updateFrontmatter(raw, { deskwork: { id: entryId } });
  if (updated === raw) return;
  writeFileSync(absPath, updated, 'utf-8');
}

/**
 * Read `deskwork.id` from frontmatter data. Returns `undefined` when
 * either the `deskwork` block or the nested `id` is missing or
 * malformed. Used by candidate filters and the migration rule to keep
 * the namespaced-key reads consistent across rules.
 */
function readDeskworkId(data: Record<string, unknown>): string | undefined {
  const block = data.deskwork;
  if (block === undefined || block === null) return undefined;
  if (typeof block !== 'object' || Array.isArray(block)) return undefined;
  const id = (block as Record<string, unknown>).id;
  if (typeof id !== 'string') return undefined;
  const trimmed = id.trim();
  return trimmed === '' ? undefined : trimmed;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Calendar entries with no matching frontmatter id',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const entry of ctx.calendar.entries) {
      if (!entry.id) {
        // Calendar entries without an id are reported by
        // calendar-uuid-missing instead — keep concerns separate.
        continue;
      }
      if (ctx.index.byId.has(entry.id)) continue;
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message: `Entry "${entry.slug}" (id ${entry.id}) is not bound to any file via frontmatter id`,
        details: {
          entryId: entry.id,
          slug: entry.slug,
          title: entry.title,
          stage: entry.stage,
        },
      });
    }
    return findings;
  },

  async plan(ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const entryId = String(finding.details.entryId ?? '');
    const entry = ctx.calendar.entries.find((e) => e.id === entryId);
    if (!entry) {
      return {
        kind: 'report-only',
        finding,
        reason: `entry id ${entryId} no longer present in calendar — re-run audit`,
      };
    }
    const candidates = findCandidatesForEntry(
      ctx.projectRoot,
      ctx.config,
      ctx.site,
      entry,
    );
    const contentDir = resolveContentDir(ctx.projectRoot, ctx.config, ctx.site);

    if (candidates.length === 0) {
      return {
        kind: 'report-only',
        finding,
        reason:
          `no candidate file found under ${contentDir} for slug "${entry.slug}". ` +
          'Create the file (e.g. via `deskwork outline`) or move an existing one ' +
          'into place, then re-run.',
      };
    }
    if (candidates.length === 1) {
      const c = candidates[0];
      return {
        kind: 'apply',
        finding,
        summary: `write \`id: ${entry.id}\` into ${relative(ctx.projectRoot, c.absolutePath)} (${c.matchReason})`,
        payload: { absolutePath: c.absolutePath, entryId: entry.id },
      };
    }
    return {
      kind: 'prompt',
      finding,
      question: `Multiple candidate files for entry "${entry.slug}" (id ${entry.id}). Which file should carry the id?`,
      choices: candidates.map((c) => ({
        id: c.absolutePath,
        label: `${relative(ctx.projectRoot, c.absolutePath)} (${c.matchReason})`,
        payload: { absolutePath: c.absolutePath, entryId: entry.id },
      })),
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message: 'plan is not directly appliable; runner should resolve prompt first',
        skipReason: 'apply-failed',
      };
    }
    const absPath = String(plan.payload.absolutePath ?? '');
    const entryId = String(plan.payload.entryId ?? '');
    if (!absPath || !entryId) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing absolutePath or entryId',
        skipReason: 'apply-failed',
      };
    }
    try {
      bindFrontmatterId(absPath, entryId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `failed to write frontmatter id: ${reason}`,
        skipReason: 'apply-failed',
      };
    }
    return {
      finding: plan.finding,
      applied: true,
      message: `wrote id ${entryId} to ${relative(ctx.projectRoot, absPath)}`,
      details: { absolutePath: absPath, entryId },
    };
  },
};

export default rule;
