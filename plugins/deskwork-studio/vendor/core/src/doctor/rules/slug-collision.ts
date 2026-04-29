/**
 * Rule: slug-collision.
 *
 * Audit: two or more calendar entries share the same slug. With UUID
 * identity this is no longer a hard error (joins go through id), but
 * it's still a bug — the host renderer maps URLs by slug, so two
 * entries claiming the same slug produces duplicate or hidden public
 * URLs.
 *
 * Repair: rename one slug. Doctor doesn't pick which one — that's an
 * editorial decision (which entry "owns" the public URL). The rule
 * reports findings; with no interactive UI it returns `report-only`.
 * `--yes` mode skips.
 */

import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'slug-collision';

interface CollisionGroup {
  slug: string;
  /** Calendar-entry ids sharing this slug, in iteration order. */
  entryIds: string[];
}

function findCollisions(ctx: DoctorContext): CollisionGroup[] {
  const bySlug = new Map<string, string[]>();
  for (const e of ctx.calendar.entries) {
    if (!e.slug) continue;
    const list = bySlug.get(e.slug);
    if (list) list.push(e.id ?? '');
    else bySlug.set(e.slug, [e.id ?? '']);
  }
  const out: CollisionGroup[] = [];
  for (const [slug, ids] of bySlug) {
    if (ids.length > 1) out.push({ slug, entryIds: ids });
  }
  return out;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Duplicate slugs in the calendar',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    return findCollisions(ctx).map((g) => ({
      ruleId: RULE_ID,
      site: ctx.site,
      severity: 'error',
      message: `slug "${g.slug}" is shared by ${g.entryIds.length} calendar entries`,
      details: { slug: g.slug, entryIds: g.entryIds },
    }));
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    return {
      kind: 'report-only',
      finding,
      reason:
        'pick which entry owns the slug and rename the others via `deskwork rename-slug` ' +
        '(or hand-edit the calendar). Doctor refuses to choose automatically — slug is ' +
        'host-public-URL, an editorial decision.',
    };
  },

  async apply(_ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    return {
      finding: plan.finding,
      applied: false,
      message: 'slug-collision has no automatic repair (operator must rename)',
      skipReason: 'editorial-decision',
    };
  },
};

export default rule;
