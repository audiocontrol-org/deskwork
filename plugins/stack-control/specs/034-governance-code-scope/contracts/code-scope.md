# Contracts: Governance Code Scope

This feature's external contracts are (1) the `govern` config block operators write, (2) the pure filter/resolution functions the govern arm calls, and (3) the run-output contract the operator observes. No network/API surface.

## Contract 1 — `govern` config block (`.stack-control/config.yaml`)

```yaml
# All fields optional. Absent block ⇒ full defaults (code-only ON, markdown excluded,
# runtime-defining markdown re-included).
govern:
  code_only: true                # boolean; default true
  code_scope:
    exclude:                     # string[]; REPLACES default when present
      - "**/*.md"
      - "**/*.markdown"
    include:                     # string[]; REPLACES default when present; include wins over exclude
      - "**/SKILL.md"
      - "**/WORKFLOW.md"
      - "**/.claude/rules/**/*.md"
      - "**/CLAUDE.md"
      - "CLAUDE.md"
      - "**/AGENTS.md"
      - "AGENTS.md"
```

**Guarantees**:
- Absent block → defaults (FR-006). `code_only: false` → filter is identity; today's payload exactly (FR-007).
- Present-but-malformed (`code_only` non-boolean; `exclude`/`include` not string arrays) → **throws** a descriptive error naming the key (Principle V). Never silently defaults.
- Supplied `exclude`/`include` replace (not merge) the corresponding default (FR-008).

## Contract 2 — Filter + policy resolution (`src/govern/code-scope.ts`)

```ts
export const DEFAULT_EXCLUDE: readonly string[];   // ["**/*.md","**/*.markdown"]
export const DEFAULT_INCLUDE: readonly string[];   // skill/workflow/rules/CLAUDE/AGENTS globs

export interface CodeScopePolicy {
  readonly active: boolean;
  readonly exclude: readonly string[];
  readonly include: readonly string[];
}

// Resolve the effective policy from installation config (defaults applied). Throws on malformed input.
export function resolveCodeScopePolicy(govern: GovernConfig | undefined): CodeScopePolicy;

// Pure DiffScope → DiffScope. Identity when !policy.active. Drops f iff exclude∧¬include (include wins).
// Preserves survivors' per-file diffs unchanged.
export function applyCodeScope(scope: DiffScope, policy: CodeScopePolicy): DiffScope;

// Concise exclusion summary for observability (FR-014). Count only — never the path list.
export function summarizeCodeScope(before: DiffScope, after: DiffScope, policy: CodeScopePolicy): CodeScopeExclusionSummary;
```

**Behavioral contract (verifiable)**:

| # | Given | Then |
|---|---|---|
| C1 | policy.active=false | `applyCodeScope` returns the input scope byte-identical (FR-007) |
| C2 | `src/foo.ts`, `docs/PRD.md`; default policy | result keeps `src/foo.ts`, drops `docs/PRD.md` (FR-001) |
| C3 | `x/SKILL.md`, `docs/PRD.md`; default policy | keeps `SKILL.md` (include wins), drops `PRD.md` (FR-004) |
| C4 | root `README.md` + root `CLAUDE.md`; default policy | drops `README.md`, keeps `CLAUDE.md` (FR-009) |
| C5 | any survivor | its `fileDiffs` entry is unchanged (FR-003) |
| C6 | operator `include: ["**/*.md"]` | all markdown kept (supplied list replaces default; include wins) (FR-008) |
| C7 | operator `exclude` non-array | `resolveCodeScopePolicy` throws naming `code_scope.exclude` (Principle V) |
| C8 | before non-empty, after empty, active | `summarizeCodeScope.emptiedScope === true` (FR-011/FR-014) |

## Contract 3 — Run output (observability, FR-014 / SC-007)

When code-only scoping excludes ≥1 file, the implement-mode govern run emits a **concise** line: the count of excluded documentation files and that code-only scoping is active. It MUST NOT emit the full excluded-path list. When filtering empties the scope, the run reports a **"nothing to govern — no code in scope" success** (not a fatal), and this success satisfies the graduation precondition (FR-011).

Example (illustrative, exact wording set in implementation):
```
govern: code-only scoping active — excluded 7 documentation file(s) from the audit payload.
govern: nothing to govern — no code in scope (documentation-only change); success.
```

## Contract 4 — Lens (FR-010 / SC-006)

When `code_only` is active, the implement-mode audit lens is the code-only variant, which contains **no** documentation-drift instruction. When `code_only` is false, the existing `CODE_AUDIT_LENS` (with the doc-drift bullet) is used unchanged.
