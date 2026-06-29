# Tasks: fixture — a plan with mixed tier errors (033 T001, US2)

Exercises the collect-all fail-loud paths: a no-tier task, an unknown-tier task,
and a valid task (which must NOT be emitted when any error exists — FR-006).

- [ ] T001 [P] [US1] RED test: this task declares NO tier — in src/a.ts
- [ ] T002 [US1] [tier:nonsuch] Implement against an unknown tier — in src/b.ts
- [ ] T003 [tier:fast] A valid task that is still not emitted on any error — in src/c.ts
