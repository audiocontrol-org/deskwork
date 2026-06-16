# Backlog reconciliation — 022 parseable-lifecycle-workflow (T035)

Per the constitution's closure gate (`.claude/rules/agent-discipline.md` §
*Issue closure requires verification in a formally-installed release*), this file
**records dispositions and posts evidence**. It does **not** close any item — the
status transition is the operator's call after release verification. All three
items below remain `To Do` in the backlog.

## TASK-19 — Governance graduation has no on-disk record (DELIVERED by 022)

- **Disposition**: delivered as part of this feature's scope (ratified decision 3).
- **What landed**: the mode-keyed govern-convergence record mechanism
  (`src/govern/convergence-record.ts`), the `recordGovernConvergence` emit wired
  into `govern.ts` at the convergence/graduation point (keyed by the spec-dir
  basename, fail-safe on write error), and the mechanical `governing → shipped`
  gate that reads it (`src/workflow/phase-derivation.ts` +
  `src/workflow/gate-eval.ts`, `record-converged impl`).
- **Evidence**: `src/__tests__/workflow/govern-record.test.ts` — tasks-100%-but-
  no-record stays `governing`; a recorded ∧ converged impl record graduates to
  `shipped`; no agent assertion substitutes (SC-006).
- **Status**: stays `To Do` until verified in a formally-installed release.

## TASK-136 — Parseable, deterministic lifecycle workflow (THIS feature)

- **Disposition**: this is the feature. The seed (“document the workflow”) was
  sharpened to a parseable, deterministic engine that derives phase from existing
  artifacts, publishes every gate as a mechanical predicate in a governed
  `WORKFLOW.md`, and fires a fixed atomic effect manifest.
- **Evidence**: the full `src/workflow/` module + `src/__tests__/workflow/` suite
  (derivation, gates, query verbs, source-of-truth, effects, atomic advance,
  design gate, govern record, isolation, re-entry) — all green; the full plugin
  umbrella (244 files / 1617 tests) green.
- **Status**: stays `To Do` until verified in a formally-installed release.

## Governance (after_implement hook) — reproduced TASK-83 (govern payload-assembler bug)

- **What happened**: the mandatory `after_implement` deskwork-governance hook fired
  (`govern.sh` → `stackctl govern --mode implement`, diff base `88f9935f`, feature
  `parseable-lifecycle-workflow`). It **FATAL'd in the payload assembler**, NOT in
  the audit:
  `govern: FATAL — phase checkpoint governed path escapes the installation root: /stack-control:define`.
- **Root cause (already tracked)**: govern's tasks.md backtick-scope extraction reads
  the code-span `` `/stack-control:define` `` (a SKILL reference, not a path) as a
  governed filesystem path; the leading `/` makes it absolute → escapes the
  installation root → the checkpoint-fingerprint guard fails loud. This is
  **TASK-83 / AUDIT-20260614-29** ("Backtick scope extraction now accepts whole code
  spans, not just path substrings") — a govern-internal defect, reproduced here by
  the dogfood. It is NOT a defect in the 022 implementation.
- **Disposition**: no duplicate filed — TASK-83 already tracks it; this is a
  reproduction note. Per the dogfood discipline the friction is surfaced, not papered
  over. Until TASK-83 is fixed, whole-feature `govern --mode implement` cannot
  assemble a payload for a feature whose tasks.md/spec contains `/stack-control:*`
  backtick spans.
- **Substantive audit still run**: to get the implemented code cross-model-audited
  despite the broken assembler, the core engine diff (`src/workflow/` +
  `src/govern/convergence-record.ts`) was fed directly to `stackctl audit-barrage`
  (two codex lanes, both emitted findings). Run dir:
  `.stack-control/audit-runs/20260616T023449870Z-parseable-lifecycle-workflow`.

### Findings triage (cross-model agreement = HIGH confidence)

- **F1 — install-anchoring not enforced (HIGH, both lanes)** → **FIXED**. Added
  `src/workflow/anchor.ts` (`anchorWithin` fails loud on any path escaping the
  installation root) and routed effects / redesign / workflow-context pointer
  resolution through it. Tests: `governance-fixes.test.ts`.
- **F2 — redesign non-atomic + `git add -A` + ignored commit exit (HIGH, both)** →
  **FIXED**. `emitRedesign` now stages ONLY the redesign-touched paths and fails
  loud on a non-zero git exit (never reports a failed commit as success).
- **F3 — `anchorRoot` stamped but never validated (MEDIUM, both)** → **FIXED**.
  `readGovernConvergenceRecord` now rejects a record whose `anchorRoot` differs
  from the reading installation root (a copied/stale record can no longer open the
  shipped gate).
- **gate-eval target validation (MEDIUM, codex)** → **FIXED**. `section-present` /
  `tasks-complete` / `tree-clean` now fail loud on an unexpected target instead of
  silently reading the design record / spec / advance flag.
- **commit-message unbound placeholder (MEDIUM, codex)** → **FIXED**. An unbound
  `{key}` in a commit message now fails loud, consistent with `resolveArg`.
- **"advance does not enforce the exit gate" (HIGH, codex)** → **REJECTED**. This
  is the SPEC'd v1 behavior: FR-010 / FR-016 explicitly defer gate-enforcement-as-
  refusal to a later, explicit operator decision; v1 gates are *reported*, and
  `advance --apply` refuses only on the dirty-tree precondition. The finding
  contradicts the accepted spec.
- **Scoped to backlog (real, lower-severity, operator decides)**: TASK-139
  (basename(spec) convergence-key collision), TASK-140 (redesign CLI not fully
  doc-driven — hardcodes the transition rather than executing `transition:redesign`),
  TASK-141 (convergenceFingerprint embedded-`..` hardening).

## TASK-137 — `roadmap reparent` verb (PRECEDENT, not delivered here)

- **Disposition**: noted as the precedent for the *add-a-verb* rule (FR-020 / D7):
  “a missing effect means add a governed verb, never a prose effect.” The 022
  effect vocabulary is fixed and extends by adding a verb, exactly as `roadmap
  reparent` was added to the roadmap surface.
- **Not in 022 scope**: `roadmap reparent` itself is a separate roadmap-surface
  gap (`impl:gap/roadmap-reparent-verb`); this feature does not implement it.
- **Status**: unchanged.
