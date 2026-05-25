/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/clones-yaml-schema-violation.ts
 *
 * Doctor rule: runs the strict clones.yaml parser against the
 * project's baseline and reports any schema violation surfaced by
 * `parseClonesYamlStrict`. The error message already carries the
 * failing entry index / field name (per AUDIT-20260524-14), so this
 * rule's job is to wrap that into a doctor finding with a repair hint
 * pointing at the JSON schema.
 *
 * RefactorPreconditionError is intentionally NOT swallowed here — it
 * propagates as its own finding so the operator distinguishes "shape
 * is wrong" from "refactor entry is incomplete". The latter is the
 * dedicated `clones-yaml-refactor-incomplete` rule's territory; we
 * forward it without comment so the doctor doesn't double-report.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ClonesYamlParseError,
  parseClonesYamlStrict,
} from '../clones-yaml.parse.js';
import { RefactorPreconditionError } from '../clones-yaml.refactor.js';
import { errorMessage } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'clones-yaml-schema-violation';
const FILE_REL = '.dw-lifecycle/scope-discovery/clones.yaml';
const SCHEMA_REL =
  'plugins/dw-lifecycle/src/scope-discovery/schema/clones.yaml.schema.json';

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const path = join(opts.repoRoot, FILE_REL);
  if (!existsSync(path)) {
    return [];
  }
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return [
      {
        rule: RULE_ID,
        severity: 'error',
        message: `${path}: failed to read (${errorMessage(err)}).`,
      },
    ];
  }
  try {
    parseClonesYamlStrict(text);
    return [];
  } catch (err) {
    if (err instanceof RefactorPreconditionError) {
      // Forward to the dedicated rule; do not double-report.
      return [];
    }
    if (err instanceof ClonesYamlParseError) {
      return [
        {
          rule: RULE_ID,
          severity: 'error',
          message:
            `${path}: ${err.reason}. ` +
            `Diff the file against the schema at ${SCHEMA_REL} ` +
            `(or run any JSON-Schema 2020 validator against the YAML→JSON conversion).`,
        },
      ];
    }
    return [
      {
        rule: RULE_ID,
        severity: 'error',
        message: `${path}: unexpected parse failure: ${errorMessage(err)}`,
      },
    ];
  }
};
