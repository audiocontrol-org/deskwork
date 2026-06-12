# Contract: session-skills config extension (extends 009's `.stack-control/config.yaml`)

session-skills adds three working-file keys to the **shared** installation config that `multi:feature/project-doc-setup` (009) owns. It does NOT introduce a second config. This is the additive change 009's managed set is declared to allow (009 spec FR-001; constitution Principle II — a second real consumer of the port).

## New `paths` keys

| Key (wire, snake_case) | In-memory (camelCase) | Kind | Default when unconfigured | Consumer |
|---|---|---|---|---|
| `journal` | `journal` | file | installation root / `DEVELOPMENT-NOTES.md` (human doc) | session-end writes; session-start reads latest entry |
| `tooling_feedback` | `toolingFeedback` | file | installation root / `tooling-feedback.md` (human doc) | session-end appends |
| `clone_scope` | `cloneScope` | dir | installation root (`.`) | session-end clone-snapshot |

```yaml
version: 1
paths:
  # ... 009's keys (roadmap, inbox, backlog, audit_log, feature_audit_log_pattern) ...
  journal: "DEVELOPMENT-NOTES.md"
  tooling_feedback: "tooling-feedback.md"
  clone_scope: "."
```

## Resolution & validation

- Resolved by 009's `resolvePaths(root, config)` with the **same precedence** (per-file override > `base_dir` > audience-split default) and the **same fail-loud validation** (non-empty; resolves within root; no cross-key collision; no unknown top-level keys). The three keys add **no new validation kind**.
- `ResolvedPaths` gains `journal`, `toolingFeedback`, `cloneScope` (resolved-absolute).
- `clone_scope` is a **directory** (the per-codebase scope for the snapshot); `journal`/`tooling_feedback` are files.

## Backward-compat / interaction with 009

- If 009's schema (`schema/stackctl-config.yaml.schema.json`) lands first, this feature adds the three keys to it; if this feature implements first, it introduces the keys and 009 inherits them (the port is shared — plan § Dependency-sequencing note). Either way the result is one schema with all keys.
- The in-repo dogfood config records real overrides for all three (research D9): `journal → DEVELOPMENT-NOTES.md`, `tooling_feedback → docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md`, `clone_scope → plugins/stack-control`.
