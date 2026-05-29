/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/fix-task-tdd-discipline.ts
 *
 * Phase 13 Task 3 — doctor rule that walks every `[x]`-marked workplan
 * task tagged `(fix-finding-AUDIT-<id>)` and surfaces tasks whose cited
 * test file is missing OR doesn't exist yet. Severity: error.
 *
 * Why error and not warning: per Phase 13's anti-deferral discipline,
 * a fix-finding task marked done WITHOUT the regression test is the
 * exact failure mode the discipline closes. The doctor cannot run
 * vitest cheaply (would slow down every doctor invocation), so the
 * commit-msg gate `check-fix-task-tdd` carries the "vitest passes"
 * half; the doctor carries the "test file exists" half.
 *
 * Scope: walks every feature under `docs/<v>/001-IN-PROGRESS/` and
 * each feature's `workplan.md`. Per-feature findings concatenate.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractTestFilePath,
  findCompletedFixFindingTasks,
} from '../promote-findings/tdd-enforcement.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'fix-task-tdd-discipline';
const DOCS_ROOT_REL = 'docs';
const IN_PROGRESS_STAGE = '001-IN-PROGRESS';
const WORKPLAN_FILENAME = 'workplan.md';

function safeReadDir(path: string): readonly string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export const check: DoctorRuleCheck = async (opts: DoctorRuleOptions) => {
  const findings: ScopeDoctorFinding[] = [];
  const docsRoot = join(opts.repoRoot, DOCS_ROOT_REL);
  if (!existsSync(docsRoot)) return findings;
  for (const versionDir of safeReadDir(docsRoot)) {
    const inProgress = join(docsRoot, versionDir, IN_PROGRESS_STAGE);
    if (!existsSync(inProgress)) continue;
    for (const slug of safeReadDir(inProgress)) {
      const workplanPath = join(inProgress, slug, WORKPLAN_FILENAME);
      if (!existsSync(workplanPath)) continue;
      let workplan: string;
      try {
        workplan = readFileSync(workplanPath, 'utf8');
      } catch {
        continue;
      }
      const completed = findCompletedFixFindingTasks(workplan);
      for (const entry of completed) {
        const testPath = extractTestFilePath(entry.taskBlock);
        if (testPath === null) {
          findings.push({
            rule: RULE_ID,
            severity: 'error',
            message: `feature '${slug}' ${WORKPLAN_FILENAME}: fix-finding task for ${entry.findingId} is marked done but cites no test file in the task block. Per Phase 13 TDD discipline, every (fix-finding-AUDIT-<id>) task must cite the test file in Step 1.`,
          });
          continue;
        }
        const absTestPath = join(opts.repoRoot, testPath);
        if (!existsSync(absTestPath)) {
          findings.push({
            rule: RULE_ID,
            severity: 'error',
            message: `feature '${slug}' ${WORKPLAN_FILENAME}: fix-finding task for ${entry.findingId} is marked done but cited test file '${testPath}' does not exist. Write the test and re-mark, or unmark the task.`,
          });
          continue;
        }
        // Existence verified. The "test passes" half is the commit-msg
        // gate's responsibility; the doctor does not invoke vitest.
        let stat;
        try {
          stat = statSync(absTestPath);
        } catch {
          continue;
        }
        if (stat.size === 0) {
          findings.push({
            rule: RULE_ID,
            severity: 'error',
            message: `feature '${slug}' ${WORKPLAN_FILENAME}: fix-finding task for ${entry.findingId} cites test file '${testPath}' but the file is empty. Add the regression test before marking the task done.`,
          });
        }
      }
    }
  }
  return findings;
};
