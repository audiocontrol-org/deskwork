/**
 * Rule: entry-address-reason-missing.
 *
 * Phase 8 Step 8.1.2 (Part 1) — companion rule to the `AddressAnnotation`
 * schema tightening that lands in Part 2 of the same step. Per the PRD
 * acceptance criterion ("required free-text disposition reason captured
 * at iterate time"), `reason: string` will become REQUIRED on every
 * `address`-type annotation whose `disposition === 'addressed'`. That
 * read-side tightening would break any legacy `address` annotations on
 * disk that were written before the contract changed — the strict
 * `JournalEventSchema.safeParse` in `journal/read.ts` would silently SKIP
 * such events and the operator would never learn the data was there.
 *
 * This rule SURFACES those legacy reasonless `addressed` annotations
 * BEFORE the schema tightens, so canary projects can audit cleanup state
 * first. It walks the raw journal directory directly
 * (`<projectRoot>/.deskwork/review-journal/history/*.json`), isolates
 * every `entry-annotation` event whose `annotation.type === 'address'`
 * AND whose `annotation.disposition === 'addressed'` AND whose
 * `annotation.reason` is missing or an empty string, then emits one
 * finding per offending annotation — naming the entry UUID, the
 * annotation id, the journal-file path, and the offending shape so the
 * operator can decide whether to delete the legacy annotation (data loss
 * via tombstone), back-fill `reason` via a manual edit (journals are
 * append-only on the write path, so a hand-edit of the journal JSON is
 * the only way to retroactively add a reason), or acknowledge the
 * finding as known legacy (the rule will keep surfacing it).
 *
 * Severity: `error`. Reasonless `addressed` annotations are data-quality
 * defects that block the PRD's "required free-text disposition reason"
 * contract; operators must repair them.
 *
 * Why scope `reason` requirement only to `disposition === 'addressed'`?
 * The PRD's acceptance criterion explicitly names addressed-at-iterate-
 * time as the contract. `deferred` and `wontfix` dispositions DO carry
 * editorial weight too, but the contract surface this step ships is
 * scoped to `addressed` — the disposition that claims a comment was
 * resolved by the new revision. Without the reason, the studio's
 * disposition-trace affordance (Task 8.6) has nothing operator-readable
 * to render alongside the diff slice. Reasonless `deferred` / `wontfix`
 * remain a non-finding for this rule.
 *
 * Repair: operator-driven, not auto-applied. The choice between
 * deletion-via-tombstone (data loss), manual back-fill (hand-edit of the
 * journal JSON), or operator-acknowledged legacy (the rule keeps
 * surfacing it) is an editorial decision the rule cannot make.
 * `plan()` returns `report-only` with the three repair paths in the
 * reason.
 *
 * Sibling-relative imports per the project convention — same pattern as
 * the AUDIT-20260601-08 sibling rule `entry-anchor-shape`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { isFirstSite } from '../project-scope-gate.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'entry-address-reason-missing';

/**
 * Narrowing helper — recognize an entry-annotation `address` event whose
 * `disposition === 'addressed'` and whose `reason` is missing or empty.
 * Returns null when the event does not match.
 *
 * The caller has already JSON.parsed the raw file; this helper only
 * inspects the parsed object's shape without validating against any
 * schema (so legacy reasonless `address` events are not filtered out).
 *
 * "Missing or empty" matches the contract Part 2 enforces via
 * `z.string().min(1)`: an empty string is NOT a valid reason, so legacy
 * data with `reason: ''` is surfaced here for the same reason a missing
 * field is.
 */
function extractReasonlessAddressedEvent(json: unknown): {
  entryId: string;
  annotationId: string;
  disposition: string;
  reasonShape: 'missing' | 'empty-string';
} | null {
  if (typeof json !== 'object' || json === null) return null;
  const ev = json as Record<string, unknown>;
  if (ev.kind !== 'entry-annotation') return null;
  if (typeof ev.entryId !== 'string') return null;
  const annotation = ev.annotation;
  if (typeof annotation !== 'object' || annotation === null) return null;
  const ann = annotation as Record<string, unknown>;
  if (ann.type !== 'address') return null;
  if (ann.disposition !== 'addressed') return null;
  if (typeof ann.id !== 'string') return null;
  if (!('reason' in ann) || ann.reason === undefined || ann.reason === null) {
    return {
      entryId: ev.entryId,
      annotationId: ann.id,
      disposition: String(ann.disposition),
      reasonShape: 'missing',
    };
  }
  if (typeof ann.reason === 'string' && ann.reason.length === 0) {
    return {
      entryId: ev.entryId,
      annotationId: ann.id,
      disposition: String(ann.disposition),
      reasonShape: 'empty-string',
    };
  }
  return null;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label:
    'Address annotations with `addressed` disposition but missing `reason`' +
    ' (Phase 8 Step 8.1.2 safety net)',

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
      const candidate = extractReasonlessAddressedEvent(json);
      if (!candidate) continue;
      const journalPathRelative = relative(ctx.projectRoot, filePath);
      findings.push({
        ruleId: RULE_ID,
        site: ctx.site,
        severity: 'error',
        message:
          `Address annotation "${candidate.annotationId}" on entry ` +
          `${candidate.entryId} has \`disposition: 'addressed'\` but ` +
          `\`reason\` is ${candidate.reasonShape === 'missing' ? 'missing' : 'an empty string'} ` +
          `(journal: ${journalPathRelative}). Repair: operator-driven — ` +
          `delete the legacy annotation via a tombstone (data loss), ` +
          `back-fill \`reason\` via a manual edit of the journal JSON, ` +
          `OR acknowledge the finding as known legacy (the rule will ` +
          `keep surfacing it). The Phase 8 Step 8.1.2 contract requires ` +
          `a non-empty \`reason\` on every \`addressed\` disposition so ` +
          `the studio's disposition-trace affordance can render an ` +
          `operator-readable label next to the diff slice.`,
        details: {
          entryId: candidate.entryId,
          annotationId: candidate.annotationId,
          disposition: candidate.disposition,
          reasonShape: candidate.reasonShape,
          journalPath: journalPathRelative,
        },
      });
    }
    return findings;
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    // Report-only: the choice between deletion-via-tombstone, manual
    // back-fill, or operator-acknowledged legacy is an editorial
    // decision the rule cannot make for the operator. The `reason`
    // names the three repair paths so the runner's interactive output
    // gives the operator a concrete next step.
    const annotationId = String(finding.details.annotationId ?? '');
    const journalPath = String(finding.details.journalPath ?? '');
    return {
      kind: 'report-only',
      finding,
      reason:
        `Operator-driven repair for address annotation ${annotationId} ` +
        `(journal: ${journalPath}). Options: (1) delete the legacy ` +
        `annotation via a tombstone (data loss), (2) manually back-fill ` +
        `\`reason\` on the journal JSON (hand-edit), or (3) acknowledge ` +
        `the finding as known legacy. The Phase 8 Step 8.1.2 contract ` +
        `requires a non-empty \`reason\` on every \`addressed\` ` +
        `disposition.`,
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
        'entry-address-reason-missing has no auto-repair; operator must ' +
        'decide between tombstone-deletion, manual back-fill, or ' +
        'acknowledging the finding as known legacy.',
      skipReason: 'editorial-decision',
    };
  },
};

export default rule;
