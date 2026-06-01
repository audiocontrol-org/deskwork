/**
 * Rule: entry-anchor-shape.
 *
 * AUDIT-20260601-08 — companion rule to the spatialAnchor strict-shape
 * tightening landed by AUDIT-20260601-07 (`SpatialAnchorSchema` rewritten
 * as `z.discriminatedUnion('kind', [...])` in
 * `packages/core/src/schema/draft-annotation.ts`). The tightening sits on
 * BOTH the write path (`addEntryAnnotation` validates via
 * `appendJournalEvent` → `JournalEventSchema.safeParse`) AND the read
 * path (`readJournalEvents` validates the same way). The read-side
 * validator silently SKIPS events that fail to parse — so any legacy
 * loose anchors that exist on disk (e.g. `{kind:'pixel'}` with no coords,
 * or `{kind:'pixel', selector:'#x'}`) disappear from the read stream
 * without the operator ever knowing the data was there.
 *
 * This rule SURFACES those legacy loose anchors. It walks the raw
 * journal directory directly (`<projectRoot>/.deskwork/review-journal/
 * history/*.json`), isolates each `entry-annotation` event whose
 * `annotation.type === 'comment'` AND whose `annotation.spatialAnchor`
 * field is present, then `safeParse`s the spatialAnchor against the
 * strict `SpatialAnchorSchema` directly. Each parse failure becomes a
 * finding — naming the entry UUID, the annotation id, and the offending
 * shape so the operator can decide whether to delete the legacy
 * annotation (data loss) or back-fill the missing field manually.
 *
 * Practical risk today: LOW per AUDIT-20260601-07's framing — the
 * anchor fields are referenced in only four files and there is no
 * writer/renderer yet, so no loose anchors should exist on disk. This
 * rule will find zero findings on every project until a writer lands.
 * That is the POINT — the rule is the safety net for when a writer
 * DOES land later. The append-only journal is permanent storage; once
 * bad anchors accumulate, the strict cutover becomes a breaking
 * migration. This rule is the cheap insurance the SKILL.md
 * naming-reveals-intent guidance asks for.
 *
 * Severity: `error`. Legacy loose anchors are data-quality defects that
 * block the strict-schema contract; operators must repair them.
 *
 * Repair: operator-driven, not auto-applied. The choice between
 * deletion (data loss), back-fill (manual edit of the journal file),
 * or a future normalizer is an editorial decision the rule cannot make.
 * `plan()` returns `report-only` with the per-finding guidance in the
 * reason.
 *
 * Sibling-relative imports per the project convention.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { SpatialAnchorSchema } from '../../schema/draft-annotation.ts';
import { isFirstSite } from '../project-scope-gate.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'entry-anchor-shape';

/**
 * Narrowing helper — recognize an entry-annotation comment event with a
 * present spatialAnchor field, regardless of whether the inner shape is
 * valid. Returns null when the event does not match.
 *
 * The caller has already JSON.parsed the raw file; this helper only
 * inspects the parsed object's shape without validating against any
 * schema (so legacy loose anchors are not filtered out).
 */
function extractCommentAnchorEvent(json: unknown): {
  entryId: string;
  annotationId: string;
  anchor: unknown;
} | null {
  if (typeof json !== 'object' || json === null) return null;
  const ev = json as Record<string, unknown>;
  if (ev.kind !== 'entry-annotation') return null;
  if (typeof ev.entryId !== 'string') return null;
  const annotation = ev.annotation;
  if (typeof annotation !== 'object' || annotation === null) return null;
  const ann = annotation as Record<string, unknown>;
  if (ann.type !== 'comment') return null;
  if (!('spatialAnchor' in ann)) return null;
  if (ann.spatialAnchor === undefined) return null;
  if (typeof ann.id !== 'string') return null;
  return {
    entryId: ev.entryId,
    annotationId: ann.id,
    anchor: ann.spatialAnchor,
  };
}

const rule: DoctorRule = {
  id: RULE_ID,
  label:
    'Comment annotations with malformed `spatialAnchor` (AUDIT-20260601-08 safety net)',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    if (!isFirstSite(ctx)) return [];

    const journalDir = join(
      ctx.projectRoot,
      '.deskwork',
      'review-journal',
      'history',
    );

    let names: string[];
    try {
      names = await readdir(journalDir);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return [];
      // Directory-level read failure — nothing useful this rule can
      // say. Leave the report empty.
      return [];
    }

    const findings: Finding[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const filePath = join(journalDir, name);
      let raw: string;
      try {
        raw = await readFile(filePath, 'utf8');
      } catch {
        // Per-file read failure is a corruption signal sibling rules
        // own (schema-rejected etc.). This rule only inspects events
        // that load successfully.
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      const candidate = extractCommentAnchorEvent(json);
      if (!candidate) continue;
      const parsed = SpatialAnchorSchema.safeParse(candidate.anchor);
      if (parsed.success) continue;
      const journalPathRelative = relative(ctx.projectRoot, filePath);
      const shapeJson = serializeShape(candidate.anchor);
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'error',
        message:
          `Comment annotation "${candidate.annotationId}" on entry ` +
          `${candidate.entryId} has a malformed \`spatialAnchor\` ` +
          `(journal: ${journalPathRelative}). Offending shape: ${shapeJson}. ` +
          `Repair: operator-driven — delete the legacy annotation (data ` +
          `loss), back-fill the missing field via a manual edit of the ` +
          `journal JSON, OR add a normalizer in a follow-up. The ` +
          `discriminated-union schema landed by AUDIT-20260601-07 ` +
          `requires per-kind shape: \`pixel\` needs \`{x, y}\`; ` +
          `\`dom-selector\` and \`svg-element\` each need \`{selector}\`.`,
        details: {
          entryId: candidate.entryId,
          annotationId: candidate.annotationId,
          journalPath: journalPathRelative,
          offendingShape: shapeJson,
        },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    // Report-only: the choice between deletion (data loss), manual
    // back-fill, or a future normalizer is an editorial decision the
    // rule cannot make for the operator. The `reason` names the three
    // repair paths so the runner's interactive output gives the
    // operator a concrete next step.
    const annotationId = String(finding.details.annotationId ?? '');
    const journalPath = String(finding.details.journalPath ?? '');
    return {
      kind: 'report-only',
      finding,
      reason:
        `Operator-driven repair for annotation ${annotationId} (journal: ` +
        `${journalPath}). Options: (1) delete the legacy annotation ` +
        `(data loss), (2) manually back-fill the missing field on the ` +
        `journal JSON, or (3) add a normalizer in a follow-up. The ` +
        `strict discriminated-union schema requires \`{x, y}\` for ` +
        `\`kind:'pixel'\` and \`{selector}\` for \`kind:'dom-selector'\` ` +
        `or \`kind:'svg-element'\`.`,
    };
  },

  async apply(_ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    // `plan()` always returns `report-only`; the runner never invokes
    // `apply()` on a report-only plan. This branch exists only to
    // satisfy the `DoctorRule` interface contract.
    return {
      finding: plan.finding,
      applied: false,
      message:
        'entry-anchor-shape has no auto-repair; operator must decide ' +
        'between deletion, manual back-fill, or a follow-up normalizer.',
      skipReason: 'editorial-decision',
    };
  },
};

/**
 * Render an unknown shape as a compact JSON-ish string for finding
 * messages. Falls back to `String()` when JSON serialization throws
 * (e.g. cyclic objects from hand-edited journals).
 */
function serializeShape(shape: unknown): string {
  try {
    return JSON.stringify(shape);
  } catch {
    return String(shape);
  }
}

export default rule;
