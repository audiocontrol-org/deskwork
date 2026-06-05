/**
 * Public surface of the design-control engine-adapter library.
 *
 * Import via `@/engine-adapter`. This barrel declares the engine-adapter
 * interface, the conformance schemas + echo-validator, and the fail-loud
 * preflight presence check. Concrete `/frontend-design` adapters are supplied by
 * callers via dependency injection; this module declares only the contract.
 */

export {
  type EngineMethod,
  type FailureMode,
  type Confidence,
  type EngineAdapterRequest,
  type EngineAdapterResponse,
  type EngineAdapterRequestFor,
  type EngineAdapterResponseFor,
  type EngineAdapter,
  ENGINE_METHODS,
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
  parseAndValidate,
} from '@/engine-adapter/conformance';

export {
  type EngineProbe,
  type PreflightOptions,
  preflightEngine,
} from '@/engine-adapter/preflight';
