---
name: audit
description: "Alias of /dw-lifecycle:review; runs the same three-track protocol and durable audit-log workflow"
---

# /dw-lifecycle:audit

Alias of `/dw-lifecycle:review`. Follow the exact same protocol: controller-side verification re-run first, then spec-compliance and code-quality review passes, with findings written into a durable audit log that becomes the source of truth.

## Steps

1. Determine audit scope: defaults to commits since branching from `main`; operator may override with `--since <ref>`.
2. Determine the audit-log path before reviewing.
   - For a tracked feature, use the feature-local audit log at `docs/<version>/<status>/<slug>/audit-log.md`.
   - If the file does not exist, create it.
   - If this is not a feature-scoped audit and there is no obvious existing audit log, stop and ask the operator where the durable log should live rather than inventing a hidden location.
3. Run Track 1 yourself before dispatching reviewers: independently re-run the load-bearing verification gate in your own environment.
   - For UI-touching changes, include the relevant browser/probe/Playwright or smoke verification, not just unit tests.
   - Record exact commands or probes plus concrete outcomes. Treat the implementer's reported output as a claim, not evidence.
4. Invoke `superpowers:requesting-code-review` to frame the request. Include:
   - the audit scope
   - the workplan / PRD / issue references that define expected behavior
   - architectural decisions or accepted deferrals already in force
   - the Track 1 verification evidence you just collected
   - whether this is routine or high-risk work
5. Run Track 2: spec-compliance review. Dispatch `feature-dev`'s `code-reviewer` against the scope with the spec/workplan context visible.
6. Run Track 3: code-quality review. Dispatch a separate `feature-dev` `code-reviewer` pass focused on bugs, regressions, discipline violations, missing tests, and maintainability risks.
   - For substantial or high-risk changes, dispatch Tracks 2 and 3 in parallel via `superpowers:dispatching-parallel-agents`.
7. Integrate findings with rigor under `superpowers:receiving-code-review`. Push back on weak findings; fix or explicitly defer strong ones.
8. Write or update the audit log. The audit log is the source of truth for current finding state, not commit messages or GitHub alone.
   - New audit logs should start with a short operator header:
     - findings are actionable work, not bookkeeping
     - the audit log is the source of truth
     - findings are never deleted; update entries in place
     - `fixed-<sha>` is not `verified-<date>`
     - include the canonical grep queue
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
   - what was fixed now
   - what was deferred, with explicit issue/workplan/operator disposition

Use `/dw-lifecycle:audit` when you want the workflow named explicitly as an audit. Use `/dw-lifecycle:review` when "review" fits the surrounding process language better. Behavior is otherwise identical.

## Error handling

- **feature-dev not installed.** Skill exits with: `"/dw-lifecycle:audit requires feature-dev. Install: /plugin install feature-dev@claude-plugins-official"`.
