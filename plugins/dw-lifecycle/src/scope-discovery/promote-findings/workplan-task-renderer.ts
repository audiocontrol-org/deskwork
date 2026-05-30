/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts
 *
 * Render the canonical TDD-first task block for an OpenFinding.
 *
 * The exact rendered shape is the project rule's mechanical enforcement
 * of "broken implementation is not done — it's broken." Every fix task
 * lands with a failing-test step first (Step 1) and an acceptance
 * criterion that the test passes at the fix's tree state (the
 * `npx vitest run` line). The Step 1 implementer fills in the
 * `<test-file-path>` placeholder; the renderer does NOT invent the
 * path because the path depends on where the test will live, which the
 * implementer decides when writing the failing test.
 *
 * Pure function: input → string. No fs, no async.
 */

import type { OpenFinding } from './types.js';

export interface RenderFixTaskBlockOpts {
  /** e.g., '13.7' if this is the 7th task on Phase 13. */
  readonly taskNumber: string;
}

const HEADING_MAX_LENGTH = 80;

function clipHeading(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= HEADING_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, HEADING_MAX_LENGTH)}…`;
}

export function renderFixTaskBlock(
  finding: OpenFinding,
  opts: RenderFixTaskBlockOpts,
): string {
  const title = clipHeading(finding.heading);
  const surface = finding.surface ?? '(no surface specified)';
  const id = finding.findingId;
  const taskNumber = opts.taskNumber;
  const lines: string[] = [
    `### Task ${taskNumber} (fix-finding-${id}): ${title}`,
    '',
    `Closes ${id}. Surface: ${surface}.`,
    '',
    `- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)`,
    `- [ ] Step 2: confirm test fails against current code (verify the bug repros)`,
    `- [ ] Step 3: implement the fix`,
    `- [ ] Step 4: confirm test passes`,
    `- [ ] Step 5: commit with \`Closes ${id}\` in subject`,
    '',
    '**Acceptance Criteria:**',
    '',
    `- [ ] Failing test exists at \`(to be filled in by Step 1 implementer)\` (cited in Step 1)`,
    `- [ ] \`npx vitest run <test-file-path>\` exits 0 (passes against the fix)`,
    `- [ ] Audit-log Status flipped to \`fixed-<sha>\` via the close-shipped-audit-findings step`,
  ];
  return lines.join('\n');
}
