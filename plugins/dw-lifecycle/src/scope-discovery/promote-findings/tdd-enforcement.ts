/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts
 *
 * Phase 13 Task 3 — mechanical TDD enforcement for fix-finding tasks.
 *
 * Each `(fix-finding-AUDIT-<id>)`-tagged workplan task carries a TDD-
 * first shape rendered by `workplan-task-renderer.ts`: Step 1 always
 * cites the test file the fix's regression coverage lands in. This
 * library:
 *
 *   - Parses that test-file path out of a task block.
 *   - Verifies the file exists on disk.
 *   - Verifies `npx vitest run <path>` exits 0 at the current tree state.
 *
 * The doctor rule `fix-task-tdd-discipline` and the commit-msg gate
 * `check-fix-task-tdd` compose this primitive. The vitest runner is an
 * injectable seam so tests don't recurse into vitest themselves.
 *
 * Path-extraction grammar:
 *   - First backticked token in the task block that ends in `.test.ts`
 *     `.test.tsx`, `.test.js`, `.test.jsx`, `.test.mts`, or `.test.cts`.
 *   - Plain-text paths (e.g. `at plugins/.../foo.test.ts`) also recognized
 *     when no backticked path is present.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_EXT_RE = /\.test\.(?:ts|tsx|js|jsx|mts|cts)\b/;
const BACKTICKED_PATH_RE = /`([^`]+\.test\.(?:ts|tsx|js|jsx|mts|cts))`/g;
const PLAIN_PATH_RE = /\b([\w./-]+\.test\.(?:ts|tsx|js|jsx|mts|cts))\b/g;

export type TddCheckReason =
  | 'no-test-file-cited'
  | 'missing-test-file'
  | 'test-failing'
  | 'vitest-invocation-error';

export interface TddCheckResult {
  readonly valid: boolean;
  readonly reason?: TddCheckReason;
  readonly testFilePath?: string;
  /** Captured stdout/stderr from vitest when test failed (for reporting). */
  readonly vitestOutput?: string;
}

export interface VitestRunner {
  (testFilePath: string, repoRoot: string): Promise<VitestRunResult>;
}

export interface VitestRunResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface VerifyFixTaskTddArgs {
  readonly workplanTaskBlock: string;
  readonly repoRoot: string;
  readonly runVitest?: VitestRunner;
}

/**
 * Extract the test-file path the task block cites. Returns the first
 * match: backticked-path takes precedence over plain-text, and within
 * each category the first occurrence wins.
 */
export function extractTestFilePath(taskBlock: string): string | null {
  BACKTICKED_PATH_RE.lastIndex = 0;
  const backtickMatch = BACKTICKED_PATH_RE.exec(taskBlock);
  if (backtickMatch !== null && backtickMatch[1] !== undefined) {
    return backtickMatch[1];
  }
  PLAIN_PATH_RE.lastIndex = 0;
  const plainMatch = PLAIN_PATH_RE.exec(taskBlock);
  if (plainMatch !== null && plainMatch[1] !== undefined) {
    return plainMatch[1];
  }
  return null;
}

export async function verifyFixTaskTDD(
  args: VerifyFixTaskTddArgs,
): Promise<TddCheckResult> {
  const testFilePath = extractTestFilePath(args.workplanTaskBlock);
  if (testFilePath === null) {
    return { valid: false, reason: 'no-test-file-cited' };
  }
  const absPath = resolve(args.repoRoot, testFilePath);
  if (!existsSync(absPath)) {
    return {
      valid: false,
      reason: 'missing-test-file',
      testFilePath,
    };
  }
  const runner = args.runVitest;
  if (runner === undefined) {
    // No runner injected and no default available — the caller is
    // signaling "skip the run-time check; only verify presence."
    return { valid: true, testFilePath };
  }
  try {
    const result = await runner(testFilePath, args.repoRoot);
    if (result.exitCode !== 0) {
      return {
        valid: false,
        reason: 'test-failing',
        testFilePath,
        vitestOutput: result.output,
      };
    }
    return { valid: true, testFilePath };
  } catch (err) {
    return {
      valid: false,
      reason: 'vitest-invocation-error',
      testFilePath,
      vitestOutput: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Walk a workplan markdown for every `[x]` task tagged
 * `(fix-finding-AUDIT-<id>)` and return per-task blocks. A "task block"
 * here is the `### Task ...` heading line through the line BEFORE the
 * next `### ` or `## ` heading.
 */
export function findCompletedFixFindingTasks(
  workplanText: string,
): ReadonlyArray<{ readonly taskBlock: string; readonly findingId: string }> {
  const lines = workplanText.split('\n');
  const out: { taskBlock: string; findingId: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }
    const headingMatch = /^###\s+Task\s+[\d.]+:.*?\(fix-finding-(AUDIT-\d{8}-\d+)\)/i.exec(line);
    if (headingMatch === null) {
      i++;
      continue;
    }
    const findingId = headingMatch[1];
    if (findingId === undefined) {
      i++;
      continue;
    }
    // Collect this task's body until the next ### or ## heading.
    const start = i;
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (next !== undefined && (next.startsWith('### ') || next.startsWith('## '))) break;
      j++;
    }
    const taskBlock = lines.slice(start, j).join('\n');
    // Only include if the task block has a CHECKED top-level acceptance
    // box. Convention: the task block contains a `**Acceptance Criteria:**`
    // section with `- [x] ...` checkboxes; if any acceptance criterion
    // for the fix-finding task is checked, treat the task as completed.
    if (/^\s*-\s+\[x\]/m.test(taskBlock)) {
      out.push({ taskBlock, findingId });
    }
    i = j;
  }
  return out;
}
