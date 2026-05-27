/**
 * Rule: orphan-frontmatter-id.
 *
 * Audit: every entry in the content index whose id has no matching
 * calendar entry. The file is bound to "something", but the calendar
 * doesn't know about it.
 *
 * Repair: there are three plausible operator intents — (a) add a
 * calendar row for the file, (b) clear the orphan id from the file
 * (un-bind), or (c) leave it alone. Without a way to gather the
 * intent, the rule reports findings and presents a prompt; with
 * `--yes`, the safest action is "do nothing" — auto-creating
 * calendar rows or auto-deleting frontmatter is destructive.
 *
 * Issue #300 (closed Phase 4):
 *
 *   The legacy `parseCalendar` helper that feeds `ctx.calendar.entries`
 *   only recognized the pre-graphical-entries 7-stage section list
 *   (`Ideas / Planned / Outlining / Drafting / Review / Paused /
 *   Published`). Entries under `## Final`, `## Blocked`, or
 *   `## Cancelled` sections never made it into the parsed entry list,
 *   so this rule produced false-positive "orphan" findings against
 *   every Final / Blocked / Cancelled entry in the project.
 *
 *   The fix (per #300's recommended option B): do a UUID-set scan of
 *   every table row across every section in the calendar markdown,
 *   independent of the section heading. The UUID set is the
 *   authoritative ground truth — if the UUID appears in ANY table row
 *   anywhere in the calendar, the file is not orphaned.
 *
 *   The scan is permissive about section headers (it doesn't care
 *   whether the section is `## Final`, `## Blocked`, `## Cancelled`,
 *   `# Lane: feature-doc` followed by `## Drafting`, or any other
 *   shape). The cost is potentially over-counting: a UUID that
 *   appears in a multi-lane composed view's rendered preview table
 *   would also be in the set. The over-counting is the correct
 *   bias — we'd rather miss an orphan finding than file a
 *   false-positive against a real entry.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter, removeFrontmatterPaths } from '../../frontmatter.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'orphan-frontmatter-id';

/**
 * Pattern matching a UUID-v4 in a markdown table row. Pins on a
 * leading `|` to anchor the first column (the UUID column in every
 * deskwork-emitted table). Permissive about surrounding whitespace.
 */
const UUID_IN_ROW_RE = /^\|\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\|/gim;

/**
 * Scan the raw `calendar.md` markdown and collect every UUID that
 * appears in a table row (first column). The scan is section-agnostic
 * — it accepts UUIDs under any heading at any depth.
 *
 * Falls back to an empty set when the file doesn't exist (a project
 * that has only just been bootstrapped has no calendar yet; orphan
 * detection against an empty set produces a finding for every indexed
 * file, which is the correct behavior — they ARE orphans).
 */
function readCalendarUuidSet(projectRoot: string): Set<string> {
  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
  let raw: string;
  try {
    raw = readFileSync(calendarPath, 'utf-8');
  } catch {
    return new Set();
  }
  const out = new Set<string>();
  for (const match of raw.matchAll(UUID_IN_ROW_RE)) {
    out.add(match[1].toLowerCase());
  }
  return out;
}

/**
 * Clear the `deskwork.id` field from a markdown file's frontmatter.
 * Returns true when the field was present and cleared; false when there
 * was nothing to clear. Issue #38: scoped to the namespaced key — top-
 * level `id:` belongs to the operator and is left alone.
 *
 * Uses the round-trip-preserving emitter so untouched keys keep their
 * exact bytes (quoting, comments, ordering). Empty `deskwork:` blocks
 * are pruned via `removeFrontmatterPaths`.
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

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Files with frontmatter ids that are not in the calendar',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    // Issue #300: union the parser-derived UUID set with the
    // section-agnostic UUID set scraped from the raw calendar markdown.
    // The parser misses sections it doesn't recognize (Final, Blocked,
    // Cancelled, and any future lane-template stages); the raw scan
    // picks them up regardless of section heading.
    const calendarIds = new Set<string>();
    for (const e of ctx.calendar.entries) {
      if (e.id) calendarIds.add(e.id.toLowerCase());
    }
    for (const id of readCalendarUuidSet(ctx.projectRoot)) {
      calendarIds.add(id);
    }
    for (const [id, absPath] of ctx.index.byId) {
      if (calendarIds.has(id.toLowerCase())) continue;
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message: `File ${relative(ctx.projectRoot, absPath)} carries id ${id}, which is not in the calendar`,
        details: { absolutePath: absPath, entryId: id },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const absPath = String(finding.details.absolutePath ?? '');
    const entryId = String(finding.details.entryId ?? '');
    return {
      kind: 'prompt',
      finding,
      question: `File ${absPath} has id ${entryId} but no calendar entry matches. Pick an action:`,
      choices: [
        {
          id: 'none',
          label: 'leave as-is (default; review manually)',
          payload: { action: 'none' },
        },
        {
          id: 'clear-id',
          label: `clear the id from ${absPath} (un-bind the file)`,
          payload: { action: 'clear-id', absolutePath: absPath },
        },
      ],
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
    const action = String(plan.payload.action ?? '');
    if (action === 'none') {
      return {
        finding: plan.finding,
        applied: false,
        message: 'left file unchanged per operator choice',
        skipReason: 'no-action-needed',
      };
    }
    if (action === 'clear-id') {
      const absPath = String(plan.payload.absolutePath ?? '');
      if (!absPath) {
        return {
          finding: plan.finding,
          applied: false,
          message: 'clear-id apply payload missing absolutePath',
          skipReason: 'apply-failed',
        };
      }
      try {
        const changed = clearFrontmatterId(absPath);
        if (!changed) {
          return {
            finding: plan.finding,
            applied: false,
            message: `no id field in ${relative(ctx.projectRoot, absPath)} to clear`,
            skipReason: 'no-action-needed',
          };
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          finding: plan.finding,
          applied: false,
          message: `failed to clear frontmatter id: ${reason}`,
          skipReason: 'apply-failed',
        };
      }
      return {
        finding: plan.finding,
        applied: true,
        message: `cleared id from ${relative(ctx.projectRoot, absPath)}`,
        details: { absolutePath: absPath },
      };
    }
    return {
      finding: plan.finding,
      applied: false,
      message: `unknown apply action: ${action}`,
      skipReason: 'apply-failed',
    };
  },
};

export default rule;
