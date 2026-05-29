/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/recovery/recovery.fixtures.ts
 *
 * Shared fixture builders for Phase 11 Task 8 recovery tests.
 * Co-located with the test files; not part of the production module
 * (no entry in src/scope-discovery/recovery/).
 */

import type {
  CatalogStatus,
  Provenance,
  ProvenanceSource,
} from '../../../scope-discovery/util/catalog-status.js';
import type {
  ParsedAuditEntry,
  ParsedAuditLog,
} from '../../../scope-discovery/util/audit-log-parser.js';
import type { CatalogEntryView } from '../../../scope-discovery/recovery/detect-wrong-decisions.js';
import type {
  WrongDecisionEvent,
} from '../../../scope-discovery/recovery/recovery-types.js';

/**
 * Build a `CatalogEntryView`. `pattern-type` is optional to mirror the
 * production type.
 */
export function makeCatalogView(args: {
  readonly registryPath: string;
  readonly entryId: string;
  readonly status?: CatalogStatus;
  readonly provenanceSource?: ProvenanceSource;
  readonly authoredBy?: string;
  readonly context?: string;
  readonly patternType?: string;
  readonly authoredAt?: string;
}): CatalogEntryView {
  const provenance: {
    -readonly [K in keyof Provenance]: Provenance[K];
  } = {
    source: args.provenanceSource ?? 'orchestrator-agent',
    authored_at: args.authoredAt ?? '2026-05-20T10:00:00Z',
  };
  if (args.authoredBy !== undefined) provenance.authored_by = args.authoredBy;
  if (args.context !== undefined) provenance.context = args.context;
  const out: {
    -readonly [K in keyof CatalogEntryView]: CatalogEntryView[K];
  } = {
    registryPath: args.registryPath,
    entryId: args.entryId,
    status: args.status ?? 'blessed',
    provenance,
  };
  if (args.patternType !== undefined) out.patternType = args.patternType;
  return out;
}

/**
 * Build a `ParsedAuditEntry` for fixture-driven detection tests.
 */
export function makeAuditEntry(args: {
  readonly findingId: string;
  readonly body: string;
  readonly affects?: ReadonlyArray<string>;
  readonly status?: string;
  readonly heading?: string;
  readonly severity?: string;
  readonly surface?: string;
  readonly provenance?: string;
}): ParsedAuditEntry {
  const out: {
    -readonly [K in keyof ParsedAuditEntry]: ParsedAuditEntry[K];
  } = {
    findingId: args.findingId,
    status: args.status ?? 'open',
    heading: args.heading ?? `Finding ${args.findingId}`,
    affects: args.affects ?? [],
    lineNumber: 1,
    body: args.body,
  };
  if (args.severity !== undefined) out.severity = args.severity;
  if (args.surface !== undefined) out.surface = args.surface;
  if (args.provenance !== undefined) out.provenance = args.provenance;
  return out;
}

/**
 * Wrap parsed entries into a `ParsedAuditLog`. The `sourcePath` is a
 * placeholder; detection logic doesn't read it.
 */
export function makeAuditLog(
  entries: ReadonlyArray<ParsedAuditEntry>,
  sourcePath = 'audit-log.md',
): ParsedAuditLog {
  return { sourcePath, entries };
}

/**
 * Build a `WrongDecisionEvent` directly — used by tests that exercise
 * the trust-calibration and systematic-wrongness modules without going
 * through detection.
 */
export function makeWrongDecisionEvent(args: {
  readonly catalogEntryId: string;
  readonly registryPath: string;
  readonly findingId: string;
  readonly priorStatus?: CatalogStatus;
  readonly priorProvenanceSource?: 'orchestrator-agent' | 'llm-judge-proposed';
  readonly patternType?: string;
  readonly detectionGrounds?: string;
  readonly detectedAt?: string;
}): WrongDecisionEvent {
  const out: {
    -readonly [K in keyof WrongDecisionEvent]: WrongDecisionEvent[K];
  } = {
    catalogEntryId: args.catalogEntryId,
    registryPath: args.registryPath,
    findingId: args.findingId,
    priorStatus: args.priorStatus ?? 'blessed',
    priorProvenanceSource: args.priorProvenanceSource ?? 'orchestrator-agent',
    detectionGrounds:
      args.detectionGrounds ?? 'fixture-built event (no body match performed)',
    detectedAt: args.detectedAt ?? '2026-05-26T12:00:00Z',
  };
  if (args.patternType !== undefined) out.patternType = args.patternType;
  return out;
}
