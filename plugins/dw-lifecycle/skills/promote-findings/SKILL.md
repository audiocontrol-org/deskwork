---
name: promote-findings
description: "Walk audit-log.md for Status: open entries; default disposition is scope-into-workplan with TDD-first task shape; agent cannot pick deferral; substantive-reason validator gates the acknowledged path."
---

# /dw-lifecycle:promote-findings

Walk a feature's `audit-log.md` for `Status: open` entries; surface them in a propose-then-apply cycle (same shape as hygiene's `promote-deferrals` + `triage-issues`); apply workplan task-block inserts and audit-log status flips on operator confirmation. The default disposition is **scope-into-workplan with a TDD-first task block**; the agent CAN ONLY pick that one. Deferral (`acknowledged-<ref>`) is operator-only and gated by a substantive-reason validator (≥40 chars; no gaming phrases). Informational (`informational`) is operator-only and requires a rationale.

The skill is the mechanical bridge from audit-log to workplan that Phase 13 ships. Phase 12's audit-barrage produces the findings; this skill forces them THROUGH the workplan into completion — no `file-and-forget`, no `defer-with-vague-reason`. Per the operator framing the skill mechanizes: *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN, otherwise it won't get picked up by the implementation loop. Unless there's truly a good reason NOT to fix a problem, it should be relentlessly scoped into the workplan, not relentlessly deferred — ESPECIALLY problems with the implementation underway. A broken implementation is not done — it's broken."*

## When to run

- **After every `/dw-lifecycle:audit-barrage` triage cycle.** The barrage's findings land in `audit-log.md` with `Status: open`; this skill walks them into the workplan.
- **Before any `/dw-lifecycle:implement` task pickup where the feature has open findings.** Once Phase 13 Task 2 ships (the implement-loop gate), this skill becomes the cure when the gate refuses to advance.
- **On operator demand.** Whenever the operator wants to triage the open-findings list as a batch.

## Invocation

Two-step propose-then-apply. The propose step writes a JSON proposal file with one item per open finding (each item's `disposition` and `fields` set to `null`); the operator fills in dispositions; the apply step validates the filled-in proposal, runs the workplan inserts and audit-log status flips atomically.

### Step 1: propose

```
dw-lifecycle promote-findings --feature <slug>
```

The skill walks `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md` for `Status: open` entries, writes the proposal to `.dw-lifecycle/scope-discovery/promote-findings/proposals/<timestamp>-<slug>.json` (override with `--output <path>`), and emits a markdown table of the findings to stdout. The proposal file's `items` list is the operator-editable surface.

Exit codes:
- `0` — propose succeeded (proposal written; or zero open findings, message emitted, no file written).
- `2` — usage error (missing `--feature`, unknown bucket value, etc.).

Flag set:
- `--feature <slug>` (REQUIRED) — selects the feature whose audit-log to walk.
- `--repo-root <path>` (default cwd) — explicit project root.
- `--bucket <name>` (default `open`) — status bucket to scan. v1 only supports `open`; other values are rejected with exit 2.
- `--limit <N>` (default 10) — caps the proposal batch size.
- `--output <path>` — override the proposal output path.

### Step 2: operator fills in dispositions

Open the proposal JSON file. Each item carries the captured `OpenFinding` shape + null disposition/fields/result fields. Fill them in per the disposition contract below.

### Step 3: apply

```
dw-lifecycle promote-findings --feature <slug> --apply <proposal-path>
```

Validates every item (non-null disposition + non-null fields + substantive-reason validator pass on every `acknowledged` reason), then:
- For each `promote-to-workplan` item: renders the TDD-first task block + inserts at the operator-specified anchor in `workplan.md`.
- For each `acknowledged` item: flips the audit-log entry's `Status:` to `acknowledged-<ref>` (where `<ref>` is the operator's `fields.ref` or the feature slug as a fallback).
- For each `informational` item: flips the audit-log entry's `Status:` to `informational`.

Workplan inserts run as a single atomic call; audit-log flips run as a single atomic call. If validation fails, NO mutation happens (exit 1 with the rejection message). If validation passes but the workplan side throws (e.g., the workplan drifted between propose and apply), the error message names what was attempted.

Exit codes:
- `0` — apply succeeded.
- `1` — apply rejected (validation failure on substantive reason, missing disposition, workplan drift).
- `2` — usage error (missing flag, unreadable proposal file, malformed JSON).

Additional apply-mode flags:
- `--task-number <N.M>` (default `13.1`) — starting task-number for the renderer. Each subsequent `promote-to-workplan` item increments the minor segment (`13.1`, `13.2`, `13.3`, ...).

## Disposition contract

| Disposition | Who picks | Required fields | What happens at apply |
|---|---|---|---|
| `promote-to-workplan` | **Default; agent picks this.** Operator confirms placement. | `phaseHeading` (verbatim `## Phase ...` heading from the workplan); `insertAfterLine` (1-based line). | Renders the TDD-first task block + inserts after the chosen line. Audit-log Status stays `open` until the fix lands + the close-shipped step flips it to `fixed-<sha>`. |
| `acknowledged` | **Operator-only.** Substantive reason required. | `reason` (≥40 chars; no banned phrases); optional `ref` (becomes the Status suffix). | Audit-log Status flipped to `acknowledged-<ref>` (or `acknowledged-<feature-slug>` if ref omitted). Entry body preserved verbatim. |
| `informational` | **Operator-only.** Rationale required. | `rationale` (free-form). | Audit-log Status flipped to `informational`. Entry body preserved verbatim. |

### Substantive-reason validator (acknowledged path)

The `reason` field on every `acknowledged` item passes through `validateAcknowledgedReason`. Two gates:

1. **≥40 characters after trim.**
2. **No gaming phrases.** The banned list duplicates the hygiene canon (`for now`, `just for now`, `will fix later`, `next pass`, `TBD`, `eventually`, `tomorrow`, `next sprint`/`cycle`/`milestone`, `deferred`, `todo`, `fixme`, `later` standalone, `follow up`/`follow-up`, `HACK`, `XXX`, `temporary`, `stub`, `placeholder`, `pending`, `until F<N>`, `until v<N>`) AND adds Phase 13 PRD-required entries (`non-trivial`, `future work`, `deferred to v<N>`, `not in scope`, `come back to`).

A failing reason rejects the entire batch (exit 1). The operator either rewrites the reason or re-dispositions to `promote-to-workplan`.

## TDD-first task block shape

`promote-to-workplan` renders this canonical shape for each finding:

```
### Task N.M (fix-finding-AUDIT-<YYYYMMDD>-<NN>): <one-line title>

Closes AUDIT-<YYYYMMDD>-<NN>. Surface: <Surface>.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-<YYYYMMDD>-<NN>` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
```

The `<test-file-path>` placeholder is filled in by the Step 1 implementer (the person writing the failing test decides where it lives; the renderer doesn't invent it).

## Commit-trailer convention (AUDIT-20260602-01)

Three verbs distinguish the disposition's intent for `apply-audit-flips`:

| Trailer | Intent | `apply-audit-flips` behavior |
|---|---|---|
| `Closes AUDIT-<id>` | The commit fixes the bug; a failing test is now passing OR a code change verifiable by test landed. | Proposes `open → fixed-<sha>`. |
| `Acknowledges AUDIT-<id>` | Doc-only acknowledgement: the disposition is a substantive note in the workplan / audit-log / journal, not a code fix. | Ignored — no flip proposal. |
| `Defers AUDIT-<id>` | Deferral to a follow-up issue with substantive rationale (NOT "for now"; that's banned). | Ignored — no flip proposal. |

**Why the distinction matters.** `apply-audit-flips` parses `Closes` trailers and proposes `fixed-<sha>` flips against the cited audit-log entries. If the entry is currently `acknowledged-…`, the proposal is filtered out (current ≠ `open`). But if the entry is later re-opened (e.g. the original disposition is overturned by a follow-up audit), the historical `Closes` trailer becomes a false `fixed-<sha>` candidate pointing at a commit that did not implement the fix. Using `Acknowledges` / `Defers` for non-fix dispositions avoids arming the auto-flipper with false candidates.

**For non-bug template tasks**: the default Step 3 trailer is `Acknowledges`. The operator changes it to `Closes` if the disposition turned out to be a real code change (Task 5.116's `inferFindingShape` allowlist extension is an example), or to `Defers` if the disposition is a deferral.

**For code-defect template tasks**: the default Step 3 trailer is `Closes` — the task is a TDD-shaped fix and the commit is the fix landing.

Regression-locked at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-flip-from-commit.test.ts` (per the AUDIT-20260602-01 regression-lock tests added with the convention).

## Cross-references

- **Discipline rule** — [`.claude/rules/agent-discipline.md`](../../../../.claude/rules/agent-discipline.md) § "Just for now is bullshit". The mechanical enforcement of *"agents relentlessly rationalize deferral as scope discipline when it's scope erosion."*
- **Audit-log preservation** — [`docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`](../../../../docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md). The audit-log invariants this skill respects: never delete findings; update entries in place under the same `Finding-ID`; `fixed-<sha>` means a fix landed; `verified-<date>` requires re-exercising the surface.
- **Phase 13 workplan** — [`docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md`](../../../../docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md) § Phase 13 Task 1.
- **Sibling skill** — [`/dw-lifecycle:promote-deferrals`](../promote-deferrals/SKILL.md). The hygiene-side analog for workplan-TBD markers; same propose-then-apply protocol, different artifact and banned-phrase set.
- **Source of findings** — [`/dw-lifecycle:audit-barrage`](../audit-barrage/SKILL.md). The multi-model audit producer whose output this skill consumes.

## Shortcut

The opt-in `install-shortcuts` skill installs `/dwpf` (Scheme A), `/dw-pf` (Scheme B), or `/dw-promote-findings` (Scheme C) as a user-level shim that forwards to `/dw-lifecycle:promote-findings`. See [`/dw-lifecycle:install-shortcuts`](../install-shortcuts/SKILL.md) for the install flow.
