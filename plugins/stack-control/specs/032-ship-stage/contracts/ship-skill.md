# Contract: `/stack-control:ship` skill

The single on-rail ship step. Modeled on `skills/close/SKILL.md` + `skills/execute/SKILL.md` (compass precondition + CLI-first + vendor-neutral). Enforcement lives in this skill body + the CLI verbs it calls, never a git hook.

## Frontmatter

```yaml
---
name: ship
description: "The one on-rail ship step: govern-converged precondition → open PR → operator confirms CI green → merge → non-discretionarily record status:shipped (fire graduate). No skip/defer/shortcut branch."
---
```

## Preconditions / gates (hard, in order)

1. **Compass precondition** — `stackctl workflow compass <item> --intent ship`; non-zero exit = STOP, print reason, refuse. (`ship` maps to the `merging` phase / `graduate` transition; an item not yet govern-converged returns `ahead` and refuses — you cannot ship un-governed work.)
2. **Front-door completeness** is not required for ship (ship is not a spec-authoring surface) — N/A.
3. **Govern-converged check** — the `graduate-impl impl` gate must be green (the item's whole-feature `impl` convergence record exists). Refuse loud otherwise, naming `govern` as the missing step.

## Steps (the weld)

1. **Open the PR** for the feature (operator-owned; `gh pr create` or surface the existing PR).
2. **Operator confirms CI green** (FR-019) — surface the PR/CI link; require explicit operator confirmation that CI is green. No poll. If not confirmed green, STOP (record nothing).
3. **Merge** the PR (operator-owned merge).
4. **Fire `graduate` — non-discretionarily** (FR-002/FR-003): immediately run the `merging → shipped` transition (`stackctl workflow advance <item> --apply`, which fires `roadmap-advance to=shipped; roadmap-reconcile; journal-append; commit`). There is NO skill branch that skips/defers this — steps 3 and 4 are one welded operation. The skill offers no "defer recording" option.
5. **Push** (commit/push early-and-often; the `commit` effect already committed — push the branch).

## Postcondition

`status: shipped` is recorded on the roadmap node (+ journal + commit), the derived phase is `validating` (verify before close), and the compass reports the item is past merge. Release (`/stack-control:release`) and close (`/stack-control:close`) are downstream, separate skills.

## What ship does NOT do

- It does NOT cut a release (bump/tag/publish) — that is `/stack-control:release`.
- It does NOT close the item — that is `/stack-control:close` after `validating`.
- It does NOT auto-run from `execute` — it is operator-invoked (merge timing is operator-owned).
- It offers NO skip/defer/shortcut for the graduate recording (no-offroading rule).

## Honest boundary

A deliberate raw `gh pr merge` outside this skill cannot be prevented; that path leaves a merged-but-status-in-flight item which the **backstop** (see `backstop-compass-invariant.md`) catches at the next workflow waypoint. The load-bearing guarantee is the backstop gate, not interception (FR-017).

## CLI-first

The skill quotes `stackctl` verbs (`workflow compass`, `workflow advance`) and adds no behavior the CLI lacks; `stackctl` runs the weld from a plain shell.
