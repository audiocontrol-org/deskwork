# Data Model: Audit-Protocol Hardening — Layout-Aware Resolution

This feature is filesystem-resolution logic, not persistent data. The "entities" are the resolution inputs/outputs and the audit-log artifact.

## FeatureLayout (conceptual enum)

The layout a feature's directory follows. Resolution is the act of mapping a feature identity to a root across these.

| Variant | Shape | Version axis | Notes |
|---|---|---|---|
| `legacy-docs` | `<repo>/docs/<version>/001-IN-PROGRESS/<slug>/` | yes (`<version>`, lex-greatest wins) | unchanged; backward-compat guard |
| `speckit` | `<repo>/specs/<NNN>-<slug>/` | no (flat, numeric prefix) | **new in this feature** |

## ResolveFeatureRootArgs (input — unchanged contract)

- `slug: string` — the feature slug (leaf name in `legacy-docs`; suffix after the numeric prefix in `speckit`).
- `repoRoot?: string` **or** `docsRoot?: string` — exactly one (existing rule). For the `speckit` branch the resolver derives `<repoRoot>/specs` analogously to how it derives `<repoRoot>/docs`.

## ResolveFeatureRootResult (output — extended)

- `root: string | undefined` — absolute feature root under whichever layout matched, or `undefined` if neither matched.
- `versionsChecked: readonly string[]` — the `legacy-docs` version dirs considered (for the not-found message); unchanged.
- *(new, optional)* `layout?: 'legacy-docs' | 'speckit'` — which layout produced `root` (so callers/messages can report it). Additive; does not break existing destructuring (`const { root } = ...`).

**Resolution rules** (from research D2/D3):
1. Search `speckit` first: a child of `<repo>/specs` named exactly `<slug>` or matching `^\d+-<slug>$`. Ambiguous multi-match → fail loud naming candidates.
2. On no `speckit` match, run the existing `legacy-docs` walk unchanged.
3. First match wins; precedence is deterministic (`speckit` → `legacy-docs`), never filesystem-iteration-order.
4. Neither matches → `root: undefined`; the caller fails loud naming **both** layouts searched (Principle V).

## AuditLog (artifact, located + scaffolded)

- Path: `<feature-root>/audit-log.md` — derived from `root`, layout-independent (US1/FR-002).
- Canonical shape (US2/D4): frontmatter `slug: <slug>` + `targetVersion: "<v>"` (omitted/defaulted for `speckit`), then `# Audit log — <slug>`.
- Append unit: `## <ISO-date> — audit-barrage lift (<run-dir-basename>)` sections (existing lift format; parsed by the dampener's `BARRAGE_HEADER_RE`).
- State: absent → scaffolded-on-first-lift (US2) → appended-to on each subsequent lift.

## Relationships

```
ResolveFeatureRootArgs.slug ──▶ resolveFeatureRoot ──▶ ResolveFeatureRootResult.root
                                       │                         │
                          (speckit ∥ legacy-docs)                ▼
                                                        <root>/audit-log.md
                                                        (located US1 · scaffolded US2)
                                                                 │
                                            consumed by ◀────────┘
                                  gate · audit-barrage-lift · slush-findings · govern
```
