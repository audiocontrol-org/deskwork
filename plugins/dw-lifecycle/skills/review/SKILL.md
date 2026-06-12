---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:review

Run the `audiocontrol` three-track audit/review protocol on recent changes. The controller is the gate: independently verify the load-bearing test path first, then use distinct review passes for spec compliance and code quality. Findings are written into a durable audit log that becomes the source of truth. Replaces in-house code-reviewer agents — canonical wins per the boundary contract.

## Steps

1. Determine review scope: defaults to commits since branching from `main`; operator may override with `--since <ref>`.
2. Classify the change before review:
   - High-risk changes: design-system work, capability-bound behavior changes, migrations, architectural refactors, or anything UI-touching.
   - Routine changes: narrow bug fixes or mechanical edits with constrained blast radius.
3. Auto-invoke the full PR-readiness gate (default behavior) unless `--no-clone-check` was passed. Per the Phase 24 no-git-hook-enforcement ADR (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`), this skill is the PRIMARY enforcement surface for PR-readiness — the principle that retired the `.husky/` hook chain relocates that discipline here.

   **Step 3a — Step 0 refactor-preconditions check.** When the change touches a refactor (any commit in scope mentions `refactor`/`extraction`/`clones.yaml`/`canonical_side`/`tests_proof`):

   ```bash
   dw-lifecycle check-refactor-preconditions --feature <slug> --gate-mode
   ```

   Surface any failures in the final review report; reviewers in Tracks 2 + 3 should see precondition failures as context.

   **Step 3b — Structural chain (the full PR-readiness gate).** Run sequentially:

   ```bash
   dw-lifecycle check-clones --gate-mode
   dw-lifecycle check-anti-patterns --feature <slug> --gate-mode
   dw-lifecycle check-adopters --feature <slug> --gate-mode
   dw-lifecycle check-module-symmetry --feature <slug>
   ```

   Any non-zero exit surfaces in the final review report; treat each as a PR-blocker until explicitly dispositioned (the operator may accept a finding with a documented reason; the auto-flip-friendly path is to file a fix-task via `promote-findings` or scope the finding directly into the workplan).

   **Step 3c — Fleet-symmetry snapshot.** `check-module-symmetry` from Step 3b doubles as the fleet snapshot (cross-module canonical-primitive adoption matrix). When the change touches a known canonical-primitive surface, the symmetry-delta count goes into the report verbatim.

   NEW clone groups, anti-pattern hits, adopter holdouts, and symmetry deltas are routed to the audit log the same way reviewer findings are (see Step 9); each becomes its own `Finding-ID` so future review passes don't re-report it.

   If `.dw-lifecycle/scope-discovery/` is not present in the project, all four invocations silently skip (scope-discovery is opt-in per project). The reviewer tracks still run; the report omits the structural-chain summary.
4. Run Track 1 yourself before dispatching reviewers: re-run the load-bearing verification gate in your own environment. Treat the implementer's reported output as a claim, not evidence.
   - For UI-touching changes, this includes the relevant browser/probe/Playwright or smoke verification, not just unit tests.
   - Record the exact commands or probes run and the concrete result so the review has evidence, not paraphrase.
5. Invoke `superpowers:requesting-code-review` to frame the request. Include:
   - the review scope
   - the workplan / PRD / issue references that define the expected behavior
   - any architectural decisions or explicit deferrals already accepted
   - the Track 1 verification evidence you just collected
   - any NEW clone groups Step 3 surfaced (so the reviewers know which dispositions still need operator decisions)
   - whether this is a routine or high-risk change
6. Run Track 2: spec-compliance review. Dispatch `feature-dev`'s `code-reviewer` against the scope with the spec/brief/workplan context on screen. The question for this pass is: did the implementation deliver exactly what was asked?
7. Run Track 3: code-quality review. Dispatch a separate `feature-dev` `code-reviewer` pass focused on diff quality rather than brief compliance: bugs, nucleation sites, contract leaks, discipline-rule violations, regressions, missing tests, and maintainability risks.
   - For substantial or high-risk changes, dispatch Tracks 2 and 3 in parallel via `superpowers:dispatching-parallel-agents`.
   - For small routine changes, a single reviewer pass is acceptable only if the request still explicitly asks for code-quality scrutiny and the controller has already completed Track 1.
8. Apply `superpowers:receiving-code-review` discipline when integrating findings: technical rigor, no performative agreement. Push back on weak findings; fix or explicitly defer strong ones.
9. Write or update the audit log. The audit log is the source of truth for current finding state, not commit messages or GitHub alone.
   - For a tracked feature, use the feature-local audit log at `docs/<version>/<status>/<slug>/audit-log.md`.
   - If the file does not exist, create it.
   - New audit logs should start with a short operator header:
     - findings are actionable work, not bookkeeping
     - the audit log is the source of truth
     - findings are never deleted; update entries in place
     - `fixed-<sha>` is not `verified-<date>`
     - include the canonical grep queue
   - If this is not a feature-scoped audit/review and there is no obvious existing audit log, stop and ask the operator where the durable log should live rather than inventing a hidden location.
   - New finding entry shape:
     - `Finding-ID: <stable-id>`
     - `Status:     open`
     - `Severity:   blocking | high | medium | low | informational`
     - `Surface:    <route, module, file, or "n/a">`
   - Below the fields, record the observed problem, evidence, repro if needed, expected vs actual, and optional fix guidance.
   - `Finding-ID` must be stable forever. Use a greppable shape like `AUDIT-YYYYMMDD-NN`.
10. Apply finding-state transitions explicitly in the audit log:
    - `open` when newly reported
    - `acknowledged-<ref>` when accepted but deferred to an issue, workplan entry, or operator-approved plan
    - `fixed-<sha>` when a commit lands the fix
    - `verified-<date>` only after the surface is actually re-exercised
    - `withdrawn-<date>` or `superseded-by-<finding-id>` instead of deleting entries
    - `informational` when no remediation is required
11. Never delete audit-log findings. Update entries in place by changing `Status:` and appending resolution / verification notes under the same stable `Finding-ID`.
12. End with the canonical queue check against the audit log:
    - unfinished work: `grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" <audit-log>`
    - new findings: `grep -nE "^Status:[[:space:]]+open" <audit-log>`
    - awaiting verification: `grep -nE "^Status:[[:space:]]+fixed-" <audit-log>`
13. Report:
    - findings grouped by severity (reviewer findings + Step 3 clone-detector findings together)
    - the Track 1 verification gate that was independently re-run
    - the clone-detector summary (clone groups detected vs. NEW vs. previously-disposed)
    - the audit-log path updated
    - what was applied
    - what was deferred, with explicit issue links or operator-approved disposition

## Flags

| Flag | Purpose |
|---|---|
| `--since <ref>` | Override the default review scope (commits since branching from `main`). |
| `--no-clone-check` | Skip the Step 3 auto-invocation of `check-clones`. Use when the operator has already run the detector explicitly, or when the change is too small to warrant a full clone-detector pass. |

## When to use `--no-clone-check`

- The operator has already run `/dw-lifecycle:check-clones` against the same scope and acted on the findings.
- The change is purely additive (new file, new test, new doc) with no risk of clone-introduction against existing code.
- The clone detector has already produced a NEW clone-groups report earlier in the same session and re-running it would only duplicate findings.

Default = run the detector. Skipping is the exception. The flag is named `--no-clone-check` for back-compat with pre-Phase-24 callers; under the new architecture it suppresses the full Step 3 chain (Step 0 refactor-preconditions + structural chain + fleet symmetry), not just the clone detector. Use sparingly — the entire point of `/dw-lifecycle:review` post-Phase-24 is that this skill IS the PR-readiness enforcement surface.

## Primary enforcement surface (Phase 24)

`/dw-lifecycle:review` is the primary enforcement surface for PR-readiness. Per `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` (ADR) + `.claude/rules/enforcement-lives-in-skills.md` (rule), the discipline that lived in `.husky/pre-push` is now invoked from this skill body. The Phase 20 Task 2 "retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` in favor of audit-barrage" decision REVERSES under Phase 24 — `audit-barrage` remains the cross-model audit surface invoked from `/dw-lifecycle:implement` end-of-task; `/dw-lifecycle:review` is the operator-driven PR-readiness pass that composes the structural chain + Step 0 + the three-track reviewer protocol on top of the audit-log discipline.

## Error handling

- **feature-dev not installed.** Skill exits with: `"/dw-lifecycle:review requires feature-dev. Install: /plugin install feature-dev@claude-plugins-official"`. (Treats feature-dev's reviewer as required for this skill specifically; the broader plugin's "recommended peer" posture has this carve-out.)
- **scope-discovery not installed.** Step 3 silently skips. The reviewers still run; the report omits the clone-detector summary line.
- **`check-clones` fails.** The error is surfaced in the report; the reviewer tracks still proceed. The operator can re-run `check-clones` manually after addressing the cause; any NEW clone groups discovered later get filed as fresh audit-log entries.

(Author's note: revisit the feature-dev carve-out — if the user prefers a soft-fallback for review, change this skill to print a warning and skip the dispatch.)
