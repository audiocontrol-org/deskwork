# Quickstart / Validation: Un-skippable workflow protocol

Runnable validation scenarios proving the feature works end-to-end. Each maps to a
success criterion. Run from the installation root
(`plugins/stack-control/`). These are validation guides, not implementation; see
`contracts/` + `data-model.md` for the mechanism.

## Prerequisites

- A stack-control installation with the governed `WORKFLOW.md` carrying the new
  `all-phase-checkpoints-current` graduate criterion.
- A fixture feature with a multi-phase `tasks.md` and authoritative per-phase file lists.
- The 021 per-phase checkpoint + fingerprint code present.

## Scenario A — Graduate gate requires every phase checkpoint (SC-001, SC-002)

1. Create a fixture feature with 3 `tasks.md` phases. Write current checkpoints for
   phases 1–2 only.
2. Evaluate the graduate gate (`stackctl workflow status <item>` / gate-eval).
   - **Expected**: unmet, names the missing phase-3 checkpoint.
3. Write a current phase-3 checkpoint. Re-evaluate.
   - **Expected**: met.
4. Edit a task in phase 2 (changing its content after its checkpoint). Re-evaluate.
   - **Expected**: unmet, names phase 2 (stale fingerprint).

## Scenario B — No whole-feature govern; composed signal (SC-001, FR-001a)

1. With all per-phase checkpoints current, graduate the feature.
   - **Expected**: the `record-converged impl` signal is satisfied **without** a
     whole-feature govern run; no whole-feature payload is assembled (no
     `boundary-too-large` possible at graduation).
2. Provide only a standalone whole-feature record and no per-phase checkpoints; attempt
   to graduate.
   - **Expected**: refused (the standalone record does not satisfy the per-phase gate).

## Scenario C — Execute fires per-phase govern + commit/push (SC-003, SC-006, SC-007)

1. Drive `/stack-control:execute` over the 3-phase fixture.
   - **Expected**: after each phase, a current checkpoint exists AND a commit + push
     occurred — before the next phase begins; zero operator reminders.
2. Remove phase-1's checkpoint, attempt to run phase 2 via execute.
   - **Expected**: execute refuses to start phase 2 (per-phase ordering).
3. Simulate a push failure (e.g. unreachable remote) at a boundary.
   - **Expected**: failure surfaced loud, the local commit intact, no silent continue,
     no `--no-verify`.
4. Construct a single phase whose payload exceeds the fleet envelope; govern it.
   - **Expected**: FATAL `boundary-too-large` pointing at right-sizing guidance (TASK-75);
     no auto-split, no silent downgrade.

## Scenario D — Speckit wrapper refusal/redirect + defense-in-depth (SC-004)

> **Corrected mechanism (operator decision 2026-06-16):** 025 ships the refusal as a
> portable `stackctl speckit-guard` verb + the cross-vendor `commands/speckit-guard.md`
> adapter — NOT an injection into the adopter's `.claude/skills/speckit-*` (those are the
> adopter's own Spec Kit, not plugin-controlled; and `.claude/skills/` is Claude-only). The
> **US1 per-phase graduate gate is the real teeth.** A cross-vendor point-of-invocation
> interception of a *raw* backend call is the filed follow-on
> `design:gap/speckit-bypass-point-of-invocation-refusal`.

1. `stackctl speckit-guard speckit-implement` (no front-door marker).
   - **Expected**: exit 1, refused, names `/stack-control:execute`.
2. `stackctl speckit-guard speckit-specify` / `speckit-plan` / `speckit-tasks`.
   - **Expected**: exit 1, refused, names `/stack-control:define` (or `:extend`).
3. `STACKCTL_FRONT_DOOR=1 stackctl speckit-guard speckit-implement` (reached via front door).
   - **Expected**: exit 0, NOT refused (no false positive).
4. Implement raw (evading the wrapper — no per-phase govern), then attempt to graduate.
   - **Expected**: refused — no per-phase checkpoints (defense-in-depth, FR-014; the
     load-bearing guarantee for 025).

## Scenario E — No agent-offered shortcuts (SC-005)

1. Run the skill-body audit over every stack-control `skills/*/SKILL.md`.
   - **Expected**: zero skip/defer/shortcut affordances reported.
2. Walk a heavy step (e.g. per-phase governance) in `execute`.
   - **Expected**: the step runs; no "defer this?" branch is offered.

## Honest-boundary note (FR-017)

The mechanism binds an agent following the skills. A human running the raw vendored
`speckit` scripts or raw `git` can still bypass; this is not claimed otherwise. The
per-phase graduate gate narrows the worst hole (no graduation without checkpoints).

## Enforcement-home audit (FR-018, T027)

All enforcement this feature adds lives in `templates/WORKFLOW.md` (the
`all-phase-checkpoints-current` gate criterion) + skill bodies (`skills/execute/SKILL.md`)
+ CLI verbs (`stackctl govern --phase`, the per-phase cadence functions in
`execute-check.ts`, `stackctl speckit-guard`, `stackctl no-shortcuts-audit`) + the
cross-vendor `commands/*.md` adapters — all of which travel with `claude plugin install`
and surface under Codex. **Nothing is wired into `.husky/` or `.git/hooks/`** (verified:
`grep` of the new primitives over both hook surfaces returns empty). An adopter gets the
discipline by installing the plugin and following the README, never by wiring a git hook.
