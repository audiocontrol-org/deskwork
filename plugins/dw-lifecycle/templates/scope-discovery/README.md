# `.dw-lifecycle/scope-discovery/` — project-side scope-discovery config

This directory is the project-side CONFIG home for the dw-lifecycle
scope-discovery protocol. Per THESIS Consequence 3, deskwork's
scope-discovery splits responsibility along a strict CODE / CONFIG
boundary:

- **CODE** lives in the `dw-lifecycle` plugin (`plugins/dw-lifecycle/`).
  The scanners, validators, agents, and dispatch wrapper are plugin
  code, versioned and tested under the plugin.
- **CONFIG** lives HERE. This directory is owned by the adopting
  project; its contents describe the project's specific patterns,
  baselines, and policies for the protocol to enforce.

The bootstrap is produced by `dw-lifecycle install-scope-discovery`.
Re-running the installer is idempotent — already-present files are
left untouched unless `--force` is passed.

## Layout

| File | Purpose |
|---|---|
| `README.md` | This file. |
| `LAYOUT.md` | Project-side layout conventions (modules, src/, module-root flag). |
| `refactor-preconditions-checklist.md` | Step 0a + Step 0b checklist for refactor commits. |
| `.jscpd.json` | jscpd config consumed by `dw-lifecycle check-clones`. |
| `clones.yaml` | The clone-detector baseline. Operator-curated dispositions. |
| `anti-patterns.yaml` | Registry of LEGACY shapes the project has retired. |
| `adopter-manifests.yaml` | Registry of canonical primitives that adopters MUST use. |
| `hooks-installed.json` | Provenance for `install-scope-discovery-hooks` (do not hand-edit). |

Optional override files (created by `dw-lifecycle customize` when the
operator needs to deviate from plugin defaults):

| File | Replaces |
|---|---|
| `pattern-matrix-patterns.yaml` | Built-in pattern-matrix catalog. |
| `forbidden-deferral-phrases.yaml` | Built-in forbidden-deferral list for the dispatch wrapper. |
| `refactor-markers.yaml` | Built-in refactor-marker regex set. |

## Editing the registries

Each registry has a published JSON Schema under the plugin at
`plugins/dw-lifecycle/src/scope-discovery/schema/`. Editor integrations
(VS Code, Zed, JetBrains via Schemastore) can be wired to the schema
files for inline validation. The CLI parser also asserts each YAML at
load-time and surfaces shape errors with a descriptive keypath.

To add an entry, edit the relevant YAML by hand and re-run the
corresponding scanner (`dw-lifecycle check-anti-patterns`,
`dw-lifecycle check-adopters`, etc.). The scanners are intentionally
informational by default; `--gate-mode` flips them to exit-1-on-finding
for pre-commit-hook wiring.

## See also

- `LAYOUT.md` — how the protocol thinks about the project's source tree.
- `refactor-preconditions-checklist.md` — what a refactor commit must
  prove before it can land.
- Plugin docs: `plugins/dw-lifecycle/skills/<verb>/SKILL.md` for the
  operator-facing procedure of each verb.
