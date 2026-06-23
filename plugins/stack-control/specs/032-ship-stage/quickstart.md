# Quickstart / Validation Guide: ship-stage

Runnable scenarios that prove the feature works end-to-end. Run from a stack-control installation. Each scenario maps to a Success Criterion in [spec.md](./spec.md). (Implementation details live in `tasks.md`; this is the validation guide.)

## Prerequisites

- A stack-control installation with a govern-converged item (`graduate-impl impl` gate green for the item under test).
- The `stackctl` engine built from source (`./bin/stackctl` during dev).

## SC-001 — on-rail ship records shipped (no skippable graduate)

```bash
# item is govern-converged (impl convergence record present)
stackctl workflow status <item>          # expect phase: merging, next: shipped
# run /stack-control:ship (operator confirms CI green, merges) — then:
stackctl workflow status <item>          # expect status: shipped recorded; phase: validating
grep -A2 "## <item>" ROADMAP.md          # expect `status: shipped`
```
**Expected**: after the on-rail ship, recorded `status: shipped` is present immediately — no separate operator step recorded it.

## SC-002 — compass and close gate never disagree (TASK-445 no longer reproduces)

```bash
# post-govern, pre-merge:
stackctl workflow compass <item> --intent ship   # phase merging — NOT shipped
stackctl roadmap advance <item> --to closed       # refuses (not shipped) — agrees with compass
# post-merge (status shipped, not validated):
stackctl workflow status <item>                   # phase validating
stackctl roadmap advance <item> --to closed       # refuses: needs `validated` — still agrees
```
**Expected**: at every point the compass-derived phase and the close gate agree; there is no window where the compass says "ready to close" while the close gate refuses on stale status.

## SC-003 — backstop catches an off-rail merge; reconcile clears it

```bash
# simulate an off-rail merge: the item's impl convergence record is reachable from origin/main,
# but `status:` is still in-flight (no /stack-control:ship ran).
stackctl workflow compass <other-item> --intent design   # REFUSES: names <item> as merged-but-status-in-flight + reconcile cmd
stackctl roadmap advance <item> --to closed               # also refuses forward motion
stackctl workflow advance <item> --apply                  # the RECONCILE is allowed → records status: shipped
stackctl workflow compass <other-item> --intent design   # now on-course (refusal cleared)
```
**Expected**: forward motion at any workflow waypoint refuses and names the dangling item; the reconcile transition is NOT blocked; once reconciled, forward motion resumes.

## SC-004 — session-start/session-end never refuse (advisory only)

```bash
# with a merged-but-status-in-flight item present:
stackctl session-start ; echo "exit=$?"    # exit 0; surfaces a "merged-but-status-in-flight: <item>" advisory line
stackctl session-end   ; echo "exit=$?"    # exit 0; same advisory; journal committed + pushed
```
**Expected**: both complete (exit 0) and surface the divergence as a non-blocking advisory — they never block (per `session-skills-never-block`).

## SC-005 — adopter can redefine validating; default is operator-confirm

```bash
# default (no override): shipped item needs the `validated` marker before close
stackctl roadmap advance <item> --to closed     # refuses: needs `validated`
# operator records validated (the default confirm), then:
stackctl roadmap advance <item> --to closed --apply   # succeeds → status: closed
# adopter override: edit <install-root>/.stack-control/WORKFLOW.md phase:validating exit criteria;
# re-run — the override's criteria are honored, no engine change.
```
**Expected**: the bundled default behaves as an operator-confirm before close; an adopter override changes validating's exit with no engine code change.

## SC-006 — recording shipped needs no GitHub remote

```bash
# in an installation with NO GitHub remote (git remote -v empty or non-GitHub):
# run /stack-control:ship's graduate step (workflow advance --apply)
stackctl workflow advance <item> --apply        # records status: shipped successfully (no gh-API call)
```
**Expected**: the on-rail recording succeeds without a GitHub remote (only the off-rail backstop detection reads a git ref where present).

## SC-007 — one-unit delivery, suite green

```bash
npx vitest run            # full suite green
stackctl workflow status <any-item>   # WORKFLOW.md parses cleanly (no malformed-doc fail-loud)
```
**Expected**: after the single delivery, all new phases/transitions/criteria/derive-kinds + the ship skill + the backstop + the coherence fix are present together; the suite is green and the governed `WORKFLOW.md` parses.
