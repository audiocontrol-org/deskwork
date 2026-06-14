# Data Model: Audit protocol friction burndown

## PhaseGovernanceCheckpoint

- `phaseId`: string
- `scopeFingerprint`: string
- `result`: `passed | failed | stale`
- `recordedAt`: ISO timestamp
- `anchorRoot`: string
- `fleetRef`: string

## ProspectiveBoundaryEstimate

- `phaseId`: string
- `estimatedPayloadBytes`: number
- `heuristicInputs`: record
- `recommendedDisposition`: `fits | split-required | unknown`

## ActualPayloadMeasurement

- `phaseId`: string
- `renderedPayloadBytes`: number
- `fleetEnvelope`: string
- `fits`: boolean
- `recordedAt`: ISO timestamp

## LaneCapabilityProfile

- `laneId`: string
- `availabilityClass`: `configured | available | degraded | excluded`
- `knownGoodPayloadBytes`: number
- `maxObservedPayloadBytes`: number
- `failureNotes`: string[]

## FleetNegotiationResult

- `selectedLaneIds`: string[]
- `requiredFloor`: number
- `disposition`: `accepted | floor-shortfall | negotiation-failed`
- `reason`: string
