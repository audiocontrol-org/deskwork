/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/scope-discovery-config-missing.ts
 *
 * Doctor rule: detect projects that have tried to use scope-discovery
 * (heuristic: any reference to the slug "scope-discovery" in a feature
 * doc) but lack the `.stack-control/scope-discovery/` config directory
 * the install command writes.
 *
 * Why the heuristic: a project with NO scope-discovery references at
 * all may legitimately not be opted-in; firing the rule there would
 * spam every adopter of the plugin who hasn't yet adopted
 * scope-discovery. The heuristic narrows the warning to projects that
 * are mid-adoption (workplan / PRD mentions scope-discovery) but
 * haven't completed the install.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'scope-discovery-config-missing';
const CONFIG_DIR_REL = '.stack-control/scope-discovery';
const DOCS_ROOT_REL = 'docs';
const HEURISTIC_REGEX = /scope-discovery/i;
const MAX_DOC_BYTES = 256 * 1024;

function safeReadDir(path: string): readonly string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function findScopeDiscoveryReferences(repoRoot: string): readonly string[] {
  const hits: string[] = [];
  const docsRoot = join(repoRoot, DOCS_ROOT_REL);
  if (!existsSync(docsRoot)) {
    return hits;
  }
  const versions = safeReadDir(docsRoot);
  for (const version of versions) {
    const versionDir = join(docsRoot, version);
    const stages = safeReadDir(versionDir);
    for (const stage of stages) {
      const stageDir = join(versionDir, stage);
      const features = safeReadDir(stageDir);
      for (const feature of features) {
        const featureDir = join(stageDir, feature);
        for (const doc of ['prd.md', 'workplan.md', 'README.md']) {
          const docPath = join(featureDir, doc);
          if (!existsSync(docPath)) continue;
          try {
            const text = readFileSync(docPath, 'utf8').slice(0, MAX_DOC_BYTES);
            if (HEURISTIC_REGEX.test(text)) {
              hits.push(docPath);
            }
          } catch {
            // Ignore read errors — the rule is a heuristic; an
            // unreadable file is the doctor's problem, not this rule's.
          }
        }
      }
    }
  }
  return hits;
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const configDir = join(opts.repoRoot, CONFIG_DIR_REL);
  if (existsSync(configDir)) {
    return [];
  }
  const hits: readonly string[] = (() => {
    try {
      return findScopeDiscoveryReferences(opts.repoRoot);
    } catch (err) {
      // If walking the docs tree itself throws, surface that as the
      // rule's finding rather than silently no-op'ing. Doctor rules
      // should be loud about their own diagnostic failures.
      return [
        `<heuristic walk failed: ${errorMessage(err)}>`,
      ];
    }
  })();
  if (hits.length === 0) {
    return [];
  }
  const sample = hits.slice(0, 3).join(', ');
  return [
    {
      rule: RULE_ID,
      severity: 'warning',
      message:
        `${CONFIG_DIR_REL}/ is missing, but ${hits.length} feature doc(s) ` +
        `reference scope-discovery (e.g. ${sample}). ` +
        `Run /stack-control:install-scope-discovery to bootstrap the config dir.`,
    },
  ];
};
