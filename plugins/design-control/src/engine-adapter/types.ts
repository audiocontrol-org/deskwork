/**
 * Engine-adapter interface declaration for design-control.
 *
 * The engine-adapter is the contract between the design-control plugin's
 * execution paths (wireframe authoring, design-language translation, screenshot
 * refereeing) and a concrete design engine. The default engine is the Claude
 * `/frontend-design` plugin (see {@link DEFAULT_CLAUDE_ADAPTER_ID}); the concrete
 * adapter that wires `/frontend-design` is a separate, later implementation. This
 * module declares ONLY the interface + supporting value types.
 *
 * Interface-first / composition-over-inheritance: callers depend on the
 * {@link EngineAdapter} interface and receive a concrete implementation via
 * dependency injection.
 */

/**
 * The three engine methods design-control invokes. Each corresponds to one
 * execution path that requires an engine to be present (see preflight).
 *
 * - `author-wireframe`        — engine authors a wireframe from a manifest.
 * - `translate-design-language` — engine translates a design-language spec into
 *                                concrete styling/markup decisions.
 * - `referee-screenshot`      — engine referees a rendered screenshot against a
 *                                rubric (rubric-item ids are load-bearing here).
 */
export type EngineMethod =
  | 'author-wireframe'
  | 'translate-design-language'
  | 'referee-screenshot';

/**
 * Closed set of defined failure modes an engine response may carry. A response
 * is EITHER success-with-result OR failure-with-failureMode; this enum is the
 * vocabulary for the failure side.
 *
 * - `engine-absent`    — the required engine/adapter was not available.
 * - `malformed-output` — the engine produced output that did not parse/conform.
 * - `lint-rejected`    — the engine output was rejected by a lint/validation gate.
 * - `low-confidence`   — the engine completed but with confidence below a usable
 *                        threshold (the caller decides the threshold).
 * - `timeout`          — the engine did not respond within the allotted budget.
 * - `internal-error`   — an unexpected internal error inside the engine/adapter.
 */
export const FAILURE_MODES = [
  'engine-absent',
  'malformed-output',
  'lint-rejected',
  'low-confidence',
  'timeout',
  'internal-error',
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

/**
 * A confidence value: a number in the inclusive range [0, 1]. Represented as a
 * branded-free plain `number` for ergonomics; use {@link isConfidence} /
 * {@link assertConfidence} to validate at boundaries.
 */
export type Confidence = number;

/** True iff `value` is a finite number within the inclusive range [0, 1]. */
export function isConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Returns `value` if it is a valid {@link Confidence}; otherwise throws a
 * descriptive Error. Use at boundaries where an invalid confidence is a bug.
 */
export function assertConfidence(value: number): Confidence {
  if (!isConfidence(value)) {
    throw new Error(
      `Invalid confidence ${String(value)}: expected a finite number in the inclusive range [0, 1].`,
    );
  }
  return value;
}

/**
 * Request envelope handed to an engine method. The request carries the identity
 * fields the response must echo back (manifestId, imageHashes, rubricItemIds)
 * plus a method-specific `payload`.
 */
export interface EngineAdapterRequest {
  /** Which engine method this request targets. */
  method: EngineMethod;
  /** The manifest the engine is acting on. Echoed back by the response. */
  manifestId: string;
  /** Image hashes the engine is asked to act on. Echoed back by the response. */
  imageHashes?: string[];
  /**
   * Rubric-item ids. Required (and load-bearing) for `referee-screenshot`;
   * optional for the other methods.
   */
  rubricItemIds?: string[];
  /** Method-specific input payload. */
  payload: unknown;
}

/**
 * Response envelope returned by an engine method. The response ECHOES the
 * request's identity fields and carries the engine's model identity, a
 * confidence value, and EITHER a success `result` OR a `failureMode`.
 */
export interface EngineAdapterResponse {
  /** Echo of the request method. */
  method: EngineMethod;
  /** Echo of the request manifestId. */
  manifestId: string;
  /**
   * The image hashes the engine acted on. Must be a superset-or-equal of the
   * request's imageHashes (the engine may add derived hashes; it must not drop
   * or substitute a requested one).
   */
  imageHashes: string[];
  /**
   * Echo of the rubric-item ids. Required and non-empty for
   * `referee-screenshot` responses; may be omitted for other methods.
   */
  rubricItemIds?: string[];
  /** Identity of the model/engine that produced this response. Non-empty. */
  modelIdentity: string;
  /** Confidence in [0, 1]. */
  confidence: Confidence;
  /** Success payload. Present on success; absent on failure. */
  result?: unknown;
  /** Defined failure mode. Present on failure; absent on success. */
  failureMode?: FailureMode;
}

/**
 * The engine-adapter contract. A concrete adapter (e.g. one wiring Claude's
 * `/frontend-design`) implements these three async methods. Callers depend on
 * this interface and receive an implementation via dependency injection.
 */
export interface EngineAdapter {
  authorWireframe(request: EngineAdapterRequest): Promise<EngineAdapterResponse>;
  translateDesignLanguage(request: EngineAdapterRequest): Promise<EngineAdapterResponse>;
  refereeScreenshot(request: EngineAdapterRequest): Promise<EngineAdapterResponse>;
}

/**
 * The default engine adapter id. design-control's default engine is the Claude
 * `/frontend-design` plugin; this constant documents that cross-plugin
 * dependency. The concrete adapter implementation is a separate, later task.
 */
export const DEFAULT_CLAUDE_ADAPTER_ID = 'frontend-design' as const;
