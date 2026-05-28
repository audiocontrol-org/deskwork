---
name: check-adopters
description: "Find files that should import a canonical primitive but don't, per adopter-manifests.yaml"
---

# /dw-lifecycle:check-adopters

Gate the source tree against `.dw-lifecycle/scope-discovery/adopter-manifests.yaml` — the registry of canonical primitives plus the globs of files expected to adopt them. For each manifest entry, the scanner enumerates files matching `expected_adopters_glob`, checks each for an `import ... from '<canonical>'` (or `import('<canonical>')`) statement, and reports any matching files that DON'T (and aren't listed under `exceptions:`). The inverse of `/dw-lifecycle:check-anti-patterns`: that scanner flags LEGACY shapes that should be REPLACED; this one flags FILES that should be USING a canonical primitive.

Default mode is INFORMATIONAL (holdouts → stdout report, exit 0). `--gate-mode` flips the exit-code contract for pre-commit-hook wiring (holdouts → exit 1 → commit fails).

## This is the REGISTERED-PATTERN inventory check

`check-adopters` is a pure **inventory** verb — it matches against the catalog the operator (or `install-seed`) authored in `adopter-manifests.yaml`. A green run means "no files under your expected_adopters_glob fail to import the canonical primitive." It says nothing about canonical primitives the catalog doesn't yet describe, OR about adopter-shape patterns the catalog doesn't yet cover (e.g. an adopter that imports the right primitive but composes it wrong).

To find NOVEL adopter-shape gaps (shapes a canonical primitive's intended adopters reach for but the catalog doesn't yet enforce), run `/dw-lifecycle:scope-inventory <slug>` — that skill invokes the discovery layer (negative-space + coverage + outlier + semantic handlers + synthesis-layer clustering) alongside the registered-pattern scanners. The negative-space handler (the discovered_candidates stub) is particularly relevant for adopter-shape work: it flags files that match an expected-adopter glob but lack canonical-primitive consumption — the exact failure shape the KeygroupSummary repro from [#315](https://github.com/audiocontrol-org/deskwork/issues/315) demonstrated.

Provenance distinction is visible in the manifest: registered-pattern findings carry `provenance: 'registered-pattern'` and `status_provenance.provenance_source: operator-authored` / `install-seed`; discovery findings carry one of `negative-space` / `coverage-gap` / `outlier` / `semantic` / `discovered-candidate` provenance tags. See [`discovery-agents/README.md`](../../src/scope-discovery/discovery-agents/README.md) (in the plugin source) for the full agent fleet split.

## Steps

1. Confirm the project has populated `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`. An empty registry is a healthy no-op; the scanner reports zero holdouts and exits 0.
2. Confirm the scan root (defaults to `.`). Override via `--root` for projects with a non-default tree shape.
3. Shell out to the helper:

```
dw-lifecycle check-adopters [--registry <path>] [--root <path>] \
                            [--gate-mode] [--quiet] [--json]
```

The helper:
   - Loads the registry via the canonical YAML parser (shape errors throw at parse-time).
   - For each manifest entry, expands `expected_adopters_glob` through the shared glob-to-regex compiler.
   - Reads each matching `.ts` / `.tsx` file and checks whether it imports the canonical `from` path (single- or double-quoted, both `import ... from '<p>'` and `import('<p>')` forms accepted).
   - Skips files listed in the entry's `exceptions:` list.
   - Emits holdouts to stdout (text by default, `--json` for tooling). `--quiet` suppresses informational status lines.

4. Report: the registry path resolved, the root scanned, the manifest entries evaluated, the holdout count, and exit code.

## Flags

| Flag | Meaning |
|---|---|
| `--registry <path>` | Override the registry path. Defaults to `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`. |
| `--root <path>` | Override the scan root. Defaults to `.`. |
| `--gate-mode` | Pre-commit-hook-friendly: exit 1 on holdouts (default: exit 0 informational). |
| `--quiet` | Suppress informational status lines. Holdouts still print. |
| `--json` | Emit holdouts as JSON instead of the default text report. |

## Error handling

- **Registry missing.** Helper exits 2 with the resolved path. Run `/dw-lifecycle:install-scope-discovery` to scaffold the config dir, then author the registry naming each canonical primitive + its expected adopter set.
- **Malformed YAML.** Parser throws with a descriptive keypath. JSON Schema at `plugins/dw-lifecycle/src/scope-discovery/schema/adopter-manifests.yaml.schema.json` documents the contract.
- **Invalid glob in `expected_adopters_glob`.** Helper exits 2 with the offending glob token; the grammar matches `/dw-lifecycle:scope-summary` and the other glob-aware verbs.
- **Holdouts under `--gate-mode`.** Exit 1; the commit / hook fails. Either adopt the canonical primitive in the holdout file, or add the file to the entry's `exceptions:` list with operator justification.
- **Holdouts WITHOUT `--gate-mode`.** Exit 0; informational. Pipe to `--json` for structured downstream consumers.

## When to use

Run check-adopters at three moments: (1) as a pre-commit gate via `--gate-mode` on staged `.ts` / `.tsx` changes so newly-added files in adopter globs are forced to use the canonical primitive on first commit; (2) as an ad-hoc audit when adding or modifying a canonical primitive's adopter set — who's still on the legacy import? (3) as an input to `/dw-lifecycle:scope-inventory` (the adopter-manifest-checker Phase 4 agent activates on registry presence and flags PRD-themed holdouts in the synthesized manifest). Pairs with `/dw-lifecycle:check-anti-patterns` (legacy-shape detection) and `/dw-lifecycle:check-editor-symmetry` (cross-module fleet matrix that reads the SAME registry).

**When a green run is NOT enough.** If the project suspects a canonical primitive is being mis-composed by ostensible adopters (the import is there, the usage shape is wrong) OR an entirely new primitive needs adoption tracking, check-adopters will NOT find it — by design. Run `/dw-lifecycle:scope-inventory <slug>` to invoke the discovery layer and review the negative-space / coverage / outlier findings + `discovered_candidates:` in the resulting manifest. Promote novel adopter-manifest needs into `adopter-manifests.yaml` (status: `blessed`) and re-run check-adopters to enforce.
