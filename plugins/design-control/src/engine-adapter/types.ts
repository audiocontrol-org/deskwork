/**
 * Engine-adapter interface declaration for design-control.
 *
 * The engine-adapter is the contract between the design-control plugin's
 * execution paths (wireframe authoring, design-language spec drafting, screenshot
 * refereeing) and a concrete design engine. The default engine is the Claude
 * `/frontend-design` plugin (see {@link DEFAULT_CLAUDE_ADAPTER_ID}). This module
 * declares ONLY the interface + supporting value types; concrete adapters that
 * wire a specific engine are supplied by callers via dependency injection.
 *
 * Interface-first / composition-over-inheritance: callers depend on the
 * {@link EngineAdapter} interface and receive a concrete implementation via
 * dependency injection.
 */

/**
 * The three engine methods design-control invokes. Each corresponds to one
 * execution path that requires an engine to be present (see preflight).
 *
 * - `author-wireframe`          — engine authors a wireframe from a manifest.
 * - `translate-design-language` — engine drafts the design-language spec
 *                                  artifact from approved wireframe intent and
 *                                  operator-named live CSS sources.
 * - `referee-screenshot`        — engine referees a rendered screenshot against
 *                                  a rubric (rubric-item ids are load-bearing
 *                                  here).
 *
 * Single-sourced as a `const [...] as const` array (mirroring {@link FAILURE_MODES})
 * so the {@link EngineMethod} type, the zod method enum, and any method-iteration
 * loop all derive from one declaration — collapsing the drift surface to one site.
 */
export const ENGINE_METHODS = [
  'author-wireframe',
  'translate-design-language',
  'referee-screenshot',
] as const;

export type EngineMethod = (typeof ENGINE_METHODS)[number];

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
 * Request envelope handed to an engine method, parameterised by the specific
 * {@link EngineMethod} `M` it targets. The `method` field is narrowed to `M`, so
 * a request typed for one method cannot be passed where another method's request
 * is expected. The request carries the identity fields the response must echo
 * back (manifestId, imageHashes, rubricItemIds) plus a method-specific `payload`.
 */
export interface EngineAdapterRequestFor<M extends EngineMethod> {
  /** Which engine method this request targets. Narrowed to `M`. */
  method: M;
  /** The manifest the engine is acting on. Echoed back by the response. */
  manifestId: string;
  /** Image hashes the engine is asked to act on. Echoed back by the response. */
  imageHashes?: string[] | undefined;
  /**
   * Rubric-item ids. Required (and load-bearing) for `referee-screenshot`;
   * optional for the other methods.
   */
  rubricItemIds?: string[] | undefined;
  /**
   * Method-specific input payload. Required (the key MUST be present, though its
   * value is `unknown`): an execution request always carries a method-specific
   * payload, and callers narrow it per method before use. Under
   * `exactOptionalPropertyTypes`, `payload: unknown` enforces key-presence while
   * still admitting an explicit `undefined` value.
   */
  payload: unknown;
}

/**
 * Response envelope returned by an engine method, parameterised by the specific
 * {@link EngineMethod} `M` it answers. The `method` field is narrowed to `M`. The
 * response ECHOES the request's identity fields and carries the engine's model
 * identity, a confidence value, and EITHER a success `result` OR a `failureMode`.
 */
export interface EngineAdapterResponseFor<M extends EngineMethod> {
  /** Echo of the request method. Narrowed to `M`. */
  method: M;
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
  rubricItemIds?: string[] | undefined;
  /** Identity of the model/engine that produced this response. Non-empty. */
  modelIdentity: string;
  /** Confidence in [0, 1]. */
  confidence: Confidence;
  /** Success payload. Present on success; absent on failure. */
  result?: unknown;
  /** Defined failure mode. Present on failure; absent on success. */
  failureMode?: FailureMode | undefined;
}

/**
 * The wide request union across every {@link EngineMethod}. Used by
 * schema/conformance code that operates on any method's envelope.
 */
export type EngineAdapterRequest = EngineAdapterRequestFor<EngineMethod>;

/**
 * The wide response union across every {@link EngineMethod}. Used by
 * schema/conformance code that operates on any method's envelope.
 */
export type EngineAdapterResponse = EngineAdapterResponseFor<EngineMethod>;

/**
 * The engine-adapter contract. A concrete adapter (e.g. one wiring Claude's
 * `/frontend-design`) implements these three async methods. Each method's
 * request/response envelope is bound to its own {@link EngineMethod} at compile
 * time, so passing a wrong-method envelope is a type error. Callers depend on
 * this interface and receive an implementation via dependency injection.
 */
export interface EngineAdapter {
  authorWireframe(
    request: EngineAdapterRequestFor<'author-wireframe'>,
  ): Promise<EngineAdapterResponseFor<'author-wireframe'>>;
  translateDesignLanguage(
    request: EngineAdapterRequestFor<'translate-design-language'>,
  ): Promise<EngineAdapterResponseFor<'translate-design-language'>>;
  refereeScreenshot(
    request: EngineAdapterRequestFor<'referee-screenshot'>,
  ): Promise<EngineAdapterResponseFor<'referee-screenshot'>>;
}

/**
 * The default engine adapter id. design-control's default engine is the Claude
 * `/frontend-design` plugin; this constant documents that cross-plugin
 * dependency. Concrete adapter implementations are supplied by callers via
 * dependency injection.
 */
export const DEFAULT_CLAUDE_ADAPTER_ID = 'frontend-design' as const;
