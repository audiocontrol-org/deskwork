---
description: "Task list for config-domain discovery and sticky selection"
---

# Tasks: Config-domain discovery and sticky selection

**Input**: Design documents from `/specs/020-config-domain-selection/`

**Prerequisites**: plan.md, spec.md

**Tests**: REQUIRED. This is shared resolver behavior; ambiguity or stale
preference state must not regress silently.

## Phase 1: Setup

- [X] T001 Audit the current installation resolver, git-root seam, and CLI
  dispatcher for the correct insertion point.

## Phase 2: Foundational

- [X] T002 [P] RED: add resolver tests for repo-root downward discovery and
  ambiguous multi-domain failure.
- [X] T003 [P] RED: add selector/preference tests for session scope, branch
  scope, and precedence.

## Phase 3: User Story 1 - Discover a usable installation domain from the repo root (Priority: P1)

- [X] T004 [US1] Implement descendant candidate discovery bounded to the
  enclosing git repo when the upward walk finds no installation.
- [X] T005 [US1] Surface a descriptive ambiguity error listing candidates and a
  recovery hint.

## Phase 4: User Story 2 - Reuse a preferred domain for a work session or branch (Priority: P1)

- [X] T006 [US2] Implement repo-local session and branch preference storage plus
  resolver precedence.
- [X] T007 [US2] Fail loudly on stale or invalid stored preferences.

## Phase 5: User Story 3 - Inspect, set, and clear the preference explicitly (Priority: P2)

- [X] T008 [US3] Add a CLI surface to show, set, and clear domain preferences.
- [X] T009 [US3] Wire help/usage text and selector reporting for the new
  surface.

## Phase 6: Polish

- [X] T010 Run targeted tests and shell checks from the repo root and record the
  outcome in the implementation notes / final summary.
