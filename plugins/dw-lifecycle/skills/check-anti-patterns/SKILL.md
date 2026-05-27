---
name: check-anti-patterns
description: "Scan the source tree for legacy shapes registered in anti-patterns.yaml and report findings"
---

# /dw-lifecycle:check-anti-patterns

Gate the source tree against `.dw-lifecycle/scope-discovery/anti-patterns.yaml` — the registry of LEGACY shapes that the project has formally retired. Each entry names a canonical replacement; the scanner walks `.ts` / `.tsx` files, matches single-pattern or multi-pattern (proximity-bound) fingerprints with the regex engine, and reports any holdouts. Pairs with `/dw-lifecycle:check-adopters` (which detects files that SHOULD use a canonical primitive but don't) — together the two scanners cover both sides of a retired-shape contract.

Default mode is INFORMATIONAL (findings → stdout report, exit 0). `--gate-mode` flips the exit-code contract for pre-commit-hook wiring (findings → exit 1 → commit fails).

## This is the REGISTERED-PATTERN inventory check

`check-anti-patterns` is a pure **inventory** verb — it matches against the catalog the operator (or `install-seed`) authored. A green run means "no source-tree match against the things you registered in `anti-patterns.yaml`." It says nothing about novel anti-patterns the catalog doesn't yet describe.

To find NOVEL anti-patterns (shapes that aren't in the registered catalog), run `/dw-lifecycle:scope-inventory <slug>` — that skill invokes the discovery layer (negative-space + coverage + outlier + semantic handlers + the synthesis-layer unmatched-shape clustering pass) alongside the registered-pattern scanners, and surfaces novel candidates under `discovered_candidates:` on the resulting manifest. The operator-trust failure mode this distinction closes: *"a green check-anti-patterns run read as evidence of no anti-patterns, when it's really evidence of no already-registered matches."*

The runtime distinction is visible in the manifest: registered-pattern findings carry `provenance: 'registered-pattern'` and `status_provenance.provenance_source: operator-authored` / `install-seed`; discovery findings carry one of `negative-space` / `coverage-gap` / `outlier` / `semantic` / `discovered-candidate` provenance tags. See [`discovery-agents/README.md`](../../src/scope-discovery/discovery-agents/README.md) (in the plugin source) for the full agent fleet split.

## Steps

1. Confirm the project has populated `.dw-lifecycle/scope-discovery/anti-patterns.yaml`. An empty registry is a healthy no-op; the scanner reports zero findings and exits 0.
2. Confirm the scan root (defaults to `src/`). Override via `--root` for projects whose source tree lives elsewhere.
3. Shell out to the helper:

```
dw-lifecycle check-anti-patterns [--registry <path>] [--root <path>] \
                                 [--gate-mode] [--quiet] [--json]
```

The helper:
   - Loads the registry via the canonical YAML parser (shape errors throw at parse-time with a descriptive keypath).
   - Walks the scan root, skipping `node_modules` / `dist` / `build` / `.next` / `.turbo` / `coverage` / `.git`.
   - For each `.ts` / `.tsx` file, matches the entry's regex fingerprint(s); multi-pattern entries enforce `min_distance` proximity.
   - Auto-excludes the canonical primitive's own implementation (`canonical_file:` field) so the primitive doesn't flag itself.
   - Reports findings to stdout (text by default, `--json` for tooling). `--quiet` suppresses informational status lines.

4. Report: the registry path resolved, the root scanned, the count of findings (by entry id), and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--registry <path>` | Override the registry path. Defaults to `.dw-lifecycle/scope-discovery/anti-patterns.yaml`. |
| `--root <path>` | Override the scan root. Defaults to `src/`. |
| `--gate-mode` | Pre-commit-hook-friendly: exit 1 on findings (default: exit 0 informational). |
| `--quiet` | Suppress informational status lines. Findings still print. |
| `--json` | Emit findings as JSON instead of the default text report. |

## Error handling

- **Registry missing.** Helper exits 2 with the resolved path in the error message. Run `/dw-lifecycle:install-scope-discovery` to scaffold the config dir, then author the registry from the project's known retired shapes.
- **Malformed YAML.** Parser throws with a descriptive keypath — fix the failing entry's shape and re-run. JSON Schema at `plugins/dw-lifecycle/src/scope-discovery/schema/anti-patterns.yaml.schema.json` documents the contract for editor integrations.
- **Findings under `--gate-mode`.** Exit 1; the commit (or hook) fails. Either fix the offending occurrences, or mark the disposition explicitly via `/dw-lifecycle:dispose-clone` if the holdout is being intentionally kept.
- **Findings WITHOUT `--gate-mode`.** Exit 0; the scanner is informational. The findings are still on stdout for triage; pipe to `--json` for structured downstream consumers.
- **Pattern-type ambiguity.** v1 ships regex-only; `glob` / `ast-grep` / `ts-morph` pattern types are tracked at [#285](https://github.com/audiocontrol-org/deskwork/issues/285). Until the dispatcher lands, the registry SHOULD declare `pattern_type: regex` (or omit it — regex is the default).

## When to use

Run check-anti-patterns at three moments: (1) as a pre-commit gate via `--gate-mode` on staged `.ts` / `.tsx` changes so newly-introduced legacy shapes never land; (2) as an ad-hoc audit when authoring a refactor PR — does the project still contain the shape this PR is retiring? (3) as an input to `/dw-lifecycle:scope-inventory` synthesis (the pattern-matrix universal agent consumes this registry to flag PRD-themed surfaces that still carry the legacy shape). Pairs with `/dw-lifecycle:check-adopters` for the inverse question: who SHOULD use the canonical primitive but doesn't?

**When a green run is NOT enough.** If the project is suspecting an undocumented anti-pattern (no catalog entry yet), check-anti-patterns will NOT find it — by design. Run `/dw-lifecycle:scope-inventory <slug>` to invoke the discovery layer and review `discovered_candidates:` in the resulting manifest. Promote novel candidates into `anti-patterns.yaml` (status: `cursed`) and re-run check-anti-patterns to enforce.
