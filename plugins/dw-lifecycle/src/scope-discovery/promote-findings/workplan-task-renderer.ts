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

/**
 * Per Phase 18 Task 1 (AUDIT-02 / AUDIT-32 recurrence): the fix-task
 * template historically assumed every finding is bug-with-failing-
 * test. Real findings come in two coarse shapes:
 *
 *   - `code-defect` — a bug in source code; the fix has a failing
 *     test the doctor rule can verify. Default for source-file
 *     surfaces (.ts, .tsx, .js, etc.).
 *
 *   - `non-bug` — coverage-gap / pin-only / registry-hygiene /
 *     commit-history / docs. No failing test exists to verify the
 *     fix; the disposition is a substantive statement of what was
 *     done. Default for surfaces matching audit-log.md, workplan.md,
 *     tooling-feedback.md, clones.yaml, .dw-lifecycle/*, last-hook-
 *     run.json, hook-run-log.jsonl, and other non-source artifacts.
 *
 * The doctor rule + commit-msg gate honor the marker `(non-bug)` in
 * the task heading: when present, the gate validates the disposition
 * prose (≥40 chars, no banned-phrase) instead of running vitest
 * against a placeholder test path.
 */
export type FindingShape = 'code-defect' | 'non-bug';

export interface RenderFixTaskBlockOpts {
  /** e.g., '13.7' if this is the 7th task on Phase 13. */
  readonly taskNumber: string;
  /**
   * Per AUDIT-02: shape determines which task template gets rendered.
   * Default `code-defect` (current behavior — bug-with-failing-test).
   * `non-bug` renders the alternate template with disposition prose
   * instead of test path.
   */
  readonly findingShape?: FindingShape;
}

/**
 * Infer a finding's shape from its Surface field. Falls through to
 * `code-defect` (the safest default — still TDD-able) when no
 * non-bug pattern matches.
 *
 * Non-bug surfaces:
 *   - audit-log.md / workplan.md / tooling-feedback.md (per-feature docs)
 *   - clones.yaml (clone-disposition registry)
 *   - .dw-lifecycle/* (runtime markers / config / hook-run-log)
 *   - last-hook-run.json / hook-run-log.jsonl (specific marker files)
 *   - commit SHAs (commit-history findings)
 *   - "Missing surface:" / "no surface" prose (process findings)
 */
export function inferFindingShape(finding: OpenFinding): FindingShape {
  const surface = finding.surface?.toLowerCase() ?? '';
  // Per-feature docs files
  if (/(?:^|\/|`|\s)audit-log\.md/.test(surface)) return 'non-bug';
  if (/(?:^|\/|`|\s)workplan\.md/.test(surface)) return 'non-bug';
  if (/(?:^|\/|`|\s)tooling-feedback\.md/.test(surface)) return 'non-bug';
  if (/(?:^|\/|`|\s)clones\.yaml/.test(surface)) return 'non-bug';
  if (/\.dw-lifecycle\//.test(surface)) return 'non-bug';
  if (/last-hook-run\.json/.test(surface)) return 'non-bug';
  if (/hook-run-log\.jsonl/.test(surface)) return 'non-bug';
  // Commit-history findings — "commit <sha>" or "subject" framings
  if (/\bcommit\b.*\b[0-9a-f]{7,40}\b/i.test(surface)) return 'non-bug';
  // Process findings explicitly naming "missing surface" or "no surface"
  if (/missing surface|no surface|\(the audited|process feedback|disposition/i.test(surface)) {
    return 'non-bug';
  }
  // Default: source-file or unknown → code-defect (safest, still TDD-able).
  return 'code-defect';
}

const HEADING_MAX_LENGTH = 80;
const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;

function clipHeading(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= HEADING_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, HEADING_MAX_LENGTH)}…`;
}

/**
 * Extract the canonical `AUDIT-YYYYMMDD-NN` prefix from a Finding-ID
 * field that may carry trailing cross-model annotation (e.g.
 * `AUDIT-20260530-01 (claude-01 + codex-03; cross-model)`).
 *
 * Per AUDIT-20260530-07: nested parens in the fix-finding marker made
 * the gate's TASK_HEADING_RE blind to auto-promoted fix-tasks. Keeping
 * the marker text canonical (`(fix-finding-AUDIT-NN-N)`) sidesteps the
 * paren-balancing problem entirely. The cross-model annotation is
 * preserved in the audit-log entry's Finding-ID line; it doesn't need
 * to live inside the workplan marker too.
 */
function canonicalAuditId(findingId: string): string {
  const m = CANONICAL_AUDIT_ID_RE.exec(findingId);
  return m !== null ? m[0] : findingId;
}

export function renderFixTaskBlock(
  finding: OpenFinding,
  opts: RenderFixTaskBlockOpts,
): string {
  const title = clipHeading(finding.heading);
  const surface = finding.surface ?? '(no surface specified)';
  const id = finding.findingId;
  const canonicalId = canonicalAuditId(id);
  const taskNumber = opts.taskNumber;
  const shape: FindingShape = opts.findingShape ?? 'code-defect';

  if (shape === 'non-bug') {
    // Per AUDIT-02: non-bug variant. The marker `(non-bug)` in the
    // heading signals to the doctor rule + commit-msg gate to
    // validate the disposition prose instead of running vitest
    // against a placeholder test path. The implementer fills in the
    // actual disposition; the placeholder text below documents what
    // a real disposition looks like and is itself banned-phrase-free.
    const lines: string[] = [
      `### Task ${taskNumber} (fix-finding-${canonicalId}) (non-bug): ${title}`,
      '',
      `Closes ${id}. Surface: ${surface}.`,
      '',
      `**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.`,
      '',
      `- [ ] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".`,
      `- [ ] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).`,
      `- [ ] Step 3: commit with \`Closes ${id}\` in subject.`,
      '',
      '**Acceptance Criteria:**',
      '',
      `- [ ] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).`,
      `- [ ] The named action has landed in this branch (the substantive edit or acknowledgement is present).`,
      `- [ ] Audit-log Status flipped to \`fixed-<sha>\` (or \`acknowledged-<reason>\` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.`,
    ];
    return lines.join('\n');
  }

  // code-defect (default): the historical TDD-first template.
  const lines: string[] = [
    `### Task ${taskNumber} (fix-finding-${canonicalId}): ${title}`,
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
