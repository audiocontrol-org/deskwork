/**
 * Fail-loud engine presence check, scoped to EXECUTION paths.
 *
 * design-control has two classes of authoring path:
 *  - EXECUTION paths (engine-driven): `author-wireframe`,
 *    `translate-design-language`, `referee-screenshot`. These require an engine
 *    (default `/frontend-design`) to be present. {@link preflightEngine} gates
 *    them and throws loud when the engine is absent.
 *  - MANUAL authoring path (operator-driven): the operator authors a wireframe
 *    by hand. This path NEVER calls {@link preflightEngine}, so it requires no
 *    engine and works with no engine installed.
 *
 * The invariant — "manual authoring never requires the engine" — is enforced by
 * NOT calling preflightEngine on the manual path. The library proves the boundary
 * by making the probe an injected parameter: preflight only consults the probe on
 * execution paths, and absence on those paths throws.
 */

import {
  DEFAULT_CLAUDE_ADAPTER_ID,
  type EngineMethod,
} from '@/engine-adapter/types';

/**
 * Probe that reports whether a given engine adapter is available. The concrete
 * `/frontend-design`-detection probe is injected by the caller; this library
 * declares the probe as a parameter so it depends only on the interface.
 */
export interface EngineProbe {
  isAvailable(adapterId: string): boolean;
}

/** Options for {@link preflightEngine}. */
export interface PreflightOptions {
  /** Adapter id to require. Defaults to {@link DEFAULT_CLAUDE_ADAPTER_ID}. */
  adapterId?: string;
  /** The engine method whose execution path is being gated. */
  method: EngineMethod;
}

/**
 * Fail-loud presence check for an EXECUTION path. When the probe reports the
 * required adapter ABSENT, throws a descriptive Error naming the missing adapter,
 * the method that needed it, and the remedy. When present, returns void.
 *
 * MANUAL authoring never calls this function — that path requires no engine.
 */
export function preflightEngine(probe: EngineProbe, options: PreflightOptions): void {
  const adapterId = options.adapterId ?? DEFAULT_CLAUDE_ADAPTER_ID;
  if (probe.isAvailable(adapterId)) {
    return;
  }
  const isDefaultAdapter = adapterId === DEFAULT_CLAUDE_ADAPTER_ID;
  const remedy = isDefaultAdapter
    ? `Remedy: install/enable the "${DEFAULT_CLAUDE_ADAPTER_ID}" plugin, `
    : `Remedy: install/enable the "${adapterId}" engine adapter, `;
  throw new Error(
    `Engine adapter "${adapterId}" is required by the "${options.method}" execution path but is not available. ` +
      remedy +
      `or use the manual authoring path (which needs no engine).`,
  );
}
