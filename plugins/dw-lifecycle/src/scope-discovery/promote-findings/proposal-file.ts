/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/proposal-file.ts
 *
 * Read / write the proposal JSON file the propose-then-apply protocol
 * exchanges between propose-mode (agent emits a fresh proposal) and
 * apply-mode (operator's edited proposal is consumed + executed).
 *
 * The proposal file mirrors the promote-deferrals contract: each item
 * starts with `disposition: null` + `fields: null` + the per-item
 * outcome trio (`applied`, `apply_error`, `result`) all null. Apply
 * refuses to start until every item has a non-null disposition.
 *
 * Path convention:
 *   `<projectRoot>/.dw-lifecycle/scope-discovery/promote-findings/proposals/<iso>-<slug>.json`
 *
 * The proposal file is the single source of truth between propose and
 * apply; the on-disk artifact is what makes the workflow auditable.
 */

import { isPlainObject } from '../util/typeguards.js';
import type {
  OpenFinding,
  ProposalFile,
  ProposalItem,
} from './types.js';

export class InvalidProposalFileError extends Error {
  override name = 'InvalidProposalFileError';
}

export function makeProposalFile(
  args: {
    readonly featureSlug: string;
    readonly auditLogPath: string;
    readonly workplanPath: string;
    readonly findings: readonly OpenFinding[];
    readonly now: Date;
  },
): ProposalFile {
  const items: ProposalItem[] = args.findings.map((finding) => ({
    finding,
    disposition: null,
    fields: null,
    applied: null,
    apply_error: null,
    result: null,
  }));
  return {
    generated_at: args.now.toISOString(),
    feature_slug: args.featureSlug,
    audit_log_path: args.auditLogPath,
    workplan_path: args.workplanPath,
    items,
  };
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new InvalidProposalFileError(
      `proposal file's ${field} is not a string.`,
    );
  }
  return value;
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new InvalidProposalFileError(
      `proposal file's ${field} is not a string when present.`,
    );
  }
  return value;
}

function parseOpenFinding(raw: unknown, idx: number): OpenFinding {
  if (!isStringRecord(raw)) {
    throw new InvalidProposalFileError(
      `proposal item ${idx} 'finding' is not an object.`,
    );
  }
  const lineNumber = raw.lineNumber;
  if (typeof lineNumber !== 'number' || !Number.isInteger(lineNumber)) {
    throw new InvalidProposalFileError(
      `proposal item ${idx} finding.lineNumber is not an integer.`,
    );
  }
  const base: {
    -readonly [K in keyof OpenFinding]: OpenFinding[K];
  } = {
    findingId: asString(raw.findingId, `item ${idx} finding.findingId`),
    heading: asString(raw.heading, `item ${idx} finding.heading`),
    body: asString(raw.body, `item ${idx} finding.body`),
    lineNumber,
    auditLogPath: asString(raw.auditLogPath, `item ${idx} finding.auditLogPath`),
  };
  const severity = asOptionalString(raw.severity, `item ${idx} finding.severity`);
  if (severity !== undefined) base.severity = severity;
  const surface = asOptionalString(raw.surface, `item ${idx} finding.surface`);
  if (surface !== undefined) base.surface = surface;
  return base;
}

function parseDispositionKind(value: unknown, idx: number):
  | 'promote-to-workplan'
  | 'acknowledged'
  | 'informational'
  | null {
  if (value === null) return null;
  if (
    value === 'promote-to-workplan' ||
    value === 'acknowledged' ||
    value === 'informational'
  ) {
    return value;
  }
  throw new InvalidProposalFileError(
    `proposal item ${idx} disposition '${String(value)}' is not one of 'promote-to-workplan' | 'acknowledged' | 'informational' | null.`,
  );
}

function parseItem(raw: unknown, idx: number): ProposalItem {
  if (!isStringRecord(raw)) {
    throw new InvalidProposalFileError(
      `proposal item ${idx} is not an object.`,
    );
  }
  const finding = parseOpenFinding(raw.finding, idx);
  const disposition = parseDispositionKind(raw.disposition, idx);
  const fieldsRaw = raw.fields;
  let fields: ProposalItem['fields'] = null;
  if (fieldsRaw !== null && fieldsRaw !== undefined) {
    if (!isStringRecord(fieldsRaw)) {
      throw new InvalidProposalFileError(
        `proposal item ${idx} fields is not an object.`,
      );
    }
    // We do shape-checking only at the apply layer where the dispatch
    // shape is consumed; here we accept the JSON-decoded object and let
    // the apply gate enforce per-disposition shape.
    if (disposition === 'promote-to-workplan') {
      const phaseHeading = asString(
        fieldsRaw.phaseHeading,
        `item ${idx} fields.phaseHeading`,
      );
      const insertAfterLine = fieldsRaw.insertAfterLine;
      if (
        typeof insertAfterLine !== 'number' ||
        !Number.isInteger(insertAfterLine)
      ) {
        throw new InvalidProposalFileError(
          `proposal item ${idx} fields.insertAfterLine is not an integer.`,
        );
      }
      fields = { phaseHeading, insertAfterLine };
    } else if (disposition === 'acknowledged') {
      const reason = asString(fieldsRaw.reason, `item ${idx} fields.reason`);
      const ref = asOptionalString(fieldsRaw.ref, `item ${idx} fields.ref`);
      fields = ref === undefined ? { reason } : { reason, ref };
    } else if (disposition === 'informational') {
      const rationale = asString(
        fieldsRaw.rationale,
        `item ${idx} fields.rationale`,
      );
      fields = { rationale };
    }
  }
  return {
    finding,
    disposition,
    fields,
    applied: null,
    apply_error: null,
    result: null,
  };
}

export function parseProposalFile(raw: unknown): ProposalFile {
  if (!isStringRecord(raw)) {
    throw new InvalidProposalFileError('proposal file root is not an object.');
  }
  const generated_at = asString(raw.generated_at, 'generated_at');
  const feature_slug = asString(raw.feature_slug, 'feature_slug');
  const audit_log_path = asString(raw.audit_log_path, 'audit_log_path');
  const workplan_path = asString(raw.workplan_path, 'workplan_path');
  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) {
    throw new InvalidProposalFileError('proposal file items is not an array.');
  }
  const items = itemsRaw.map((item, idx) => parseItem(item, idx));
  return {
    generated_at,
    feature_slug,
    audit_log_path,
    workplan_path,
    items,
  };
}
