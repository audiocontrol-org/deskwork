/**
 * plugins/stack-control/src/scope-discovery/refactor-preconditions-prompt.ts
 *
 * The refactor-context prelude appended to sub-agent dispatched prompts
 * when the dispatched task involves a refactor.
 *
 * Detection (in dispatch-wrapper.ts `wrap()`): scan the task prompt for
 * markers indicating a refactor context — `Closes clones.yaml`, the word
 * `refactor` in a heading or near a clone-group reference, an explicit
 * `[refactor]` tag, etc. When detected, the wrapper appends the constant
 * exported here to the standard GRAMMAR_INSTRUCTION.
 *
 * The prelude is intentionally short — it is a pointer at the canonical
 * fragment plus the per-branch verification action list.
 *
 * Project override: when
 * `.stack-control/scope-discovery/refactor-markers.yaml` exists, its
 * `markers:` list (regex source strings) REPLACES the built-in marker
 * set (no merge — the project owns the marker list).
 */

// ---------------------------------------------------------------------------
// Built-in refactor-marker regex set
// ---------------------------------------------------------------------------

/**
 * Markers in a task prompt that indicate a refactor-context dispatch.
 * Detected case-insensitively; ANY match triggers the prelude addition.
 * The list is intentionally narrow — false positives are cheap (extra
 * prelude on a non-refactor dispatch is harmless) but false negatives are
 * the failure mode this exists to prevent (refactor dispatch without the
 * Step 0 obligation).
 */
export const REFACTOR_CONTEXT_MARKERS: ReadonlyArray<RegExp> = [
  /\brefactor\b/i,
  /\bextract(?:ion|ing)?\b/i,
  /\bclones?\.yaml\b/i,
  /\bcanonical_side\b/i,
  /\btests_proof\b/i,
];

/** Default marker matcher (uses the built-in set). */
export function isRefactorContextPrompt(taskPrompt: string): boolean {
  for (const re of REFACTOR_CONTEXT_MARKERS) {
    if (re.test(taskPrompt)) return true;
  }
  return false;
}

/** Override-aware marker matcher. Caller supplies the regex list. */
export function isRefactorContextPromptWith(
  taskPrompt: string,
  markers: ReadonlyArray<RegExp>,
): boolean {
  for (const re of markers) {
    if (re.test(taskPrompt)) return true;
  }
  return false;
}

/**
 * The four canonical_side branch verification actions, named verbatim so
 * the smoke-test can assert each appears in REFACTOR_PRECONDITIONS_CHECKLIST.
 */
export const CANONICAL_SIDE_BRANCH_NAMES: ReadonlyArray<string> = [
  'canonical_side: <file-path>',
  'canonical_side: "all"',
  'canonical_side: "new"',
  'tests_proof.sha',
];

/**
 * The prelude appended to the dispatched prompt when the task is a
 * refactor-context dispatch. The verification language mirrors the
 * refactor-preconditions checklist; when the canonical fragment text
 * changes, sync here.
 */
export const REFACTOR_PRECONDITIONS_CHECKLIST = `

---

REFACTOR-CONTEXT PRECONDITIONS (Step 0a + 0b verification)

Your dispatched task is a refactor that closes a clone-group entry in
.stack-control/scope-discovery/clones.yaml. Before proposing or accepting any
extraction, run the verification actions below against the implementation
diff (not just the YAML entry).

The disposition's canonical_side field selects which verification to run.
Run the matching verification action; cite the result in your return.

  - canonical_side: <file-path> — verify the EXTRACTED CODE'S SHAPE MATCHES
    the named file's PRE-refactor shape (regime-erasure check). Diff the
    extraction against that file's pre-refactor content from git history.
    Reject when the extraction combines shapes from multiple sides or
    invents structure not present in the named file.

  - canonical_side: "all" — verify the EXTRACTED CODE IS A FAITHFUL LIFT
    of the common shape AND no consumer site changes observable behavior
    (lifted-but-mutated check). Diff each consumer call-site against its
    pre-refactor body; every consumer reads as a strict substitution.
    Reject when any consumer's behavior shifts under the lift.

  - canonical_side: "new" — verify the EXTRACTED PRIMITIVE MATCHES the
    declared new_shape_summary (shape-invented-in-flight check). Read
    new_shape_summary first, then the extracted primitive's API and
    structure. Reject when the actual extraction names a different shape
    than was declared at disposition time.

  - Undetermined — there should be no disposition: refactor entry. The
    correct disposition is keep-with-reason pending regime clarification.
    Reject the disposition itself, not just the implementation.

Test-precondition verification (independent of which canonical_side branch
the entry uses):

  - NAMED TESTS EXIST. For each entry in tests: [...], verify the test
    file or command resolves to a real artifact (path on disk; runnable
    command in the project test environment). Reject paraphrases,
    non-existent paths, or unrunnable commands.

  - tests_proof.sha GENUINELY SHOWS TEST FAILURE ON BROKEN CODE. Resolve
    the SHA via git rev-parse; inspect the commit's diff. The diff must
    contain a deliberate canonical-side mutation that breaks the
    regression class — not a doc-only change, not a test-only no-op, not
    a stub commit. Reject dummy/falsified proofs.

Refusal rule: if you are asked to implement a refactor whose clone-group
entry is missing canonical_side / canonical_reason / tests / tests_proof,
REFUSE and surface the missing fields by YAML key name. Do not paper
over partial declarations — partial declarations are the failure mode
this gate exists to prevent.

`;
