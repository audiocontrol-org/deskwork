---
name: review
description: "Run the three-track audit/review protocol on recent changes; update the durable audit log"
---

# /dw-lifecycle:review

Run the `audiocontrol` three-track audit/review protocol on recent changes. The controller is the gate: independently verify the load-bearing test path first, then use distinct review passes for spec compliance and code quality. Findings are written into a durable audit log that becomes the source of truth. Replaces in-house code-reviewer agents — canonical wins per the boundary contract.

## Steps

1. Determine review scope: defaults to commits since branching from `main`; operator may override with `--since <ref>`.
2. Classify the change before review:
   - High-risk changes: design-system work, capability-bound behavior changes, migrations, architectural refactors, or anything UI-touching.
   - Routine changes: narrow bug fixes or mechanical edits with constrained blast radius.
3. Run Track 1 yourself before dispatching reviewers: re-run the load-bearing verification gate in your own environment. Treat the implementer's reported output as a claim, not evidence.
   - For UI-touching changes, this includes the relevant browser/probe/Playwright or smoke verification, not just unit tests.
   - Record the exact commands or probes run and the concrete result so the review has evidence, not paraphrase.
4. Invoke `superpowers:requesting-code-review` to frame the request. Include:
   - the review scope
   - the workplan / PRD / issue references that define the expected behavior
   - any architectural decisions or explicit deferrals already accepted
   - the Track 1 verification evidence you just collected
   - whether this is a routine or high-risk change
5. Run Track 2: spec-compliance review. Dispatch `feature-dev`'s `code-reviewer` against the scope with the spec/brief/workplan context on screen. The question for this pass is: did the implementation deliver exactly what was asked?
6. Run Track 3: code-quality review. Dispatch a separate `feature-dev` `code-reviewer` pass focused on diff quality rather than brief compliance: bugs, nucleation sites, contract leaks, discipline-rule violations, regressions, missing tests, and maintainability risks.
   - For substantial or high-risk changes, dispatch Tracks 2 and 3 in parallel via `superpowers:dispatching-parallel-agents`.
   - For small routine changes, a single reviewer pass is acceptable only if the request still explicitly asks for code-quality scrutiny and the controller has already completed Track 1.
7. Apply `superpowers:receiving-code-review` discipline when integrating findings: technical rigor, no performative agreement. Push back on weak findings; fix or explicitly defer strong ones.
8. Write or update the audit log. The audit log is the source of truth for current finding state, not commit messages or GitHub alone.
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
9. Apply finding-state transitions explicitly in the audit log:
   - `open` when newly reported
   - `acknowledged-<ref>` when accepted but deferred to an issue, workplan entry, or operator-approved plan
   - `fixed-<sha>` when a commit lands the fix
   - `verified-<date>` only after the surface is actually re-exercised
   - `withdrawn-<date>` or `superseded-by-<finding-id>` instead of deleting entries
   - `informational` when no remediation is required
10. Never delete audit-log findings. Update entries in place by changing `Status:` and appending resolution / verification notes under the same stable `Finding-ID`.
11. End with the canonical queue check against the audit log:
   - unfinished work: `grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" <audit-log>`
   - new findings: `grep -nE "^Status:[[:space:]]+open" <audit-log>`
   - awaiting verification: `grep -nE "^Status:[[:space:]]+fixed-" <audit-log>`
12. Report:
   - findings grouped by severity
   - the Track 1 verification gate that was independently re-run
   - the audit-log path updated
   - what was applied
   - what was deferred, with explicit issue links or operator-approved disposition

## Error handling

- **feature-dev not installed.** Skill exits with: `"/dw-lifecycle:review requires feature-dev. Install: /plugin install feature-dev@claude-plugins-official"`. (Treats feature-dev's reviewer as required for this skill specifically; the broader plugin's "recommended peer" posture has this carve-out.)

(Author's note: revisit this carve-out — if the user prefers a soft-fallback for review, change this skill to print a warning and skip the dispatch.)
