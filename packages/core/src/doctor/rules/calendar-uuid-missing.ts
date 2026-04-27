/**
 * Rule: calendar-uuid-missing.
 *
 * Detection: re-read the calendar markdown from disk and find rows
 * whose UUID cell is empty or missing. The in-memory parser auto-
 * backfills missing UUIDs, so the in-context calendar always has ids;
 * we have to look at the on-disk bytes directly to see what hasn't
 * been persisted yet.
 *
 * Repair: a single calendar write flushes the in-memory backfilled
 * ids to disk. We read the calendar via `readCalendar` (which assigns
 * UUIDs in-memory) and call `writeCalendar` to persist them.
 *
 * Sibling-relative imports per the project convention.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolveCalendarPath } from '../../paths.ts';
import { readCalendar, writeCalendar } from '../../calendar.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'calendar-uuid-missing';

interface RawRow {
  /** Slug parsed out of the row, for human-facing messages. */
  slug: string;
  /** Stage-table the row belonged to. */
  stage: string;
  /** Line number (1-based) in the calendar source. */
  line: number;
}

const STAGE_HEADER_RE = /^##\s+(.+)\s*$/;

/**
 * Walk the calendar markdown line-by-line, find stage tables, and
 * report rows whose UUID column is empty/missing.
 *
 * Tolerant of column ordering: we identify the UUID column index from
 * the table header (case-insensitive), then check each data row's
 * cell at that index.
 */
function scanRowsMissingUuid(markdown: string): RawRow[] {
  const lines = markdown.split('\n');
  const rows: RawRow[] = [];

  let currentStage: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stageMatch = line.match(STAGE_HEADER_RE);
    if (stageMatch) {
      const name = stageMatch[1].trim();
      // Only the lifecycle stage tables; Distribution / Shortform
      // sections aren't entry rows so we skip their tables here.
      if (name === 'Distribution' || name === 'Shortform Copy') {
        currentStage = null;
      } else {
        currentStage = name;
      }
      i++;
      continue;
    }
    if (line.startsWith('|') && currentStage) {
      // Table found — first row is the header.
      const headerCells = parseRow(line);
      const uuidIdx = headerCells.findIndex(
        (c) => c.trim().toLowerCase() === 'uuid' || c.trim().toLowerCase() === 'id',
      );
      const slugIdx = headerCells.findIndex(
        (c) => c.trim().toLowerCase() === 'slug',
      );
      i++;
      // Optional separator row.
      if (i < lines.length && /^\|[\s:-]+\|/.test(lines[i])) i++;
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = parseRow(lines[i]);
        const slug = slugIdx >= 0 ? (cells[slugIdx] ?? '').trim() : '';
        if (slug) {
          const uuidCell = uuidIdx >= 0 ? (cells[uuidIdx] ?? '').trim() : '';
          if (!uuidCell) {
            rows.push({
              slug,
              stage: currentStage,
              line: i + 1,
            });
          }
        }
        i++;
      }
      continue;
    }
    i++;
  }

  return rows;
}

function parseRow(line: string): string[] {
  return line.split('|').slice(1, -1).map((c) => c.trim());
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Calendar rows with missing UUIDs (not yet persisted)',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    const calendarPath = resolveCalendarPath(
      ctx.projectRoot,
      ctx.config,
      ctx.site,
    );
    if (!existsSync(calendarPath)) return [];
    let raw: string;
    try {
      raw = readFileSync(calendarPath, 'utf-8');
    } catch {
      return [];
    }
    const rows = scanRowsMissingUuid(raw);
    if (rows.length === 0) return [];
    return [
      {
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'warning',
        message: `${rows.length} calendar row(s) have no UUID on disk; in-memory parser will backfill on next write`,
        details: {
          calendarPath,
          rows: rows.map((r) => ({ slug: r.slug, stage: r.stage, line: r.line })),
        },
      },
    ];
  },

  async plan(ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    const calendarPath = String(finding.details.calendarPath ?? '');
    if (!calendarPath) {
      return {
        kind: 'report-only',
        finding,
        reason: 'finding missing calendarPath — re-run audit',
      };
    }
    return {
      kind: 'apply',
      finding,
      summary: `re-write ${calendarPath} so the in-memory backfilled UUIDs land on disk`,
      payload: { calendarPath, site: ctx.site },
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
    const calendarPath = String(plan.payload.calendarPath ?? '');
    if (!calendarPath) {
      return {
        finding: plan.finding,
        applied: false,
        message: 'apply payload missing calendarPath',
      };
    }
    try {
      // readCalendar populates missing UUIDs in-memory; writeCalendar
      // flushes the populated calendar back to disk. One round-trip
      // migrates every row — also true at the call site here.
      const cal = readCalendar(calendarPath);
      writeCalendar(calendarPath, cal);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `failed to re-write calendar: ${reason}`,
      };
    }
    // Re-read what's now on disk to update the runner's view of
    // ctx.calendar — though strictly the runner doesn't depend on
    // it past this point.
    void ctx;
    return {
      finding: plan.finding,
      applied: true,
      message: `re-wrote ${calendarPath} with UUIDs populated`,
      details: { calendarPath },
    };
  },
};

export default rule;
