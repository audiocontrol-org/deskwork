# Tasks: Multi-phase fixture (spec 015 incremental-audit unit resolution)

A minimal multi-phase tasks.md fixture for `resolvePhaseUnit` /
`resolveComposingFeatureUnit` tests (T023/T024). Two phases with DISTINCT file
scopes so a per-phase unit's diff-scope can be asserted to contain only that
phase's files (SC-006). The `## Phase N: …` header grammar and the inline
`in plugins/.../file.ts` path tokens mirror a real stack-control tasks.md.

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [P] Add the alpha fixture in `plugins/stack-control/src/fixture/alpha-setup.ts`
- [ ] T002 [P] Add the alpha config in `plugins/stack-control/src/fixture/alpha-config.ts`

## Phase 2: User Story A — alpha behavior (P1)

- [ ] T003 [US-A] Implement the alpha resolver in `plugins/stack-control/src/fixture/alpha-resolver.ts`
- [ ] T004 [US-A] Test the alpha resolver in `plugins/stack-control/src/fixture/alpha-resolver.test.ts`

## Phase 3: User Story B — beta behavior (P2)

- [ ] T005 [US-B] Implement the beta resolver in `plugins/stack-control/src/fixture/beta-resolver.ts`
- [ ] T006 [US-B] Wire the beta resolver into `plugins/stack-control/src/fixture/beta-wire.ts`
