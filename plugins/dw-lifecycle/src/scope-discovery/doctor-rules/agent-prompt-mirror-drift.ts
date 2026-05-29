/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/agent-prompt-mirror-drift.ts
 *
 * Doctor rule: compares the Step 0 fragment embedded in
 * `.claude/agents/code-reviewer.md` and `.claude/agents/codebase-auditor.md`
 * against the canonical fragment shipped at
 * `plugins/dw-lifecycle/templates/scope-discovery/agent-step-0-fragment.md`.
 *
 * The fragment is delimited by the marker pair:
 *
 *   <!-- dw-lifecycle:scope-discovery:step-0:begin -->
 *   ... canonical body ...
 *   <!-- dw-lifecycle:scope-discovery:step-0:end -->
 *
 * Drift is detected by exact body comparison between the markers
 * (whitespace-normalized at the line level; trailing whitespace is
 * stripped before compare so editors that auto-trim don't false-fire).
 *
 * Agent files that don't yet contain the markers are NOT reported by
 * this rule — that's the install-agent-prompts territory; surfacing
 * "fragment missing entirely" here would noisily double-up on
 * adopters who simply haven't run the installer yet.
 *
 * Repair hint: re-run `install-agent-prompts --force` to regenerate,
 * OR document the divergence at `.dw-lifecycle/scope-discovery/agent-prompt-overrides.md`
 * (file presence treated as the operator's "deliberate divergence"
 * acknowledgment; in that case the rule suppresses the drift finding).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STEP_0_BEGIN_MARKER,
  STEP_0_END_MARKER,
  TARGET_AGENTS,
} from '../install-agent-prompts.js';
import { errorMessage } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'agent-prompt-mirror-drift';
const OVERRIDES_REL =
  '.dw-lifecycle/scope-discovery/agent-prompt-overrides.md';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// In dev / workspace: src/scope-discovery/doctor-rules → plugin root
// requires ../../../ then templates/scope-discovery/. In dist: the same
// relative shape applies because TS preserves the directory layout
// under dist/.
const CANONICAL_FRAGMENT_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'scope-discovery',
  'agent-step-0-fragment.md',
);

function extractBlockBody(text: string): string | undefined {
  const beginIdx = text.indexOf(STEP_0_BEGIN_MARKER);
  if (beginIdx === -1) return undefined;
  const endIdx = text.indexOf(STEP_0_END_MARKER, beginIdx);
  if (endIdx === -1) return undefined;
  // Body INCLUDES the markers + everything between, normalized below.
  return text.slice(beginIdx, endIdx + STEP_0_END_MARKER.length);
}

function normalize(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/u, ''))
    .join('\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  if (existsSync(join(opts.repoRoot, OVERRIDES_REL))) {
    // Operator has documented their divergence; suppress drift findings.
    return [];
  }
  let canonical: string;
  try {
    canonical = normalize(readFileSync(CANONICAL_FRAGMENT_PATH, 'utf8'));
  } catch (err) {
    return [
      {
        rule: RULE_ID,
        severity: 'error',
        message:
          `${CANONICAL_FRAGMENT_PATH}: cannot read canonical fragment (${errorMessage(err)}). ` +
          'The plugin install is incomplete; reinstall the plugin.',
      },
    ];
  }
  const findings: ScopeDoctorFinding[] = [];
  for (const rel of TARGET_AGENTS) {
    const path = join(opts.repoRoot, rel);
    if (!existsSync(path)) continue;
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message: `${path}: failed to read (${errorMessage(err)}).`,
      });
      continue;
    }
    const block = extractBlockBody(text);
    if (block === undefined) {
      // Markers missing — install-agent-prompts territory, not this
      // rule's. Skip silently.
      continue;
    }
    if (normalize(block) !== canonical) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${path}: Step 0 fragment has drifted from the canonical template. ` +
          `Run /dw-lifecycle:install-agent-prompts --force to regenerate, OR ` +
          `create ${OVERRIDES_REL} documenting the deliberate divergence ` +
          `(presence of that file suppresses this rule).`,
      });
    }
  }
  return findings;
};
