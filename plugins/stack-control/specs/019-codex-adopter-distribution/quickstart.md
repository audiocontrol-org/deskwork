# Quickstart: Public Codex distribution for adopters

## Scenario A: Fresh Codex adopter install

1. Start in a clean Codex environment without a local deskwork checkout.
2. Follow the documented public Codex marketplace or catalog registration step.
3. Install `stack-control` using the documented adopter command.
4. Start a new Codex thread and confirm the plugin loads.

Result:
Covered by `src/__tests__/portability-contract-docs.test.ts`, which asserts the
published Codex marketplace metadata plus the documented adopter install
commands.

## Scenario B: Codex update on the same release line as Claude

1. Inspect the released version for `stack-control`.
2. Inspect Codex distribution metadata for the same release.
3. Confirm both resolve to the same version line.
4. Update the plugin in Codex using the documented update path.

Result:
Covered by `src/__tests__/release-portability.test.ts` and
`stackctl release-check`, which now validate the Codex adopter marketplace
channel alongside the existing Claude and Codex plugin manifests.

## Scenario C: Docs distinguish adopter flow from dev flow

1. Read the stack-control README install section.
2. Identify the Codex adopter install path.
3. Identify the maintainer-local development path.
4. Confirm they are clearly separated.

Result:
Covered by `src/__tests__/portability-contract-docs.test.ts`.
