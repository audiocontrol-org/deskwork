# Quickstart: Portable stack-control workflow across Claude Code and Codex

## Scenario A: Front door from Claude Code

1. Start in a repo with Spec Kit and stack-control available.
2. Use the portable `define` flow to create a new spec.
3. Confirm `stackctl spec-check --spec <dir>` reports `spec=yes`.
4. Use `extend` to progress the spec.
5. Confirm `stackctl spec-check --spec <dir>` reports `spec=yes plan=yes tasks=yes`.
6. Use `execute` and confirm the workflow completes without Claude-specific
   workaround steps.

## Scenario B: Front door from Codex

1. Start in the same repo through Codex.
2. Use the portable `define`, `extend`, and `execute` flow through the Codex
   adapter or direct shared-core path.
3. Confirm the same `stackctl spec-check` progression and runnable result as in
   Scenario A.

## Scenario C: Backlog workflow with backend invisibility

1. Capture a backlog item.
2. List the backlog.
3. Promote an item.
4. Confirm user-facing messages and docs use stack-control backlog terms only.
5. Swap or stub the concrete backend in tests and confirm the workflow contract
   does not change.

## Scenario D: Host limitation fails loudly

1. Force one host adapter into a missing-capability condition.
2. Invoke a portable workflow step.
3. Confirm the user receives an explicit host limitation error rather than a
   silent workaround or fabricated success.

## Scenario E: Lockstep portable release

1. Run the portable release flow in a dry-run or fixture-backed mode.
2. Confirm all shipped monorepo plugins/packages are included in one release
   unit and one version line.
3. Confirm Claude-facing and Codex-consumable distribution metadata point to
   the same released version.

## Scenario F: Deprecated repo-wide workflow is no longer an active path

1. Start from repository guidance for beginning feature work.
2. Attempt to follow the old repo-wide feature workflow entry point.
3. Confirm the repository redirects to or explicitly deprecates that path.
4. Confirm `stack-control` is the clear active feature workflow.
