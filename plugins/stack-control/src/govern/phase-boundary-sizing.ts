export interface ProspectiveBoundaryEstimate {
  readonly version: 1;
  readonly phaseId: string;
  readonly estimatedPromptBytes: number;
  readonly estimateBasis: string;
  readonly fitsActiveFleet: boolean;
}

export interface ActualPayloadMeasurement {
  readonly version: 1;
  readonly phaseId: string;
  readonly measuredPromptBytes: number;
  readonly activeFleetEnvelopeBytes: number;
  readonly disposition: 'fits' | 'boundary-too-large';
}

export class BoundaryTooLargeError extends Error {
  constructor(
    readonly phaseId: string,
    readonly measuredPromptBytes: number,
    readonly activeFleetEnvelopeBytes: number,
  ) {
    super(
      `phase '${phaseId}' rendered ${measuredPromptBytes} prompt bytes, exceeding the active fleet envelope ${activeFleetEnvelopeBytes}`,
    );
    this.name = 'BoundaryTooLargeError';
  }
}

export function estimateBoundary(
  phaseId: string,
  paths: readonly string[],
  averageBytesPerPath: number,
  activeFleetEnvelopeBytes: number,
): ProspectiveBoundaryEstimate {
  assertPhaseId(phaseId);
  assertPositiveInteger(averageBytesPerPath, 'averageBytesPerPath');
  assertPositiveInteger(activeFleetEnvelopeBytes, 'activeFleetEnvelopeBytes');
  const estimatedPromptBytes = paths.length * averageBytesPerPath;
  return {
    version: 1,
    phaseId,
    estimatedPromptBytes,
    estimateBasis: `${paths.length} path(s) × ${averageBytesPerPath} bytes/path`,
    fitsActiveFleet: estimatedPromptBytes <= activeFleetEnvelopeBytes,
  };
}

export function measureBoundaryFit(
  phaseId: string,
  measuredPromptBytes: number,
  activeFleetEnvelopeBytes: number,
): ActualPayloadMeasurement {
  assertPhaseId(phaseId);
  assertPositiveInteger(measuredPromptBytes, 'measuredPromptBytes');
  assertPositiveInteger(activeFleetEnvelopeBytes, 'activeFleetEnvelopeBytes');
  return {
    version: 1,
    phaseId,
    measuredPromptBytes,
    activeFleetEnvelopeBytes,
    disposition:
      measuredPromptBytes <= activeFleetEnvelopeBytes ? 'fits' : 'boundary-too-large',
  };
}

export function assertBoundaryFits(
  phaseId: string,
  measuredPromptBytes: number,
  activeFleetEnvelopeBytes: number,
): ActualPayloadMeasurement {
  const measurement = measureBoundaryFit(
    phaseId,
    measuredPromptBytes,
    activeFleetEnvelopeBytes,
  );
  if (measurement.disposition === 'boundary-too-large') {
    throw new BoundaryTooLargeError(
      phaseId,
      measuredPromptBytes,
      activeFleetEnvelopeBytes,
    );
  }
  return measurement;
}

function assertPhaseId(phaseId: string): void {
  if (phaseId.length === 0) {
    throw new Error('phase boundary phaseId must be a non-empty string');
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`phase boundary ${field} must be a positive integer, got '${value}'`);
  }
}
