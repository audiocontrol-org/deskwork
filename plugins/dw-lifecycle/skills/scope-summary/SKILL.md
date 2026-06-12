---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:scope-summary

Report the clone-group footprint on a given surface glob. Reads `.dw-lifecycle/scope-discovery/clones.yaml`, matches each clone group's members against the glob, and prints a four-field summary suitable for skill prose, audit-log entries, and ad-hoc operator triage: `total | pending-touching | pending-intra | dispositioned-touching`.

## Steps

1. Confirm the surface glob (e.g. `packages/studio/src/pages/**`). The glob is matched against each clone-group member's bare file path with `<path>:<start>:<end>` ranges stripped before matching.
2. Shell out to the helper:

```
dw-lifecycle scope-summary --surface <glob> [--clones <path>] [--json] [--verbose]
```

The helper:
   - Reuses the canonical clones.yaml parser (no hand-rolled YAML).
   - Compiles the glob via the shared `globToRegex` compiler so the grammar matches `check-adopters` and `clone-summary`.
   - Categorizes each group as `pending-touching` (any member matches), `pending-intra` (all members match), or `dispositioned-touching` (at least one match and disposition is not `pending`).
   - Prints the four-field summary on a single line.

3. Report: the summary line, plus matching group ids + member-counts on stderr when `--verbose` is set.

## Flags

| Flag | Meaning |
|---|---|
| `--surface <glob>` | Required. The surface glob; matched against each clone-group member's bare file path. |
| `--clones <path>` | Override the clones.yaml path. Defaults to `.dw-lifecycle/scope-discovery/clones.yaml`. |
| `--json` | Emit a JSON object with the four counts plus the `surface` and `clones` paths. Suitable for piping into tooling. |
| `--verbose` | Additionally print each matching group's id and matching-member count to stderr. |

## Error handling

- **clones.yaml missing or malformed.** Helper exits with code 2 and a parse-error message naming the failing keypath. Run `/dw-lifecycle:refresh-clones-baseline` to regenerate a clean baseline.
- **Invalid surface glob.** Helper exits 2 with the offending glob token and a hint that the grammar is the same as `check-adopters`.
- **Empty match.** Not an error — the helper prints zeros and exits 0. An empty surface tally is a valid datapoint.

## When to use

Reach for scope-summary when triaging "how big is the clone footprint on THIS surface?" — e.g. before scoping a refactor commit, when authoring a feature workplan that names a specific module, or when an audit-log finding cites a surface and you need a numeric handle on its current debt. Pairs with `/dw-lifecycle:scope-export` (for the full machine-readable manifest) and `/dw-lifecycle:check-anti-patterns` (for the legacy-shape detail underneath the counts).
