# Contract: `.stack-control/config.yaml` + resolution

The shared config + resolution port. The **create-side** (`stackctl setup`) writes it; the **read-side** (every governed verb's working-file lookup) resolves through it. Both are concrete instances of this one contract (constitution Principle II). This contract is also what `design:gap/project-relative-doc-discovery` consumes — see plan § Scope-coordination note.

## Location & root-marking

- One config per installation at `<installation-root>/.stack-control/config.yaml`.
- **The config's presence marks the installation root** (Clarification OQ-1). There is no separate marker file.

## Wire format (YAML, snake_case)

```yaml
version: 1
base_dir: ".stack-control"        # optional; default ".stack-control"; must resolve within root
paths:                            # optional; each relative-to-root (or absolute-within-root)
  roadmap: "ROADMAP.md"
  inbox: "DESIGN-INBOX.md"
  backlog: ".stack-control/backlog"
  audit_log: ".stack-control/audit-log.md"
  feature_audit_log_pattern: "specs/{feature}/audit-log.md"
```

In-memory shape is camelCase (`baseDir`, `featureAuditLogPattern`), translated at load (mirrors the audit-barrage loader). See [data-model.md](../data-model.md) for the full field table and the managed-set/key list.

## Validation (fail-loud — Principle V)

| Rule | On violation |
|---|---|
| `version` present, positive integer, known | descriptive error (no best-effort parse of an unknown version) |
| `base_dir` non-empty + resolves **within** root | refuse (escape → FR-024) |
| each `paths.<key>` non-empty + resolves within root | refuse (escape) |
| `feature_audit_log_pattern` contains literal `{feature}` | descriptive error |
| no unknown top-level keys | descriptive error (no silent ignore) |
| no two keys resolve to the same path; no cross-installation collision | refuse (FR-024) |

## Resolution

### Installation resolution (surface-agnostic — FR-026)

`resolveInstallation(startDir: string): Installation` — upward walk from `startDir` to the nearest ancestor with `.stack-control/config.yaml`; nearest-wins (parent scope excludes nested child subtrees); stop at filesystem root; **no match → fail-loud** naming the start dir and directing to `stackctl setup`. `startDir` is a plain directory (CLI cwd today; a client-supplied root e.g. an MCP root later) — never a host-specific handle.

### Path resolution (per key)

`resolvePaths(root, config): ResolvedPaths` — for each `WorkingFileKey`:

```
per-file override (paths.<key>)  ▸  base_dir + conventional name (internal)  ▸  audience-split default (human docs at root)
```

then containment + collision checks. Pure function.

## Read-side wiring (the second Principle-II instance — FR-003)

These existing resolution points are rewired to resolve through this contract when inside an installation, **failing loud (no bundled-copy fallback)** when outside one; env seams preserved as test seams:

| Point | Today | After |
|---|---|---|
| `subcommands/inbox.ts` `DEFAULT_DOC` | bundled `DESIGN-INBOX.md` (`STACKCTL_INBOX_DEFAULT_DOC` seam) | resolved `inbox` path for the enclosing installation |
| `subcommands/roadmap.ts` `DEFAULT_DOC` | bundled `ROADMAP.md` | resolved `roadmap` path |
| `backlog/root.ts` `backlogRoot()` | bundled root (`STACKCTL_BACKLOG_DIR` seam) | resolved `backlog` path |
| `subcommands/document-verb-shared.ts` `grammarDirs()` | `process.cwd()/.stack-control/grammars` | `<installation-root>/.stack-control/grammars` |

An explicit `--doc <path>` continues to override resolution everywhere (operator escape hatch).

## Backward-compat / dogfood

The in-repo `plugins/stack-control` installation gets a repo-root `.stack-control/config.yaml` whose `paths` overrides record the actual scattered dogfood layout (research D9). No "no-config → use the plugin tree" special-case exists (that would be a silent fallback — Principle V).
