# Contract: the merged-but-status-in-flight backstop (compass invariant)

A cross-item compass invariant that refuses forward lifecycle motion while any item is merged-but-status-in-flight (the off-rail residual). Lives in `compass.ts` + `compass-resolve.ts` + `merge-signal.ts`; never a git hook.

## The signal (`src/workflow/merge-signal.ts`)

```
mergedButInFlight(item, installationRoot, roadmap) -> { itemId, recordCommit } | null
  record = .stack-control/govern/convergence/impl__<safe(item)>.json
  if record absent -> null
  base = resolveBase(cwd)            # upstream → origin/HEAD → origin/main → origin/master
  if base undeterminable -> null     # cannot assert merged → no refusal (fail-open for detection, advisory only)
  reachable = git merge-base --is-ancestor <commit-that-added-record> base
  return reachable && status(item) ∉ {shipped, closed} ? { itemId, recordCommit } : null
```

- **Portable**: git-only, no gh-API. **Independent** of `/stack-control:ship` having run (keys on the record commit's reachability). **Per-item** (the record is item-keyed).
- **Base undeterminable** (detached HEAD / no remote) → the signal returns null (cannot prove merged) → no refusal. The on-rail weld never depends on this.

## The verdict (`compass.ts` `computeVerdict`)

- New input `danglingMergedItem?: string` (the first merged-but-status-in-flight item found over the roadmap by `compass-resolve.ts`).
- **Rule**: if `danglingMergedItem` is set AND the current intent is NOT the reconcile of that item → return a refusing verdict (`off-rail`-class, non-zero exit) whose `reason` names the dangling item + the reconcile command (`stackctl workflow advance <item> --apply`, or `roadmap advance <item> --to shipped`).
- **Exemption**: the reconcile transition (advancing the dangling item itself to shipped) MUST be allowed — otherwise the divergence is unfixable (FR-010).

## Firing surfaces

- **Refusing (FR-009)**: every compass-gated workflow skill (`design`, `define`, `extend`, `execute`, `ship`, `close`, `release`) — they already call `stackctl workflow compass <item> --intent <x>` as a precondition; the backstop rides that call. The close step is explicitly included.
- **Advisory-only (FR-011, `session-skills-never-block`)**: `session-start` (`OrientationReport.mergedNotShippedItems`) and `session-end` (`SessionEndReport.mergedNotShippedItems`) surface the same signal but NEVER refuse — they always complete.

## Test contract (RED-first)

- `merge-signal.test.ts` — fixture repo: record reachable from base + status in-flight → dangling; record not reachable → null; status shipped → null; base undeterminable → null.
- `compass-backstop.test.ts` — `computeVerdict` refuses with a dangling item; allows the reconcile intent; allows when none dangling.
- `session-advisory-nonblocking.test.ts` — session-start/session-end complete (exit 0) with a dangling item present and surface it.
