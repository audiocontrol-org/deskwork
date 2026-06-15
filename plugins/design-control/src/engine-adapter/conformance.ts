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
  ENGINE_METHODS,
  FAILURE_MODES,
  isConfidence,
  type EngineAdapterRequest,
  type EngineAdapterResponse,
} from '@/engine-adapter/types';

const EngineMethodSchema = z.enum(ENGINE_METHODS);

const FailureModeSchema = z.enum(FAILURE_MODES);

/**
 * Confidence schema, single-sourced against {@link isConfidence} so the
 * structural [0, 1] check has exactly one definition shared by the zod schema and
 * the semantic conformance check.
 */
export const ConfidenceSchema = z.number().refine(isConfidence, {
  message: 'confidence must be a finite number in the inclusive range [0, 1]',
});

/**
 * Structural schema for an engine-adapter request.
 *
 * `payload` is a REQUIRED key on the {@link EngineAdapterRequest} type, but
 * `z.unknown()` infers an OPTIONAL output key in zod — so a plain `z.object`
 * would accept a request with no `payload` key at all, silently weakening the
 * envelope's load-bearing structural contract. The `.superRefine` enforces
 * key-presence: a request with no `payload` key is rejected; a request whose
 * `payload` key is present (any value, including an explicit `undefined`) passes,
 * because the method-specific shape of the payload is validated downstream, not
 * here. The schema's `_output` therefore still types `payload?` (a `ZodEffects`
 * limitation), so a `satisfies z.ZodType<EngineAdapterRequest>` clause cannot be
 * kept against the required field. Field-set drift (a field added to
 * {@link EngineAdapterRequest} but not to this schema, or vice-versa) is caught at
 * compile time by the `Expect<Equal<keyof z.input<...>, keyof EngineAdapterRequest>>`
 * assertion in `types.binding.test.ts`, which `tsc --noEmit` (run as part of the
 * package `test` script) enforces — NOT by the runtime conformance tests, which only
 * check semantic echo.
 *
 * Key-presence detection here relies on zod v3's object parser materializing an
 * output key only when the input key was present (`alwaysSet`); this holds for the
 * pinned `zod ^3.24`. The runtime payload-presence cases in `conformance.test.ts`
 * fail loud if a zod upgrade changes that materialization behavior.
 */
export const EngineAdapterRequestSchema = z
  .object({
    method: EngineMethodSchema,
    manifestId: z.string().min(1),
    imageHashes: z.array(z.string()).optional(),
    rubricItemIds: z.array(z.string()).optional(),
    payload: z.unknown(),
  })
  .superRefine((val, ctx) => {
    if (!('payload' in val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: 'payload key is required (its value may be undefined).',
      });
    }
  });

/**
 * Structural schema for an engine-adapter response. The response has no
 * required-`unknown` field (`result` is legitimately optional — absent on
 * failure), so a plain `z.object` aligns with {@link EngineAdapterResponse} and the
 * `satisfies` clause below catches field-set drift directly at compile time. (The
 * request schema cannot use `satisfies` for the `ZodEffects`/required-`payload`
 * reason above; its equivalent drift guard is the key-set assertion in
 * `types.binding.test.ts`.)
 */
export const EngineAdapterResponseSchema = z.object({
  method: EngineMethodSchema,
  manifestId: z.string().min(1),
  imageHashes: z.array(z.string()),
  rubricItemIds: z.array(z.string()).optional(),
  modelIdentity: z.string(),
  confidence: ConfidenceSchema,
  result: z.unknown().optional(),
  failureMode: FailureModeSchema.optional(),
}) satisfies z.ZodType<EngineAdapterResponse>;

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

  if (!isConfidence(response.confidence)) {
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

/**
 * The output type of {@link EngineAdapterRequestSchema}. Because the schema is a
 * `ZodEffects` over `z.unknown()`, its inferred output types `payload` as an
 * optional key even though the `.superRefine` rejects an absent `payload` at
 * runtime. {@link narrowParsedRequest} bridges that gap into the required-field
 * {@link EngineAdapterRequest} without a cast.
 */
type ParsedRequest = z.infer<typeof EngineAdapterRequestSchema>;

/**
 * Narrows a parsed request to {@link EngineAdapterRequest}. The schema's
 * `.superRefine` already guarantees the `payload` key is present on any value
 * that parsed successfully; this guard makes that guarantee type-visible (the
 * `'payload' in req` check narrows the optional key to a required one) so the
 * value flows into {@link validateConformance} without a cast.
 */
function narrowParsedRequest(req: ParsedRequest): req is EngineAdapterRequest {
  return 'payload' in req;
}

/** Render a zod error into a flat list of operator-readable structural messages. */
function structuralViolations(label: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${label} structural violation at "${path}": ${issue.message}.`;
  });
}

/**
 * Safe entry point for UNTRUSTED engine output. Runs the structural zod schemas
 * FIRST against `unknown` inputs; if either fails to parse, returns the structural
 * violations WITHOUT running the semantic echo check (a malformed shape cannot be
 * meaningfully echo-checked). Only when both parse does it run
 * {@link validateConformance} on the parsed envelopes and return its result.
 *
 * This makes the safe path the easy path: a caller wiring engine output that
 * arrives as `unknown` cannot accidentally skip structural validation.
 *
 * Unlike {@link validateConformance} (which never throws), this function throws if
 * the parsed request violates the payload-presence invariant the request schema's
 * `.superRefine` is expected to enforce — an unreachable-by-construction state that
 * indicates a broken schema invariant rather than a normal validation failure. A
 * caller handling untrusted input should treat a throw here as a programming/version
 * error, not as a `conformant: false` result.
 *
 * @throws {Error} if a successfully-parsed request is missing the `payload` key
 *   (invariant violation — the schema is expected to have rejected it first).
 */
export function parseAndValidate(
  rawRequest: unknown,
  rawResponse: unknown,
): ConformanceResult {
  const parsedRequest = EngineAdapterRequestSchema.safeParse(rawRequest);
  const parsedResponse = EngineAdapterResponseSchema.safeParse(rawResponse);

  if (!parsedRequest.success || !parsedResponse.success) {
    const violations: string[] = [];
    if (!parsedRequest.success) {
      violations.push(...structuralViolations('request', parsedRequest.error));
    }
    if (!parsedResponse.success) {
      violations.push(...structuralViolations('response', parsedResponse.error));
    }
    return { conformant: false, violations };
  }

  if (!narrowParsedRequest(parsedRequest.data)) {
    // Unreachable by construction: the schema's `.superRefine` rejects an absent
    // payload key, so any value that passed `safeParse` above already has the key.
    // The guard exists only to make that runtime guarantee type-visible (narrowing
    // `payload?` to required) without a cast. If it ever fires it is a broken
    // invariant, not a normal validation failure — fail loud rather than
    // manufacturing a fabricated ConformanceResult for a state the code asserts
    // cannot happen.
    throw new Error(
      'design-control invariant violated: EngineAdapterRequestSchema parsed a request whose payload key is absent. ' +
        'The schema .superRefine is expected to reject that case before this point.',
    );
  }

  return validateConformance(parsedRequest.data, parsedResponse.data);
}
