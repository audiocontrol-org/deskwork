# Data Model: Post-Install Project Setup (project-doc-setup)

Phase 1. Entities, their fields, and the resolution algorithm. Wire format is YAML (snake_case); the in-memory TypeScript shape is camelCase (mirroring the audit-barrage config-loader translation). No `any`/`as`/`@ts-ignore`.

## Entity: Installation

A stack-control unit scoped to a subtree, **rooted at the directory containing its `.stack-control/config.yaml`**.

| Field | Type | Notes |
|---|---|---|
| `root` | absolute path | the directory containing `.stack-control/` |
| `configPath` | absolute path | `<root>/.stack-control/config.yaml` |
| `config` | `InstallationConfig` | parsed + validated |
| `resolved` | `ResolvedPaths` | each working-file key → absolute path (post-precedence) |

- **Identity**: an installation is uniquely identified by `root`. A repo may hold N installations; nesting permitted (parent scope excludes child subtrees).
- **Resolution**: `resolveInstallation(startDir)` walks up from `startDir` to the nearest ancestor with a config; nearest-wins; no match → fail-loud error.

## Entity: InstallationConfig (wire = `.stack-control/config.yaml`)

```yaml
# .stack-control/config.yaml — presence marks the installation root
version: 1                      # schema version (integer; required)
base_dir: ".stack-control"      # OPTIONAL base for internal stores; default ".stack-control"
                                # (relative to the installation root)
paths:                          # OPTIONAL per-file overrides (relative to root, or absolute within root)
  roadmap: "ROADMAP.md"             # human doc — default: <root>/ROADMAP.md
  inbox: "DESIGN-INBOX.md"          # human doc — default: <root>/DESIGN-INBOX.md
  backlog: ".stack-control/backlog" # internal — default: <base_dir>/backlog
  audit_log: ".stack-control/audit-log.md"          # program-level — default: <base_dir>/audit-log.md
  feature_audit_log_pattern: "specs/{feature}/audit-log.md"  # per-feature pattern (read by the feature lifecycle; {feature} placeholder)
```

**Validation rules (fail-loud, mirroring the audit-barrage loader):**
- `version` — required positive integer; an unknown future version is a descriptive error, not a silent best-effort parse.
- `base_dir` — optional non-empty string; must resolve **within** the installation root (escape → refuse, FR-024).
- `paths.*` — each optional; when present, a non-empty string resolving within the installation root (escape → refuse, FR-024).
- `feature_audit_log_pattern` — optional; must contain the literal `{feature}` placeholder when present (analogous to the `{{prompt}}` placeholder rule).
- Unknown top-level keys → descriptive error (no silent ignore).
- A resolved path that **collides** with another working-file key's resolved path, or (cross-installation) with a sibling installation's resolved file, → refuse (FR-024).

## Entity: WorkingFileKey (the managed set)

The installation-level set **scaffolded by setup** (FR-001):

| Key | Audience | Default location | Skeleton (empty-but-valid) | Consuming verb (verify oracle) |
|---|---|---|---|---|
| `config` | internal | `<root>/.stack-control/config.yaml` | the config itself | the loader (D1) |
| `roadmap` | human | `<root>/ROADMAP.md` | heading-keyed, zero items | `roadmap` parser |
| `inbox` | human | `<root>/DESIGN-INBOX.md` | governed inbox + source registry, zero captures | `inbox` parser |
| `backlog` | internal | `<base_dir>/backlog` | `filesystem_only` `config.yml` + dir (008 init) | the `backlog` binary |
| `audit_log` (program) | internal | `<base_dir>/audit-log.md` | audit-log header, zero findings | the audit-log reader |

**NOT scaffolded by installation setup** (created lazily/announced, or by the feature lifecycle):
- **Per-feature audit logs** — `specs/<feature>/audit-log.md`, created by the feature lifecycle / first govern (FR-027). The config records only the *pattern*.
- **Operation-products** — governance run directories, slush/burn-down beyond the backlog, scope-discovery registries. Created by the verb that produces them (FR-016).

The set is **extensible** (Principle II): a capability migrating in adds its key + default + skeleton + verify oracle.

## Entity: ResolvedPaths

The output of path resolution for one installation: `Record<WorkingFileKey, absolutePath>`. Resolution precedence per key:

```
per-file override (config.paths.<key>)
  ▸ else base_dir + conventional name   (internal stores)
  ▸ else audience-split default          (human docs at root)
```

All results are validated for within-root containment and cross-key/cross-installation non-collision before use (FR-024).

## Entity: SetupReport

Returned by `setup` and emitted by auto-on-first-use (FR-006/FR-016).

| Field | Type | Notes |
|---|---|---|
| `installationRoot` | absolute path | the resolved/created root |
| `items` | `SetupItem[]` | one per working-file key |
| `ready` | boolean | true only when every required item is present + well-formed (FR-009) |

`SetupItem`: `{ key: WorkingFileKey; location: absolutePath; status: 'created' | 'already-present' | 'skipped' | 'malformed'; detail?: string }`.

- `created` — scaffolded this run (empty-but-valid).
- `already-present` — existed; left byte-for-byte untouched (FR-004).
- `malformed` — present but failed its verify oracle → `ready=false`, fail-loud (FR-009/FR-010); drift surfaced for an operator decision, never overwritten.

## Resolution algorithm (shared port — the Principle-II contract)

```
resolveInstallation(startDir):
  dir = absolute(startDir)
  loop:
    if exists(dir + "/.stack-control/config.yaml"):
      cfg = loadAndValidate(dir + "/.stack-control/config.yaml")   # fail-loud
      resolved = resolvePaths(dir, cfg)                            # precedence + collision/escape checks
      return Installation{ root: dir, config: cfg, resolved }
    parent = dirname(dir)
    if parent == dir: break          # filesystem root
    dir = parent
  FAIL-LOUD: "no stack-control installation found from <startDir> (run `stackctl setup`)"
```

The **create-side** (`setup`) and the **read-side** (each verb's working-file lookup) both call this. `setup` additionally creates the config when absent (turning a "no installation" into one at `--at <dir>`/cwd) and scaffolds the missing files; the read path either fails loud (explicit-trigger projects) or, per FR-015, invokes the shared scaffold and announces (auto-on-first-use).

## State / lifecycle

Setup has no persistent state machine; it is a convergent idempotent operation: `(filesystem, config) → (filesystem with missing items scaffolded, config recording all locations)`. Re-running converges to the same state with zero changes when already complete (FR-005, SC-002 content-hash invariant).
