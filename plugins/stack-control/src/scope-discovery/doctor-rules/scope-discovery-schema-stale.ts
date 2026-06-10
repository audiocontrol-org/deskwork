/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/scope-discovery-schema-stale.ts
 *
 * Doctor rule: detect operator-curated YAMLs whose `schemaVersion:`
 * field is missing or doesn't match the plugin's `CURRENT_SCHEMA_VERSION`.
 *
 * Why this is a separate rule from the schema-violation rules: the
 * version field is OPTIONAL at the parser level (legacy YAMLs that
 * predate this field still parse). The doctor warns separately so the
 * operator gets a migration hint without breaking parse paths.
 *
 * Three YAMLs are checked: clones.yaml, anti-patterns.yaml,
 * adopter-manifests.yaml. Each generates an independent finding so the
 * operator sees which file(s) need updating.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'node:path';
import { errorMessage, isPlainObject } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';

const RULE_ID = 'scope-discovery-schema-stale';
const CONFIG_DIR_REL = '.stack-control/scope-discovery';

const CHECKED_FILES: ReadonlyArray<string> = [
  'clones.yaml',
  'anti-patterns.yaml',
  'adopter-manifests.yaml',
];

function extractSchemaVersion(yamlText: string): number | undefined | 'malformed' {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return 'malformed';
  }
  if (parsed === null || parsed === undefined) {
    // Empty file — treated as "no version present", separate finding
    // path. Not malformed; the file just hasn't been initialized.
    return undefined;
  }
  if (!isPlainObject(parsed)) {
    return 'malformed';
  }
  const raw = parsed['schemaVersion'];
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return 'malformed';
  }
  return raw;
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const configDir = join(opts.repoRoot, CONFIG_DIR_REL);
  if (!existsSync(configDir)) {
    // The config-missing rule covers this case; don't double-warn.
    return [];
  }
  const findings: ScopeDoctorFinding[] = [];
  for (const file of CHECKED_FILES) {
    const path = join(configDir, file);
    if (!existsSync(path)) continue;
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message: `${path}: failed to read for schemaVersion check (${errorMessage(err)}).`,
      });
      continue;
    }
    const version = extractSchemaVersion(text);
    if (version === 'malformed') {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${path}: \`schemaVersion\` is present but malformed (expected a non-negative integer).`,
      });
      continue;
    }
    if (version === undefined) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${path}: \`schemaVersion\` field missing. ` +
          `Add \`schemaVersion: ${CURRENT_SCHEMA_VERSION}\` to the top of the file. ` +
          `Schema migration path: see plugins/stack-control/src/scope-discovery/schema/${file}.schema.json.`,
      });
      continue;
    }
    if (version !== CURRENT_SCHEMA_VERSION) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${path}: \`schemaVersion: ${version}\` does not match plugin's current ` +
          `version ${CURRENT_SCHEMA_VERSION}. ` +
          (version < CURRENT_SCHEMA_VERSION
            ? `Upgrade the file: review schema changes between v${version} and v${CURRENT_SCHEMA_VERSION}, ` +
              `update the file shape, and bump \`schemaVersion\` to ${CURRENT_SCHEMA_VERSION}.`
            : `The file declares a newer schema than this plugin supports. ` +
              `Upgrade the plugin or roll back the file's schemaVersion.`),
      });
    }
  }
  return findings;
};
