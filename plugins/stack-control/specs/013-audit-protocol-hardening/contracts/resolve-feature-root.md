# Contract: `resolveFeatureRoot` (layout-aware)

**Surface**: `plugins/stack-control/src/scope-discovery/util/feature-root.ts` → `resolveFeatureRoot(args): Promise<ResolveFeatureRootResult>`

The widened resolver. Backward-compatible superset of the current contract.

## Input

```
ResolveFeatureRootArgs {
  slug: string;                 // required; non-empty
  repoRoot?: string;            // exactly one of repoRoot | docsRoot
  docsRoot?: string;            // legacy shape; speckit branch needs repoRoot (derives <repoRoot>/specs)
}
```

- If `docsRoot` is supplied without `repoRoot`, the `speckit` branch cannot run (no `specs/` parent) — it resolves `legacy-docs` only, unchanged. (Documented; not an error.)

## Output

```
ResolveFeatureRootResult {
  root: string | undefined;            // absolute feature root, or undefined if neither layout matched
  versionsChecked: readonly string[]; // legacy-docs versions considered (unchanged)
  layout?: 'legacy-docs' | 'speckit'; // NEW, optional — which layout produced root
}
```

## Behavior (assertions a test pins)

1. **speckit resolution** — given `<repoRoot>/specs/013-audit-protocol-hardening/` exists and `slug='audit-protocol-hardening'`, returns `root=<repoRoot>/specs/013-audit-protocol-hardening`, `layout='speckit'`.
2. **speckit exact-name** — given `<repoRoot>/specs/<slug>/` (no numeric prefix), also matches.
3. **legacy unchanged** — given only `<repoRoot>/docs/1.0/001-IN-PROGRESS/<slug>/`, returns that root, `layout='legacy-docs'`; the existing `feature-root.test.ts` lex-greatest-version test stays green.
4. **precedence** — given the slug exists under BOTH layouts, returns the `speckit` root (documented precedence), deterministically (not iteration-order).
5. **numeric-prefix ambiguity** — given two `specs/` dirs both matching `^\d+-<slug>$`, throws/fails-loud naming the candidates (no silent pick).
6. **neither layout** — given the slug under neither, returns `root: undefined`; the *caller* fails loud naming both `specs/<NNN>-<slug>` and `docs/<version>/001-IN-PROGRESS/<slug>` searched.
7. **input guard** — `repoRoot`/`docsRoot` both absent → throws (unchanged).

## Non-goals

- Does not read `.specify/feature.json` (dir-driven input is deferred per research D2).
- Does not change the lex-greatest version semantics of the `legacy-docs` branch.
