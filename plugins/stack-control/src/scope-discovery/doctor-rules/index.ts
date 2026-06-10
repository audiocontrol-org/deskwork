/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/index.ts
 *
 * Aggregator for the scope-discovery doctor rules ported into stack-control
 * (010 / US6). SUBSET of dw-lifecycle's set: the three feature-coupled rules
 * (fix-task-tdd-discipline, tooling-feedback-stale,
 * workplan-archive-ledger-coherence) are intentionally NOT ported — they
 * belong to other features. Imported by `subcommands/scope-doctor.ts`.
 *
 * Rule order is the reporting order: config validation → schema violation →
 * refactor → drift → catalog status → provenance → legacy rename.
 */

import { check as configMissing } from './scope-discovery-config-missing.js';
import { check as schemaStale } from './scope-discovery-schema-stale.js';
import { check as clonesSchemaViolation } from './clones-yaml-schema-violation.js';
import { check as antiPatternsSchemaViolation } from './anti-patterns-yaml-schema-violation.js';
import { check as refactorIncomplete } from './clones-yaml-refactor-incomplete.js';
import { check as overrideDrift } from './override-drift.js';
import { check as catalogEntryMissingStatus } from './catalog-entry-missing-status.js';
import { check as provenanceOrphanedEntries } from './provenance-orphaned-entries.js';
import { check as legacyEditorSymmetryFieldRename } from './legacy-editor-symmetry-field-rename.js';
import type { DoctorRuleCheck } from './types.js';

export const SCOPE_DISCOVERY_DOCTOR_RULES: ReadonlyArray<DoctorRuleCheck> = [
  configMissing,
  schemaStale,
  clonesSchemaViolation,
  antiPatternsSchemaViolation,
  refactorIncomplete,
  overrideDrift,
  catalogEntryMissingStatus,
  provenanceOrphanedEntries,
  legacyEditorSymmetryFieldRename,
];

export type { DoctorRuleCheck, DoctorRuleOptions, ScopeDoctorFinding } from './types.js';
export { CURRENT_SCHEMA_VERSION } from './types.js';
