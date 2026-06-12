# Contract: Host Adapter Behavior

## Purpose

Define the contract between a host adapter (`claude`, `codex`) and the shared
`stackctl` workflow core.

## Rules

1. A host adapter MUST invoke an existing shared-core capability rather than
   reimplementing workflow semantics locally.
2. A host adapter MAY vary in prompt phrasing, rendering, and invocation style
   to feel natural in-host.
3. A host adapter MUST NOT invent validation rules, persistence behavior, or
   success criteria that are absent from the shared core.
4. If the host lacks a required capability, the adapter MUST fail loudly and
   explicitly name the missing host capability.
5. Adapter tests verify mapping and presentation only; workflow business logic
   belongs to the core contract tests.

## Core Capability Examples

- `define`
- `extend`
- `execute`
- `backlog capture`
- `backlog list`
- `backlog promote`
- `release`

## Failure Contract

- Unsupported host behavior: explicit host limitation error
- Shared-core validation failure: surfaced unchanged as a stack-control error
- Backend/implementation failure: translated only enough to preserve the
  stack-control contract while hiding backend-private details
