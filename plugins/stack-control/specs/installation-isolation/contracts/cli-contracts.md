# CLI Contract Deltas — Installation Isolation (specs/installation-isolation)

Exit-code meanings are frozen adopter contracts; every delta below is additive on codes (the retired flag lands on the EXISTING unknown-flag usage error). Stderr is the loudness channel.

## Cross-cutting: flag retirement (Clarification 2026-06-10)

`--repo-root` is REMOVED from the state-writing verbs: `govern`, `audit-barrage`, `audit-barrage-lift`, `slush-findings`, `scope-widen`, `scope-inventory`. Passing it now yields the verb's existing unknown-flag usage error (exit 2) naming the flag. Explicit anchoring is expressed ONLY as `--at <dir>` (the installation enclosing `<dir>`; consistent with install-scope-discovery / scope-export). `GOVERN_REPO_ROOT` is likewise retired (ignored variables are an error, not a silent no-op: govern refuses when it is set, naming the replacement).

Read-side verbs are unchanged: `spec-check --spec <path>`, `execute-check --spec <path>`, `scope-export --manifest <path>` keep their explicit artifact paths (reads name files; writes anchor installations).

## Cross-cutting: refusal + notices

- **No-installation refusal** (all state-writing verbs): exit non-zero with `<verb>: FATAL — no stack-control installation found from <start-dir> (no .stack-control/config.yaml at or above it) — run `stackctl setup``. Identical wording class across verbs.
- **Legacy half-installation notice** (US5; fires from the shared resolver at most once per invocation):

```
<verb>: WARNING — legacy stack-control state present and IGNORED at <toplevel>/.stack-control (no config.yaml marker)
<verb>: reading/writing under <installation-root>/.stack-control
<verb>: migrate by moving the legacy files into the installation (advice never overwrites existing tuned files; review each)
```

- **Cross-tree feature anchor announcement** (R4): when the resolved feature root lies outside the installation subtree, one stderr line names it: `<verb>: feature anchor outside the installation: <feature-root> (designated anchor — artifacts land there)`.
- **Explicit override announcement** (FR-007): an honored env/flag override that redirects placement prints one line naming the override and the resolved destination.

## `stackctl govern` (US3, US4)

- Flags: `--repo-root` retired (above); `--at <dir>` added.
- Diff engine: committed arm = `git -C <installation> diff --relative <base>`; untracked fold enumerated at the installation; payload paths are installation-relative.
- Cross-tree fold: feature artifacts outside the installation subtree fold in as a labeled second diff arm; a payload that would silently omit in-range feature artifacts is a FATAL instead (exit 2 via the existing payload-fatal channel).
- Bookkeeping exclusions (audit-protocol-reliability contracts) unchanged, now resolved from the installation record — never cwd (closes TASK-40).
- Run-dirs + barrage config: under `<installation>/.stack-control/` (run JSON shape unchanged).

## `stackctl audit-barrage` / `audit-barrage-lift` (US1)

- Flags: `--repo-root` retired; `--at <dir>` added.
- Run-dir: `<installation>/.stack-control/audit-runs/<stamp>-<feature>/` (previously `<repoRoot>/…`).
- Config resolution: `<installation>/.stack-control/audit-barrage-config.yaml`; the audit-protocol-reliability legacy-dw-lifecycle notice keeps firing relative to the installation; the US5 half-installation notice covers the repo-root case.
- Lift targets: the resolved feature anchor (unchanged semantics; cross-tree announcement applies).

## `stackctl scope-widen` / `scope-inventory` (US1)

- Flags: `--repo-root` retired; `--at <dir>` added.
- Auto-seed (audit-protocol-reliability behavior) seeds `<installation>/.stack-control/scope-discovery/` — never a bare repo root.
- Evidence/run-dirs: unchanged (feature anchor); cross-tree announcement applies.
- Clone baseline: resolved via the boundary resolver (the split-brain sibling now shares check-clones' path).

## `stackctl slush-findings` (US1)

- Flags: `--repo-root` retired; `--at <dir>` added. Audit-log target = the resolved feature anchor (unchanged); backlog destination = the installation's store (unchanged seam).

## `stackctl backlog …` (US4)

- No flag changes. The store resolution accepts an explicit start point from callers (govern threads its resolved installation); `process.cwd()` remains only the default start of the walk-up. `STACKCTL_BACKLOG_DIR` keeps working as an announced override.

## US6 (this repo's relocation — not an adopter-facing CLI delta)

- `.specify/` + `specs/` move into the installation; the repo-root agent-context pointer updates; `resolveFeatureRoot` consults `<installation>/specs` first with grandfathered numbered names; legacy locations stay read-resolvable. Recorded references are not rewritten.
