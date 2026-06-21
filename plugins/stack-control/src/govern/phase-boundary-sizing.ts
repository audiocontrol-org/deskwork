// Envelope-measurement primitive — the rendered-payload byte currency checked
// against the active fleet envelope.
//
// 030 rekey (T009, research Tension 1+2): this primitive is DECOUPLED from the
// per-phase concept — it measures rendered bytes for a generic unit `id` (a
// chunk id, a seam id, or, transitionally, a phase id). The measurement logic is
// unchanged; only the key concept moved off `phaseId`. The chunk bin-packer
// (FR-002) AVOIDS the over-envelope condition rather than asserting against it,
// so `BoundaryTooLargeError` + `assertBoundaryFits` are retained only for the
// per-phase path that US2 (T035) deletes.

export interface ProspectiveBoundaryEstimate {
  readonly version: 1;
  readonly id: string;
  readonly estimatedPromptBytes: number;
  readonly estimateBasis: string;
  readonly fitsActiveFleet: boolean;
}

export interface ActualPayloadMeasurement {
  readonly version: 1;
  readonly id: string;
  readonly measuredPromptBytes: number;
  readonly activeFleetEnvelopeBytes: number;
  readonly disposition: 'fits' | 'boundary-too-large';
}

export function estimateBoundary(
  id: string,
  paths: readonly string[],
  averageBytesPerPath: number,
  activeFleetEnvelopeBytes: number,
): ProspectiveBoundaryEstimate {
  assertNonEmptyId(id);
  assertPositiveInteger(averageBytesPerPath, 'averageBytesPerPath');
  assertPositiveInteger(activeFleetEnvelopeBytes, 'activeFleetEnvelopeBytes');
  const estimatedPromptBytes = paths.length * averageBytesPerPath;
  return {
    version: 1,
    id,
    estimatedPromptBytes,
    estimateBasis: `${paths.length} path(s) × ${averageBytesPerPath} bytes/path`,
    fitsActiveFleet: estimatedPromptBytes <= activeFleetEnvelopeBytes,
  };
}

export function measureBoundaryFit(
  id: string,
  measuredPromptBytes: number,
  activeFleetEnvelopeBytes: number,
): ActualPayloadMeasurement {
  assertNonEmptyId(id);
  assertPositiveInteger(measuredPromptBytes, 'measuredPromptBytes');
  assertPositiveInteger(activeFleetEnvelopeBytes, 'activeFleetEnvelopeBytes');
  return {
    version: 1,
    id,
    measuredPromptBytes,
    activeFleetEnvelopeBytes,
    disposition:
      measuredPromptBytes <= activeFleetEnvelopeBytes ? 'fits' : 'boundary-too-large',
  };
}

function assertNonEmptyId(id: string): void {
  if (id.length === 0) {
    throw new Error('boundary id must be a non-empty string');
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`phase boundary ${field} must be a positive integer, got '${value}'`);
  }
}
