import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry } from '../schema/entry.ts';
import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
import {
  assertStageInTemplate,
  isOffPipelineStageInTemplate,
  terminalLinearStage,
} from '../pipelines/helpers.ts';

interface CancelOptions {
  readonly uuid: string;
  readonly reason?: string;
  /**
   * Phase 7 Task 7.2 Step 7.2.6 (graphical-entries). When `true`,
   * cancel cascades to every entry in `members[]` (recursively if any
   * member is itself a group, though doctor's `group-recursive` rule
   * disallows that shape per v1). The cascade is a best-effort
   * walk — members already off-pipeline (Cancelled / Blocked / etc.)
   * are SKIPPED rather than refused, so cascading on a partially-
   * cancelled group still cancels the remainder.
   *
   * Default behaviour (no `cascade`): the group's OWN stage flips to
   * Cancelled; members are untouched. Per the universal-verb-no-
   * cascade rule (DESKWORK-STATE-MACHINE.md Commandment II + PRD §
   * Group lifecycle edge cases), cancel is opt-in.
   *
   * Non-group entries (no `members[]` array, or empty) ignore this
   * flag — there's nothing to cascade into.
   */
   readonly cascade?: boolean;
}

interface CancelledMember {
  readonly entryId: string;
  readonly slug: string;
  readonly fromStage: string;
}

interface SkippedMember {
  readonly entryId: string;
  readonly slug: string;
  readonly reason: string;
}

interface CancelResult {
  readonly entryId: string;
  /**
   * Per Phase 4 (graphical-entries) the verb is lane-template-aware.
   * `toStage` is whichever off-pipeline stage the template carries as
   * its cancel destination — `Cancelled` is the reserved name and is
   * present in every preset; operator-authored templates that drop it
   * fail at runtime with a configuration error.
   */
  readonly fromStage: string;
  readonly toStage: string;
  /**
   * Members the cascade actually transitioned to Cancelled. Empty
   * when `cascade !== true` or when the entry has no members.
   */
  readonly cascadedMembers?: readonly CancelledMember[];
  /**
   * Members the cascade SKIPPED (already off-pipeline, or terminal
   * stage). Surfaced so the CLI / operator can audit what was passed
   * over. Empty when `cascade !== true`.
   */
  readonly skippedMembers?: readonly SkippedMember[];
}

/**
 * The reserved off-pipeline stage name for cancellations. Per
 * DESKWORK-STATE-MACHINE.md and the PipelineTemplate schema's
 * `linearStages.includes('Cancelled')` refinement, `Cancelled` is
 * never a linear stage; templates that include `Cancelled` MUST list
 * it under `offPipelineStages`. The verb checks the bound template's
 * off-pipeline list at runtime to surface configuration drift.
 */
const CANCEL_STAGE = 'Cancelled';

/**
 * Internal cascade walker (Step 7.2.7, graphical-entries, GitHub
 * #360 / AUDIT-20260529-18).
 *
 * Does everything the public `cancelEntry` did before the walker /
 * wrapper split EXCEPT call `regenerateCalendar` — the wrapper is
 * responsible for the single boundary regenerate. Used by the
 * cascade walk to recursively cancel every member without N+1
 * calendar regenerations.
 *
 * Behaviour-preserving: same refusals, same `CancelResult` shape
 * (including `cascadedMembers` / `skippedMembers` arrays when
 * `cascade === true`), same journal events fired per entry. The
 * only externally-observable difference is that `calendar.md` is
 * NOT rewritten by this function; the caller must invoke
 * `regenerateCalendar` itself to keep the calendar in sync.
 */
async function cancelEntryWithoutCalendarRegen(
  projectRoot: string,
  opts: CancelOptions,
): Promise<CancelResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const from = sidecar.currentStage;

  assertStageInTemplate(template, from, 'cancelEntry');

  // Templates without `Cancelled` in offPipelineStages cannot host the
  // cancel verb. The schema permits this (cancel-free templates are a
  // valid experiment); the verb refuses at runtime with a clear error.
  if (!template.offPipelineStages.includes(CANCEL_STAGE)) {
    throw new Error(
      `Cannot cancel: pipeline template "${template.id}" does not include "${CANCEL_STAGE}" ` +
        `in offPipelineStages. The cancel verb requires the template to reserve "${CANCEL_STAGE}" ` +
        `as its cancellation destination. ` +
        `Available off-pipeline stages: ${template.offPipelineStages.join(', ') || '(none)'}.`,
    );
  }

  const terminal = terminalLinearStage(template);
  if (from === terminal) {
    throw new Error(
      `Cannot cancel: entry is at terminal stage "${from}" of pipeline "${template.id}".`,
    );
  }
  if (isOffPipelineStageInTemplate(template, from)) {
    throw new Error(`Cannot cancel: entry is already ${from} (off-pipeline).`);
  }

  const at = new Date().toISOString();
  const updated: Entry = {
    ...sidecar,
    currentStage: CANCEL_STAGE,
    priorStage: from,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: CANCEL_STAGE,
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });

  // Member cascade (Phase 7 Task 7.2 Step 7.2.6). Only fires when
  // the caller explicitly opted in via `cascade: true`. Per the
  // universal-verb-no-cascade rule (Commandment II + PRD § Group
  // lifecycle), cancel does NOT propagate to members by default.
  // When the flag IS set, we walk `members[]` and call THIS walker
  // (not the public wrapper) recursively for each — recursive
  // groups would cascade transitively, though doctor's
  // `group-recursive` rule (Task 7.5.1) refuses that shape; the
  // cascade here is the operator-visible behaviour the flag
  // promises. Step 7.2.7 moved the recursive call from the public
  // `cancelEntry` to this walker so calendar regeneration fires
  // exactly once at the cascade boundary (the public wrapper)
  // rather than N+1 times.
  const cascadedMembers: CancelledMember[] = [];
  const skippedMembers: SkippedMember[] = [];
  if (
    opts.cascade === true
    && Array.isArray(sidecar.members)
    && sidecar.members.length > 0
  ) {
    for (const memberUuid of sidecar.members) {
      try {
        const memberSidecar = await readSidecar(projectRoot, memberUuid);
        const memberTemplate = resolveEntryStrictTemplate(
          memberSidecar,
          projectRoot,
        );
        const memberTerminal = terminalLinearStage(memberTemplate);
        // Members already off-pipeline (or at terminal) are skipped
        // — refusing would abort the cascade mid-walk, leaving the
        // group partially cancelled which is exactly the failure
        // mode the cascade exists to avoid.
        if (memberSidecar.currentStage === memberTerminal) {
          skippedMembers.push({
            entryId: memberUuid,
            slug: memberSidecar.slug,
            reason: `at terminal stage "${memberTerminal}"`,
          });
          continue;
        }
        if (
          isOffPipelineStageInTemplate(memberTemplate, memberSidecar.currentStage)
        ) {
          skippedMembers.push({
            entryId: memberUuid,
            slug: memberSidecar.slug,
            reason: `already off-pipeline (${memberSidecar.currentStage})`,
          });
          continue;
        }
        // The recursive walker call unconditionally forces `cascade: true`:
        // top-level opt-in propagates through the entire subtree (doctor's
        // `group-recursive` rule normally refuses recursive groups, but
        // the cancel path still has to behave correctly when one exists).
        const memberResult = await cancelEntryWithoutCalendarRegen(projectRoot, {
          uuid: memberUuid,
          cascade: true,
          ...(opts.reason !== undefined && { reason: opts.reason }),
        });
        cascadedMembers.push({
          entryId: memberUuid,
          slug: memberSidecar.slug,
          fromStage: memberResult.fromStage,
        });
        // Nested cascades from the recursive call appear in
        // `memberResult.cascadedMembers` — flatten them into the
        // top-level list so the caller sees one cascade summary
        // rather than a nested tree.
        if (memberResult.cascadedMembers !== undefined) {
          cascadedMembers.push(...memberResult.cascadedMembers);
        }
        if (memberResult.skippedMembers !== undefined) {
          skippedMembers.push(...memberResult.skippedMembers);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        skippedMembers.push({
          entryId: memberUuid,
          slug: '(unresolved)',
          reason: `read failed: ${detail}`,
        });
      }
    }
  }

  const result: CancelResult = {
    entryId: sidecar.uuid,
    fromStage: from,
    toStage: CANCEL_STAGE,
    ...(opts.cascade === true && { cascadedMembers }),
    ...(opts.cascade === true && { skippedMembers }),
  };
  return result;
}

/**
 * Move an entry to the template's cancel destination (canonically
 * `Cancelled`). Records priorStage on the sidecar so a later
 * `inductEntry` can return it to the linear pipeline if the decision
 * is reversed.
 *
 * Refuses:
 *   - terminal linear stage (e.g. `Published` for editorial) — already
 *     shipped; cancellation is meaningless.
 *   - any off-pipeline stage (e.g. `Blocked`, `Cancelled`, `Archived`)
 *     — entry is already off-pipeline.
 *   - unknown stages — surfaces the template's allowed stage list.
 *
 * Requires the template's `offPipelineStages` to include `Cancelled`.
 * Templates that omit it raise a configuration error.
 *
 * Public-wrapper structure (Step 7.2.7, graphical-entries, GitHub
 * #360 / AUDIT-20260529-18): delegates the per-entry transition (and
 * the recursive cascade walk) to the internal
 * `cancelEntryWithoutCalendarRegen` walker, then calls
 * `regenerateCalendar` exactly ONCE at the cascade boundary. Prior
 * to the split the recursive cascade re-entered the public wrapper,
 * triggering N+1 calendar regenerations on a group with N cascaded
 * members. The result shape, refusals, and per-entry journal
 * semantics are unchanged.
 */
export async function cancelEntry(
  projectRoot: string,
  opts: CancelOptions,
): Promise<CancelResult> {
  const result = await cancelEntryWithoutCalendarRegen(projectRoot, opts);
  // #148: keep calendar.md in sync after every transition.
  // Step 7.2.7 boundary: a single regenerate covers the head entry
  // AND every cascaded member, because the walker does not call
  // regenerateCalendar itself.
  await regenerateCalendar(projectRoot);
  return result;
}
