# Data Model: Governance Code Scope

The feature introduces two config-shaped types and a resolved-policy type; it reuses the existing `DiffScope`. No persistent store — config is read from `.stack-control/config.yaml`; everything else is in-memory.

## GovernConfig (config-facing, on `InstallationConfig`)

The first govern-tuning block on the installation config. Optional — absent means "apply defaults."

| Field | Wire (YAML, snake) | In-memory (camel) | Type | Default (when block absent) |
|---|---|---|---|---|
| code-only toggle | `govern.code_only` | `govern.codeOnly` | `boolean` | `true` |
| exclude globs | `govern.code_scope.exclude` | `govern.codeScope.exclude` | `string[]` | `["**/*.md", "**/*.markdown"]` |
| include globs | `govern.code_scope.include` | `govern.codeScope.include` | `string[]` | `["**/SKILL.md", "**/WORKFLOW.md", "**/.claude/rules/**/*.md", "**/CLAUDE.md", "CLAUDE.md", "**/AGENTS.md", "AGENTS.md"]` |

**Validation rules**:
- Absent `govern` → the whole default policy applies (FR-006).
- Present `govern.code_only` MUST be a boolean; present `exclude`/`include` MUST be arrays of strings — else **throw** naming the key (Principle V / research Decision 5).
- When an operator supplies `exclude` or `include`, that array **replaces** the default for that field (no merge); the other field keeps its default if unspecified (FR-008).

```ts
interface GovernCodeScopeConfig {
  readonly exclude: readonly string[];
  readonly include: readonly string[];
}
interface GovernConfig {
  readonly codeOnly: boolean;
  readonly codeScope: GovernCodeScopeConfig;
}
// InstallationConfig gains:
//   readonly govern?: GovernConfig;
```

## CodeScopePolicy (resolved, consumed by the filter)

The fully-resolved policy the filter uses — defaults already applied, matchers compiled once. Derived from `GovernConfig` (or defaults) by `resolveCodeScopePolicy`.

```ts
interface CodeScopePolicy {
  readonly active: boolean;            // = codeOnly; false ⇒ applyCodeScope is identity
  readonly exclude: readonly string[]; // effective globs (post default-resolution)
  readonly include: readonly string[]; // effective globs (post default-resolution)
  // compiled matchers (picomatch) are held internally by the module, not exposed
}
```

**Derivation**:
- `active = govern?.codeOnly ?? true`.
- `exclude = govern?.codeScope?.exclude ?? DEFAULT_EXCLUDE`.
- `include = govern?.codeScope?.include ?? DEFAULT_INCLUDE`.
- Matchers compiled with `picomatch(glob, { dot: true })` once at resolution.

**State transitions**: none — a value object resolved once per govern run and threaded read-only into the runtime.

## DiffScope (existing — reused, not changed)

The scoped diff the filter narrows (defined in `payload-diff-scope.ts`):

```ts
interface DiffScope {
  readonly base: string;
  readonly head: string;
  readonly files: readonly string[];
  readonly fileDiffs: ReadonlyMap<string, string>;
}
```

`applyCodeScope(scope: DiffScope, policy: CodeScopePolicy): DiffScope`:
- If `!policy.active` → returns `scope` unchanged (identity, FR-007).
- Else drops file `f` iff `matchesAny(exclude, f) && !matchesAny(include, f)` (include wins, FR-004); retains all others.
- Preserves each surviving file's `fileDiffs` entry unchanged (FR-003); returns a new `DiffScope` with narrowed `files` + `fileDiffs`.

## ExclusionSummary (observability, FR-014)

The concise report surfaced when code-only scoping excludes files. Not persisted; rendered into the govern run output.

```ts
interface CodeScopeExclusionSummary {
  readonly active: boolean;         // code-only scoping was applied
  readonly excludedCount: number;   // number of files dropped as documentation
  readonly emptiedScope: boolean;   // filtering reduced a non-empty scope to empty
}
```

**Rules**: rendered only when `active && excludedCount > 0`. Carries a **count**, never the full path list (FR-014 / SC-007). When `emptiedScope`, the render states the "nothing to govern — no code in scope" reason (the FR-011 success).
