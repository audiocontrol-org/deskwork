import type { LaneCapabilityProfile } from './lane-capabilities.js';

export interface FleetNegotiationResult {
  readonly version: 1;
  readonly requestedPromptBytes: number;
  readonly acceptedFleet: readonly string[];
  readonly rejectedLanes: readonly string[];
  readonly disposition: 'accepted' | 'negotiation-failed';
}

export function negotiateFleet(
  lanes: readonly LaneCapabilityProfile[],
  requestedPromptBytes: number,
  requireModels: number,
): FleetNegotiationResult {
  if (!Number.isInteger(requestedPromptBytes) || requestedPromptBytes < 1) {
    throw new Error(
      `fleet negotiation requestedPromptBytes must be a positive integer, got '${requestedPromptBytes}'`,
    );
  }
  if (!Number.isInteger(requireModels) || requireModels < 1) {
    throw new Error(`fleet negotiation requireModels must be a positive integer, got '${requireModels}'`);
  }
  assertUniqueLaneNames(lanes);
  const accepted = lanes
    .filter(
      (lane) =>
        lane.availability === 'available' &&
        lane.envelope.maxPromptBytes >= requestedPromptBytes &&
        lane.enforcement === 'enforced' &&
        lane.liveness === 'monitored',
    )
    .map((lane) => lane.name);
  const rejected = lanes
    .filter(
      (lane) =>
        lane.availability !== 'available' ||
        lane.envelope.maxPromptBytes < requestedPromptBytes ||
        lane.enforcement !== 'enforced' ||
        lane.liveness !== 'monitored',
    )
    .map((lane) => lane.name);
  return {
    version: 1,
    requestedPromptBytes,
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
