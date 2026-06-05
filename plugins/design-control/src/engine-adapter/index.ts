/**
 * Public surface of the design-control engine-adapter library.
 *
 * Import via `@/engine-adapter`. Declares the engine-adapter interface, the
 * conformance schemas + echo-validator, and the fail-loud preflight presence
 * check. No concrete `/frontend-design` adapter is implemented here — that is a
 * separate, later task.
 */

export {
  type EngineMethod,
  type FailureMode,
  type Confidence,
  type EngineAdapterRequest,
  type EngineAdapterResponse,
  type EngineAdapter,
  FAILURE_MODES,
  DEFAULT_CLAUDE_ADAPTER_ID,
  isConfidence,
  assertConfidence,
} from '@/engine-adapter/types';

export {
  type ConformanceResult,
  EngineAdapterRequestSchema,
  EngineAdapterResponseSchema,
  validateConformance,
} from '@/engine-adapter/conformance';

export {
  type EngineProbe,
  type PreflightOptions,
  preflightEngine,
} from '@/engine-adapter/preflight';
