/**
 * plugins/dw-lifecycle/src/scope-discovery/recovery/systematic-wrongness.ts
 *
 * Systematic-wrongness classifier.
 *
 * Per task pre-made decision #3: "When a CLASS of decisions has been
 * wrong N times in a row, route that class to escalation by default.
 * Class definition: same pattern-type + same disposition + similar
 * shape." Threshold: N=3 within K=10 turns.
 *
 * # Surfaces
 *
 *   - `classifySystematicWrongness(events, options?)` — pure, takes
 *     an event list (typically the events surfaced this turn PLUS the
 *     trust-calibration ring buffer's wrong-decision history) and
 *     returns one `SystematicWrongnessClass` per distinct class-key,
 *     each with its event cluster + threshold-crossed flag.
 *
 *   - `classKeysAtThreshold(classes)` — convenience helper returning
 *     just the class-keys whose `thresholdCrossed === true`. Callers
 *     route those classes to escalation by default.
 *
 * # No casts, no any
 *
 * Pure aggregation over the input event list; no I/O, no side effects.
 */

import type { CatalogStatus } from '../util/catalog-status.js';
import type {
  SystematicWrongnessClass,
  WrongDecisionEvent,
} from './recovery-types.js';
import { DEFAULT_SYSTEMATIC_WRONGNESS_THRESHOLD } from './recovery-types.js';
import {
  classKeyForEvent,
  deriveShapeTag,
} from './trust-calibration.js';

/**
 * Options for the classifier. Defaults track the pre-made decisions:
 *
 *   - `threshold` — N. Default 3.
 *
 * The K (window) is enforced upstream by the caller's choice of which
 * events to pass in. The classifier itself doesn't impose a window;
 * the caller's responsibility is to pre-trim by `detectedAt` if
 * needed.
 */
export interface ClassifyOptions {
  readonly threshold?: number;
}

/**
 * Bucket of accumulated events sharing the same class-key. Used as the
 * intermediate accumulator before producing the immutable result.
 */
interface AccumulatedClass {
  readonly classKey: string;
  readonly patternType: string;
  readonly disposition: CatalogStatus;
  readonly shapeTag: string;
  readonly events: WrongDecisionEvent[];
}

/**
 * Classify a list of wrong-decision events into per-class clusters.
 * Returns one entry per distinct class-key seen in the input; events
 * are preserved newest-first within each class (the input order is
 * not altered — callers pass events in the order they want them
 * grouped).
 *
 * Threshold flag: `thresholdCrossed === wrongCount >= threshold`.
 */
export function classifySystematicWrongness(
  events: ReadonlyArray<WrongDecisionEvent>,
  options: ClassifyOptions = {},
): ReadonlyArray<SystematicWrongnessClass> {
  const threshold = options.threshold ?? DEFAULT_SYSTEMATIC_WRONGNESS_THRESHOLD;
  const map = new Map<string, AccumulatedClass>();
  for (const event of events) {
    const classKey = classKeyForEvent(event);
    const existing = map.get(classKey);
    if (existing === undefined) {
      map.set(classKey, {
        classKey,
        patternType: event.patternType ?? 'untyped',
        disposition: event.priorStatus,
        shapeTag: deriveShapeTag(event.registryPath),
        events: [event],
      });
    } else {
      existing.events.push(event);
    }
  }
  const out: SystematicWrongnessClass[] = [];
  for (const bucket of map.values()) {
    const wrongCount = bucket.events.length;
    out.push({
      classKey: bucket.classKey,
      patternType: bucket.patternType,
      disposition: bucket.disposition,
      shapeTag: bucket.shapeTag,
      wrongCount,
      contributingEvents: bucket.events,
      thresholdCrossed: wrongCount >= threshold,
    });
  }
  return out;
}

/**
 * Convenience: return the class-keys whose threshold has been crossed.
 * Callers (orchestrator-agent / controller) use this list to route the
 * identified classes to escalation by default until evidence improves.
 */
export function classKeysAtThreshold(
  classes: ReadonlyArray<SystematicWrongnessClass>,
): ReadonlyArray<string> {
  return classes.filter((c) => c.thresholdCrossed).map((c) => c.classKey);
}

/**
 * Decision primitive: should this candidate be routed to escalation
 * regardless of confidence?
 *
 *   - When the candidate's `(patternType, priorStatus, registryPath)`
 *     triple maps to a class-key with `thresholdCrossed === true`,
 *     this returns `true` — the orchestrator escalates by default.
 *
 *   - Otherwise, returns `false` — the orchestrator's standard
 *     confidence-vs-threshold gate applies.
 *
 * The caller assembles the components from whatever candidate or
 * proposal it's evaluating; the function is registry- and source-
 * agnostic.
 */
export function shouldRouteToEscalation(
  classes: ReadonlyArray<SystematicWrongnessClass>,
  patternType: string | undefined,
  priorStatus: CatalogStatus,
  registryPath: string,
): boolean {
  const pt = patternType ?? 'untyped';
  const shape = deriveShapeTag(registryPath);
  const key = `${pt}|${priorStatus}|${shape}`;
  const match = classes.find((c) => c.classKey === key);
  if (match === undefined) return false;
  return match.thresholdCrossed;
}
