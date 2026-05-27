/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/tooling-feedback-stale.ts
 *
 * Doctor rule: surface TF entries that have been open (no closure
 * marker) for longer than the configured threshold (default: 14 days).
 *
 * Heuristic for "when did the TF entry land?" — the entry's commit
 * date is the source-of-truth, but the doctor doesn't shell out to
 * git. Instead, the rule reads `docs/<v>/001-IN-PROGRESS/<slug>/
 * tooling-feedback.md` and parses the optional `last-touched:` line
 * within each TF body. When the line is absent the rule uses the
 * file's mtime as a fallback (worst-case: the entire log gets flagged
 * after the threshold, which is still actionable — it nudges the
 * operator to triage).
 *
 * Threshold:
 *   - Default: 14 days.
 *   - Override via `.dw-lifecycle/scope-discovery/config.yaml` field
 *     `tooling_feedback_stale_days: <int>` (created at install time
 *     when absent). The doctor reads the YAML config on-demand;
 *     malformed YAML drops back to the default.
 *
 * Repair hint: cites `/dw-lifecycle:tooling-feedback-import` when the
 * entry has a closure status that's just sitting un-imported, OR a
 * generic "triage the entry" hint when the entry is genuinely open.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  parseToolingFeedback,
  type ToolingFeedbackEntry,
} from '../tooling-feedback-import.js';
import { errorMessage, isPlainObject } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'tooling-feedback-stale';
const DOCS_ROOT_REL = 'docs';
const IN_PROGRESS_STAGE = '001-IN-PROGRESS';
const TOOLING_FEEDBACK_FILENAME = 'tooling-feedback.md';
const CONFIG_REL = '.dw-lifecycle/scope-discovery/config.yaml';
const DEFAULT_STALE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function safeReadDir(path: string): readonly string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function readStaleThreshold(repoRoot: string): number {
  const configPath = join(repoRoot, CONFIG_REL);
  if (!existsSync(configPath)) return DEFAULT_STALE_DAYS;
  let text: string;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch {
    return DEFAULT_STALE_DAYS;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return DEFAULT_STALE_DAYS;
  }
  if (!isPlainObject(parsed)) return DEFAULT_STALE_DAYS;
  const raw = parsed['tooling_feedback_stale_days'];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
    return DEFAULT_STALE_DAYS;
  }
  return Math.floor(raw);
}

function fileMtime(path: string): Date | null {
  try {
    return statSync(path).mtime;
  } catch {
    return null;
  }
}

interface TfFileRecord {
  readonly path: string;
  readonly featureSlug: string;
  readonly entries: readonly ToolingFeedbackEntry[];
  readonly mtime: Date | null;
}

function collectTfFiles(repoRoot: string): readonly TfFileRecord[] {
  const docsRoot = join(repoRoot, DOCS_ROOT_REL);
  if (!existsSync(docsRoot)) return [];
  const out: TfFileRecord[] = [];
  for (const version of safeReadDir(docsRoot)) {
    const stageDir = join(docsRoot, version, IN_PROGRESS_STAGE);
    if (!existsSync(stageDir)) continue;
    for (const feature of safeReadDir(stageDir)) {
      const tfPath = join(stageDir, feature, TOOLING_FEEDBACK_FILENAME);
      if (!existsSync(tfPath)) continue;
      let text: string;
      try {
        text = readFileSync(tfPath, 'utf8');
      } catch {
        continue;
      }
      const entries = parseToolingFeedback({
        text,
        sourcePath: tfPath,
        featureSlug: feature,
      });
      out.push({
        path: tfPath,
        featureSlug: feature,
        entries,
        mtime: fileMtime(tfPath),
      });
    }
  }
  return out;
}

/**
 * Decide whether a TF entry counts as stale. Open entries (no closure
 * marker) older than `thresholdDays` fire. Closure-marked but
 * not-yet-imported entries ALSO fire — that's the "import the closure"
 * case the rule's repair hint nudges toward. Already-imported entries
 * are out of the staleness loop by construction.
 */
function isStale(args: {
  readonly entry: ToolingFeedbackEntry;
  readonly fileMtimeMs: number;
  readonly now: number;
  readonly thresholdDays: number;
}): boolean {
  if (args.entry.importedAs !== null) return false;
  const ageDays = (args.now - args.fileMtimeMs) / MS_PER_DAY;
  return ageDays >= args.thresholdDays;
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  let thresholdDays: number;
  try {
    thresholdDays = readStaleThreshold(opts.repoRoot);
  } catch (err) {
    return [
      {
        rule: RULE_ID,
        severity: 'warning',
        message:
          `tooling-feedback-stale: failed to read threshold from ` +
          `${CONFIG_REL} (${errorMessage(err)}); using default ${DEFAULT_STALE_DAYS} days.`,
      },
    ];
  }
  const now = Date.now();
  const findings: ScopeDoctorFinding[] = [];
  for (const record of collectTfFiles(opts.repoRoot)) {
    const fileMtimeMs = record.mtime?.getTime() ?? now;
    for (const entry of record.entries) {
      if (!isStale({ entry, fileMtimeMs, now, thresholdDays })) continue;
      const ageDays = Math.floor((now - fileMtimeMs) / MS_PER_DAY);
      const hint =
        entry.status !== null
          ? `closure-status is ${entry.status.literal}; run ` +
            `/dw-lifecycle:tooling-feedback-import --apply to promote it to the audit-log.`
          : `entry has no closure marker yet; triage + add ` +
            `\`**Status:** addressed-<sha>\` (or superseded-by-<TF-NN> / verified-<date>) ` +
            `when resolved, then run /dw-lifecycle:tooling-feedback-import --apply.`;
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${record.path}: ${entry.id} (${record.featureSlug}) has been ` +
          `open for ${ageDays} day(s) (threshold ${thresholdDays}). ` +
          `${hint}`,
      });
    }
  }
  return findings;
};

// Re-exported for tests so they can drive the threshold computation
// without going through a fixture YAML.
export { DEFAULT_STALE_DAYS, CONFIG_REL };
