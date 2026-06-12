# Contract: Backlog Port

## Purpose

Define the stable stack-control-facing backlog interface while keeping the
concrete backend implementation replaceable.

## Stable User-Facing Operations

- `capture`
- `list`
- `promote`
- `import`
- `inspect` (if surfaced through stack-control)

## Contract Rules

1. User-facing workflow and docs MUST speak only in stack-control backlog terms.
2. Backend-specific command names, storage layouts, and UI metaphors are not
   part of the stable contract.
3. Backend failures MUST surface as actionable stack-control errors without
   requiring the operator to understand backend internals.
4. Replacing the backend MUST NOT require changing user-facing workflow
   semantics or documentation.

## Behavioral Guarantees

- Validation is performed in stack-control terms.
- Results are reported in stack-control terms.
- Backend-specific metadata may exist internally but is not part of the stable
  workflow surface.
