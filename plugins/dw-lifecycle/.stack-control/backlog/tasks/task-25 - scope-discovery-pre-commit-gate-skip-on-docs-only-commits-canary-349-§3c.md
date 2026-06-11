---
id: TASK-25
title: 'scope-discovery pre-commit gate: skip on docs-only commits (canary #349 §3c)'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-352
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The scope-discovery pre-commit hook chain (clones + anti-patterns + adopter-manifests + editor-symmetry + check-disposition-survivor) runs on every commit including doc-only commits, costing ~5s per commit. The graphical-entries canary observed ~90s cumulative overhead across 18 commits in one session.

Surfaced in #349 § 3c — Polish-level friction item.

## Spec for the fix

The pre-commit hook receives the list of staged files via `git diff --cached --name-only`. If every staged file matches `*.md` (and lives under a docs-only path like `docs/` or `DEVELOPMENT-NOTES.md`), the scope-discovery scanners can safely skip — none of their inputs are in the staged set.

### Light: docs-only short-circuit in the hook template

Edit the pre-commit hook template at `plugins/dw-lifecycle/templates/pre-commit-hook.sh` (or wherever the install template lives) to short-circuit on docs-only commits:

```bash
# Short-circuit on docs-only commits: clones / anti-patterns / adopters /
# editor-symmetry / disposition-survivor have no source inputs in scope
# when the commit touches only markdown files under docs/.
docs_only=1
while IFS= read -r f; do
  case "$f" in
    docs/*.md|docs/**/*.md|DEVELOPMENT-NOTES.md|*.md)
      ;;
    *)
      docs_only=0
      break
      ;;
  esac
done < <(git diff --cached --name-only)

if [ "$docs_only" -eq 1 ]; then
  echo "scope-discovery: skipping gate chain (docs-only commit)"
  exit 0
fi
```

Conservative glob: only short-circuit when EVERY staged file matches the docs pattern. Any non-docs file triggers the full chain.

### Medium: opt-in path-list in `.dw-lifecycle/scope-discovery/config.yaml`

Add a `skip_on_paths:` field to the project config. Operators declare path globs that the gate skips when ALL staged files match. Default ships with `docs/**/*.md` + `*.md` patterns; operators can extend.

### Heavy: per-scanner path-relevance probe

Each scanner declares which input file types it cares about. The hook computes the intersection per-scanner and skips those whose relevant set is empty. Most expressive but most complex.

Canary's recommendation: **Light**. The docs-only shape is well-defined and the conservative glob is unambiguous. Medium can grow later if other commit shapes emerge as common skip cases.

## Impact

- Polish-level (~5s/commit × N docs-only commits per session)
- Affects every project using `install-scope-discovery-hooks`
- Friction concentrated in workplan-edit / audit-log-write / journal-append sessions

## Acceptance criteria

- [ ] Hook template short-circuits exit-0 on docs-only commits
- [ ] Any non-docs file in the staged set triggers the full gate chain
- [ ] Hook prints a one-line marker (`scope-discovery: skipping gate chain (docs-only commit)`) so the operator sees what happened
- [ ] Bin shim smoke test (`scripts/smoke-bin-shim.sh`) gains a docs-only scenario
- [ ] Update `plugins/dw-lifecycle/skills/install-scope-discovery-hooks/SKILL.md` to document the docs-only short-circuit

## Cross-references

- Dogfood source: #349 § 3c
- Code surface: `plugins/dw-lifecycle/templates/` (hook install template) + `plugins/dw-lifecycle/src/scope-discovery/install-scope-discovery-hooks.ts`
<!-- SECTION:DESCRIPTION:END -->
