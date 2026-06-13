---
description: "Task list for public Codex distribution for adopters"
---

# Tasks: Public Codex distribution for adopters

**Input**: Design documents from `/specs/019-codex-adopter-distribution/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. This feature is distribution wiring plus product guidance;
missing metadata must not ship silently.

## Phase 1: Setup

- [X] T001 Audit current Codex-related plugin assets, docs, and release checks in `plugins/stack-control/`.
- [X] T002 Identify the concrete Codex marketplace or catalog metadata the repo must publish for adopters.

## Phase 2: Foundational

- [X] T003 [P] RED: add tests for Codex adopter distribution metadata presence and release-version alignment.
- [X] T004 [P] RED: add README/install-guidance tests that distinguish adopter flow from local development flow.
- [X] T005 Implement the Codex adopter distribution metadata and wire it into release/version checks.

## Phase 3: User Story 1 - Install stack-control in Codex as an adopter (Priority: P1)

- [X] T006 [P] [US1] RED: add tests for the documented adopter install path.
- [X] T007 [US1] Document the adopter install flow in `plugins/stack-control/README.md`.
- [X] T008 [US1] Add any required Codex marketplace or catalog metadata file(s) for public install.

## Phase 4: User Story 2 - Update Codex adopters from the same release line as Claude (Priority: P1)

- [X] T009 [P] [US2] RED: add tests for same-version release alignment across Claude and Codex distribution metadata.
- [X] T010 [US2] Extend release/version checks so Codex adopter metadata is swept and validated with the release line.
- [X] T011 [US2] Document the Codex update path alongside install guidance.

## Phase 5: User Story 3 - Distinguish adopter distribution from maintainer/dev flow (Priority: P2)

- [X] T012 [P] [US3] RED: add docs contract tests guarding against repo-local-only Codex guidance.
- [X] T013 [US3] Refactor README wording so adopter install is primary and local dev flow is clearly secondary.

## Phase 6: Polish

- [X] T014 Run quickstart scenarios in `specs/019-codex-adopter-distribution/quickstart.md` and record results.
- [X] T015 Update active Spec Kit pointers for the in-progress feature.
