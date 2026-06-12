---
id: TASK-37
title: >-
  scope-discovery: anti-patterns pattern-type dispatcher — extend beyond regex
  (glob, ast-grep, ts-morph)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-285
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

The Phase 2 anti-patterns scanner (ported from the audiocontrol scope-discovery pilot at https://github.com/audiocontrol-org/deskwork/blob/feature/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts) implements a **single pattern type** for legacy-shape detection: pure JavaScript `RegExp` matching with optional multi-pattern fingerprinting (all patterns within `min_distance` lines).

The Phase 2 workplan (https://github.com/audiocontrol-org/deskwork/blob/feature/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md) Task 1 calls for:

> Pattern type dispatcher supporting `glob` / `regex` / `ast-grep` / `ts-morph`

Parent feature: #273

The pilot only implemented `regex`. The other three pattern types are NEW work this issue tracks.

## Why each type matters

- **glob** — file-name / path-based detection ("any file matching `**/use*Lifecycle.ts` outside the canonical impl is a holdout"). Fast; no file-content read.
- **regex** — current default; pure-regex token fingerprinting. Cheap; matches any text shape; can false-positive on coincidental phrase co-occurrence.
- **ast-grep** — structural matching against TypeScript AST. Reduces false positives vs. regex (`useState(false)` matches the call expression, not the same characters in a comment). Adds an ast-grep binary dep.
- **ts-morph** — full TS AST + type information. Slowest; necessary for type-aware detection (e.g. "any callsite of `X` that doesn't pass option `Y`").

## Proposed shape (v2)

Registry entries gain an optional `type:` field defaulting to `regex`:

```yaml
anti_patterns:
  - id: ...
    type: regex   # default — back-compat with v1 entries that omit it
    shape_regex: ...

  - id: ...
    type: glob
    shape_glob: 'src/**/use*Modal.ts'

  - id: ...
    type: ast-grep
    shape_pattern: 'useState($X)'  # ast-grep pattern syntax

  - id: ...
    type: ts-morph
    shape_predicate: |
      (sourceFile) => sourceFile.getFunctions().some(f => f.getName() === 'foo')
```

JSON Schema: extend `AntiPatternEntry` to be a discriminated union by `type:`, with each branch carrying its own required field set.

Scanner: dispatch on `entry.type` to one of four match-engine implementations. Common scaffold (file walk, exclusion handling, finding emit) stays in `check-anti-patterns.ts`; each engine lives in its own sibling module.

## Acceptance criteria (when this issue is picked up)

- [ ] Registry schema extended; `type:` defaults to `regex` for back-compat
- [ ] JSON Schema (`schema/anti-patterns.yaml.schema.json`) updated to discriminate
- [ ] Each of the four engines implemented in its own module
- [ ] Adversarial harness adds scenarios per type (positive + negative + gutted-stub)
- [ ] ast-grep / ts-morph deps added behind opt-in (operators not using those types pay zero)
- [ ] Doctor rule for malformed entries per type

## References

- Parent: #273
- v1 (regex-only) implementation: https://github.com/audiocontrol-org/deskwork/blob/feature/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/check-anti-patterns.ts
- v1 registry parser: https://github.com/audiocontrol-org/deskwork/blob/feature/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/anti-patterns-registry.ts
- v1 JSON Schema: https://github.com/audiocontrol-org/deskwork/blob/feature/scope-discovery/plugins/dw-lifecycle/src/scope-discovery/schema/anti-patterns.yaml.schema.json
- Workplan Phase 2 Task 1: https://github.com/audiocontrol-org/deskwork/blob/feature/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md
<!-- SECTION:DESCRIPTION:END -->
