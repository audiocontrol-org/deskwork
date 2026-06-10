/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/anti-patterns-yaml-schema-violation.ts
 *
 * Doctor rule: parses the project's anti-patterns.yaml via
 * `loadRegistry` and surfaces any schema violation. The registry
 * parser already produces a namespaced + context-rich error message
 * (entry index + field name); the rule wraps that into a doctor
 * finding with a repair hint pointing at the JSON schema.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry } from '../anti-patterns-registry.js';
import { errorMessage } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'anti-patterns-yaml-schema-violation';
const FILE_REL = '.stack-control/scope-discovery/anti-patterns.yaml';
const SCHEMA_REL =
  'plugins/stack-control/src/scope-discovery/schema/anti-patterns.yaml.schema.json';

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const path = join(opts.repoRoot, FILE_REL);
  if (!existsSync(path)) {
    return [];
  }
  try {
    await loadRegistry(path);
    return [];
  } catch (err) {
    return [
      {
        rule: RULE_ID,
        severity: 'error',
        message:
          `${path}: ${errorMessage(err)}. ` +
          `Diff the file against the schema at ${SCHEMA_REL} ` +
          `(or run any JSON-Schema 2020 validator against the YAML→JSON conversion).`,
      },
    ];
  }
};
