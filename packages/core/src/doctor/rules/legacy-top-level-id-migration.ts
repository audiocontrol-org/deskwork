/**
 * Rule: legacy-top-level-id-migration.
 *
 * Issue #38: v0.7.0 / v0.7.1 of deskwork wrote (and read) the calendar
 * binding key as a top-level `id:` field in frontmatter. Starting in
 * v0.7.2 the canonical location is `deskwork.id`, scoping the binding
 * to a `deskwork:` namespace so deskwork doesn't claim the operator's
 * global keyspace.
 *
 * Audit: walk every markdown file under `<contentDir>` and find files
 * where:
 *   1. top-level `id:` is present AND its value is a UUID matching a
 *      calendar entry, AND
 *   2. `deskwork.id` is NOT present.
 *
 * The (1)+(2) conjunction makes the rule idempotent: once a file has
 * migrated to the namespaced form, it is no longer reported. Files
 * with a top-level `id:` whose value is NOT a calendar UUID belong to
 * the operator and are left alone.
 *
 * Repair: round-trip-preserving rewrite — add `deskwork.id` with the
 * old value, remove the top-level `id:`, leave every other byte
 * untouched. Safe for `--yes` / `--fix=all` mode (clear-and-move with
 * no editorial decision required).
 *
 * Sibling-relative imports per the project convention.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { resolveContentDir } from '../../paths.ts';
import {
  parseFrontmatter,
  removeFrontmatterPaths,
  updateFrontmatter,
} from '../../frontmatter.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'legacy-top-level-id-migration';

const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.mdx',
  '.markdown',
]);
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'scrapbook',
  'node_modules',
  'dist',
  '.git',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface LegacyHit {
  /** Absolute path to the file with a legacy top-level id. */
  absolutePath: string;
  /** The UUID value at the top-level id field. */
  legacyId: string;
}

/**
 * Inspect a single file's frontmatter and decide if it qualifies for
 * migration. The conjunction is strict on purpose:
 *  - top-level `id:` must be a string AND match the UUID shape
 *  - that UUID must be present in the calendar (otherwise it isn't
 *    deskwork's id; it's the operator's)
 *  - `deskwork.id` must NOT exist (otherwise the file is already on
 *    the new shape; ignoring leaves the rule idempotent across runs)
 */
function classify(
  absPath: string,
  calendarIds: ReadonlySet<string>,
): LegacyHit | null {
  let parsed;
  try {
    parsed = parseFrontmatter(readFileSync(absPath, 'utf-8'));
  } catch {
    return null;
  }
  const topLevelId = parsed.data.id;
  if (typeof topLevelId !== 'string') return null;
  const trimmed = topLevelId.trim();
  if (trimmed === '' || !UUID_RE.test(trimmed)) return null;
  if (!calendarIds.has(trimmed)) return null;

  const block = parsed.data.deskwork;
  if (block !== undefined && block !== null) {
    if (typeof block === 'object' && !Array.isArray(block)) {
      const nestedId = (block as Record<string, unknown>).id;
      if (typeof nestedId === 'string' && nestedId.trim() !== '') {
        return null;
      }
    }
  }
  return { absolutePath: absPath, legacyId: trimmed };
}

/**
 * Apply the migration to a single file:
 * 1. Add `deskwork.id` with the old value.
 * 2. Remove the top-level `id:`.
 *
 * Both writes use the round-trip-preserving frontmatter API so every
 * other byte stays put.
 */
export function migrateLegacyTopLevelId(absPath: string, legacyId: string): void {
  const raw = readFileSync(absPath, 'utf-8');
  const withDeskwork = updateFrontmatter(raw, { deskwork: { id: legacyId } });
  const withoutTopLevel = removeFrontmatterPaths(withDeskwork, [['id']]);
  if (withoutTopLevel === raw) return;
  writeFileSync(absPath, withoutTopLevel, 'utf-8');
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Frontmatter id at top level should be under `deskwork:` namespace',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const contentDir = resolveContentDir(
      ctx.projectRoot,
      ctx.config,
      ctx.site,
    );
    const calendarIds = new Set<string>();
    for (const e of ctx.calendar.entries) {
      if (e.id) calendarIds.add(e.id);
    }

    let files: string[];
    try {
      files = collectMarkdownFiles(contentDir);
    } catch {
      return [];
    }

    const findings: Finding[] = [];
    for (const abs of files) {
      const hit = classify(abs, calendarIds);
      if (hit === null) continue;
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message:
          `File ${relative(ctx.projectRoot, abs)} has a top-level \`id:\` ` +
          `that should be migrated under \`deskwork.id\``,
        details: {
          absolutePath: abs,
          legacyId: hit.legacyId,
        },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const absPath = String(finding.details.absolutePath ?? '');
    const legacyId = String(finding.details.legacyId ?? '');
    if (!absPath || !legacyId) {
      return {
        kind: 'report-only',
        finding,
        reason: 'finding missing absolutePath or legacyId — re-run audit',
      };
    }
    return {
      kind: 'apply',
      finding,
      summary:
        `move top-level id ${legacyId} to deskwork.id in ${absPath}`,
      payload: { absolutePath: absPath, legacyId },
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message:
          'plan is not directly appliable; runner should resolve prompt first',
      };
    }
    const absPath = String(plan.payload.absolutePath ?? '');
    const legacyId = String(plan.payload.legacyId ?? '');
    if (!absPath || !legacyId) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing absolutePath or legacyId',
      };
    }
    try {
      migrateLegacyTopLevelId(absPath, legacyId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `failed to migrate frontmatter id: ${reason}`,
      };
    }
    return {
      finding: plan.finding,
      applied: true,
      message:
        `migrated id ${legacyId} from top-level to deskwork.id in ` +
        relative(ctx.projectRoot, absPath),
      details: { absolutePath: absPath, legacyId },
    };
  },
};

export default rule;
