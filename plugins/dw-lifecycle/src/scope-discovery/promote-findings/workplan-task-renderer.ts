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
// Phase 19 (fix-finding-AUDIT-20260601-68): a finding can have a
// documentation-shaped surface AND a code-shaped fix simultaneously
// (e.g. "the rendered task in workplan.md is wrong" — the symptom
// is in workplan.md but the FIX is in `.ts` source). Inferring shape
// from surface alone would misclassify those as `non-bug` and ship
// a real code defect without test coverage. The body-source check
// looks for filename references with TypeScript/JavaScript source
// extensions in path-like contexts (preceded by `/` or backtick, or
// followed by `:line`). Backtick-wrapped extension mentions like
// "`.ts`" are NOT a path; the regex requires the path prefix.
const SOURCE_FILE_IN_BODY_RE =
  /(?:^|[\s`'"/])(?:[\w./-]*?)[\w-]+\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)(?:[:`'"\s]|$)/i;

export function inferFindingShape(finding: OpenFinding): FindingShape {
  const surface = finding.surface?.toLowerCase() ?? '';
  const body = finding.body ?? '';
  const surfaceLooksNonBug = isNonBugSurface(surface);

  // AUDIT-68 override: when the surface suggests non-bug but the
  // body names a source file (.ts/.tsx/.js/etc.), the fix lives in
  // code — return code-defect to force TDD discipline.
  if (surfaceLooksNonBug && SOURCE_FILE_IN_BODY_RE.test(body)) {
    return 'code-defect';
  }
  return surfaceLooksNonBug ? 'non-bug' : 'code-defect';
}

function isNonBugSurface(surface: string): boolean {
  // Per-feature docs files
  if (/(?:^|\/|`|\s)audit-log\.md/.test(surface)) return true;
  if (/(?:^|\/|`|\s)workplan\.md/.test(surface)) return true;
  if (/(?:^|\/|`|\s)tooling-feedback\.md/.test(surface)) return true;
  if (/(?:^|\/|`|\s)clones\.yaml/.test(surface)) return true;
  if (/\.dw-lifecycle\//.test(surface)) return true;
  if (/last-hook-run\.json/.test(surface)) return true;
  if (/hook-run-log\.jsonl/.test(surface)) return true;
  // Commit-history findings — "commit <sha>" or "subject" framings
  if (/\bcommit\b.*\b[0-9a-f]{7,40}\b/i.test(surface)) return true;
  // Process findings explicitly naming "missing surface" or "no surface"
  if (/missing surface|no surface|\(the audited|process feedback|disposition/i.test(surface)) {
    return true;
  }
  return false;
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
  // Per Phase 18 Task 3 (Option D — operator-picked 2026-06-01): HIGH
  // / BLOCKING findings get a Step 0 invariant write-up AND a second
  // regression-lock test. The doctor rule reads the `Severity:` field
  // emitted here to enforce the ≥2-tests requirement.
  const severity = (finding.severity ?? 'medium').toLowerCase();
  const isHighPlus = severity === 'high' || severity === 'blocking';
  const lines: string[] = [
    `### Task ${taskNumber} (fix-finding-${canonicalId}): ${title}`,
    '',
    `Closes ${id}. Surface: ${surface}. Severity: ${severity}.`,
    '',
  ];
  if (isHighPlus) {
    lines.push(
      `- [ ] Step 0: working-code invariant — what does the current code do correctly that this fix touches? 1-2 sentences. Per Option D discipline, HIGH+ findings get a regression-lock test pinning this invariant in addition to the bug-repro test.`,
    );
  }
  lines.push(
    `- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)`,
  );
  if (isHighPlus) {
    lines.push(
      `- [ ] Step 1b: write a regression-lock test pinning the Step 0 invariant — the test that would FAIL if the fix breaks the working-code behavior the invariant describes`,
    );
  }
  lines.push(
    `- [ ] Step 2: confirm test${isHighPlus ? '(s)' : ''} fail${isHighPlus ? '' : 's'} against current code (verify the bug repros${isHighPlus ? ' + the regression-lock test passes pre-fix' : ''})`,
    `- [ ] Step 3: implement the fix`,
    `- [ ] Step 4: confirm ${isHighPlus ? 'all tests pass (bug-repro flips green; regression-lock stays green)' : 'test passes'}`,
    `- [ ] Step 5: commit with \`Closes ${id}\` in subject`,
    '',
    '**Acceptance Criteria:**',
    '',
    `- [ ] Failing test exists at \`(to be filled in by Step 1 implementer)\` (cited in Step 1)`,
  );
  if (isHighPlus) {
    lines.push(
      `- [ ] Regression-lock test exists in the same file (Step 1b); test block count for this finding is ≥2 per Option D discipline`,
    );
  }
  lines.push(
    `- [ ] \`npx vitest run <test-file-path>\` exits 0 (passes against the fix)`,
    `- [ ] Audit-log Status flipped to \`fixed-<sha>\` via the close-shipped-audit-findings step`,
  );
  return lines.join('\n');
}
