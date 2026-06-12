# Contract: `stackctl setup`

The create-side verb. Scaffolds a stack-control installation's governed working files and writes its config. CLI-first (FR-025): runnable by any agent or human in a plain shell; the `/stack-control:setup` skill is a thin adapter over this.

## Synopsis

```
stackctl setup [--at <dir>] [--apply]
```

- `--at <dir>` — target installation root. Default: the current working directory. The config is written to `<dir>/.stack-control/config.yaml`; that file's presence marks the root.
- `--apply` — perform writes. Without it, `setup` runs **dry** (reports what it *would* create, mutates nothing) — the dry-run-first discipline (consistent with `backlog import-*`).
- No other flags. Unknown flag / stray positional → exit 2 (`failUsage`, shared grammar).

## Behavior

1. **Resolve target root.** If a config already exists at-or-above `--at`/cwd (upward walk), operate on that installation (idempotent re-run). Otherwise the target root is `--at`/cwd and a new installation is created there. Ambiguous target (e.g. `--at` not a directory) → exit 2.
2. **Resolve every working-file location** via the shared resolver (per-file override > base > audience-split default). Refuse (exit 2, descriptive) on within-root escape or cross-key/cross-installation collision (FR-024/FR-011).
3. **Scaffold missing items only**, empty-but-valid (FR-001/FR-002). Never modify/truncate/delete an existing item (FR-004). The managed set: `config`, `roadmap`, `inbox`, `backlog` store, program `audit_log`. (Per-feature audit logs + operation-products are NOT scaffolded — FR-027/FR-001.)
4. **Verify** every required item (created or pre-existing) against its consuming parser. A present-but-malformed item → fail loud, name it, `ready=false`, exit 1 — never a false-clean report (FR-009). A drifted item is surfaced, not overwritten (FR-010).
5. **Report** per item: `created | already-present | skipped | malformed`, with resolved locations (FR-006).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Installation is ready (all required items present + well-formed). Dry run that found a clean/complete plan also exits 0. |
| 1 | A required item is present but malformed, or a write failed (fail-loud; report names the item). |
| 2 | Usage error: unknown flag, stray positional, ambiguous `--at`, or a config collision/escape refusal. |

## Invariants (asserted by tests)

- **Non-destructive**: pre-existing items are byte-for-byte identical before/after (SC-002 content-hash).
- **Idempotent**: a second `--apply` on a complete installation writes nothing and reports all `already-present` (FR-005).
- **No network/secrets/interactive** (FR-014).
- **Isolation**: `setup --at <subtreeA>` never touches another installation's files (SC-008/FR-022).
- **Identical to auto-on-first-use**: the files `setup` creates are byte-identical to those a verb's first-use scaffold creates (FR-017).
- **Plain-shell reachable**: every behavior above is exercised with no Claude Code surface present (SC-009).

## Examples

```
# fresh project — dry run then apply
stackctl setup                 # reports what it would create; writes nothing
stackctl setup --apply         # scaffolds config + roadmap + inbox + backlog + program audit log

# monorepo — set up one package as its own installation
stackctl setup --at packages/foo --apply

# custom locations: pre-create a config with overrides, then setup fills the rest
#   (.stack-control/config.yaml authored with paths.roadmap: docs/ROADMAP.md)
stackctl setup --apply         # roadmap scaffolded at docs/ROADMAP.md; location recorded
```

## Auto-on-first-use (FR-015/016)

When a governed verb (`inbox`/`roadmap`/`backlog`) is run inside a directory that resolves to an installation whose working file is **missing**, the verb invokes the shared scaffold (same code path as `setup`), **announces** exactly what it created and where (contentless, empty-but-valid), then proceeds with the original request. A verb run **outside any installation** fails loud directing the operator to `stackctl setup` (no bundled-copy fallback — Principle V).
