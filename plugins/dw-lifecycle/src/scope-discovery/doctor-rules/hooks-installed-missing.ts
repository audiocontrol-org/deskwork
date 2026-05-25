/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/hooks-installed-missing.ts
 *
 * Doctor rule: reads
 * `.dw-lifecycle/scope-discovery/hooks-installed.json` and verifies
 * every managed file in the manifest still exists on disk. When the
 * operator has manually deleted one or more managed files, the
 * manifest goes stale and the next install / uninstall command can't
 * reason correctly about the project's state. This rule surfaces the
 * gap with a repair hint.
 *
 * Two repair paths (both listed; operator chooses):
 *   - Re-install via `install-scope-discovery-hooks --force` (and/or
 *     `install-agent-prompts --force`), which rewrites the missing
 *     file(s) and refreshes the manifest.
 *   - Clean uninstall via `uninstall-scope-discovery-hooks --force-uninstall`,
 *     which drops the manifest entirely (use when the operator wants
 *     scope-discovery hooks out of the project for good).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readExistingManifest } from '../install-scope-discovery-hooks.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'hooks-installed-missing';
const MANIFEST_REL = '.dw-lifecycle/scope-discovery/hooks-installed.json';

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const manifestPath = join(opts.repoRoot, MANIFEST_REL);
  if (!existsSync(manifestPath)) return [];
  const manifest = readExistingManifest(manifestPath);
  if (manifest === null) {
    return [
      {
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${manifestPath}: manifest exists but failed to parse. ` +
          `Run /dw-lifecycle:uninstall-scope-discovery-hooks --force-uninstall to clean up, ` +
          `then /dw-lifecycle:install-scope-discovery-hooks to re-install.`,
      },
    ];
  }
  const missing: string[] = [];
  for (const file of manifest.files) {
    if (!existsSync(file.path)) {
      missing.push(file.path);
    }
  }
  if (missing.length === 0) return [];
  const sample = missing.slice(0, 3).join(', ');
  return [
    {
      rule: RULE_ID,
      severity: 'warning',
      message:
        `${MANIFEST_REL}: ${missing.length} managed file(s) referenced but missing on disk ` +
        `(e.g. ${sample}). ` +
        `Run /dw-lifecycle:install-scope-discovery-hooks --force to re-install, ` +
        `OR /dw-lifecycle:uninstall-scope-discovery-hooks --force-uninstall to clean ` +
        `the manifest.`,
    },
  ];
};
