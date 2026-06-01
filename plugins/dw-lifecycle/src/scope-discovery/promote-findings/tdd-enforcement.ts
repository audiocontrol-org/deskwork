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
  | 'vitest-invocation-error'
  // Per Phase 18 Task 1 (AUDIT-02 closure): non-bug-class findings
  // (docs/registry/commit-history) use a disposition-prose path
  // instead of a test path. The reasons below cover that variant.
  | 'non-bug-missing-disposition'
  | 'non-bug-placeholder-disposition';

export interface TddCheckResult {
  readonly valid: boolean;
  readonly reason?: TddCheckReason;
  readonly testFilePath?: string;
  /** Captured stdout/stderr from vitest when test failed (for reporting). */
  readonly vitestOutput?: string;
  /** Per AUDIT-02: surfaced for non-bug variants so the caller can show the disposition prose to the operator. */
  readonly dispositionPreview?: string;
}

/**
 * Per Phase 18 Task 1 (AUDIT-02): the workplan-task-renderer marks
 * non-bug fix-tasks with `(non-bug)` after the canonical fix-finding
 * tag in the heading. The doctor rule + commit-msg gate honor this
 * marker by validating disposition prose instead of running vitest
 * against a placeholder test path.
 */
const NON_BUG_MARKER_RE = /\(fix-finding-AUDIT-\d{8}-\d+\)\s*\(non-bug\)/i;
const MIN_DISPOSITION_PROSE_CHARS = 40;
const DISPOSITION_PLACEHOLDER_RE =
  /\b(?:to be filled in|TBD|placeholder|<.+?>|\(.+?\))\b|^\s*$/i;

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

/**
 * Per Phase 18 Task 1 (AUDIT-02 closure): detect the `(non-bug)`
 * marker in a task block heading. When present, the doctor rule +
 * commit-msg gate skip the test-file checks and validate the Step 1
 * disposition prose instead.
 */
export function isNonBugTaskBlock(taskBlock: string): boolean {
  return NON_BUG_MARKER_RE.test(taskBlock);
}

/**
 * Per Phase 18 Task 1: extract the disposition prose from a non-bug
 * task block's Step 1 line. Returns the prose minus the leading
 * "Step 1: " stem; or null when no Step 1 exists.
 */
export function extractDispositionProse(taskBlock: string): string | null {
  const m = /^- \[[ x]\] Step 1:\s*(.+?)$/m.exec(taskBlock);
  if (m === null) return null;
  return m[1]?.trim() ?? null;
}

/**
 * Per Phase 18 Task 1: validate a non-bug task's Step 1 disposition
 * prose. Requirements:
 *   - present (non-null)
 *   - ≥40 chars of substantive content
 *   - no placeholder phrases (`to be filled in`, `TBD`, etc.)
 *   - no naked `<placeholder>` or `(parenthetical-only)` content
 */
export function validateNonBugDisposition(taskBlock: string): TddCheckResult {
  const prose = extractDispositionProse(taskBlock);
  if (prose === null || prose.length === 0) {
    return { valid: false, reason: 'non-bug-missing-disposition' };
  }
  if (prose.length < MIN_DISPOSITION_PROSE_CHARS) {
    return {
      valid: false,
      reason: 'non-bug-placeholder-disposition',
      dispositionPreview: prose,
    };
  }
  if (DISPOSITION_PLACEHOLDER_RE.test(prose)) {
    return {
      valid: false,
      reason: 'non-bug-placeholder-disposition',
      dispositionPreview: prose,
    };
  }
  return { valid: true, dispositionPreview: prose };
}

export async function verifyFixTaskTDD(
  args: VerifyFixTaskTddArgs,
): Promise<TddCheckResult> {
  // Per Phase 18 Task 1: non-bug-class task blocks bypass the test
  // checks and validate disposition prose instead.
  if (isNonBugTaskBlock(args.workplanTaskBlock)) {
    return validateNonBugDisposition(args.workplanTaskBlock);
  }
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
    // Permissive heading-match per AUDIT-20260530-07: accept the
    // renderer-output shape `### Task N.M (fix-finding-AUDIT-...): title`
    // AND the legacy synthetic-fixture shape `### Task N.M: Fix ...
    // (fix-finding-AUDIT-...)`. The `.*?fix-finding-(AUDIT-\d{8}-\d+)`
    // captures the canonical AUDIT-ID anywhere in the heading line.
    const headingMatch = /^###\s+Task\s+[\d.]+.*?fix-finding-(AUDIT-\d{8}-\d+)/i.exec(line);
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

/**
 * Walk a workplan markdown for unchecked tasks (any `### Task ...`
 * heading whose body contains at least one `- [ ]` checkbox) in
 * workplan order. Returns each task's block + position (0-indexed),
 * plus the AUDIT-id when the task is tagged `(fix-finding-AUDIT-<id>)`.
 *
 * Phase 15 Task 1 — `findUncheckedTasksInOrder` is the workplan-aware
 * gate's queue inspector. The gate checks the first N entries (where
 * N = open-findings count) to decide whether the open findings are
 * scoped as the next N tasks.
 *
 * `sliceLimit` (optional) caps how many unchecked tasks the helper
 * returns. The gate passes `N` (open-findings count) so the walker
 * stops scanning once enough context is collected.
 *
 * Task-block boundary semantics mirror `findCompletedFixFindingTasks`
 * — heading line through the line BEFORE the next `### ` / `## `
 * heading. "Unchecked" = the block contains at least one `- [ ]` line.
 * A task with mixed state (some `[x]` + some `[ ]`) counts as unchecked
 * (in-progress is not complete).
 */
export interface UncheckedTask {
  /** Full markdown block including the heading line. */
  readonly taskBlock: string;
  /** 0-indexed position in workplan order among ALL unchecked tasks. */
  readonly position: number;
  /** Heading text without the `### ` prefix. */
  readonly heading: string;
  /** AUDIT-id when the task is tagged `(fix-finding-AUDIT-<id>)`; null otherwise. */
  readonly findingId: string | null;
}

// Permissive matchers that accept the canonical renderer-output shape
// (per AUDIT-20260530-07): `### Task N.M (fix-finding-AUDIT-...): title`
// where the parenthetical sits BETWEEN the task number and the colon.
// The inner content may contain nested parens for cross-model findings
// like `(fix-finding-AUDIT-20260530-01 (claude-01 + codex-03; cross-model))`.
// `\bfix-finding-(AUDIT-\d{8}-\d+)` skips paren-balancing entirely by
// anchoring on the canonical-ID prefix; the closing paren of the marker
// doesn't have to follow immediately.
const FIX_FINDING_TAG_RE = /\bfix-finding-(AUDIT-\d{8}-\d+)/i;
// `.*?:` lazily walks any characters between the task number and the
// FIRST `:` on the line — so the optional parenthetical is absorbed
// without paren-balancing.
const TASK_HEADING_RE = /^###\s+Task\s+[\d.]+.*?:/i;

export function findUncheckedTasksInOrder(
  workplanText: string,
  sliceLimit?: number,
): ReadonlyArray<UncheckedTask> {
  const lines = workplanText.split('\n');
  const out: UncheckedTask[] = [];
  let position = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }
    if (!TASK_HEADING_RE.test(line)) {
      i++;
      continue;
    }
    // Collect the task body.
    const start = i;
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (next !== undefined && (next.startsWith('### ') || next.startsWith('## '))) break;
      j++;
    }
    const taskBlock = lines.slice(start, j).join('\n');
    if (/^\s*-\s+\[ \]/m.test(taskBlock)) {
      const fixMatch = FIX_FINDING_TAG_RE.exec(line);
      const findingId = fixMatch !== null && fixMatch[1] !== undefined ? fixMatch[1] : null;
      const heading = line.replace(/^###\s+/, '');
      out.push({ taskBlock, position, heading, findingId });
      position++;
      if (sliceLimit !== undefined && out.length >= sliceLimit) break;
    }
    i = j;
  }
  return out;
}
