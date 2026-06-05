/**
 * Conformance schemas + the load-bearing echo-validator for engine-adapter
 * request/response envelopes.
 *
 * Two layers:
 *  1. zod schemas — structural validation (parse-reject malformed shapes:
 *     unknown methods, missing manifestId, out-of-range confidence, unknown
 *     failureMode).
 *  2. {@link validateConformance} — semantic echo validation: the response must
 *     faithfully echo the request's identity fields. This is the load-bearing
 *     check that proves the engine acted on the inputs it was handed.
 */

import { z } from 'zod';
import {
  FAILURE_MODES,
  type EngineAdapterRequest,
  type EngineAdapterResponse,
} from '@/engine-adapter/types';

const EngineMethodSchema = z.enum([
  'author-wireframe',
  'translate-design-language',
  'referee-screenshot',
]);

const FailureModeSchema = z.enum(FAILURE_MODES);

const ConfidenceSchema = z
  .number()
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, {
    message: 'confidence must be a finite number in the inclusive range [0, 1]',
  });

/** Structural schema for an engine-adapter request. */
export const EngineAdapterRequestSchema = z.object({
  method: EngineMethodSchema,
  manifestId: z.string().min(1),
  imageHashes: z.array(z.string()).optional(),
  rubricItemIds: z.array(z.string()).optional(),
  payload: z.unknown(),
});

/** Structural schema for an engine-adapter response. */
export const EngineAdapterResponseSchema = z.object({
  method: EngineMethodSchema,
  manifestId: z.string().min(1),
  imageHashes: z.array(z.string()),
  rubricItemIds: z.array(z.string()).optional(),
  modelIdentity: z.string(),
  confidence: ConfidenceSchema,
  result: z.unknown().optional(),
  failureMode: FailureModeSchema.optional(),
});

/** Structured result of an echo-conformance check. */
export interface ConformanceResult {
  conformant: boolean;
  violations: string[];
}

/**
 * The load-bearing echo check. Asserts that `response` faithfully echoes
 * `request`'s identity fields and carries the required engine metadata. Does NOT
 * throw — returns the violation list so the caller decides how to react.
 *
 * Checks:
 *  - method echoes the request method
 *  - manifestId echoes the request manifestId
 *  - imageHashes is a superset-or-equal of the request's imageHashes
 *  - modelIdentity is a non-empty string
 *  - for `referee-screenshot`: rubricItemIds present, non-empty, and echo the
 *    request's rubricItemIds
 *  - confidence is a valid [0, 1] number
 *  - exactly one of { success `result`, failure `failureMode` } is present
 */
export function validateConformance(
  request: EngineAdapterRequest,
  response: EngineAdapterResponse,
): ConformanceResult {
  const violations: string[] = [];

  if (response.method !== request.method) {
    violations.push(
      `method mismatch: request method "${request.method}" but response method "${response.method}".`,
    );
  }

  if (response.manifestId !== request.manifestId) {
    violations.push(
      `manifestId mismatch: request "${request.manifestId}" but response "${response.manifestId}".`,
    );
  }

  const requestedHashes = request.imageHashes ?? [];
  const respondedHashes = new Set(response.imageHashes);
  const droppedHashes = requestedHashes.filter((h) => !respondedHashes.has(h));
  if (droppedHashes.length > 0) {
    violations.push(
      `imageHashes drift: response did not echo requested image hashes [${droppedHashes.join(', ')}].`,
    );
  }

  if (typeof response.modelIdentity !== 'string' || response.modelIdentity.length === 0) {
    violations.push('modelIdentity must be a non-empty string.');
  }

  if (!Number.isFinite(response.confidence) || response.confidence < 0 || response.confidence > 1) {
    violations.push(
      `confidence out of range: ${String(response.confidence)} is not in the inclusive range [0, 1].`,
    );
  }

  if (request.method === 'referee-screenshot') {
    const responseRubric = response.rubricItemIds ?? [];
    if (responseRubric.length === 0) {
      violations.push(
        'rubricItemIds must be present and non-empty on a referee-screenshot response.',
      );
    } else {
      const requestRubric = request.rubricItemIds ?? [];
      const responseRubricSet = new Set(responseRubric);
      const droppedRubric = requestRubric.filter((id) => !responseRubricSet.has(id));
      if (requestRubric.length !== responseRubric.length || droppedRubric.length > 0) {
        violations.push(
          `rubricItemIds mismatch: request [${requestRubric.join(', ')}] but response [${responseRubric.join(', ')}].`,
        );
      }
    }
  }

  const hasResult = response.result !== undefined;
  const hasFailureMode = response.failureMode !== undefined;
  if (hasResult === hasFailureMode) {
    violations.push(
      'response must carry exactly one of: a success `result` or a failure `failureMode`.',
    );
  }

  return { conformant: violations.length === 0, violations };
}
