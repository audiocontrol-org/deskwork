# Quickstart: Portable stack-control workflow across Claude Code and Codex

> **What the `Coverage:` lines record.** Each scenario below maps to the automated
> suite(s) that exercise its contract — this is a **coverage mapping**, not a record
> of manually-executed end-to-end runs. An agent reading this should treat a scenario
> as *covered by tests*, not as *run by hand and observed*. To record genuine manual
> execution evidence, run the scenario as written and replace its `Coverage:` line with
> the command, fixture, output, and verdict.

## Scenario A: Front door from Claude Code

1. Start in a repo with Spec Kit and stack-control available.
2. Use the portable `define` flow to create a new spec.
3. Confirm `stackctl spec-check --spec <dir>` reports `spec=yes`.
4. Use `extend` to progress the spec.
5. Confirm `stackctl spec-check --spec <dir>` reports `spec=yes plan=yes tasks=yes`.
6. Use `execute` and confirm the workflow completes without Claude-specific
   workaround steps.

Coverage:
Covered by `src/__tests__/front-door-portability.test.ts` and
`src/__tests__/portability-contract-docs.test.ts`, which assert the front-door
skills stay thin, quote the shared-core checks, and do not require an
interactive Claude Code-only session model.

## Scenario B: Front door from Codex

1. Start in the same repo through Codex.
2. Use the portable `define`, `extend`, and `execute` flow through the Codex
   adapter or direct shared-core path.
3. Confirm the same `stackctl spec-check` progression and runnable result as in
   Scenario A.

Coverage:
Covered by the shared skill-tree + Codex manifest assertions in
`src/__tests__/front-door-portability.test.ts` and
`src/__tests__/portability-contract-docs.test.ts`.

## Scenario C: Backlog workflow with backend invisibility

1. Capture a backlog item.
2. List the backlog.
3. Promote an item.
4. Confirm user-facing messages and docs use stack-control backlog terms only.
5. Swap or stub the concrete backend in tests and confirm the workflow contract
   does not change.

Coverage:
Covered by `src/__tests__/backlog-portability-runtime.test.ts`,
`tests/backlog/backend.test.ts`, and
`src/__tests__/portability-contract-docs.test.ts`.

## Scenario D: Host limitation fails loudly

1. Force one host adapter into a missing-capability condition.
2. Invoke a portable workflow step.
3. Confirm the user receives an explicit host limitation error rather than a
   silent workaround or fabricated success.

Coverage:
Covered by `src/__tests__/front-door-portability.test.ts`, which asserts the
front-door skills surface fail-loud wording rather than silent fallback paths.

## Scenario E: Lockstep portable release

1. Run the portable release flow in a dry-run or fixture-backed mode.
2. Confirm all shipped monorepo plugins/packages are included in one release
   unit and one version line.
3. Confirm Claude-facing and Codex-consumable distribution metadata point to
   the same released version.

Coverage:
Covered by `src/__tests__/release-portability.test.ts` and
`src/__tests__/release-helper-portability.test.ts`.

## Scenario F: Deprecated repo-wide workflow is no longer an active path

1. Start from repository guidance for beginning feature work.
2. Attempt to follow the old repo-wide feature workflow entry point.
3. Confirm the repository redirects to or explicitly deprecates that path.
4. Confirm `stack-control` is the clear active feature workflow.

Coverage:
Covered by `src/__tests__/portability-contract-docs.test.ts`.
