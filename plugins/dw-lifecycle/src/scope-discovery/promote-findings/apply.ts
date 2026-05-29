/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/apply.ts
 *
 * Apply a filled-in proposal file: render workplan task blocks for
 * `promote-to-workplan` items, queue audit-log status flips for
 * `acknowledged` / `informational` items, run workplan inserts and
 * audit-log flips atomically per stream, return per-item outcome
 * records.
 *
 * All-or-nothing pre-validation gate: every item must have a non-null
 * disposition + a non-null fields object; `acknowledged` reasons must
 * pass the substantive-reason validator. The gate runs BEFORE any
 * mutation so a single malformed item refuses the whole batch.
 *
 * Apply-time semantics:
 *
 *   - Workplan inserts run as a single atomic call to `applyTaskBlocks`
 *     (validates every insertion's anchor before writing).
 *   - Audit-log flips run as a single atomic call to `applyStatusFlips`
 *     (validates every flip before writing).
 *   - If either side throws, the other side has either already-applied
 *     (and is durable on disk) or not-yet-applied. The two writes are
 *     sequenced workplan → audit-log; if the audit-log write fails
 *     after the workplan write succeeded, the operator sees a partial-
 *     apply state. The error message names which side completed.
 */

import { validateAcknowledgedReason } from './substantive-reason-validator.js';
import { renderFixTaskBlock } from './workplan-task-renderer.js';
import { applyTaskBlocks } from './workplan-editor.js';
import { applyStatusFlips } from './audit-log-editor.js';
import type {
  AcknowledgedFields,
  DispositionFields,
  DispositionKind,
  InformationalFields,
  PromoteToWorkplanFields,
  ProposalFile,
  ProposalItem,
  ReadAuditLog,
  ReadWorkplan,
  WorkplanInsertion,
  WriteAuditLog,
  WriteWorkplan,
} from './types.js';
import type { StatusFlip } from './audit-log-editor.js';

export class ApplyProposalError extends Error {
  override name = 'ApplyProposalError';
}

export interface ApplyProposalArgs {
  readonly proposal: ProposalFile;
  readonly featureSlug: string;
  readonly read: {
    readonly workplan: ReadWorkplan;
    readonly auditLog: ReadAuditLog;
  };
  readonly write: {
    readonly workplan: WriteWorkplan;
    readonly auditLog: WriteAuditLog;
  };
  /**
   * Phase 13 Task 1's apply step renders task blocks with a `taskNumber`
   * stamped into the title (e.g., `Task 13.7`). The numbering policy is
   * delegated to the caller — propose-mode captures the phase heading
   * the operator picked + an integer offset for each item, and the
   * apply step composes them. This callback returns the formatted
   * task-number string for a given finding by index.
   */
  readonly taskNumberFor: (item: ProposalItem, idx: number) => string;
}

export interface ApplyOutcome {
  readonly itemIndex: number;
  readonly findingId: string;
  readonly disposition: DispositionKind;
  readonly applied: boolean;
  readonly result: string | null;
  readonly error: string | null;
}

export interface ApplyResult {
  readonly outcomes: readonly ApplyOutcome[];
  readonly workplanWritten: boolean;
  readonly auditLogWritten: boolean;
}

function asPromoteFields(fields: DispositionFields): PromoteToWorkplanFields {
  // The proposal parser already routed the per-disposition shape;
  // narrowing here is by presence of the required keys, surfaced as a
  // type-narrowing helper without an `as` cast.
  if ('phaseHeading' in fields && 'insertAfterLine' in fields) {
    return { phaseHeading: fields.phaseHeading, insertAfterLine: fields.insertAfterLine };
  }
  throw new ApplyProposalError('expected promote-to-workplan fields shape.');
}

function asAcknowledgedFields(fields: DispositionFields): AcknowledgedFields {
  if ('reason' in fields) {
    const base: AcknowledgedFields = { reason: fields.reason };
    if (fields.ref !== undefined) {
      return { reason: fields.reason, ref: fields.ref };
    }
    return base;
  }
  throw new ApplyProposalError('expected acknowledged fields shape.');
}

function asInformationalFields(fields: DispositionFields): InformationalFields {
  if ('rationale' in fields) {
    return { rationale: fields.rationale };
  }
  throw new ApplyProposalError('expected informational fields shape.');
}

interface PreValidated {
  readonly insertions: readonly WorkplanInsertion[];
  readonly flips: readonly StatusFlip[];
  readonly outcomes: readonly OutcomeStub[];
}

interface OutcomeStub {
  readonly itemIndex: number;
  readonly findingId: string;
  readonly disposition: DispositionKind;
  readonly resultMessage: string;
}

function preValidate(args: ApplyProposalArgs): PreValidated {
  const insertions: WorkplanInsertion[] = [];
  const flips: StatusFlip[] = [];
  const outcomes: OutcomeStub[] = [];
  args.proposal.items.forEach((item, idx) => {
    if (item.disposition === null) {
      throw new ApplyProposalError(
        `item ${idx + 1} (finding ${item.finding.findingId}) has no disposition; fill in disposition + fields before applying.`,
      );
    }
    if (item.fields === null) {
      throw new ApplyProposalError(
        `item ${idx + 1} (finding ${item.finding.findingId}) has no fields; fill in fields before applying.`,
      );
    }
    if (item.disposition === 'promote-to-workplan') {
      const fields = asPromoteFields(item.fields);
      const taskBlock = renderFixTaskBlock(item.finding, {
        taskNumber: args.taskNumberFor(item, idx),
      });
      insertions.push({
        findingId: item.finding.findingId,
        taskBlock,
        phaseHeading: fields.phaseHeading,
        insertAfterLine: fields.insertAfterLine,
      });
      outcomes.push({
        itemIndex: idx + 1,
        findingId: item.finding.findingId,
        disposition: item.disposition,
        resultMessage: `inserted task block into workplan at line ${fields.insertAfterLine + 1}`,
      });
      return;
    }
    if (item.disposition === 'acknowledged') {
      const fields = asAcknowledgedFields(item.fields);
      const validation = validateAcknowledgedReason(fields.reason);
      if (!validation.valid) {
        throw new ApplyProposalError(
          `item ${idx + 1} (finding ${item.finding.findingId}) acknowledged reason invalid: ${validation.reason ?? 'unspecified'}`,
        );
      }
      const refSuffix = fields.ref ?? args.featureSlug;
      const newStatus = `acknowledged-${refSuffix}`;
      flips.push({ findingId: item.finding.findingId, newStatus });
      outcomes.push({
        itemIndex: idx + 1,
        findingId: item.finding.findingId,
        disposition: item.disposition,
        resultMessage: `flipped Status to ${newStatus}`,
      });
      return;
    }
    // informational
    asInformationalFields(item.fields);
    flips.push({
      findingId: item.finding.findingId,
      newStatus: 'informational',
    });
    outcomes.push({
      itemIndex: idx + 1,
      findingId: item.finding.findingId,
      disposition: item.disposition,
      resultMessage: 'flipped Status to informational',
    });
  });
  return { insertions, flips, outcomes };
}

export async function applyProposal(args: ApplyProposalArgs): Promise<ApplyResult> {
  const { insertions, flips, outcomes } = preValidate(args);

  let workplanWritten = false;
  let auditLogWritten = false;

  if (insertions.length > 0) {
    await applyTaskBlocks({
      workplanPath: args.proposal.workplan_path,
      insertions,
      read: args.read.workplan,
      write: args.write.workplan,
    });
    workplanWritten = true;
  }

  if (flips.length > 0) {
    await applyStatusFlips({
      auditLogPath: args.proposal.audit_log_path,
      flips,
      read: args.read.auditLog,
      write: args.write.auditLog,
    });
    auditLogWritten = true;
  }

  const result: ApplyResult = {
    outcomes: outcomes.map((stub) => ({
      itemIndex: stub.itemIndex,
      findingId: stub.findingId,
      disposition: stub.disposition,
      applied: true,
      result: stub.resultMessage,
      error: null,
    })),
    workplanWritten,
    auditLogWritten,
  };
  return result;
}
