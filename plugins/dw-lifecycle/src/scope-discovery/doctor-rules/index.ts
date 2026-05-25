/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/index.ts
 *
 * Aggregator for the scope-discovery doctor rules. Imported by
 * `subcommands/doctor.ts` (the host doctor entry point) to extend the
 * built-in rule list with scope-discovery's eight rules.
 *
 * Rule order in the exported array is the order findings will be
 * reported when multiple rules fire on the same project. Group by
 * category (config validation → schema violation → refactor →
 * drift → install state) so the operator reads top-to-bottom in
 * triage order.
 */

import { check as configMissing } from './scope-discovery-config-missing.js';
import { check as schemaStale } from './scope-discovery-schema-stale.js';
import { check as clonesSchemaViolation } from './clones-yaml-schema-violation.js';
import { check as antiPatternsSchemaViolation } from './anti-patterns-yaml-schema-violation.js';
import type { DoctorRuleCheck } from './types.js';

export const SCOPE_DISCOVERY_DOCTOR_RULES: ReadonlyArray<DoctorRuleCheck> = [
  configMissing,
  schemaStale,
  clonesSchemaViolation,
  antiPatternsSchemaViolation,
];

export type { DoctorRuleCheck, DoctorRuleOptions, ScopeDoctorFinding } from './types.js';
export { CURRENT_SCHEMA_VERSION } from './types.js';
