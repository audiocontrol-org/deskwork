---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:customize

Create a project-local override for one of dw-lifecycle's built-in artifacts. Two categories are supported:

- `templates <name>` — markdown templates copied to `.dw-lifecycle/templates/<name>.md`.
- `scope-discovery <name>` — scope-discovery defaults copied to `.dw-lifecycle/scope-discovery/<name>`.

## Steps

1. Confirm the category and template / override name.

   For markdown templates (today's supported names):
   - `templates journal-entry`

   For scope-discovery overrides:
   - `scope-discovery pattern-matrix-patterns.yaml` — replaces the built-in pattern-matrix catalog consumed by the scanner.
   - `scope-discovery router-strategies` — per-project router strategy module; replaces the default React-Router strategy (additional defaults for Vue / Next / SvelteKit are tracked at [#286](https://github.com/audiocontrol-org/deskwork/issues/286)).
   - `scope-discovery pattern-matrix.ts` — per-file override of the scanner module itself; the override-drift doctor rule advises when this drifts substantially from the plugin default.
   - `scope-discovery forbidden-deferral-phrases.yaml` — replaces the built-in forbidden-deferral phrase list consumed by the dispatch wrapper.
   - `scope-discovery refactor-markers.yaml` — replaces the built-in refactor-marker regex set.

2. Invoke the helper from the project root:

```bash
dw-lifecycle customize templates journal-entry
```

or (when supported by the helper for the category):

```bash
dw-lifecycle customize scope-discovery <name>
```

3. Edit the copied file at the destination path printed by the helper:
   - `.dw-lifecycle/templates/<name>.md` for `templates`.
   - `.dw-lifecycle/scope-discovery/<name>` for `scope-discovery`.

4. Re-run the consuming skill (`/dw-lifecycle:session-start`, `/dw-lifecycle:session-end`, `/dw-lifecycle:scope-inventory`, `/dw-lifecycle:check-clones`, etc.); the project override is picked up automatically by the runtime override resolver.

## Override-resolution order

For each customizable artifact, the runtime resolver looks for overrides in this order:

1. Project-local override at `.dw-lifecycle/<category>/<name>` (or `.dw-lifecycle/scope-discovery/<name>` for the scope-discovery category).
2. Plugin default shipped at `plugins/dw-lifecycle/templates/<category>/<name>` (or `plugins/dw-lifecycle/src/scope-discovery/<name>` for the scope-discovery category's TS modules).

The first match wins. When an override is present, the plugin default is not loaded. The `override-drift` doctor rule advises (warning severity) when a TS override has drifted substantially from the plugin default so the operator stays current with upstream changes by deliberate choice rather than by entropy.

## Error handling

- **Override already exists.** Refuse to overwrite it.
- **Unknown template / override name.** Surface the valid built-in names for the requested category.
- **`scope-discovery` category not yet supported by the helper.** Today the helper accepts the `templates` category only; for scope-discovery overrides, operators currently create the override file at `.dw-lifecycle/scope-discovery/<name>` by hand (the override-resolution order above still applies). Tracked at [#286](https://github.com/audiocontrol-org/deskwork/issues/286) for router-strategies and at the analogous follow-up issue for the broader override-helper work.
