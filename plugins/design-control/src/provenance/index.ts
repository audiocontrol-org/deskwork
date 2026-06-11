/**
 * Public surface of the wireframe-provenance module. Import via `@/provenance`.
 */

export {
  type WireframeProvenance,
  type ProvenanceFinding,
  type AcceptanceResult,
  recordDrivingWireframe,
  recordDerivation,
  loadProvenance,
  checkDerivedAcceptance,
  wireframeDroveImplementation,
} from '@/provenance/derived';
