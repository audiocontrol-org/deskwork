/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/index.ts
 *
 * Pattern-handler registry + dispatcher (polymorphic pattern handlers, G1 — the
 * polymorphic dispatcher itself).
 *
 * The pattern-matrix discovery agent calls `dispatch(entry, input)` for
 * each catalog entry; this file routes the entry to its type-specific
 * handler. New pattern types are added by:
 *
 *   1. Adding the entry variant to `./types.ts` (extend
 *      `PatternCatalogEntry`).
 *   2. Adding a handler file under `./<type>.ts`.
 *   3. Registering the handler in `HANDLERS` below.
 *   4. Extending the schema (pattern-matrix-patterns.yaml.schema.json).
 *   5. Extending the loader (`pattern-matrix.ts`'s `loadOverridePatterns`).
 *
 * The dispatch table is the source-of-truth for which types the
 * pattern-matrix supports at runtime; the schema describes what
 * adopters can author.
 */

import type { PatternFinding } from '../types.js';
import type { SourceFileView } from '../shared.js';
import type {
  PatternCatalogEntry,
  PatternHandler,
  PatternType,
} from './types.js';
import { regexHandler } from './regex.js';
import { negativeSpaceHandler } from './negative-space.js';
import { coverageHandler } from './coverage.js';
import { outlierHandler } from './outlier.js';
import { semanticHandler } from './semantic.js';

/**
 * Internal handler reference type. Each entry is the matching
 * concrete handler. The dispatch function below narrows the catalog
 * entry to the handler's bound type via the `type` discriminator —
 * no `as Type` casts, no `any`.
 */
type HandlerByType = {
  readonly [K in PatternType]: PatternHandler<Extract<PatternCatalogEntry, { type: K }>>;
};

const HANDLERS: HandlerByType = {
  regex: regexHandler,
  'negative-space': negativeSpaceHandler,
  coverage: coverageHandler,
  outlier: outlierHandler,
  semantic: semanticHandler,
};

/**
 * Dispatch a catalog entry to its type-specific handler. Returns a
 * `PatternFinding` (uniform across handlers) ready for inclusion in
 * the pattern-matrix agent's output.
 *
 * The switch is exhaustive on `PatternCatalogEntry['type']`; adding a
 * new variant to the union without registering a handler will be a
 * compile-time error.
 */
export function dispatchPattern(
  entry: PatternCatalogEntry,
  scans: ReadonlyArray<SourceFileView>,
): PatternFinding {
  switch (entry.type) {
    case 'regex':
      return HANDLERS.regex.apply({ entry, scans });
    case 'negative-space':
      return HANDLERS['negative-space'].apply({ entry, scans });
    case 'coverage':
      return HANDLERS.coverage.apply({ entry, scans });
    case 'outlier':
      return HANDLERS.outlier.apply({ entry, scans });
    case 'semantic':
      return HANDLERS.semantic.apply({ entry, scans });
  }
}

/**
 * The canonical list of registered pattern types. Adding a new handler
 * to `HANDLERS` requires extending this list — the matching test in
 * pattern-handlers/index.test.ts pins the set.
 */
const REGISTERED_TYPES: ReadonlyArray<PatternType> = [
  'coverage',
  'negative-space',
  'outlier',
  'regex',
  'semantic',
];

/** Exposed for tests that need to assert the registered type set. */
export function registeredPatternTypes(): ReadonlyArray<PatternType> {
  return REGISTERED_TYPES;
}

export type { PatternCatalogEntry, PatternType } from './types.js';
