import type { LaneCapabilityProfile } from './lane-capabilities.js';

export interface FleetNegotiationResult {
  readonly version: 1;
  readonly acceptedFleet: readonly string[];
  readonly rejectedLanes: readonly string[];
  readonly disposition: 'accepted' | 'negotiation-failed';
}

// Fleet negotiation selects lanes on the LANE-HEALTH axis only — availability,
// read-only enforcement, liveness monitoring, and the required-models floor.
// It deliberately does NOT consider payload size: the rendered-payload-vs-
// envelope check is the BOUNDARY axis and lives in `assertBoundaryFits`
// (phase-boundary-sizing.ts), so an oversized payload over an otherwise-viable
// fleet surfaces as the distinct `boundary-too-large` terminal rather than being
// preempted here as `negotiation-failed` (TASK-117; US2/FR-006 vs US3/FR-008;
// the two terminals stay machine-distinguishable per SC-005).
export function negotiateFleet(
  lanes: readonly LaneCapabilityProfile[],
  requireModels: number,
): FleetNegotiationResult {
  if (!Number.isInteger(requireModels) || requireModels < 1) {
    throw new Error(`fleet negotiation requireModels must be a positive integer, got '${requireModels}'`);
  }
  assertUniqueLaneNames(lanes);
  const isViable = (lane: LaneCapabilityProfile): boolean =>
    lane.availability === 'available' &&
    lane.enforcement === 'enforced' &&
    lane.liveness === 'monitored';
  const accepted = lanes.filter(isViable).map((lane) => lane.name);
  const rejected = lanes.filter((lane) => !isViable(lane)).map((lane) => lane.name);
  return {
    version: 1,
    acceptedFleet: accepted,
    rejectedLanes: rejected,
    disposition: accepted.length >= requireModels ? 'accepted' : 'negotiation-failed',
  };
}

function assertUniqueLaneNames(lanes: readonly LaneCapabilityProfile[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const lane of lanes) {
    if (seen.has(lane.name)) {
      duplicates.add(lane.name);
    }
    seen.add(lane.name);
  }
  if (duplicates.size > 0) {
    throw new Error(
      `fleet negotiation lane names must be unique; duplicates: ${Array.from(duplicates).sort().join(', ')}`,
    );
  }
}
