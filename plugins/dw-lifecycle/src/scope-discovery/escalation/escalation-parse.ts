/**
 * plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-parse.ts
 *
 * Phase 11 Task 9 — Parser for on-disk EscalationRequest JSON.
 *
 * Extracted from `escalation-queue.ts` to keep that file under the 500-
 * line guideline. The parser is shared by the queue (for read +
 * resolve operations) and would be the natural seam if any future
 * reader (e.g. a doctor rule, a studio surface) needs to load
 * escalation artifacts without dispatching through the queue API.
 *
 * Throws on every malformed-input shape (per the project's
 * no-fallback rule). All parse paths return a fully-typed
 * `EscalationRequest`; no `as` casts, no `any`.
 */

import { errorMessage, isPlainObject } from '../util/typeguards.js';
import type {
  EscalationEvidence,
  EscalationOption,
  EscalationRequest,
  EscalationResolution,
} from './escalation-types.js';

export function parseEscalation(text: string, ctx: string): EscalationRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `escalation-queue: cannot parse ${ctx}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`escalation-queue: ${ctx} did not parse to an object`);
  }
  if (parsed['version'] !== 1) {
    throw new Error(
      `escalation-queue: ${ctx} has unsupported version ${String(parsed['version'])}; expected 1`,
    );
  }
  const id = requireString(parsed, 'id', ctx);
  const queuedAt = requireString(parsed, 'queuedAt', ctx);
  const actionProposed = requireString(parsed, 'actionProposed', ctx);
  const reasoning = requireString(parsed, 'reasoning', ctx);
  const question = requireString(parsed, 'question', ctx);
  const evidence = parseEvidence(parsed['evidence'], `${ctx}/evidence`);
  const options = parseOptions(parsed['options'], `${ctx}/options`);
  const resolution = parseResolutionOrNull(
    parsed['resolution'],
    `${ctx}/resolution`,
  );
  return {
    version: 1,
    id,
    queuedAt,
    actionProposed,
    evidence,
    reasoning,
    question,
    options,
    resolution,
  };
}

function requireString(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): string {
  const v = raw[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(
      `escalation-queue: ${ctx} \`${field}\` must be a non-empty string`,
    );
  }
  return v;
}

function parseEvidence(raw: unknown, ctx: string): EscalationEvidence {
  if (!isPlainObject(raw)) {
    throw new Error(`escalation-queue: ${ctx} must be an object`);
  }
  const summary = requireString(raw, 'summary', ctx);
  const linksRaw = raw['links'];
  if (!Array.isArray(linksRaw)) {
    throw new Error(`escalation-queue: ${ctx} \`links\` must be an array`);
  }
  const links = linksRaw.map((entry, idx) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(
        `escalation-queue: ${ctx}/links[${idx}] must be a non-empty string`,
      );
    }
    return entry;
  });
  const excerptsRaw = raw['excerpts'];
  if (!Array.isArray(excerptsRaw)) {
    throw new Error(`escalation-queue: ${ctx} \`excerpts\` must be an array`);
  }
  const excerpts = excerptsRaw.map((entry, idx) => {
    if (typeof entry !== 'string') {
      throw new Error(
        `escalation-queue: ${ctx}/excerpts[${idx}] must be a string`,
      );
    }
    return entry;
  });
  return { summary, links, excerpts };
}

function parseOptions(
  raw: unknown,
  ctx: string,
): ReadonlyArray<EscalationOption> {
  if (!Array.isArray(raw)) {
    throw new Error(`escalation-queue: ${ctx} must be an array`);
  }
  if (raw.length === 0) {
    throw new Error(
      `escalation-queue: ${ctx} must contain at least one option`,
    );
  }
  return raw.map((entry, idx) => {
    if (!isPlainObject(entry)) {
      throw new Error(`escalation-queue: ${ctx}[${idx}] must be an object`);
    }
    const id = requireString(entry, 'id', `${ctx}[${idx}]`);
    const summary = requireString(entry, 'summary', `${ctx}[${idx}]`);
    const detailRaw = entry['detail'];
    let detail: string | undefined;
    if (detailRaw !== undefined) {
      if (typeof detailRaw !== 'string' || detailRaw.length === 0) {
        throw new Error(
          `escalation-queue: ${ctx}[${idx}] \`detail\` must be a non-empty string when set`,
        );
      }
      detail = detailRaw;
    }
    return detail === undefined ? { id, summary } : { id, summary, detail };
  });
}

function parseResolutionOrNull(
  raw: unknown,
  ctx: string,
): EscalationResolution | null {
  if (raw === null) return null;
  if (raw === undefined) return null;
  if (!isPlainObject(raw)) {
    throw new Error(`escalation-queue: ${ctx} must be an object or null`);
  }
  const resolvedAt = requireString(raw, 'resolvedAt', ctx);
  const decisionTaken = requireString(raw, 'decisionTaken', ctx);
  const selectedOptionRaw = raw['selectedOptionId'];
  let selectedOptionId: string | null;
  if (selectedOptionRaw === null) {
    selectedOptionId = null;
  } else if (
    typeof selectedOptionRaw === 'string' &&
    selectedOptionRaw.length > 0
  ) {
    selectedOptionId = selectedOptionRaw;
  } else {
    throw new Error(
      `escalation-queue: ${ctx} \`selectedOptionId\` must be a non-empty string or null`,
    );
  }
  return { resolvedAt, decisionTaken, selectedOptionId };
}
